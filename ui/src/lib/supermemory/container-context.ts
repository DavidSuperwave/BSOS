const seededContainers = new Set<string>();

export function buildEntityContext(
  containerTag: string,
  params?: {
    companyName?: string;
    campaignName?: string;
    leadName?: string;
    reportDate?: string;
  }
): string | undefined {
  if (containerTag.match(/^blitzscale_company_[a-z0-9_-]+$/)) {
    return `BSOS company intelligence memory for ${params?.companyName || "this company"}.
Track ICP definitions, positioning, proven messaging patterns, strategic constraints,
deliverability baselines, and recurring GTM insights.
Prioritize verified business context and durable strategic knowledge.
Exclude test data, system logs, raw API responses, credentials.`.slice(0, 1500);
  }

  if (containerTag.includes("_campaign_")) {
    return `Campaign memory for ${params?.campaignName || "this campaign"}.
Track campaign goals, audience, copy strategy, reply patterns, meetings booked,
deliverability anomalies, and downstream CRM outcomes.
Prefer campaign-specific learnings over general company context.`.slice(0, 1500);
  }

  if (containerTag.includes("_lead_")) {
    return `Lead/account memory for ${params?.leadName || "this lead"}.
Track profile traits, firmographics, ICP fit score, engagement history,
objections, sentiment patterns, and conversion-relevant context.`.slice(0, 1500);
  }

  if (containerTag.includes("_skill_campaign_researcher")) {
    return `Research memory for ${params?.companyName || "this company"}.
Track source-backed findings, market research, competitive intelligence,
audience analysis, and pre-campaign discovery insights.`.slice(0, 1500);
  }

  if (containerTag.includes("_report_")) {
    return `Intelligence report memory for ${params?.reportDate || "this date"}.
Track daily performance summaries, anomalies, risks, highlights,
and recommended actions from automated intelligence analysis.`.slice(0, 1500);
  }

  if (containerTag.endsWith("_onboarding")) {
    return `Baseline import memory for ${params?.companyName || "this company"}.
Track historical campaign data, imported CRM records, initial deliverability baselines,
and onboarding analysis outputs.`.slice(0, 1500);
  }

  return undefined;
}

export async function ensureContainerContext(
  containerTag: string,
  entityContext?: string,
  params?: {
    companyName?: string;
    campaignName?: string;
    leadName?: string;
    reportDate?: string;
  }
): Promise<string | undefined> {
  if (seededContainers.has(containerTag)) return undefined;

  const context = entityContext || buildEntityContext(containerTag, params);
  seededContainers.add(containerTag);
  return context;
}

export function resetContainerContextCache(): void {
  seededContainers.clear();
}
