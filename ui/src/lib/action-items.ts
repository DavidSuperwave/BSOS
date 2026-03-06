import type { CompanyAgentType } from "@/lib/skills/types";

export type ActionPriority = "low" | "medium" | "high" | "urgent";

export interface NavigateAction {
  type: "navigate";
  label: string;
  href: string;
}

export interface SkillIssueAction {
  type: "skill_issue";
  issueKey: string;
  issueCode:
    | "install_error"
    | "sync_error"
    | "missing_requirements"
    | "uninstall_error"
    | "monitor_alert";
  skillSlug: string;
  skillName: string;
  agentType: CompanyAgentType;
  summary: string;
  details?: string;
  severity: ActionPriority;
}

export interface AppEventInsert {
  company_id: string;
  session_id?: string | null;
  event_type: "action_item" | "insight" | "alert" | "status_update" | "cron_result";
  title: string;
  description?: string;
  priority: ActionPriority;
  actions: Array<NavigateAction | SkillIssueAction>;
  status: "unread" | "read" | "acted" | "dismissed";
}

interface BuildSkillIssueEventInput {
  companyId: string;
  skillSlug: string;
  skillName: string;
  agentType: CompanyAgentType;
  issueCode: SkillIssueAction["issueCode"];
  summary: string;
  details?: string;
  priority: ActionPriority;
}

function buildSkillsHref(skillSlug: string, agentType: CompanyAgentType) {
  const params = new URLSearchParams({
    skill: skillSlug,
    agent: agentType,
  });
  return `/skills?${params.toString()}`;
}

function buildChatHref(input: BuildSkillIssueEventInput) {
  const prompt =
    `Help me resolve a skill issue.\n` +
    `Skill: ${input.skillName} (${input.skillSlug})\n` +
    `Agent: ${input.agentType}\n` +
    `Issue: ${input.summary}`;

  const params = new URLSearchParams({
    actionPrompt: prompt,
    issue: "skill",
    skill: input.skillSlug,
    agent: input.agentType,
  });
  return `/?${params.toString()}`;
}

export function buildSkillIssueEvent(input: BuildSkillIssueEventInput): AppEventInsert {
  const issueKey = `${input.issueCode}:${input.skillSlug}:${input.agentType}`;
  const title = buildSkillIssueTitle(input.skillName, input.agentType);

  return {
    company_id: input.companyId,
    event_type: "action_item",
    title,
    description: input.summary,
    priority: input.priority,
    actions: [
      {
        type: "skill_issue",
        issueKey,
        issueCode: input.issueCode,
        skillSlug: input.skillSlug,
        skillName: input.skillName,
        agentType: input.agentType,
        summary: input.summary,
        details: input.details,
        severity: input.priority,
      },
      {
        type: "navigate",
        label: "Open Skill Report",
        href: buildSkillsHref(input.skillSlug, input.agentType),
      },
      {
        type: "navigate",
        label: "Talk to agent",
        href: buildChatHref(input),
      },
    ],
    status: "unread",
  };
}

export async function emitSkillIssueEvent(admin: any, input: BuildSkillIssueEventInput) {
  const event = buildSkillIssueEvent(input);

  const { data: existing } = await admin
    .from("events")
    .select("id")
    .eq("company_id", input.companyId)
    .eq("event_type", "action_item")
    .in("status", ["unread", "read", "acted"])
    .eq("title", event.title)
    .limit(1)
    .maybeSingle();

  if (existing?.id) return { skipped: true };

  const { error } = await admin.from("events").insert(event);
  if (error) {
    throw new Error(error.message || "Failed to create skill issue event");
  }

  return { skipped: false };
}

export function buildSkillIssueTitle(
  skillName: string,
  agentType: CompanyAgentType
) {
  return `${skillName} (${agentType}) needs attention`;
}

export async function resolveSkillIssueEvents(
  admin: any,
  input: { companyId: string; skillName: string; agentType: CompanyAgentType }
) {
  const title = buildSkillIssueTitle(input.skillName, input.agentType);
  const { data, error } = await admin
    .from("events")
    .update({
      status: "dismissed",
      updated_at: new Date().toISOString(),
    })
    .eq("company_id", input.companyId)
    .eq("event_type", "action_item")
    .eq("title", title)
    .in("status", ["unread", "read", "acted"])
    .select("id");

  if (error) {
    throw new Error(error.message || "Failed to resolve skill issue events");
  }

  return {
    resolvedCount: data?.length || 0,
  };
}
