import { NextRequest, NextResponse } from "next/server";
import { requireCompanyAccess } from "@/lib/api-auth";
import * as inboxing from "@/lib/inboxing-client";
import { verifyDomainAccess } from "@/lib/inboxing-slots";

interface RouteParams {
  params: { id: string };
}

/**
 * GET /api/inboxing/protected/domains/[id]/csv
 * Download CSV for a domain (slot-protected, verifies domain belongs to company)
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  const inboxingId = params.id;

  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }

  const accessResult = await requireCompanyAccess(companyId);
  if ("error" in accessResult) return accessResult.error;

  // Verify domain belongs to company
  const hasAccess = await verifyDomainAccess(companyId, inboxingId);
  if (!hasAccess) {
    return NextResponse.json(
      { error: "Domain not found or access denied" },
      { status: 403 }
    );
  }

  try {
    // Fetch CSV from Inboxing API (using platform key)
    const csv = await inboxing.getDomainCsv(inboxingId, { usePlatformKey: true });

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="domain-${inboxingId}-mailboxes.csv"`,
      },
    });
  } catch (error: any) {
    console.error("[Protected Inboxing CSV] Error:", error);
    if (error.message?.includes("not available")) {
      return NextResponse.json(
        { error: "CSV not available yet (24-hour warmup period)" },
        { status: 403 }
      );
    }
    return NextResponse.json(
      { error: error.message || "Failed to download CSV" },
      { status: 500 }
    );
  }
}
