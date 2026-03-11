import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/api-auth";
import { isAdminEmail } from "@/lib/bsos/db";
import { getCompanySlots } from "@/lib/inboxing-slots";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  const auth = await authenticateUser();
  if (!auth || !isAdminEmail(auth.email)) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { companyId } = await params;
  const slots = await getCompanySlots(companyId);

  return NextResponse.json({
    company_id: companyId,
    slots: {
      total: slots?.total_slots || 0,
      used: slots?.used_slots || 0,
      available: slots?.available_slots || 0,
      allocation_type: slots?.allocation_type || "free",
    },
  });
}
