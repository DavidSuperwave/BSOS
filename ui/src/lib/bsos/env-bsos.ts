/**
 * BSOS Environment Configuration
 * Extends the existing env.ts with BSOS-specific config.
 * Uses same pattern: lazy getters, null-safe.
 */

import { env } from "@/lib/env";

export const bsosConfig = {
  telegram: {
    botToken: () => env("BSOS_TELEGRAM_BOT_TOKEN"),
    chatId: () => env("BSOS_TELEGRAM_CHAT_ID"),
  },
  cron: {
    /** Secret shared between Vercel cron and API routes */
    secret: () => env("CRON_SECRET"),
  },
  admin: {
    /** Comma-separated list of admin emails */
    emails: () => env("ADMIN_EMAILS") || "",
  },
  scoring: {
    /** HCE weight configuration — override via env or use defaults */
    volumeWeight: () => parseFloat(env("HCE_VOLUME_WEIGHT") || "0.20"),
    engagementWeight: () => parseFloat(env("HCE_ENGAGEMENT_WEIGHT") || "0.35"),
    healthWeight: () => parseFloat(env("HCE_HEALTH_WEIGHT") || "0.25"),
    qualityWeight: () => parseFloat(env("HCE_QUALITY_WEIGHT") || "0.20"),
  },
  bandit: {
    /** Default pessimistic beta prior (cold-start protection) */
    defaultBeta: () => parseInt(env("BANDIT_DEFAULT_BETA") || "49", 10),
    /** Decay rate per month for unexplored arms */
    decayRate: () => parseFloat(env("BANDIT_DECAY_RATE") || "0.02"),
  },
  operational: {
    /** Max emails per day per mailbox */
    maxDailyPerMailbox: () => parseInt(env("MAX_DAILY_PER_MAILBOX") || "15", 10),
    /** Warmup emails per day */
    warmupPerDay: () => env("WARMUP_PER_DAY") || "8-10",
    /** Cold emails per day per mailbox */
    coldPerDay: () => env("COLD_PER_DAY") || "2-5",
    /** Minimum spacing between sends (minutes) */
    sendSpacingMinutes: () => parseInt(env("SEND_SPACING_MINUTES") || "60", 10),
    /** Minimum warmup period (days) */
    minWarmupDays: () => parseInt(env("MIN_WARMUP_DAYS") || "14", 10),
  },
};

/**
 * Validate that all required BSOS env vars are set.
 * Returns array of missing variable names. Empty = all good.
 */
export function validateBSOSEnv(): string[] {
  const required: [string, () => string | null][] = [
    ["BSOS_TELEGRAM_BOT_TOKEN", bsosConfig.telegram.botToken],
    ["BSOS_TELEGRAM_CHAT_ID", bsosConfig.telegram.chatId],
    ["CRON_SECRET", bsosConfig.cron.secret],
  ];

  return required
    .filter(([, getter]) => !getter())
    .map(([name]) => name);
}
