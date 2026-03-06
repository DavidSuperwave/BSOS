import type { CompanyAgentType } from "@/lib/skills/types";

interface BackgroundSkillDefinition {
  slug: string;
  name: string;
  description: string;
  agentType: CompanyAgentType;
  schedule: string;
  skillMd: string;
}

export const NO_ACTIVE_CAMPAIGN_SKILL: BackgroundSkillDefinition = {
  slug: "no-active-campaign-watchdog",
  name: "No Active Campaign Watchdog",
  description:
    "Daily detector that reports when a PlusVibe workspace has zero active campaigns.",
  agentType: "campaigns",
  schedule: "0 8 * * *",
  skillMd: `# No Active Campaign Watchdog

This background skill checks PlusVibe once per day and reports when no campaigns are active.

## Scope
- Inspect campaign statuses in the configured PlusVibe workspace
- Raise an Action Item when no campaign is active/running
- Keep report context so the campaigns sub-agent can help remediate

## Success criteria
- At least one campaign is in an active/running state
- Existing "no active campaign" issue is auto-resolved when fixed
`,
};
