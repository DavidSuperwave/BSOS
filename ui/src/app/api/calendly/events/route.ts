import { NextRequest, NextResponse } from "next/server";
import { getCompanyCredentials } from "@/lib/company-credentials";

const CALENDLY_BASE = "https://api.calendly.com";

export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json(
      { error: "companyId is required" },
      { status: 400 }
    );
  }

  const creds = await getCompanyCredentials(companyId);
  const apiKey = creds.calendly_api_key;
  const userUri = creds.calendly_user_uri;

  if (!apiKey) {
    return NextResponse.json(
      { error: "Calendly API key not configured", code: "MISSING_KEY" },
      { status: 503 }
    );
  }

  try {
    const res = await fetch(
      `${CALENDLY_BASE}/scheduled_events?user=${userUri}&count=20&sort=start_time:desc`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );
    const data = await res.json();
    return NextResponse.json({ events: data.collection || [] });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch events" },
      { status: 500 }
    );
  }
}
