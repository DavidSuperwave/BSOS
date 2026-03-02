/**
 * BSOS Cold Start Manager
 * Handles the cold start period for new campaigns/companies:
 *   - Pessimistic defaults (assume bad until proven good)
 *   - Industry priors when available
 *   - Gradual volume ramp-up
 *   - Early exit conditions (if signals are strong)
 */

import { getAdminClient } from "./db";
import { initializeBanditArm } from "./bandit-engine";
import type { ColdStartConfig, IndustryPrior } from "./types";

// Default pessimistic prior (1 success in 50 trials)
const DEFAULT_ALPHA = 1;
const DEFAULT_BETA = 49;

// Industry priors for B2B email (estimated from industry benchmarks)
const INDUSTRY_PRIORS: Record<string, IndustryPrior> = {
  saas: { alpha: 2, beta: 46, replyRateEstimate: 0.04 },
  fintech: { alpha: 1.5, beta: 47, replyRateEstimate: 0.03 },
  ecommerce: { alpha: 1, beta: 49, replyRateEstimate: 0.02 },
  healthcare: { alpha: 1, beta: 49, replyRateEstimate: 0.02 },
  default: { alpha: DEFAULT_ALPHA, beta: DEFAULT_BETA, replyRateEstimate: 0.02 },
};

// Ramp-up schedule: day → volume multiplier
const RAMP_SCHEDULE = [
  { day: 1, multiplier: 0.1 },
  { day: 3, multiplier: 0.2 },
  { day: 7, multiplier: 0.35 },
  { day: 14, multiplier: 0.5 },
  { day: 21, multiplier: 0.7 },
  { day: 30, multiplier: 1.0 },
];

/**
 * Initialize a new company with cold-start configuration.
 * Creates bandit arms for all active campaigns.
 */
export async function initializeColdStart(
  companyId: string,
  industry?: string
): Promise<ColdStartConfig> {
  const db = getAdminClient();
  const now = new Date().toISOString();

  // Get industry priors
  const prior = INDUSTRY_PRIORS[industry?.toLowerCase() || "default"] || INDUSTRY_PRIORS.default;

  // Get active campaigns
  const { data: campaigns } = await db
    .from("campaigns")
    .select("id")
    .eq("company_id", companyId)
    .eq("status", "active");

  // Initialize bandit arms for each campaign
  for (const campaign of campaigns || []) {
    await initializeBanditArm(
      companyId,
      campaign.id,
      prior.alpha,
      prior.beta
    );
  }

  // Store cold-start config
  const config: ColdStartConfig = {
    companyId,
    startedAt: now,
    industry: industry || "default",
    priorAlpha: prior.alpha,
    priorBeta: prior.beta,
    estimatedReplyRate: prior.replyRateEstimate,
    currentMultiplier: RAMP_SCHEDULE[0].multiplier,
    isComplete: false,
  };

  await db.from("cold_start_configs").upsert({
    company_id: companyId,
    started_at: now,
    industry: config.industry,
    prior_alpha: config.priorAlpha,
    prior_beta: config.priorBeta,
    current_multiplier: config.currentMultiplier,
    is_complete: false,
  });

  return config;
}

/**
 * Get the current volume multiplier for a company based on days since cold start.
 */
export function getColdStartMultiplier(
  startedAt: string,
  now: Date = new Date()
): number {
  const daysSince = (now.getTime() - new Date(startedAt).getTime()) / (1000 * 60 * 60 * 24);

  // Find the appropriate ramp stage
  let multiplier = RAMP_SCHEDULE[0].multiplier;
  for (const stage of RAMP_SCHEDULE) {
    if (daysSince >= stage.day) {
      multiplier = stage.multiplier;
    }
  }

  return multiplier;
}

/**
 * Check if a company has exited cold start (enough signals accumulated).
 */
export function checkColdStartExit(
  totalSent: number,
  totalReplies: number,
  bounceRate: number
): { shouldExit: boolean; reason: string } {
  if (totalSent < 100) {
    return { shouldExit: false, reason: "Not enough sends yet (need 100)" };
  }

  if (bounceRate > 0.05) {
    return {
      shouldExit: false,
      reason: `Bounce rate too high (${(bounceRate * 100).toFixed(1)}%) — fix deliverability first`,
    };
  }

  if (totalReplies >= 5 && totalSent >= 200) {
    return {
      shouldExit: true,
      reason: `Cold start complete: ${totalSent} sent, ${totalReplies} replies, ${(bounceRate * 100).toFixed(1)}% bounce rate`,
    };
  }

  return {
    shouldExit: false,
    reason: `Need more signal: ${totalReplies}/5 replies, ${totalSent}/200 sends`,
  };
}

/**
 * Mark cold start as complete for a company.
 */
export async function completeColdStart(
  companyId: string,
  reason: string
): Promise<void> {
  const db = getAdminClient();
  const now = new Date().toISOString();

  await db
    .from("cold_start_configs")
    .update({
      is_complete: true,
      completed_at: now,
      completion_reason: reason,
    })
    .eq("company_id", companyId);
}
