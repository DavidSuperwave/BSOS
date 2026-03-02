"use client";

import { useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Target,
  Plus,
  X,
  Users,
  Swords,
  ThumbsUp,
  ThumbsDown,
  Trash2,
} from "lucide-react";

interface CompetitorEntry {
  name: string;
  url?: string;
}

interface CustomerFitEntry {
  company_name: string;
  size?: string;
  industry?: string;
  reason: string;
}

interface StepICPMarketProps {
  data: Record<string, any>;
  onChange: (updates: Record<string, any>) => void;
}

/* ── Tag input helper ── */
function TagInput({
  tags,
  onUpdate,
  placeholder,
}: {
  tags: string[];
  onUpdate: (tags: string[]) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");

  const add = () => {
    const val = draft.trim();
    if (val && !tags.includes(val)) {
      onUpdate([...tags, val]);
    }
    setDraft("");
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className="flex-1"
        />
        <Button type="button" variant="outline" size="sm" onClick={add} disabled={!draft.trim()}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="gap-1 pr-1">
              {tag}
              <button
                type="button"
                onClick={() => onUpdate(tags.filter((t) => t !== tag))}
                className="hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Competitor row ── */
function CompetitorRow({
  entry,
  onUpdate,
  onRemove,
}: {
  entry: CompetitorEntry;
  onUpdate: (e: CompetitorEntry) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex gap-2 items-center">
      <Input
        value={entry.name}
        onChange={(e) => onUpdate({ ...entry, name: e.target.value })}
        placeholder="Competitor name"
        className="flex-1"
      />
      <Input
        value={entry.url || ""}
        onChange={(e) => onUpdate({ ...entry, url: e.target.value })}
        placeholder="https://..."
        className="flex-1"
      />
      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onRemove}>
        <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
      </Button>
    </div>
  );
}

/* ── Customer fit card ── */
function CustomerFitCard({
  entry,
  onUpdate,
  onRemove,
  label,
}: {
  entry: CustomerFitEntry;
  onUpdate: (e: CustomerFitEntry) => void;
  onRemove: () => void;
  label: string;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-card p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={onRemove}>
          <X className="h-3 w-3" />
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Input
          value={entry.company_name}
          onChange={(e) => onUpdate({ ...entry, company_name: e.target.value })}
          placeholder="Company name"
          className="text-sm"
        />
        <Input
          value={entry.size || ""}
          onChange={(e) => onUpdate({ ...entry, size: e.target.value })}
          placeholder="Size / stage"
          className="text-sm"
        />
        <Input
          value={entry.industry || ""}
          onChange={(e) => onUpdate({ ...entry, industry: e.target.value })}
          placeholder="Industry"
          className="text-sm"
        />
      </div>
      <textarea
        value={entry.reason}
        onChange={(e) => onUpdate({ ...entry, reason: e.target.value })}
        placeholder="Why are they a great (or poor) fit?"
        rows={2}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
      />
    </div>
  );
}

/* ── Main component ── */
export function StepICPMarket({ data, onChange }: StepICPMarketProps) {
  const competitors: CompetitorEntry[] = data.competitors || [];
  const bestFit: CustomerFitEntry[] = data.best_fit_customers || [];
  const poorFit: CustomerFitEntry[] = data.poor_fit_customers || [];

  const addCompetitor = () => {
    onChange({ competitors: [...competitors, { name: "", url: "" }] });
  };

  const updateCompetitor = (i: number, entry: CompetitorEntry) => {
    const updated = [...competitors];
    updated[i] = entry;
    onChange({ competitors: updated });
  };

  const removeCompetitor = (i: number) => {
    onChange({ competitors: competitors.filter((_, idx) => idx !== i) });
  };

  const addBestFit = () => {
    onChange({
      best_fit_customers: [
        ...bestFit,
        { company_name: "", size: "", industry: "", reason: "" },
      ],
    });
  };

  const addPoorFit = () => {
    onChange({
      poor_fit_customers: [
        ...poorFit,
        { company_name: "", size: "", industry: "", reason: "" },
      ],
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">ICP & Market</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Define your ideal customer profile and competitive landscape. Julian uses this to score leads and personalize outreach.
        </p>
      </div>

      {/* ICP Core */}
      <div className="rounded-xl border border-border p-4 space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Target className="h-4 w-4 text-primary" />
          Ideal Customer Profile
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground">
            Target Job Titles <span className="text-red-400">*</span>
          </label>
          <div className="mt-1">
            <TagInput
              tags={data.icp_titles || []}
              onUpdate={(tags) => onChange({ icp_titles: tags })}
              placeholder="e.g. VP of Sales, CRO, Head of Growth"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground">
            Company Size <span className="text-red-400">*</span>
          </label>
          <select
            value={data.icp_company_size || ""}
            onChange={(e) => onChange({ icp_company_size: e.target.value })}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Select size range...</option>
            <option value="1-10">1-10 employees</option>
            <option value="11-50">11-50 employees</option>
            <option value="51-200">51-200 employees</option>
            <option value="201-1000">201-1,000 employees</option>
            <option value="1001+">1,001+ employees</option>
          </select>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground">
            Target Verticals <span className="text-red-400">*</span>
          </label>
          <div className="mt-1">
            <TagInput
              tags={data.icp_verticals || []}
              onUpdate={(tags) => onChange({ icp_verticals: tags })}
              placeholder="e.g. B2B SaaS, FinTech, HealthTech"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground">Target Geography</label>
          <div className="mt-1">
            <TagInput
              tags={data.icp_geo || []}
              onUpdate={(tags) => onChange({ icp_geo: tags })}
              placeholder="e.g. US, UK, DACH"
            />
          </div>
        </div>
      </div>

      {/* Pain Points & Positioning */}
      <div className="rounded-xl border border-border p-4 space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Users className="h-4 w-4 text-primary" />
          Pain Points & Positioning
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground">
            Customer Pain Points <span className="text-red-400">*</span>
          </label>
          <div className="mt-1">
            <TagInput
              tags={data.pain_points || []}
              onUpdate={(tags) => onChange({ pain_points: tags })}
              placeholder="e.g. Low reply rates, Manual prospecting"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground">
            Unique Selling Proposition (USP) <span className="text-red-400">*</span>
          </label>
          <textarea
            value={data.usp || ""}
            onChange={(e) => onChange({ usp: e.target.value })}
            placeholder="What makes you different from competitors? Why should prospects choose you?"
            rows={2}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground">Common Objections</label>
          <div className="mt-1">
            <TagInput
              tags={data.objections || []}
              onUpdate={(tags) => onChange({ objections: tags })}
              placeholder='e.g. "Too expensive", "We already have a solution"'
            />
          </div>
        </div>
      </div>

      {/* Competitors */}
      <div className="rounded-xl border border-border p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Swords className="h-4 w-4 text-primary" />
            Competitors
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addCompetitor}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add
          </Button>
        </div>

        {competitors.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No competitors added yet. Click "Add" to list your main competitors.
          </p>
        )}

        {competitors.map((comp, i) => (
          <CompetitorRow
            key={i}
            entry={comp}
            onUpdate={(e) => updateCompetitor(i, e)}
            onRemove={() => removeCompetitor(i)}
          />
        ))}

        <div>
          <label className="text-xs font-medium text-muted-foreground">
            Competitor Notes
          </label>
          <textarea
            value={data.competitor_notes || ""}
            onChange={(e) => onChange({ competitor_notes: e.target.value })}
            placeholder="Strategies you admire, weaknesses to exploit, positioning to avoid..."
            rows={2}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
          />
        </div>
      </div>

      {/* Customer Fit Profiles */}
      <div className="rounded-xl border border-border p-4 space-y-4">
        {/* Best Fit */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <ThumbsUp className="h-4 w-4 text-emerald-400" />
              Best-Fit Customers
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addBestFit}
              disabled={bestFit.length >= 3}
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Add
            </Button>
          </div>
          <p className="text-xs text-muted-foreground -mt-1">
            Describe 2-3 of your best current customers. Julian uses these as a benchmark for lead scoring.
          </p>

          {bestFit.length === 0 && (
            <p className="text-xs text-muted-foreground/60 italic">
              No best-fit customers added yet.
            </p>
          )}

          {bestFit.map((entry, i) => (
            <CustomerFitCard
              key={`best-${i}`}
              entry={entry}
              label={`Best-Fit #${i + 1}`}
              onUpdate={(e) => {
                const updated = [...bestFit];
                updated[i] = e;
                onChange({ best_fit_customers: updated });
              }}
              onRemove={() => {
                onChange({ best_fit_customers: bestFit.filter((_, idx) => idx !== i) });
              }}
            />
          ))}
        </div>

        <div className="border-t border-border/50 my-2" />

        {/* Poor Fit */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <ThumbsDown className="h-4 w-4 text-red-400" />
              Poor-Fit Customers
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addPoorFit}
              disabled={poorFit.length >= 2}
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Add
            </Button>
          </div>
          <p className="text-xs text-muted-foreground -mt-1">
            Describe 1-2 customers that were a poor fit. Helps Julian avoid similar leads.
          </p>

          {poorFit.length === 0 && (
            <p className="text-xs text-muted-foreground/60 italic">
              No poor-fit customers added yet.
            </p>
          )}

          {poorFit.map((entry, i) => (
            <CustomerFitCard
              key={`poor-${i}`}
              entry={entry}
              label={`Poor-Fit #${i + 1}`}
              onUpdate={(e) => {
                const updated = [...poorFit];
                updated[i] = e;
                onChange({ poor_fit_customers: updated });
              }}
              onRemove={() => {
                onChange({ poor_fit_customers: poorFit.filter((_, idx) => idx !== i) });
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
