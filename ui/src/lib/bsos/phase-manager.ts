/**
 * BSOS Phase Manager
 * Manages campaign optimization phases:
 *   cold_start → discovery → signal_accumulation → optimization → scaling
 *
 * Phase transitions are SUGGESTED, not automatic.
 * The agent surfaces recommendations; humans approve.
 */

import { getAdminClient } from "./db";
import type { CampaignPhase, PhaseTransition, PhaseConfig } from "./types";

// Phase thresholds
const PHASE_THRESHOLDS = {
  cold_start: {
    minSent: 0,
    maxSent: 200,
    minReplies: 0,
    description: "Initial warmup — gathering baseline data",
  },
  discovery: {
    minSent: 200,
    maxSent: 1000,
    minReplies: 5,
    description: "Discovering patterns — enough signal to learn from",
  },
  signal_accumulation: {
    minSent: 1000,
    maxSent: 5000,
    minReplies: 20,
    description: "Accumulating signal — bandit converging",
  },
  optimization: {
    minSent: 5000,
    maxSent: 20000,
    minReplies: 50,
    description: "Active optimization — exploiting learned patterns",
  },
  scaling: {
    minSent: 20000,
    maxSent: Infinity,
    minReplies: 100,
    description: "Scaling — high confidence, maximize volume",
  },
};

/**
 * Determine what phase a campaign is currently in based on its metrics.
 */
export function determinePhase(
  totalSent: number,
  totalReplies: number
): CampaignPhase {
  if (totalSent < 200) return "cold_start";
  if (totalSent < 1000 || totalReplies < 5) return "discovery";
  if (totalSent < 5000 || totalReplies < 20) return "signal_accumulation";
  if (totalSent < 20000 || totalReplies < 50) return "optimization";
  return "scaling";
}

/**
 * Check if a campaign is ready to transition to the next phase.
 * Returns a PhaseTransition suggestion if ready, null if not.
 */
export function checkPhaseTransition(
  currentPhase: CampaignPhase,
  totalSent: number,
  totalReplies: number,
  hceScore: number
): PhaseTransition | null {
  const phases: CampaignPhase[] = [
    "cold_start",
    "discovery",
    "signal_accumulation",
    "optimization",
    "scaling",
  ];

  const currentIndex = phases.indexOf(currentPhase);
  if (currentIndex === phases.length - 1) return null; // already at max phase

  const nextPhase = phases[currentIndex + 1];
  const nextThreshold = PHASE_THRESHOLDS[nextPhase];

  const isReadyBySent = totalSent >= nextThreshold.minSent;
  const isReadyByReplies = totalReplies >= nextThreshold.minReplies;
  const isHealthy = hceScore >= 0.35; // must be at least "developing"

  if (isReadyBySent && isReadyByReplies && isHealthy) {
    return {
      fromPhase: currentPhase,
      toPhase: nextPhase,
      reason: `Campaign has reached thresholds for ${nextPhase}: ${totalSent} sent, ${totalReplies} replies, HCE=${hceScore.toFixed(2)}`,
      readyAt: new Date().toISOString(),
      requiresApproval: true, // Always suggest, never auto-transition
    };
  }

  return null;
}

/**
 * Get the configuration for a campaign phase.
 */
export function getPhaseConfig(phase: CampaignPhase): PhaseConfig {
  return {
    phase,
    description: PHASE_THRESHOLDS[phase].description,
    volumeMultiplier: getVolumeMultiplier(phase),
    explorationRate: getExplorationRate(phase),
    minSent: PHASE_THRESHOLDS[phase].minSent,
    maxSent: PHASE_THRESHOLDS[phase].maxSent,
  };
}

function getVolumeMultiplier(phase: CampaignPhase): number {
  switch (phase) {
    case "cold_start": return 0.3;
    case "discovery": return 0.5;
    case "signal_accumulation": return 0.7;
    case "optimization": return 0.9;
    case "scaling": return 1.0;
  }
}

function getExplorationRate(phase: CampaignPhase): number {
  // Thompson Sampling naturally handles exploration, but we bias early phases
  switch (phase) {
    case "cold_start": return 0.9; // high exploration
    case "discovery": return 0.7;
    case "signal_accumulation": return 0.5;
    case "optimization": return 0.3;
    case "scaling": return 0.1; // mostly exploitation
  }
}

/**
 * Load current phase for a campaign from the database.
 */
export async function loadCampaignPhase(
  companyId: string,
  campaignId: string
): Promise<CampaignPhase> {
  const db = getAdminClient();

  const { data } = await db
    .from("campaign_phases")
    .select("current_phase")
    .eq("company_id", companyId)
    .eq("campaign_id", campaignId)
    .single();

  return (data?.current_phase as CampaignPhase) || "cold_start";
}

/**
 * Save a phase transition (after human approval).
 */
export async function savePhaseTrans(
  companyId: string,
  campaignId: string,
  transition: PhaseTransition
): Promise<void> {
  const db = getAdminClient();
  const now = new Date().toISOString();

  await db.from("campaign_phases").upsert({
    company_id: companyId,
    campaign_id: campaignId,
    current_phase: transition.toPhase,
    previous_phase: transition.fromPhase,
    transitioned_at: now,
    transition_reason: transition.reason,
  });
}

export async function getOptimizationState(
  companyId: string,
  campaignId: string
): Promise<Record<string, any>> {
  const db = getAdminClient();
  const { data } = await db
    .from("campaign_phases")
    .select("*")
    .eq("company_id", companyId)
    .eq("campaign_id", campaignId)
    .maybeSingle();

  if (data) return data;
  return {
    company_id: companyId,
    campaign_id: campaignId,
    current_phase: "cold_start",
    optimization_mode: "suggest",
    signal_quality_score: null,
    trust_level: null,
  };
}

export async function setOptimizationMode(
  companyId: string,
  campaignId: string,
  mode: "manual" | "suggest" | "optimize"
): Promise<Record<string, any>> {
  const db = getAdminClient();
  const now = new Date().toISOString();
  await db.from("campaign_phases").upsert({
    company_id: companyId,
    campaign_id: campaignId,
    optimization_mode: mode,
    updated_at: now,
  });
  return getOptimizationState(companyId, campaignId);
}

export async function advancePhase(
  companyId: string,
  campaignId: string
): Promise<Record<string, any>> {
  const current = await loadCampaignPhase(companyId, campaignId);
  const nextMap: Record<CampaignPhase, CampaignPhase> = {
    cold_start: "discovery",
    discovery: "signal_accumulation",
    signal_accumulation: "optimization",
    optimization: "scaling",
    scaling: "scaling",
  };
  const next = nextMap[current];
  if (next === current) return getOptimizationState(companyId, campaignId);

  await savePhaseTrans(companyId, campaignId, {
    fromPhase: current,
    toPhase: next,
    reason: "Manual phase advance",
    readyAt: new Date().toISOString(),
    requiresApproval: true,
  });

  return getOptimizationState(companyId, campaignId);
}

export async function checkPhaseTransitionForCampaign(
  companyId: string,
  campaignId: string
): Promise<PhaseTransition | null> {
  const db = getAdminClient();
  const current = await loadCampaignPhase(companyId, campaignId);

  const { data: signals } = await db
    .from("campaign_signals")
    .select("signal_type")
    .eq("company_id", companyId)
    .eq("campaign_id", campaignId);

  const sent = (signals || []).filter((s) => s.signal_type === "open").length;
  const replies = (signals || []).filter((s) => s.signal_type === "reply").length;
  const replyRate = sent > 0 ? replies / sent : 0;
  const hceApprox = Math.min(1, replyRate / 0.05);

  return checkPhaseTransition(current, sent, replies, hceApprox);
}
