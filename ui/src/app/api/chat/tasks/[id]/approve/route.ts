import { NextRequest, NextResponse } from "next/server";
import { authenticateUser, verifyCompanyAccess } from "@/lib/api-auth";
import { getTask, resolveTaskApproval } from "@/lib/chat/task-runner";
import { runTaskWorkerForTask } from "@/lib/chat/task-worker";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await authenticateUser();
  if (!auth) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const body = await req.json();
  const decision = String(body?.decision || "").toLowerCase();
  if (decision !== "approved" && decision !== "rejected") {
    return NextResponse.json(
      { error: "decision must be approved or rejected" },
      { status: 400 }
    );
  }
  const existing = await getTask(id);
  if (!existing) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  const access = await verifyCompanyAccess(auth.userId, existing.company_id);
  if (!access) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const task = await resolveTaskApproval(id, decision);

  let worker: Record<string, any> | null = null;
  if (decision === "approved") {
    worker = await runTaskWorkerForTask({ taskId: id });
  }

  return NextResponse.json({ success: true, task, worker });
}
