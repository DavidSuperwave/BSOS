import { NextRequest, NextResponse } from "next/server";
import { PlusVibeError, plusvibeFetch } from "@/lib/plusvibe-client";

function resolveCampaignName(input: Record<string, any>) {
  const candidate =
    input?.camp_name ??
    input?.campaignName ??
    input?.name ??
    input?.newName;
  return typeof candidate === "string" ? candidate.trim() : "";
}

function normalizeStatusAction(input: string) {
  const value = String(input || "").toUpperCase().trim();
  if (["ACTIVE", "RUNNING", "LAUNCHED", "STARTED", "ON", "ENABLED"].includes(value)) {
    return "ACTIVE";
  }
  if (["PAUSED", "PAUSE", "INACTIVE", "STOPPED", "OFF", "DISABLED"].includes(value)) {
    return "PAUSED";
  }
  return null;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { searchParams } = new URL(req.url);
  const companyId = searchParams.get("companyId") || undefined;

  const { id } = await params;

  try {
    const body = await req.json();
    const action = normalizeStatusAction((body?.status ?? "").toString());

    if (action === "ACTIVE") {
      const data = await plusvibeFetch("/campaign/launch", companyId, {
        method: "POST",
        body: { campaign_id: id },
      });
      return NextResponse.json(data);
    }

    if (action === "PAUSED") {
      const data = await plusvibeFetch("/campaign/pause", companyId, {
        method: "POST",
        body: { campaign_id: id },
      });
      return NextResponse.json(data);
    }

    const campName = resolveCampaignName(body);
    const payload = {
      ...body,
      campaign_id: id,
      ...(campName ? { camp_name: campName } : {}),
    };
    const data = await plusvibeFetch("/campaign/update/campaign", companyId, {
      method: "PATCH",
      body: payload,
    });
    return NextResponse.json(data);
  } catch (err: any) {
    if (err instanceof PlusVibeError) {
      return NextResponse.json(
        { error: err.details, code: err.code },
        { status: err.status }
      );
    }
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

  const { id } = await params;

  try {
    const body = await req.json().catch(() => ({}));
    const archiveCampaign = body?.archive_campaign;
    const saveLeadsToList = body?.save_leads_to_list;
    const payload = {
      campaign_id: id,
      is_archive: archiveCampaign === false ? "no" : "yes",
      is_save_lead_data: saveLeadsToList === true ? "yes" : "no",
    };

    await plusvibeFetch("/campaign/delete", companyId, {
      method: "DELETE",
      body: payload,
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    if (err instanceof PlusVibeError) {
      return NextResponse.json(
        { error: err.details, code: err.code },
        { status: err.status }
      );
    }
    return NextResponse.json(
      { error: err.message || "Failed to delete campaign" },
      { status: 500 }
    );
  }
}
