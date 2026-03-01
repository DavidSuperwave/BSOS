"use client";

import { Badge } from "@/components/ui/badge";
import { Check, FileText } from "lucide-react";

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

export function StepReview({ data }: StepReviewProps) {
  const integrations = [
    data.plusvibe_api_key && "PlusVibe",
    data.calendly_api_key && "Calendly",
    data.close_api_key && "Close CRM",
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
        <Section title="Company">
          <Field label="Name" value={data.company_name} />
          <Field label="Domain" value={data.domain} />
          <Field label="Industry" value={data.industry} />
        </Section>

        <Section title="Product">
          <Field label="Description" value={data.product_description} />
          <Field label="Value Prop" value={data.value_proposition} />
        </Section>

        <Section title="ICP">
          <Field label="Titles" value={data.icp_titles} />
          <Field label="Company Size" value={data.icp_company_size} />
          <Field label="Verticals" value={data.icp_verticals} />
          <Field label="Geography" value={data.icp_geo} />
        </Section>

        <Section title="Sales Context">
          <Field label="Pain Points" value={data.pain_points} />
          <Field label="Objections" value={data.objections} />
          <Field label="Competitors" value={data.competitors} />
        </Section>

        <Section title="Messaging">
          <Field label="Tone" value={data.tone} />
          <Field label="Campaign Goals" value={data.campaign_goals} />
          <Field label="Differentiators" value={data.differentiators} />
        </Section>

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

        <Section title="Uploaded Documents">
          {(data._uploaded_file_count || 0) > 0 ? (
            <div className="flex items-center gap-2 text-sm text-emerald-400">
              <FileText className="h-4 w-4" />
              {data._uploaded_file_count} document{data._uploaded_file_count > 1 ? "s" : ""} ready for analysis
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No documents uploaded — you can add them later from the Knowledge page.</p>
          )}
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
