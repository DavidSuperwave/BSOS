import { NextRequest, NextResponse } from "next/server";
import { requireCompanyAccess } from "@/lib/api-auth";
import { getProjectCredentials } from "@/lib/plusvibe-project";

const PLUSVIBE_API = "https://server.plusvibe.com/api/v1";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params;
  const companyId = req.nextUrl.searchParams.get("companyId");

  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  const result = await requireCompanyAccess(companyId);
  if (result.error) return result.error;

  const creds = await getProjectCredentials(companyId);
  if (!creds) {
    return NextResponse.json({ error: "PlusVibe not configured" }, { status: 400 });
  }

  try {
    const res = await fetch(
      `${PLUSVIBE_API}/campaigns/${campaignId}/leads`,
      {
        headers: {
          Authorization: `Bearer ${creds.apiKey}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!res.ok) {
      const body = await res.text();
      return NextResponse.json(
        { error: `PlusVibe API error: ${res.status}`, details: body },
        { status: res.status }
      );
    }

    const data = await res.json();

    // Normalize lead data into our LeadRow shape
    const leads = (data.leads || data.data || data || []).map(
      (lead: any, index: number) => ({
        id: lead.id || lead.lead_id || `lead-${index}`,
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

  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  const result = await requireCompanyAccess(companyId);
  if (result.error) return result.error;

  const creds = await getProjectCredentials(companyId);
  if (!creds) {
    return NextResponse.json({ error: "PlusVibe not configured" }, { status: 400 });
  }

  try {
    const body = await req.json();
    const { name, email, company, title } = body;

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const res = await fetch(
      `${PLUSVIBE_API}/campaigns/${campaignId}/leads`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${creds.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          leads: [{ name, email, company, title }],
        }),
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!res.ok) {
      const errorBody = await res.text();
      return NextResponse.json(
        { error: `PlusVibe API error: ${res.status}`, details: errorBody },
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

function normalizeStatus(status: string): string {
  if (!status) return "Ready";
  const s = status.toLowerCase();
  if (s === "ready" || s === "queued" || s === "new") return "Ready";
  if (s === "contacted" || s === "sent" || s === "active") return "Contacted";
  if (s === "replied" || s === "responded") return "Replied";
  if (s === "bounced" || s === "failed") return "Bounced";
  return status;
}
