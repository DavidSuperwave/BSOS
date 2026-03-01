"use client";

import { useEvents, type AppEvent } from "@/contexts/event-context";
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
import {
  AlertTriangle,
  Bell,
  CheckCircle,
  Info,
  Lightbulb,
  ExternalLink,
  X,
  SlidersHorizontal,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
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
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                onOpenIssue();
              }}
            >
              View Issue
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
  const { events, isLoading, markAsRead, dismiss } = useEvents();
  const [issueEvent, setIssueEvent] = useState<AppEvent | null>(null);
  const [issueResolutionNote, setIssueResolutionNote] = useState("");
  const [issueSignoffDone, setIssueSignoffDone] = useState(false);
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
                    setIssueEvent(event);
                  }}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {issueEvent && issueDetails && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <Card className="w-full max-w-2xl">
            <CardHeader className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-1">
                  <CardTitle className="text-lg">{issueEvent.title}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {issueEvent.description || issueDetails.summary}
                  </p>
                </div>
                <button
                  onClick={() => setIssueEvent(null)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Close issue report"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {issueSignoffDone ? (
                <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs text-emerald-700 dark:text-emerald-300">
                  Sign-off captured. Agent can proceed with remediation run.
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{issueDetails.skillName}</Badge>
                <Badge variant="outline" className="capitalize">
                  {issueDetails.agentType}
                </Badge>
                <Badge
                  variant="outline"
                  className={priorityColors[issueDetails.severity] || ""}
                >
                  {issueDetails.severity}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {issueDetails.details && (
                <div className="rounded-lg border border-border bg-muted/40 p-3">
                  <p className="text-sm text-foreground/90 whitespace-pre-wrap">
                    {issueDetails.details}
                  </p>
                </div>
              )}
              <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-xs font-medium text-muted-foreground">
                  Operator response for agent
                </p>
                <Input
                  value={issueResolutionNote}
                  onChange={(e) => setIssueResolutionNote(e.target.value)}
                  placeholder="Add your note for the agent before sign-off..."
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setIssueSignoffDone(true)}
                  >
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Sign off and send to agent
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setIssueResolutionNote("");
                      setIssueSignoffDone(false);
                    }}
                  >
                    Clear response
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {issueNavigateActions.map((action, idx) => (
                  <Link key={`${action.href}-${idx}`} href={action.href}>
                    <Button
                      variant={idx === 0 ? "default" : "outline"}
                      size="sm"
                      onClick={() => setIssueEvent(null)}
                      className="gap-1.5"
                    >
                      {action.label}
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setIssueEvent(null);
                    setIssueResolutionNote("");
                    setIssueSignoffDone(false);
                  }}
                >
                  Close
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
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
