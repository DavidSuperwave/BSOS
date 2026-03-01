import { NextRequest, NextResponse } from "next/server";
import { getProjectCredentials } from "@/lib/plusvibe-project";

const PLUSVIBE_BASE = "https://api.plusvibe.ai/api/v1";

function sanitizePlusVibeErrorDetails(raw: string) {
  return raw.replace(/\s+/g, " ").trim().slice(0, 400);
}

function resolveCampaignName(input: Record<string, any>) {
  const candidate =
    input?.camp_name ??
    input?.campaignName ??
    input?.name ??
    input?.newName;
  return typeof candidate === "string" ? candidate.trim() : "";
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { searchParams } = new URL(req.url);
  const companyId = searchParams.get("companyId") || undefined;

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
    const payload = {
      ...body,
      ...(campName ? { camp_name: campName } : {}),
      workspace_id: credentials.workspaceId,
    };
    const res = await fetch(`${PLUSVIBE_BASE}/campaigns/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": credentials.apiKey,
      },
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
    const archiveCampaign = body?.archive_campaign;
    const saveLeadsToList = body?.save_leads_to_list;
    const query = new URLSearchParams({
      workspace_id: credentials.workspaceId,
      ...(typeof archiveCampaign === "boolean"
        ? { archive_campaign: String(archiveCampaign) }
        : {}),
      ...(typeof saveLeadsToList === "boolean"
        ? { save_leads_to_list: String(saveLeadsToList) }
        : {}),
    });

    const res = await fetch(
      `${PLUSVIBE_BASE}/campaigns/${id}?${query.toString()}`,
      {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": credentials.apiKey,
        },
      }
    );
    
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
    
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to delete campaign" },
      { status: 500 }
    );
  }
}
