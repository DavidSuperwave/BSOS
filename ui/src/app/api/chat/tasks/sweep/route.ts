import { NextRequest, NextResponse } from "next/server";
import { authenticateUser, verifyCompanyAccess } from "@/lib/api-auth";
import { sweepTaskHealthForCompany } from "@/lib/chat/task-worker";

export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const companyId = String(body?.companyId || "");
  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }

  const access = await verifyCompanyAccess(auth.userId, companyId);
  if (!access) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await sweepTaskHealthForCompany(companyId);
  return NextResponse.json({ success: true, ...result });
}

