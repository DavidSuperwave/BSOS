import { createHash } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { BsosArtifact, BsosKnowledgeTarget, BsosWriteArtifactInput } from "./types";
import { resolveBsosKnowledgeTarget } from "./target-resolver";
import { ensureProjectExists } from "./project-seeder";
import { ensureContainerContext } from "../supermemory/container-context";
import { BsosSupermemoryClient } from "../supermemory/client";
import { bsosCompanyContainerTag } from "../supermemory/bsos-tags";

export async function writeBsosArtifact(
  params: BsosWriteArtifactInput & {
    supabase: ReturnType<typeof createClient>;
    supermemoryClient: BsosSupermemoryClient;
  }
): Promise<BsosArtifact> {
  const target = resolveBsosKnowledgeTarget(params);
  const projectId = await ensureProjectExists(
    target.projectKey,
    params.companyId,
    params.supabase
  );

  const contaminationResult = await runContaminationCheck(
    target,
    params.content,
    params.supabase
  );
  if (!contaminationResult.passed) {
    await logContaminationFailure(
      target,
      contaminationResult.reason || "unknown reason",
      params.supabase
    );
    throw new Error(`Contamination check failed: ${contaminationResult.reason}`);
  }

  const supabaseIds: Record<string, string> = {};

  if (target.supabaseTargets.knowledgeDocumentRef) {
    const { data, error } = await params.supabase
      .from("knowledge_document_refs")
      .insert({
        company_id: params.companyId,
        project_id: projectId,
        supermemory_doc_id: target.customId,
        supermemory_document_id: target.customId,
        supermemory_container_tag: target.containerTag,
        title: params.title,
        tags_primary: target.projectKey,
        tags_secondary: [target.artifactType],
        ui_path: target.uiPath,
        artifact_type: target.artifactType,
        linked_campaign_id: params.campaignId || null,
        linked_lead_id: params.leadId || null,
        custom_id: target.customId,
        metadata: {
          ...target.metadata,
          provenance: params.provenance || null,
        },
      })
      .select("id")
      .single();

    if (error || !data?.id) {
      throw new Error(`knowledge_document_refs insert failed: ${error?.message || "unknown error"}`);
    }
    supabaseIds.knowledgeDocumentRefId = data.id;
  }

  if (target.supabaseTargets.knowledgeEntry) {
    const { data, error } = await params.supabase
      .from("knowledge_entries")
      .insert({
        company_id: params.companyId,
        project_id: projectId,
        category: target.artifactType,
        content: params.content,
        confidence: params.confidence ?? 0.5,
        confidence_status: params.confidenceStatus || "provisional",
        source: params.sourceType,
        source_event_id: params.sourceEventId || null,
        provenance: params.provenance || {},
        is_inference: params.isInference ?? false,
        tags: [target.projectKey, target.artifactType, params.skillName].filter(Boolean),
      })
      .select("id")
      .single();

    if (error || !data?.id) {
      throw new Error(`knowledge_entries insert failed: ${error?.message || "unknown error"}`);
    }
    supabaseIds.knowledgeEntryId = data.id;
  }

  if (target.supabaseTargets.skillOutput) {
    const { data, error } = await params.supabase
      .from("skill_outputs")
      .insert({
        company_id: params.companyId,
        skill_name: params.skillName || "unknown",
        run_id: params.sourceEventId || crypto.randomUUID(),
        output_type: target.artifactType,
        payload: { content: params.content, title: params.title },
        provenance: params.provenance || {},
        confidence: params.confidence ?? 0.5,
      })
      .select("id")
      .single();

    if (error || !data?.id) {
      throw new Error(`skill_outputs insert failed: ${error?.message || "unknown error"}`);
    }
    supabaseIds.skillOutputId = data.id;
  }

  if (target.supabaseTargets.intelligenceReport && params.reportDate) {
    const { data, error } = await params.supabase
      .from("intelligence_reports")
      .insert({
        company_id: params.companyId,
        report_date: params.reportDate,
        headline: params.title,
        summary_md: params.content,
        highlights: {},
        risks: {},
        recommended_actions: {},
        provenance: params.provenance || {},
      })
      .select("id")
      .single();

    if (error || !data?.id) {
      throw new Error(`intelligence_reports insert failed: ${error?.message || "unknown error"}`);
    }
    supabaseIds.intelligenceReportId = data.id;
  }

  if (target.supabaseTargets.campaignRecommendation && params.campaignId) {
    const { data, error } = await params.supabase
      .from("campaign_recommendations")
      .insert({
        company_id: params.companyId,
        campaign_id: params.campaignId,
        recommendation_type: target.artifactType,
        reasoning: params.content,
        supporting_evidence: params.provenance || {},
        requires_approval: ["campaign-builder", "campaign-launcher"].includes(
          params.skillName || ""
        ),
        approval_status: "pending",
      })
      .select("id")
      .single();

    if (error || !data?.id) {
      throw new Error(
        `campaign_recommendations insert failed: ${error?.message || "unknown error"}`
      );
    }
    supabaseIds.campaignRecommendationId = data.id;
  }

  const entityContext = await ensureContainerContext(target.containerTag, target.entityContext);

  const supermemoryDoc = await params.supermemoryClient.addDocument({
    content: params.content,
    containerTag: target.containerTag,
    customId: target.customId,
    entityContext,
    metadata: {
      ...target.metadata,
      knowledge_document_ref_id: supabaseIds.knowledgeDocumentRefId || "",
      knowledge_entry_id: supabaseIds.knowledgeEntryId || "",
      skill_output_id: supabaseIds.skillOutputId || "",
    },
  });

  if (supabaseIds.knowledgeDocumentRefId) {
    await params.supabase
      .from("knowledge_document_refs")
      .update({
        supermemory_doc_id: supermemoryDoc.id,
        supermemory_document_id: supermemoryDoc.id,
        supermemory_container_tag: target.containerTag,
        custom_id: target.customId,
      })
      .eq("id", supabaseIds.knowledgeDocumentRefId);
  }

  await params.supabase.from("memory_write_audit").insert({
    company_id: params.companyId,
    namespace: target.containerTag,
    container_tag: target.containerTag,
    content_hash: hashContent(params.content),
    provenance: params.provenance || {},
    confidence: params.confidence ?? 0.5,
    is_inference: params.isInference ?? false,
    contamination_check_passed: true,
    contamination_reason: null,
  });

  return {
    projectKey: target.projectKey,
    uiPath: target.uiPath,
    containerTag: target.containerTag,
    supermemoryDocumentId: supermemoryDoc.id,
    supabaseIds,
  };
}

async function runContaminationCheck(
  target: BsosKnowledgeTarget,
  content: string,
  supabase: ReturnType<typeof createClient>
): Promise<{ passed: boolean; reason?: string }> {
  const contentHash = hashContent(content);

  const { data } = await supabase
    .from("memory_write_audit")
    .select("company_id, namespace")
    .eq("content_hash", contentHash)
    .neq("company_id", target.companyId)
    .limit(1);

  if (data && data.length > 0) {
    return {
      passed: false,
      reason: `Content hash ${contentHash} already exists in namespace ${data[0].namespace} for company ${data[0].company_id}`,
    };
  }

  if (!target.containerTag.startsWith(bsosCompanyContainerTag(target.companySlug))) {
    return {
      passed: false,
      reason: `containerTag ${target.containerTag} does not match company slug ${target.companySlug}`,
    };
  }

  return { passed: true };
}

async function logContaminationFailure(
  target: BsosKnowledgeTarget,
  reason: string,
  supabase: ReturnType<typeof createClient>
): Promise<void> {
  await supabase.from("memory_write_audit").insert({
    company_id: target.companyId,
    namespace: target.containerTag,
    container_tag: target.containerTag,
    content_hash: "FAILED",
    provenance: {},
    confidence: 0,
    is_inference: false,
    contamination_check_passed: false,
    contamination_reason: reason,
  });
}

function hashContent(content: string): string {
  return `bsos_${createHash("sha256").update(content).digest("hex").slice(0, 24)}`;
}
