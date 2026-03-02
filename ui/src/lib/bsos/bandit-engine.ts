/**
 * BSOS Bandit Engine — Thompson Sampling
 * EmailCampaignBandit for campaign volume allocation.
 * Pessimistic cold-start (beta=49), Ebbinghaus decay, industry priors.
 *
 * This is the decision-making engine for BSOS.
 * It allocates sending volume across campaigns probabilistically.
 */

import { getAdminClient } from "./db";
import type { BanditArm, BanditAllocation, BanditState } from "./types";

// Pessimistic cold-start: assume 1 success out of 50 trials
const COLD_START_ALPHA = 1;
const COLD_START_BETA = 49;

// Ebbinghaus decay constant (daily)
const DECAY_HALF_LIFE_DAYS = 14;
const DECAY_CONSTANT = Math.LN2 / DECAY_HALF_LIFE_DAYS;

/**
 * Thompson Sampling: draw a sample from Beta(alpha, beta)
 * Uses the Johnk method for Beta sampling.
 */
function betaSample(alpha: number, beta: number): number {
  // Use the relationship between Gamma and Beta distributions
  // Beta(a,b) = Gamma(a) / (Gamma(a) + Gamma(b))
  const g1 = gammaSample(alpha);
  const g2 = gammaSample(beta);
  return g1 / (g1 + g2);
}

/**
 * Marsaglia and Tsang's method for Gamma sampling.
 */
function gammaSample(shape: number): number {
  if (shape < 1) {
    return gammaSample(1 + shape) * Math.pow(Math.random(), 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  while (true) {
    let x: number;
    let v: number;
    do {
      x = normalSample();
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = Math.random();
    if (u < 1 - 0.0331 * (x * x) * (x * x)) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

/**
 * Box-Muller transform for standard normal sampling.
 */
function normalSample(): number {
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Apply Ebbinghaus decay to reduce confidence over time.
 */
function applyDecay(
  alpha: number,
  beta: number,
  daysSinceLastUpdate: number
): { alpha: number; beta: number } {
  const decayFactor = Math.exp(-DECAY_CONSTANT * daysSinceLastUpdate);
  // Decay both parameters toward the cold-start prior
  const decayedAlpha = COLD_START_ALPHA + (alpha - COLD_START_ALPHA) * decayFactor;
  const decayedBeta = COLD_START_BETA + (beta - COLD_START_BETA) * decayFactor;
  return { alpha: decayedAlpha, beta: decayedBeta };
}

/**
 * Load bandit state for a company from the database.
 */
export async function loadBanditState(companyId: string): Promise<BanditState> {
  const db = getAdminClient();

  const { data: arms } = await db
    .from("bandit_arms")
    .select("*")
    .eq("company_id", companyId);

  const armMap: Record<string, BanditArm> = {};
  for (const arm of arms || []) {
    armMap[arm.campaign_id] = {
      campaignId: arm.campaign_id,
      alpha: arm.alpha,
      beta: arm.beta,
      lastUpdated: arm.last_updated,
      totalPulls: arm.total_pulls,
      totalRewards: arm.total_rewards,
    };
  }

  return { companyId, arms: armMap };
}

/**
 * Allocate volume across campaigns using Thompson Sampling.
 * Returns proportional allocations that sum to 1.0.
 */
export function allocateVolume(
  state: BanditState,
  totalVolume: number,
  now: Date = new Date()
): BanditAllocation[] {
  const campaignIds = Object.keys(state.arms);
  if (campaignIds.length === 0) return [];

  const samples: Record<string, number> = {};

  for (const campaignId of campaignIds) {
    const arm = state.arms[campaignId];
    const daysSince = arm.lastUpdated
      ? (now.getTime() - new Date(arm.lastUpdated).getTime()) / (1000 * 60 * 60 * 24)
      : 0;

    const { alpha, beta } = applyDecay(arm.alpha, arm.beta, daysSince);
    samples[campaignId] = betaSample(alpha, beta);
  }

  // Normalize samples to proportions
  const total = Object.values(samples).reduce((a, b) => a + b, 0);

  return campaignIds.map((campaignId) => ({
    campaignId,
    proportion: samples[campaignId] / total,
    allocatedVolume: Math.round((samples[campaignId] / total) * totalVolume),
    sample: samples[campaignId],
  }));
}

/**
 * Update bandit arm after observing a reward (reply/engagement).
 */
export async function updateBanditArm(
  companyId: string,
  campaignId: string,
  successes: number,
  trials: number
): Promise<void> {
  const db = getAdminClient();
  const now = new Date().toISOString();

  // Upsert the arm with updated alpha/beta
  const { data: existing } = await db
    .from("bandit_arms")
    .select("alpha, beta, total_pulls, total_rewards")
    .eq("company_id", companyId)
    .eq("campaign_id", campaignId)
    .single();

  const currentAlpha = existing?.alpha ?? COLD_START_ALPHA;
  const currentBeta = existing?.beta ?? COLD_START_BETA;

  await db.from("bandit_arms").upsert({
    company_id: companyId,
    campaign_id: campaignId,
    alpha: currentAlpha + successes,
    beta: currentBeta + (trials - successes),
    total_pulls: (existing?.total_pulls ?? 0) + trials,
    total_rewards: (existing?.total_rewards ?? 0) + successes,
    last_updated: now,
  });
}

/**
 * Initialize a new campaign arm with cold-start priors.
 */
export async function initializeBanditArm(
  companyId: string,
  campaignId: string,
  industryPriorAlpha?: number,
  industryPriorBeta?: number
): Promise<void> {
  const db = getAdminClient();
  const now = new Date().toISOString();

  await db.from("bandit_arms").upsert({
    company_id: companyId,
    campaign_id: campaignId,
    alpha: industryPriorAlpha ?? COLD_START_ALPHA,
    beta: industryPriorBeta ?? COLD_START_BETA,
    total_pulls: 0,
    total_rewards: 0,
    last_updated: now,
  });
}
