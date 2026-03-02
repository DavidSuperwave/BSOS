"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { WizardShell } from "@/components/onboarding/wizard-shell";
import { StepCompanyProduct } from "@/components/onboarding/step-company-product";
import { StepICPMarket } from "@/components/onboarding/step-icp-market";
import { StepIntegrations } from "@/components/onboarding/step-integrations";
import { StepUploads } from "@/components/onboarding/step-uploads";
import { StepReview } from "@/components/onboarding/step-review";
import { DeploymentStatus } from "@/components/onboarding/deployment-status";
import { useContainerStatus } from "@/lib/hooks/use-container-status";
import { useAuth } from "@/contexts/auth-context";
import { useCompany } from "@/contexts/company-context";

type DeployPhase = "saving" | "provisioning" | "success" | "error";

export default function OnboardingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      }
    >
      <OnboardingContent />
    </Suspense>
  );
}

function OnboardingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { refresh } = useCompany();

  const [companyId, setCompanyId] = useState<string | null>(
    searchParams.get("companyId")
  );
  const [currentStep, setCurrentStep] = useState(0);
  const [data, setData] = useState<Record<string, any>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Deployment state
  const [deploying, setDeploying] = useState(false);
  const [deployPhase, setDeployPhase] = useState<DeployPhase>("saving");
  const [deployError, setDeployError] = useState<string | null>(null);

  // Poll container status when provisioning
  const { data: containerData } = useContainerStatus(
    companyId,
    deploying && (deployPhase === "provisioning")
  );

  // React to container status changes
  useEffect(() => {
    if (!deploying || deployPhase !== "provisioning") return;
    if (!containerData) return;

    if (containerData.status === "running" && containerData.healthy) {
      setDeployPhase("success");
    } else if (containerData.status === "error") {
      setDeployPhase("error");
      setDeployError("Container failed to start. Please try again.");
    }
  }, [containerData, deploying, deployPhase]);

  // On success, redirect after 2.5s
  useEffect(() => {
    if (deployPhase !== "success") return;
    const t = setTimeout(async () => {
      await refresh();
      if (companyId) {
        try {
          await fetch(`/api/dashboard/metrics?companyId=${companyId}`);
        } catch {
          // Non-blocking; dashboard will re-fetch on load.
        }
      }
      router.push("/dashboard");
    }, 2500);
    return () => clearTimeout(t);
  }, [companyId, deployPhase, refresh, router]);

  // Load existing onboarding data if companyId is present
  useEffect(() => {
    if (companyId) {
      fetch(`/api/companies/${companyId}/onboarding`)
        .then((r) => r.json())
        .then((result) => {
          if (result.onboarding_data) {
            setData(result.onboarding_data);
            setCurrentStep(result.onboarding_step || 0);
          }
        })
        .catch(() => {});
    }
  }, [companyId]);

  const onChange = useCallback(
    (updates: Record<string, any>) => {
      setData((prev) => ({ ...prev, ...updates }));
    },
    []
  );

  const saveProgress = async (step: number, newData: Record<string, any>) => {
    if (!companyId) return;
    try {
      await fetch(`/api/companies/${companyId}/onboarding`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          onboarding_data: newData,
          onboarding_step: step,
        }),
      });
    } catch {
      // Non-blocking
    }
  };

  const handleNext = async () => {
    // On first step, create the company if it doesn't exist
    if (currentStep === 0 && !companyId) {
      try {
        const res = await fetch("/api/companies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: data.company_name,
            slug: data.slug,
            domain: data.domain,
          }),
        });
        if (res.ok) {
          const { company } = await res.json();
          setCompanyId(company.id);
          await saveProgress(1, data);
        }
      } catch {
        return;
      }
    } else {
      await saveProgress(currentStep + 1, data);
    }
    setCurrentStep((s) => Math.min(s + 1, 4));
  };

  const handleBack = () => {
    setCurrentStep((s) => Math.max(s - 1, 0));
  };

  const runDeploy = async () => {
    if (!companyId) return;
    setDeploying(true);
    setDeployPhase("saving");
    setDeployError(null);
    setIsSubmitting(true);

    try {
      // Phase 1: Save config + deploy agent
      await fetch(`/api/companies/${companyId}/onboarding`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          onboarding_data: data,
          onboarding_step: 5,
        }),
      });

      const uploadedEntries = Array.isArray(data._uploaded_files) ? data._uploaded_files : [];
      const uploadedFiles = uploadedEntries
        .map((entry: any) => entry?.file)
        .filter((file: any): file is File => file instanceof File);
      const onboardingDataForDeploy = {
        ...data,
        // Strip raw File objects from JSON payload; files are sent as multipart parts.
        _uploaded_files: uploadedEntries.map(({ file, ...rest }: any) => rest),
      };

      let deployRes: Response;
      if (uploadedFiles.length > 0) {
        const formData = new FormData();
        formData.append("onboarding_data", JSON.stringify(onboardingDataForDeploy));
        formData.append("uploaded_file_count", String(uploadedFiles.length));
        for (const file of uploadedFiles) {
          formData.append("uploaded_files", file, file.name);
        }
        deployRes = await fetch(`/api/companies/${companyId}/deploy-agent`, {
          method: "POST",
          body: formData,
        });
      } else {
        deployRes = await fetch(`/api/companies/${companyId}/deploy-agent`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            onboarding_data: onboardingDataForDeploy,
            uploaded_file_count: data._uploaded_file_count || 0,
          }),
        });
      }

      if (!deployRes.ok) {
        const body = await deployRes.json().catch(() => ({}));
        throw new Error(body.error || "Failed to deploy agent");
      }

      // Phase 2: Fire container provisioning + start polling
      setDeployPhase("provisioning");

      const provisionRes = await fetch(`/api/companies/${companyId}/provision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!provisionRes.ok) {
        const body = await provisionRes.json().catch(() => ({}));
        throw new Error(body.error || "Container provisioning failed");
      }

      // Provision AI agent records now that the container is running
      try {
        await fetch(`/api/companies/${companyId}/agents/provision`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agentTypes: ["main", "campaigns", "crm", "inbox"],
            companyData: {
              name: data.company_name,
              industry: data.industry,
              description: data.core_product,
            },
          }),
        });
      } catch {
        // Non-blocking — agents can be provisioned later
      }

      // Polling is now handled by the useContainerStatus hook
      // The useEffect above will detect "running" and move to success
    } catch (err: any) {
      setDeployPhase("error");
      setDeployError(err?.message || "Deployment failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleComplete = () => {
    runDeploy();
  };

  const handleRetry = () => {
    setDeploying(false);
    setDeployPhase("saving");
    setDeployError(null);
    // Re-trigger deploy
    runDeploy();
  };

  // ── Validation: can proceed to next step? ──
  const canProceed = (() => {
    switch (currentStep) {
      case 0: // Company & Product
        return (
          !!data.company_name &&
          !!data.slug &&
          !!data.industry &&
          !!data.core_product &&
          !!data.problem_solved
        );
      case 1: // ICP & Market
        return (
          (data.icp_titles?.length > 0) &&
          !!data.icp_company_size &&
          (data.icp_verticals?.length > 0) &&
          (data.pain_points?.length > 0) &&
          !!data.usp
        );
      // Steps 2 (Integrations), 3 (Uploads), 4 (Review) are always valid
      default:
        return true;
    }
  })();

  const steps = [
    <StepCompanyProduct key="company-product" data={data} onChange={onChange} />,
    <StepICPMarket key="icp-market" data={data} onChange={onChange} />,
    <StepIntegrations key="integrations" data={data} onChange={onChange} />,
    <StepUploads key="uploads" data={data} onChange={onChange} />,
    <StepReview key="review" data={data} />,
  ];

  return (
    <WizardShell
      currentStep={currentStep}
      onBack={handleBack}
      onNext={handleNext}
      onComplete={handleComplete}
      isSubmitting={isSubmitting}
      canProceed={canProceed}
      deploying={deploying}
    >
      {deploying ? (
        <DeploymentStatus
          phase={deployPhase}
          companyName={data.company_name || "your company"}
          error={deployError}
          onRetry={handleRetry}
        />
      ) : (
        steps[currentStep]
      )}
    </WizardShell>
  );
}
