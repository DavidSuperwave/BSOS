import { sshExec } from "@/lib/ssh";
import { parseSkillFrontmatter } from "./frontmatter";
import { checkSkillExistsOnAgent } from "./skill-sync";
import { readTruthyPath } from "./common";
import type {
  CompanyAgentType,
  SkillInstallOption,
  SkillInstallSpec,
  SkillMissing,
  SkillRequirements,
} from "./types";

type AssignmentRow = {
  id: string;
  skill_slug: string;
  agent_type: CompanyAgentType;
  enabled: boolean;
  install_status: "pending" | "installed" | "error" | "disabled";
  install_message: string | null;
  install_stdout: string | null;
  install_stderr: string | null;
  install_code: number | null;
  install_warnings: any;
  installer_id: string | null;
  last_error: string | null;
  installed_at: string | null;
};

type EnvRow = {
  assignment_id: string;
  api_key: string | null;
  env: Record<string, string> | null;
};

function normalizeInstallOptions(specs: SkillInstallSpec[] | undefined): SkillInstallOption[] {
  if (!specs?.length) return [];
  const platform = process.platform;
  return specs
    .filter((spec, idx) => {
      if (!spec.os || spec.os.length === 0) return true;
      return spec.os.includes(platform);
    })
    .map((spec, idx) => ({
      id: (spec.id || `${spec.kind}-${idx}`).trim(),
      kind: spec.kind,
      label:
        (spec.label || "").trim() ||
        (spec.kind === "node" && spec.package
          ? `Install ${spec.package} (npm)`
          : spec.kind === "download" && spec.url
            ? `Download ${spec.url.split("/").pop() || spec.url}`
            : "Run installer"),
      bins: spec.bins || [],
    }));
}

async function checkContainerBins(
  containerName: string | null,
  bins: string[]
): Promise<Record<string, boolean>> {
  const status: Record<string, boolean> = {};
  for (const b of bins) status[b] = false;
  if (!containerName || bins.length === 0) return status;

  try {
    const list = bins.map((b) => b.replace(/[^A-Za-z0-9._-]/g, "")).filter(Boolean);
    if (list.length === 0) return status;
    const script = list
      .map((bin) => `if command -v ${bin} >/dev/null 2>&1; then echo "${bin}=1"; else echo "${bin}=0"; fi`)
      .join("; ");
    const execResult = await sshExec([
      `docker exec ${containerName} sh -lc '${script.replace(/'/g, `'\"'\"'`)}'`,
    ]);
    for (const line of execResult.stdout.split("\n")) {
      const [name, value] = line.trim().split("=");
      if (!name) continue;
      status[name] = value === "1";
    }
  } catch {
    // keep defaults false when unreachable
  }

  return status;
}

function mergeWarnings(raw: any): string[] {
  if (Array.isArray(raw)) return raw.map((v) => String(v));
  return [];
}

export async function buildCompanySkillStatusReport(params: {
  admin: any;
  companyId: string;
}): Promise<any> {
  const { admin, companyId } = params;
  const [{ data: company }, { data: agents }, { data: registry }, { data: assignments }, { data: envRows }] =
    await Promise.all([
      admin
        .from("companies")
        .select("id, slug, container_name, container_status, settings, agent_config")
        .eq("id", companyId)
        .single(),
      admin
        .from("company_agents")
        .select("agent_type, agent_id, status")
        .eq("company_id", companyId),
      admin
        .from("company_skill_registry")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false }),
      admin
        .from("company_agent_skill_assignments")
        .select("*")
        .eq("company_id", companyId),
      admin
        .from("company_agent_skill_env")
        .select("assignment_id, api_key, env")
        .eq("company_id", companyId),
    ]);

  const skillRows = registry || [];
  const assignmentRows = (assignments || []) as AssignmentRow[];
  const envByAssignment = new Map<string, EnvRow>();
  for (const row of (envRows || []) as EnvRow[]) {
    envByAssignment.set(row.assignment_id, row);
  }

  const allBins = new Set<string>();
  for (const skill of skillRows) {
    const parsed = parseSkillFrontmatter(skill.skill_md || "");
    const reqBins = parsed.metadata?.requires?.bins || [];
    const reqAnyBins = parsed.metadata?.requires?.anyBins || [];
    for (const bin of [...reqBins, ...reqAnyBins]) allBins.add(bin);
  }
  const binStatus = await checkContainerBins(
    company?.container_status === "running" ? company?.container_name || null : null,
    Array.from(allBins)
  );

  const companySettings = (company?.settings || {}) as Record<string, any>;
  const platform = process.platform;

  const agentsView = (agents || []).map((a: any) => ({
    agentType: a.agent_type,
    agentId: a.agent_id,
    status: a.status,
  }));

  // Backward compat surface for legacy main agent config
  const legacyMainAgentId = (company?.agent_config as Record<string, any> | null)?.agent_id;
  if (legacyMainAgentId && !agentsView.some((a: any) => a.agentType === "main")) {
    agentsView.push({ agentType: "main", agentId: legacyMainAgentId, status: "active" });
  }

  const skills = await Promise.all(
    skillRows.map(async (skill: any) => {
      const parsed = parseSkillFrontmatter(skill.skill_md || "");
      const metadata = parsed.metadata || {};
      const requirements: SkillRequirements = {
        bins: metadata.requires?.bins || [],
        anyBins: metadata.requires?.anyBins || [],
        env: metadata.requires?.env || [],
        config: metadata.requires?.config || [],
        os: metadata.os || [],
      };
      const install = normalizeInstallOptions(metadata.install);

      const assignmentForSkill = assignmentRows.filter((a) => a.skill_slug === skill.slug);
      const assignmentViews = await Promise.all(
        assignmentForSkill.map(async (assignment) => {
          const envCfg = envByAssignment.get(assignment.id);
          const mergedEnv = envCfg?.env || {};
          const missing: SkillMissing = { bins: [], env: [], config: [], os: [] };

          for (const b of requirements.bins) {
            if (!binStatus[b]) missing.bins.push(b);
          }

          if (requirements.anyBins.length > 0) {
            const anyPresent = requirements.anyBins.some((b) => Boolean(binStatus[b]));
            if (!anyPresent) missing.bins.push(...requirements.anyBins);
          }

          for (const envName of requirements.env) {
            const hasEnv =
              Boolean(process.env[envName]) ||
              Boolean((mergedEnv as Record<string, string>)[envName]) ||
              (metadata.primaryEnv === envName && Boolean(envCfg?.api_key));
            if (!hasEnv) missing.env.push(envName);
          }

          for (const cfgPath of requirements.config) {
            if (!readTruthyPath(companySettings, cfgPath)) {
              missing.config.push(cfgPath);
            }
          }

          if (requirements.os.length > 0 && !requirements.os.includes(platform)) {
            missing.os.push(...requirements.os);
          }

          const agent = agentsView.find((a: any) => a.agentType === assignment.agent_type);
          const synced = agent?.agentId
            ? await checkSkillExistsOnAgent(agent.agentId, skill.slug)
            : false;

          const eligible =
            assignment.enabled &&
            missing.bins.length === 0 &&
            missing.env.length === 0 &&
            missing.config.length === 0 &&
            missing.os.length === 0;

          return {
            agentType: assignment.agent_type,
            enabled: assignment.enabled,
            eligible,
            missing,
            synced,
            envConfigured: {
              hasApiKey: Boolean(envCfg?.api_key),
              keys: Object.keys((mergedEnv || {}) as Record<string, string>),
            },
            install: {
              status: assignment.install_status,
              message: assignment.install_message,
              stdout: assignment.install_stdout,
              stderr: assignment.install_stderr,
              code: assignment.install_code,
              warnings: mergeWarnings(assignment.install_warnings),
              installerId: assignment.installer_id,
              installedAt: assignment.installed_at,
              lastError: assignment.last_error,
            },
          };
        })
      );

      const disabled = assignmentViews.length > 0 && assignmentViews.every((a) => !a.enabled);
      const ready =
        assignmentViews.length > 0 && assignmentViews.every((a) => a.enabled && a.eligible);
      const needsSetup =
        assignmentViews.length > 0 && assignmentViews.some((a) => a.enabled && !a.eligible);

      return {
        id: skill.id,
        companyId: skill.company_id,
        slug: skill.slug,
        name: skill.name,
        description: skill.description || parsed.description || "",
        version: skill.version || "1.0.0",
        skillMd: skill.skill_md || "",
        emoji: parsed.emoji || metadata.emoji,
        homepage: metadata.homepage,
        source: "company-local",
        install,
        requirements,
        assignments: assignmentViews.sort((a, b) => a.agentType.localeCompare(b.agentType)),
        disabled,
        ready,
        needsSetup,
        createdAt: skill.created_at,
        updatedAt: skill.updated_at,
      };
    })
  );

  return {
    companyId,
    container: {
      name: company?.container_name || null,
      status: company?.container_status || null,
    },
    agents: agentsView.sort((a: any, b: any) => a.agentType.localeCompare(b.agentType)),
    skills: skills.sort((a, b) => a.name.localeCompare(b.name)),
  };
}
