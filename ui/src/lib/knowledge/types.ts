export type BsosProjectKey =
  | "company-playbook"
  | "research"
  | "campaigns"
  | "intelligence"
  | "leads"
  | "imports";

export interface BsosKnowledgeProject {
  project_key: BsosProjectKey;
  name: string;
  description: string;
  icon: string;
  display_order: number;
  is_locked: boolean;
}

export interface BsosKnowledgeTarget {
  companyId: string;
  companySlug: string;
  projectKey: BsosProjectKey;
  uiPath: string[];
  containerTag: string;
  entityContext?: string;
  customId: string;
  artifactType: string;
  metadata: Record<string, string | number | boolean>;
  supabaseTargets: {
    knowledgeDocumentRef?: boolean;
    knowledgeEntry?: boolean;
    skillOutput?: boolean;
    intelligenceReport?: boolean;
    campaignRecommendation?: boolean;
  };
}

export interface BsosArtifact {
  projectKey: BsosProjectKey;
  uiPath: string[];
  containerTag: string;
  supermemoryDocumentId: string;
  supabaseIds: Record<string, string>;
}

export interface BsosWriteArtifactInput {
  content: string;
  companyId: string;
  companySlug: string;
  projectKey?: BsosProjectKey;
  skillName?: string;
  outputType: string;
  campaignId?: string;
  campaignName?: string;
  leadId?: string;
  leadName?: string;
  reportDate?: string;
  sourceType: "plusvibe" | "close" | "calendly" | "manual" | "system";
  sourceEventId?: string;
  title: string;
  confidence?: number;
  confidenceStatus?: "provisional" | "confirmed" | "archived";
  isInference?: boolean;
  provenance?: {
    integration: string;
    record_ids: string[];
    captured_at: string;
  };
}

export interface BsosSearchConfig {
  threshold: number;
  rerank: boolean;
  rewriteQuery: boolean;
}

export type BsosSkillCategory =
  | "onboarding"
  | "daily_ops"
  | "lifecycle"
  | "agent";
