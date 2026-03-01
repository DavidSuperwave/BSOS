import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCompanyAccess } from "@/lib/api-auth";
import { logSkillExecution } from "@/lib/skills/execution-logger";
import { detectPerformancePattern } from "@/lib/skills/pattern-generator";
import { validateInsight } from "@/lib/skills/insight-validator";
import { storeInsight } from "@/lib/skills/supermemory-sync";
import { envConfig } from "@/lib/env";
import { projectContainerTag } from "@/lib/supermemory-client";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let adminClient: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!adminClient) adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

async function getProjectContainerTag(projectId: string): Promise<string | null> {
  const admin = getAdmin();
  const { data } = await admin
    .from("knowledge_projects")
    .select("container_tag_suffix, companies!inner(slug)")
    .eq("id", projectId)
    .single();
  if (!data) return null;
  const companySlug = (data.companies as any)?.slug;
  if (!companySlug) return null;
  return projectContainerTag(companySlug, data.container_tag_suffix);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      companyId,
      projectId,
      skillId,
      sessionKey,
      metrics,
      sourceDocIds = [],
      contextId,
    } = body || {};

    if (!companyId || !projectId || !skillId || !sessionKey) {
      return NextResponse.json(
        { error: "companyId, projectId, skillId, and sessionKey are required" },
        { status: 400 }
      );
    }

    const access = await requireCompanyAccess(companyId);
    if (access.error) return access.error;

    const pattern = detectPerformancePattern({
      reply_rate: Number(metrics?.reply_rate || 0),
      positive_rate: Number(metrics?.positive_rate || 0),
      volume: Number(metrics?.volume || 0),
      variance: Number(metrics?.variance || 0),
      trend: metrics?.trend || "flat",
      ooo_rate: Number(metrics?.ooo_rate || 0),
    });

    const statement = `Pattern detected: ${pattern} for current campaign performance.`;
    const validation = validateInsight({
      statement,
      evidenceCount: Array.isArray(metrics?.evidence) ? metrics.evidence.length : 0,
      sampleSize: Number(metrics?.sample_size || 0),
      caveats: [],
    });

    const execution = await logSkillExecution({
      companyId,
      skillId,
      agentType: "main",
      contextId,
      sessionKey,
      inputRefs: { projectId },
      inputParams: { metrics },
      steps: [
        { name: "pattern_detection", status: "completed", completed_at: new Date().toISOString() },
        { name: "validation", status: "completed", completed_at: new Date().toISOString() },
      ],
      outputSummary: statement,
      outputInsightIds: [],
      durationMs: 0,
      tokensUsed: 0,
    });

    const admin = getAdmin();
    const { data: company } = await admin
      .from("companies")
      .select("integration_credentials")
      .eq("id", companyId)
      .single();
    const supermemoryApiKey =
      company?.integration_credentials?.supermemory_api_key || envConfig.supermemory.apiKey();
    const containerTag = await getProjectContainerTag(projectId);

    let insightDocId: string | undefined;
    if (supermemoryApiKey && containerTag && execution.success) {
      const insightResult = await storeInsight(
        supermemoryApiKey,
        projectId,
        containerTag,
        {
          statement,
          category: "campaign_performance",
          pattern,
          evidence: {
            dataPoints: Array.isArray(metrics?.evidence) ? metrics.evidence : [],
            sampleSize: Number(metrics?.sample_size || 0),
          },
          nuance: {
            primaryMetric: {
              name: "reply_rate",
              value: Number(metrics?.reply_rate || 0),
              benchmark: "5-10%",
            },
            secondaryMetrics: [
              {
                name: "positive_rate",
                value: Number(metrics?.positive_rate || 0),
                impact: "supporting",
              },
            ],
            caveats: validation.caveats,
          },
          validity: {
            confidence: validation.confidenceScore,
            completeness: validation.completenessScore,
            validFrom: new Date().toISOString(),
            reviewStatus:
              validation.confidenceScore >= 0.9
                ? "validated"
                : validation.confidenceScore >= 0.7
                ? "pending_review"
                : "auto_generated",
          },
          lineage: {
            derivedFrom: sourceDocIds,
            skillId,
            traceId: execution.traceId || "",
            executionId: execution.executionId,
          },
        },
        sourceDocIds,
        companyId
      );
      if (insightResult.success) insightDocId = insightResult.docId;
    }

    return NextResponse.json({
      success: true,
      execution,
      pattern,
      validation,
      insightDocId,
      requiresReview: validation.confidenceScore < 0.7,
    });
  } catch (error: any) {
    console.error("[Skills Execute API] error:", error);
    return NextResponse.json(
      { error: error?.message || "Skill execution failed" },
      { status: 500 }
    );
  }
}
