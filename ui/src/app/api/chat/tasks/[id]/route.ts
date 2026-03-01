import { NextRequest, NextResponse } from "next/server";
import { authenticateUser, verifyCompanyAccess } from "@/lib/api-auth";
import { getTask, getTaskEvents } from "@/lib/chat/task-runner";
import { getTaskHealth } from "@/lib/chat/task-worker";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await authenticateUser();
  if (!auth) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const task = await getTask(id);
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  const access = await verifyCompanyAccess(auth.userId, task.company_id);
  if (!access) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const events = await getTaskEvents(id);
  return NextResponse.json({ task, health: getTaskHealth(task), events });
}
