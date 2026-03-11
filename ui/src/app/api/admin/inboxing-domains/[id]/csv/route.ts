import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/api-auth";
import { isAdminEmail } from "@/lib/bsos/db";
import * as inboxing from "@/lib/inboxing-client";

interface RouteParams {
  params: { id: string };
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await authenticateUser();
    if (!auth || !isAdminEmail(auth.email)) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const csv = await inboxing.getDomainCsv(params.id, { usePlatformKey: true });
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="domain-${params.id}-mailboxes.csv"`,
      },
    });
  } catch (error: any) {
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
