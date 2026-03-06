"use client";

import { useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { StatsCard, StatsGrid } from "@/components/ui/stats-card";
import { Button } from "@/components/ui/button";
import { useCompany } from "@/contexts/company-context";
import {
  useInboxingDomainsQuery,
  useInboxingHealth,
  useInboxingUploadJobs,
  usePlatformConnections,
} from "@/lib/hooks";
import { DomainsPanel } from "@/components/inboxing/domains-panel";
import { PlatformUploadPanel } from "@/components/inboxing/platform-upload-panel";
import { PlatformConnectionsPanel } from "@/components/inboxing/platform-connections-panel";
import { WorkspaceInboxesPanel } from "@/components/inboxing/workspace-inboxes-panel";
import { Globe, Upload, Link2, ShieldCheck, ShieldAlert, ShieldX } from "lucide-react";
import type { PlatformConnection, UploadJobsResponse } from "@/components/inboxing/types";

type InboxingTab = "inboxes" | "domains" | "upload" | "platforms";

export default function InboxesPage() {
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id;
  const [activeTab, setActiveTab] = useState<InboxingTab>("inboxes");

  const { data: domainsData, mutate: mutateDomains } = useInboxingDomainsQuery(companyId);
  const { data: healthData } = useInboxingHealth(companyId);
  const { data: platformsData, mutate: mutatePlatforms } = usePlatformConnections(companyId);
  const { data: uploadJobsData, mutate: mutateUploadJobs } = useInboxingUploadJobs(companyId);

  const domains = domainsData?.domains || [];
  const platforms = (platformsData?.platforms || []) as PlatformConnection[];
  const uploadData = useMemo<UploadJobsResponse>(
    () =>
      uploadJobsData || {
        jobs: [],
        summary: { total: 0, completed: 0, failed: 0 },
      },
    [uploadJobsData]
  );

  const onChanged = () => {
    mutateDomains();
    mutatePlatforms();
    mutateUploadJobs();
  };

  const summary = healthData?.summary;

  return (
    <AppShell
      header={{
        title: "Inboxes",
        subtitle: "Domains & platform upload",
        actions: (
          <div className="flex gap-2">
            {activeTab === "domains" ? (
              <Button size="sm" onClick={() => setActiveTab("upload")}>
                Go to Upload
              </Button>
            ) : null}
            {activeTab === "upload" ? (
              <Button variant="outline" size="sm" onClick={() => setActiveTab("platforms")}>
                Add Platform
              </Button>
            ) : null}
            {activeTab === "inboxes" ? (
              <Button variant="outline" size="sm" onClick={() => setActiveTab("domains")}>
                Manage Domains
              </Button>
            ) : null}
          </div>
        ),
      }}
    >
      <div className="space-y-6">
        <StatsGrid columns={4}>
          <StatsCard
            title="Total Domains"
            value={summary?.total || domains.length}
            icon={<Globe className="h-5 w-5 text-primary" />}
          />
          <StatsCard
            title="Healthy Domains"
            value={summary?.healthy || 0}
            icon={<ShieldCheck className="h-5 w-5 text-success" />}
          />
          <StatsCard
            title="At Risk"
            value={summary?.at_risk || 0}
            icon={<ShieldAlert className="h-5 w-5 text-warning" />}
          />
          <StatsCard
            title="Failed Uploads"
            value={uploadData.summary.failed}
            icon={<ShieldX className="h-5 w-5 text-destructive" />}
          />
        </StatsGrid>

        <div className="flex items-center gap-1 border-b border-border">
          {[
            { id: "inboxes" as const, label: "Inboxes", icon: Globe },
            { id: "domains" as const, label: "Domains", icon: Globe },
            { id: "upload" as const, label: "Platform Upload", icon: Upload },
            { id: "platforms" as const, label: "Platform Connections", icon: Link2 },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {!companyId ? (
          <div className="rounded-lg border border-border p-6 text-sm text-muted-foreground">
            Select a company to manage inboxing.
          </div>
        ) : null}

        {companyId && activeTab === "inboxes" ? <WorkspaceInboxesPanel companyId={companyId} /> : null}

        {companyId && activeTab === "domains" ? (
          <DomainsPanel
            companyId={companyId}
            domains={domains}
            platforms={platforms}
            onChanged={onChanged}
          />
        ) : null}

        {companyId && activeTab === "upload" ? (
          <PlatformUploadPanel
            companyId={companyId}
            domains={domains}
            platforms={platforms}
            uploadData={uploadData}
            onRefresh={onChanged}
            onAddPlatform={() => setActiveTab("platforms")}
          />
        ) : null}

        {companyId && activeTab === "platforms" ? (
          <PlatformConnectionsPanel
            companyId={companyId}
            platforms={platforms}
            onChanged={onChanged}
          />
        ) : null}
      </div>
    </AppShell>
  );
}
