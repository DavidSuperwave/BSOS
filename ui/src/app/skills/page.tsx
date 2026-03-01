"use client";

import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import SkillsSettings from "@/components/skills/skills-settings";

export default function SkillsPage() {
  return (
    <AppShell
      header={{
        title: "Skills Store",
        subtitle: "Company-local skill management for main and sub-agents",
      }}
    >
      <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading skills...</div>}>
        <SkillsSettings />
      </Suspense>
    </AppShell>
  );
}
