import { NextRequest, NextResponse } from "next/server";
import { envConfig } from "@/lib/env";
import { getCompanyCredentials } from "@/lib/company-credentials";
import { requireCompanyAccess } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json(
      { error: "companyId is required" },
      { status: 400 }
    );
  }

  const authResult = await requireCompanyAccess(companyId);
  if (authResult.error) return authResult.error;

  const creds = await getCompanyCredentials(companyId);

  // Check OpenClaw connectivity
  let openclawConnected = false;
  try {
    const res = await fetch(`${envConfig.openclaw.url()}/`, {
      signal: AbortSignal.timeout(2000),
    });
    openclawConnected = res.status < 400;
  } catch {
    openclawConnected = false;
  }

  return NextResponse.json({
    plusvibe: !!creds.plusvibe_api_key,
    close: !!creds.close_api_key,
    calendly: !!creds.calendly_api_key,
    supermemory: !!creds.supermemory_api_key,
    perplexity: !!creds.perplexity_api_key,
    openclaw: openclawConnected,
  });
}
