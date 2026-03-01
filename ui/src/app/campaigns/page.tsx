"use client";

import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import Campaigns from "@/components/Campaigns";

export default function CampaignsPage() {
  return (
    <AppShell
      header={{
        title: "Campaigns",
        subtitle: "Manage and monitor your outreach campaigns",
      }}
      hideHeader
      mainClassName="bg-slate-50 p-2 md:p-3 xl:p-4"
    >
      <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading campaigns...</div>}>
        <Campaigns />
      </Suspense>
    </AppShell>
  );
}
