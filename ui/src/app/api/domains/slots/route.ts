import { NextRequest, NextResponse } from "next/server";
import { requireCompanyAccess } from "@/lib/api-auth";
import { getCompanySlots } from "@/lib/inboxing-slots";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");

  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }

  const accessResult = await requireCompanyAccess(companyId);
  if ("error" in accessResult) return accessResult.error;

  const slots = await getCompanySlots(companyId);
  return NextResponse.json({
    slots: {
      total: slots?.total_slots || 0,
      used: slots?.used_slots || 0,
      available: slots?.available_slots || 0,
      allocation_type: slots?.allocation_type || "free",
    },
  });
}
