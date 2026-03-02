/**
 * BSOS Confidence Lifecycle
 * Manages the lifecycle of learning entries:
 *   - Confidence scoring (0-1)
 *   - Evidence accumulation
 *   - Temporal validity (valid_from / valid_until)
 *   - Ebbinghaus decay
 *   - Promotion/demotion between confidence tiers
 */

import { getAdminClient } from "./db";
import type { LearningEntry, ConfidenceTier } from "./types";

// Confidence tier thresholds
const TIER_THRESHOLDS = {
  hypothesis: { min: 0.0, max: 0.35 },
  emerging: { min: 0.35, max: 0.6 },
  established: { min: 0.6, max: 0.8 },
  validated: { min: 0.8, max: 1.0 },
};

// Ebbinghaus decay constant (daily)
const DECAY_HALF_LIFE_DAYS = 30; // longer for explicit learnings vs. bandit
const DECAY_CONSTANT = Math.LN2 / DECAY_HALF_LIFE_DAYS;

// Evidence weight per signal type
const EVIDENCE_WEIGHTS = {
  reply: 1.0,
  positive_reply: 2.0,
  negative_reply: -1.5,
  open: 0.2,
  bounce: -1.0,
  manual_confirmation: 3.0,
};

/**
 * Compute the confidence score for a learning entry.
 */
export function computeConfidence(
  evidenceCount: number,
  positiveWeight: number,
  negativeWeight: number,
  daysSinceLastUpdate: number
): number {
  if (evidenceCount === 0) return 0.1; // minimal prior

  // Raw confidence: ratio of positive to total evidence weight
  const totalWeight = positiveWeight + Math.abs(negativeWeight);
  const rawConfidence = totalWeight > 0 ? positiveWeight / totalWeight : 0;

  // Apply Ebbinghaus decay
  const decayFactor = Math.exp(-DECAY_CONSTANT * daysSinceLastUpdate);
  const decayed = 0.1 + (rawConfidence - 0.1) * decayFactor;

  // Scale by evidence volume (more evidence = higher ceiling)
  const evidenceScale = Math.min(1.0, evidenceCount / 20); // 20 pieces = full confidence
  return Math.min(1.0, decayed * evidenceScale + 0.1);
}

/**
 * Classify a confidence score into a tier.
 */
export function classifyConfidenceTier(confidence: number): ConfidenceTier {
  if (confidence >= TIER_THRESHOLDS.validated.min) return "validated";
  if (confidence >= TIER_THRESHOLDS.established.min) return "established";
  if (confidence >= TIER_THRESHOLDS.emerging.min) return "emerging";
  return "hypothesis";
}

/**
 * Add evidence to a learning entry and recompute its confidence.
 */
export async function addEvidence(
  entryId: string,
  signalType: keyof typeof EVIDENCE_WEIGHTS,
  companyId: string
): Promise<LearningEntry> {
  const db = getAdminClient();

  const { data: entry, error } = await db
    .from("learning_entries")
    .select("*")
    .eq("id", entryId)
    .eq("company_id", companyId)
    .single();

  if (error || !entry) {
    throw new Error(`[ConfidenceLifecycle] Entry ${entryId} not found`);
  }

  const weight = EVIDENCE_WEIGHTS[signalType] ?? 0;
  const newPositive = entry.positive_weight + Math.max(0, weight);
  const newNegative = entry.negative_weight + Math.min(0, weight);
  const newCount = entry.evidence_count + 1;

  const now = new Date();
  const daysSince = entry.last_updated_at
    ? (now.getTime() - new Date(entry.last_updated_at).getTime()) / (1000 * 60 * 60 * 24)
    : 0;

  const newConfidence = computeConfidence(
    newCount,
    newPositive,
    newNegative,
    daysSince
  );
  const newTier = classifyConfidenceTier(newConfidence);

  const { data: updated, error: updateError } = await db
    .from("learning_entries")
    .update({
      confidence: newConfidence,
      confidence_tier: newTier,
      positive_weight: newPositive,
      negative_weight: newNegative,
      evidence_count: newCount,
      last_updated_at: now.toISOString(),
    })
    .eq("id", entryId)
    .select()
    .single();

  if (updateError || !updated) {
    throw new Error(`[ConfidenceLifecycle] Failed to update entry ${entryId}`);
  }

  return updated as LearningEntry;
}

/**
 * Decay all learning entries for a company (run daily).
 */
export async function decayAllEntries(companyId: string): Promise<void> {
  const db = getAdminClient();
  const now = new Date();

  const { data: entries } = await db
    .from("learning_entries")
    .select("id, confidence, positive_weight, negative_weight, evidence_count, last_updated_at")
    .eq("company_id", companyId);

  for (const entry of entries || []) {
    const daysSince = entry.last_updated_at
      ? (now.getTime() - new Date(entry.last_updated_at).getTime()) / (1000 * 60 * 60 * 24)
      : 0;

    if (daysSince < 1) continue; // skip if updated today

    const newConfidence = computeConfidence(
      entry.evidence_count,
      entry.positive_weight,
      entry.negative_weight,
      daysSince
    );
    const newTier = classifyConfidenceTier(newConfidence);

    await db
      .from("learning_entries")
      .update({ confidence: newConfidence, confidence_tier: newTier })
      .eq("id", entry.id);
  }
}

export async function getActiveLearnings(
  companyId: string,
  entryType?: string
): Promise<LearningEntry[]> {
  const db = getAdminClient();
  let query = db
    .from("learning_entries")
    .select("*")
    .eq("company_id", companyId)
    .or(`valid_until.is.null,valid_until.gt.${new Date().toISOString()}`)
    .order("last_updated_at", { ascending: false });

  if (entryType) query = query.eq("entry_type", entryType);
  const { data, error } = await query;
  if (error) throw new Error(`[ConfidenceLifecycle] Failed to fetch learnings: ${error.message}`);
  return (data || []) as LearningEntry[];
}

export async function recordLearning(
  companyId: string,
  entryType: string,
  content: string,
  sourceCampaignId?: string,
  initialConfidence = 0.1
): Promise<LearningEntry> {
  const db = getAdminClient();
  const now = new Date().toISOString();
  const confidence = Math.max(0, Math.min(1, initialConfidence));
  const tier = classifyConfidenceTier(confidence);

  const { data, error } = await db
    .from("learning_entries")
    .insert({
      company_id: companyId,
      entry_type: entryType,
      content,
      confidence,
      confidence_tier: tier,
      positive_weight: 0,
      negative_weight: 0,
      evidence_count: 0,
      source_campaign_id: sourceCampaignId || null,
      source_campaign_ids: sourceCampaignId ? [sourceCampaignId] : [],
      valid_from: now,
      valid_until: null,
      last_updated_at: now,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`[ConfidenceLifecycle] Failed to record learning: ${error?.message}`);
  }

  return data as LearningEntry;
}

export async function applyConfidenceDecay(
  companyId: string
): Promise<{ decayed: number; expired: number }> {
  const db = getAdminClient();
  const now = new Date();
  let decayed = 0;
  let expired = 0;

  const { data: entries } = await db
    .from("learning_entries")
    .select("id, confidence, positive_weight, negative_weight, evidence_count, last_updated_at")
    .eq("company_id", companyId);

  for (const entry of entries || []) {
    const daysSince = entry.last_updated_at
      ? (now.getTime() - new Date(entry.last_updated_at).getTime()) / (1000 * 60 * 60 * 24)
      : 0;
    if (daysSince < 1) continue;

    const confidence = computeConfidence(
      entry.evidence_count,
      entry.positive_weight,
      entry.negative_weight,
      daysSince
    );
    const tier = classifyConfidenceTier(confidence);
    const update: Record<string, any> = {
      confidence,
      confidence_tier: tier,
      last_updated_at: now.toISOString(),
    };

    if (confidence < 0.05) {
      update.valid_until = now.toISOString();
      expired++;
    }

    await db
      .from("learning_entries")
      .update(update)
      .eq("id", entry.id);
    decayed++;
  }

  return { decayed, expired };
}
