"use client";

import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { StatsCard, StatsGrid } from "@/components/ui/stats-card";
import { Button } from "@/components/ui/button";
import { SetupBanner } from "@/components/setup-banner";
import { EventsCardEmbedded } from "@/components/dashboard/events-card";
import { LatestUpdateCard } from "@/components/dashboard/latest-update-card";
import { DailySendChart } from "@/components/dashboard/daily-send-chart";
import { SLAMonitoringTable } from "@/components/dashboard/sla-monitoring-table";
import { SkillsHealthPanel } from "@/components/skills/skills-health-panel";
import { useDashboardMetrics } from "@/lib/hooks";
import { useCompany } from "@/contexts/company-context";
import { useAuth } from "@/contexts/auth-context";
import {
  Mail,
  Target,
  Plus,
  MessageSquare,
  ThumbsUp,
} from "lucide-react";
import Link from "next/link";

function DashboardStatsSkeleton() {
  return (
    <StatsGrid>
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="h-32 rounded-xl border border-border bg-card animate-pulse"
        />
      ))}
    </StatsGrid>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { selectedCompany } = useCompany();
  const { data, error, isLoading } = useDashboardMetrics(selectedCompany?.id);
  const userName =
    user?.user_metadata?.name || user?.email?.split("@")[0] || "there";
  const companyName = selectedCompany?.name || "your account";

  const metrics = [
    {
      title: "Total Leads",
      value: data?.plusvibeStats?.totalLeads?.toLocaleString() || data?.totalLeads?.toLocaleString() || "0",
      trend: { value: 0, label: "from PlusVibe", direction: "up" as const },
      icon: <Target className="h-5 w-5 text-blue-500" />,
    },
    {
      title: "Contacted",
      value: data?.plusvibeStats?.contacted?.toLocaleString() || "0",
      trend: { value: 0, label: "emails sent", direction: "up" as const },
      icon: <Mail className="h-5 w-5 text-emerald-500" />,
    },
    {
      title: "Replied",
      value: data?.plusvibeStats?.replied?.toLocaleString() || data?.totalReplies?.toLocaleString() || "0",
      trend: { value: data?.plusvibeStats?.replied && data?.plusvibeStats?.contacted 
        ? Math.round((data.plusvibeStats.replied / data.plusvibeStats.contacted) * 100) 
        : 0, 
        label: "reply rate", direction: "up" as const },
      icon: <MessageSquare className="h-5 w-5 text-violet-500" />,
    },
    {
      title: "Positive",
      value: data?.plusvibeStats?.positive?.toLocaleString() || data?.positiveReplies?.toLocaleString() || "0",
      trend: { value: data?.plusvibeStats?.positive && data?.plusvibeStats?.replied
        ? Math.round((data.plusvibeStats.positive / data.plusvibeStats.replied) * 100)
        : 0,
        label: "of replies", direction: "up" as const },
      icon: <ThumbsUp className="h-5 w-5 text-amber-500" />,
    },
  ];

  return (
    <AppShell
      header={{
        title: "Dashboard",
        subtitle: "Overview of your GTM performance",
        greeting: { userName, companyName },
        actions: (
          <Link href="/campaigns">
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              New Campaign
            </Button>
          </Link>
        ),
      }}
    >
      <div className="space-y-6">
        {/* Setup banner when APIs not configured */}
        {!isLoading && data && !data.configured && <SetupBanner />}

        {error && (
          <SetupBanner message="Could not fetch dashboard data. Check your API configuration in Settings." />
        )}

        {/* Stats Grid */}
        {isLoading ? (
          <DashboardStatsSkeleton />
        ) : (
          <StatsGrid>
            {metrics.map((metric) => (
              <StatsCard
                key={metric.title}
                title={metric.title}
                value={metric.value}
                trend={metric.trend}
                icon={metric.icon}
              />
            ))}
          </StatsGrid>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-4 items-start">
          <div>
            <Card className="overflow-hidden rounded-2xl border-border/80">
              <DailySendChart embedded />
              <div className="mx-6 border-t border-border" />
              <EventsCardEmbedded />
            </Card>
          </div>
          <div className="h-full">
            <LatestUpdateCard />
          </div>
        </div>

        <SLAMonitoringTable
          campaigns={data?.activeCampaigns || []}
          isLoading={isLoading}
        />

        <SkillsHealthPanel />
      </div>
    </AppShell>
  );
}
