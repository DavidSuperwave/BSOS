import { NextRequest, NextResponse } from "next/server";
import { authenticateUser, verifyCompanyAccess } from "@/lib/api-auth";
import { createTask, listSessionTasks, getTaskEvents } from "@/lib/chat/task-runner";
import { getTaskHealth } from "@/lib/chat/task-worker";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
let adminClient: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!adminClient) adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

export async function GET(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  const admin = getAdmin();
  const { data: session } = await admin
    .from("chat_sessions")
    .select("id, company_id, user_id")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  if (session.user_id && session.user_id !== auth.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const access = await verifyCompanyAccess(auth.userId, session.company_id);
  if (!access) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tasks = await listSessionTasks(sessionId);
  const tasksWithEvents = await Promise.all(
    tasks.map(async (task) => ({
      ...task,
      health: getTaskHealth(task),
      events: (await getTaskEvents(task.id)).slice(-5),
    }))
  );
  return NextResponse.json({ tasks: tasksWithEvents });
}

export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const body = await req.json();
  const {
    companyId,
    parentSessionId,
    agentType = "main",
    objective,
    inputs,
    priority,
    requiresApproval,
  } = body || {};

  if (!companyId || !parentSessionId || !objective) {
    return NextResponse.json(
      { error: "companyId, parentSessionId, objective are required" },
      { status: 400 }
    );
  }

  const access = await verifyCompanyAccess(auth.userId, companyId);
  if (!access) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const task = await createTask({
    companyId,
    parentSessionId,
    agentType,
    objective,
    inputs,
    priority,
    requiresApproval,
    flowId: body?.flowId,
    stepId: body?.stepId,
    attempt: body?.attempt,
    maxActions: body?.maxActions,
    actionsUsed: body?.actionsUsed,
    hardStopBehavior: body?.hardStopBehavior,
  });

  return NextResponse.json({ success: true, task }, { status: 201 });
}
