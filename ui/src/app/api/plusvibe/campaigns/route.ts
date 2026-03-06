import { NextRequest, NextResponse } from "next/server";
import { getProjectCredentials } from "@/lib/plusvibe-project";
import { requireCompanyAccess } from "@/lib/api-auth";

const PLUSVIBE_BASE = "https://api.plusvibe.ai/api/v1";

function sanitizePlusVibeErrorDetails(raw: string) {
  return raw.replace(/\s+/g, " ").trim().slice(0, 400);
}

function resolveCampaignName(input: Record<string, any>) {
  const candidate = input?.camp_name ?? input?.campaignName ?? input?.name ?? input?.title;
  return typeof candidate === "string" ? candidate.trim() : "";
}

function getCampaignId(campaign: Record<string, any>) {
  return String(campaign?._id || campaign?.id || campaign?.campaign_id || "");
}

function toCampaignArray(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.value)) return payload.value;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.campaigns)) return payload.campaigns;
  if (Array.isArray(payload?.data?.campaigns)) return payload.data.campaigns;
  return [];
}

function toStatsMap(payload: any) {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.value)
      ? payload.value
      : Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload?.campaigns)
          ? payload.campaigns
          : [];

  return rows.reduce((acc: Record<string, any>, row: any) => {
    const id = String(row?._id || row?.id || row?.campaign_id || "");
    if (id) acc[id] = row;
    return acc;
  }, {});
}

function normalizeSequences(sequences: any[] | undefined) {
  if (!Array.isArray(sequences)) return [];
  return sequences.map((step: any, index: number) => ({
    step: Number(step?.step || index + 1),
    wait_time: Math.max(1, Number(step?.wait_time || step?.delay_days || 1)),
    variations: Array.isArray(step?.variations)
      ? step.variations.map((variation: any, variationIndex: number) => ({
          variation: String(
            variation?.variation || String.fromCharCode("A".charCodeAt(0) + variationIndex)
          ),
          name: variation?.name || `Step ${index + 1} - Variation ${variationIndex + 1}`,
          subject: variation?.subject || "",
          body: variation?.body || "",
        }))
      : [
          {
            variation: "A",
            name: step?.title || `Step ${index + 1}`,
            subject: step?.subject || "",
            body: step?.body || "",
          },
        ],
  }));
}

async function pvRequest(
  apiKey: string,
  path: string,
  init?: RequestInit
): Promise<Response> {
  return fetch(`${PLUSVIBE_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      ...(init?.headers || {}),
    },
  });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId") || undefined;
  const status = searchParams.get("status") || undefined;
  const limit = Number(searchParams.get("limit") || "100");

  if (companyId) {
    const access = await requireCompanyAccess(companyId);
    if (access.error) return access.error;
  }

  const credentials = await getProjectCredentials(companyId);
  if (!credentials) {
    return NextResponse.json(
      { error: "PlusVibe API key not configured", code: "MISSING_KEY" },
      { status: 503 }
    );
  }

  try {
    const listQuery = new URLSearchParams({
      workspace_id: credentials.workspaceId,
      limit: String(Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 500) : 100),
    });
    if (status) listQuery.set("status", status);

    const listRes = await pvRequest(
      credentials.apiKey,
      `/campaign/list?${listQuery.toString()}`
    );
    if (!listRes.ok) {
      const errorText = await listRes.text();
      return NextResponse.json(
        {
          error: `PlusVibe API error: ${listRes.status}`,
          code: "PLUSVIBE_ERROR",
          details: sanitizePlusVibeErrorDetails(errorText),
        },
        { status: listRes.status }
      );
    }
    const listPayload = await listRes.json();
    const campaigns = toCampaignArray(listPayload);

    const statsQuery = new URLSearchParams({
      workspace_id: credentials.workspaceId,
      start_date: "2020-01-01",
      end_date: "2030-12-31",
    });
    const statsRes = await pvRequest(
      credentials.apiKey,
      `/campaign/stats?${statsQuery.toString()}`
    );
    const statsMap = statsRes.ok ? toStatsMap(await statsRes.json()) : {};

    const campaignsWithStats = campaigns.map((campaign: any) => {
      const campaignId = getCampaignId(campaign);
      const stats = statsMap[campaignId] || {};
      const sent = Number(stats.sent_count || stats.sent || stats.total_sent || 0);
      const replies = Number(stats.replied_count || stats.replies || stats.total_replies || 0);
      const positive = Number(
        stats.positive_reply_count || stats.positive || stats.positive_replies || 0
      );
      const opened = Number(stats.unique_opened_count || stats.opened || stats.total_opened || 0);
      const leadCount = Number(stats.lead_count || stats.total_leads || 0);
      const contacted = Number(stats.lead_contacted_count || stats.contacted || 0);

      return {
        ...campaign,
        id: campaignId,
        name: campaign?.name || campaign?.camp_name || "Untitled Campaign",
        status: String(campaign?.status || "DRAFT"),
        createdAt:
          campaign?.createdAt ||
          campaign?.created_at ||
          campaign?.created_on ||
          new Date().toISOString(),
        stats: {
          sent,
          replies,
          positive,
          opened,
          leadCount,
          contacted,
          replyRate: sent > 0 ? Math.round((replies / sent) * 100) : 0,
          positiveRate: replies > 0 ? Math.round((positive / replies) * 100) : 0,
          openRate: sent > 0 ? Math.round((opened / sent) * 100) : 0,
          contactedRate: leadCount > 0 ? Math.round((contacted / leadCount) * 100) : 0,
          completed: Number(stats.completed_lead_count || stats.completed || 0),
          bounced: Number(stats.bounced_count || stats.bounced || 0),
          unsubscribed: Number(stats.unsubscribed_count || stats.unsubscribed || 0),
        },
      };
    });

    return NextResponse.json({
      campaigns: campaignsWithStats,
      credentialsSource: credentials.source,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        error: err.message || "Failed to fetch campaigns",
        code: "PLUSVIBE_ERROR",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const companyId = searchParams.get("companyId") || undefined;

  if (companyId) {
    const access = await requireCompanyAccess(companyId);
    if (access.error) return access.error;
  }

  const credentials = await getProjectCredentials(companyId);
  if (!credentials) {
    return NextResponse.json(
      { error: "PlusVibe API key not configured", code: "MISSING_KEY" },
      { status: 503 }
    );
  }

  try {
    const body = await req.json();
    const campName = resolveCampaignName(body);
    if (!campName) {
      return NextResponse.json(
        { error: "Campaign name is required", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const createRes = await pvRequest(credentials.apiKey, "/campaign/add/campaign", {
      method: "POST",
      body: JSON.stringify({
        workspace_id: credentials.workspaceId,
        camp_name: campName,
      }),
    });
    if (!createRes.ok) {
      const errorText = await createRes.text();
      return NextResponse.json(
        {
          error: `PlusVibe API error: ${createRes.status}`,
          code: "PLUSVIBE_ERROR",
          details: sanitizePlusVibeErrorDetails(errorText),
        },
        { status: createRes.status }
      );
    }

    const created = await createRes.json();
    const createdCampaignId =
      String(created?.id || created?.campaign_id || created?.value?.id || "").trim() || null;

    // Optional duplicate flow: clone source sequences/schedule/email accounts from list-all payload.
    if (createdCampaignId && body?.source_campaign_id) {
      const sourceQuery = new URLSearchParams({
        workspace_id: credentials.workspaceId,
        campaign_id: String(body.source_campaign_id),
      });
      const sourceRes = await pvRequest(
        credentials.apiKey,
        `/campaign/list-all?${sourceQuery.toString()}`
      );
      if (sourceRes.ok) {
        const sourcePayload = await sourceRes.json();
        const sourceCampaign = toCampaignArray(sourcePayload).find(
          (campaign) => getCampaignId(campaign) === String(body.source_campaign_id)
        );
        if (sourceCampaign) {
          const clonePayload: Record<string, any> = {
            workspace_id: credentials.workspaceId,
            campaign_id: createdCampaignId,
            first_wait_time: Number(sourceCampaign?.first_wait_time || 0),
          };
          const sourceSequences = normalizeSequences(sourceCampaign?.sequences);
          if (sourceSequences.length > 0) clonePayload.sequences = sourceSequences;
          if (Array.isArray(sourceCampaign?.schedules) && sourceCampaign.schedules.length > 0) {
            clonePayload.schedules = sourceCampaign.schedules;
          }
          if (
            Array.isArray(sourceCampaign?.email_accounts) &&
            sourceCampaign.email_accounts.length > 0
          ) {
            clonePayload.email_accounts = sourceCampaign.email_accounts;
          }
          if (Object.keys(clonePayload).length > 3) {
            await pvRequest(credentials.apiKey, "/campaign/update/campaign", {
              method: "PATCH",
              body: JSON.stringify(clonePayload),
            });
          }
        }
      }
    }

    return NextResponse.json({
      status: created?.status || "success",
      id: createdCampaignId,
      raw: created,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        error: err.message || "Failed to create campaign",
        code: "PLUSVIBE_ERROR",
      },
      { status: 500 }
    );
  }
}
