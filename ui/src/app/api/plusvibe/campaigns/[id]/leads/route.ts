import { NextRequest, NextResponse } from "next/server";
import { requireCompanyAccess } from "@/lib/api-auth";
import { PlusVibeError, plusvibeFetch } from "@/lib/plusvibe-client";

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

  try {
    const page = toPositiveInt(req.nextUrl.searchParams.get("page"), 1);
    const limit = toPositiveInt(req.nextUrl.searchParams.get("limit"), 25);
    const query = new URLSearchParams({
      campaign_id: campaignId,
      page: String(page),
      limit: String(limit),
    });
    for (const key of ["status", "search", "q", "tag", "label", "step", "sort", "direction"]) {
      const value = req.nextUrl.searchParams.get(key);
      if (value) query.set(key, value);
    }

    const data = await plusvibeFetch(
      `/lead/workspace-leads?${query.toString()}`,
      companyId,
      { method: "GET" }
    );
    const normalized = normalizeLeadsPayload(data, page, limit);
    const rawLeads = normalized.leads;

    // Normalize lead data into our LeadRow shape
    const leads = (Array.isArray(rawLeads) ? rawLeads : []).map(
      (lead: any, index: number) => ({
        id: lead.id || lead._id || lead.lead_id || `lead-${index}`,
        name: lead.name || lead.full_name || [lead.first_name, lead.last_name].filter(Boolean).join(" ").trim() || "Unknown",
        email: lead.email || lead.email_address || "",
        company: lead.company || lead.company_name || lead.organization || "",
        title: lead.title || lead.job_title || "",
        status: normalizeStatus(lead.status || lead.state),
        tag: lead.tag || lead.tags?.[0] || lead.label || "",
        step: String(lead.step ?? lead.current_step ?? lead.sequence_step ?? lead.sent_step ?? "Not started"),
        lastActivity: lead.last_activity || lead.modified_at || lead.last_sent_at || lead.updated_at || lead.last_activity_at || "",
      })
    );

    return NextResponse.json({
      leads,
      total: normalized.total,
      page: normalized.page,
      limit: normalized.limit,
    });
  } catch (err: any) {
    if (err instanceof PlusVibeError) {
      return NextResponse.json(
        { error: err.details, code: err.code },
        { status: err.status }
      );
    }
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

  try {
    const body = await req.json();
    const payload: Record<string, any> = { campaign_id: campaignId };

    if (Array.isArray(body?.leads) && body.leads.length > 0) {
      payload.leads = body.leads;
    } else {
      const { name, email, company, title } = body;
      if (!email) {
        return NextResponse.json({ error: "Email is required" }, { status: 400 });
      }
      const [first = "", ...rest] = (name || "").trim().split(/\s+/);
      const last = rest.join(" ") || "";
      payload.leads = [{
        email,
        first_name: first || undefined,
        last_name: last || undefined,
        company_name: company || undefined,
        job_title: title || undefined,
      }];
    }

    for (const key of ["is_overwrite", "source", "tags", "list_id"]) {
      if (body?.[key] !== undefined) payload[key] = body[key];
    }

    const data = await plusvibeFetch("/lead/add", companyId, {
      method: "POST",
      body: payload,
    });
    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    if (err instanceof PlusVibeError) {
      return NextResponse.json(
        { error: err.details, code: err.code },
        { status: err.status }
      );
    }
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

function toPositiveInt(input: string | null, fallback: number) {
  const parsed = Number.parseInt(String(input ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeLeadsPayload(data: any, requestedPage: number, requestedLimit: number) {
  const nestedData =
    data && typeof data === "object" && !Array.isArray(data)
      ? data.data
      : null;
  const candidates = [
    data?.leads,
    data?.value,
    data?.items,
    data?.rows,
    data?.results,
    data?.data,
    nestedData?.leads,
    nestedData?.items,
    nestedData?.rows,
  ];
  const leads = candidates.find((entry) => Array.isArray(entry)) || [];
  const total =
    readNumber(data?.total) ??
    readNumber(data?.count) ??
    readNumber(data?.total_count) ??
    readNumber(data?.pagination?.total) ??
    readNumber(nestedData?.total) ??
    leads.length;
  const page =
    readNumber(data?.page) ??
    readNumber(data?.pagination?.page) ??
    readNumber(nestedData?.page) ??
    requestedPage;
  const limit =
    readNumber(data?.limit) ??
    readNumber(data?.per_page) ??
    readNumber(data?.pagination?.limit) ??
    readNumber(data?.pagination?.per_page) ??
    readNumber(nestedData?.limit) ??
    requestedLimit;

  return { leads, total, page, limit };
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}
