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

const BUILT_IN_SKILLS: Omit<SkillBlueprintSeed, "skillMd">[] = [
  {
    slug: "research-perplexity",
    name: "Research (Perplexity)",
    description: "Web research via Perplexity API to gather competitive intel, market data, and prospect context for GTM campaigns.",
    version: "1.0.0",
    metadata: { source: "built-in", category: "research" },
    isDefault: true,
  },
  {
    slug: "draft-email",
    name: "Draft Email",
    description: "Compose outbound emails using company templates, ICP data, and brand voice. Generates personalized first-touch and follow-up emails.",
    version: "1.0.0",
    metadata: { source: "built-in", category: "outbound" },
    isDefault: true,
  },
  {
    slug: "analyze-campaign",
    name: "Analyze Campaign",
    description: "Campaign performance analysis — identifies underperforming sequences, suggests A/B tests, and recommends timing adjustments.",
    version: "1.0.0",
    metadata: { source: "built-in", category: "analytics" },
    isDefault: true,
  },
  {
    slug: "qualify-lead",
    name: "Qualify Lead",
    description: "Score and qualify leads against ICP criteria. Assesses company fit, persona match, timing signals, and engagement history.",
    version: "1.0.0",
    metadata: { source: "built-in", category: "qualification" },
    isDefault: true,
  },
  {
    slug: "summarize-thread",
    name: "Summarize Thread",
    description: "Summarize inbox email threads — extracts key intent, sentiment, action items, and recommended next steps.",
    version: "1.0.0",
    metadata: { source: "built-in", category: "inbox" },
    isDefault: true,
  },
];

function buildSkillMd(seed: Omit<SkillBlueprintSeed, "skillMd">): string {
  const useWhen: Record<string, string[]> = {
    "research-perplexity": [
      "user asks to research a company or prospect",
      "user needs competitive intelligence",
      "user wants market data or industry trends",
    ],
    "draft-email": [
      "user asks to write an email",
      "user needs a follow-up message",
      "user wants to compose outreach",
    ],
    "analyze-campaign": [
      "user asks about campaign performance",
      "user wants to optimize a sequence",
      "user asks why reply rates are low",
    ],
    "qualify-lead": [
      "user asks to score or qualify a lead",
      "user wants to check ICP fit",
      "user asks if a prospect is worth pursuing",
    ],
    "summarize-thread": [
      "user asks to summarize an email thread",
      "user wants key takeaways from a conversation",
      "user asks what happened in an inbox thread",
    ],
  };

  const triggers = useWhen[seed.slug] || [];
  return `---
name: ${seed.name}
description: ${seed.description}
version: ${seed.version}
useWhen:
${triggers.map((t) => `  - "${t}"`).join("\n")}
---

# ${seed.name}

${seed.description}
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
    const slug = normalizeSkillSlug(parsed.name || "gtm-engine-core-skill");
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

  // Add built-in programmatic skills
  for (const builtIn of BUILT_IN_SKILLS) {
    seeds.push({
      ...builtIn,
      skillMd: buildSkillMd(builtIn),
    });
  }

  return seeds;
}

export async function ensureDefaultBlueprints(admin: any) {
  const seeds = await loadWorkspaceDefaultSkillBlueprints();
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
