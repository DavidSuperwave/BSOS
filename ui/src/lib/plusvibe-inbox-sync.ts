import { createClient } from "@supabase/supabase-js";
import { PlusVibeError, plusvibeFetch } from "@/lib/plusvibe-client";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const MAX_HYDRATION_PAGES = 40;
const WEBHOOK_NAME = "BSOS Inbox Webhook";

let adminClient: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!adminClient) adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

type InboxSetupResult = {
  hydratedCount: number;
  pagesFetched: number;
  webhookRegistered: boolean;
  webhookReason?: string;
};

export async function hydratePlusVibeInboxAndWebhook(
  companyId: string
): Promise<InboxSetupResult> {
  const hydration = await hydrateInboxMessages(companyId);
  const campaignIds = await fetchCampaignIds(companyId);
  const webhook = await ensureInboxWebhook(companyId, campaignIds);
  return {
    hydratedCount: hydration.hydratedCount,
    pagesFetched: hydration.pagesFetched,
    webhookRegistered: webhook.registered,
    webhookReason: webhook.reason,
  };
}

async function hydrateInboxMessages(companyId: string) {
  const admin = getAdmin();
  const rawEmails: any[] = [];
  const seenPageTrails = new Set<string>();
  let pageTrail: string | null = null;
  let pagesFetched = 0;

  for (let i = 0; i < MAX_HYDRATION_PAGES; i += 1) {
    const path = pageTrail
      ? `/unibox/emails?page_trail=${encodeURIComponent(pageTrail)}`
      : "/unibox/emails";
    const payload = await plusvibeFetch(path, companyId, { method: "GET" });
    const { emails, nextPageTrail } = extractEmailsPage(payload);
    pagesFetched += 1;
    rawEmails.push(...emails);

    if (!nextPageTrail || seenPageTrails.has(nextPageTrail)) break;
    seenPageTrails.add(nextPageTrail);
    pageTrail = nextPageTrail;
  }

  const rows = rawEmails
    .map((email) => normalizeInboxMessage(email, companyId))
    .filter(Boolean) as Record<string, any>[];

  if (rows.length === 0) {
    return { hydratedCount: 0, pagesFetched };
  }

  let hydratedCount = 0;
  const CHUNK_SIZE = 250;
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const { error } = await admin
      .from("inbox_messages")
      .upsert(chunk as any, {
        onConflict: "plusvibe_id",
        ignoreDuplicates: false,
      });
    if (error) {
      throw new Error(`Inbox upsert failed: ${error.message}`);
    }
    hydratedCount += chunk.length;
  }

  const threadRows = buildThreadRows(rows);
  if (threadRows.length > 0) {
    try {
      await admin.from("email_threads").upsert(threadRows as any, {
        onConflict: "thread_id",
        ignoreDuplicates: false,
      });
    } catch {
      // Thread table sync is optional; inbox_messages remains source of truth.
    }
  }

  return { hydratedCount, pagesFetched };
}

async function fetchCampaignIds(companyId: string): Promise<string[]> {
  try {
    const payload = await plusvibeFetch("/campaign/list-all", companyId, {
      method: "GET",
    });
    const list = extractArray(payload, ["value", "data", "campaigns"]);
    return list
      .map((campaign: any) =>
        firstString(campaign?._id, campaign?.id, campaign?.campaign_id)
      )
      .filter((id: string | null): id is string => !!id);
  } catch {
    return [];
  }
}

async function ensureInboxWebhook(companyId: string, campaignIds: string[]) {
  const appUrl = resolveAppUrl();
  if (!appUrl) {
    return { registered: false, reason: "APP_URL_NOT_CONFIGURED" };
  }

  const webhookUrl = `${appUrl.replace(/\/+$/, "")}/api/webhooks/plusvibe?companyId=${encodeURIComponent(companyId)}`;

  try {
    const hookList = await plusvibeFetch("/hook/list", companyId, { method: "GET" });
    const hooks = extractArray(hookList, ["hooks", "data", "value"]);
    const existing = hooks.find((hook: any) => {
      const url = firstString(hook?.url, hook?.webhook_url, hook?.hook_url, hook?.endpoint);
      return normalizeUrl(url) === normalizeUrl(webhookUrl);
    });
    if (existing) {
      return { registered: true, reason: "already_exists" };
    }
  } catch (err) {
    if (err instanceof PlusVibeError && err.code === "MISSING_KEY") {
      return { registered: false, reason: err.code };
    }
  }

  const attempts = [
    buildWebhookPayload("webhook_url", webhookUrl, campaignIds),
    buildWebhookPayload("hook_url", webhookUrl, campaignIds),
    buildWebhookPayload("url", webhookUrl, campaignIds),
  ];

  for (const payload of attempts) {
    try {
      await plusvibeFetch("/hook/add", companyId, {
        method: "POST",
        body: payload,
      });
      return { registered: true };
    } catch {
      // Try next payload shape.
    }
  }

  return { registered: false, reason: "hook_add_failed" };
}

function buildWebhookPayload(urlKey: "webhook_url" | "hook_url" | "url", url: string, campaignIds: string[]) {
  const payload: Record<string, any> = {
    name: WEBHOOK_NAME,
    [urlKey]: url,
  };
  if (campaignIds.length > 0) payload.campaign_ids = campaignIds;
  if (campaignIds.length === 1) payload.campaign_id = campaignIds[0];
  return payload;
}

function extractEmailsPage(payload: any) {
  const emails = extractArray(payload, ["emails", "data", "value", "items", "results"]);
  const dataObj = payload && typeof payload === "object" ? payload.data : null;
  const nestedEmails = extractArray(dataObj, ["emails", "items", "results"]);
  const mergedEmails = emails.length > 0 ? emails : nestedEmails;
  const nextPageTrail = firstString(
    payload?.next_page_trail,
    payload?.page_trail,
    payload?.nextPageTrail,
    payload?.next_cursor,
    dataObj?.next_page_trail,
    dataObj?.page_trail
  );
  return { emails: mergedEmails, nextPageTrail };
}

function normalizeInboxMessage(email: any, companyId: string) {
  if (!email || typeof email !== "object") return null;
  const plusvibeId =
    firstString(email?._id, email?.id, email?.message_id, email?.email_id, email?.unibox_id) ||
    firstString(email?.thread_id, email?.subject, email?.timestamp_created);
  if (!plusvibeId) return null;

  const fromEmail = extractEmail(
    firstString(
      email?.from_email,
      email?.from_address_email,
      email?.sender_email,
      email?.from?.email
    )
  ) || "unknown@plusvibe.local";
  const toEmail = extractEmail(
    firstString(
      email?.to_email,
      email?.to_address_email,
      Array.isArray(email?.to_address_email_list) ? email.to_address_email_list[0] : null,
      Array.isArray(email?.to_emails) ? email.to_emails[0] : null
    )
  ) || "unknown@plusvibe.local";
  const campaignId =
    firstString(email?.campaign_id, email?.camp_id, email?.campaign?.id, email?.campaign?._id) ||
    "unknown";
  const campaignName = firstString(
    email?.campaign_name,
    email?.camp_name,
    email?.campaign?.name
  );
  const body = extractBody(email);
  const bodyText =
    firstString(email?.body_text, email?.preview_text, email?.content_preview) ||
    stripHtml(body);
  const fromName = firstString(email?.from_name, email?.from_address_name, email?.sender_name);
  const threadId = firstString(email?.thread_id, email?.threadId, email?.conversation_id) || plusvibeId;
  const createdAt = normalizeDate(
    firstString(email?.timestamp_created, email?.created_at, email?.createdAt, email?.timestamp)
  );
  const isUnread = Boolean(
    email?.is_unread === true ||
      email?.is_unread === 1 ||
      String(email?.label || "").toLowerCase().includes("unread")
  );
  const tags = Array.isArray(email?.tags)
    ? email.tags.map((tag: any) => String(tag))
    : [];

  return {
    company_id: companyId,
    campaign_id: campaignId,
    campaign_name: campaignName || null,
    thread_id: threadId,
    plusvibe_id: plusvibeId,
    from_email: fromEmail,
    from_name: fromName || null,
    from_domain: fromEmail.split("@")[1] || null,
    to_email: toEmail,
    subject: firstString(email?.subject, email?.title) || "(No subject)",
    body: body || bodyText || "(No body)",
    body_text: bodyText || "(No body)",
    status: isUnread ? "unread" : "read",
    priority: "medium",
    tags,
    created_at: createdAt || undefined,
  };
}

function buildThreadRows(messages: Record<string, any>[]) {
  const deduped = new Map<string, Record<string, any>>();
  for (const row of messages) {
    if (!row?.thread_id) continue;
    deduped.set(row.thread_id, {
      thread_id: row.thread_id,
      company_id: row.company_id,
      prospect_email: row.from_email,
      prospect_name: row.from_name || null,
      subject: row.subject,
      last_message_body: row.body_text,
      last_activity: row.created_at || new Date().toISOString(),
      status: "active",
    });
  }
  return Array.from(deduped.values());
}

function extractArray(source: any, keys: string[]) {
  if (Array.isArray(source)) return source;
  if (!source || typeof source !== "object") return [];
  for (const key of keys) {
    const value = source[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

function extractBody(email: any): string {
  const body = email?.body;
  if (typeof body === "string") return body;
  if (body && typeof body === "object") {
    const html = firstString(body?.html, body?.message_html, body?.content);
    if (html) return html;
    const text = firstString(body?.text, body?.message_text, body?.preview);
    if (text) return text;
  }
  return (
    firstString(
      email?.body_html,
      email?.content_html,
      email?.html,
      email?.content_preview,
      email?.message
    ) || ""
  );
}

function firstString(...values: any[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function extractEmail(value: string | null): string | null {
  if (!value) return null;
  if (value.includes("<") && value.includes(">")) {
    const inside = value.match(/<([^>]+)>/);
    return inside?.[1]?.trim() || null;
  }
  return value.trim();
}

function stripHtml(html: string) {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeDate(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function resolveAppUrl() {
  const configured =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  return configured ? configured.trim() : "";
}

function normalizeUrl(url: string | null) {
  if (!url) return "";
  return url.trim().replace(/\/+$/, "");
}
