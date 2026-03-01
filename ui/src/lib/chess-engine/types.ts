/**
 * Chess Engine Scoring Types
 *
 * Campaign evaluation using chess engine metaphor.
 * Centipawn values from BLITZSCALE_OS_MASTER_ARCHITECTURE.md.
 */

/** Centipawn material values for campaign components */
export const MATERIAL_VALUES = {
  /** Verified email with engagement history */
  VERIFIED_ENGAGED_LEAD: 9,
  /** Verified email, no prior engagement */
  VERIFIED_COLD_LEAD: 5,
  /** Unverified or catch-all email */
  UNVERIFIED_LEAD: 3,
  /** Bounced or invalid */
  DEAD_LEAD: 0,
  /** Multi-step sequence with personalization */
  RICH_SEQUENCE: 7,
  /** Basic template sequence */
  BASIC_SEQUENCE: 3,
  /** Warmed domain with good reputation */
  WARM_DOMAIN: 5,
  /** New or cold domain */
  COLD_DOMAIN: 2,
  /** Active Calendly/booking link */
  BOOKING_LINK: 4,
  /** CRM integration active */
  CRM_CONNECTED: 3,
} as const;

/** Position evaluation factors — each is 0.0 to 1.0 multiplier */
export interface PositionFactors {
  /** How well targets match the ICP (0-1) */
  icpAlignment: number;
  /** Timing: day-of-week, time-of-day, seasonality (0-1) */
  timing: number;
  /** Competitive position in prospect's inbox (0-1) */
  competitivePosition: number;
  /** Depth of engagement signals (opens, clicks, replies) (0-1) */
  engagementDepth: number;
  /** List health: bounce rate, spam complaints (0-1) */
  listHealth: number;
}

/** Breakdown of material value by component */
export interface MaterialBreakdown {
  leads: {
    verified_engaged: number;
    verified_cold: number;
    unverified: number;
    dead: number;
    total_value: number;
  };
  sequence: {
    steps: number;
    has_personalization: boolean;
    value: number;
  };
  infrastructure: {
    domain_value: number;
    booking_link: boolean;
    crm_connected: boolean;
    total_value: number;
  };
  total_material: number;
}

/** Mobility score — available action space */
export interface MobilityScore {
  /** Number of available follow-up sequences */
  availableSequences: number;
  /** Number of untapped ICP segments */
  untappedSegments: number;
  /** Channels available (email, LinkedIn, phone) */
  activeChannels: number;
  /** Normalized 0-1 */
  score: number;
}

/** Full evaluation result for a campaign */
export interface EvaluationResult {
  campaignId: string;
  campaignName: string;
  /** Raw material score */
  material: MaterialBreakdown;
  /** Position multiplier factors */
  position: PositionFactors;
  /** Combined position multiplier (product of factors) */
  positionMultiplier: number;
  /** Mobility assessment */
  mobility: MobilityScore;
  /** Tempo bonus: speed to first touch (0-100) */
  tempoBonus: number;
  /** Final composite score: (material * position * mobility) + tempo */
  campaignScore: number;
  /** Win probability: sigmoid(score/2000) * 100 */
  winProbability: number;
  /** Expected revenue: winProbability * targetACV / 100 */
  expectedRevenue: number;
  /** Target ACV used in calculation */
  targetAcv: number;
  /** Human-readable grade: A+ through F */
  grade: string;
  /** Color for UI: green / amber / red */
  color: "green" | "amber" | "red";
  /** Top 3 improvement recommendations */
  recommendations: string[];
  evaluatedAt: string;
}

/** Input data for the evaluator */
export interface CampaignEvalInput {
  campaignId: string;
  campaignName: string;
  /** Total leads in campaign */
  totalLeads: number;
  /** Leads with verified emails */
  verifiedLeads: number;
  /** Leads with prior engagement */
  engagedLeads: number;
  /** Bounced/invalid count */
  bouncedLeads: number;
  /** Number of sequence steps */
  sequenceSteps: number;
  /** Whether sequence has personalization tokens */
  hasPersonalization: boolean;
  /** Domain reputation score (0-100 from inboxing health) */
  domainHealth: number;
  /** Whether booking link is configured */
  hasBookingLink: boolean;
  /** Whether CRM is connected */
  hasCrmConnection: boolean;
  /** Open rate (0-1) */
  openRate: number;
  /** Click rate (0-1) */
  clickRate: number;
  /** Reply rate (0-1) */
  replyRate: number;
  /** Positive reply rate (0-1) */
  positiveReplyRate: number;
  /** Bounce rate (0-1) */
  bounceRate: number;
  /** ICP match percentage (0-1) */
  icpMatchRate: number;
  /** Days since campaign started */
  daysSinceStart: number;
  /** Target ACV for revenue projection */
  targetAcv: number;
  /** Number of available alternative sequences */
  alternativeSequences: number;
  /** Number of ICP segments not yet targeted */
  untappedSegments: number;
  /** Number of active outreach channels */
  activeChannels: number;
}
