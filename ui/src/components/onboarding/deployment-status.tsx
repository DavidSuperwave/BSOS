"use client";

import { useEffect, useState } from "react";
import { Check, AlertCircle, Loader2, Rocket, Circle, Cpu, Database, Shield, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type DeployPhase = "saving" | "provisioning" | "success" | "error";

interface DeploymentStage {
  label: string;
  state: "pending" | "active" | "completed";
  icon: React.ReactNode;
}

interface DeploymentStatusProps {
  phase: DeployPhase;
  companyName: string;
  error?: string | null;
  onRetry: () => void;
}

function LoadingDots() {
  return (
    <span className="inline-flex gap-1 ml-2">
      <span className="animate-bounce [animation-delay:0ms] w-1.5 h-1.5 rounded-full bg-primary inline-block" />
      <span className="animate-bounce [animation-delay:150ms] w-1.5 h-1.5 rounded-full bg-primary inline-block" />
      <span className="animate-bounce [animation-delay:300ms] w-1.5 h-1.5 rounded-full bg-primary inline-block" />
    </span>
  );
}

function StageIcon({ state }: { state: DeploymentStage["state"] }) {
  switch (state) {
    case "completed":
      return (
        <div className="h-10 w-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
          <Check className="h-5 w-5 text-emerald-400" />
        </div>
      );
    case "active":
      return (
        <div className="h-10 w-10 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center">
          <Loader2 className="h-5 w-5 text-primary animate-spin" />
        </div>
      );
    case "pending":
      return (
        <div className="h-10 w-10 rounded-xl bg-muted/30 border border-muted/50 flex items-center justify-center">
          <Circle className="h-5 w-5 text-muted-foreground/40" />
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
  const [progress, setProgress] = useState(0);

  // Animate progress bar
  useEffect(() => {
    if (phase === "success") {
      setProgress(100);
      return;
    }
    if (phase === "error") {
      return;
    }
    
    const interval = setInterval(() => {
      setProgress((p) => {
        if (p >= 90) return p;
        return p + Math.random() * 15;
      });
    }, 800);

    return () => clearInterval(interval);
  }, [phase]);

  // Advance visual stages on timers
  useEffect(() => {
    if (phase === "success" || phase === "error") return;

    const t1 = setTimeout(() => setVisualStage((s) => Math.max(s, 1)), 8000);
    const t2 = setTimeout(() => setVisualStage((s) => Math.max(s, 2)), 18000);
    const t3 = setTimeout(() => setVisualStage((s) => Math.max(s, 3)), 28000);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [phase]);

  useEffect(() => {
    if (phase === "provisioning") {
      setVisualStage((s) => Math.max(s, 1));
    }
    if (phase === "success") {
      setVisualStage(4);
      setProgress(100);
    }
  }, [phase]);

  const stages: DeploymentStage[] = [
    {
      label: "Saving configuration",
      state: visualStage >= 1 || phase !== "saving" ? "completed" : "active",
      icon: <Database className="h-4 w-4" />,
    },
    {
      label: "Provisioning infrastructure",
      state: visualStage === 1 ? "active" : visualStage > 1 ? "completed" : "pending",
      icon: <Cpu className="h-4 w-4" />,
    },
    {
      label: "Starting Julian agent",
      state: visualStage === 2 ? "active" : visualStage > 2 ? "completed" : "pending",
      icon: <Sparkles className="h-4 w-4" />,
    },
    {
      label: "Running health checks",
      state: visualStage === 3 ? "active" : visualStage > 3 ? "completed" : "pending",
      icon: <Shield className="h-4 w-4" />,
    },
  ];

  // Success screen
  if (phase === "success") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] animate-in fade-in zoom-in duration-500">
        <div className="relative">
          <div className="absolute inset-0 bg-emerald-500/20 blur-3xl rounded-full" />
          <div className="relative h-24 w-24 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 border border-emerald-500/30 flex items-center justify-center">
            <Check className="h-12 w-12 text-emerald-400" strokeWidth={2.5} />
          </div>
        </div>
        <h2 className="text-3xl font-bold text-foreground mt-8 mb-2">
          Julian is ready!
        </h2>
        <p className="text-muted-foreground text-lg">
          Your AI agent is deployed and waiting
        </p>
        <p className="text-sm text-muted-foreground/60 mt-6">
          Redirecting to dashboard...
        </p>
      </div>
    );
  }

  // Error screen
  if (phase === "error") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] animate-in fade-in duration-300">
        <div className="relative">
          <div className="absolute inset-0 bg-red-500/20 blur-3xl rounded-full" />
          <div className="relative h-24 w-24 rounded-2xl bg-gradient-to-br from-red-500/20 to-red-600/10 border border-red-500/30 flex items-center justify-center">
            <AlertCircle className="h-12 w-12 text-red-400" strokeWidth={2} />
          </div>
        </div>
        <h2 className="text-3xl font-bold text-foreground mt-8 mb-2">
          Deployment failed
        </h2>
        <p className="text-muted-foreground mb-8 text-center max-w-md px-4">
          {error || "Something went wrong while deploying Julian. Let's try again."}
        </p>
        <Button onClick={onRetry} size="lg" className="px-8">
          Retry Deployment
        </Button>
      </div>
    );
  }

  // Progress screen
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      {/* Animated rocket with glow */}
      <div className="relative mb-10">
        <div className="absolute inset-0 bg-primary/30 blur-3xl rounded-full animate-pulse" />
        <div className="relative h-20 w-20 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/30 flex items-center justify-center animate-in zoom-in duration-500">
          <Rocket className="h-10 w-10 text-primary" />
        </div>
        {/* Orbiting dots */}
        <div className="absolute inset-0 animate-spin" style={{ animationDuration: '3s' }}>
          <div className="absolute -top-1 left-1/2 w-2 h-2 bg-primary/60 rounded-full" />
        </div>
        <div className="absolute inset-0 animate-spin" style={{ animationDuration: '4s', animationDirection: 'reverse' }}>
          <div className="absolute top-1/2 -right-1 w-1.5 h-1.5 bg-emerald-400/60 rounded-full" />
        </div>
      </div>

      <h2 className="text-2xl font-bold text-foreground mb-1">
        Deploying Julian
      </h2>
      <p className="text-muted-foreground mb-8">
        Setting up your AI agent for {companyName}
      </p>

      {/* Progress bar */}
      <div className="w-full max-w-md mb-10">
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-primary via-emerald-500 to-emerald-400 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground text-center mt-2">
          This usually takes 30-45 seconds
        </p>
      </div>

      {/* Stage cards */}
      <div className="w-full max-w-md space-y-3">
        {stages.map((stage, i) => (
          <div
            key={i}
            className={cn(
              "flex items-center gap-4 p-4 rounded-xl border transition-all duration-500",
              stage.state === "completed"
                ? "bg-emerald-500/5 border-emerald-500/20"
                    : stage.state === "active"
                      ? "bg-primary/5 border-primary/20"
                      : "bg-muted/20 border-muted/30 opacity-50"
            )}
          >
            <StageIcon state={stage.state} />
            <div className="flex-1">
              <span
                className={cn(
                  "text-sm font-medium",
                  stage.state === "completed"
                    ? "text-emerald-400"
                        : stage.state === "active"
                          ? "text-foreground"
                          : "text-muted-foreground"
                )}
              >
                {stage.label}
              </span>
              {stage.state === "active" && (
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-muted-foreground">In progress</span>
                  <LoadingDots />
                </div>
              )}
            </div>
            {stage.state === "completed" && (
              <Check className="h-4 w-4 text-emerald-400" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
