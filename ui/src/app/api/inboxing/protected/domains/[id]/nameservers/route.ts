import { NextRequest, NextResponse } from "next/server";
import * as inboxing from "@/lib/inboxing-client";
import { requireCompanyAccess } from "@/lib/api-auth";
import { verifyDomainAccess } from "@/lib/inboxing-slots";

interface RouteParams {
  params: { id: string };
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  const inboxingId = params.id;

  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }

  const accessResult = await requireCompanyAccess(companyId);
  if ("error" in accessResult) return accessResult.error;

  const hasAccess = await verifyDomainAccess(companyId, inboxingId);
  if (!hasAccess) {
    return NextResponse.json({ error: "Domain not found or access denied" }, { status: 403 });
  }

  try {
    const status = await inboxing.getDomainStatus(inboxingId, { usePlatformKey: true });
    return NextResponse.json({ nameservers: status.nameservers || [] });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to load nameservers" },
      { status: 500 }
    );
  }
}
