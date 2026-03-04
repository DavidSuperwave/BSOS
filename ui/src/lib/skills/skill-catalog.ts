import fs from "fs/promises";
import path from "path";
import { normalizeSkillSlug } from "./common";
import { parseSkillFrontmatter } from "./frontmatter";
import { syncSkillToAgents } from "./skill-sync";
import type { CompanyAgentType } from "./types";

export interface SkillBlueprintSeed {
  slug: string;
  name: string;
  description: string;
  version: string;
  skillMd: string;
  metadata: Record<string, any>;
  isDefault: boolean;
}

async function readFileIfExists(filePath: string) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

type BuiltInCategory = "onboarding" | "daily" | "lifecycle";
type BuiltInRisk = "low" | "medium" | "high";

function titleFromSlug(slug: string): string {
  return slug
    .split("-")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

export const BUILT_IN_SKILLS: Omit<SkillBlueprintSeed, "skillMd">[] = [
  {
    slug: "copy-analyzer",
    name: titleFromSlug("copy-analyzer"),
    description: "Analyze campaign copy quality, hooks, and CTA clarity.",
    version: "1.0.0",
    metadata: { source: "built-in", category: "onboarding" as BuiltInCategory, risk_level: "low" as BuiltInRisk, core: true, removable: false, level: "L1" },
    isDefault: true,
  },
  {
    slug: "reply-miner",
    name: titleFromSlug("reply-miner"),
    description: "Classify replies and extract sentiment/objection patterns.",
    version: "1.0.0",
    metadata: { source: "built-in", category: "onboarding" as BuiltInCategory, risk_level: "low" as BuiltInRisk, core: true, removable: false, level: "L1" },
    isDefault: true,
  },
  {
    slug: "lead-profiler",
    name: titleFromSlug("lead-profiler"),
    description: "Profile lead quality and ICP fit readiness.",
    version: "1.0.0",
    metadata: { source: "built-in", category: "onboarding" as BuiltInCategory, risk_level: "medium" as BuiltInRisk, core: true, removable: false, level: "L1" },
    isDefault: true,
  },
  {
    slug: "bounce-diagnostician",
    name: titleFromSlug("bounce-diagnostician"),
    description: "Diagnose bounce root causes across domains and lists.",
    version: "1.0.0",
    metadata: { source: "built-in", category: "onboarding" as BuiltInCategory, risk_level: "medium" as BuiltInRisk, core: true, removable: false, level: "L1" },
    isDefault: true,
  },
  {
    slug: "deal-miner",
    name: titleFromSlug("deal-miner"),
    description: "Mine won/lost deal outcomes for GTM signal feedback.",
    version: "1.0.0",
    metadata: { source: "built-in", category: "onboarding" as BuiltInCategory, risk_level: "medium" as BuiltInRisk, core: true, removable: false, level: "L1" },
    isDefault: true,
  },
  {
    slug: "deliverability-assessor",
    name: titleFromSlug("deliverability-assessor"),
    description: "Assess deliverability posture and mailbox/domain setup.",
    version: "1.0.0",
    metadata: { source: "built-in", category: "onboarding" as BuiltInCategory, risk_level: "high" as BuiltInRisk, core: true, removable: false, level: "L1" },
    isDefault: true,
  },
  {
    slug: "campaign-monitor",
    name: titleFromSlug("campaign-monitor"),
    description: "Monitor campaign metrics and detect hourly anomalies.",
    version: "1.0.0",
    metadata: { source: "built-in", category: "daily" as BuiltInCategory, risk_level: "low" as BuiltInRisk, core: true, removable: false, level: "L1" },
    isDefault: true,
  },
  {
    slug: "deliverability-watchdog",
    name: titleFromSlug("deliverability-watchdog"),
    description: "Watch ongoing sender reputation and inbox placement health.",
    version: "1.0.0",
    metadata: { source: "built-in", category: "daily" as BuiltInCategory, risk_level: "high" as BuiltInRisk, core: true, removable: false, level: "L1" },
    isDefault: true,
  },
  {
    slug: "pipeline-tracker",
    name: titleFromSlug("pipeline-tracker"),
    description: "Track CRM stage movements and pipeline velocity drift.",
    version: "1.0.0",
    metadata: { source: "built-in", category: "daily" as BuiltInCategory, risk_level: "medium" as BuiltInRisk, core: true, removable: false, level: "L1" },
    isDefault: true,
  },
  {
    slug: "icp-validator",
    name: titleFromSlug("icp-validator"),
    description: "Validate ICP assumptions and segment performance weekly.",
    version: "1.0.0",
    metadata: { source: "built-in", category: "daily" as BuiltInCategory, risk_level: "medium" as BuiltInRisk, core: true, removable: false, level: "L1" },
    isDefault: true,
  },
  {
    slug: "intelligence-reporter",
    name: titleFromSlug("intelligence-reporter"),
    description: "Generate executive daily GTM intelligence summaries.",
    version: "1.0.0",
    metadata: { source: "built-in", category: "daily" as BuiltInCategory, risk_level: "low" as BuiltInRisk, core: true, removable: false, level: "L1" },
    isDefault: true,
  },
  {
    slug: "profile-enricher",
    name: titleFromSlug("profile-enricher"),
    description: "Enrich sparse profiles to improve targeting precision.",
    version: "1.0.0",
    metadata: { source: "built-in", category: "daily" as BuiltInCategory, risk_level: "medium" as BuiltInRisk, core: true, removable: false, level: "L1" },
    isDefault: true,
  },
  {
    slug: "campaign-researcher",
    name: titleFromSlug("campaign-researcher"),
    description: "Run market/angle research for campaign planning.",
    version: "1.0.0",
    metadata: { source: "built-in", category: "lifecycle" as BuiltInCategory, risk_level: "low" as BuiltInRisk, core: true, removable: false, level: "L2" },
    isDefault: true,
  },
  {
    slug: "campaign-builder",
    name: titleFromSlug("campaign-builder"),
    description: "Build full outbound campaigns from approved research.",
    version: "1.0.0",
    metadata: { source: "built-in", category: "lifecycle" as BuiltInCategory, risk_level: "medium" as BuiltInRisk, core: true, removable: false, level: "L3" },
    isDefault: true,
  },
  {
    slug: "campaign-launcher",
    name: titleFromSlug("campaign-launcher"),
    description: "Run preflight checks and launch approved campaigns.",
    version: "1.0.0",
    metadata: { source: "built-in", category: "lifecycle" as BuiltInCategory, risk_level: "high" as BuiltInRisk, core: true, removable: false, level: "L3" },
    isDefault: true,
  },
];

const LEGACY_SKILL_SLUGS = [
  "research-perplexity",
  "draft-email",
  "analyze-campaign",
  "qualify-lead",
  "summarize-thread",
];

function buildSkillMd(seed: Omit<SkillBlueprintSeed, "skillMd">): string {
  const useWhen: Record<string, string[]> = {
    "copy-analyzer": ["You need copy quality diagnostics.", "You are onboarding and need baseline messaging analysis."],
    "reply-miner": ["You need sentiment and objection extraction from replies.", "You want positive/negative reply pattern mining."],
    "lead-profiler": ["You need ICP-fit profiling for leads.", "Lead quality scoring is missing or stale."],
    "bounce-diagnostician": ["Bounce rates increased.", "You need domain/list-level bounce root-cause analysis."],
    "deal-miner": ["You need win/loss signal extraction.", "You want reasons for deal conversion outcomes."],
    "deliverability-assessor": ["You need mailbox/domain setup audit.", "Warmup/authentication posture must be assessed."],
    "campaign-monitor": ["You need hourly campaign anomaly checks.", "You need CTR/response drifts flagged quickly."],
    "deliverability-watchdog": ["You need ongoing inbox placement and sender health checks.", "Blocklist and authentication monitoring is required."],
    "pipeline-tracker": ["You need CRM stage movement summaries.", "Pipeline velocity and conversion changes need tracking."],
    "icp-validator": ["ICP assumptions need weekly validation.", "Segment performance divergence is suspected."],
    "intelligence-reporter": ["You need end-of-day GTM summary.", "Exec-ready highlights and risks are needed."],
    "profile-enricher": ["Contact/company records are sparse.", "You need enrichment for targeting precision."],
    "campaign-researcher": ["You need campaign angle and market research.", "You need supporting evidence before writing campaigns."],
    "campaign-builder": ["You need complete multi-step campaign drafts.", "Research is ready and campaign assets must be built."],
    "campaign-launcher": ["Campaign assets are approved and launch-ready.", "You need orchestration and launch checks executed."],
  };

  const dontUseWhen: Record<string, string[]> = {
    "copy-analyzer": ["No campaign copy exists yet.", "You only need infrastructure diagnostics."],
    "reply-miner": ["There are no reply datasets yet.", "You only need pre-launch static analysis."],
    "lead-profiler": ["Lead records are unavailable.", "You need only campaign creative critique."],
    "bounce-diagnostician": ["Sending has not started yet.", "No bounce logs are available."],
    "deal-miner": ["No opportunity history exists.", "You only need top-of-funnel metrics."],
    "deliverability-assessor": ["You need reply sentiment analysis only.", "Mailbox and domain access is unavailable."],
    "campaign-monitor": ["Campaigns are inactive.", "You need deep onboarding audit, not monitoring."],
    "deliverability-watchdog": ["No active sending domain/mailbox exists.", "You need one-time onboarding assessment only."],
    "pipeline-tracker": ["CRM integration is not connected.", "No opportunity objects exist."],
    "icp-validator": ["There is insufficient volume for segmentation inference.", "You need immediate copy fixes, not ICP validation."],
    "intelligence-reporter": ["Upstream daily skills have not run.", "You need raw logs rather than executive summary."],
    "profile-enricher": ["Data providers are disconnected.", "Records are already fully enriched recently."],
    "campaign-researcher": ["You already have approved research and only need launch execution.", "No campaign initiative exists."],
    "campaign-builder": ["Research is missing.", "Compliance or brand approvals are incomplete."],
    "campaign-launcher": ["Campaign content is unapproved.", "Deliverability posture is unhealthy."],
  };

  const triggers = useWhen[seed.slug] ?? ["Use when this skill's domain applies."];
  const antiTriggers = dontUseWhen[seed.slug] ?? ["Do not use when prerequisites are unavailable."];

  return `---
name: ${seed.name}
description: ${seed.description}
version: ${seed.version}
useWhen:
${triggers.map((t) => `  - "${t}"`).join("\n")}
---

# ${seed.name}

${seed.description}

## Don't use when
${antiTriggers.map((t) => `- ${t}`).join("\n")}
`;
}

export async function loadWorkspaceDefaultSkillBlueprints(): Promise<SkillBlueprintSeed[]> {
  const seeds: SkillBlueprintSeed[] = [];

  // Load file-based core skill if it exists
  const builtInSkillPath = path.join(
    process.cwd(),
    "openclaw",
    "skills",
    "gtm-engine",
    "SKILL.md"
  );
  const builtInSkill = await readFileIfExists(builtInSkillPath);
  if (builtInSkill) {
    const parsed = parseSkillFrontmatter(builtInSkill);
    const slug = "gtm-engine";
    seeds.push({
      slug,
      name: parsed.name || "GTM Engine Core Skill",
      description:
        parsed.description ||
        "Base GTM orchestration skill automatically installed for all companies.",
      version: "1.0.0",
      skillMd: builtInSkill,
      metadata: {
        openclaw: parsed.metadata || {},
        source: "workspace-default",
      },
      isDefault: true,
    });
  }

  // Add built-ins from openclaw/skills/{slug}/SKILL.md (fallback to generated content)
  for (const builtIn of BUILT_IN_SKILLS) {
    const filePath = path.join(process.cwd(), "openclaw", "skills", builtIn.slug, "SKILL.md");
    const fileContent = await readFileIfExists(filePath);
    const skillMd = fileContent ?? buildSkillMd(builtIn);
    const parsed = parseSkillFrontmatter(skillMd);
    seeds.push({
      ...builtIn,
      name: parsed.name || builtIn.name || titleFromSlug(builtIn.slug),
      description: parsed.description || builtIn.description,
      skillMd,
      metadata: {
        ...(builtIn.metadata || {}),
        openclaw: parsed.metadata || {},
        from_filesystem: Boolean(fileContent),
      },
    });
  }

  return seeds;
}

export async function ensureDefaultBlueprints(admin: any) {
  const seeds = await loadWorkspaceDefaultSkillBlueprints();
  await admin
    .from("company_skill_blueprints")
    .delete()
    .is("company_id", null)
    .in("slug", LEGACY_SKILL_SLUGS);

  for (const seed of seeds) {
    const { data: existing } = await admin
      .from("company_skill_blueprints")
      .select("id")
      .is("company_id", null)
      .eq("slug", seed.slug)
      .limit(1)
      .maybeSingle();

    if (existing?.id) continue;
    const { error } = await admin.from("company_skill_blueprints").insert({
      company_id: null,
      slug: seed.slug,
      name: seed.name,
      description: seed.description,
      version: seed.version,
      skill_md: seed.skillMd,
      metadata: seed.metadata,
      is_default: seed.isDefault,
    });
    if (error) throw new Error(error.message);
  }
  return seeds;
}

export async function listSkillCatalogForCompany(params: {
  admin: any;
  companyId: string;
}) {
  await ensureDefaultBlueprints(params.admin);

  const [{ data: companySkills }, { data: blueprints }] = await Promise.all([
    params.admin
      .from("company_skill_registry")
      .select("slug")
      .eq("company_id", params.companyId),
    params.admin
      .from("company_skill_blueprints")
      .select("*")
      .or(`company_id.is.null,company_id.eq.${params.companyId}`)
      .order("is_default", { ascending: false })
      .order("name", { ascending: true }),
  ]);

  const installed = new Set((companySkills || []).map((row: any) => row.slug));
  return (blueprints || []).map((bp: any) => ({
    id: bp.id,
    slug: bp.slug,
    name: bp.name,
    description: bp.description || "",
    version: bp.version || "1.0.0",
    metadata: bp.metadata || {},
    isDefault: Boolean(bp.is_default),
    installed: installed.has(bp.slug),
    source: bp.company_id ? "company" : "default",
  }));
}

export async function importBlueprintToCompany(params: {
  admin: any;
  companyId: string;
  blueprintId: string;
  createdBy?: string | null;
  slugOverride?: string;
  replaceExisting?: boolean;
}) {
  const { data: bp, error: bpErr } = await params.admin
    .from("company_skill_blueprints")
    .select("*")
    .eq("id", params.blueprintId)
    .single();
  if (bpErr || !bp) throw new Error("Blueprint not found");

  const targetSlug = normalizeSkillSlug(params.slugOverride || bp.slug || bp.name || "");
  if (!targetSlug) throw new Error("Invalid target slug");

  if (!params.replaceExisting) {
    const { data: existing } = await params.admin
      .from("company_skill_registry")
      .select("id")
      .eq("company_id", params.companyId)
      .eq("slug", targetSlug)
      .maybeSingle();
    if (existing) throw new Error(`Skill '${targetSlug}' already exists`);
  }

  const { data: skill, error: upsertErr } = await params.admin
    .from("company_skill_registry")
    .upsert(
      {
        company_id: params.companyId,
        slug: targetSlug,
        name: bp.name,
        description: bp.description || "",
        version: bp.version || "1.0.0",
        skill_md: bp.skill_md,
        metadata: {
          ...(bp.metadata || {}),
          import: {
            source: "blueprint",
            blueprint_id: bp.id,
            imported_at: new Date().toISOString(),
          },
        },
        created_by: params.createdBy || null,
      },
      { onConflict: "company_id,slug" }
    )
    .select("*")
    .single();
  if (upsertErr) throw new Error(upsertErr.message);

  const { error: provenanceErr } = await params.admin.from("company_skill_imports").insert({
    company_id: params.companyId,
    skill_slug: targetSlug,
    source_type: "blueprint",
    source_company_id: bp.company_id || null,
    source_skill_slug: bp.slug,
    blueprint_id: bp.id,
    imported_by: params.createdBy || null,
  });
  if (provenanceErr) throw new Error(provenanceErr.message);

  return skill;
}

export async function applyDefaultSkillPackToCompany(params: {
  admin: any;
  companyId: string;
  createdBy?: string | null;
  agentTypes?: CompanyAgentType[];
}) {
  const seeds = await ensureDefaultBlueprints(params.admin);
  const agentTypes = params.agentTypes || ["main", "campaigns", "crm", "inbox"];
  const installed: string[] = [];

  for (const seed of seeds) {
    const { data: skill, error: upsertErr } = await params.admin
      .from("company_skill_registry")
      .upsert(
        {
          company_id: params.companyId,
          slug: seed.slug,
          name: seed.name,
          description: seed.description,
          version: seed.version,
          skill_md: seed.skillMd,
          metadata: seed.metadata,
          created_by: params.createdBy || null,
        },
        { onConflict: "company_id,slug" }
      )
      .select("*")
      .single();
    if (upsertErr) throw new Error(upsertErr.message);

    await params.admin.from("company_agent_skill_assignments").upsert(
      agentTypes.map((agentType) => ({
        company_id: params.companyId,
        skill_slug: seed.slug,
        agent_type: agentType,
        enabled: true,
        install_status: "pending",
        install_message: "Installing default skill pack...",
      })),
      { onConflict: "company_id,skill_slug,agent_type" }
    );

    const { data: assignmentRows } = await params.admin
      .from("company_agent_skill_assignments")
      .select("id, agent_type")
      .eq("company_id", params.companyId)
      .eq("skill_slug", seed.slug)
      .in("agent_type", agentTypes);

    for (const row of assignmentRows || []) {
      await params.admin
        .from("company_agent_skill_env")
        .upsert(
          {
            assignment_id: row.id,
            company_id: params.companyId,
            skill_slug: seed.slug,
            agent_type: row.agent_type,
          },
          { onConflict: "assignment_id" }
        );
    }

    const syncResult = await syncSkillToAgents({
      admin: params.admin,
      companyId: params.companyId,
      slug: seed.slug,
      content: skill.skill_md,
      agentTypes,
    });

    for (const agentType of agentTypes) {
      const failed = syncResult.failed.find((entry) => entry.agentType === agentType);
      await params.admin
        .from("company_agent_skill_assignments")
        .update({
          install_status: failed ? "error" : "installed",
          install_message: failed ? failed.error : "Default skill pack installed",
          last_error: failed ? failed.error : null,
          installed_at: failed ? null : new Date().toISOString(),
          enabled: true,
        })
        .eq("company_id", params.companyId)
        .eq("skill_slug", seed.slug)
        .eq("agent_type", agentType);
    }

    installed.push(seed.slug);
  }

  return { installed };
}
