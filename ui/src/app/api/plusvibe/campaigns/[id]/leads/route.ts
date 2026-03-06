import { NextRequest, NextResponse } from "next/server";
import { requireCompanyAccess } from "@/lib/api-auth";
import { getProjectCredentials } from "@/lib/plusvibe-project";

const PLUSVIBE_API = "https://api.plusvibe.ai/api/v1";

function sanitizeError(raw: string) {
  return raw.replace(/\s+/g, " ").trim().slice(0, 400);
}

function parseLeadName(name?: string) {
  const trimmed = (name || "").trim();
  if (!trimmed) return { first_name: "", last_name: "" };
  const [first_name, ...rest] = trimmed.split(/\s+/);
  return {
    first_name: first_name || "",
    last_name: rest.join(" ").trim(),
  };
}

function normalizeStatus(status: string): string {
  if (!status) return "Ready";
  const s = status.toLowerCase();
  if (s === "pending" || s === "not_contacted" || s === "new") return "Ready";
  if (s === "contacted" || s === "sent" || s === "active") return "Contacted";
  if (s === "replied" || s === "responded") return "Replied";
  if (s === "bounced" || s === "failed") return "Bounced";
  return status;
}

function toLeadRows(payload: any) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.value)) return payload.value;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.leads)) return payload.leads;
  if (Array.isArray(payload?.value?.data)) return payload.value.data;
  if (Array.isArray(payload?.value?.leads)) return payload.value.leads;
  if (Array.isArray(payload?.data?.data)) return payload.data.data;
  if (Array.isArray(payload?.data?.leads)) return payload.data.leads;
  return [];
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params;
  const companyId = req.nextUrl.searchParams.get("companyId");
  if (companyId) {
    const result = await requireCompanyAccess(companyId);
    if (result.error) return result.error;
  }

  const creds = await getProjectCredentials(companyId || undefined);
  if (!creds) {
    return NextResponse.json({ error: "PlusVibe not configured" }, { status: 400 });
  }

  try {
    const status = req.nextUrl.searchParams.get("status") || undefined;
    const page = Number(req.nextUrl.searchParams.get("page") || "1");
    const limit = Number(req.nextUrl.searchParams.get("limit") || "200");
    const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 500) : 200;
    const safePage = Number.isFinite(page) ? Math.max(page, 1) : 1;
    const maxPages = 8;

    const rows: any[] = [];
    let currentPage = safePage;
    let didFetch = false;

    while (currentPage < safePage + maxPages) {
      const query = new URLSearchParams({
        workspace_id: creds.workspaceId,
        campaign_id: campaignId,
        limit: String(safeLimit),
        page: String(currentPage),
        sort: "_id",
        direction: "desc",
      });
      if (status) query.set("status", status.toUpperCase());

      const res = await fetch(`${PLUSVIBE_API}/lead/workspace-leads?${query.toString()}`, {
        headers: {
          "x-api-key": creds.apiKey,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        const body = await res.text();
        if (!didFetch) {
          return NextResponse.json(
            {
              error: `PlusVibe API error: ${res.status}`,
              details: sanitizeError(body),
            },
            { status: res.status }
          );
        }
        break;
      }

      const data = await res.json();
      const pageRows = toLeadRows(data);
      didFetch = true;
      if (!Array.isArray(pageRows) || pageRows.length === 0) {
        break;
      }
      rows.push(...pageRows);
      if (pageRows.length < safeLimit) {
        break;
      }
      currentPage += 1;
    }

    let filteredRows = rows.filter((lead) => {
      const leadCampaignId = String(lead?.campaign_id || lead?.camp_id || "").trim();
      return !leadCampaignId || leadCampaignId === campaignId;
    });

    if (filteredRows.length === 0) {
      const workspaceRows: any[] = [];
      let fallbackPage = safePage;
      while (fallbackPage < safePage + 4) {
        const fallbackQuery = new URLSearchParams({
          workspace_id: creds.workspaceId,
          limit: String(safeLimit),
          page: String(fallbackPage),
          sort: "_id",
          direction: "desc",
        });
        if (status) fallbackQuery.set("status", status.toUpperCase());
        const fallbackRes = await fetch(
          `${PLUSVIBE_API}/lead/workspace-leads?${fallbackQuery.toString()}`,
          {
            headers: {
              "x-api-key": creds.apiKey,
              "Content-Type": "application/json",
            },
            signal: AbortSignal.timeout(10000),
          }
        );
        if (!fallbackRes.ok) break;
        const fallbackData = await fallbackRes.json();
        const fallbackRows = toLeadRows(fallbackData);
        if (!Array.isArray(fallbackRows) || fallbackRows.length === 0) break;
        workspaceRows.push(...fallbackRows);
        if (fallbackRows.length < safeLimit) break;
        fallbackPage += 1;
      }
      filteredRows = workspaceRows.filter((lead) => {
        const leadCampaignId = String(lead?.campaign_id || lead?.camp_id || "").trim();
        return leadCampaignId === campaignId;
      });
    }

    // Normalize lead data into our LeadRow shape
    const leads = filteredRows.map(
      (lead: any, index: number) => ({
        id: String(lead.id || lead._id || lead.lead_id || `lead-${index}`),
        name:
          lead.name ||
          lead.full_name ||
          `${lead.first_name || ""} ${lead.last_name || ""}`.trim() ||
          "Unknown",
        email: lead.email || lead.email_address || "",
        company: lead.company || lead.company_name || lead.organization || "",
        title: lead.title || lead.job_title || "",
        status: normalizeStatus(lead.status || lead.state),
        tag: lead.tag || lead.label || lead.tags?.[0] || "",
        step:
          lead.step ||
          lead.current_step ||
          lead.sent_step ||
          lead.sequence_step ||
          "Not started",
        lastActivity:
          lead.last_sent_at ||
          lead.modified_at ||
          lead.last_activity ||
          lead.updated_at ||
          lead.last_activity_at ||
          "",
      })
    );

    const dedupedLeads = Array.from(
      new Map(leads.map((lead) => [lead.id, lead])).values()
    );

    return NextResponse.json({ leads: dedupedLeads, total: dedupedLeads.length });
  } catch (err: any) {
    console.error("[PlusVibe Leads] Error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to fetch leads" },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params;
  const companyId = req.nextUrl.searchParams.get("companyId");
  if (companyId) {
    const result = await requireCompanyAccess(companyId);
    if (result.error) return result.error;
  }

  const creds = await getProjectCredentials(companyId || undefined);
  if (!creds) {
    return NextResponse.json({ error: "PlusVibe not configured" }, { status: 400 });
  }

  try {
    const body = await req.json();
    const { name, email, company, title, first_name, last_name, custom_variables } = body;

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const parsedName = parseLeadName(name);
    const normalizedFirstName = String(first_name || parsedName.first_name || "").trim();
    const normalizedLastName = String(last_name || parsedName.last_name || "").trim();

    const res = await fetch(
      `${PLUSVIBE_API}/lead/add`,
      {
        method: "POST",
        headers: {
          "x-api-key": creds.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspace_id: creds.workspaceId,
          campaign_id: campaignId,
          leads: [
            {
              email: String(email).trim(),
              first_name: normalizedFirstName,
              last_name: normalizedLastName,
              company_name: String(company || "").trim(),
              job_title: String(title || "").trim(),
              custom_variables: custom_variables || {},
            },
          ],
        }),
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!res.ok) {
      const errorBody = await res.text();
      return NextResponse.json(
        {
          error: `PlusVibe API error: ${res.status}`,
          details: sanitizeError(errorBody),
        },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error("[PlusVibe Leads] POST Error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to add lead" },
      { status: 500 }
    );
  }
}
