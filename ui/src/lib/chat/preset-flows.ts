import type { AgentType } from "@/lib/chat/tool-gateway";

export type FlowTier = "P0" | "P1" | "P2";
export type FlowPolicyProfile =
  | "safe_readonly"
  | "approval_required"
  | "destructive_blocked";
export type HardStopBehavior = "summarize" | "ask_approval" | "abort";

export interface PresetFlowStep {
  id: string;
  kind: "reasoning" | "tool" | "task" | "approval" | "summary";
  action: string;
}

export interface PresetFlowContract {
  id: string;
  name: string;
  tier: FlowTier;
  maxActions: number;
  policyProfile: FlowPolicyProfile;
  hardStopBehavior: HardStopBehavior;
  supportedAgentTypes: AgentType[];
  stopConditions: string[];
  steps: PresetFlowStep[];
}

export const PRESET_FLOW_CONTRACTS: PresetFlowContract[] = [
  {
    id: "FlowA_ResearchToKnowledge",
    name: "Research to Knowledge",
    tier: "P0",
    maxActions: 6,
    policyProfile: "safe_readonly",
    hardStopBehavior: "summarize",
    supportedAgentTypes: ["main", "research", "knowledge"],
    stopConditions: [
      "research_topic completed",
      "create_document completed",
      "list_tags verification finished",
    ],
    steps: [
      { id: "step_1", kind: "reasoning", action: "Classify user research intent" },
      { id: "step_2", kind: "tool", action: "research_topic" },
      { id: "step_3", kind: "reasoning", action: "Synthesize findings into decision-ready format" },
      { id: "step_4", kind: "tool", action: "create_document" },
      { id: "step_5", kind: "tool", action: "list_tags" },
      { id: "step_6", kind: "summary", action: "Return concise summary and next steps" },
    ],
  },
  {
    id: "FlowB_CampaignReadout",
    name: "Campaign Readout",
    tier: "P0",
    maxActions: 7,
    policyProfile: "destructive_blocked",
    hardStopBehavior: "summarize",
    supportedAgentTypes: ["main", "campaigns", "research"],
    stopConditions: [
      "list_campaigns and get_campaign_details completed",
      "readout document created",
    ],
    steps: [
      { id: "step_1", kind: "tool", action: "list_campaigns" },
      { id: "step_2", kind: "reasoning", action: "Select campaign from context or latest activity" },
      { id: "step_3", kind: "tool", action: "get_campaign_details" },
      { id: "step_4", kind: "reasoning", action: "Perform gap analysis against goals" },
      { id: "step_5", kind: "tool", action: "create_document" },
      { id: "step_6", kind: "task", action: "Optional review task for human approval" },
      { id: "step_7", kind: "summary", action: "Return prioritized fixes and owner handoff" },
    ],
  },
  {
    id: "FlowC_InboxContextAssist",
    name: "Inbox Context Assist",
    tier: "P0",
    maxActions: 6,
    policyProfile: "safe_readonly",
    hardStopBehavior: "summarize",
    supportedAgentTypes: ["main", "inbox", "knowledge"],
    stopConditions: [
      "search_documents completed",
      "context document updates completed",
    ],
    steps: [
      { id: "step_1", kind: "tool", action: "search_documents" },
      { id: "step_2", kind: "tool", action: "get_document_with_context" },
      { id: "step_3", kind: "reasoning", action: "Draft response guidance" },
      { id: "step_4", kind: "tool", action: "update_document" },
      { id: "step_5", kind: "reasoning", action: "Emit follow-up checklist" },
      { id: "step_6", kind: "summary", action: "Return next action suggestions" },
    ],
  },
  {
    id: "FlowD_ApprovalGatedLaunchPrep",
    name: "Approval-Gated Launch Prep",
    tier: "P1",
    maxActions: 10,
    policyProfile: "approval_required",
    hardStopBehavior: "ask_approval",
    supportedAgentTypes: ["main", "campaigns", "research", "knowledge"],
    stopConditions: ["approval resolved", "task worker completed launch prep"],
    steps: [
      { id: "step_1", kind: "task", action: "Create delegated launch preparation task" },
      { id: "step_2", kind: "approval", action: "Wait for explicit approval" },
      { id: "step_3", kind: "task", action: "Run delegated tool sequence in worker" },
      { id: "step_4", kind: "summary", action: "Attach completion artifact and handoff" },
    ],
  },
  {
    id: "FlowE_MultiAgentMarketSprint",
    name: "Multi-Agent Market Sprint",
    tier: "P1",
    maxActions: 12,
    policyProfile: "approval_required",
    hardStopBehavior: "ask_approval",
    supportedAgentTypes: ["main", "research", "campaigns", "knowledge"],
    stopConditions: ["all delegated tasks completed", "merged market sprint output saved"],
    steps: [
      { id: "step_1", kind: "task", action: "Delegate research and campaign sub-tasks" },
      { id: "step_2", kind: "task", action: "Merge outputs into unified strategy" },
      { id: "step_3", kind: "tool", action: "create_document" },
      { id: "step_4", kind: "summary", action: "Return action-oriented sprint report" },
    ],
  },
  {
    id: "FlowF_LearnInstallShare",
    name: "Learn Install Share",
    tier: "P2",
    maxActions: 12,
    policyProfile: "approval_required",
    hardStopBehavior: "ask_approval",
    supportedAgentTypes: ["main", "knowledge", "campaigns", "crm", "inbox"],
    stopConditions: [
      "learn_skill completed",
      "install_skill completed for target agents",
      "share link generated",
    ],
    steps: [
      { id: "step_1", kind: "tool", action: "learn_skill" },
      { id: "step_2", kind: "reasoning", action: "Validate draft skill and metadata" },
      { id: "step_3", kind: "tool", action: "install_skill" },
      { id: "step_4", kind: "tool", action: "share_skill" },
      { id: "step_5", kind: "tool", action: "Optional import_skill to sibling company" },
      { id: "step_6", kind: "summary", action: "Return rollout and rollback notes" },
    ],
  },
  {
    id: "FlowG_SkillHealthRemediation",
    name: "Skill Health Remediation",
    tier: "P2",
    maxActions: 8,
    policyProfile: "destructive_blocked",
    hardStopBehavior: "summarize",
    supportedAgentTypes: ["main", "knowledge", "campaigns", "crm", "inbox"],
    stopConditions: ["missing requirements resolved", "assignment statuses healthy"],
    steps: [
      { id: "step_1", kind: "tool", action: "Inspect skill status report" },
      { id: "step_2", kind: "reasoning", action: "Generate remediation plan" },
      { id: "step_3", kind: "tool", action: "update_skill_env" },
      { id: "step_4", kind: "tool", action: "Re-sync or reinstall skill" },
      { id: "step_5", kind: "summary", action: "Report health outcome and next checks" },
    ],
  },
];

export const PRESET_FLOW_CONTRACTS_BY_ID = Object.fromEntries(
  PRESET_FLOW_CONTRACTS.map((flow) => [flow.id, flow])
) as Record<string, PresetFlowContract>;

export function getPresetFlowContract(
  flowId: string | undefined | null
): PresetFlowContract | null {
  if (!flowId) return null;
  return PRESET_FLOW_CONTRACTS_BY_ID[flowId] || null;
}

export function getPresetFlowPromptInstructions(): string {
  const lines = PRESET_FLOW_CONTRACTS.map((flow) => {
    const stepList = flow.steps.map((step) => `${step.id}:${step.action}`).join("; ");
    return `- ${flow.id} [tier=${flow.tier}] [maxActions=${flow.maxActions}] [policy=${flow.policyProfile}] [stop=${flow.hardStopBehavior}] => ${stepList}`;
  });

  return [
    "## PRESET FLOW CONTRACTS",
    "When possible, align delegated work to one of these canonical flows.",
    "Always emit stable identifiers in directives: flowId, stepId, attempt.",
    "Do not exceed maxActions; if exceeded, apply hardStopBehavior.",
    ...lines,
  ].join("\n");
}

