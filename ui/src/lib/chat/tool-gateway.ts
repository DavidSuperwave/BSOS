import { executeTool } from "@/lib/agent-tools";
import { executeKnowledgeTool } from "@/lib/knowledge/knowledge-tools";
import { logInvocation } from "@/lib/tool-logger";

export type AgentType = "main" | "campaigns" | "crm" | "inbox" | "research" | "knowledge";

export interface ToolExecutionContext {
  companyId: string;
  companySlug: string;
  sessionKey: string;
  agentType: AgentType;
  sessionId?: string;
}

export interface ToolExecutionResult {
  ok: boolean;
  tool: string;
  data?: any;
  error?: string;
  durationMs: number;
}

const TOOL_POLICIES: Record<AgentType, string[]> = {
  main: [
    "create_document",
    "update_document",
    "search_documents",
    "get_document",
    "get_document_with_context",
    "list_tags",
    "list_campaigns",
    "get_campaign_details",
    "create_campaign",
    "list_knowledge_docs",
    "get_knowledge_doc",
    "create_knowledge_doc",
    "update_knowledge_doc",
    "delete_knowledge_doc",
    "research_topic",
    "research_and_create_campaign",
  ],
  campaigns: ["list_campaigns", "get_campaign_details", "create_campaign", "research_topic", "research_and_create_campaign"],
  crm: ["research_topic", "list_knowledge_docs", "get_knowledge_doc"],
  inbox: ["search_documents", "get_document", "research_topic"],
  research: [
    "research_topic",
    "research_and_create_campaign",
    "create_campaign",
    "search_documents",
    "get_document",
    "list_tags",
    "list_knowledge_docs",
    "get_knowledge_doc",
  ],
  knowledge: [
    "create_document",
    "update_document",
    "search_documents",
    "get_document",
    "get_document_with_context",
    "list_tags",
    "list_knowledge_docs",
    "get_knowledge_doc",
    "create_knowledge_doc",
    "update_knowledge_doc",
    "delete_knowledge_doc",
  ],
};

const KNOWLEDGE_TOOL_NAMES = new Set([
  "create_document",
  "update_document",
  "search_documents",
  "get_document",
  "get_document_with_context",
  "list_tags",
  "list_folders",
]);

export function getAllowedTools(agentType: AgentType): string[] {
  return TOOL_POLICIES[agentType] || TOOL_POLICIES.main;
}

export function canExecuteTool(agentType: AgentType, toolName: string): boolean {
  return getAllowedTools(agentType).includes(toolName);
}

export async function executeGatewayTool(
  toolName: string,
  params: Record<string, any>,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  const startedAt = Date.now();
  if (!canExecuteTool(context.agentType, toolName)) {
    return {
      ok: false,
      tool: toolName,
      error: `Tool ${toolName} is not allowed for agent type ${context.agentType}`,
      durationMs: Date.now() - startedAt,
    };
  }

  try {
    let data: any;
    if (KNOWLEDGE_TOOL_NAMES.has(toolName)) {
      const result = await executeKnowledgeTool(toolName, params, {
        companyId: context.companyId,
        companySlug: context.companySlug,
        sessionKey: context.sessionKey,
        agentType: context.agentType,
      });
      if (!result.success) {
        throw new Error(result.error || "Knowledge tool failed");
      }
      data = result.data;
    } else {
      data = await executeTool(toolName, { ...params, companyId: context.companyId });
    }

    const durationMs = Date.now() - startedAt;
    await logInvocation({
      companyId: context.companyId,
      sessionId: context.sessionId,
      toolName: toolName,
      toolTier: "proxied",
      inputParams: params,
      outputSummary: typeof data === "string" ? data.slice(0, 300) : JSON.stringify(data).slice(0, 300),
      status: "success",
      durationMs,
    });
    return {
      ok: true,
      tool: toolName,
      data,
      durationMs,
    };
  } catch (error: any) {
    const durationMs = Date.now() - startedAt;
    await logInvocation({
      companyId: context.companyId,
      sessionId: context.sessionId,
      toolName: toolName,
      toolTier: "proxied",
      inputParams: params,
      errorMessage: error?.message || "Tool execution failed",
      status: "error",
      durationMs,
    });
    return {
      ok: false,
      tool: toolName,
      error: error?.message || "Tool execution failed",
      durationMs,
    };
  }
}
