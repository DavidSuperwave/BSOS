import { BsosSupermemoryClient, type DocumentMetadata } from "@/lib/supermemory/client";

export interface DataPoint {
  name: string;
  value: number | string;
}

export interface GeneratedInsight {
  statement: string;
  category: string;
  pattern?: string;
  evidence: { dataPoints: DataPoint[]; sampleSize: number };
  nuance: {
    primaryMetric: { name: string; value: number | string; benchmark?: string | number };
    secondaryMetrics: Array<{
      name: string;
      value: number | string;
      impact: "supporting" | "contradicting";
    }>;
    caveats: string[];
  };
  validity: {
    confidence: number;
    completeness: number;
    validFrom: string;
    validUntil?: string;
    reviewStatus: "auto_generated" | "pending_review" | "validated";
  };
  lineage: {
    derivedFrom: string[];
    skillId: string;
    traceId: string;
    executionId?: string;
  };
}

export async function storeInsight(
  apiKey: string,
  projectId: string,
  containerTag: string,
  insight: GeneratedInsight,
  sourceDocIds: string[],
  companyId: string
): Promise<{ success: boolean; docId?: string }> {
  const now = new Date().toISOString();
  const metadata: DocumentMetadata = {
    project_id: projectId,
    company_id: companyId,
    tags: {
      primary: "analysis",
      secondary: [insight.category, insight.pattern || "pattern_unknown"],
      stage: insight.validity.reviewStatus,
    },
    relationships: {
      derived_from: sourceDocIds,
      analysis_of: sourceDocIds,
    },
    title: insight.statement.slice(0, 100),
    type: "skill_insight",
    source: "agent_generated",
    execution_id: insight.lineage.executionId,
    skill_id: insight.lineage.skillId,
    confidence: insight.validity.confidence,
    review_status: insight.validity.reviewStatus,
    created_at: now,
    updated_at: now,
    version: 1,
  };

  const response = await BsosSupermemoryClient.getInstance(apiKey).addDocument({
    content: [
      `# Insight`,
      "",
      insight.statement,
      "",
      `Pattern: ${insight.pattern || "n/a"}`,
      `Category: ${insight.category}`,
      "",
      "## Evidence",
      ...insight.evidence.dataPoints.map((p) => `- ${p.name}: ${p.value}`),
      "",
      "## Caveats",
      ...(insight.nuance.caveats.length > 0 ? insight.nuance.caveats.map((c) => `- ${c}`) : ["- none"]),
    ].join("\n"),
    containerTag,
    metadata,
  });

  return response?.id ? { success: true, docId: response.id } : { success: false };
}
