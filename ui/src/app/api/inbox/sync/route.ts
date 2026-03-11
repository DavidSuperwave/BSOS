import { NextRequest, NextResponse } from "next/server";
import { requireCompanyAccess } from "@/lib/api-auth";
import { hydratePlusVibeInboxAndWebhook } from "@/lib/plusvibe-inbox-sync";

export async function POST(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get("companyId");

  if (!companyId) {
    return NextResponse.json(
      { error: "companyId is required" },
      { status: 400 }
    );
  }

  const authResult = await requireCompanyAccess(companyId);
  if (authResult.error) return authResult.error;

  try {
    const result = await hydratePlusVibeInboxAndWebhook(companyId, req.nextUrl.origin);
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to sync inbox" },
      { status: 500 }
    );
  }
}
