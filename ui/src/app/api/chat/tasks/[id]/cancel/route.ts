import { NextRequest, NextResponse } from "next/server";
import { authenticateUser, verifyCompanyAccess } from "@/lib/api-auth";
import { cancelTask, getTask } from "@/lib/chat/task-runner";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await authenticateUser();
  if (!auth) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const existing = await getTask(id);
  if (!existing) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  const access = await verifyCompanyAccess(auth.userId, existing.company_id);
  if (!access) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const task = await cancelTask(id);
  return NextResponse.json({ success: true, task });
}
