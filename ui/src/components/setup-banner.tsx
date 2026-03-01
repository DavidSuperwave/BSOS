"use client";

import { AlertCircle, ArrowRight } from "lucide-react";
import Link from "next/link";

interface SetupBannerProps {
  message?: string;
}

export function SetupBanner({
  message = "Some API keys are not configured. Connect your services to see real data.",
}: SetupBannerProps) {
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
      <div className="flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-amber-400 mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium text-amber-400">Setup Required</p>
          <p className="mt-1 text-sm text-muted-foreground">{message}</p>
        </div>
        <Link
          href="/settings"
          className="inline-flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-sm font-medium text-amber-400 hover:bg-amber-500/20 transition-colors shrink-0"
        >
          Settings
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
