function sanitizeTagToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
}

export function bsosCompanyContainerTag(companySlug: string): string {
  return `blitzscale_company_${sanitizeTagToken(companySlug)}`;
}

export function bsosResearchContainerTag(companySlug: string): string {
  return `${bsosCompanyContainerTag(companySlug)}_skill_campaign_researcher`;
}

export function bsosCampaignContainerTag(companySlug: string, campaignId: string): string {
  return `${bsosCompanyContainerTag(companySlug)}_campaign_${sanitizeTagToken(campaignId)}`;
}

export function bsosReportContainerTag(companySlug: string, reportDate: string): string {
  return `${bsosCompanyContainerTag(companySlug)}_report_${sanitizeTagToken(reportDate)}`;
}

export function bsosLeadContainerTag(companySlug: string, leadId: string): string {
  return `${bsosCompanyContainerTag(companySlug)}_lead_${sanitizeTagToken(leadId)}`;
}

export function bsosOnboardingContainerTag(companySlug: string): string {
  return `${bsosCompanyContainerTag(companySlug)}_onboarding`;
}

export function bsosProjectContainerTag(companySlug: string, projectKey: string): string {
  return `${bsosCompanyContainerTag(companySlug)}_project_${sanitizeTagToken(projectKey)}`;
}
