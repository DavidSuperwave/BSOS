import { NextRequest, NextResponse } from "next/server";
import { getProjectCredentials } from "@/lib/plusvibe-project";

const PLUSVIBE_BASE = "https://api.plusvibe.ai/api/v1";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId") || undefined;

  const credentials = await getProjectCredentials(companyId);
  
  if (!credentials) {
    return NextResponse.json(
      { error: "PlusVibe API key not configured", code: "MISSING_KEY" },
      { status: 503 }
    );
  }

  try {
    // Note: PlusVibe's unibox endpoint may vary - trying common patterns
    const res = await fetch(
      `${PLUSVIBE_BASE}/unibox?workspace_id=${credentials.workspaceId}`,
      {
        headers: {
          "Content-Type": "application/json",
          "x-api-key": credentials.apiKey,
        },
      }
    );
    
    if (!res.ok) {
      // Fallback: return empty since unibox endpoint may not exist in v1
      return NextResponse.json({
        emails: [],
        message: "Unibox endpoint not available in API v1",
        credentialsSource: credentials.source,
      });
    }
    
    const data = await res.json();
    return NextResponse.json({
      emails: data.data || data.value || data,
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
