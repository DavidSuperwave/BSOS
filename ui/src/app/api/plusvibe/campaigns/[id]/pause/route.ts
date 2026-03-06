import { NextRequest, NextResponse } from "next/server";
import { getProjectCredentials } from "@/lib/plusvibe-project";
import { requireCompanyAccess } from "@/lib/api-auth";

const PLUSVIBE_BASE = "https://api.plusvibe.ai/api/v1";

function sanitizePlusVibeErrorDetails(raw: string) {
  return raw.replace(/\s+/g, " ").trim().slice(0, 400);
}

export async function POST(
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
    const res = await fetch(`${PLUSVIBE_BASE}/campaign/pause`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": credentials.apiKey,
      },
      body: JSON.stringify({
        workspace_id: credentials.workspaceId,
        campaign_id: id,
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

    const data = await res.json().catch(() => ({ status: "success" }));
    return NextResponse.json({
      ...data,
      campaign_id: id,
      status: "PAUSED",
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        error: err?.message || "Failed to pause campaign",
        code: "PLUSVIBE_ERROR",
      },
      { status: 500 }
    );
  }
}
