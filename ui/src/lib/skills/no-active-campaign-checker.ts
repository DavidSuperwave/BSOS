import {
  emitSkillIssueEvent,
  resolveSkillIssueEvents,
} from "@/lib/action-items";
import { getProjectCredentials } from "@/lib/plusvibe-project";
import { NO_ACTIVE_CAMPAIGN_SKILL } from "@/lib/skills/background-skill-definitions";

const PLUSVIBE_BASE = "https://api.plusvibe.ai/api/v1";

const ACTIVE_STATUSES = new Set([
  "active",
  "running",
  "started",
  "in_progress",
  "in-progress",
  "live",
]);

type SkillCheckStatus = "issue_open" | "resolved" | "skipped" | "error";

interface SkillCheckResult {
  companyId: string;
  skillSlug: string;
  status: SkillCheckStatus;
  checkedAt: string;
  summary: string;
  details: string;
  workspaceId?: string;
  totalCampaigns?: number;
  activeCampaigns?: number;
  eventCreated?: boolean;
  resolvedCount?: number;
}

function normalizeCampaignList(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.value)) return payload.value;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function campaignStatus(campaign: any): string {
  const raw =
    campaign?.status ??
    campaign?.campaign_status ??
    campaign?.state ??
    campaign?.campaignState;
  return String(raw || "").trim().toLowerCase();
}

function campaignIsActive(campaign: any): boolean {
  return ACTIVE_STATUSES.has(campaignStatus(campaign));
}

function summarizeStatuses(campaigns: any[]): string {
  const counts = campaigns.reduce<Record<string, number>>((acc, campaign) => {
    const key = campaignStatus(campaign) || "unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const parts = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([status, count]) => `${status}:${count}`);

  return parts.length > 0 ? parts.join(", ") : "none";
}

function buildNoActiveDetails(params: {
  workspaceId: string;
  totalCampaigns: number;
  statusSummary: string;
}) {
  return (
    `Workspace: ${params.workspaceId}\n` +
    `Checked campaigns: ${params.totalCampaigns}\n` +
    `Statuses seen: ${params.statusSummary}\n\n` +
    "No active/running campaigns were found. Ask the campaigns sub-agent to activate a draft or create a new launch."
  );
}

async function ensureBackgroundSkillRegistered(admin: any, companyId: string) {
  await admin
    .from("company_skill_registry")
    .upsert(
      {
        company_id: companyId,
        slug: NO_ACTIVE_CAMPAIGN_SKILL.slug,
        name: NO_ACTIVE_CAMPAIGN_SKILL.name,
        description: NO_ACTIVE_CAMPAIGN_SKILL.description,
        version: "1.0.0",
        skill_md: NO_ACTIVE_CAMPAIGN_SKILL.skillMd,
        metadata: {
          source: "system",
          schedule: NO_ACTIVE_CAMPAIGN_SKILL.schedule,
          detector: "plusvibe_no_active_campaign",
        },
      },
      { onConflict: "company_id,slug" }
    );

  await admin
    .from("company_agent_skill_assignments")
    .upsert(
      {
        company_id: companyId,
        skill_slug: NO_ACTIVE_CAMPAIGN_SKILL.slug,
        agent_type: NO_ACTIVE_CAMPAIGN_SKILL.agentType,
        enabled: true,
        install_status: "installed",
        install_message: "Background monitor active",
        installed_at: new Date().toISOString(),
      },
      { onConflict: "company_id,skill_slug,agent_type" }
    );
}

export async function runNoActiveCampaignSkillCheck(params: {
  admin: any;
  companyId: string;
}): Promise<SkillCheckResult> {
  const checkedAt = new Date().toISOString();
  const { admin, companyId } = params;

  try {
    await ensureBackgroundSkillRegistered(admin, companyId);
  } catch (err: any) {
    console.warn(
      "[NoActiveCampaignSkill] failed to register skill:",
      err?.message || err
    );
  }

  const creds = await getProjectCredentials(companyId);
  if (!creds?.apiKey || !creds.workspaceId) {
    return {
      companyId,
      skillSlug: NO_ACTIVE_CAMPAIGN_SKILL.slug,
      status: "skipped",
      checkedAt,
      summary: "No Active Campaign Watchdog skipped: PlusVibe credentials missing.",
      details:
        "PlusVibe API key or workspace ID is not configured for this company, so no campaign check was run.",
    };
  }

  try {
    const listRes = await fetch(
      `${PLUSVIBE_BASE}/campaign/list?workspace_id=${encodeURIComponent(
        creds.workspaceId
      )}`,
      {
        headers: {
          "Content-Type": "application/json",
          "x-api-key": creds.apiKey,
        },
        cache: "no-store",
      }
    );

    if (!listRes.ok) {
      const body = (await listRes.text()).replace(/\s+/g, " ").trim().slice(0, 240);
      return {
        companyId,
        skillSlug: NO_ACTIVE_CAMPAIGN_SKILL.slug,
        status: "error",
        checkedAt,
        workspaceId: creds.workspaceId,
        summary: `No Active Campaign Watchdog failed with PlusVibe ${listRes.status}.`,
        details: body || "Unable to fetch campaign list from PlusVibe.",
      };
    }

    const payload = await listRes.json();
    const campaigns = normalizeCampaignList(payload);
    const activeCampaigns = campaigns.filter(campaignIsActive);
    const statusSummary = summarizeStatuses(campaigns);

    if (activeCampaigns.length === 0) {
      const summary = `No active campaigns detected in PlusVibe workspace ${creds.workspaceId}.`;
      const details = buildNoActiveDetails({
        workspaceId: creds.workspaceId,
        totalCampaigns: campaigns.length,
        statusSummary,
      });
      const emitResult = await emitSkillIssueEvent(admin, {
        companyId,
        skillSlug: NO_ACTIVE_CAMPAIGN_SKILL.slug,
        skillName: NO_ACTIVE_CAMPAIGN_SKILL.name,
        agentType: NO_ACTIVE_CAMPAIGN_SKILL.agentType,
        issueCode: "monitor_alert",
        summary,
        details,
        priority: "high",
      });

      return {
        companyId,
        skillSlug: NO_ACTIVE_CAMPAIGN_SKILL.slug,
        status: "issue_open",
        checkedAt,
        workspaceId: creds.workspaceId,
        totalCampaigns: campaigns.length,
        activeCampaigns: 0,
        eventCreated: !emitResult.skipped,
        summary,
        details,
      };
    }

    const resolved = await resolveSkillIssueEvents(admin, {
      companyId,
      skillName: NO_ACTIVE_CAMPAIGN_SKILL.name,
      agentType: NO_ACTIVE_CAMPAIGN_SKILL.agentType,
    });

    return {
      companyId,
      skillSlug: NO_ACTIVE_CAMPAIGN_SKILL.slug,
      status: "resolved",
      checkedAt,
      workspaceId: creds.workspaceId,
      totalCampaigns: campaigns.length,
      activeCampaigns: activeCampaigns.length,
      resolvedCount: resolved.resolvedCount,
      summary: `${activeCampaigns.length} active campaign(s) detected.`,
      details: `Statuses seen: ${statusSummary}`,
    };
  } catch (err: any) {
    return {
      companyId,
      skillSlug: NO_ACTIVE_CAMPAIGN_SKILL.slug,
      status: "error",
      checkedAt,
      workspaceId: creds.workspaceId,
      summary: "No Active Campaign Watchdog failed while checking PlusVibe.",
      details: err?.message || "Unexpected error.",
    };
  }
}
