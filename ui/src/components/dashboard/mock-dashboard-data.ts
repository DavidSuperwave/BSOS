"use client";

import type { AppEvent } from "@/contexts/event-context";

export type ActivitySource = "plusvibe" | "calendly" | "crm";
export type ActivityKind = "reply" | "booking" | "deal_closed";

export interface MockActivityItem {
  id: string;
  source: ActivitySource;
  kind: ActivityKind;
  title: string;
  description: string;
  createdAt: string;
  route: string;
}

export interface ActivityFeedSettings {
  useMockData: boolean;
  enabledSources: Record<ActivitySource, boolean>;
  enabledKinds: Record<ActivityKind, boolean>;
  apiRoutes: Record<ActivitySource, string>;
}

export const DEFAULT_ACTIVITY_FEED_SETTINGS: ActivityFeedSettings = {
  useMockData: false,
  enabledSources: {
    plusvibe: true,
    calendly: true,
    crm: true,
  },
  enabledKinds: {
    reply: true,
    booking: true,
    deal_closed: true,
  },
  apiRoutes: {
    plusvibe: "/api/plusvibe/replies",
    calendly: "/api/calendly/scheduled-events",
    crm: "/api/crm/deals/closed",
  },
};

export const MOCK_ACTIVITY_ITEMS: MockActivityItem[] = [
  {
    id: "mock-activity-1",
    source: "plusvibe",
    kind: "reply",
    title: "New positive reply from Superwave lead",
    description: "Lead asked for pricing and implementation timeline.",
    createdAt: "2026-02-26T20:36:00.000Z",
    route: "/api/plusvibe/replies",
  },
  {
    id: "mock-activity-2",
    source: "calendly",
    kind: "booking",
    title: "Demo booked via Calendly",
    description: "45-min discovery call booked for Friday 11:00 AM.",
    createdAt: "2026-02-26T19:14:00.000Z",
    route: "/api/calendly/scheduled-events",
  },
  {
    id: "mock-activity-3",
    source: "crm",
    kind: "deal_closed",
    title: "Deal moved to Closed Won",
    description: "Acme Ops signed annual plan at $22,400 ARR.",
    createdAt: "2026-02-25T15:52:00.000Z",
    route: "/api/crm/deals/closed",
  },
  {
    id: "mock-activity-4",
    source: "plusvibe",
    kind: "reply",
    title: "Reply requires follow-up",
    description: "Prospect requested security docs before next step.",
    createdAt: "2026-02-24T18:04:00.000Z",
    route: "/api/plusvibe/replies",
  },
];

export interface ActionItemsSettings {
  useMockAgentEvents: boolean;
  showSkillIssues: boolean;
  showInsights: boolean;
  showStatusUpdates: boolean;
}

export const DEFAULT_ACTION_ITEMS_SETTINGS: ActionItemsSettings = {
  useMockAgentEvents: false,
  showSkillIssues: true,
  showInsights: true,
  showStatusUpdates: true,
};

export const MOCK_AGENT_EVENTS: AppEvent[] = [
  {
    id: "mock-agent-1",
    company_id: "mock-company",
    event_type: "alert",
    title: "Skill issue detected: PlusVibe Rate Limiter",
    description:
      "Julian detected repeated 429 responses in outbound reply sync.",
    priority: "high",
    status: "unread",
    created_at: "2026-02-26T20:20:00.000Z",
    updated_at: "2026-02-26T20:20:00.000Z",
    actions: [
      {
        type: "skill_issue",
        issueKey: "pv-rate-limit-2026-02-26",
        skillSlug: "plusvibe-reply-sync",
        skillName: "PlusVibe Reply Sync",
        agentType: "ops-agent",
        severity: "high",
        summary: "Rate limit bursts causing delayed reply ingestion.",
        details:
          "Suggested fix: throttle batch size to 50, add 2s retry backoff, and queue retries via cron worker.",
      },
      {
        type: "navigate",
        label: "Open skill logs",
        href: "/skills",
      },
    ],
  },
  {
    id: "mock-agent-2",
    company_id: "mock-company",
    event_type: "insight",
    title: "Agent insight: booking velocity up 18%",
    description:
      "Calendly conversions improved after last template update. Recommend scaling this sequence.",
    priority: "medium",
    status: "unread",
    created_at: "2026-02-26T18:50:00.000Z",
    updated_at: "2026-02-26T18:50:00.000Z",
    actions: [
      {
        type: "navigate",
        label: "Review campaigns",
        href: "/campaigns",
      },
    ],
  },
  {
    id: "mock-agent-3",
    company_id: "mock-company",
    event_type: "status_update",
    title: "Cron check complete",
    description:
      "Nightly data sync ran successfully. 132 records reconciled.",
    priority: "low",
    status: "read",
    created_at: "2026-02-26T16:03:00.000Z",
    updated_at: "2026-02-26T16:03:00.000Z",
    actions: [],
  },
];
