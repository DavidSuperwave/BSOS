import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let adminClient: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!adminClient) adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

export type TaskStatus =
  | "queued"
  | "running"
  | "blocked"
  | "completed"
  | "failed"
  | "cancelled";

export interface CreateTaskInput {
  companyId: string;
  parentSessionId: string;
  agentType: "main" | "campaigns" | "crm" | "inbox" | "research" | "knowledge";
  objective: string;
  inputs?: Record<string, any>;
  priority?: "low" | "normal" | "high";
  requiresApproval?: boolean;
  flowId?: string;
  stepId?: string;
  attempt?: number;
  maxActions?: number;
  actionsUsed?: number;
  hardStopBehavior?: "summarize" | "ask_approval" | "abort";
}

export interface TaskRecord {
  id: string;
  company_id: string;
  parent_session_id: string;
  child_session_id: string | null;
  agent_type: string;
  objective: string;
  inputs: Record<string, any> | null;
  priority: string;
  status: TaskStatus;
  progress: number;
  current_step: string | null;
  result: Record<string, any> | null;
  error_message: string | null;
  requires_approval: boolean;
  approval_status: string | null;
  created_at: string;
  updated_at: string;
  flow_id?: string | null;
  step_id?: string | null;
  attempt?: number | null;
  max_actions?: number | null;
  actions_used?: number | null;
  hard_stop_behavior?: string | null;
  worker_heartbeat_at?: string | null;
  dead_lettered_at?: string | null;
}

async function ensureTaskTables() {
  try {
    const admin = getAdmin();
    await admin.rpc("create_agent_tasks_tables_if_needed", {});
  } catch {
    // Best-effort; real schema is migration-managed.
  }
}

async function createChildSession(input: CreateTaskInput): Promise<string | null> {
  const admin = getAdmin();
  const { data, error } = await admin
    .from("chat_sessions")
    .insert({
      company_id: input.companyId,
      session_type: "isolated",
      parent_session_id: input.parentSessionId,
      is_background: true,
      status: "active",
      title: `[Task] ${input.objective.slice(0, 80)}`,
      context_scope: {
        access: "task",
        domains: [input.agentType],
      },
    })
    .select("id")
    .single();
  if (error) return null;
  return data?.id || null;
}

export async function createTask(input: CreateTaskInput): Promise<TaskRecord> {
  await ensureTaskTables();
  const admin = getAdmin();
  const childSessionId = await createChildSession(input);

  const { data, error } = await admin
    .from("agent_tasks")
    .insert({
      company_id: input.companyId,
      parent_session_id: input.parentSessionId,
      child_session_id: childSessionId,
      agent_type: input.agentType,
      objective: input.objective,
      inputs: input.inputs || {},
      priority: input.priority || "normal",
      status: input.requiresApproval ? "blocked" : "queued",
      progress: 0,
      current_step: input.requiresApproval ? "Waiting for approval" : "Queued",
      requires_approval: Boolean(input.requiresApproval),
      approval_status: input.requiresApproval ? "pending" : null,
      flow_id: input.flowId || null,
      step_id: input.stepId || null,
      attempt:
        typeof input.attempt === "number" && Number.isFinite(input.attempt)
          ? Math.max(1, Math.trunc(input.attempt))
          : 1,
      max_actions:
        typeof input.maxActions === "number" && Number.isFinite(input.maxActions)
          ? Math.max(1, Math.trunc(input.maxActions))
          : null,
      actions_used:
        typeof input.actionsUsed === "number" && Number.isFinite(input.actionsUsed)
          ? Math.max(0, Math.trunc(input.actionsUsed))
          : 0,
      hard_stop_behavior: input.hardStopBehavior || null,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Failed to create task");
  }

  await appendTaskStep(data.id, {
    type: "task.created",
    status: data.status,
    message: data.current_step || "Task created",
  });

  return data as TaskRecord;
}

export async function appendTaskStep(
  taskId: string,
  input: {
    type: string;
    status: TaskStatus;
    message: string;
    data?: Record<string, any>;
  }
) {
  await ensureTaskTables();
  const admin = getAdmin();
  await admin.from("agent_task_steps").insert({
    task_id: taskId,
    event_type: input.type,
    status: input.status,
    message: input.message,
    data: input.data || {},
  });
}

export async function updateTask(
  taskId: string,
  input: {
    status?: TaskStatus;
    progress?: number;
    currentStep?: string | null;
    result?: Record<string, any> | null;
    errorMessage?: string | null;
    approvalStatus?: "pending" | "approved" | "rejected" | null;
    flowId?: string | null;
    stepId?: string | null;
    attempt?: number;
    maxActions?: number | null;
    actionsUsed?: number | null;
    hardStopBehavior?: "summarize" | "ask_approval" | "abort" | null;
    workerHeartbeatAt?: string | null;
    deadLetteredAt?: string | null;
  }
) {
  await ensureTaskTables();
  const admin = getAdmin();
  const patch: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };
  if (input.status) patch.status = input.status;
  if (typeof input.progress === "number") patch.progress = input.progress;
  if (input.currentStep !== undefined) patch.current_step = input.currentStep;
  if (input.result !== undefined) patch.result = input.result;
  if (input.errorMessage !== undefined) patch.error_message = input.errorMessage;
  if (input.approvalStatus !== undefined) patch.approval_status = input.approvalStatus;
  if (input.flowId !== undefined) patch.flow_id = input.flowId;
  if (input.stepId !== undefined) patch.step_id = input.stepId;
  if (typeof input.attempt === "number" && Number.isFinite(input.attempt)) {
    patch.attempt = Math.max(1, Math.trunc(input.attempt));
  }
  if (input.maxActions !== undefined) patch.max_actions = input.maxActions;
  if (input.actionsUsed !== undefined) patch.actions_used = input.actionsUsed;
  if (input.hardStopBehavior !== undefined) patch.hard_stop_behavior = input.hardStopBehavior;
  if (input.workerHeartbeatAt !== undefined) patch.worker_heartbeat_at = input.workerHeartbeatAt;
  if (input.deadLetteredAt !== undefined) patch.dead_lettered_at = input.deadLetteredAt;

  const { data, error } = await admin
    .from("agent_tasks")
    .update(patch)
    .eq("id", taskId)
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(error?.message || "Failed to update task");
  }
  return data as TaskRecord;
}

export async function getTask(taskId: string): Promise<TaskRecord | null> {
  await ensureTaskTables();
  const admin = getAdmin();
  const { data } = await admin.from("agent_tasks").select("*").eq("id", taskId).maybeSingle();
  return (data as TaskRecord | null) || null;
}

export async function listSessionTasks(sessionId: string): Promise<TaskRecord[]> {
  await ensureTaskTables();
  const admin = getAdmin();
  const { data } = await admin
    .from("agent_tasks")
    .select("*")
    .eq("parent_session_id", sessionId)
    .order("created_at", { ascending: false });
  return (data as TaskRecord[]) || [];
}

export async function getTaskEvents(taskId: string) {
  await ensureTaskTables();
  const admin = getAdmin();
  const { data } = await admin
    .from("agent_task_steps")
    .select("*")
    .eq("task_id", taskId)
    .order("created_at", { ascending: true });
  return data || [];
}

export async function cancelTask(taskId: string) {
  const current = await getTask(taskId);
  if (!current) throw new Error("Task not found");
  if (current.status === "completed" || current.status === "cancelled") return current;
  const updated = await updateTask(taskId, {
    status: "cancelled",
    currentStep: "Cancelled by user",
  });
  await appendTaskStep(taskId, {
    type: "task.cancelled",
    status: "cancelled",
    message: "Cancelled by user",
  });
  return updated;
}

export async function resolveTaskApproval(taskId: string, decision: "approved" | "rejected") {
  const current = await getTask(taskId);
  if (!current) throw new Error("Task not found");
  if (!current.requires_approval) return current;
  const status: TaskStatus = decision === "approved" ? "queued" : "cancelled";
  const currentStep =
    decision === "approved" ? "Approved by user, queued" : "Rejected by user";
  const updated = await updateTask(taskId, {
    status,
    approvalStatus: decision,
    currentStep,
  });
  await appendTaskStep(taskId, {
    type: "approval.resolved",
    status,
    message: currentStep,
    data: { decision },
  });
  return updated;
}

export async function claimQueuedTaskForWorker(params: {
  taskId: string;
  workerId: string;
}): Promise<TaskRecord | null> {
  const task = await getTask(params.taskId);
  if (!task) return null;
  if (task.status !== "queued") return null;

  const updated = await updateTask(params.taskId, {
    status: "running",
    currentStep: `Worker ${params.workerId} claimed task`,
    workerHeartbeatAt: new Date().toISOString(),
  });
  await appendTaskStep(params.taskId, {
    type: "task.claimed",
    status: "running",
    message: `Claimed by worker ${params.workerId}`,
    data: { workerId: params.workerId },
  });
  return updated;
}

export async function markTaskDeadLetter(params: {
  taskId: string;
  reason: string;
}) {
  const now = new Date().toISOString();
  const updated = await updateTask(params.taskId, {
    status: "failed",
    currentStep: "Dead-lettered",
    errorMessage: params.reason,
    deadLetteredAt: now,
  });
  await appendTaskStep(params.taskId, {
    type: "task.dead_lettered",
    status: "failed",
    message: params.reason,
    data: { deadLetteredAt: now },
  });
  return updated;
}

export async function listQueuedTasksByCompany(companyId: string): Promise<TaskRecord[]> {
  await ensureTaskTables();
  const admin = getAdmin();
  const { data } = await admin
    .from("agent_tasks")
    .select("*")
    .eq("company_id", companyId)
    .eq("status", "queued")
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(25);
  return (data as TaskRecord[]) || [];
}

export async function listRunningTasksByCompany(companyId: string): Promise<TaskRecord[]> {
  await ensureTaskTables();
  const admin = getAdmin();
  const { data } = await admin
    .from("agent_tasks")
    .select("*")
    .eq("company_id", companyId)
    .eq("status", "running")
    .order("updated_at", { ascending: true })
    .limit(25);
  return (data as TaskRecord[]) || [];
}

export async function retryTask(taskId: string) {
  const current = await getTask(taskId);
  if (!current) throw new Error("Task not found");
  if (current.status !== "failed" && current.status !== "cancelled") {
    throw new Error("Only failed or cancelled tasks can be retried");
  }
  const updated = await updateTask(taskId, {
    status: "queued",
    progress: 0,
    currentStep: "Queued for retry",
    errorMessage: null,
  });
  await appendTaskStep(taskId, {
    type: "task.retried",
    status: "queued",
    message: "Task queued for retry",
  });
  return updated;
}
