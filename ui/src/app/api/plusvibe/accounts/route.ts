import { NextResponse } from "next/server";
import { getProjectCredentials } from "@/lib/plusvibe-project";

const PLUSVIBE_BASE = "https://server.plusvibe.com/api/v3";

export async function GET(request: Request) {
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
    const res = await fetch(
      `${PLUSVIBE_BASE}/email-accounts?workspace_id=${credentials.workspaceId}`,
      {
        headers: {
          "Content-Type": "application/json",
          "api-key": credentials.apiKey,
        },
      }
    );
    
    if (!res.ok) {
      const errorText = await res.text();
      return NextResponse.json(
        { error: `PlusVibe API error: ${res.status}`, details: errorText },
        { status: res.status }
      );
    }
    
    const data = await res.json();
    return NextResponse.json({
      accounts: data.data || data,
      credentialsSource: credentials.source,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch accounts" },
      { status: 500 }
    );
  }
}
