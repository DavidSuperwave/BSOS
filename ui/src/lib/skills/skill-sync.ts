import { getAgentFile, setAgentFile } from "@/lib/openclaw-client";
import { legacySkillFileName, sanitizeAgentType, workspaceSkillFilePath } from "./common";
import { validateAndNormalizeSkill } from "./skill-validator";
import type { CompanyAgentType } from "./types";

interface AgentTarget {
  agentType: CompanyAgentType;
  agentId: string;
}

async function resolveAgentTargets(
  admin: any,
  companyId: string,
  requested: CompanyAgentType[]
): Promise<AgentTarget[]> {
  const { data: companyAgents } = await admin
    .from("company_agents")
    .select("agent_type, agent_id, status")
    .eq("company_id", companyId)
    .in("agent_type", requested)
    .eq("status", "active");

  const targets: AgentTarget[] = [];
  const seen = new Set<string>();
  for (const row of companyAgents || []) {
    const agentType = sanitizeAgentType(row.agent_type);
    if (!agentType || !row.agent_id) continue;
    const key = `${agentType}:${row.agent_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push({ agentType, agentId: row.agent_id });
  }

  // Backward-compat fallback: main agent may still live in companies.agent_config.
  if (requested.includes("main") && !targets.some((t) => t.agentType === "main")) {
    const { data: company } = await admin
      .from("companies")
      .select("agent_config")
      .eq("id", companyId)
      .single();
    const legacyAgentId = (company?.agent_config as Record<string, any> | null)?.agent_id;
    if (legacyAgentId) {
      targets.push({ agentType: "main", agentId: legacyAgentId });
    }
  }

  return targets;
}

async function writeSkillFiles(agentId: string, slug: string, content: string): Promise<void> {
  const nestedPath = workspaceSkillFilePath(slug);
  const legacyPath = legacySkillFileName(slug);
  await setAgentFile(agentId, nestedPath, content);
  await setAgentFile(agentId, legacyPath, content);
}

async function removeSkillFiles(agentId: string, slug: string): Promise<void> {
  const nestedPath = workspaceSkillFilePath(slug);
  const legacyPath = legacySkillFileName(slug);
  await setAgentFile(agentId, nestedPath, "");
  await setAgentFile(agentId, legacyPath, "");
}

export async function syncSkillToAgents(params: {
  admin: any;
  companyId: string;
  slug: string;
  content: string;
  agentTypes: CompanyAgentType[];
}): Promise<{ synced: AgentTarget[]; failed: Array<{ agentType: CompanyAgentType; error: string }> }> {
  const targets = await resolveAgentTargets(params.admin, params.companyId, params.agentTypes);
  const synced: AgentTarget[] = [];
  const failed: Array<{ agentType: CompanyAgentType; error: string }> = [];

  // Validate content before writing to any agent
  const validation = validateAndNormalizeSkill({ skillMd: params.content, slug: params.slug });
  if (!validation.ok) {
    return {
      synced: [],
      failed: targets.map((t) => ({
        agentType: t.agentType,
        error: `Validation failed: ${validation.errors.join("; ")}`,
      })),
    };
  }

  for (const target of targets) {
    try {
      await writeSkillFiles(target.agentId, params.slug, validation.skillMd);
      synced.push(target);
    } catch (err: any) {
      failed.push({
        agentType: target.agentType,
        error: err?.message || "Failed to sync skill file",
      });
    }
  }

  return { synced, failed };
}

export async function removeSkillFromAgents(params: {
  admin: any;
  companyId: string;
  slug: string;
  agentTypes: CompanyAgentType[];
}): Promise<{ removed: AgentTarget[]; failed: Array<{ agentType: CompanyAgentType; error: string }> }> {
  const targets = await resolveAgentTargets(params.admin, params.companyId, params.agentTypes);
  const removed: AgentTarget[] = [];
  const failed: Array<{ agentType: CompanyAgentType; error: string }> = [];

  for (const target of targets) {
    try {
      await removeSkillFiles(target.agentId, params.slug);
      removed.push(target);
    } catch (err: any) {
      failed.push({
        agentType: target.agentType,
        error: err?.message || "Failed to remove skill file",
      });
    }
  }

  return { removed, failed };
}

export async function checkSkillExistsOnAgent(agentId: string, slug: string): Promise<boolean> {
  try {
    const nestedPath = workspaceSkillFilePath(slug);
    const nested = await getAgentFile(agentId, nestedPath);
    const nestedContent = typeof nested === "string" ? nested : nested?.content || "";
    if (nestedContent.trim()) return true;
  } catch {
    // ignore
  }

  try {
    const legacyPath = legacySkillFileName(slug);
    const legacy = await getAgentFile(agentId, legacyPath);
    const legacyContent = typeof legacy === "string" ? legacy : legacy?.content || "";
    return Boolean(legacyContent.trim());
  } catch {
    return false;
  }
}
