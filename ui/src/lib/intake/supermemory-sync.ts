import { createClient } from "@supabase/supabase-js";
import { envConfig } from "../env";
import { CompanyProfile } from "./profile-builder";
import {
  storeDocument as storeTaggedDocument,
  type DocumentMetadata,
} from "@/lib/supermemory/storage";
import { projectContainerTag } from "@/lib/supermemory-client";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let adminClient: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!adminClient) adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

function sanitizeId(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 80);
}

function nowIso(): string {
  return new Date().toISOString();
}

async function getProjectContainer(projectId: string): Promise<string | null> {
  const admin = getAdmin();
  const { data } = await admin
    .from("knowledge_projects")
    .select("container_tag_suffix, companies!inner(slug)")
    .eq("id", projectId)
    .single();

  if (!data) return null;
  const slug = (data.companies as any)?.slug;
  if (!slug) return null;
  return projectContainerTag(slug, data.container_tag_suffix);
}

async function cacheDocumentRef(params: {
  projectId: string;
  companyId: string;
  supermemoryDocId: string;
  containerTag: string;
  title: string;
  tagsPrimary: string;
  tagsSecondary: string[];
  relationshipsDerivedFrom?: string[];
}) {
  const admin = getAdmin();
  await admin.from("knowledge_document_refs").upsert(
    {
      project_id: params.projectId,
      company_id: params.companyId,
      supermemory_doc_id: params.supermemoryDocId,
      supermemory_container_tag: params.containerTag,
      title: params.title,
      tags_primary: params.tagsPrimary,
      tags_secondary: params.tagsSecondary,
      relationships_derived_from: params.relationshipsDerivedFrom || [],
      updated_at: nowIso(),
    },
    { onConflict: "project_id,supermemory_doc_id" }
  );
}

function buildProfileContent(profile: CompanyProfile): string {
  return [
    `# ${profile.identity.name} - Company Profile`,
    "",
    `Industry: ${profile.identity.industry}`,
    `Website: ${profile.identity.website}`,
    "",
    "## Value Proposition",
    profile.identity.value_proposition,
    "",
    "## Differentiators",
    ...profile.identity.differentiators.map((d) => `- ${d}`),
  ].join("\n");
}

function buildPersonaContent(persona: CompanyProfile["icp"]["personas"][number], profile: CompanyProfile): string {
  return [
    `# ICP: ${persona.title}`,
    "",
    `Seniority: ${persona.seniority}`,
    `Decision Maker: ${persona.decision_maker ? "yes" : "no"}`,
    "",
    "## Pain Points",
    ...persona.pain_points.map((p) => `- ${p}`),
    "",
    "## Goals",
    ...persona.goals.map((g) => `- ${g}`),
    "",
    `Company Context: ${profile.identity.name} (${profile.identity.industry})`,
  ].join("\n");
}

function buildIndustryContent(industry: CompanyProfile["icp"]["industries"][number], profile: CompanyProfile): string {
  return [
    `# ICP Industry: ${industry.industry}`,
    "",
    `Priority: ${industry.priority}`,
    "",
    "## Pain Points",
    ...industry.pain_points.map((p) => `- ${p}`),
    "",
    "## Buying Signals",
    ...industry.buying_signals.map((s) => `- ${s}`),
    "",
    `Company: ${profile.identity.name}`,
  ].join("\n");
}

function buildPerformanceBaselineContent(profile: CompanyProfile): string {
  const p = profile.performance;
  return [
    `# Performance Baseline - ${profile.identity.name}`,
    "",
    `Campaigns analyzed: ${p.campaigns_analyzed}`,
    `Total leads contacted: ${p.total_leads_contacted}`,
    `Average reply rate: ${p.average_reply_rate}%`,
    `Average positive rate: ${p.average_positive_rate}%`,
    p.best_performing_campaign ? `Best campaign: ${p.best_performing_campaign}` : "",
    p.worst_performing_campaign ? `Worst campaign: ${p.worst_performing_campaign}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildServiceContent(profile: CompanyProfile): string {
  return [
    `# Services - ${profile.identity.name}`,
    "",
    `Primary: ${profile.services.primary.name}`,
    "",
    profile.services.primary.description,
    "",
    "## Tiers",
    ...profile.services.tiers.map((tier) => `- ${tier.name}: ${tier.price_monthly}`),
  ].join("\n");
}

function buildCompetitiveContent(profile: CompanyProfile): string {
  return [
    `# Competitive Intelligence - ${profile.identity.name}`,
    "",
    profile.competitive.positioning_statement,
    "",
    "## Differentiated Angles",
    ...profile.competitive.differentiated_angles.map((d) => `- ${d}`),
  ].join("\n");
}

export async function storeDocument(
  apiKey: string,
  params: {
    content: string;
    containerTag: string;
    customId?: string;
    metadata: DocumentMetadata;
  }
): Promise<boolean> {
  const result = await storeTaggedDocument(apiKey, {
    content: params.content,
    containerTag: params.containerTag,
    customId: params.customId,
    metadata: params.metadata,
  });
  return result.success;
}

async function storeAndCache(params: {
  apiKey: string;
  content: string;
  containerTag: string;
  customId: string;
  metadata: DocumentMetadata;
  projectId: string;
  companyId: string;
}) {
  const result = await storeTaggedDocument(params.apiKey, {
    content: params.content,
    containerTag: params.containerTag,
    customId: params.customId,
    metadata: params.metadata,
  });

  if (!result.success) return false;

  await cacheDocumentRef({
    projectId: params.projectId,
    companyId: params.companyId,
    supermemoryDocId: result.id || params.customId,
    containerTag: params.containerTag,
    title: params.metadata.title,
    tagsPrimary: params.metadata.tags.primary,
    tagsSecondary: params.metadata.tags.secondary,
    relationshipsDerivedFrom: params.metadata.relationships?.derived_from,
  });

  return true;
}

export async function syncIntakeToSupermemory(
  companyId: string,
  companySlug: string,
  projectId: string,
  profile: CompanyProfile,
  options?: { apiKey?: string }
): Promise<{
  success: boolean;
  documentsCreated: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let documentsCreated = 0;

  const smKey = options?.apiKey || envConfig.supermemory.apiKey();
  if (!smKey) {
    return {
      success: false,
      documentsCreated: 0,
      errors: ["No Supermemory API key configured"],
    };
  }

  const containerTag = await getProjectContainer(projectId);
  if (!containerTag) {
    return {
      success: false,
      documentsCreated: 0,
      errors: ["Project container tag could not be resolved"],
    };
  }

  const createdAt = nowIso();
  const updatedAt = createdAt;
  const profileCustomId = `${companySlug}_company_profile`;

  const profileMetadata: DocumentMetadata = {
    project_id: projectId,
    company_id: companyId,
    tags: {
      primary: "profile",
      secondary: [profile.identity.industry.toLowerCase()],
      stage: "approved",
      vertical: profile.identity.industry,
    },
    relationships: {},
    title: `${profile.identity.name} - Company Profile`,
    type: "profile",
    source: "onboarding_intake",
    created_at: createdAt,
    updated_at: updatedAt,
    version: 1,
  };

  if (
    await storeAndCache({
      apiKey: smKey,
      content: buildProfileContent(profile),
      containerTag,
      customId: profileCustomId,
      metadata: profileMetadata,
      projectId,
      companyId,
    })
  ) {
    documentsCreated += 1;
  } else {
    errors.push("Failed to store company profile");
  }

  for (const persona of profile.icp.personas) {
    const customId = `${companySlug}_icp_persona_${sanitizeId(persona.title)}`;
    const ok = await storeAndCache({
      apiKey: smKey,
      content: buildPersonaContent(persona, profile),
      containerTag,
      customId,
      metadata: {
        project_id: projectId,
        company_id: companyId,
        tags: {
          primary: "icp",
          secondary: [persona.seniority.toLowerCase(), profile.identity.industry.toLowerCase()],
          vertical: profile.identity.industry,
        },
        relationships: {
          derived_from: [profileCustomId],
        },
        title: `ICP: ${persona.title}`,
        type: "icp_insight",
        source: "onboarding_intake",
        created_at: createdAt,
        updated_at: updatedAt,
        version: 1,
      },
      projectId,
      companyId,
    });
    if (ok) documentsCreated += 1;
    else errors.push(`Failed to store persona ${persona.title}`);
  }

  for (const industry of profile.icp.industries) {
    const customId = `${companySlug}_icp_industry_${sanitizeId(industry.industry)}`;
    const ok = await storeAndCache({
      apiKey: smKey,
      content: buildIndustryContent(industry, profile),
      containerTag,
      customId,
      metadata: {
        project_id: projectId,
        company_id: companyId,
        tags: {
          primary: "icp",
          secondary: [industry.industry.toLowerCase(), profile.identity.industry.toLowerCase()],
          vertical: profile.identity.industry,
        },
        relationships: {
          derived_from: [profileCustomId],
        },
        title: `ICP Industry: ${industry.industry}`,
        type: "icp_insight",
        source: "onboarding_intake",
        created_at: createdAt,
        updated_at: updatedAt,
        version: 1,
      },
      projectId,
      companyId,
    });
    if (ok) documentsCreated += 1;
    else errors.push(`Failed to store industry ${industry.industry}`);
  }

  const performanceCustomId = `${companySlug}_performance_baseline`;
  if (profile.performance.campaigns_analyzed > 0) {
    const ok = await storeAndCache({
      apiKey: smKey,
      content: buildPerformanceBaselineContent(profile),
      containerTag,
      customId: performanceCustomId,
      metadata: {
        project_id: projectId,
        company_id: companyId,
        tags: {
          primary: "campaign",
          secondary: ["performance_baseline", profile.identity.industry.toLowerCase()],
          stage: "approved",
        },
        relationships: {
          derived_from: [profileCustomId],
        },
        title: `Performance Baseline - ${profile.identity.name}`,
        type: "performance_baseline",
        source: "historical_import",
        created_at: createdAt,
        updated_at: updatedAt,
        version: 1,
      },
      projectId,
      companyId,
    });
    if (ok) documentsCreated += 1;
    else errors.push("Failed to store performance baseline");
  }

  const servicesCustomId = `${companySlug}_services`;
  if (
    await storeAndCache({
      apiKey: smKey,
      content: buildServiceContent(profile),
      containerTag,
      customId: servicesCustomId,
      metadata: {
        project_id: projectId,
        company_id: companyId,
        tags: {
          primary: "asset",
          secondary: ["services", profile.identity.industry.toLowerCase()],
          stage: "approved",
        },
        relationships: {
          derived_from: [profileCustomId],
        },
        title: `Services - ${profile.identity.name}`,
        type: "playbook",
        source: "onboarding_intake",
        created_at: createdAt,
        updated_at: updatedAt,
        version: 1,
      },
      projectId,
      companyId,
    })
  ) {
    documentsCreated += 1;
  } else {
    errors.push("Failed to store services profile");
  }

  const competitiveCustomId = `${companySlug}_competitive`;
  if (
    await storeAndCache({
      apiKey: smKey,
      content: buildCompetitiveContent(profile),
      containerTag,
      customId: competitiveCustomId,
      metadata: {
        project_id: projectId,
        company_id: companyId,
        tags: {
          primary: "research",
          secondary: ["competitive_intel", profile.identity.industry.toLowerCase()],
          stage: "approved",
        },
        relationships: {
          derived_from: [profileCustomId],
          related_to: [servicesCustomId],
        },
        title: `Competitive Intelligence - ${profile.identity.name}`,
        type: "campaign_analysis",
        source: "onboarding_intake",
        created_at: createdAt,
        updated_at: updatedAt,
        version: 1,
      },
      projectId,
      companyId,
    })
  ) {
    documentsCreated += 1;
  } else {
    errors.push("Failed to store competitive intelligence");
  }

  const hasCampaignData = profile.performance?.campaigns_analyzed > 0;
  const dealsAnalyzed =
    (profile.performance as { deals_analyzed?: number } | undefined)?.deals_analyzed || 0;
  const hasCrmData = dealsAnalyzed > 0;

  if (!hasCampaignData && !hasCrmData) {
    const coldstartContent = [
      `# Coldstart Baseline - ${profile.identity?.name || companySlug}`,
      "",
      "No prior campaign or CRM history available at onboarding.",
      "Agent must build performance data from scratch through initial campaigns.",
      "",
      "## Company Identity",
      `Name: ${profile.identity?.name || companySlug}`,
      `Industry: ${profile.identity?.industry || "Not specified"}`,
      `Value proposition: ${profile.identity?.value_proposition || "Not specified"}`,
      `Differentiators: ${(profile.identity?.differentiators || []).join(", ") || "Not specified"}`,
      "",
      "## Target ICP",
      ...(profile.icp?.personas || []).map((p) => {
        const painPoints = (p.pain_points || []).join(", ") || "Pain points not specified";
        return `- ${p.title || "Unknown role"} at ${p.seniority || "any"} seniority: ${painPoints}`;
      }),
      ...(profile.icp?.industries || []).map(
        (ind) => `- Industry: ${ind.industry || "Unknown"}`
      ),
      "",
      "## Recommended Starting Strategy",
      `Lead with: ${(profile.identity?.differentiators || [])[0] || profile.identity?.value_proposition || "Company's core value proposition"}`,
      "Start with small batches (50-100 prospects) to establish baseline metrics.",
      "Focus initial campaigns on the primary ICP persona above.",
      "",
      "## Baseline Metrics (to be established)",
      "- Open rate target: 40-60% (industry average for cold outbound)",
      "- Reply rate target: 3-8% (varies by ICP and industry)",
      "- Meeting rate target: 1-3% of total sent",
      "These targets will be updated as real campaign data comes in.",
    ].join("\n");

    try {
      const ok = await storeAndCache({
        apiKey: smKey,
        content: coldstartContent,
        containerTag,
        customId: `${companySlug}_coldstart_baseline`,
        metadata: {
          project_id: projectId,
          company_id: companyId,
          tags: {
            primary: "profile",
            secondary: ["coldstart", "no_history", "baseline"],
            stage: "approved",
          },
          title: `Coldstart Baseline - ${profile.identity?.name || companySlug}`,
          type: "coldstart_baseline",
          source: "onboarding_intake",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          version: 1,
        },
        projectId,
        companyId,
      });
      if (ok) {
        documentsCreated += 1;
        console.log(`[intake] Coldstart baseline written for ${companySlug}`);
      }
    } catch (err) {
      console.error(`[intake] Failed to write coldstart baseline for ${companySlug}:`, err);
    }
  }

  return {
    success: errors.length === 0,
    documentsCreated,
    errors,
  };
}

export default syncIntakeToSupermemory;
