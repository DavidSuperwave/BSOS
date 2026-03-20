import { BsosKnowledgeTarget, BsosProjectKey, BsosWriteArtifactInput } from "./types";
import {
  bsosCampaignContainerTag,
  bsosCompanyContainerTag,
  bsosLeadContainerTag,
  bsosOnboardingContainerTag,
  bsosReportContainerTag,
  bsosResearchContainerTag,
} from "../supermemory/bsos-tags";

export function resolveBsosKnowledgeTarget(
  input: BsosWriteArtifactInput
): BsosKnowledgeTarget {
  const baseMetadata: Record<string, string | number | boolean> = {
    company_id: input.companyId,
    company_slug: input.companySlug,
    source_type: input.sourceType,
    source_event_id: input.sourceEventId || "",
    skill_name: input.skillName || "",
    confidence: input.confidence ?? 0.5,
    confidence_status: input.confidenceStatus || "provisional",
    is_inference: String(input.isInference ?? false),
    contamination_check_passed: "true",
  };

  if (input.projectKey) {
    return resolveExplicitProjectTarget(input, baseMetadata);
  }

  if (input.skillName === "campaign-researcher" || input.outputType === "research_doc") {
    return {
      companyId: input.companyId,
      companySlug: input.companySlug,
      projectKey: "research",
      uiPath: [slugify(input.title), "research"],
      containerTag: bsosResearchContainerTag(input.companySlug),
      customId: `research_${sanitizeCustomId(input.sourceEventId || generateId())}`,
      artifactType: "research_doc",
      metadata: {
        ...baseMetadata,
        artifact_type: "research_doc",
        project_key: "research",
      },
      supabaseTargets: {
        knowledgeDocumentRef: true,
        skillOutput: true,
        knowledgeEntry: true,
      },
    };
  }

  if (input.campaignId) {
    const isL3 = ["campaign-builder", "campaign-launcher"].includes(input.skillName || "");
    return {
      companyId: input.companyId,
      companySlug: input.companySlug,
      projectKey: "campaigns",
      uiPath: [input.campaignName || input.campaignId, input.outputType],
      containerTag: bsosCampaignContainerTag(input.companySlug, input.campaignId),
      customId: sanitizeCustomId(
        `campaign_${input.campaignId}_${input.outputType}_${input.sourceEventId || generateId()}`
      ),
      artifactType: input.outputType,
      metadata: {
        ...baseMetadata,
        artifact_type: input.outputType,
        project_key: "campaigns",
        campaign_id: input.campaignId,
        campaign_name: input.campaignName || "",
        requires_approval: String(isL3),
      },
      supabaseTargets: {
        campaignRecommendation: true,
        skillOutput: true,
        knowledgeDocumentRef: ["doc", "brief", "strategy"].some((token) =>
          input.outputType.includes(token)
        ),
      },
    };
  }

  if (
    input.skillName === "intelligence-reporter" ||
    input.outputType === "intelligence_report" ||
    input.reportDate
  ) {
    const reportDate = input.reportDate || new Date().toISOString().slice(0, 10);
    return {
      companyId: input.companyId,
      companySlug: input.companySlug,
      projectKey: "intelligence",
      uiPath: [reportDate.slice(0, 7), reportDate.slice(8, 10)],
      containerTag: bsosReportContainerTag(input.companySlug, reportDate),
      customId: sanitizeCustomId(`report_${input.companyId}_${reportDate}`),
      artifactType: "intelligence_report",
      metadata: {
        ...baseMetadata,
        artifact_type: "intelligence_report",
        project_key: "intelligence",
        report_date: reportDate,
      },
      supabaseTargets: {
        intelligenceReport: true,
        skillOutput: true,
      },
    };
  }

  if (
    input.leadId ||
    ["lead-profiler", "profile-enricher", "icp-validator"].includes(input.skillName || "")
  ) {
    const leadId = input.leadId || `unknown_${generateId()}`;
    return {
      companyId: input.companyId,
      companySlug: input.companySlug,
      projectKey: "leads",
      uiPath: [input.leadName || leadId],
      containerTag: bsosLeadContainerTag(input.companySlug, leadId),
      customId: sanitizeCustomId(
        `lead_${leadId}_${input.outputType}_${input.sourceEventId || generateId()}`
      ),
      artifactType: input.outputType,
      metadata: {
        ...baseMetadata,
        artifact_type: input.outputType,
        project_key: "leads",
        lead_id: leadId,
        lead_name: input.leadName || "",
      },
      supabaseTargets: {
        knowledgeEntry: true,
        skillOutput: true,
      },
    };
  }

  if (
    [
      "copy-analyzer",
      "reply-miner",
      "deal-miner",
      "bounce-diagnostician",
      "deliverability-assessor",
    ].includes(input.skillName || "") ||
    input.outputType === "import"
  ) {
    return {
      companyId: input.companyId,
      companySlug: input.companySlug,
      projectKey: "imports",
      uiPath: [input.sourceType, new Date().toISOString().slice(0, 10)],
      containerTag: bsosOnboardingContainerTag(input.companySlug),
      customId: sanitizeCustomId(`import_${input.sourceType}_${input.sourceEventId || generateId()}`),
      artifactType: "import",
      metadata: {
        ...baseMetadata,
        artifact_type: "import",
        project_key: "imports",
      },
      supabaseTargets: {
        knowledgeDocumentRef: true,
      },
    };
  }

  return {
    companyId: input.companyId,
    companySlug: input.companySlug,
    projectKey: "company-playbook",
    uiPath: [slugify(input.title)],
    containerTag: bsosCompanyContainerTag(input.companySlug),
    customId: sanitizeCustomId(`playbook_${input.sourceEventId || generateId()}`),
    artifactType: "playbook_entry",
    metadata: {
      ...baseMetadata,
      artifact_type: "playbook_entry",
      project_key: "company-playbook",
    },
    supabaseTargets: {
      knowledgeDocumentRef: true,
      knowledgeEntry: true,
    },
  };
}

function resolveExplicitProjectTarget(
  input: BsosWriteArtifactInput,
  baseMetadata: Record<string, string | number | boolean>
): BsosKnowledgeTarget {
  const projectKey = input.projectKey as BsosProjectKey;
  const projectMap: Record<
    BsosProjectKey,
    { containerTag: string; defaultArtifactType: string; uiPath: string[] }
  > = {
    "company-playbook": {
      containerTag: bsosCompanyContainerTag(input.companySlug),
      defaultArtifactType: "playbook_entry",
      uiPath: [slugify(input.title)],
    },
    research: {
      containerTag: bsosResearchContainerTag(input.companySlug),
      defaultArtifactType: "research_doc",
      uiPath: ["uploads", slugify(input.title)],
    },
    campaigns: {
      containerTag: bsosCampaignContainerTag(input.companySlug, "general"),
      defaultArtifactType: "campaign_artifact",
      uiPath: ["general", slugify(input.title)],
    },
    intelligence: {
      containerTag: bsosReportContainerTag(
        input.companySlug,
        new Date().toISOString().slice(0, 10)
      ),
      defaultArtifactType: "intelligence_report",
      uiPath: [new Date().toISOString().slice(0, 10), slugify(input.title)],
    },
    leads: {
      containerTag: bsosLeadContainerTag(input.companySlug, "general"),
      defaultArtifactType: "lead_artifact",
      uiPath: ["general", slugify(input.title)],
    },
    imports: {
      containerTag: bsosOnboardingContainerTag(input.companySlug),
      defaultArtifactType: "import",
      uiPath: [input.sourceType, slugify(input.title)],
    },
  };

  const mapping = projectMap[projectKey];

  return {
    companyId: input.companyId,
    companySlug: input.companySlug,
    projectKey,
    uiPath: mapping.uiPath,
    containerTag: mapping.containerTag,
    customId: sanitizeCustomId(
      `${projectKey}_${input.outputType}_${input.sourceEventId || generateId()}`
    ),
    artifactType: input.outputType || mapping.defaultArtifactType,
    metadata: {
      ...baseMetadata,
      artifact_type: input.outputType || mapping.defaultArtifactType,
      project_key: projectKey,
    },
    supabaseTargets: {
      knowledgeDocumentRef: true,
    },
  };
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

function sanitizeCustomId(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
}

function generateId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}
