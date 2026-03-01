"use client";

import { useMemo } from "react";
import { Bot, Sparkles } from "lucide-react";
import { useCompany } from "@/contexts/company-context";
import { useDashboardMetrics, useCampaigns } from "@/lib/hooks";

interface ChatWelcomeProps {
  onSuggestionClick?: (suggestion: string) => void;
}

const FALLBACK_SUGGESTIONS = [
  "Analyze my campaign performance",
  "Research a target company",
  "Draft a follow-up email",
  "Review my inbox replies",
  "Create a new campaign",
];

export function ChatWelcome({ onSuggestionClick }: ChatWelcomeProps) {
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id;
  const { data: metrics } = useDashboardMetrics(companyId);
  const { data: campaignData } = useCampaigns(companyId);

  const suggestions = useMemo(() => {
    const dynamic: string[] = [];

    // Campaign-specific suggestions
    const campaigns = campaignData?.campaigns;
    if (campaigns?.length) {
      const active = campaigns.find(
        (c) => c.status === "active" || c.status === "running"
      );
      if (active) {
        dynamic.push(`Analyze "${active.name}" performance`);
      }

      const paused = campaigns.find((c) => c.status === "paused");
      if (paused) {
        dynamic.push(`Should I reactivate "${paused.name}"?`);
      }
    }

    // Metrics-based suggestions
    if (metrics) {
      if (metrics.totalReplies > 0) {
        dynamic.push(
          `Review my ${metrics.totalReplies} inbox replies`
        );
      }
      if (
        metrics.positiveReplies > 0 &&
        metrics.meetingsBooked === 0
      ) {
        dynamic.push(
          "Help me convert positive replies into meetings"
        );
      }
      if ((metrics.totalCampaigns || 0) > 0 && (metrics.totalSends || 0) > 0) {
        dynamic.push("Show me my campaign funnel breakdown");
      }
    }

    // Always include general-purpose suggestions to fill out the list
    const general = [
      "Research a target company",
      "Draft a follow-up email",
      "Create a new campaign",
      "Summarize my pipeline status",
    ];

    // Combine dynamic + general, deduplicate, cap at 5
    const seen = new Set<string>();
    const result: string[] = [];
    for (const s of [...dynamic, ...general]) {
      if (!seen.has(s) && result.length < 5) {
        seen.add(s);
        result.push(s);
      }
    }

    return result.length > 0 ? result : FALLBACK_SUGGESTIONS;
  }, [metrics, campaignData]);

  const companyName = selectedCompany?.name;

  return (
    <div className="flex flex-col items-center justify-center h-full px-4 py-12">
      {/* Icon */}
      <div className="mb-6">
        <div className="h-16 w-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
          <Bot className="h-8 w-8 text-primary" />
        </div>
      </div>

      {/* Title */}
      <h1 className="text-3xl font-semibold text-foreground mb-3 tracking-tight">
        What can I help with?
      </h1>

      {/* Subtitle */}
      <p className="text-muted-foreground text-center max-w-md mb-8">
        I&apos;m Julian, your GTM AI agent
        {companyName ? ` for ${companyName}` : ""}.
        I can help you research prospects, analyze campaigns, manage your
        pipeline, and optimize your outreach.
      </p>

      {/* Suggestions */}
      <div className="flex flex-wrap justify-center gap-2 max-w-2xl">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            onClick={() => onSuggestionClick?.(suggestion)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full
                       bg-muted hover:bg-primary/10
                       border border-border hover:border-primary/30
                       text-sm text-muted-foreground hover:text-primary
                       transition-all duration-200"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {suggestion}
          </button>
        ))}
      </div>

      {/* Keyboard hint */}
      <div className="mt-12 text-xs text-muted-foreground/60">
        Press{" "}
        <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border font-mono text-xs">
          Enter
        </kbd>{" "}
        to send a message
      </div>
    </div>
  );
}
