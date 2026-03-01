"use client";

import { Input } from "@/components/ui/input";

interface StepBasicsProps {
  data: Record<string, any>;
  onChange: (updates: Record<string, any>) => void;
}

const INDUSTRIES = [
  "SaaS", "FinTech", "HealthTech", "EdTech", "E-Commerce",
  "Cybersecurity", "MarTech", "HRTech", "LegalTech", "PropTech",
  "CleanTech", "AgTech", "InsurTech", "DevTools", "AI/ML", "Other",
];

export function StepBasics({ data, onChange }: StepBasicsProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Company Basics</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Tell us about your company so Julian can represent you accurately.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-foreground">Company Name *</label>
          <Input
            value={data.company_name || ""}
            onChange={(e) => {
              const name = e.target.value;
              onChange({
                company_name: name,
                slug: name.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-"),
              });
            }}
            placeholder="Acme Corp"
            className="mt-1"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-foreground">URL Slug</label>
          <Input
            value={data.slug || ""}
            onChange={(e) => onChange({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })}
            placeholder="acme-corp"
            className="mt-1"
          />
          <p className="text-xs text-muted-foreground mt-1">Used in URLs and namespaces</p>
        </div>

        <div>
          <label className="text-sm font-medium text-foreground">Domain</label>
          <Input
            value={data.domain || ""}
            onChange={(e) => onChange({ domain: e.target.value })}
            placeholder="acme.com"
            className="mt-1"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-foreground">Industry *</label>
          <div className="grid grid-cols-4 gap-2 mt-2">
            {INDUSTRIES.map((ind) => (
              <button
                key={ind}
                type="button"
                onClick={() => onChange({ industry: ind })}
                className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
                  data.industry === ind
                    ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                {ind}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
