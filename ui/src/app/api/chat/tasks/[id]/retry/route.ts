import { NextRequest, NextResponse } from "next/server";
import { authenticateUser, verifyCompanyAccess } from "@/lib/api-auth";
import { getTask, retryTask } from "@/lib/chat/task-runner";
import { runTaskWorkerForTask } from "@/lib/chat/task-worker";

export async function POST(
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
  try {
    const retried = await retryTask(id);
    const worker = await runTaskWorkerForTask({ taskId: id });
    return NextResponse.json({ success: true, task: retried, worker });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Retry failed" }, { status: 400 });
  }
}
