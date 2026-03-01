/**
 * Chess Engine Campaign Evaluator
 *
 * Scores campaigns using chess-inspired evaluation:
 * CAMPAIGN_SCORE = (MATERIAL × POSITION_MULTIPLIER × MOBILITY) + TEMPO_BONUS
 * WIN_PROBABILITY = sigmoid(CAMPAIGN_SCORE / 2000) × 100
 * EXPECTED_REVENUE = WIN_PROBABILITY × TARGET_ACV / 100
 */

import {
  MATERIAL_VALUES,
  type CampaignEvalInput,
  type EvaluationResult,
  type MaterialBreakdown,
  type PositionFactors,
  type MobilityScore,
} from "./types";

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Calculate material value from campaign components */
function evaluateMaterial(input: CampaignEvalInput): MaterialBreakdown {
  const dead = input.bouncedLeads;
  const verifiedEngaged = input.engagedLeads;
  const verifiedCold = Math.max(0, input.verifiedLeads - input.engagedLeads);
  const unverified = Math.max(
    0,
    input.totalLeads - input.verifiedLeads - dead
  );

  const leadsValue =
    verifiedEngaged * MATERIAL_VALUES.VERIFIED_ENGAGED_LEAD +
    verifiedCold * MATERIAL_VALUES.VERIFIED_COLD_LEAD +
    unverified * MATERIAL_VALUES.UNVERIFIED_LEAD +
    dead * MATERIAL_VALUES.DEAD_LEAD;

  const sequenceValue =
    input.hasPersonalization && input.sequenceSteps >= 3
      ? MATERIAL_VALUES.RICH_SEQUENCE
      : MATERIAL_VALUES.BASIC_SEQUENCE;

  const domainValue =
    input.domainHealth >= 70
      ? MATERIAL_VALUES.WARM_DOMAIN
      : MATERIAL_VALUES.COLD_DOMAIN;
  const bookingValue = input.hasBookingLink ? MATERIAL_VALUES.BOOKING_LINK : 0;
  const crmValue = input.hasCrmConnection ? MATERIAL_VALUES.CRM_CONNECTED : 0;
  const infraValue = domainValue + bookingValue + crmValue;

  return {
    leads: {
      verified_engaged: verifiedEngaged,
      verified_cold: verifiedCold,
      unverified,
      dead,
      total_value: leadsValue,
    },
    sequence: {
      steps: input.sequenceSteps,
      has_personalization: input.hasPersonalization,
      value: sequenceValue,
    },
    infrastructure: {
      domain_value: domainValue,
      booking_link: input.hasBookingLink,
      crm_connected: input.hasCrmConnection,
      total_value: infraValue,
    },
    total_material: leadsValue + sequenceValue + infraValue,
  };
}

/** Evaluate positional factors */
function evaluatePosition(input: CampaignEvalInput): PositionFactors {
  // ICP alignment: direct from input
  const icpAlignment = clamp(input.icpMatchRate, 0, 1);

  // Timing: infer from engagement signals
  // Higher open rates suggest good timing
  const timing = clamp(input.openRate * 1.5, 0, 1);

  // Competitive position: inferred from positive reply rate relative to reply rate
  const competitivePosition =
    input.replyRate > 0
      ? clamp(input.positiveReplyRate / Math.max(input.replyRate, 0.01), 0, 1)
      : 0.5; // neutral if no data

  // Engagement depth: weighted combination of signals
  const engagementDepth = clamp(
    input.openRate * 0.2 +
      input.clickRate * 0.3 +
      input.replyRate * 0.3 +
      input.positiveReplyRate * 0.2,
    0,
    1
  );

  // List health: inverse of bounce rate
  const listHealth = clamp(1 - input.bounceRate * 5, 0, 1);

  return {
    icpAlignment,
    timing,
    competitivePosition,
    engagementDepth,
    listHealth,
  };
}

/** Calculate position multiplier as geometric mean of factors */
function positionMultiplier(factors: PositionFactors): number {
  const values = [
    factors.icpAlignment,
    factors.timing,
    factors.competitivePosition,
    factors.engagementDepth,
    factors.listHealth,
  ];

  // Use geometric mean to reward balanced position
  const product = values.reduce((acc, v) => acc * Math.max(v, 0.01), 1);
  return Math.pow(product, 1 / values.length);
}

/** Evaluate mobility (available action space) */
function evaluateMobility(input: CampaignEvalInput): MobilityScore {
  const sequenceScore = clamp(input.alternativeSequences / 5, 0, 1);
  const segmentScore = clamp(input.untappedSegments / 10, 0, 1);
  const channelScore = clamp(input.activeChannels / 3, 0, 1);

  const score = sequenceScore * 0.3 + segmentScore * 0.4 + channelScore * 0.3;

  return {
    availableSequences: input.alternativeSequences,
    untappedSegments: input.untappedSegments,
    activeChannels: input.activeChannels,
    score: clamp(score, 0.1, 1), // minimum 0.1 to avoid zeroing out
  };
}

/** Calculate tempo bonus (speed advantage) */
function evaluateTempo(input: CampaignEvalInput): number {
  // Faster campaigns that show early engagement get tempo bonus
  if (input.daysSinceStart === 0) return 50; // new campaign, neutral

  // Early engagement signals in first 14 days
  if (input.daysSinceStart <= 14) {
    const engagementVelocity =
      (input.replyRate + input.positiveReplyRate) * 100;
    return clamp(engagementVelocity * 5, 0, 100);
  }

  // After 14 days, tempo decays unless engagement is strong
  const decayFactor = Math.max(0, 1 - (input.daysSinceStart - 14) / 60);
  const engagement = (input.replyRate + input.positiveReplyRate) * 100;
  return clamp(engagement * 3 * decayFactor, 0, 80);
}

/** Assign letter grade based on score */
function gradeFromScore(score: number): string {
  if (score >= 1500) return "A+";
  if (score >= 1200) return "A";
  if (score >= 1000) return "A-";
  if (score >= 800) return "B+";
  if (score >= 600) return "B";
  if (score >= 450) return "B-";
  if (score >= 300) return "C+";
  if (score >= 200) return "C";
  if (score >= 100) return "C-";
  if (score >= 50) return "D";
  return "F";
}

/** Assign color based on score */
function colorFromScore(score: number): "green" | "amber" | "red" {
  if (score >= 600) return "green";
  if (score >= 200) return "amber";
  return "red";
}

/** Generate improvement recommendations */
function generateRecommendations(
  input: CampaignEvalInput,
  material: MaterialBreakdown,
  position: PositionFactors,
  mobility: MobilityScore
): string[] {
  const recs: string[] = [];

  // List health issues
  if (position.listHealth < 0.7) {
    recs.push(
      `Clean your list — ${material.leads.dead} bounced leads are hurting deliverability (bounce rate: ${(input.bounceRate * 100).toFixed(1)}%)`
    );
  }

  // ICP alignment
  if (position.icpAlignment < 0.6) {
    recs.push(
      `Tighten targeting — only ${(input.icpMatchRate * 100).toFixed(0)}% of leads match your ICP. Filter by title/industry to improve.`
    );
  }

  // Sequence quality
  if (!input.hasPersonalization) {
    recs.push(
      "Add personalization tokens to your sequence — personalized campaigns see 2-3x higher reply rates."
    );
  }

  if (input.sequenceSteps < 3) {
    recs.push(
      `Extend your sequence to at least 3 steps — you have ${input.sequenceSteps}. Most replies come on steps 2-4.`
    );
  }

  // Engagement
  if (position.engagementDepth < 0.3 && input.daysSinceStart > 7) {
    recs.push(
      "Low engagement signals — consider A/B testing subject lines or adjusting send times."
    );
  }

  // Infrastructure
  if (input.domainHealth < 70) {
    recs.push(
      `Domain health is ${input.domainHealth}/100 — warm up your sending domain before scaling volume.`
    );
  }

  if (!input.hasBookingLink) {
    recs.push(
      "Add a Calendly booking link — reduces friction from interested reply to booked meeting."
    );
  }

  // Mobility
  if (mobility.score < 0.3) {
    recs.push(
      "Limited expansion options — create alternative sequences or target new ICP segments to increase upside."
    );
  }

  return recs.slice(0, 3);
}

/** Main evaluation function */
export function evaluateCampaign(input: CampaignEvalInput): EvaluationResult {
  const material = evaluateMaterial(input);
  const position = evaluatePosition(input);
  const posMult = positionMultiplier(position);
  const mobility = evaluateMobility(input);
  const tempo = evaluateTempo(input);

  const campaignScore =
    material.total_material * posMult * mobility.score + tempo;
  const winProbability = sigmoid(campaignScore / 2000) * 100;
  const expectedRevenue = (winProbability * input.targetAcv) / 100;

  const recommendations = generateRecommendations(
    input,
    material,
    position,
    mobility
  );

  return {
    campaignId: input.campaignId,
    campaignName: input.campaignName,
    material,
    position,
    positionMultiplier: posMult,
    mobility,
    tempoBonus: tempo,
    campaignScore: Math.round(campaignScore),
    winProbability: Math.round(winProbability * 10) / 10,
    expectedRevenue: Math.round(expectedRevenue),
    targetAcv: input.targetAcv,
    grade: gradeFromScore(campaignScore),
    color: colorFromScore(campaignScore),
    recommendations,
    evaluatedAt: new Date().toISOString(),
  };
}
