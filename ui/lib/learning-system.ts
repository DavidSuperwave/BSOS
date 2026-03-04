import { getAdminClient } from "./db";

export type SignalCategory =
  | "Infrastructure"
  | "Campaign_Performance"
  | "Lead_Quality"
  | "Content"
  | "Competitive_Market"
  | "Pipeline";

export interface LearningEntry {
  id: string;
  company_id: string;
  entry_type: SignalCategory;
  content: string;
  confidence_score: number;
  evidence_count: number;
  source_campaign_ids: string[];
  source_skill: string;
  valid_from: string;
  valid_until: string | null;
  last_reinforced_at: string;
  created_at: string;
  updated_at: string;
}

export interface RecordLearningParams {
  companyId: string;
  entryType: SignalCategory;
  content: string;
  confidence: number;
  evidenceCount: number;
  sourceCampaignIds: string[];
  sourceSkill: string;
}

export interface RecordOutcomePairParams {
  companyId: string;
  actionType: string;
  actionDetail: string;
  predictedOutcome: number;
  wasApproved: boolean;
}

const CATEGORIES: SignalCategory[] = [
  "Infrastructure",
  "Campaign_Performance",
  "Lead_Quality",
  "Content",
  "Competitive_Market",
  "Pipeline",
];

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

function contentSimilarity(a: string, b: string): number {
  const tA = new Set(a.toLowerCase().split(/\W+/).filter(Boolean));
  const tB = new Set(b.toLowerCase().split(/\W+/).filter(Boolean));
  if (!tA.size || !tB.size) return 0;

  let overlap = 0;
  for (const token of tA) {
    if (tB.has(token)) overlap += 1;
  }

  const union = new Set([...tA, ...tB]).size;
  return union ? overlap / union : 0;
}

async function logTrace(companyId: string, action: string, payload: Record<string, unknown>): Promise<void> {
  try {
    const supabase = await getAdminClient();
    await supabase.from("agent_trace_logs").insert({
      company_id: companyId,
      action,
      payload,
      created_at: new Date().toISOString(),
    });
  } catch {
    // Non-fatal logging failure.
  }
}

/**
 * Record or reinforce a learning entry.
 */
export async function recordLearning(params: RecordLearningParams): Promise<LearningEntry> {
  const supabase = await getAdminClient();
  const now = new Date().toISOString();

  try {
    const { data: candidates } = await supabase
      .from("learning_entries")
      .select("*")
      .eq("company_id", params.companyId)
      .eq("entry_type", params.entryType)
      .is("valid_until", null)
      .limit(200);

    const inputContent = params.content.trim();
    const similar = (candidates ?? []).find((row: any) => contentSimilarity(row.content ?? "", inputContent) >= 0.72);

    if (similar?.id) {
      const updatedEvidence = Number(similar.evidence_count ?? 0) + Math.max(1, params.evidenceCount);
      const updatedConfidence = clamp01(
        (Number(similar.confidence_score ?? 0.5) * Number(similar.evidence_count ?? 1) + params.confidence * Math.max(1, params.evidenceCount)) /
          (Number(similar.evidence_count ?? 1) + Math.max(1, params.evidenceCount)),
      );

      const mergedCampaignIds = Array.from(
        new Set([...(similar.source_campaign_ids ?? []), ...(params.sourceCampaignIds ?? [])]),
      );

      const { data: updated, error } = await supabase
        .from("learning_entries")
        .update({
          evidence_count: updatedEvidence,
          confidence_score: updatedConfidence,
          source_campaign_ids: mergedCampaignIds,
          source_skill: params.sourceSkill || similar.source_skill,
          last_reinforced_at: now,
          updated_at: now,
        })
        .eq("id", similar.id)
        .select("*")
        .single();

      if (error) throw error;

      await logTrace(params.companyId, "learning_reinforced", { id: updated.id, entryType: params.entryType });
      return updated as LearningEntry;
    }

    const { data: inserted, error } = await supabase
      .from("learning_entries")
      .insert({
        company_id: params.companyId,
        entry_type: params.entryType,
        content: inputContent,
        confidence_score: clamp01(params.confidence),
        evidence_count: Math.max(1, params.evidenceCount),
        source_campaign_ids: params.sourceCampaignIds ?? [],
        source_skill: params.sourceSkill,
        valid_from: now,
        valid_until: null,
        last_reinforced_at: now,
        created_at: now,
        updated_at: now,
      })
      .select("*")
      .single();

    if (error) throw error;

    await logTrace(params.companyId, "learning_recorded", { id: inserted.id, entryType: params.entryType });
    return inserted as LearningEntry;
  } catch (error) {
    await logTrace(params.companyId, "learning_record_error", {
      error: error instanceof Error ? error.message : "Unknown error",
      entryType: params.entryType,
    });
    throw error;
  }
}

/**
 * Retrieve active learning entries by optional filters.
 */
export async function getLearnings(
  companyId: string,
  entryType?: SignalCategory,
  minConfidence?: number,
): Promise<LearningEntry[]> {
  const supabase = await getAdminClient();

  try {
    let query = supabase
      .from("learning_entries")
      .select("*")
      .eq("company_id", companyId)
      .is("valid_until", null)
      .order("confidence_score", { ascending: false });

    if (entryType) query = query.eq("entry_type", entryType);
    if (typeof minConfidence === "number") query = query.gte("confidence_score", clamp01(minConfidence));

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as LearningEntry[];
  } catch (error) {
    await logTrace(companyId, "learning_get_error", {
      error: error instanceof Error ? error.message : "Unknown error",
      entryType: entryType ?? null,
      minConfidence: minConfidence ?? null,
    });
    return [];
  }
}

/**
 * Monthly confidence decay and expiry processing.
 */
export async function decayLearnings(companyId: string): Promise<{ decayed: number; expired: number }> {
  const supabase = await getAdminClient();
  const now = new Date();
  const nowIso = now.toISOString();
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - 30);

  try {
    const { data: entries } = await supabase
      .from("learning_entries")
      .select("id,confidence_score,last_reinforced_at")
      .eq("company_id", companyId)
      .is("valid_until", null);

    let decayed = 0;
    let expired = 0;

    for (const row of entries ?? []) {
      const lastReinforced = new Date(row.last_reinforced_at ?? row.updated_at ?? row.created_at ?? nowIso);
      if (lastReinforced > cutoff) continue;

      const newConfidence = clamp01(Number(row.confidence_score ?? 0.5) * 0.95);
      decayed += 1;

      if (newConfidence < 0.2) {
        await supabase
          .from("learning_entries")
          .update({
            confidence_score: newConfidence,
            valid_until: nowIso,
            updated_at: nowIso,
          })
          .eq("id", row.id);
        expired += 1;
      } else {
        await supabase
          .from("learning_entries")
          .update({
            confidence_score: newConfidence,
            updated_at: nowIso,
          })
          .eq("id", row.id);
      }
    }

    await logTrace(companyId, "learning_decay", { decayed, expired });
    return { decayed, expired };
  } catch (error) {
    await logTrace(companyId, "learning_decay_error", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return { decayed: 0, expired: 0 };
  }
}

/**
 * Record action/outcome prediction pair.
 */
export async function recordOutcomePair(params: RecordOutcomePairParams): Promise<void> {
  const supabase = await getAdminClient();
  const now = new Date().toISOString();

  try {
    await supabase.from("action_outcome_pairs").insert({
      company_id: params.companyId,
      action_type: params.actionType,
      action_detail: params.actionDetail,
      predicted_outcome: params.predictedOutcome,
      actual_outcome: null,
      was_approved: params.wasApproved,
      created_at: now,
      updated_at: now,
    });

    await logTrace(params.companyId, "outcome_pair_recorded", {
      actionType: params.actionType,
      actionDetail: params.actionDetail,
    });
  } catch (error) {
    await logTrace(params.companyId, "outcome_pair_record_error", {
      error: error instanceof Error ? error.message : "Unknown error",
      actionType: params.actionType,
    });
  }
}

/**
 * Update actual outcome and feed delta back into the learning system.
 */
export async function updateOutcome(pairId: string, actualOutcome: number): Promise<{ delta: number }> {
  const supabase = await getAdminClient();

  try {
    const { data: pair, error } = await supabase
      .from("action_outcome_pairs")
      .select("*")
      .eq("id", pairId)
      .single();

    if (error || !pair) throw error ?? new Error("Outcome pair not found.");

    const predicted = Number(pair.predicted_outcome ?? 0);
    const actual = Number(actualOutcome ?? 0);
    const delta = actual - predicted;

    await supabase
      .from("action_outcome_pairs")
      .update({
        actual_outcome: actual,
        updated_at: new Date().toISOString(),
      })
      .eq("id", pairId);

    const confidence = clamp01(1 - Math.min(1, Math.abs(delta)));

    await recordLearning({
      companyId: pair.company_id,
      entryType: "Campaign_Performance",
      content: `Action ${pair.action_type} (${pair.action_detail}) predicted ${predicted.toFixed(3)} vs actual ${actual.toFixed(3)} (delta ${delta.toFixed(3)}).`,
      confidence,
      evidenceCount: 1,
      sourceCampaignIds: [],
      sourceSkill: "learning-system:updateOutcome",
    });

    await logTrace(pair.company_id, "outcome_pair_updated", { pairId, delta, actualOutcome: actual });
    return { delta };
  } catch (error) {
    await logTrace("unknown", "outcome_pair_update_error", {
      pairId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return { delta: 0 };
  }
}

/**
 * Measure quality of learning signal coverage and depth.
 */
export async function getSignalQuality(
  companyId: string,
): Promise<{ quality_score: number; signal_count: number; categories: Record<string, number> }> {
  const supabase = await getAdminClient();

  try {
    const { data: entries } = await supabase
      .from("learning_entries")
      .select("entry_type,evidence_count,confidence_score")
      .eq("company_id", companyId)
      .is("valid_until", null);

    const categoryCounts: Record<string, number> = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));

    let weightedEvidence = 0;
    for (const row of entries ?? []) {
      const type = row.entry_type as SignalCategory;
      if (categoryCounts[type] === undefined) categoryCounts[type] = 0;
      categoryCounts[type] += 1;
      weightedEvidence += Number(row.evidence_count ?? 1) * Number(row.confidence_score ?? 0.5);
    }

    const coverage = Object.values(categoryCounts).filter((n) => n > 0).length / CATEGORIES.length;
    const depthNorm = Math.min(1, weightedEvidence / 300);
    const qualityScore = Math.round((coverage * 0.6 + depthNorm * 0.4) * 100);

    return {
      quality_score: qualityScore,
      signal_count: (entries ?? []).length,
      categories: categoryCounts,
    };
  } catch (error) {
    await logTrace(companyId, "signal_quality_error", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return {
      quality_score: 0,
      signal_count: 0,
      categories: Object.fromEntries(CATEGORIES.map((c) => [c, 0])),
    };
  }
}

/**
 * Determine learning maturity phase by active entry volume.
 */
export async function determinePhase(
  companyId: string,
): Promise<"cold_start" | "discovery" | "signal_accumulation" | "optimization" | "scaling"> {
  const supabase = await getAdminClient();

  try {
    const { count } = await supabase
      .from("learning_entries")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .is("valid_until", null);

    const n = Number(count ?? 0);
    if (n < 10) return "cold_start";
    if (n < 50) return "discovery";
    if (n < 200) return "signal_accumulation";
    if (n < 500) return "optimization";
    return "scaling";
  } catch (error) {
    await logTrace(companyId, "determine_phase_error", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return "cold_start";
  }
}
