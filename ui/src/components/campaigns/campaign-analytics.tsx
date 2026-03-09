"use client";

import { useState } from "react";
import { useCampaigns, useCampaignAnalytics } from "@/lib/hooks";
import { useCompany } from "@/contexts/company-context";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  X, 
  Edit3, 
  ChevronDown,
  Mail,
  Users,
  UserPlus,
  CheckCircle,
  MessageCircle,
  ThumbsUp,
  Ban,
  Eye,
  UserX,
  Info,
  Calendar
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
} from "recharts";
import { cn } from "@/lib/utils";

interface CampaignAnalyticsProps {
  campaignId: string;
  onClose: () => void;
  onEdit?: (id: string) => void;
}

// Fallback empty arrays when API data is not yet loaded
const EMPTY_DAILY: { date: string; newLead: number; followUp: number }[] = [];
const EMPTY_METRICS: { date: string; replyWithOOO: number; reply: number; positive: number; bounce: number }[] = [];
const EMPTY_STEPS: { id: string; title: string; sent: number; replied: number; positive: number }[] = [];

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subValue?: string | number;
  subLabel?: string;
  className?: string;
}

function StatCard({ icon, label, value, subValue, subLabel, className }: StatCardProps) {
  return (
    <Card className={cn("rounded-xl border-border/80 bg-card", className)}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-muted/60 p-1.5 text-muted-foreground">
              {icon}
            </div>
            <span className="text-xs font-medium text-muted-foreground">{label}</span>
            <Info className="h-3 w-3 text-muted-foreground/50" />
          </div>
        </div>
        <div className="mt-3">
          <span className="text-2xl font-semibold text-foreground">{value}</span>
          {subValue !== undefined && (
            <div className="flex items-center gap-2 mt-1">
              <span className="text-lg font-medium text-muted-foreground">{subValue}</span>
              {subLabel && <span className="text-xs text-muted-foreground">{subLabel}</span>}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SmallStatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="rounded-xl border-border/80 bg-card">
      <CardContent className="p-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="rounded-md bg-muted/60 p-1 text-muted-foreground">
            {icon}
          </div>
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <span className="text-lg font-semibold text-foreground">{value}</span>
      </CardContent>
    </Card>
  );
}

export function CampaignAnalytics({ campaignId, onClose, onEdit }: CampaignAnalyticsProps) {
  const { selectedCompany } = useCompany();
  const { data, isLoading } = useCampaigns(selectedCompany?.id);
  const { data: analyticsData } = useCampaignAnalytics(campaignId, selectedCompany?.id);
  const [dateRange, setDateRange] = useState("Last 2 Weeks");
  const [provider, setProvider] = useState("All Recipient Providers");
  const [metricsView, setMetricsView] = useState<"count" | "percent">("count");

  const campaign = data?.campaigns?.find((c) => c.id === campaignId);
  const stats = campaign?.stats;

  // Use real analytics data when available, fall back to campaign stats
  const totals = analyticsData?.totals;
  const dailyEmailData = analyticsData?.dailyStats || EMPTY_DAILY;
  const dailyMetricsData = analyticsData?.dailyMetrics || EMPTY_METRICS;
  const sequenceStepData = analyticsData?.stepStats || EMPTY_STEPS;

  const sent = totals?.sent ?? stats?.sent ?? 0;
  const contacted = totals?.contacted ?? stats?.contacted ?? 0;
  const completed = totals?.completed ?? stats?.completed ?? 0;
  const replies = stats?.replies || 0;
  const positive = stats?.positive || 0;
  const bounced = stats?.bounced || 0;

  const replyRate = totals?.replyRate ?? (sent > 0 ? Math.round((replies / sent) * 100) : 0);
  const replyRateWithOOO = replyRate;
  const repliesWithOOO = replies;
  const positiveRate = totals?.positiveRate ?? (replies > 0 ? Math.round((positive / replies) * 100) : 0);
  const bounceRate = totals?.bounceRate ?? (sent > 0 ? Number(((bounced / sent) * 100).toFixed(1)) : 0);
  const openRate = totals?.openRate ?? (stats?.openRate || 0);
  const unsubscribeRate = totals?.unsubscribeRate ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/30 backdrop-blur-sm" 
        onClick={onClose}
      />
      
      {/* Side Panel */}
      <div className="relative w-full max-w-4xl bg-card shadow-2xl animate-in slide-in-from-right duration-300 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <button className="p-1 hover:bg-muted rounded-full transition-colors">
              <ChevronDown className="h-5 w-5 rotate-90 text-muted-foreground" />
            </button>
            <h2 className="text-base font-medium text-foreground">
              {campaign?.name || 'Campaign Analytics'}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {onEdit && (
              <Button 
                variant="outline" 
                size="sm" 
                className="gap-2"
                onClick={() => onEdit(campaignId)}
              >
                <Edit3 className="h-4 w-4" />
                Edit Campaign
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={onClose} className="text-muted-foreground">
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="analytics" className="flex-1 flex flex-col overflow-hidden">
          <div className="px-6 pt-4 border-b border-border">
            <TabsList className="bg-transparent p-0 h-auto gap-6">
              <TabsTrigger 
                value="analytics" 
                className="rounded-none px-0 pb-3 text-sm font-medium text-muted-foreground data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none"
              >
                Analytics
              </TabsTrigger>
              <TabsTrigger 
                value="steps"
                className="rounded-none px-0 pb-3 text-sm font-medium text-muted-foreground data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none"
              >
                Steps & variations
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="analytics" className="flex-1 overflow-y-auto p-6 space-y-6 mt-0">
            {isLoading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
              </div>
            ) : (
              <>
                {/* Filters */}
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-foreground">{dateRange}</span>
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
                    <span className="text-sm text-foreground">{provider}</span>
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>

                {/* Stats Grid - Row 1 */}
                <div className="grid grid-cols-4 gap-4">
                  <StatCard 
                    icon={<Mail className="h-4 w-4" />}
                    label="Total Email Sent"
                    value={sent}
                  />
                  <StatCard 
                    icon={<Users className="h-4 w-4" />}
                    label="Total Contacted Leads"
                    value={contacted}
                  />
                  <StatCard 
                    icon={<UserPlus className="h-4 w-4" />}
                    label="New Leads Contacted"
                    value={contacted}
                  />
                  <StatCard 
                    icon={<CheckCircle className="h-4 w-4" />}
                    label="Total Completed Leads"
                    value={completed}
                  />
                </div>

                {/* Stats Grid - Row 2 */}
                <div className="grid grid-cols-4 gap-4">
                  <StatCard 
                    icon={<MessageCircle className="h-4 w-4" />}
                    label="Reply Rate (with OOO)"
                    value={`${replyRateWithOOO}%`}
                    subValue={repliesWithOOO}
                  />
                  <StatCard 
                    icon={<MessageCircle className="h-4 w-4" />}
                    label="Reply Rate"
                    value={`${replyRate}%`}
                    subValue={replies}
                  />
                  <StatCard 
                    icon={<ThumbsUp className="h-4 w-4" />}
                    label="Positive Reply"
                    value={`${positiveRate}%`}
                    subValue="$0k"
                    subLabel="Value"
                  />
                  <StatCard 
                    icon={<Ban className="h-4 w-4" />}
                    label="Bounce Rate"
                    value={`${bounceRate}%`}
                    subValue={bounced}
                  />
                </div>

                {/* Stats Grid - Row 3 (Small) */}
                <div className="grid grid-cols-5 gap-4">
                  <SmallStatCard 
                    icon={<Eye className="h-4 w-4" />}
                    label="Open rate"
                    value={`${openRate}%`}
                  />
                  <SmallStatCard 
                    icon={<UserX className="h-4 w-4" />}
                    label="Unsubscribe rate"
                    value={`${unsubscribeRate}%`}
                  />
                  <div className="col-span-3" />
                </div>

                {/* Daily Email Sent Chart */}
                <Card className="rounded-2xl border-border/80 bg-card">
                  <CardContent className="p-6">
                    <h3 className="mb-6 text-sm font-medium text-foreground">Daily Email Sent</h3>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={dailyEmailData} barGap={8}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                          <XAxis 
                            dataKey="date" 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                            dy={10}
                          />
                          <YAxis 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                          />
                          <Tooltip 
                            contentStyle={{ 
                              backgroundColor: 'hsl(var(--card))', 
                              border: '1px solid hsl(var(--border))',
                              borderRadius: '8px',
                              boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                            }}
                          />
                          <Legend 
                            verticalAlign="top" 
                            height={36}
                            iconType="circle"
                            wrapperStyle={{ paddingBottom: '20px' }}
                          />
                          <Bar 
                            dataKey="newLead" 
                            name="New Lead" 
                            fill="hsl(var(--primary))" 
                            radius={[4, 4, 0, 0]}
                            maxBarSize={40}
                          />
                          <Bar 
                            dataKey="followUp" 
                            name="Follow-up" 
                            fill="#38bdf8" 
                            radius={[4, 4, 0, 0]}
                            maxBarSize={40}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                {/* Daily Metrics Chart */}
                <Card className="rounded-2xl border-border/80 bg-card">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-sm font-medium text-foreground">Daily Metrics</h3>
                      <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1">
                        <button 
                          className={cn(
                            "px-3 py-1 text-xs font-medium rounded-md transition-colors",
                            metricsView === "count" 
                              ? "bg-background text-foreground shadow-sm" 
                              : "text-muted-foreground hover:text-foreground"
                          )}
                          onClick={() => setMetricsView("count")}
                        >
                          Show Count
                        </button>
                        <button 
                          className={cn(
                            "px-3 py-1 text-xs font-medium rounded-md transition-colors",
                            metricsView === "percent" 
                              ? "bg-background text-foreground shadow-sm" 
                              : "text-muted-foreground hover:text-foreground"
                          )}
                          onClick={() => setMetricsView("percent")}
                        >
                          Show %
                        </button>
                      </div>
                    </div>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={dailyMetricsData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                          <XAxis 
                            dataKey="date" 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                            dy={10}
                          />
                          <YAxis 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                          />
                          <Tooltip 
                            contentStyle={{ 
                              backgroundColor: 'hsl(var(--card))', 
                              border: '1px solid hsl(var(--border))',
                              borderRadius: '8px',
                              boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                            }}
                          />
                          <Legend 
                            verticalAlign="top" 
                            height={36}
                            iconType="circle"
                            wrapperStyle={{ paddingBottom: '20px' }}
                          />
                          <Line 
                            type="monotone" 
                            dataKey="replyWithOOO" 
                            name="Reply Count (with OOO)" 
                            stroke="hsl(var(--primary))" 
                            strokeWidth={2}
                            dot={{ fill: 'hsl(var(--primary))', strokeWidth: 0, r: 4 }}
                            activeDot={{ r: 6 }}
                          />
                          <Line 
                            type="monotone" 
                            dataKey="reply" 
                            name="Reply Count" 
                            stroke="#38bdf8" 
                            strokeWidth={2}
                            dot={{ fill: '#38bdf8', strokeWidth: 0, r: 4 }}
                            activeDot={{ r: 6 }}
                          />
                          <Line 
                            type="monotone" 
                            dataKey="positive" 
                            name="Positive Reply Count" 
                            stroke="#10b981" 
                            strokeWidth={2}
                            dot={{ fill: '#10b981', strokeWidth: 0, r: 4 }}
                            activeDot={{ r: 6 }}
                          />
                          <Line 
                            type="monotone" 
                            dataKey="bounce" 
                            name="Bounce Count" 
                            stroke="#ef4444" 
                            strokeWidth={2}
                            dot={{ fill: '#ef4444', strokeWidth: 0, r: 4 }}
                            activeDot={{ r: 6 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          <TabsContent value="steps" className="flex-1 overflow-y-auto p-6 mt-0">
            <div className="space-y-4">
              {sequenceStepData.map((step) => (
                <Card key={step.id} className="rounded-xl border-border/80 bg-card">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-foreground">{step.title}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Sent {step.sent} • Replied {step.replied} • Positive {step.positive}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onEdit?.(campaignId)}
                      >
                        Edit Step
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
              <p className="text-xs text-muted-foreground">
                Variation-level analytics can be expanded as PlusVibe step data endpoints are wired.
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
