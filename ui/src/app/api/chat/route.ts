import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { envConfig } from "@/lib/env";
import { authenticateUser, requireCompanyAccess, verifyCompanyAccess } from "@/lib/api-auth";
import { createRateLimiter, rateLimitKey, rateLimitResponse } from "@/lib/rate-limit";
import { chatSend, chatSendStream } from "@/lib/openclaw-client";
import { knowledgeToolDefinitions } from "@/lib/knowledge/knowledge-tools";
import { getKnowledgeAgentSystemPrompt } from "@/lib/knowledge/agent-prompts";
import { compactChatSession } from "@/lib/chat/compaction";
import { buildAgentSystemPrompt } from "@/lib/chat/system-prompts";
import {
  projectContainerTag as buildProjectContainerTag,
  companyContainerTag,
} from "@/lib/supermemory-client";
import { parseAgentDirectives, getDirectivePromptInstructions } from "@/lib/chat/agent-protocol";
import { executeGatewayTool, type AgentType } from "@/lib/chat/tool-gateway";
import { createTask, updateTask, appendTaskStep } from "@/lib/chat/task-runner";
import { getChatFeatureFlags } from "@/lib/chat/feature-flags";
import { getPresetFlowContract, getPresetFlowPromptInstructions } from "@/lib/chat/preset-flows";
import { runTaskWorkerForTask, sweepTaskHealthForCompany } from "@/lib/chat/task-worker";
import { toFlowTelemetrySummary } from "@/lib/chat/flow-observability";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let adminClient: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!adminClient) adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

const limiter = createRateLimiter({ limit: 30, window: 60 });
const SUPERMEMORY_BASE = "https://api.supermemory.ai/v3";
const MAX_REFERENCED_DOCS = 5;
const MAX_REFERENCED_DOC_PREVIEW_CHARS = 1200;

/**
 * POST /api/chat
 * 
 * Multi-tenant chat with:
 * - SSE streaming (OpenAI-compatible)
 * - Agent routing by company + session type
 * - Supermemory integration
 * - Tool execution
 * - Isolated contexts (main, campaigns, crm, inbox)
 * 
 * Request Body:
 * {
 *   message: string,
 *   sessionId?: string,      // Optional: continue existing session
 *   companyId: string,       // Required: for agent routing
 *   sessionType?: string,    // 'main' | 'campaigns' | 'crm' | 'inbox'
 *   componentContext?: {     // Optional: current component state
 *     component: string,
 *     data: any,
 *     filters: any
 *   },
 *   stream?: boolean         // Enable SSE streaming (default: true)
 * }
 */
export async function POST(req: NextRequest) {
  const rl = limiter.check(rateLimitKey(req));
  if (!rl.allowed) return rateLimitResponse(rl.resetIn);

  const auth = await authenticateUser();
  if (!auth) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  const body = await req.json();
  const {
    message,
    sessionId,
    companyId,
    sessionType = "main",
    componentContext,
    stream = true  // Default to streaming
  } = body;

  if (!message || !companyId) {
    return Response.json(
      { error: "Message and companyId are required" },
      { status: 400 }
    );
  }

  const accessResult = await requireCompanyAccess(companyId);
  if (accessResult.error) {
    return accessResult.error;
  }

  const admin = getAdmin();

  try {
    // 1. Get or create chat session
    const session = await getOrCreateSession({
      admin,
      sessionId,
      companyId,
      userId: auth.userId,
      sessionType,
      componentContext,
      message
    });

    // 2. Get company details for container URL
    const { data: company } = await admin
      .from("companies")
      .select("container_url, container_status, name, slug, integration_credentials")
      .eq("id", companyId)
      .single();

    if (!company || company.container_status !== "running" || !company.container_url) {
      return Response.json({
        error: "Agent container is not running. Please provision it first.",
        code: "CONTAINER_NOT_RUNNING"
      }, { status: 400 });
    }

    // 3. Get company agent for this session type
    const agent = await getCompanyAgent({
      admin,
      companyId,
      sessionType
    });

    if (!agent) {
      // Auto-provision main agent if missing
      if (sessionType === 'main') {
        return Response.json({
          error: "Agent not provisioned",
          code: "AGENT_NOT_PROVISIONED",
          provisionUrl: `/api/companies/${companyId}/agents/provision`
        }, { status: 400 });
      }
      return Response.json({
        error: `No ${sessionType} agent found for this company`,
        code: "AGENT_NOT_FOUND"
      }, { status: 404 });
    }

    // 3. Save user message to database
    await saveMessage({
      admin,
      sessionId: session.id,
      role: "user",
      content: message
    });

    // 4. Get conversation history
    const history = await getConversationHistory(admin, session.id);

    // 5. Build system prompt with context
    const systemPrompt = await buildSystemPrompt({
      agent,
      session,
      componentContext,
      company: { id: companyId, name: company.name, slug: company.slug },
      supermemoryApiKey:
        (company as any)?.integration_credentials?.supermemory_api_key ||
        envConfig.supermemory.apiKey(),
    });

    // 6. Route to OpenClaw via SSH-tunneled WebSocket RPC
    // The gateway token is set to companyId in the container's env vars
    const containerUrl = company.container_url;
    const gatewayToken = companyId;

    if (stream) {
      const streamResponse = await streamChatCompletion({
        agentId: agent.agent_id,
        systemPrompt,
        history,
        message,
        admin,
        sessionId: session.id,
        openclawSessionKey:
          session.openclaw_session_key || `company-${companyId}-${session.id}`,
        companyId,
        companySlug: company.slug,
        supermemoryApiKey:
          (company as any)?.integration_credentials?.supermemory_api_key || envConfig.supermemory.apiKey(),
        containerUrl,
        gatewayToken,
        agentType: (sessionType as AgentType),
      });

      return new Response(streamResponse, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive"
        }
      });
    } else {
      // Non-streaming (fallback)
      const response = await blockingChatCompletion({
        agentId: agent.agent_id,
        systemPrompt,
        history,
        message,
        admin,
        sessionId: session.id,
        openclawSessionKey:
          session.openclaw_session_key || `company-${companyId}-${session.id}`,
        companyId,
        companySlug: company.slug,
        supermemoryApiKey:
          (company as any)?.integration_credentials?.supermemory_api_key || envConfig.supermemory.apiKey(),
        containerUrl,
        gatewayToken,
        agentType: (sessionType as AgentType),
      });

      return Response.json(response);
    }

  } catch (error: any) {
    console.error("[Chat API] Error:", error);
    return Response.json(
      { error: error.message || "Chat failed", fallback: true },
      { status: 500 }
    );
  }
}

/**
 * Get or create chat session
 */
async function getOrCreateSession({
  admin,
  sessionId,
  companyId,
  userId,
  sessionType,
  componentContext,
  message
}: {
  admin: any;
  sessionId?: string;
  companyId: string;
  userId: string;
  sessionType: string;
  componentContext?: any;
  message: string;
}) {
  const { data: companyRow } = await admin
    .from("companies")
    .select("slug")
    .eq("id", companyId)
    .maybeSingle();
  const companySlug = companyRow?.slug || "company";

  const contextId =
    componentContext?.data?.campaignId ||
    componentContext?.data?.contextId ||
    undefined;
  const deterministicSessionKey = contextId
    ? `company:${companySlug}:${sessionType}:${contextId}`
    : `company:${companySlug}:${sessionType}`;

  // Try to find existing session
  if (sessionId) {
    const { data: existing } = await admin
      .from("chat_sessions")
      .select("*")
      .eq("id", sessionId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (existing) {
      // Enforce per-user session ownership when present.
      if (existing.user_id && existing.user_id !== userId) {
        throw new Error("You do not have access to this chat session");
      }
      // Update component context if provided
      if (componentContext) {
        await admin
          .from("chat_sessions")
          .update({
            component_context: componentContext,
            openclaw_session_key: deterministicSessionKey,
          })
          .eq("id", sessionId);
      }
      return {
        ...existing,
        openclaw_session_key:
          existing.openclaw_session_key || deterministicSessionKey,
      };
    }
  }

  // Create new session
  const title = message.slice(0, 80).replace(/\n/g, " ") + "...";
  
  const { data: session, error } = await admin
    .from("chat_sessions")
    .insert({
      company_id: companyId,
      user_id: userId,
      session_type: sessionType,
      component_context: componentContext || null,
      context_scope: buildContextScope(sessionType),
      title,
      status: "active",
      openclaw_session_key: deterministicSessionKey,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create session: ${error.message}`);
  return {
    ...session,
    openclaw_session_key: session.openclaw_session_key || deterministicSessionKey,
  };
}

/**
 * Get company agent for session type
 */
async function getCompanyAgent({
  admin,
  companyId,
  sessionType
}: {
  admin: any;
  companyId: string;
  sessionType: string;
}) {
  const { data: agent } = await admin
    .from("company_agents")
    .select("*")
    .eq("company_id", companyId)
    .eq("agent_type", sessionType)
    .eq("status", "active")
    .single();

  return agent;
}

/**
 * Save message to database
 */
async function saveMessage({
  admin,
  sessionId,
  role,
  content,
  toolCalls,
  reasoningContent,
  reasoningDuration,
  toolSteps,
  contentParts,
  tokensUsed,
  model
}: {
  admin: any;
  sessionId: string;
  role: string;
  content: string;
  toolCalls?: any;
  reasoningContent?: string;
  reasoningDuration?: number;
  toolSteps?: any;
  contentParts?: any;
  tokensUsed?: number;
  model?: string;
}) {
  const { error } = await admin
    .from("chat_messages")
    .insert({
      session_id: sessionId,
      role,
      content,
      tool_calls: toolCalls || null,
      reasoning_content: reasoningContent || null,
      reasoning_duration: reasoningDuration || null,
      tool_steps: toolSteps || null,
      content_parts: contentParts || null,
      tokens_used: tokensUsed || null,
      model: model || null
    });

  if (error) {
    console.error("[Chat API] Failed to save message:", error);
  }
}

/**
 * Get conversation history
 */
async function getConversationHistory(admin: any, sessionId: string, limit = 20) {
  const { data: messages } = await admin
    .from("chat_messages")
    .select("role, content, tool_calls")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(limit);

  // Return in chronological order
  return (messages || []).reverse().map((m: any) => ({
    role: m.role,
    content: m.content,
    tool_calls: m.tool_calls
  }));
}

/**
 * Build system prompt with context
 */
async function buildSystemPrompt({
  agent,
  session,
  componentContext,
  company,
  supermemoryApiKey,
}: {
  agent: any;
  session: any;
  componentContext?: any;
  company?: { id: string; name: string; slug: string } | null;
  supermemoryApiKey?: string | null;
}) {
  // If this is the knowledge component, use specialized prompt
  if (componentContext?.component === "knowledge") {
    return `${buildKnowledgeSystemPrompt(agent, componentContext)}\n\n${getDirectivePromptInstructions()}\n\n${getPresetFlowPromptInstructions()}`;
  }

  let prompt = await buildAgentSystemPrompt({ agent, session, componentContext, company });
  const sessionType = String(session?.session_type || "main").toLowerCase();

  // Ensure main chat agents always see actionable knowledge tool definitions.
  if (sessionType === "main" || sessionType === "knowledge") {
    prompt += `\n\n## AVAILABLE KNOWLEDGE TOOLS\n${formatKnowledgeToolDescriptions()}\n\nAfter using a tool, wait for the result before confirming to the user.`;
  }

  // Inject explicit vault references selected in the chat composer.
  const referencedDocs = normalizeVaultReferences(componentContext);
  if (referencedDocs.length > 0 && company) {
    const referenceContext = await buildVaultReferenceContext({
      companySlug: company.slug,
      references: referencedDocs,
      supermemoryApiKey: supermemoryApiKey || null,
    });
    if (referenceContext) {
      prompt += `\n\n## REFERENCED VAULT DOCUMENTS\n${referenceContext}`;
    }
  }

  return `${prompt}\n\n${getDirectivePromptInstructions()}\n\n${getPresetFlowPromptInstructions()}`;
}

/**
 * Build specialized system prompt for knowledge base
 */
function buildKnowledgeSystemPrompt(agent: any, componentContext: any) {
  const data = componentContext.data || {};
  
  const prompt = getKnowledgeAgentSystemPrompt({
    folder: data.folder,
    documentId: data.documentId,
    documentTitle: data.title,
    documentContent: data.contentPreview,
    companyName: agent.company_name,
  });

  const toolDescriptions = formatKnowledgeToolDescriptions();
  return `${prompt}\n\n## AVAILABLE TOOLS\n${toolDescriptions}\n\nAfter using a tool, wait for the result before confirming to the user.`;
}

function formatKnowledgeToolDescriptions(): string {
  return knowledgeToolDefinitions
    .map((tool) => {
      const params = Object.entries(tool.parameters?.properties || {})
        .map(([key, value]: [string, any]) => {
          const required = tool.parameters?.required?.includes(key);
          return `- ${key}${required ? " (required)" : ""}: ${value.description}`;
        })
        .join("\n");
      return `${tool.name}\nDescription: ${tool.description}\nParameters:\n${params || "- none"}`;
    })
    .join("\n\n");
}

function normalizeVaultReferences(
  componentContext?: any
): Array<{ id: string; title?: string }> {
  const rawRefs = componentContext?.data?.vaultReferences;
  if (!Array.isArray(rawRefs)) return [];
  return rawRefs
    .map((ref: any) => ({
      id: String(ref?.id || "").trim(),
      title: typeof ref?.title === "string" ? ref.title.trim() : undefined,
    }))
    .filter((ref) => ref.id)
    .slice(0, MAX_REFERENCED_DOCS);
}

function normalizeDocPreview(input: unknown): string {
  return String(input || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_REFERENCED_DOC_PREVIEW_CHARS);
}

async function fetchReferencedVaultDocument(
  apiKey: string,
  id: string
): Promise<{
  id: string;
  title?: string;
  excerpt?: string;
  containerTag?: string;
} | null> {
  try {
    const response = await fetch(`${SUPERMEMORY_BASE}/memories/${encodeURIComponent(id)}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) return null;

    const doc = await response.json();
    const containerTag =
      typeof doc?.containerTag === "string"
        ? doc.containerTag
        : Array.isArray(doc?.containerTags) && typeof doc.containerTags[0] === "string"
          ? doc.containerTags[0]
          : undefined;

    return {
      id: String(doc?.id || id),
      title:
        typeof doc?.metadata?.title === "string"
          ? doc.metadata.title
          : typeof doc?.title === "string"
            ? doc.title
            : undefined,
      excerpt: normalizeDocPreview(doc?.content || doc?.raw || ""),
      containerTag,
    };
  } catch {
    return null;
  }
}

async function buildVaultReferenceContext({
  companySlug,
  references,
  supermemoryApiKey,
}: {
  companySlug: string;
  references: Array<{ id: string; title?: string }>;
  supermemoryApiKey: string | null;
}): Promise<string> {
  const requested = references.slice(0, MAX_REFERENCED_DOCS);
  if (requested.length === 0) return "";

  const companyTagPrefix = `${companyContainerTag(companySlug)}_`;
  const companyTag = companyContainerTag(companySlug);

  if (!supermemoryApiKey) {
    // Fall back to ID/title hints when direct fetch is not available.
    return requested
      .map((ref, idx) => `${idx + 1}. ${ref.title || "Referenced document"} (id: ${ref.id})`)
      .join("\n");
  }

  const fetched = await Promise.all(
    requested.map((ref) => fetchReferencedVaultDocument(supermemoryApiKey, ref.id))
  );

  const lines: string[] = [];
  requested.forEach((reference, index) => {
    const doc = fetched[index];
    const inCompanyScope =
      !doc?.containerTag ||
      doc.containerTag === companyTag ||
      doc.containerTag.startsWith(companyTagPrefix);

    if (!doc || !inCompanyScope) {
      lines.push(`${index + 1}. ${reference.title || "Referenced document"} (id: ${reference.id})`);
      return;
    }

    const title = doc.title || reference.title || "Referenced document";
    const excerpt = doc.excerpt || "No content preview available.";
    lines.push(`${index + 1}. ${title} (id: ${doc.id})\n   Excerpt: ${excerpt}`);
  });

  return lines.join("\n");
}

/**
 * Build context scope for session
 */
function buildContextScope(sessionType: string): any {
  const scopes: Record<string, any> = {
    main: { access: "full", domains: ["campaigns", "crm", "inbox", "knowledge"] },
    campaigns: { access: "limited", domains: ["campaigns"], read_only: false },
    crm: { access: "limited", domains: ["crm"], read_only: false },
    inbox: { access: "limited", domains: ["inbox"], read_only: true }
  };
  return scopes[sessionType] || scopes.main;
}

async function executeAssistantDirectives({
  admin,
  content,
  companyId,
  companySlug,
  sessionId,
  sessionKey,
  agentType,
  emitSse,
}: {
  admin: any;
  content: string;
  companyId: string;
  companySlug: string;
  sessionId: string;
  sessionKey: string;
  agentType: AgentType;
  emitSse?: (event: Record<string, any>) => void;
}): Promise<{ finalContent: string; toolCalls: any[]; taskIds: string[] }> {
  const flags = getChatFeatureFlags();
  if (!flags.enableStructuredDirectives) {
    return { finalContent: content, toolCalls: [], taskIds: [] };
  }
  const parsed = parseAgentDirectives(content || "");
  const toolCalls: any[] = [];
  const taskIds: string[] = [];
  const flowContract = getPresetFlowContract(parsed.budget?.flowId);
  const maxActions = parsed.budget?.maxActions ?? flowContract?.maxActions ?? 8;
  const hardStopBehavior =
    parsed.budget?.hardStopBehavior || flowContract?.hardStopBehavior || "summarize";
  const flowId = parsed.budget?.flowId || flowContract?.id || null;
  let actionsUsed = 0;

  const emitBudget = (eventType = "flow.budget") => {
    const phase =
      eventType === "flow.started"
        ? "flow_started"
        : eventType === "flow.completed"
          ? "flow_completed"
          : "flow_budget";
    try {
      void admin
        .from("agent_decisions")
        .insert({
          company_id: companyId,
          session_id: sessionId,
          decision_type: "flow_budget",
          decision: toFlowTelemetrySummary({
            flowId,
            sessionId,
            companyId,
            agentType,
            event: phase,
            maxActions,
            actionsUsed,
            hardStopBehavior,
          }),
          confidence: 1,
          rationale: "runtime_flow_budget_telemetry",
          context: {
            flowId,
            hardStopBehavior,
          },
        })
        .throwOnError();
    } catch {
      // Non-blocking flow telemetry
    }

    emitSse?.({
      type: eventType,
      flowId,
      maxActions,
      actionsUsed,
      hardStopBehavior,
      remainingActions: Math.max(0, maxActions - actionsUsed),
    });
  };

  const onBudgetExceeded = () => {
    const reason = "Action budget reached";
    emitSse?.({
      type: "flow.stopped",
      flowId,
      reason,
      hardStopBehavior,
      maxActions,
      actionsUsed,
    });
    try {
      void admin
        .from("agent_decisions")
        .insert({
          company_id: companyId,
          session_id: sessionId,
          decision_type: "flow_budget",
          decision: toFlowTelemetrySummary({
            flowId,
            sessionId,
            companyId,
            agentType,
            event: "flow_stopped",
            maxActions,
            actionsUsed,
            hardStopBehavior,
          }),
          confidence: 1,
          rationale: "runtime_flow_budget_stop",
          context: {
            flowId,
            hardStopBehavior,
          },
        })
        .throwOnError();
    } catch {
      // Non-blocking flow telemetry
    }
    if (hardStopBehavior === "abort") {
      toolCalls.push({
        name: "flow_control",
        action: "abort",
        status: "error",
        result: `${reason}. Flow aborted.`,
      });
    } else if (hardStopBehavior === "ask_approval") {
      toolCalls.push({
        name: "flow_control",
        action: "request_approval",
        status: "pending",
        result: `${reason}. Awaiting approval to continue.`,
      });
    } else {
      toolCalls.push({
        name: "flow_control",
        action: "summarize",
        status: "complete",
        result: `${reason}. Returning summary output.`,
      });
    }
  };

  emitBudget("flow.started");

  for (const directive of parsed.directives) {
    if (actionsUsed >= maxActions) {
      onBudgetExceeded();
      break;
    }

    actionsUsed += 1;
    emitBudget();

    if (directive.kind === "tool") {
      emitSse?.({
        type: "tool.started",
        tool: directive.tool,
        params: directive.params,
        flowId: directive.flowId || flowId,
        stepId: directive.stepId || null,
        attempt: directive.attempt || 1,
        budget: {
          maxActions,
          actionsUsed,
          hardStopBehavior,
        },
      });
      const result = await executeGatewayTool(directive.tool, directive.params, {
        companyId,
        companySlug,
        sessionKey,
        sessionId,
        agentType,
      });
      if (result.ok) {
        emitSse?.({
          type: "tool.succeeded",
          tool: directive.tool,
          data: result.data,
          flowId: directive.flowId || flowId,
          stepId: directive.stepId || null,
          attempt: directive.attempt || 1,
          budget: {
            maxActions,
            actionsUsed,
            hardStopBehavior,
          },
        });
      } else {
        emitSse?.({
          type: "tool.failed",
          tool: directive.tool,
          error: result.error,
          flowId: directive.flowId || flowId,
          stepId: directive.stepId || null,
          attempt: directive.attempt || 1,
          budget: {
            maxActions,
            actionsUsed,
            hardStopBehavior,
          },
        });
      }
      toolCalls.push({
        name: directive.tool,
        action: "execute",
        status: result.ok ? "complete" : "error",
        result: result.ok ? JSON.stringify(result.data) : String(result.error || "Tool failed"),
        flowId: directive.flowId || flowId,
        stepId: directive.stepId || null,
        attempt: directive.attempt || 1,
        budget: {
          maxActions,
          actionsUsed,
          hardStopBehavior,
        },
      });
      continue;
    }

    const task = await createTask({
      companyId,
      parentSessionId: sessionId,
      agentType: directive.agentType,
      objective: directive.objective,
      inputs: directive.inputs,
      priority: directive.priority,
      requiresApproval: directive.requiresApproval,
      flowId: directive.flowId || flowId || undefined,
      stepId: directive.stepId,
      attempt: directive.attempt,
      maxActions,
      actionsUsed,
      hardStopBehavior,
    });
    taskIds.push(task.id);
    emitSse?.({
      type: "task.created",
      task: {
        id: task.id,
        agentType: task.agent_type,
        objective: task.objective,
        status: task.status,
        flowId: task.flow_id || directive.flowId || flowId || null,
        stepId: task.step_id || directive.stepId || null,
        attempt: task.attempt || directive.attempt || 1,
        maxActions: task.max_actions,
        actionsUsed: task.actions_used,
        hardStopBehavior: task.hard_stop_behavior,
      },
    });

    if (task.requires_approval || !flags.enableTaskRuntime) {
      emitSse?.({
        type: "approval.requested",
        taskId: task.id,
        objective: task.objective,
        flowId: task.flow_id || directive.flowId || flowId || null,
        reason: task.requires_approval ? "requires_approval" : "task_runtime_disabled",
      });
      toolCalls.push({
        name: "delegated_task",
        action: `${task.agent_type}: ${task.objective}`,
        status: "pending",
        result: `Task ${task.id} is awaiting approval`,
        flowId: task.flow_id || directive.flowId || flowId || null,
        stepId: task.step_id || directive.stepId || null,
        attempt: task.attempt || directive.attempt || 1,
      });
      continue;
    }

    const workerRun = await runTaskWorkerForTask({
      taskId: task.id,
      emitSse,
    });
    if (!workerRun.started) {
      await updateTask(task.id, {
        status: "failed",
        currentStep: "Worker failed to start",
        errorMessage: workerRun.reason || "Worker failed to start",
      });
      await appendTaskStep(task.id, {
        type: "task.failed",
        status: "failed",
        message: workerRun.reason || "Worker failed to start",
      });
      emitSse?.({
        type: "task.failed",
        taskId: task.id,
        reason: workerRun.reason || "Worker failed to start",
      });
    }

    toolCalls.push({
      name: "delegated_task",
      action: `${task.agent_type}: ${task.objective}`,
      status: workerRun.started ? "running" : "error",
      result: workerRun.started
        ? `Task ${task.id} delegated to worker`
        : `Task ${task.id} failed to start worker`,
      flowId: task.flow_id || directive.flowId || flowId || null,
      stepId: task.step_id || directive.stepId || null,
      attempt: task.attempt || directive.attempt || 1,
    });
  }

  emitBudget("flow.completed");

  return {
    finalContent: parsed.cleanContent,
    toolCalls,
    taskIds,
  };
}

/**
 * Stream chat completion from OpenClaw via SSH-tunneled WebSocket RPC.
 * Uses chat.send RPC and forwards streaming events as SSE to the client.
 */
async function streamChatCompletion({
  agentId,
  systemPrompt,
  history,
  message,
  admin,
  sessionId,
  openclawSessionKey,
  companyId,
  companySlug,
  supermemoryApiKey,
  containerUrl,
  gatewayToken,
  agentType,
}: {
  agentId: string;
  systemPrompt: string;
  history: any[];
  message: string;
  admin: any;
  sessionId: string;
  openclawSessionKey: string;
  companyId: string;
  companySlug: string;
  supermemoryApiKey?: string | null;
  containerUrl: string;
  gatewayToken: string;
  agentType: AgentType;
}) {
  // Get the raw stream from OpenClaw via SSH tunnel
  const openclawStream = await chatSendStream({
    containerUrl,
    token: gatewayToken,
    message,
    agentId,
    sessionKey: openclawSessionKey,
    history,
    systemPrompt,
  });

  // Wrap it to save messages to DB on completion
  const reader = openclawStream.getReader();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  let fullContent = "";
  const toolCalls: any[] = [];
  const toolSteps: any[] = [];
  let reasoningContent = "";
  let reasoningStartAt: number | null = null;
  let reasoningDuration: number | undefined;
  let contentParts: any[] | undefined;
  let pendingSseBuffer = "";

  const consumeSseText = (text: string) => {
    pendingSseBuffer += text;
    const lines = pendingSseBuffer.split("\n");
    pendingSseBuffer = lines.pop() ?? "";

    for (const rawLine of lines) {
      const line = rawLine.trimEnd();
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6);
      if (payload === "[DONE]") continue;

      try {
        const parsed = JSON.parse(payload);
        if (parsed.type === "content" && parsed.delta) {
          fullContent += parsed.delta;
        }
        if (parsed.type === "tool" && parsed.tool) {
          const tools = Array.isArray(parsed.tool) ? parsed.tool : [parsed.tool];
          toolCalls.push(...tools);
          toolSteps.push(...tools);
        }
        if (parsed.type === "reasoning-start") {
          reasoningStartAt = Date.now();
        }
        if (parsed.type === "reasoning" || parsed.type === "reasoning-delta") {
          const delta = parsed.delta || parsed.content || "";
          if (typeof delta === "string" && delta.length > 0) {
            reasoningContent += delta;
          }
        }
        if (parsed.type === "reasoning-end") {
          const tail = parsed.delta || parsed.content || "";
          if (typeof tail === "string" && tail.length > 0) {
            reasoningContent += tail;
          }
          reasoningDuration =
            typeof parsed.duration === "number"
              ? parsed.duration
              : reasoningStartAt
                ? Date.now() - reasoningStartAt
                : undefined;
        }
        if (parsed.type === "content_parts" && Array.isArray(parsed.parts)) {
          contentParts = parsed.parts;
        }
      } catch {
        // Partial/malformed frame; ignore and continue.
      }
    }
  };

  const stream = new ReadableStream({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        // Flush any buffered decoder output and parse trailing line(s).
        consumeSseText(decoder.decode());
        if (pendingSseBuffer) {
          consumeSseText("\n");
        }

        // Execute structured tool/task directives from assistant output.
        let finalContent = fullContent;
        let executedToolResults: any[] = [];
        const directiveResults = await executeAssistantDirectives({
          admin,
          content: fullContent,
          companyId,
          companySlug,
          sessionId,
          sessionKey: openclawSessionKey,
          agentType,
          emitSse: (event) => {
            const eventLine = `data: ${JSON.stringify(event)}\n\n`;
            controller.enqueue(encoder.encode(eventLine));
          },
        });
        finalContent = directiveResults.finalContent || finalContent;
        executedToolResults = directiveResults.toolCalls;
        try {
          void sweepTaskHealthForCompany(companyId);
        } catch {
          // Non-blocking task health sweep
        }

        // Save assistant message to database
        if (finalContent) {
          await saveMessage({
            admin,
            sessionId,
            role: "assistant",
            content: finalContent,
            toolCalls: [...toolCalls, ...executedToolResults].length > 0 
              ? [...toolCalls, ...executedToolResults] 
              : undefined,
            reasoningContent: reasoningContent || undefined,
            reasoningDuration,
            toolSteps: toolSteps.length > 0 ? toolSteps : undefined,
            contentParts,
          });

          try {
            await admin.rpc("increment_session_message_count", {
              session_uuid: sessionId,
              token_count: 0,
            });
          } catch {
            // Non-critical
          }

          // Trigger compaction in the background when sessions grow.
          void compactChatSession({
            companyId,
            companySlug,
            projectContainerTag: buildProjectContainerTag(companySlug, "default"),
            sessionId,
            sessionKey: openclawSessionKey,
            supermemoryApiKey: supermemoryApiKey || null,
            maxMessages: 30,
          });
        }
        
        // Send done event
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
        return;
      }

      // Parse the SSE chunk to accumulate content for DB save
      consumeSseText(decoder.decode(value, { stream: true }));

      // Forward to client as-is
      controller.enqueue(value);
    },
  });

  return stream;
}

/**
 * Non-streaming chat completion via SSH-tunneled WebSocket RPC.
 */
async function blockingChatCompletion({
  agentId,
  systemPrompt,
  history,
  message,
  admin,
  sessionId,
  openclawSessionKey,
  companyId,
  companySlug,
  supermemoryApiKey,
  containerUrl,
  gatewayToken,
  agentType,
}: {
  agentId: string;
  systemPrompt: string;
  history: any[];
  message: string;
  admin: any;
  sessionId: string;
  openclawSessionKey: string;
  companyId: string;
  companySlug: string;
  supermemoryApiKey?: string | null;
  containerUrl: string;
  gatewayToken: string;
  agentType: AgentType;
}) {
  const result = await chatSend({
    containerUrl,
    token: gatewayToken,
    message,
    agentId,
    sessionKey: openclawSessionKey,
    history,
    systemPrompt,
  });

  let finalResponse = result.response;
  let toolResults: any[] = [];
  const directiveResults = await executeAssistantDirectives({
    admin,
    content: result.response,
    companyId,
    companySlug,
    sessionId,
    sessionKey: openclawSessionKey,
    agentType,
  });
  toolResults = directiveResults.toolCalls;
  finalResponse = directiveResults.finalContent || finalResponse;

  // Save to database
  await saveMessage({
    admin,
    sessionId,
    role: "assistant",
    content: finalResponse,
    toolCalls: [...(result.toolCalls || []), ...toolResults],
    tokensUsed: result.tokensUsed,
    model: result.model,
  });

  void compactChatSession({
    companyId,
    companySlug,
    projectContainerTag: buildProjectContainerTag(companySlug, "default"),
    sessionId,
    sessionKey: openclawSessionKey,
    supermemoryApiKey: supermemoryApiKey || null,
    maxMessages: 30,
  });

  return {
    response: finalResponse,
    toolCalls: [...(result.toolCalls || []), ...toolResults],
    sessionId,
    tokensUsed: result.tokensUsed,
  };
}

/**
 * GET /api/chat
 * 
 * Get session messages or check status
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId");

  const auth = await authenticateUser();
  if (!auth) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  if (!sessionId) {
    return Response.json({
      status: "ok",
      openclaw: envConfig.openclaw.url()
    });
  }

  const admin = getAdmin();
  const { data: session } = await admin
    .from("chat_sessions")
    .select("id, company_id, user_id")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }
  if (session.user_id && session.user_id !== auth.userId) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const access = await verifyCompanyAccess(auth.userId, session.company_id);
  if (!access) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const history = await getConversationHistory(admin, sessionId, 50);

  return Response.json({
    sessionId,
    messages: history
  });
}

