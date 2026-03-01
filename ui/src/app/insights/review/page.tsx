"use client";

import { AppShell } from "@/components/app-shell";
import { useCompany } from "@/contexts/company-context";
import { ReviewQueue } from "@/components/skills/review-queue";

export default function InsightReviewPage() {
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id;

  return (
    <AppShell
      header={{
        title: "Insight Reviews",
        subtitle: "Validate low-confidence generated insights",
      }}
    >
      {companyId ? (
        <ReviewQueue companyId={companyId} />
      ) : (
        <div className="text-sm text-muted-foreground">Select a company to review insights.</div>
      )}
    </AppShell>
  );
}

