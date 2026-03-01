import { createClient } from "@supabase/supabase-js";
import { chatSend } from "@/lib/openclaw-client";
import { buildAgentSystemPrompt } from "@/lib/chat/system-prompts";
import {
  createTask,
  appendTaskStep,
  claimQueuedTaskForWorker,
  getTask,
  listQueuedTasksByCompany,
  listRunningTasksByCompany,
  markTaskDeadLetter,
  type TaskRecord,
  updateTask,
} from "@/lib/chat/task-runner";
import { parseAgentDirectives, getDirectivePromptInstructions } from "@/lib/chat/agent-protocol";
import { executeGatewayTool, getAllowedTools, type AgentType } from "@/lib/chat/tool-gateway";
import { getPresetFlowPromptInstructions } from "@/lib/chat/preset-flows";

const QUEUED_STALE_MS = 1000 * 60 * 10;
const RUNNING_STALE_MS = 1000 * 60 * 5;
const MAX_AUTONOMOUS_DEPTH = 2;
const MAX_HISTORY_MESSAGES = 20;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let adminClient: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!adminClient) adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

export type TaskHealthState = "ok" | "stalled" | "dead-letter";

export function getTaskHealth(task: TaskRecord): {
  state: TaskHealthState;
  reason?: string;
} {
  if (task.dead_lettered_at) {
    return { state: "dead-letter", reason: "Task was moved to dead-letter state" };
  }
  if (task.status === "failed" && task.current_step === "Dead-lettered") {
    return { state: "dead-letter", reason: task.error_message || "Dead-lettered" };
  }

  const now = Date.now();
  const createdAt = new Date(task.created_at).getTime();
  const heartbeatAt = task.worker_heartbeat_at
    ? new Date(task.worker_heartbeat_at).getTime()
    : null;

  if (task.status === "queued" && now - createdAt > QUEUED_STALE_MS) {
    return { state: "stalled", reason: "Queued too long without worker pickup" };
  }
  if (task.status === "running") {
    if (!heartbeatAt || now - heartbeatAt > RUNNING_STALE_MS) {
      return { state: "stalled", reason: "Worker heartbeat missing or stale" };
    }
  }

  return { state: "ok" };
}

interface RunTaskWorkerOptions {
  taskId: string;
  workerId?: string;
  emitSse?: (event: Record<string, any>) => void;
  depth?: number;
}

function clampInt(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.trunc(value));
}

async function emitProgress(
  taskId: string,
  progress: number,
  step: string,
  emitSse?: (event: Record<string, any>) => void
) {
  await updateTask(taskId, {
    status: "running",
    progress,
    currentStep: step,
    workerHeartbeatAt: new Date().toISOString(),
  });
  await appendTaskStep(taskId, {
    type: "task.progress",
    status: "running",
    message: step,
    data: { progress },
  });
  emitSse?.({
    type: "task.progress",
    taskId,
    progress,
    step,
  });
  emitSse?.({
    type: "task.heartbeat",
    taskId,
    at: new Date().toISOString(),
  });
}

function toAgentType(value: string | null | undefined): AgentType {
  const normalized = String(value || "main").toLowerCase();
  if (
    normalized === "campaigns" ||
    normalized === "crm" ||
    normalized === "inbox" ||
    normalized === "research" ||
    normalized === "knowledge"
  ) {
    return normalized as AgentType;
  }
  return "main";
}

function buildDelegatedTaskPrompt(task: TaskRecord): string {
  const inputText = task.inputs ? JSON.stringify(task.inputs, null, 2).slice(0, 5000) : "{}";
  return [
    "You are executing an autonomous delegated sub-agent task.",
    `Objective: ${task.objective}`,
    `Inputs:\n${inputText}`,
    "",
    "Complete the objective with high signal and explicit tool usage when needed.",
    "Use structured directives for tools/tasks when appropriate.",
  ].join("\n");
}

async function saveTaskSessionMessage(params: {
  sessionId: string | null;
  role: "user" | "assistant";
  content: string;
  toolCalls?: any;
}) {
  if (!params.sessionId) return;
  const admin = getAdmin();
  try {
    await admin.from("chat_messages").insert({
      session_id: params.sessionId,
      role: params.role,
      content: params.content,
      tool_calls: params.toolCalls || null,
    });
  } catch {
    // Non-blocking persistence for worker traces.
  }
}

async function resolveExecutionContext(task: TaskRecord) {
  const admin = getAdmin();
  const agentType = toAgentType(task.agent_type);

  const [{ data: company }, { data: taskSession }, { data: agents }] = await Promise.all([
    admin
      .from("companies")
      .select("id, slug, container_url, container_status, name")
      .eq("id", task.company_id)
      .single(),
    task.child_session_id
      ? admin
          .from("chat_sessions")
          .select("id, session_type, component_context, openclaw_session_key")
          .eq("id", task.child_session_id)
          .maybeSingle()
      : Promise.resolve({ data: null as any }),
    admin
      .from("company_agents")
      .select("agent_id, agent_type, status")
      .eq("company_id", task.company_id)
      .eq("status", "active"),
  ]);

  if (!company?.container_url || company.container_status !== "running") {
    throw new Error("Company container is not running for delegated execution");
  }

  const matchingAgent =
    (agents || []).find((a: any) => String(a.agent_type).toLowerCase() === agentType) ||
    (agents || []).find((a: any) => String(a.agent_type).toLowerCase() === "main");
  if (!matchingAgent?.agent_id) {
    throw new Error(`No active company agent found for task agent type '${agentType}'`);
  }

  const historySessionId = task.child_session_id || task.parent_session_id;
  const { data: historyRows } = await admin
    .from("chat_messages")
    .select("role, content")
    .eq("session_id", historySessionId)
    .order("created_at", { ascending: true })
    .limit(MAX_HISTORY_MESSAGES);

  const history = (historyRows || []).map((m: any) => ({
    role: m.role,
    content: String(m.content || ""),
  }));

  const agentDescriptor = {
    agent_name: `${agentType} delegated subagent`,
    agent_type: agentType,
    company_name: company.name,
    available_tools: getAllowedTools(agentType),
  };
  const agentPrompt = await buildAgentSystemPrompt({
    agent: agentDescriptor,
    session: taskSession || { session_type: "isolated" },
    componentContext: taskSession?.component_context || null,
    company: company ? { id: company.id, name: company.name, slug: company.slug } : null,
  });
  const systemPrompt = [
    agentPrompt,
    getDirectivePromptInstructions(),
    getPresetFlowPromptInstructions(),
  ].join("\n\n");

  const sessionKey =
    taskSession?.openclaw_session_key ||
    `task:${task.company_id}:${task.id}:${task.child_session_id || task.parent_session_id}`;

  return {
    companySlug: company.slug || "company",
    containerUrl: company.container_url,
    gatewayToken: task.company_id,
    agentId: matchingAgent.agent_id,
    sessionKey,
    history,
    systemPrompt,
    agentType,
  };
}

function buildBudgetStopMessage(
  hardStopBehavior: string | null | undefined,
  flowId: string | null | undefined
) {
  const flowText = flowId ? ` for ${flowId}` : "";
  if (hardStopBehavior === "ask_approval") {
    return `Action budget reached${flowText}. Waiting for explicit approval to continue.`;
  }
  if (hardStopBehavior === "abort") {
    return `Action budget reached${flowText}. Execution aborted by policy.`;
  }
  return `Action budget reached${flowText}. Returning summarized result.`;
}

export async function runTaskWorkerForTask(
  options: RunTaskWorkerOptions
): Promise<{ started: boolean; task?: TaskRecord; reason?: string }> {
  const depth = options.depth || 0;
  if (depth > MAX_AUTONOMOUS_DEPTH) {
    return {
      started: false,
      reason: `Max autonomous depth reached (${MAX_AUTONOMOUS_DEPTH})`,
    };
  }

  const workerId = options.workerId || `worker-${Date.now()}`;
  const claimed = await claimQueuedTaskForWorker({
    taskId: options.taskId,
    workerId,
  });

  if (!claimed) {
    return { started: false, reason: "Task not queued or not found" };
  }

  await emitProgress(claimed.id, 10, "Worker claimed task", options.emitSse);
  await emitProgress(claimed.id, 20, "Resolving execution context", options.emitSse);

  let context: Awaited<ReturnType<typeof resolveExecutionContext>>;
  try {
    context = await resolveExecutionContext(claimed);
  } catch (error: any) {
    const reason = error?.message || "Failed to resolve task execution context";
    const failed = await updateTask(claimed.id, {
      status: "failed",
      currentStep: "Context resolution failed",
      errorMessage: reason,
      workerHeartbeatAt: new Date().toISOString(),
    });
    await appendTaskStep(claimed.id, {
      type: "task.failed",
      status: "failed",
      message: reason,
      data: { phase: "resolve_context" },
    });
    options.emitSse?.({ type: "task.failed", taskId: claimed.id, reason });
    return { started: true, task: failed, reason };
  }

  await emitProgress(claimed.id, 35, "Dispatching delegated objective to OpenClaw", options.emitSse);

  const delegatedPrompt = buildDelegatedTaskPrompt(claimed);
  await saveTaskSessionMessage({
    sessionId: claimed.child_session_id,
    role: "user",
    content: delegatedPrompt,
  });

  let llmResponse = "";
  try {
    const response = await chatSend({
      containerUrl: context.containerUrl,
      token: context.gatewayToken,
      message: delegatedPrompt,
      agentId: context.agentId,
      sessionKey: context.sessionKey,
      history: context.history,
      systemPrompt: context.systemPrompt,
    });
    llmResponse = response.response || "";
  } catch (error: any) {
    const reason = error?.message || "OpenClaw delegated execution failed";
    const failed = await updateTask(claimed.id, {
      status: "failed",
      currentStep: "Delegated agent execution failed",
      errorMessage: reason,
      workerHeartbeatAt: new Date().toISOString(),
    });
    await appendTaskStep(claimed.id, {
      type: "task.failed",
      status: "failed",
      message: reason,
      data: { phase: "chat_send" },
    });
    options.emitSse?.({ type: "task.failed", taskId: claimed.id, reason });
    return { started: true, task: failed, reason };
  }

  await emitProgress(claimed.id, 50, "Executing delegated directives", options.emitSse);

  const maxActions =
    typeof claimed.max_actions === "number" && Number.isFinite(claimed.max_actions)
      ? Math.max(1, Math.trunc(claimed.max_actions))
      : null;
  let nextActionsUsed = clampInt(claimed.actions_used, 0);

  const parsed = parseAgentDirectives(llmResponse);
  const executedToolCalls: any[] = [];
  const delegatedTaskIds: string[] = [];

  for (const directive of parsed.directives) {
    nextActionsUsed += 1;
    const overBudget = maxActions !== null && nextActionsUsed > maxActions;
    if (overBudget) break;

    if (directive.kind === "tool") {
      const toolResult = await executeGatewayTool(directive.tool, directive.params, {
        companyId: claimed.company_id,
        companySlug: context.companySlug,
        sessionKey: context.sessionKey,
        sessionId: claimed.child_session_id || claimed.parent_session_id,
        agentType: context.agentType,
      });
      executedToolCalls.push({
        name: directive.tool,
        action: "execute",
        status: toolResult.ok ? "complete" : "error",
        result: toolResult.ok
          ? JSON.stringify(toolResult.data || {})
          : String(toolResult.error || "Tool failed"),
        flowId: directive.flowId || claimed.flow_id || null,
        stepId: directive.stepId || claimed.step_id || null,
        attempt: directive.attempt || claimed.attempt || 1,
      });
      await appendTaskStep(claimed.id, {
        type: toolResult.ok ? "tool.succeeded" : "tool.failed",
        status: "running",
        message: `${directive.tool} ${toolResult.ok ? "succeeded" : "failed"}`,
        data: {
          tool: directive.tool,
          ok: toolResult.ok,
          error: toolResult.error,
        },
      });
      await emitProgress(
        claimed.id,
        Math.min(85, 50 + nextActionsUsed * 10),
        `Executed tool: ${directive.tool}`,
        options.emitSse
      );
      continue;
    }

    const parentSessionId = claimed.child_session_id || claimed.parent_session_id;
    const delegated = await createTask({
      companyId: claimed.company_id,
      parentSessionId,
      agentType: directive.agentType,
      objective: directive.objective,
      inputs: directive.inputs,
      priority: directive.priority,
      requiresApproval: directive.requiresApproval,
      flowId: directive.flowId || claimed.flow_id || undefined,
      stepId: directive.stepId || undefined,
      attempt:
        typeof directive.attempt === "number"
          ? Math.max(1, directive.attempt)
          : (claimed.attempt || 1) + 1,
      maxActions: claimed.max_actions || undefined,
      actionsUsed: nextActionsUsed,
      hardStopBehavior:
        (claimed.hard_stop_behavior as "summarize" | "ask_approval" | "abort" | null) || undefined,
    });
    delegatedTaskIds.push(delegated.id);
    await appendTaskStep(claimed.id, {
      type: "task.delegated",
      status: "running",
      message: `Delegated nested task ${delegated.id}`,
      data: { delegatedTaskId: delegated.id, agentType: delegated.agent_type },
    });
    options.emitSse?.({
      type: "task.created",
      task: {
        id: delegated.id,
        agentType: delegated.agent_type,
        objective: delegated.objective,
        status: delegated.status,
      },
    });

    if (!delegated.requires_approval) {
      await runTaskWorkerForTask({
        taskId: delegated.id,
        workerId,
        depth: depth + 1,
      });
    } else {
      options.emitSse?.({
        type: "approval.requested",
        taskId: delegated.id,
        objective: delegated.objective,
      });
    }
  }

  const overBudget = maxActions !== null && nextActionsUsed > maxActions;

  if (overBudget) {
    const reason = buildBudgetStopMessage(claimed.hard_stop_behavior, claimed.flow_id);
    const behavior = claimed.hard_stop_behavior || "summarize";

    if (behavior === "abort") {
      const failed = await updateTask(claimed.id, {
        status: "failed",
        progress: claimed.progress,
        currentStep: "Aborted by action budget policy",
        errorMessage: reason,
        actionsUsed: nextActionsUsed,
        workerHeartbeatAt: new Date().toISOString(),
      });
      await appendTaskStep(claimed.id, {
        type: "task.failed",
        status: "failed",
        message: reason,
        data: { reason: "action_budget_exceeded" },
      });
      options.emitSse?.({
        type: "task.failed",
        taskId: claimed.id,
        result: { summary: reason },
      });
      return { started: true, task: failed };
    }

    if (behavior === "ask_approval") {
      const blocked = await updateTask(claimed.id, {
        status: "blocked",
        approvalStatus: "pending",
        currentStep: "Budget reached, waiting for approval",
        result: {
          summary: reason,
          partialResponse: parsed.cleanContent || llmResponse,
          executedTools: executedToolCalls,
          delegatedTaskIds,
        },
        actionsUsed: nextActionsUsed,
        workerHeartbeatAt: new Date().toISOString(),
      });
      await appendTaskStep(claimed.id, {
        type: "approval.requested",
        status: "blocked",
        message: reason,
        data: { reason: "action_budget_exceeded" },
      });
      options.emitSse?.({
        type: "approval.requested",
        taskId: claimed.id,
        objective: claimed.objective,
        reason: "action_budget_exceeded",
      });
      return { started: true, task: blocked };
    }

    const completed = await updateTask(claimed.id, {
      status: "completed",
      progress: 100,
      currentStep: "Completed with budget summary",
      actionsUsed: nextActionsUsed,
      workerHeartbeatAt: new Date().toISOString(),
      result: {
        summary: reason,
        objective: claimed.objective,
        agentType: claimed.agent_type,
        response: parsed.cleanContent || llmResponse,
        executedTools: executedToolCalls,
        delegatedTaskIds,
      },
    });
    await appendTaskStep(claimed.id, {
      type: "task.completed",
      status: "completed",
      message: "Completed with budget summary",
      data: { reason: "action_budget_exceeded" },
    });
    options.emitSse?.({
      type: "task.completed",
      taskId: claimed.id,
      progress: 100,
      result: completed.result || { summary: reason },
    });
    return { started: true, task: completed };
  }

  const resultSummary = {
    summary: "Delegated objective executed autonomously by task worker.",
    objective: claimed.objective,
    agentType: claimed.agent_type,
    inputs: claimed.inputs || {},
    response: parsed.cleanContent || llmResponse,
    executedTools: executedToolCalls,
    delegatedTaskIds,
    flowId: claimed.flow_id || null,
    stepId: claimed.step_id || null,
    attempt: claimed.attempt || 1,
  };

  await saveTaskSessionMessage({
    sessionId: claimed.child_session_id,
    role: "assistant",
    content: parsed.cleanContent || llmResponse || "Task completed.",
    toolCalls: executedToolCalls.length > 0 ? executedToolCalls : undefined,
  });

  await emitProgress(claimed.id, 95, "Finalizing autonomous task result", options.emitSse);

  const completed = await updateTask(claimed.id, {
    status: "completed",
    progress: 100,
    currentStep: "Completed",
    result: resultSummary,
    actionsUsed: nextActionsUsed,
    workerHeartbeatAt: new Date().toISOString(),
  });
  await appendTaskStep(claimed.id, {
    type: "task.completed",
    status: "completed",
    message: "Task completed by worker",
    data: { workerId },
  });
  options.emitSse?.({
    type: "task.completed",
    taskId: claimed.id,
    progress: 100,
    result: resultSummary,
  });

  return { started: true, task: completed };
}

export async function sweepTaskHealthForCompany(companyId: string) {
  const now = Date.now();
  const updates: Array<{ taskId: string; reason: string }> = [];

  const [queued, running] = await Promise.all([
    listQueuedTasksByCompany(companyId),
    listRunningTasksByCompany(companyId),
  ]);

  for (const task of queued) {
    if (now - new Date(task.created_at).getTime() > QUEUED_STALE_MS) {
      updates.push({
        taskId: task.id,
        reason: "Task queued too long without worker pickup",
      });
    }
  }

  for (const task of running) {
    const heartbeatAt = task.worker_heartbeat_at
      ? new Date(task.worker_heartbeat_at).getTime()
      : 0;
    if (!heartbeatAt || now - heartbeatAt > RUNNING_STALE_MS) {
      updates.push({
        taskId: task.id,
        reason: "Task heartbeat stale; moved to dead-letter",
      });
    }
  }

  for (const update of updates) {
    const latest = await getTask(update.taskId);
    if (!latest || latest.status === "completed" || latest.status === "cancelled") continue;
    await markTaskDeadLetter({
      taskId: update.taskId,
      reason: update.reason,
    });
  }

  return { checked: queued.length + running.length, deadLettered: updates.length };
}

