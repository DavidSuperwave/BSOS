"use client";

import { useEvents, type AppEvent } from "@/contexts/event-context";
import { useCompany } from "@/contexts/company-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { type NavigateAction, type SkillIssueAction } from "@/lib/action-items";
import { NO_ACTIVE_CAMPAIGN_SKILL } from "@/lib/skills/background-skill-definitions";
import {
  AlertTriangle,
  Bell,
  CheckCircle,
  Loader2,
  Info,
  Lightbulb,
  ExternalLink,
  X,
  Sparkles,
  SlidersHorizontal,
  Send,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_ACTION_ITEMS_SETTINGS,
  MOCK_AGENT_EVENTS,
  type ActionItemsSettings,
} from "@/components/dashboard/mock-dashboard-data";
import { cn } from "@/lib/utils";

const typeIcons: Record<string, React.ReactNode> = {
  action_item: <CheckCircle className="h-4 w-4 text-primary" />,
  insight: <Lightbulb className="h-4 w-4 text-warning" />,
  alert: <AlertTriangle className="h-4 w-4 text-destructive" />,
  status_update: <Info className="h-4 w-4 text-primary" />,
  cron_result: <Bell className="h-4 w-4 text-info" />,
};

const priorityColors: Record<string, string> = {
  urgent: "bg-destructive/10 text-destructive",
  high: "bg-warning/10 text-warning",
  medium: "bg-primary/10 text-primary",
  low: "bg-muted text-muted-foreground",
};

function EventItem({
  event,
  onDismiss,
  onMarkRead,
  onOpenIssue,
}: {
  event: AppEvent;
  onDismiss: () => void;
  onMarkRead: () => void;
  onOpenIssue: () => void;
}) {
  const skillIssue = getSkillIssueAction(event.actions);
  const navigateActions = getNavigateActions(event.actions);
  const isIssueEvent = Boolean(skillIssue);

  return (
    <div
      className={`flex items-start gap-3 p-3 rounded-lg transition-colors ${
        event.status === "unread" ? "bg-muted/60" : "bg-transparent"
      } ${isIssueEvent ? "cursor-pointer hover:bg-muted/70" : "hover:bg-muted/40"}`}
      onClick={isIssueEvent ? onOpenIssue : undefined}
    >
      <div className="mt-1 h-2 w-2 rounded-full bg-primary/70" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-[13px] font-semibold text-foreground truncate">
            {event.title}
          </p>
          <Badge
            variant="outline"
            className={`text-[10px] uppercase tracking-wide ${priorityColors[event.priority] || ""}`}
          >
            {event.priority}
          </Badge>
        </div>
        {event.description && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
            {event.description}
          </p>
        )}
        {isIssueEvent ? (
          <div className="mt-2">
            <p className="text-[11px] text-muted-foreground mb-1">
              {skillIssue?.skillName} · {skillIssue?.agentType} agent
            </p>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                onOpenIssue();
              }}
            >
              Talk to agent
            </Button>
          </div>
        ) : event.actions && event.actions.length > 0 ? (
          <div className="flex gap-2 mt-2">
            {navigateActions.map((action, i: number) => {
              if (action.type === "navigate") {
                return (
                  <Link key={i} href={action.href || "/"}>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={onMarkRead}
                    >
                      {action.label}
                    </Button>
                  </Link>
                );
              }
              return (
                <Button
                  key={i}
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={onMarkRead}
                >
                  {action.label}
                </Button>
              );
            })}
          </div>
        ) : null}
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
        className="text-muted-foreground hover:text-foreground transition-colors"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function EventsCard() {
  return <EventsCardContent />;
}

export function EventsCardEmbedded() {
  return (
    <div className="p-6 pt-0">
      <EventsCardContent embedded />
    </div>
  );
}

function EventsCardContent({ embedded = false }: { embedded?: boolean }) {
  const { selectedCompany } = useCompany();
  const { events, isLoading, markAsRead, dismiss, markAsActed, refresh } = useEvents();
  const [issueEvent, setIssueEvent] = useState<AppEvent | null>(null);
  const [isRunningStatusCheck, setIsRunningStatusCheck] = useState(false);
  const [statusCheckNote, setStatusCheckNote] = useState<string | null>(null);
  const [actionSettings, setActionSettings] = useState<ActionItemsSettings>(
    DEFAULT_ACTION_ITEMS_SETTINGS
  );

  const mergedEvents = useMemo(() => {
    const sourceEvents = actionSettings.useMockAgentEvents
      ? [...MOCK_AGENT_EVENTS, ...events]
      : events;
    return sourceEvents
      .filter((event) => event.status !== "dismissed")
      .filter((event) => {
        const hasSkillIssue = Boolean(getSkillIssueAction(event.actions));
        if (hasSkillIssue && !actionSettings.showSkillIssues) return false;
        if (event.event_type === "insight" && !actionSettings.showInsights) {
          return false;
        }
        if (
          event.event_type === "status_update" &&
          !actionSettings.showStatusUpdates
        ) {
          return false;
        }
        return true;
      })
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
  }, [actionSettings, events]);

  // Show only non-dismissed events, up to 6
  const visibleEvents = mergedEvents.slice(0, 6);
  const visibleUnreadCount = visibleEvents.filter(
    (event) => event.status === "unread"
  ).length;
  const issueDetails = useMemo(
    () => (issueEvent ? getSkillIssueAction(issueEvent.actions) : null),
    [issueEvent]
  );
  const issueNavigateActions = useMemo(
    () => getNavigateActions(issueEvent?.actions),
    [issueEvent]
  );

  const canRunNoActiveCampaignCheck =
    issueDetails?.skillSlug === NO_ACTIVE_CAMPAIGN_SKILL.slug;

  useEffect(() => {
    if (!selectedCompany?.id) return;
    const today = new Date().toISOString().slice(0, 10);
    const storageKey = `skills:no-active-campaign:last-check:${selectedCompany.id}`;
    const lastCheck = window.localStorage.getItem(storageKey);
    if (lastCheck === today) return;
    window.localStorage.setItem(storageKey, today);
    void fetch(
      `/api/companies/${selectedCompany.id}/agent/skills/no-active-campaign/check`,
      { method: "POST" }
    )
      .then(() => refresh())
      .catch(() => undefined);
  }, [selectedCompany?.id, refresh]);

  const closeIssueWorkspace = () => {
    setIssueEvent(null);
    setStatusCheckNote(null);
  };

  const runStatusCheck = async () => {
    if (!issueDetails || !issueEvent) return;
    if (!canRunNoActiveCampaignCheck) {
      setStatusCheckNote(
        "Status check is currently available only for the No Active Campaign Watchdog skill."
      );
      return;
    }
    setIsRunningStatusCheck(true);
    setStatusCheckNote("Running status check...");
    try {
      const response = await fetch(
        `/api/companies/${issueEvent.company_id}/agent/skills/no-active-campaign/check`,
        { method: "POST" }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Status check failed");
      }
      if (payload.status === "resolved") {
        await markAsActed(issueEvent.id);
        await dismiss(issueEvent.id);
        await refresh();
        setStatusCheckNote("Issue resolved. An active campaign is now detected.");
        closeIssueWorkspace();
        return;
      }
      if (payload.status === "issue_open") {
        setStatusCheckNote(
          "Still no active campaigns. Keep working with the campaigns agent or provide more instructions."
        );
      } else {
        setStatusCheckNote(payload.summary || "Status check completed.");
      }
      await refresh();
    } catch (err: any) {
      setStatusCheckNote(err?.message || "Status check failed.");
    } finally {
      setIsRunningStatusCheck(false);
    }
  };

  return (
    <>
      <Card
        className={cn(
          embedded
            ? "border-0 shadow-none rounded-none bg-transparent"
            : "rounded-2xl border-border/80"
        )}
      >
        <CardHeader
          className={cn(
            "flex flex-row items-center justify-between",
            embedded ? "px-0 pt-5 pb-3" : "pt-5 pb-3"
          )}
        >
          <div className="flex items-center gap-2">
            <CardTitle className="flex items-center gap-2">
              Action Items
              {visibleUnreadCount > 0 && (
                <Badge className="bg-primary/10 text-primary text-[10px]">
                  {visibleUnreadCount} new
                </Badge>
              )}
            </CardTitle>
            {actionSettings.useMockAgentEvents ? (
              <Badge variant="outline" className="text-[10px]">
                Mock + live
              </Badge>
            ) : null}
          </div>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5">
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Settings
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Action Items Settings</DialogTitle>
                <DialogDescription>
                  Configure which agent detections and recommendations show up
                  in this card.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-md border border-border p-3">
                  <div>
                    <p className="text-sm font-medium">Use mock agent events</p>
                    <p className="text-xs text-muted-foreground">
                      Helpful while skill and cron integrations are in buildout.
                    </p>
                  </div>
                  <Switch
                    checked={actionSettings.useMockAgentEvents}
                    onCheckedChange={(checked) =>
                      setActionSettings((prev) => ({
                        ...prev,
                        useMockAgentEvents: checked,
                      }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between rounded-md border border-border p-3">
                  <p className="text-sm">Show skill issues</p>
                  <Switch
                    checked={actionSettings.showSkillIssues}
                    onCheckedChange={(checked) =>
                      setActionSettings((prev) => ({
                        ...prev,
                        showSkillIssues: checked,
                      }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between rounded-md border border-border p-3">
                  <p className="text-sm">Show agent insights</p>
                  <Switch
                    checked={actionSettings.showInsights}
                    onCheckedChange={(checked) =>
                      setActionSettings((prev) => ({
                        ...prev,
                        showInsights: checked,
                      }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between rounded-md border border-border p-3">
                  <p className="text-sm">Show cron status updates</p>
                  <Switch
                    checked={actionSettings.showStatusUpdates}
                    onCheckedChange={(checked) =>
                      setActionSettings((prev) => ({
                        ...prev,
                        showStatusUpdates: checked,
                      }))
                    }
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() =>
                    setActionSettings(DEFAULT_ACTION_ITEMS_SETTINGS)
                  }
                >
                  Reset defaults
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className={cn(embedded ? "px-0 pb-0" : undefined)}>
          {isLoading && visibleEvents.length === 0 ? (
            <div className="py-4 text-center text-sm text-muted-foreground">
              Loading events...
            </div>
          ) : visibleEvents.length === 0 ? (
            <div className="py-4 text-center text-sm text-muted-foreground">
              No action items. Julian will notify you when something needs
              attention.
            </div>
          ) : (
            <div className="space-y-2">
              {visibleEvents.map((event) => (
                <EventItem
                  key={event.id}
                  event={event}
                  onDismiss={() => dismiss(event.id)}
                  onMarkRead={() => markAsRead(event.id)}
                  onOpenIssue={() => {
                    void markAsRead(event.id);
                    setStatusCheckNote(null);
                    setIssueEvent(event);
                  }}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {issueEvent && issueDetails && (
        <div className="fixed inset-0 z-50 bg-black/60">
          <div className="absolute inset-y-0 right-0 w-full max-w-6xl border-l border-border bg-background shadow-2xl">
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Skill Action Workspace
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Review report, collaborate with sub-agent, and close when fixed.
                  </p>
                </div>
                <Button variant="ghost" size="icon" onClick={closeIssueWorkspace}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[380px_minmax(0,1fr)]">
                <div className="min-h-0 space-y-4 overflow-y-auto border-b border-border p-4 lg:border-b-0 lg:border-r">
                  <div className="space-y-2">
                    <h3 className="text-base font-semibold text-foreground">
                      {issueDetails.skillName}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {issueEvent.description || issueDetails.summary}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="capitalize">
                      {issueDetails.agentType} agent
                    </Badge>
                    <Badge
                      variant="outline"
                      className={priorityColors[issueDetails.severity] || ""}
                    >
                      {issueDetails.severity}
                    </Badge>
                  </div>

                  {issueDetails.details ? (
                    <div className="rounded-lg border border-border bg-muted/30 p-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Skill report
                      </p>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-foreground/90">
                        {issueDetails.details}
                      </p>
                    </div>
                  ) : null}

                  {statusCheckNote ? (
                    <div className="rounded-md border border-primary/30 bg-primary/10 p-2 text-xs text-primary">
                      {statusCheckNote}
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    <Button
                      className="w-full gap-2"
                      onClick={() => void runStatusCheck()}
                      disabled={isRunningStatusCheck}
                    >
                      {isRunningStatusCheck ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5" />
                      )}
                      Run status check
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => {
                        void dismiss(issueEvent.id);
                        closeIssueWorkspace();
                      }}
                    >
                      Close action item
                    </Button>
                  </div>

                  <div className="space-y-2">
                    {issueNavigateActions.map((action, idx) => (
                      <Link key={`${action.href}-${idx}`} href={action.href}>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full justify-between"
                          onClick={closeIssueWorkspace}
                        >
                          {action.label}
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </Link>
                    ))}
                  </div>
                </div>

                <SkillIssueAgentPanel
                  key={`${issueEvent.id}-${issueDetails.issueKey}`}
                  issue={issueDetails}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function SkillIssueAgentPanel({
  issue,
}: {
  issue: SkillIssueAction;
}) {
  const [messages, setMessages] = useState<
    Array<{ id: string; role: "user" | "assistant"; content: string }>
  >([]);
  const [isResponding, setIsResponding] = useState(false);
  const [draft, setDraft] = useState("");

  const sendDraft = async () => {
    const nextMessage = draft.trim();
    if (!nextMessage || isResponding) return;
    setDraft("");
    const userMessage = {
      id: `user-${Date.now()}`,
      role: "user" as const,
      content: nextMessage,
    };
    setMessages((prev) => [...prev, userMessage]);
    setIsResponding(true);
    const response = buildLocalAgentResponse(issue, nextMessage);
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: response,
        },
      ]);
      setIsResponding(false);
    }, 450);
  };

  return (
    <div className="flex min-h-0 flex-col">
      <div className="border-b border-border px-5 py-4">
        <p className="text-sm font-semibold text-foreground">
          {issue.agentType} sub-agent
        </p>
        <p className="text-xs text-muted-foreground">
          Talk through fixes, run tasks, and request follow-up checks.
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
            <p className="mb-3">
              No conversation yet. Start with an automatic remediation plan.
            </p>
            <Button
              size="sm"
              onClick={() =>
                setMessages([
                  {
                    id: `assistant-${Date.now()}`,
                    role: "assistant",
                    content: buildInitialFixPlan(issue),
                  },
                ])
              }
            >
              Generate fix plan
            </Button>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`max-w-[90%] rounded-lg border px-3 py-2 text-sm ${
                message.role === "user"
                  ? "ml-auto border-primary/30 bg-primary/10"
                  : "border-border bg-muted/30"
              }`}
            >
              <p className="whitespace-pre-wrap">
                {message.content}
              </p>
            </div>
          ))
        )}
      </div>

      <div className="border-t border-border p-3">
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void sendDraft();
          }}
        >
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask the sub-agent how to fix this issue..."
          />
          <Button type="submit" size="icon" disabled={isResponding || !draft.trim()}>
            {isResponding ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}

function buildInitialFixPlan(issue: SkillIssueAction) {
  return (
    `Remediation plan for ${issue.skillName}:\n` +
    `1) Validate root cause: ${issue.summary}\n` +
    "2) Check current campaign statuses and identify candidates to activate.\n" +
    "3) Pick one safe launch candidate and activate with conservative sending limits.\n" +
    "4) Run a status check from this workspace to confirm issue resolution.\n\n" +
    "Want me to turn this into exact step-by-step instructions?"
  );
}

function buildLocalAgentResponse(issue: SkillIssueAction, prompt: string) {
  const lower = prompt.toLowerCase();
  if (lower.includes("first") || lower.includes("start")) {
    return (
      "Start with visibility: open campaigns and list statuses (draft, paused, running). " +
      "Choose the best candidate with validated copy and warmed infrastructure, then activate it. " +
      "After activation, return here and run status check."
    );
  }
  if (lower.includes("fix") || lower.includes("resolve")) {
    return (
      `To resolve "${issue.summary}", I recommend: (a) activate one campaign now, ` +
      "(b) queue one fallback campaign, (c) schedule a daily health check so this doesn't regress."
    );
  }
  return (
    "I can help with a concrete next step. Tell me whether you want to activate an existing campaign, " +
    "create a new one, or review campaign readiness."
  );
}

function getNavigateActions(actions: any[] | undefined): NavigateAction[] {
  if (!Array.isArray(actions)) return [];
  return actions.filter(
    (action): action is NavigateAction =>
      action?.type === "navigate" &&
      typeof action?.label === "string" &&
      typeof action?.href === "string"
  );
}

function getSkillIssueAction(actions: any[] | undefined): SkillIssueAction | null {
  if (!Array.isArray(actions)) return null;
  const issue = actions.find((action) => action?.type === "skill_issue");
  if (!issue) return null;
  if (
    typeof issue.issueKey !== "string" ||
    typeof issue.skillSlug !== "string" ||
    typeof issue.skillName !== "string" ||
    typeof issue.agentType !== "string" ||
    typeof issue.summary !== "string"
  ) {
    return null;
  }
  return issue as SkillIssueAction;
}
