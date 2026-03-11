import { BsosSupermemoryClient } from "./client";

/**
 * One-time org-level Supermemory settings configuration.
 * Run this during platform setup, not per-company onboarding.
 */
export async function initSupermemoryPlatformSettings(
  supermemoryClient: BsosSupermemoryClient
): Promise<void> {
  await supermemoryClient.updateSettings({
    shouldLLMFilter: true,
    filterPrompt: `BSOS GTM intelligence platform for B2B sales and marketing operations.

Index:
- Campaign signals (opens, clicks, replies, bounces, meetings, deals)
- CRM outcomes (stage changes, revenue progression, opportunity data)
- Lead profiles (ICP fit, persona, firmographics, engagement patterns)
- AI recommendations and intelligence reports
- Operational SOPs, playbooks, brand guidelines

Prioritize:
- Outcome signals (deals, meetings booked, positive replies)
- ICP fit data and audience quality signals
- Deliverability anomalies and risk indicators
- Proven patterns and confirmed knowledge

Exclude:
- Test data and sandbox content
- System logs and raw API responses
- Credentials and secrets
- Duplicate or near-duplicate content
- Draft/WIP documents unless explicitly marked for indexing`,
  });
}
