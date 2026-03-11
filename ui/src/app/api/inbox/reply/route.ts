import { appendFileSync } from "fs";
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

function debugLog(
  hypothesisId: string,
  location: string,
  message: string,
  data: Record<string, unknown>
) {
  try {
    appendFileSync(
      "/opt/cursor/logs/debug.log",
      JSON.stringify({ hypothesisId, location, message, data, timestamp: Date.now() }) + "\n"
    );
  } catch {
    // Ignore debug logging failures.
  }
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
    return {
      fromEmail: requestedFrom,
      source: "request",
      candidateAccountCount: 0,
      fetchedAccountCount: 0,
    };
  }

  if (!campaignId) {
    return {
      fromEmail: null,
      source: "missing_campaign_id",
      candidateAccountCount: 0,
      fetchedAccountCount: 0,
    };
  }

  const { campaign } = await fetchCampaignDetail(companyId, campaignId);
  const candidateAccountIds = Array.isArray(campaign?.email_accounts)
    ? campaign.email_accounts
        .map((value: unknown) => (typeof value === "string" ? value.trim() : ""))
        .filter(Boolean)
    : [];

  if (candidateAccountIds.length === 0) {
    return {
      fromEmail: null,
      source: "campaign_without_email_accounts",
      candidateAccountCount: 0,
      fetchedAccountCount: 0,
    };
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

  return {
    fromEmail: matchingAccount ? normalizeEmailValue(matchingAccount.email) : null,
    source: matchingAccount ? "campaign_email_account" : "campaign_email_account_not_found",
    candidateAccountCount: candidateAccountIds.length,
    fetchedAccountCount: accounts.length,
  };
}

/**
 * POST /api/inbox/reply
 * Send reply via PlusVibe and track in database
 */
export async function POST(req: NextRequest) {
  const admin = getAdmin();
  const startedAt = Date.now();
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

    // #region agent log
    debugLog("A", "src/app/api/inbox/reply/route.ts:40", "Reply request received", {
      hasCompanyId: Boolean(company_id),
      hasMessageId: Boolean(message_id),
      hasThreadId: Boolean(thread_id),
      hasRawReplyToId: Boolean(typeof reply_to_id === "string" && reply_to_id.trim()),
      hasFallbackPlusvibeId: Boolean(typeof body.plusvibe_id === "string" && body.plusvibe_id.trim()),
      fromDomain:
        typeof from === "string" && from.includes("@") ? from.split("@")[1] : null,
      toDomain: typeof to === "string" && to.includes("@") ? to.split("@")[1] : null,
      fromLooksPlaceholder:
        typeof from === "string" && from.endsWith("@plusvibe.local"),
      replyBodyLength: typeof replyBody === "string" ? replyBody.length : null,
      hasScheduledFor: Boolean(scheduled_for),
    });
    // #endregion

    if (!company_id || !to || !subject || !replyBody) {
      // #region agent log
      debugLog("D", "src/app/api/inbox/reply/route.ts:55", "Reply request missing required fields", {
        missingCompanyId: !company_id,
        missingTo: !to,
        missingSubject: !subject,
        missingReplyBody: !replyBody,
      });
      // #endregion
      return NextResponse.json(
        { error: "Missing required fields: company_id, to, subject, body" },
        { status: 400 }
      );
    }

    const senderResolution = await resolveReplySenderEmail(
      company_id,
      normalizeEmailValue(campaign_id) || null,
      normalizeEmailValue(from)
    );

    // #region agent log
    debugLog("E", "src/app/api/inbox/reply/route.ts:110", "Reply sender resolved", {
      source: senderResolution.source,
      hasResolvedFrom: Boolean(senderResolution.fromEmail),
      requestedFromLooksPlaceholder: isPlaceholderEmail(from),
      candidateAccountCount: senderResolution.candidateAccountCount,
      fetchedAccountCount: senderResolution.fetchedAccountCount,
    });
    // #endregion

    if (!senderResolution.fromEmail) {
      return NextResponse.json(
        { error: "Unable to resolve a valid sender email account for this campaign reply" },
        { status: 409 }
      );
    }

    const replyToId =
      (typeof reply_to_id === "string" && reply_to_id.trim()) ||
      (typeof body.plusvibe_id === "string" && body.plusvibe_id.trim()) ||
      null;

    // #region agent log
    debugLog("B", "src/app/api/inbox/reply/route.ts:69", "Reply target resolved", {
      hasReplyToId: Boolean(replyToId),
      replyToIdPrefix: replyToId ? replyToId.slice(0, 8) : null,
      fromLooksPlaceholder:
        typeof from === "string" && from.endsWith("@plusvibe.local"),
      hasCampaignId: Boolean(body.campaign_id),
    });
    // #endregion

    if (!replyToId) {
      // #region agent log
      debugLog("B", "src/app/api/inbox/reply/route.ts:79", "Reply target missing", {
        hasRawReplyToId: Boolean(typeof reply_to_id === "string" && reply_to_id.trim()),
        hasFallbackPlusvibeId: Boolean(typeof body.plusvibe_id === "string" && body.plusvibe_id.trim()),
      });
      // #endregion
      return NextResponse.json(
        { error: "reply_to_id is required to send a PlusVibe reply" },
        { status: 400 }
      );
    }

    // #region agent log
    debugLog("C", "src/app/api/inbox/reply/route.ts:89", "Calling PlusVibe reply API", {
      replyToIdPrefix: replyToId.slice(0, 8),
      fromDomain:
        senderResolution.fromEmail.includes("@")
          ? senderResolution.fromEmail.split("@")[1]
          : null,
      toDomain: typeof to === "string" && to.includes("@") ? to.split("@")[1] : null,
      fromLooksPlaceholder:
        isPlaceholderEmail(from),
    });
    // #endregion
    const plusvibeResult = await plusvibeFetch("/unibox/emails/reply", company_id, {
      method: "POST",
      queryOverride: true,
      body: {
        reply_to_id: replyToId,
        to,
        from: senderResolution.fromEmail,
        subject,
        body: replyBody,
        ...(body.cc ? { cc: body.cc } : {}),
        ...(body.bcc ? { bcc: body.bcc } : {}),
        ...(scheduled_for ? { scheduled_at: scheduled_for } : {}),
      },
    });

    // #region agent log
    debugLog("C", "src/app/api/inbox/reply/route.ts:106", "PlusVibe reply API succeeded", {
      durationMs: Date.now() - startedAt,
      plusvibeResultType: plusvibeResult === null ? "null" : typeof plusvibeResult,
      plusvibeResultIdPrefix:
        typeof plusvibeResult?.id === "string" ? plusvibeResult.id.slice(0, 8) : null,
    });
    // #endregion

    // Update message status to replied
    if (message_id) {
      await admin
        .from("inbox_messages")
        .update({ status: "replied" })
        .eq("id", message_id);
    }

    // Store outbound message in thread
    const from_domain = senderResolution.fromEmail.split("@")[1] || null;
    await admin.from("inbox_messages").insert({
      company_id,
      campaign_id: campaign_id || "manual",
      thread_id: thread_id || `thread_${to}_manual`,
      plusvibe_id: plusvibeResult?.id || null,
      from_email: senderResolution.fromEmail,
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

    // #region agent log
    debugLog("D", "src/app/api/inbox/reply/route.ts:133", "Reply route completed", {
      durationMs: Date.now() - startedAt,
      updatedOriginalMessage: Boolean(message_id),
      insertedOutboundMessage: true,
      plusvibeResultIdPresent: Boolean(plusvibeResult?.id),
    });
    // #endregion

    return NextResponse.json({
      success: true,
      plusvibe: plusvibeResult,
      message: "Reply sent successfully",
    });
  } catch (err: any) {
    // #region agent log
    debugLog("C", "src/app/api/inbox/reply/route.ts:145", "Reply route failed", {
      durationMs: Date.now() - startedAt,
      errorName: err?.name || null,
      errorMessage: err?.message || null,
      isPlusVibeError: err instanceof PlusVibeError,
      plusvibeStatus: err instanceof PlusVibeError ? err.status : null,
      plusvibeCode: err instanceof PlusVibeError ? err.code : null,
    });
    // #endregion
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
