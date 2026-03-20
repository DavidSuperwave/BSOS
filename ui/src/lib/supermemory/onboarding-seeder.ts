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
