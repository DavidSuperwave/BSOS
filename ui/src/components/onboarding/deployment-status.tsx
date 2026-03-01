"use client";

import { useEffect, useState } from "react";
import { Check, AlertCircle, Loader2, Rocket, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type DeployPhase = "saving" | "provisioning" | "success" | "error";

interface DeploymentStage {
  label: string;
  state: "pending" | "active" | "completed";
}

interface DeploymentStatusProps {
  phase: DeployPhase;
  companyName: string;
  error?: string | null;
  onRetry: () => void;
}

function LoadingDots() {
  return (
    <span className="inline-flex gap-0.5 ml-1">
      <span className="animate-bounce [animation-delay:0ms] w-1 h-1 rounded-full bg-primary inline-block" />
      <span className="animate-bounce [animation-delay:150ms] w-1 h-1 rounded-full bg-primary inline-block" />
      <span className="animate-bounce [animation-delay:300ms] w-1 h-1 rounded-full bg-primary inline-block" />
    </span>
  );
}

function StageIcon({ state }: { state: DeploymentStage["state"] }) {
  switch (state) {
    case "completed":
      return (
        <div className="h-6 w-6 rounded-full bg-success/20 flex items-center justify-center">
          <Check className="h-3.5 w-3.5 text-success" />
        </div>
      );
    case "active":
      return (
        <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
          <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />
        </div>
      );
    case "pending":
      return (
        <div className="h-6 w-6 rounded-full bg-muted/30 flex items-center justify-center">
          <Circle className="h-3 w-3 text-muted-foreground/50" />
        </div>
      );
  }
}

export function DeploymentStatus({
  phase,
  companyName,
  error,
  onRetry,
}: DeploymentStatusProps) {
  const [visualStage, setVisualStage] = useState(0);

  // Advance visual stages on timers for progress feel
  useEffect(() => {
    if (phase === "success" || phase === "error") return;

    // Stage 0 → 1 at 12s
    const t1 = setTimeout(() => setVisualStage((s) => Math.max(s, 1)), 12000);
    // Stage 1 → 2 at 22s
    const t2 = setTimeout(() => setVisualStage((s) => Math.max(s, 2)), 22000);
    // Stage 2 → 3 at 32s
    const t3 = setTimeout(() => setVisualStage((s) => Math.max(s, 3)), 32000);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [phase]);

  // When phase changes, update visual stage
  useEffect(() => {
    if (phase === "provisioning") {
      setVisualStage((s) => Math.max(s, 1));
    }
    if (phase === "success") {
      setVisualStage(4); // all done
    }
  }, [phase]);

  const stages: DeploymentStage[] = [
    {
      label: "Saving configuration",
      state:
        phase === "saving" && visualStage === 0
          ? "active"
          : visualStage >= 1 || phase !== "saving"
            ? "completed"
            : "pending",
    },
    {
      label: "Deploying container",
      state:
        visualStage === 1
          ? "active"
          : visualStage > 1
            ? "completed"
            : "pending",
    },
    {
      label: "Starting Julian",
      state:
        visualStage === 2
          ? "active"
          : visualStage > 2
            ? "completed"
            : "pending",
    },
    {
      label: "Running health checks",
      state:
        visualStage === 3
          ? "active"
          : visualStage > 3
            ? "completed"
            : "pending",
    },
  ];

  // Success screen
  if (phase === "success") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] animate-fade-in">
        <div className="h-20 w-20 rounded-full bg-success/20 flex items-center justify-center mb-6">
          <Check className="h-10 w-10 text-success" />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2">
          Julian is ready!
        </h2>
        <p className="text-muted-foreground">
          Redirecting to dashboard...
        </p>
      </div>
    );
  }

  // Error screen
  if (phase === "error") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] animate-fade-in">
        <div className="h-20 w-20 rounded-full bg-red-500/20 flex items-center justify-center mb-6">
          <AlertCircle className="h-10 w-10 text-red-400" />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2">
          Deployment failed
        </h2>
        <p className="text-muted-foreground mb-6 text-center max-w-md">
          {error || "Something went wrong while deploying Julian. Please try again."}
        </p>
        <Button
          onClick={onRetry}
        >
          Retry Deployment
        </Button>
      </div>
    );
  }

  // Progress screen
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      {/* Pulsing rocket */}
      <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-8 animate-pulse">
        <Rocket className="h-8 w-8 text-primary" />
      </div>

      <h2 className="text-xl font-bold text-foreground mb-1">
        Deploying Julian for {companyName}
      </h2>
      <p className="text-sm text-muted-foreground mb-10">
        This usually takes 30-45 seconds
      </p>

      {/* Stage list */}
      <div className="w-full max-w-sm space-y-4">
        {stages.map((stage, i) => (
          <div
            key={i}
            className={cn(
              "flex items-center gap-3 transition-opacity duration-500",
              stage.state === "pending" ? "opacity-40" : "opacity-100"
            )}
          >
            <StageIcon state={stage.state} />
            <span
              className={cn(
                "text-sm",
                stage.state === "completed"
                  ? "text-success"
                  : stage.state === "active"
                    ? "text-foreground"
                    : "text-muted-foreground"
              )}
            >
              {stage.label}
              {stage.state === "active" && <LoadingDots />}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
