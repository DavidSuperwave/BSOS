import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/api-auth";
import { isAdminEmail } from "@/lib/bsos-db";
import * as inboxing from "@/lib/inboxing-client";

/**
 * GET /api/admin/inboxing-slots
 * Get slot information from Inboxing API (admin only)
 */
export async function GET() {
  try {
    const auth = await authenticateUser();
    if (!auth || !isAdminEmail(auth.email)) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    // Get slots from Inboxing API using platform key
    const slots = await inboxing.getSlots({ usePlatformKey: true });

    return NextResponse.json({ slots });
  } catch (error: any) {
    console.error("[Admin Inboxing Slots] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch slots" },
      { status: 500 }
    );
  }
}
