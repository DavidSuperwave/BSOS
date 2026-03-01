"use client";

import { AppShell } from "@/components/app-shell";
import Settings from "@/components/Settings";

export default function SettingsPage() {
  return (
    <AppShell
      header={{
        title: "Settings",
        subtitle: "Configure your GTM Engine",
      }}
    >
      <Settings />
    </AppShell>
  );
}
