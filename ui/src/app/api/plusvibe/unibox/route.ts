import { NextRequest, NextResponse } from "next/server";
import { getProjectCredentials } from "@/lib/plusvibe-project";
import { requireCompanyAccess } from "@/lib/api-auth";

const PLUSVIBE_BASE = "https://api.plusvibe.ai/api/v1";

function sanitizeError(raw: string) {
  return raw.replace(/\s+/g, " ").trim().slice(0, 400);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId") || undefined;
  const lead = (searchParams.get("lead") || "").trim();
  const campaignId = (searchParams.get("campaignId") || "").trim();

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
    if (!lead) {
      return NextResponse.json(
        { error: "lead query parameter is required" },
        { status: 400 }
      );
    }
    const query = new URLSearchParams({
      workspace_id: credentials.workspaceId,
      lead,
    });
    if (campaignId) query.set("campaign_id", campaignId);

    const res = await fetch(
      `${PLUSVIBE_BASE}/unibox/campaign-emails?${query.toString()}`,
      {
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
          details: sanitizeError(errorText),
        },
        { status: res.status }
      );
    }
    
    const data = await res.json();
    const emails = Array.isArray(data?.data)
      ? data.data
      : Array.isArray(data?.value)
        ? data.value
        : Array.isArray(data)
          ? data
          : [];
    return NextResponse.json({
      emails,
      credentialsSource: credentials.source,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        error: err.message || "Failed to fetch unibox",
        emails: [],
        credentialsSource: credentials?.source,
      },
      { status: 200 } // Return 200 with empty to avoid breaking UI
    );
  }
}
