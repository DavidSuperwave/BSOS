"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";

const STEPS = [
  { label: "Company & Product", key: "company-product" },
  { label: "ICP & Market", key: "icp-market" },
  { label: "Integrations", key: "integrations" },
  { label: "Uploads", key: "uploads" },
  { label: "Review", key: "review" },
];

interface WizardShellProps {
  currentStep: number;
  onBack: () => void;
  onNext: () => void;
  onComplete?: () => void;
  isSubmitting?: boolean;
  canProceed?: boolean;
  deploying?: boolean;
  children: React.ReactNode;
}

export function WizardShell({
  currentStep,
  onBack,
  onNext,
  onComplete,
  isSubmitting,
  canProceed = true,
  deploying = false,
  children,
}: WizardShellProps) {
  const isLastStep = currentStep === STEPS.length - 1;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Progress bar */}
      <div className="border-b border-border bg-card">
        <div className="max-w-3xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-bold text-foreground">
              {deploying ? "Deploying" : "Company Setup"}
            </h1>
            {!deploying && (
              <span className="text-sm text-muted-foreground">
                Step {currentStep + 1} of {STEPS.length}
              </span>
            )}
          </div>

          {/* Step indicators - Animated progress */}
          <div className="flex items-center gap-2">
            {STEPS.map((step, i) => (
              <div key={step.key} className="flex-1 flex items-center gap-2">
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-700 ease-out",
                      deploying || i < currentStep
                        ? "bg-gradient-to-r from-primary to-emerald-500 w-full"
                        : i === currentStep
                          ? "bg-gradient-to-r from-primary/60 to-primary w-1/2 animate-pulse"
                          : "w-0"
                    )}
                  />
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className={cn(
                      "w-2 h-2 rounded-full transition-colors duration-300",
                      deploying || i < currentStep ? "bg-emerald-500" : "bg-muted"
                    )}
                  />
                )}
              </div>
            ))}
          </div>

          <div className="flex gap-2 mt-3 overflow-x-auto">
            {STEPS.map((step, i) => (
              <span
                key={step.key}
                className={cn(
                  "text-xs whitespace-nowrap",
                  deploying || i <= currentStep ? "text-primary" : "text-muted-foreground"
                )}
              >
                {(deploying || i < currentStep) && <Check className="inline h-3 w-3 mr-0.5" />}
                {step.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 max-w-3xl mx-auto w-full px-6 py-8">
        {children}
      </div>

      {/* Navigation — hidden while deploying */}
      {!deploying && (
        <div className="border-t border-border bg-card">
          <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
            <Button
              variant="outline"
              onClick={onBack}
              disabled={currentStep === 0 || isSubmitting}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back
            </Button>

            {isLastStep ? (
              <Button
                onClick={onComplete}
                disabled={isSubmitting || !canProceed}
              >
                {isSubmitting ? "Deploying..." : "Deploy Agent"}
              </Button>
            ) : (
              <Button onClick={onNext} disabled={!canProceed || isSubmitting}>
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export { STEPS };
