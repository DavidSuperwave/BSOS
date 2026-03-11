import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { PlusVibeError, plusvibeFetch } from "@/lib/plusvibe-client";
import { fetchCampaignDetail } from "@/lib/plusvibe-campaigns";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let adminClient: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!adminClient) adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

function isPlaceholderEmail(value: unknown) {
  return typeof value === "string" && value.trim().toLowerCase().endsWith("@plusvibe.local");
}

function normalizeEmailValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function extractAccountRows(payload: any): Array<{ id?: string; email?: string }> {
  if (Array.isArray(payload?.accounts)) return payload.accounts;
  if (Array.isArray(payload?.data?.accounts)) return payload.data.accounts;
  if (Array.isArray(payload?.data?.email_accounts)) return payload.data.email_accounts;
  if (Array.isArray(payload?.email_accounts)) return payload.email_accounts;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

async function resolveReplySenderEmail(
  companyId: string,
  campaignId: string | null,
  requestedFrom: string | null
) {
  if (requestedFrom && !isPlaceholderEmail(requestedFrom)) {
    return requestedFrom;
  }

  if (!campaignId) {
    return null;
  }

  const { campaign } = await fetchCampaignDetail(companyId, campaignId);
  const candidateAccountIds = Array.isArray(campaign?.email_accounts)
    ? campaign.email_accounts
        .map((value: unknown) => (typeof value === "string" ? value.trim() : ""))
        .filter(Boolean)
    : [];

  if (candidateAccountIds.length === 0) {
    return null;
  }

  const accountPayload = await plusvibeFetch(`/account/list?limit=1000`, companyId, {
    method: "GET",
  });
  const accounts = extractAccountRows(accountPayload);
  const candidateAccountSet = new Set(candidateAccountIds);
  const matchingAccount = accounts.find((account) => {
    const accountId = typeof account?.id === "string" ? account.id.trim() : "";
    const accountEmail = normalizeEmailValue(account?.email);
    return Boolean(accountEmail && candidateAccountSet.has(accountId));
  });

  return matchingAccount ? normalizeEmailValue(matchingAccount.email) : null;
}

/**
 * POST /api/inbox/reply
 * Send reply via PlusVibe and track in database
 */
export async function POST(req: NextRequest) {
  const admin = getAdmin();
  try {
    const body = await req.json();
    const {
      thread_id,
      message_id,
      reply_to_id,
      to,
      subject,
      body: replyBody,
      from,
      company_id,
      campaign_id,
      scheduled_for,
    } = body;

    if (!company_id || !to || !subject || !replyBody) {
      return NextResponse.json(
        { error: "Missing required fields: company_id, to, subject, body" },
        { status: 400 }
      );
    }

    const resolvedFrom = await resolveReplySenderEmail(
      company_id,
      normalizeEmailValue(campaign_id) || null,
      normalizeEmailValue(from)
    );

    if (!resolvedFrom) {
      return NextResponse.json(
        { error: "Unable to resolve a valid sender email account for this campaign reply" },
        { status: 409 }
      );
    }

    const replyToId =
      (typeof reply_to_id === "string" && reply_to_id.trim()) ||
      (typeof body.plusvibe_id === "string" && body.plusvibe_id.trim()) ||
      null;

    if (!replyToId) {
      return NextResponse.json(
        { error: "reply_to_id is required to send a PlusVibe reply" },
        { status: 400 }
      );
    }

    const plusvibeResult = await plusvibeFetch("/unibox/emails/reply", company_id, {
      method: "POST",
      queryOverride: true,
      body: {
        reply_to_id: replyToId,
        to,
        from: resolvedFrom,
        subject,
        body: replyBody,
        ...(body.cc ? { cc: body.cc } : {}),
        ...(body.bcc ? { bcc: body.bcc } : {}),
        ...(scheduled_for ? { scheduled_at: scheduled_for } : {}),
      },
    });

    // Update message status to replied
    if (message_id) {
      await admin
        .from("inbox_messages")
        .update({ status: "replied" })
        .eq("id", message_id);
    }

    // Store outbound message in thread
    const from_domain = resolvedFrom.split("@")[1] || null;
    await admin.from("inbox_messages").insert({
      company_id,
      campaign_id: campaign_id || "manual",
      thread_id: thread_id || `thread_${to}_manual`,
      plusvibe_id: plusvibeResult?.id || null,
      from_email: resolvedFrom,
      from_name: "Outbound",
      from_domain,
      to_email: to,
      subject,
      body: replyBody,
      body_text: replyBody.replace(/<[^>]*>/g, ""),
      sentiment: "neutral",
      status: "replied",
      priority: "medium",
    });

    return NextResponse.json({
      success: true,
      plusvibe: plusvibeResult,
      message: "Reply sent successfully",
    });
  } catch (err: any) {
    if (err instanceof PlusVibeError) {
      return NextResponse.json(
        { error: err.details, code: err.code },
        { status: err.status }
      );
    }
    return NextResponse.json(
      { error: err.message || "Failed to send reply" },
      { status: 500 }
    );
  }
}
