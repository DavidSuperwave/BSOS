import { createClient } from "@supabase/supabase-js";

export type BsosRelationType =
  | "informed"
  | "generated"
  | "references"
  | "distilled_into"
  | "derived_from"
  | "supersedes";

export async function createKnowledgeLink(params: {
  companyId: string;
  sourceType: string;
  sourceId: string;
  targetType: string;
  targetId: string;
  relationType: BsosRelationType;
  supabase: ReturnType<typeof createClient>;
}): Promise<string> {
  const { data, error } = await params.supabase
    .from("knowledge_links")
    .insert({
      company_id: params.companyId,
      source_type: params.sourceType,
      source_id: params.sourceId,
      target_type: params.targetType,
      target_id: params.targetId,
      relation_type: params.relationType,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(`Knowledge link creation failed: ${error?.message || "unknown error"}`);
  }

  return data.id;
}

export async function getLinkedArtifacts(params: {
  companyId: string;
  artifactType: string;
  artifactId: string;
  direction: "outgoing" | "incoming" | "both";
  supabase: ReturnType<typeof createClient>;
}): Promise<Array<{ type: string; id: string; relation: string; direction: string }>> {
  const results: Array<{ type: string; id: string; relation: string; direction: string }> = [];

  if (params.direction === "outgoing" || params.direction === "both") {
    const { data } = await params.supabase
      .from("knowledge_links")
      .select("target_type, target_id, relation_type")
      .eq("company_id", params.companyId)
      .eq("source_type", params.artifactType)
      .eq("source_id", params.artifactId);

    if (data) {
      results.push(
        ...data.map((row: any) => ({
          type: row.target_type,
          id: row.target_id,
          relation: row.relation_type,
          direction: "outgoing",
        }))
      );
    }
  }

  if (params.direction === "incoming" || params.direction === "both") {
    const { data } = await params.supabase
      .from("knowledge_links")
      .select("source_type, source_id, relation_type")
      .eq("company_id", params.companyId)
      .eq("target_type", params.artifactType)
      .eq("target_id", params.artifactId);

    if (data) {
      results.push(
        ...data.map((row: any) => ({
          type: row.source_type,
          id: row.source_id,
          relation: row.relation_type,
          direction: "incoming",
        }))
      );
    }
  }

  return results;
}
