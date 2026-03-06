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
    const limit = Number(req.nextUrl.searchParams.get("limit") || "200");
    const query = new URLSearchParams({
      workspace_id: creds.workspaceId,
      campaign_id: campaignId,
      limit: String(Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 500) : 200),
    });
    if (status) query.set("status", status);

    const res = await fetch(
      `${PLUSVIBE_API}/lead/workspace-leads?${query.toString()}`,
      {
        headers: {
          "x-api-key": creds.apiKey,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!res.ok) {
      const body = await res.text();
      return NextResponse.json(
        {
          error: `PlusVibe API error: ${res.status}`,
          details: sanitizeError(body),
        },
        { status: res.status }
      );
    }

    const data = await res.json();
    const rows = Array.isArray(data?.value)
      ? data.value
      : Array.isArray(data?.data)
        ? data.data
        : Array.isArray(data?.leads)
          ? data.leads
          : Array.isArray(data)
            ? data
            : [];

    // Normalize lead data into our LeadRow shape
    const leads = rows.map(
      (lead: any, index: number) => ({
        id: String(lead.id || lead._id || lead.lead_id || `lead-${index}`),
        name: lead.name || lead.full_name || `${lead.first_name || ""} ${lead.last_name || ""}`.trim() || "Unknown",
        email: lead.email || lead.email_address || "",
        company: lead.company || lead.company_name || lead.organization || "",
        title: lead.title || lead.job_title || "",
        status: normalizeStatus(lead.status || lead.state),
        tag: lead.tag || lead.tags?.[0] || "",
        step: lead.step || lead.current_step || lead.sequence_step || "Not started",
        lastActivity: lead.last_activity || lead.updated_at || lead.last_activity_at || "",
      })
    );

    return NextResponse.json({ leads, total: leads.length });
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
