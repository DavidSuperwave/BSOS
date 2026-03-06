import { NextRequest, NextResponse } from "next/server";
import { getProjectCredentials } from "@/lib/plusvibe-project";
import { requireCompanyAccess } from "@/lib/api-auth";
import { createClient } from "@supabase/supabase-js";

const PLUSVIBE_BASE = "https://api.plusvibe.ai/api/v1";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function sanitizePlusVibeErrorDetails(raw: string) {
  return raw.replace(/\s+/g, " ").trim().slice(0, 400);
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

function resolveCampaignName(input: Record<string, any>) {
  const candidate =
    input?.camp_name ??
    input?.campaignName ??
    input?.name ??
    input?.newName;
  return typeof candidate === "string" ? candidate.trim() : "";
}

function mapDaysToScheduleFlags(days: unknown) {
  const dayFlags: Record<string, boolean> = {
    "1": true,
    "2": true,
    "3": true,
    "4": true,
    "5": true,
    "6": true,
    "7": true,
  };
  const labelToNumber: Record<string, string> = {
    mon: "1",
    tue: "2",
    wed: "3",
    thu: "4",
    fri: "5",
    sat: "6",
    sun: "7",
  };

  if (Array.isArray(days)) {
    const selected = new Set(
      days
        .map((value) => {
          const normalized = String(value || "").trim();
          if (/^[1-7]$/.test(normalized)) return normalized;
          const key = normalized.slice(0, 3).toLowerCase();
          return labelToNumber[key];
        })
        .filter(Boolean)
    );
    if (selected.size > 0) {
      return dayFlags;
    }
    return dayFlags;
  }
  if (days && typeof days === "object") {
    const values = Object.values(days as Record<string, any>);
    if (values.some(Boolean)) {
      return dayFlags;
    }
    for (const [key, value] of Object.entries(days as Record<string, any>)) {
      const numericKey = /^[1-7]$/.test(key) ? key : labelToNumber[key.slice(0, 3).toLowerCase()];
      if (numericKey) dayFlags[numericKey] = Boolean(value);
    }
    return dayFlags;
  }
  return dayFlags;
}

function toAccountArray(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.value)) return payload.value;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.accounts)) return payload.accounts;
  if (Array.isArray(payload?.data?.accounts)) return payload.data.accounts;
  if (Array.isArray(payload?.data?.email_accounts)) return payload.data.email_accounts;
  if (Array.isArray(payload?.email_accounts)) return payload.email_accounts;
  return [];
}

function normalizeDomain(raw: string) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/^\.+/, "")
    .replace(/\.+$/, "");
}

function extractDomainFromEmail(email: string) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized.includes("@")) return "";
  return normalizeDomain(normalized.split("@")[1] || "");
}

function rootDomain(domain: string) {
  const normalized = normalizeDomain(domain);
  if (!normalized) return "";
  const labels = normalized.split(".").filter(Boolean);
  if (labels.length <= 2) return normalized;
  return labels.slice(-2).join(".");
}

function isManagedDomain(domain: string, managedDomains: Set<string>) {
  const normalized = normalizeDomain(domain);
  if (!normalized) return false;
  if (managedDomains.has(normalized)) return true;
  const root = rootDomain(normalized);
  if (root && managedDomains.has(root)) return true;

  for (const candidate of managedDomains) {
    if (normalized === candidate || normalized.endsWith(`.${candidate}`)) return true;
  }
  return false;
}

function normalizeSequences(raw: any[] | undefined) {
  if (!Array.isArray(raw)) return [];
  return raw.map((step: any, index: number) => ({
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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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
    const listAllQuery = new URLSearchParams({
      workspace_id: credentials.workspaceId,
      campaign_id: id,
    });
    let campaign: any | null = null;

    const listAllRes = await pvRequest(
      credentials.apiKey,
      `/campaign/list-all?${listAllQuery.toString()}`
    );
    if (listAllRes.ok) {
      const payload = await listAllRes.json();
      campaign =
        toCampaignArray(payload).find((item) => getCampaignId(item) === id) || null;
    }

    if (!campaign) {
      const listQuery = new URLSearchParams({
        workspace_id: credentials.workspaceId,
        campaign_id: id,
      });
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
      const payload = await listRes.json();
      campaign =
        toCampaignArray(payload).find((item) => getCampaignId(item) === id) || null;
    }

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    return NextResponse.json({
      campaign: {
        ...campaign,
        id,
        name: campaign?.name || campaign?.camp_name || "Untitled Campaign",
        status: campaign?.status || "DRAFT",
        first_wait_time: Number(campaign?.first_wait_time || 0),
        sequences: normalizeSequences(campaign?.sequences || campaign?.sequence || []),
        schedules: Array.isArray(campaign?.schedules)
          ? campaign.schedules
          : campaign?.schedule
            ? [campaign.schedule]
            : [],
        email_accounts: Array.isArray(campaign?.email_accounts) ? campaign.email_accounts : [],
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch campaign details", code: "PLUSVIBE_ERROR" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { id } = await params;

  try {
    const body = await req.json();
    const campName = resolveCampaignName(body);

    if (body?.action === "copy_subsequences") {
      return NextResponse.json(
        {
          error: "Copy subsequences is not yet supported by PlusVibe v1 API route",
          code: "NOT_IMPLEMENTED",
        },
        { status: 400 }
      );
    }

    if (body?.action === "add_subsequence" && body?.subsequence) {
      const res = await pvRequest(credentials.apiKey, "/campaign/add/subsequence", {
        method: "POST",
        body: JSON.stringify({
          workspace_id: credentials.workspaceId,
          campaign_id: id,
          ...body.subsequence,
        }),
      });
      if (!res.ok) {
        const errorText = await res.text();
        return NextResponse.json(
          {
            error: `PlusVibe API error: ${res.status}`,
            code: "PLUSVIBE_ERROR",
            details: sanitizePlusVibeErrorDetails(errorText),
          },
          { status: res.status }
        );
      }
      return NextResponse.json(await res.json());
    }

    // Notes are currently local-only metadata. Keep request successful for UX.
    if (typeof body?.note === "string" && Object.keys(body).every((key) => key === "note")) {
      return NextResponse.json({ status: "success", note: body.note.trim() });
    }

    const payload: Record<string, any> = {
      workspace_id: credentials.workspaceId,
      campaign_id: id,
    };

    if (campName) payload.camp_name = campName;
    if (typeof body?.status === "string") payload.status = body.status;

    const normalizedSequences = Array.isArray(body?.sequences)
      ? normalizeSequences(body.sequences)
      : Array.isArray(body?.sequence)
        ? normalizeSequences(
            body.sequence.map((item: any, index: number) => ({
              step: Number(item?.step || index + 1),
              wait_time: Math.max(1, Number(item?.delay_days || item?.wait_time || 1)),
              variations: [
                {
                  variation: "A",
                  name: item?.name || item?.title || `Step ${index + 1}`,
                  subject: item?.subject || "",
                  body: item?.body || "",
                },
              ],
            }))
          )
        : [];
    if (normalizedSequences.length > 0) payload.sequences = normalizedSequences;

    const scheduleList = Array.isArray(body?.schedules)
      ? body.schedules
      : body?.schedule
        ? [body.schedule]
        : [];
    if (scheduleList.length > 0 || body?.timezone || body?.daily_limit || body?.start_date) {
      const baseSchedule = scheduleList[0] || {};
      const derivedStartDate =
        body?.start_date ||
        baseSchedule?.start_date ||
        new Date().toISOString().slice(0, 10);
      payload.schedules = [
        {
          daily_limit: Number(body?.daily_limit || baseSchedule?.daily_limit || 25),
          start_date: derivedStartDate,
          days: mapDaysToScheduleFlags(baseSchedule?.days || body?.days),
          timezone: String(body?.timezone || baseSchedule?.timezone || "America/New_York"),
          timing: {
            from: String(
              baseSchedule?.timing?.from || baseSchedule?.start_time || body?.start_time || "09:00"
            ),
            to: String(
              baseSchedule?.timing?.to || baseSchedule?.end_time || body?.end_time || "17:00"
            ),
          },
        },
      ];
    }

    if (Array.isArray(body?.email_accounts)) {
      const requestedAccountIds = Array.from(
        new Set(
          body.email_accounts
            .map((value: unknown) => String(value || "").trim())
            .filter(Boolean)
        )
      );

      if (requestedAccountIds.length === 0) {
        payload.email_accounts = [];
      } else {
        if (companyId) {
          const [accountsRes, managedDomainsResult] = await Promise.all([
            pvRequest(
              credentials.apiKey,
              `/account/list?workspace_id=${encodeURIComponent(credentials.workspaceId)}&limit=100`
            ),
            createClient(supabaseUrl, supabaseServiceKey)
              .from("inboxing_domains")
              .select("domain")
              .eq("company_id", companyId),
          ]);

          if (!accountsRes.ok) {
            const errorText = await accountsRes.text();
            return NextResponse.json(
              {
                error: `PlusVibe API error: ${accountsRes.status}`,
                code: "PLUSVIBE_ERROR",
                details: sanitizePlusVibeErrorDetails(errorText),
              },
              { status: accountsRes.status }
            );
          }

          const accountsPayload = await accountsRes.json();
          const accounts = toAccountArray(accountsPayload);
          const accountDomainById = new Map<string, string>();
          for (const account of accounts) {
            const accountId = String(account?._id || account?.id || account?.account_id || "").trim();
            if (!accountId) continue;
            const domain = extractDomainFromEmail(
              String(account?.email || account?.email_account || account?.username || "")
            );
            accountDomainById.set(accountId, domain);
          }

          const managedDomainSet = new Set(
            (managedDomainsResult.data || [])
              .map((row) => normalizeDomain(String(row.domain || "")))
              .filter(Boolean)
          );

          const externalSelections = requestedAccountIds.filter((accountId) => {
            const domain = accountDomainById.get(accountId) || "";
            return !isManagedDomain(domain, managedDomainSet);
          });

          if (externalSelections.length > 0) {
            return NextResponse.json(
              {
                error:
                  "One or more selected inboxes are external providers. Only managed-domain inboxes can be attached to campaigns.",
                code: "EXTERNAL_PROVIDER_RESTRICTED",
                restricted_account_ids: externalSelections,
              },
              { status: 400 }
            );
          }
        }

        payload.email_accounts = requestedAccountIds;
      }
    }

    const shouldSetFirstWaitTime =
      typeof payload.status === "string" ||
      Array.isArray(payload.sequences) ||
      Array.isArray(payload.schedules) ||
      Array.isArray(payload.email_accounts);
    if (shouldSetFirstWaitTime) {
      payload.first_wait_time = Number(body?.first_wait_time ?? 0);
    }

    if (Object.keys(payload).length <= 2) {
      return NextResponse.json(
        { error: "No valid campaign updates provided", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const res = await pvRequest(credentials.apiKey, "/campaign/update/campaign", {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    
    if (!res.ok) {
      const errorText = await res.text();
      return NextResponse.json(
        {
          error: `PlusVibe API error: ${res.status}`,
          code: "PLUSVIBE_ERROR",
          details: sanitizePlusVibeErrorDetails(errorText),
        },
        { status: res.status }
      );
    }
    
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to update campaign" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { id } = await params;

  try {
    const body = await req.json().catch(() => ({}));
    const archiveCampaign = body?.archive_campaign !== false;
    const saveLeadsToList = body?.save_leads_to_list === true;
    const payload = {
      workspace_id: credentials.workspaceId,
      campaign_id: id,
      is_archive: archiveCampaign ? "yes" : "no",
      is_save_lead_data: saveLeadsToList ? "yes" : "no",
    };
    const res = await pvRequest(credentials.apiKey, "/campaign/delete", {
      method: "DELETE",
      body: JSON.stringify(payload),
    });
    
    if (!res.ok) {
      const errorText = await res.text();
      return NextResponse.json(
        {
          error: `PlusVibe API error: ${res.status}`,
          code: "PLUSVIBE_ERROR",
          details: sanitizePlusVibeErrorDetails(errorText),
        },
        { status: res.status }
      );
    }
    
    const responsePayload = await res.json().catch(() => ({}));
    return NextResponse.json({
      success: true,
      status: archiveCampaign ? "ARCHIVED" : "DELETED",
      raw: responsePayload,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to delete campaign" },
      { status: 500 }
    );
  }
}
