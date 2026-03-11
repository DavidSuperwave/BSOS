import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/api-auth";
import { isAdminEmail } from "@/lib/bsos/db";
import { allocateSlots } from "@/lib/inboxing-slots";

export async function POST(request: NextRequest) {
  const auth = await authenticateUser();
  if (!auth || !isAdminEmail(auth.email)) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { company_id, total_slots, allocation_type = "free", expires_at } = body;

    if (!company_id) {
      return NextResponse.json({ error: "company_id is required" }, { status: 400 });
    }

    if (!Number.isInteger(total_slots) || total_slots < 0) {
      return NextResponse.json({ error: "total_slots must be a non-negative integer" }, { status: 400 });
    }

    await allocateSlots(
      company_id,
      total_slots,
      allocation_type,
      expires_at ? new Date(expires_at) : undefined
    );

    return NextResponse.json({
      success: true,
      company_id,
      total_slots,
      allocation_type,
      expires_at: expires_at || null,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to allocate slots" },
      { status: 500 }
    );
  }
}
