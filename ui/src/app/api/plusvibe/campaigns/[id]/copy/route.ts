import { NextRequest, NextResponse } from "next/server";
import { requireCompanyAccess } from "@/lib/api-auth";
import { PlusVibeError, plusvibeFetch } from "@/lib/plusvibe-client";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params;
  const companyId = req.nextUrl.searchParams.get("companyId");
  const lead = req.nextUrl.searchParams.get("lead");

  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  const result = await requireCompanyAccess(companyId);
  if (result.error) return result.error;

  try {
    const query = new URLSearchParams({ campaign_id: campaignId });
    if (lead?.trim()) query.set("lead", lead.trim());

    const data = await plusvibeFetch(
      `/unibox/campaign-emails?${query.toString()}`,
      companyId,
      { method: "GET" }
    );

    const emails = Array.isArray(data)
      ? data
      : data?.emails || data?.data || data?.value || [];

    return NextResponse.json({
      emails: Array.isArray(emails) ? emails : [],
      data,
    });
  } catch (err: any) {
    if (err instanceof PlusVibeError) {
      return NextResponse.json(
        { error: err.details, code: err.code },
        { status: err.status }
      );
    }
    return NextResponse.json(
      { error: err?.message || "Failed to fetch campaign copy" },
      { status: 500 }
    );
  }
}
