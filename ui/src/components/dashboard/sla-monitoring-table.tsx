"use client";

import { MoreHorizontal } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { type DashboardMetrics } from "@/lib/hooks";

interface SLAMonitoringTableProps {
  campaigns: DashboardMetrics["activeCampaigns"];
  isLoading?: boolean;
}

function formatTimestamp(value?: string) {
  if (!value) return "N/A";
  return new Date(value).toLocaleDateString();
}

export function SLAMonitoringTable({
  campaigns,
  isLoading = false,
}: SLAMonitoringTableProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>SLA Monitoring</CardTitle>
        <Badge variant="outline">{campaigns.length} active</Badge>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Loading SLA data...
          </div>
        ) : campaigns.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Active campaigns will appear here.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Campaign ID</th>
                  <th className="py-2 pr-3 font-medium">Campaign</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium">Last Sent</th>
                  <th className="py-2 pr-3 font-medium">Last Reply</th>
                  <th className="py-2 pr-3 font-medium">SLA Due</th>
                  <th className="py-2 pr-3 font-medium">Priority</th>
                  <th className="py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((campaign) => (
                  <tr key={campaign.id} className="border-b border-border/70">
                    <td className="py-3 pr-3 text-muted-foreground">{campaign.id.slice(0, 8)}</td>
                    <td className="py-3 pr-3 font-medium text-foreground">{campaign.name}</td>
                    <td className="py-3 pr-3">
                      <Badge variant="outline" className="capitalize">
                        {String(campaign.status || "active").toLowerCase()}
                      </Badge>
                    </td>
                    <td className="py-3 pr-3 text-muted-foreground">{formatTimestamp(campaign.lastSent)}</td>
                    <td className="py-3 pr-3 text-muted-foreground">{formatTimestamp(campaign.lastReplied)}</td>
                    <td className="py-3 pr-3 text-muted-foreground">-</td>
                    <td className="py-3 pr-3 text-muted-foreground">-</td>
                    <td className="py-3 text-right">
                      <button
                        type="button"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:text-foreground"
                        aria-label={`More actions for ${campaign.name}`}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
