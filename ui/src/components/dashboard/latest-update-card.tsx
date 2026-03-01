"use client";

import { useMemo, useState } from "react";
import {
  Mail,
  CalendarCheck2,
  Briefcase,
  Activity,
  SlidersHorizontal,
  Route,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { useCompany } from "@/contexts/company-context";
import { type DashboardActivity, useDashboardActivities } from "@/lib/hooks";
import {
  DEFAULT_ACTIVITY_FEED_SETTINGS,
  type ActivityFeedSettings,
  MOCK_ACTIVITY_ITEMS,
  type MockActivityItem,
} from "@/components/dashboard/mock-dashboard-data";

type RangeValue = "today" | "yesterday" | "week";
type SortValue = "date_desc" | "date_asc";

function iconForActivity(type: DashboardActivity["event_type"]) {
  if (type === "email_reply") return <Mail className="h-4 w-4 text-primary" />;
  if (type === "meeting_booked") {
    return <CalendarCheck2 className="h-4 w-4 text-emerald-500" />;
  }
  if (type === "opportunity_created") {
    return <Briefcase className="h-4 w-4 text-violet-500" />;
  }
  return <Activity className="h-4 w-4 text-muted-foreground" />;
}

function iconForMockActivity(type: MockActivityItem["kind"]) {
  if (type === "reply") return <Mail className="h-4 w-4 text-primary" />;
  if (type === "booking") {
    return <CalendarCheck2 className="h-4 w-4 text-emerald-500" />;
  }
  if (type === "deal_closed") {
    return <Briefcase className="h-4 w-4 text-violet-500" />;
  }
  return <Activity className="h-4 w-4 text-muted-foreground" />;
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

export function LatestUpdateCard() {
  const { selectedCompany } = useCompany();
  const [range, setRange] = useState<RangeValue>("today");
  const [sort, setSort] = useState<SortValue>("date_desc");
  const [search, setSearch] = useState("");
  const [feedSettings, setFeedSettings] = useState<ActivityFeedSettings>(
    DEFAULT_ACTIVITY_FEED_SETTINGS
  );

  const { data, isLoading } = useDashboardActivities(
    selectedCompany?.id,
    range,
    sort,
    search
  );

  const apiActivities = useMemo(() => data?.activities || [], [data?.activities]);
  const mockActivities = useMemo(() => {
    return MOCK_ACTIVITY_ITEMS.filter((item) => {
      if (!feedSettings.enabledSources[item.source]) return false;
      if (!feedSettings.enabledKinds[item.kind]) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        return [item.title, item.description]
          .join(" ")
          .toLowerCase()
          .includes(q);
      }
      return true;
    }).sort((a, b) =>
      sort === "date_asc"
        ? new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [feedSettings.enabledKinds, feedSettings.enabledSources, search, sort]);

  const shouldUseMock = feedSettings.useMockData || apiActivities.length === 0;
  const activities = shouldUseMock ? mockActivities : apiActivities;

  return (
    <Card className="h-full flex flex-col rounded-2xl border-border/80">
      <CardHeader className="space-y-4 p-5 pb-4">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base font-semibold tracking-tight">
            Activity
          </CardTitle>
          <div className="flex items-center gap-2">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortValue)}
              className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
              aria-label="Sort activities by date"
            >
              <option value="date_desc">Newest first</option>
              <option value="date_asc">Oldest first</option>
            </select>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1.5">
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  Settings
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Activity Feed Settings</DialogTitle>
                  <DialogDescription>
                    Choose event sources and configure API routes for this feed.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-5">
                  <div className="flex items-center justify-between rounded-md border border-border p-3">
                    <div>
                      <p className="text-sm font-medium">Use mock activity data</p>
                      <p className="text-xs text-muted-foreground">
                        Keep enabled until API integrations are finalized.
                      </p>
                    </div>
                    <Switch
                      checked={feedSettings.useMockData}
                      onCheckedChange={(checked) =>
                        setFeedSettings((prev) => ({
                          ...prev,
                          useMockData: checked,
                        }))
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-medium">Data sources</p>
                    {([
                      ["plusvibe", "PlusVibe replies"],
                      ["calendly", "Calendly bookings"],
                      ["crm", "CRM deals"],
                    ] as const).map(([source, label]) => (
                      <div
                        key={source}
                        className="flex items-center justify-between rounded-md border border-border p-2"
                      >
                        <p className="text-sm">{label}</p>
                        <Switch
                          checked={feedSettings.enabledSources[source]}
                          onCheckedChange={(checked) =>
                            setFeedSettings((prev) => ({
                              ...prev,
                              enabledSources: {
                                ...prev.enabledSources,
                                [source]: checked,
                              },
                            }))
                          }
                        />
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-medium">Event types</p>
                    {([
                      ["reply", "Replies"],
                      ["booking", "Bookings"],
                      ["deal_closed", "Deals closed"],
                    ] as const).map(([kind, label]) => (
                      <div
                        key={kind}
                        className="flex items-center justify-between rounded-md border border-border p-2"
                      >
                        <p className="text-sm">{label}</p>
                        <Switch
                          checked={feedSettings.enabledKinds[kind]}
                          onCheckedChange={(checked) =>
                            setFeedSettings((prev) => ({
                              ...prev,
                              enabledKinds: {
                                ...prev.enabledKinds,
                                [kind]: checked,
                              },
                            }))
                          }
                        />
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-medium">API routes</p>
                    {([
                      ["plusvibe", "PlusVibe API route"],
                      ["calendly", "Calendly API route"],
                      ["crm", "CRM API route"],
                    ] as const).map(([source, label]) => (
                      <div key={source} className="space-y-1">
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <Input
                          value={feedSettings.apiRoutes[source]}
                          onChange={(e) =>
                            setFeedSettings((prev) => ({
                              ...prev,
                              apiRoutes: {
                                ...prev.apiRoutes,
                                [source]: e.target.value,
                              },
                            }))
                          }
                          placeholder={`/api/${source}/...`}
                        />
                      </div>
                    ))}
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() =>
                      setFeedSettings(DEFAULT_ACTIVITY_FEED_SETTINGS)
                    }
                  >
                    Reset defaults
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Tabs value={range} onValueChange={(value) => setRange(value as RangeValue)}>
          <TabsList className="h-8">
            <TabsTrigger value="today" className="text-xs">
              Today
            </TabsTrigger>
            <TabsTrigger value="yesterday" className="text-xs">
              Yesterday
            </TabsTrigger>
            <TabsTrigger value="week" className="text-xs">
              This week
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search activities"
          className="h-9"
        />
      </CardHeader>

      <CardContent className="flex-1 min-h-0 flex flex-col p-4 pt-0">
        <div className="mb-3 flex items-center gap-2">
          <Badge variant="outline" className="text-[11px]">
            {shouldUseMock ? "Mock feed active" : "Live feed active"}
          </Badge>
          <Badge variant="outline" className="text-[11px]">
            {activities.length} updates
          </Badge>
        </div>
        {isLoading ? (
          <p className="py-6 text-sm text-center text-muted-foreground">
            Loading latest updates...
          </p>
        ) : activities.length === 0 ? (
          <p className="py-6 text-sm text-center text-muted-foreground">
            No outbound activity yet for this range.
          </p>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-1">
            {shouldUseMock
              ? mockActivities.map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-start gap-2.5 rounded-xl border border-border/70 bg-background px-3 py-2.5 hover:bg-muted/30 transition-colors"
                  >
                    <div className="mt-0.5">{iconForMockActivity(activity.kind)}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-[12px] font-semibold text-foreground">
                          {activity.title}
                        </p>
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {activity.source}
                        </Badge>
                      </div>
                      <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
                        {activity.description}
                      </p>
                      <div className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Route className="h-3 w-3" />
                        <span className="truncate">
                          Route: {feedSettings.apiRoutes[activity.source]}
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0 text-[10px] text-muted-foreground">
                      {formatTimestamp(activity.createdAt)}
                    </div>
                  </div>
                ))
              : apiActivities.map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-start gap-2.5 rounded-xl border border-border/70 bg-background px-3 py-2.5 hover:bg-muted/30 transition-colors"
                  >
                    <div className="mt-0.5">{iconForActivity(activity.event_type)}</div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-semibold text-foreground">
                        {activity.title}
                      </p>
                      {activity.description ? (
                        <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
                          {activity.description}
                        </p>
                      ) : null}
                    </div>
                    <div className="shrink-0 text-[10px] text-muted-foreground">
                      {formatTimestamp(activity.created_at)}
                    </div>
                  </div>
                ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
