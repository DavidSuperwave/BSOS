"use client";

import { Badge } from "@/components/ui/badge";
import { Check, FileText, ThumbsUp, ThumbsDown } from "lucide-react";

interface StepReviewProps {
  data: Record<string, any>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border p-4">
      <h3 className="text-sm font-semibold text-emerald-400 mb-3">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | string[] }) {
  if (!value || (Array.isArray(value) && value.length === 0)) return null;
  return (
    <div className="flex justify-between py-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      {Array.isArray(value) ? (
        <div className="flex flex-wrap gap-1 justify-end max-w-[60%]">
          {value.map((v) => (
            <Badge key={v} variant="outline" className="text-xs">{v}</Badge>
          ))}
        </div>
      ) : (
        <span className="text-sm text-foreground text-right max-w-[60%] truncate">{value}</span>
      )}
    </div>
  );
}

function CustomerFitList({
  entries,
  type,
}: {
  entries: Array<{ company_name: string; size?: string; industry?: string; reason: string }>;
  type: "best" | "poor";
}) {
  if (!entries || entries.length === 0) return null;
  return (
    <div className="space-y-2">
      {entries
        .filter((e) => e.company_name)
        .map((entry, i) => (
          <div key={i} className="flex items-start gap-2 py-1">
            {type === "best" ? (
              <ThumbsUp className="h-3.5 w-3.5 text-emerald-400 mt-0.5 shrink-0" />
            ) : (
              <ThumbsDown className="h-3.5 w-3.5 text-red-400 mt-0.5 shrink-0" />
            )}
            <div className="text-sm">
              <span className="font-medium text-foreground">{entry.company_name}</span>
              {entry.size && (
                <span className="text-muted-foreground"> · {entry.size}</span>
              )}
              {entry.industry && (
                <span className="text-muted-foreground"> · {entry.industry}</span>
              )}
              {entry.reason && (
                <p className="text-xs text-muted-foreground mt-0.5">{entry.reason}</p>
              )}
            </div>
          </div>
        ))}
    </div>
  );
}

function CompetitorList({ competitors }: { competitors: Array<{ name: string; url?: string } | string> }) {
  if (!competitors || competitors.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {competitors.map((c, i) => {
        const name = typeof c === "string" ? c : c.name;
        const url = typeof c === "string" ? undefined : c.url;
        if (!name) return null;
        return (
          <Badge key={i} variant="outline" className="text-xs">
            {name}
            {url && (
              <span className="text-muted-foreground ml-1">↗</span>
            )}
          </Badge>
        );
      })}
    </div>
  );
}

export function StepReview({ data }: StepReviewProps) {
  const integrations = [
    data.plusvibe_api_key && "PlusVibe",
    data.calendly_api_key && "Calendly",
    data.close_api_key && "Close CRM",
    data.telegram_token && "Telegram",
  ].filter(Boolean);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Review & Deploy</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Review your company profile. Julian will use this to personalize all outreach and analysis.
        </p>
      </div>

      <div className="space-y-4">
        {/* Step 0: Company & Product */}
        <Section title="Company & Product">
          <Field label="Name" value={data.company_name} />
          <Field label="Domain" value={data.domain} />
          <Field label="Website" value={data.website} />
          <Field label="Industry" value={data.industry} />
          <Field label="Core Product" value={data.core_product} />
          <Field label="Problem Solved" value={data.problem_solved} />
          <Field label="Deal Size" value={data.deal_size} />
          <Field label="Sales Cycle" value={data.sales_cycle} />
          <Field label="Avg. CLV" value={data.avg_clv} />
          <Field label="Approx. CAC" value={data.avg_cac} />
        </Section>

        {/* Step 1: ICP & Market */}
        <Section title="ICP & Market">
          <Field label="Target Titles" value={data.icp_titles} />
          <Field label="Company Size" value={data.icp_company_size} />
          <Field label="Verticals" value={data.icp_verticals} />
          <Field label="Geography" value={data.icp_geo} />
          <Field label="Pain Points" value={data.pain_points} />
          <Field label="USP" value={data.usp} />
          <Field label="Objections" value={data.objections} />

          {(data.competitors || []).length > 0 && (
            <div className="py-1">
              <span className="text-sm text-muted-foreground">Competitors</span>
              <div className="mt-1">
                <CompetitorList competitors={data.competitors} />
              </div>
            </div>
          )}

          <Field label="Competitor Notes" value={data.competitor_notes} />
        </Section>

        {/* Customer Fit */}
        {((data.best_fit_customers || []).length > 0 || (data.poor_fit_customers || []).length > 0) && (
          <Section title="Customer Fit Profiles">
            {(data.best_fit_customers || []).length > 0 && (
              <div className="mb-3">
                <p className="text-xs font-medium text-emerald-400 mb-1">Best-Fit Customers</p>
                <CustomerFitList entries={data.best_fit_customers} type="best" />
              </div>
            )}
            {(data.poor_fit_customers || []).length > 0 && (
              <div>
                <p className="text-xs font-medium text-red-400 mb-1">Poor-Fit Customers</p>
                <CustomerFitList entries={data.poor_fit_customers} type="poor" />
              </div>
            )}
          </Section>
        )}

        {/* Step 2: Integrations */}
        <Section title="Integrations">
          {integrations.length > 0 ? (
            <div className="flex gap-2">
              {integrations.map((name) => (
                <span key={name} className="inline-flex items-center gap-1 text-sm text-emerald-400">
                  <Check className="h-3 w-3" /> {name}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No integrations configured — you can add them later in Settings.</p>
          )}
        </Section>

        {/* Step 3: Uploads & Brand */}
        <Section title="Documents & Brand">
          {(data._uploaded_file_count || 0) > 0 ? (
            <div className="flex items-center gap-2 text-sm text-emerald-400">
              <FileText className="h-4 w-4" />
              {data._uploaded_file_count} document{data._uploaded_file_count > 1 ? "s" : ""} ready for analysis
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No documents uploaded — you can add them later from the Knowledge page.</p>
          )}
          <Field label="Brand Voice Notes" value={data.brand_guidelines_notes} />
        </Section>
      </div>

      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
        <p className="text-sm text-emerald-400 font-medium">
          Ready to deploy Julian for {data.company_name || "your company"}?
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          This will create an AI agent workspace loaded with your company profile. You can always update these settings later.
        </p>
      </div>
    </div>
  );
}
