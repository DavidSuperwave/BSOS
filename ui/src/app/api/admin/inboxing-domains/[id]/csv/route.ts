import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/api-auth";
import { isAdminEmail } from "@/lib/bsos/db";
import * as inboxing from "@/lib/inboxing-client";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await authenticateUser();
    if (!auth || !isAdminEmail(auth.email)) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const { id } = await params;
    const csv = await inboxing.getDomainCsv(id, { usePlatformKey: true });
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="domain-${id}-mailboxes.csv"`,
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
