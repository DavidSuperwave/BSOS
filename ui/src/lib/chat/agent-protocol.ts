export type AgentDirectiveKind = "tool" | "task";

export interface ToolDirective {
  kind: "tool";
  tool: string;
  params: Record<string, any>;
  flowId?: string;
  stepId?: string;
  attempt?: number;
}

export interface TaskDirective {
  kind: "task";
  agentType: "main" | "campaigns" | "crm" | "inbox" | "research" | "knowledge";
  objective: string;
  inputs?: Record<string, any>;
  priority?: "low" | "normal" | "high";
  requiresApproval?: boolean;
  flowId?: string;
  stepId?: string;
  attempt?: number;
}

export type AgentDirective = ToolDirective | TaskDirective;

export type HardStopBehavior = "summarize" | "ask_approval" | "abort";

export interface ActionBudgetDirective {
  maxActions?: number;
  hardStopBehavior?: HardStopBehavior;
  flowId?: string;
}

export interface ParsedAgentDirectives {
  cleanContent: string;
  directives: AgentDirective[];
  budget?: ActionBudgetDirective;
}

function stripTrailingPartialDirective(content: string): string {
  const partialPatterns = [
    /<tool_call>[\s\S]*$/i,
    /<task_call>[\s\S]*$/i,
    /<action_budget>[\s\S]*$/i,
    /```agent-actions[\s\S]*$/i,
  ];

  return partialPatterns.reduce((value, pattern) => value.replace(pattern, ""), content);
}

function safeParseJson(input: string): any | null {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

function normalizeTaskDirective(raw: any): TaskDirective | null {
  if (!raw || typeof raw !== "object") return null;
  const objective = String(raw.objective || "").trim();
  if (!objective) return null;
  const agentTypeText = String(raw.agentType || "main").toLowerCase();
  const validAgentType =
    agentTypeText === "campaigns" ||
    agentTypeText === "crm" ||
    agentTypeText === "inbox" ||
    agentTypeText === "research" ||
    agentTypeText === "knowledge"
      ? (agentTypeText as TaskDirective["agentType"])
      : "main";
  const priorityText = String(raw.priority || "normal").toLowerCase();
  const priority =
    priorityText === "low" || priorityText === "high"
      ? (priorityText as "low" | "high")
      : "normal";
  return {
    kind: "task",
    agentType: validAgentType,
    objective,
    inputs:
      raw.inputs && typeof raw.inputs === "object"
        ? (raw.inputs as Record<string, any>)
        : undefined,
    priority,
    requiresApproval: Boolean(raw.requiresApproval),
    flowId: raw.flowId ? String(raw.flowId) : undefined,
    stepId: raw.stepId ? String(raw.stepId) : undefined,
    attempt:
      typeof raw.attempt === "number" && Number.isFinite(raw.attempt)
        ? Math.max(1, Math.trunc(raw.attempt))
        : undefined,
  };
}

function normalizeToolDirective(raw: any): ToolDirective | null {
  if (!raw || typeof raw !== "object") return null;
  const tool = String(raw.tool || raw.name || "").trim();
  if (!tool) return null;
  return {
    kind: "tool",
    tool,
    params:
      raw.params && typeof raw.params === "object"
        ? (raw.params as Record<string, any>)
        : {},
    flowId: raw.flowId ? String(raw.flowId) : undefined,
    stepId: raw.stepId ? String(raw.stepId) : undefined,
    attempt:
      typeof raw.attempt === "number" && Number.isFinite(raw.attempt)
        ? Math.max(1, Math.trunc(raw.attempt))
        : undefined,
  };
}

function parseActionBudget(cleaned: string): {
  budget?: ActionBudgetDirective;
  cleaned: string;
} {
  const regex = /<action_budget>\s*([\s\S]*?)\s*<\/action_budget>/i;
  const match = cleaned.match(regex);
  if (!match) return { cleaned };

  const parsed = safeParseJson(match[1] || "");
  const maxActions =
    typeof parsed?.maxActions === "number" && Number.isFinite(parsed.maxActions)
      ? Math.max(1, Math.trunc(parsed.maxActions))
      : undefined;
  const hardStopBehavior =
    parsed?.hardStopBehavior === "summarize" ||
    parsed?.hardStopBehavior === "ask_approval" ||
    parsed?.hardStopBehavior === "abort"
      ? (parsed.hardStopBehavior as HardStopBehavior)
      : undefined;
  const flowId = parsed?.flowId ? String(parsed.flowId) : undefined;

  return {
    budget:
      maxActions || hardStopBehavior || flowId
        ? { maxActions, hardStopBehavior, flowId }
        : undefined,
    cleaned: cleaned.replace(match[0], "").trim(),
  };
}

function parseTagBlock<T>(
  input: string,
  tagName: "tool_call" | "task_call",
  normalize: (raw: any) => T | null
): { directives: T[]; cleaned: string } {
  const regex = new RegExp(`<${tagName}>\\s*([\\s\\S]*?)\\s*<\\/${tagName}>`, "gi");
  const directives: T[] = [];
  let cleaned = input;
  const matches = Array.from(input.matchAll(regex));
  for (const match of matches) {
    const rawJson = match[1] || "";
    const parsed = safeParseJson(rawJson);
    const normalized = normalize(parsed);
    if (normalized) directives.push(normalized);
    cleaned = cleaned.replace(match[0], "");
  }
  return { directives, cleaned };
}

function parseAgentActionsFence(input: string): { directives: AgentDirective[]; cleaned: string } {
  const regex = /```agent-actions\s*([\s\S]*?)```/gi;
  const directives: AgentDirective[] = [];
  let cleaned = input;
  const matches = Array.from(input.matchAll(regex));
  for (const match of matches) {
    const parsed = safeParseJson(match[1] || "");
    if (parsed?.tool) {
      const normalized = normalizeToolDirective(parsed);
      if (normalized) directives.push(normalized);
    }
    if (parsed?.task) {
      const normalized = normalizeTaskDirective(parsed.task);
      if (normalized) directives.push(normalized);
    }
    if (Array.isArray(parsed?.directives)) {
      for (const d of parsed.directives) {
        const normalizedTool = normalizeToolDirective(d);
        if (normalizedTool) {
          directives.push(normalizedTool);
          continue;
        }
        const normalizedTask = normalizeTaskDirective(d);
        if (normalizedTask) directives.push(normalizedTask);
      }
    }
    cleaned = cleaned.replace(match[0], "");
  }
  return { directives, cleaned };
}

export function parseAgentDirectives(content: string): ParsedAgentDirectives {
  let cleaned = content || "";
  const directives: AgentDirective[] = [];

  const toolBlocks = parseTagBlock(cleaned, "tool_call", normalizeToolDirective);
  directives.push(...toolBlocks.directives);
  cleaned = toolBlocks.cleaned;

  const taskBlocks = parseTagBlock(cleaned, "task_call", normalizeTaskDirective);
  directives.push(...taskBlocks.directives);
  cleaned = taskBlocks.cleaned;

  const fenced = parseAgentActionsFence(cleaned);
  directives.push(...fenced.directives);
  cleaned = fenced.cleaned;
  const budget = parseActionBudget(cleaned);
  cleaned = budget.cleaned;

  return {
    cleanContent: cleaned.trim(),
    directives,
    budget: budget.budget,
  };
}

export function stripDirectiveMarkupForDisplay(content: string): string {
  const parsed = parseAgentDirectives(content || "");
  const withoutTrailingDirective = stripTrailingPartialDirective(parsed.cleanContent || "");
  return withoutTrailingDirective.replace(/\n{3,}/g, "\n\n").trim();
}

export function getDirectivePromptInstructions(): string {
  return [
    "## ACTION PROTOCOL",
    "When you need to execute actions, emit structured directives only.",
    "Supported directives:",
    "1) <tool_call>{\"tool\":\"<name>\",\"params\":{...}}</tool_call>",
    "2) <task_call>{\"agentType\":\"campaigns|crm|inbox|research|knowledge|main\",\"objective\":\"...\",\"inputs\":{...},\"priority\":\"low|normal|high\",\"requiresApproval\":true|false}</task_call>",
    "3) Optional: <action_budget>{\"maxActions\":8,\"hardStopBehavior\":\"summarize|ask_approval|abort\",\"flowId\":\"FlowA_ResearchToKnowledge\"}</action_budget>",
    "Include stable identifiers on directives when available: flowId, stepId, attempt.",
    "You may include normal user-facing text outside directives.",
    "Never use legacy TOOL:/PARAMS: blocks.",
  ].join("\n");
}
