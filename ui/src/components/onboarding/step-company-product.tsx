"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Building2, Globe, Package, DollarSign } from "lucide-react";

interface StepCompanyProductProps {
  data: Record<string, any>;
  onChange: (updates: Record<string, any>) => void;
}

const INDUSTRIES = [
  "SaaS / Software",
  "Agency / Consulting",
  "Financial Services",
  "Healthcare / Biotech",
  "E-commerce / Retail",
  "Manufacturing",
  "Real Estate",
  "Education / EdTech",
  "Media / Entertainment",
  "Logistics / Supply Chain",
  "Legal",
  "Other",
];

export function StepCompanyProduct({ data, onChange }: StepCompanyProductProps) {
  const autoSlug = (name: string) =>
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

  const handleNameChange = (name: string) => {
    const updates: Record<string, any> = { company_name: name };
    // Auto-generate slug only if user hasn't manually edited it
    if (!data._slug_edited) {
      updates.slug = autoSlug(name);
    }
    onChange(updates);
  };

  const handleSlugChange = (slug: string) => {
    onChange({ slug: slug.toLowerCase().replace(/[^a-z0-9-]/g, ""), _slug_edited: true });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Company & Product</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Tell Julian about your company and what you sell. This shapes all outreach and lead qualification.
        </p>
      </div>

      {/* Company Identity */}
      <div className="rounded-xl border border-border p-4 space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Building2 className="h-4 w-4 text-primary" />
          Company Identity
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              Company Name <span className="text-red-400">*</span>
            </label>
            <Input
              value={data.company_name || ""}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Acme Corp"
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              Slug <span className="text-red-400">*</span>
            </label>
            <Input
              value={data.slug || ""}
              onChange={(e) => handleSlugChange(e.target.value)}
              placeholder="acme-corp"
              className="mt-1"
            />
            <span className="text-[10px] text-muted-foreground">
              Used in URLs and internal references
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              Domain <span className="text-red-400">*</span>
            </label>
            <Input
              value={data.domain || ""}
              onChange={(e) => onChange({ domain: e.target.value })}
              placeholder="acme.com"
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Website</label>
            <Input
              value={data.website || ""}
              onChange={(e) => onChange({ website: e.target.value })}
              placeholder="https://acme.com"
              className="mt-1"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground">
            Industry <span className="text-red-400">*</span>
          </label>
          <select
            value={data.industry || ""}
            onChange={(e) => onChange({ industry: e.target.value })}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Select an industry...</option>
            {INDUSTRIES.map((ind) => (
              <option key={ind} value={ind}>
                {ind}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Product Details */}
      <div className="rounded-xl border border-border p-4 space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Package className="h-4 w-4 text-primary" />
          Product / Service
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground">
            Core Product or Service <span className="text-red-400">*</span>
          </label>
          <textarea
            value={data.core_product || ""}
            onChange={(e) => onChange({ core_product: e.target.value })}
            placeholder="Describe your core product or service in 2-3 sentences. What do you sell?"
            rows={3}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground">
            Problem Solved <span className="text-red-400">*</span>
          </label>
          <textarea
            value={data.problem_solved || ""}
            onChange={(e) => onChange({ problem_solved: e.target.value })}
            placeholder="What specific problem does your product/service solve for customers?"
            rows={2}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
          />
        </div>
      </div>

      {/* Unit Economics */}
      <div className="rounded-xl border border-border p-4 space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <DollarSign className="h-4 w-4 text-primary" />
          Unit Economics
        </div>
        <p className="text-xs text-muted-foreground -mt-2">
          These help Julian qualify leads and prioritize deals intelligently. All optional.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Typical Deal Size</label>
            <Input
              value={data.deal_size || ""}
              onChange={(e) => onChange({ deal_size: e.target.value })}
              placeholder="e.g. $5,000/mo, $50K ACV"
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Sales Cycle Length</label>
            <Input
              value={data.sales_cycle || ""}
              onChange={(e) => onChange({ sales_cycle: e.target.value })}
              placeholder="e.g. 2-4 weeks, 3 months"
              className="mt-1"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Average CLV</label>
            <Input
              value={data.avg_clv || ""}
              onChange={(e) => onChange({ avg_clv: e.target.value })}
              placeholder="e.g. $120,000"
              className="mt-1"
            />
            <span className="text-[10px] text-muted-foreground">
              Customer lifetime value
            </span>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Approx. CAC</label>
            <Input
              value={data.avg_cac || ""}
              onChange={(e) => onChange({ avg_cac: e.target.value })}
              placeholder="e.g. $3,500"
              className="mt-1"
            />
            <span className="text-[10px] text-muted-foreground">
              Customer acquisition cost
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
