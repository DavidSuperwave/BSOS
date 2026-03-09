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
import { useDashboardMetrics } from "@/lib/hooks";
import { useCompany } from "@/contexts/company-context";
import { useAuth } from "@/contexts/auth-context";
import {
  Activity,
  CalendarCheck,
  Mail,
  Plus,
  ThumbsUp,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

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
  const [range, setRange] = useState<"24h" | "7d" | "30d">("7d");
  const { user } = useAuth();
  const { selectedCompany } = useCompany();
  const { data, error, isLoading } = useDashboardMetrics(selectedCompany?.id, range);
  const userName =
    user?.user_metadata?.name || user?.email?.split("@")[0] || "there";
  const companyName = selectedCompany?.name || "your account";

  const metrics = [
    {
      title: "Contacted Today",
      value: data?.plusvibeStats?.contacted?.toLocaleString() || "0",
      trend: { value: 0, label: "from PlusVibe", direction: "up" as const },
      icon: <Mail className="h-5 w-5 text-emerald-500" />,
    },
    {
      title: "Positive Reply",
      value:
        data?.plusvibeStats?.positive?.toLocaleString() ||
        data?.positiveReplies?.toLocaleString() ||
        "0",
      trend: {
        value:
          data?.plusvibeStats?.positive && data?.plusvibeStats?.replied
            ? Math.round((data.plusvibeStats.positive / data.plusvibeStats.replied) * 100)
            : 0,
        label: "of replies",
        direction: "up" as const,
      },
      icon: <ThumbsUp className="h-5 w-5 text-amber-500" />,
    },
    {
      title: "Calls Booked",
      value: data?.meetingsBooked?.toLocaleString() || "0",
      trend: { value: 0, label: "from Calendly", direction: "up" as const },
      icon: <CalendarCheck className="h-5 w-5 text-blue-500" />,
    },
    {
      title: "Domain Health",
      value: "—",
      trend: { value: 0, label: "coming soon", direction: "neutral" as const },
      icon: <Activity className="h-5 w-5 text-violet-500" />,
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
        <div
          key={`stats-${range}-${isLoading ? "loading" : "loaded"}`}
          className="animate-fade-in transition-opacity duration-300"
        >
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
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-4 items-start">
          <div>
            <Card className="overflow-hidden rounded-2xl border-border/80">
              <DailySendChart
                key={`chart-${range}`}
                embedded
                range={range}
                onRangeChange={setRange}
              />
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
      </div>
    </AppShell>
  );
}
