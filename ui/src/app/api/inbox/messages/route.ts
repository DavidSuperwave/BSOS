import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCompanyAccess } from "@/lib/api-auth";
import { getProjectCredentials } from "@/lib/plusvibe-project";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PLUSVIBE_BASE = "https://api.plusvibe.ai/api/v1";

let adminClient: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!adminClient) adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

function toCampaignArray(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.value)) return payload.value;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.campaigns)) return payload.campaigns;
  if (Array.isArray(payload?.data?.campaigns)) return payload.data.campaigns;
  return [];
}

function normalizeSentiment(value: unknown) {
  const sentiment = String(value || "neutral").toLowerCase();
  return ["positive", "neutral", "negative", "ooo", "auto_reply"].includes(sentiment)
    ? sentiment
    : "neutral";
}

function sentimentFromLabel(label: unknown) {
  const value = String(label || "").toUpperCase();
  if (!value) return "neutral";
  if (value.includes("INTERESTED") || value.includes("MEETING")) return "positive";
  if (value.includes("NOT_INTERESTED") || value.includes("UNSUBSCRIBE")) return "negative";
  if (value.includes("OOO")) return "ooo";
  if (value.includes("AUTO")) return "auto_reply";
  return "neutral";
}

function toUniboxRows(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.value)) return payload.value;
  if (Array.isArray(payload?.value?.data)) return payload.value.data;
  if (Array.isArray(payload?.emails)) return payload.emails;
  return [];
}

async function getOrCreateThreadId(admin: ReturnType<typeof createClient>, input: {
  companyId: string;
  campaignId: string;
  fromEmail: string;
  fromName?: string | null;
  companyName?: string | null;
  subject: string;
}) {
  const { data: existingThread } = await admin
    .from("email_threads")
    .select("id, message_count")
    .eq("company_id", input.companyId)
    .eq("campaign_id", input.campaignId)
    .eq("prospect_email", input.fromEmail)
    .limit(1)
    .single();

  if (existingThread?.id) {
    await admin
      .from("email_threads")
      .update({
        subject: input.subject,
        prospect_name: input.fromName || null,
        prospect_company: input.companyName || null,
        message_count: Number(existingThread.message_count || 0) + 1,
        last_activity: new Date().toISOString(),
      })
      .eq("id", existingThread.id);
    return existingThread.id;
  }

  const { data: insertedThread } = await admin
    .from("email_threads")
    .insert({
      company_id: input.companyId,
      campaign_id: input.campaignId,
      prospect_email: input.fromEmail,
      prospect_name: input.fromName || null,
      prospect_company: input.companyName || null,
      subject: input.subject,
      status: "active",
      message_count: 1,
      last_activity: new Date().toISOString(),
    } as any)
    .select("id")
    .single();

  return insertedThread?.id || null;
}

async function importRepliesFromPlusVibe(admin: ReturnType<typeof createClient>, companyId: string) {
  const credentials = await getProjectCredentials(companyId);
  if (!credentials) return 0;

  const headers = {
    "x-api-key": credentials.apiKey,
    "Content-Type": "application/json",
  };

  const campaignNameById = new Map<string, string>();
  const campaignListRes = await fetch(
    `${PLUSVIBE_BASE}/campaign/list-all?workspace_id=${encodeURIComponent(
      credentials.workspaceId
    )}&campaign_type=all&limit=100`,
    { headers, signal: AbortSignal.timeout(10000) }
  );
  if (campaignListRes.ok) {
    const campaignsPayload = await campaignListRes.json();
    const campaigns = toCampaignArray(campaignsPayload);
    for (const campaign of campaigns) {
      const id = String(campaign?._id || campaign?.id || campaign?.campaign_id || "").trim();
      if (!id) continue;
      campaignNameById.set(id, String(campaign?.name || campaign?.camp_name || "").trim());
    }
  }

  let inserted = 0;
  let pageTrail = "";
  for (let i = 0; i < 8; i += 1) {
    const query = new URLSearchParams({
      workspace_id: credentials.workspaceId,
      email_type: "received",
      preview_only: "false",
    });
    if (pageTrail) query.set("page_trail", pageTrail);

    const uniboxRes = await fetch(`${PLUSVIBE_BASE}/unibox/emails?${query.toString()}`, {
      headers,
      signal: AbortSignal.timeout(10000),
    });
    if (!uniboxRes.ok) break;

    const uniboxPayload = await uniboxRes.json();
    const emails = toUniboxRows(uniboxPayload);
    if (!Array.isArray(emails) || emails.length === 0) break;

    for (const email of emails) {
      const plusvibeId = String(email?.id || email?.message_id || "").trim();
      if (!plusvibeId) continue;
      const { data: existingMessage } = await admin
        .from("inbox_messages")
        .select("id")
        .eq("plusvibe_id", plusvibeId)
        .limit(1)
        .single();
      if (existingMessage?.id) continue;

      const campaignId = String(email?.campaign_id || "").trim();
      if (!campaignId) continue;

      const fromEmail = String(
        email?.from_address_email || email?.lead || email?.from_email || ""
      )
        .trim()
        .toLowerCase();
      const toEmail = String(
        email?.eaccount || email?.to_email || email?.to_address_email_list || ""
      )
        .trim()
        .toLowerCase();
      const subject = String(email?.subject || "").trim();
      const bodyHtml = String(email?.body?.html || email?.body?.text || "").trim();
      const bodyText = String(
        email?.body?.text || email?.content_preview || bodyHtml.replace(/<[^>]*>/g, " ")
      ).trim();
      if (!fromEmail || !subject || (!bodyHtml && !bodyText)) continue;

      const threadId = await getOrCreateThreadId(admin, {
        companyId,
        campaignId,
        fromEmail,
        fromName:
          email?.from_address_json?.[0]?.name || email?.first_name || email?.from_name || null,
        companyName: email?.company_name || null,
        subject,
      });

      const { error: insertError } = await admin.from("inbox_messages").insert({
        company_id: companyId,
        campaign_id: campaignId,
        campaign_name: campaignNameById.get(campaignId) || null,
        thread_id: String(email?.thread_id || threadId || `${campaignId}:${fromEmail}`),
        plusvibe_id: plusvibeId,
        from_email: fromEmail,
        from_name:
          email?.from_address_json?.[0]?.name || email?.first_name || email?.from_name || null,
        from_domain: fromEmail.split("@")[1] || null,
        to_email: toEmail || "unknown@plusvibe.local",
        subject,
        body: bodyHtml || bodyText,
        body_text: bodyText || bodyHtml,
        sentiment: normalizeSentiment(email?.sentiment || sentimentFromLabel(email?.label)),
        intent: null,
        tags: email?.label ? [String(email.label)] : [],
        status: email?.is_unread ? "unread" : "read",
        priority: "medium",
        last_reply_at: new Date().toISOString(),
      } as any);
      if (!insertError) inserted += 1;
    }

    pageTrail = String(uniboxPayload?.page_trail || "").trim();
    if (!pageTrail) break;
  }

  return inserted;
}

/**
 * GET /api/inbox/messages
 * Fetch inbox messages with filters
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  const campaignId = searchParams.get("campaignId");
  const sentiment = searchParams.get("sentiment");
  const status = searchParams.get("status");
  const priority = searchParams.get("priority");
  const search = searchParams.get("search");
  const page = parseInt(searchParams.get("page") || "1");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
  const offset = (page - 1) * limit;

  const admin = getAdmin();
  try {
    if (!companyId) {
      return NextResponse.json({ error: "companyId is required" }, { status: 400 });
    }
    const access = await requireCompanyAccess(companyId);
    if (access.error) return access.error;

    let query = admin
      .from("inbox_messages")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (companyId) query = query.eq("company_id", companyId);
    if (campaignId) query = query.eq("campaign_id", campaignId);
    if (sentiment) query = query.eq("sentiment", sentiment);
    if (status) query = query.eq("status", status);
    if (priority) query = query.eq("priority", priority);
    if (search) query = query.or(`subject.ilike.%${search}%,from_email.ilike.%${search}%,from_name.ilike.%${search}%`);

    const queryResult = await query;
    let { data, count } = queryResult;
    const { error } = queryResult;

    if (error) throw error;

    const canHydrate =
      (count || 0) === 0 &&
      page === 1 &&
      !campaignId &&
      !sentiment &&
      !status &&
      !priority &&
      !search;
    if (canHydrate) {
      await importRepliesFromPlusVibe(admin, companyId);
      const secondQuery = await admin
        .from("inbox_messages")
        .select("*", { count: "exact" })
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      data = secondQuery.data || data;
      count = secondQuery.count || count;
    }

    return NextResponse.json({
      messages: data || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        pages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch messages" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/inbox/messages
 * Create/sync inbox message (used by webhook or manual sync)
 */
export async function POST(req: NextRequest) {
  const admin = getAdmin();
  try {
    const body = await req.json();
    const {
      company_id,
      campaign_id,
      campaign_name,
      thread_id,
      plusvibe_id,
      from_email,
      from_name,
      to_email,
      subject,
      body: emailBody,
      body_text,
      sentiment,
      intent,
      tags,
      priority,
    } = body;
    if (!company_id) {
      return NextResponse.json({ error: "company_id is required" }, { status: 400 });
    }
    const access = await requireCompanyAccess(company_id);
    if (access.error) return access.error;

    if (!campaign_id || !from_email || !to_email || !subject || !emailBody) {
      return NextResponse.json(
        { error: "Missing required fields: campaign_id, from_email, to_email, subject, body" },
        { status: 400 }
      );
    }

    const from_domain = from_email.split("@")[1] || null;
    const resolvedThreadId =
      thread_id ||
      (await getOrCreateThreadId(admin, {
        companyId: company_id,
        campaignId: campaign_id,
        fromEmail: from_email,
        fromName: from_name || null,
        companyName: null,
        subject,
      })) ||
      `thread_${from_email}_${campaign_id}`;

    const { data, error } = await admin
      .from("inbox_messages")
      .insert({
        company_id,
        campaign_id,
        campaign_name,
        thread_id: resolvedThreadId,
        plusvibe_id,
        from_email,
        from_name,
        from_domain,
        to_email,
        subject,
        body: emailBody,
        body_text: body_text || emailBody.replace(/<[^>]*>/g, ""),
        sentiment: sentiment || "neutral",
        intent,
        tags: tags || [],
        priority: priority || "medium",
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ message: data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to create message" },
      { status: 500 }
    );
  }
}
