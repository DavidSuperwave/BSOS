import type { AgentType } from "@/lib/chat/tool-gateway";

export interface FlowTelemetryEvent {
  flowId: string | null;
  sessionId: string;
  companyId: string;
  agentType: AgentType;
  event: "flow_started" | "flow_budget" | "flow_stopped" | "flow_completed";
  maxActions: number;
  actionsUsed: number;
  hardStopBehavior: "summarize" | "ask_approval" | "abort";
}

export function toFlowTelemetrySummary(input: FlowTelemetryEvent) {
  return {
    flow_id: input.flowId,
    session_id: input.sessionId,
    company_id: input.companyId,
    agent_type: input.agentType,
    event: input.event,
    max_actions: input.maxActions,
    actions_used: input.actionsUsed,
    hard_stop_behavior: input.hardStopBehavior,
    remaining_actions: Math.max(0, input.maxActions - input.actionsUsed),
    observed_at: new Date().toISOString(),
  };
}

