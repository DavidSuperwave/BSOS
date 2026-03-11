import { BsosSupermemoryClient } from "./client";
import { buildEntityContext } from "./container-context";
import {
  bsosCompanyContainerTag,
  bsosOnboardingContainerTag,
} from "./bsos-tags";

export async function seedSupermemoryForCompany(params: {
  companySlug: string;
  companyName: string;
  supermemoryClient: BsosSupermemoryClient;
}): Promise<void> {
  await params.supermemoryClient.updateSettings({
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

  const companyContainer = bsosCompanyContainerTag(params.companySlug);
  const onboardingContainer = bsosOnboardingContainerTag(params.companySlug);

  await params.supermemoryClient.addDocument({
    content: `Company profile initialized for ${params.companyName}. BSOS GTM intelligence platform.`,
    containerTag: companyContainer,
    customId: `seed_company_${params.companySlug}`,
    metadata: {
      company_slug: params.companySlug,
      artifact_type: "seed",
      source_type: "system",
      project_key: "company-playbook",
    },
    entityContext: buildEntityContext(companyContainer, { companyName: params.companyName }),
  });

  await params.supermemoryClient.addDocument({
    content: `Onboarding baseline initialized for ${params.companyName}. Import data will be indexed here.`,
    containerTag: onboardingContainer,
    customId: `seed_onboarding_${params.companySlug}`,
    metadata: {
      company_slug: params.companySlug,
      artifact_type: "seed",
      source_type: "system",
      project_key: "imports",
    },
    entityContext: buildEntityContext(onboardingContainer, {
      companyName: params.companyName,
    }),
  });
}
