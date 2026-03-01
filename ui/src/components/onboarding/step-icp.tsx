"use client";

import { Input } from "@/components/ui/input";
import { X } from "lucide-react";

interface StepICPProps {
  data: Record<string, any>;
  onChange: (updates: Record<string, any>) => void;
}

const COMPANY_SIZES = ["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"];
const GEOS = ["US", "Canada", "UK", "Europe", "APAC", "LATAM", "Global"];

function TagInput({
  label,
  values,
  onChange,
  placeholder,
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
}) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const val = (e.target as HTMLInputElement).value.trim();
      if (val && !values.includes(val)) {
        onChange([...values, val]);
        (e.target as HTMLInputElement).value = "";
      }
    }
  };

  return (
    <div>
      <label className="text-sm font-medium text-foreground">{label}</label>
      <div className="flex flex-wrap gap-2 mt-2">
        {values.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
          >
            {v}
            <button onClick={() => onChange(values.filter((x) => x !== v))}>
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <Input
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="mt-2"
      />
      <p className="text-xs text-muted-foreground mt-1">Press Enter to add</p>
    </div>
  );
}

export function StepICP({ data, onChange }: StepICPProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Ideal Customer Profile</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Define who Julian should target in campaigns.
        </p>
      </div>

      <div className="space-y-4">
        <TagInput
          label="Target Titles *"
          values={data.icp_titles || []}
          onChange={(v) => onChange({ icp_titles: v })}
          placeholder="VP Sales, CRO, Head of Growth..."
        />

        <div>
          <label className="text-sm font-medium text-foreground">Company Size *</label>
          <div className="flex flex-wrap gap-2 mt-2">
            {COMPANY_SIZES.map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => onChange({ icp_company_size: size })}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                  data.icp_company_size === size
                    ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                {size}
              </button>
            ))}
          </div>
        </div>

        <TagInput
          label="Verticals *"
          values={data.icp_verticals || []}
          onChange={(v) => onChange({ icp_verticals: v })}
          placeholder="SaaS, FinTech, E-Commerce..."
        />

        <div>
          <label className="text-sm font-medium text-foreground">Geography</label>
          <div className="flex flex-wrap gap-2 mt-2">
            {GEOS.map((geo) => {
              const selected = (data.icp_geo || []).includes(geo);
              return (
                <button
                  key={geo}
                  type="button"
                  onClick={() => {
                    const current = data.icp_geo || [];
                    onChange({
                      icp_geo: selected
                        ? current.filter((g: string) => g !== geo)
                        : [...current, geo],
                    });
                  }}
                  className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                    selected
                      ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {geo}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
