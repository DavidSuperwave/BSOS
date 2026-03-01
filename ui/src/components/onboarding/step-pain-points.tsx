"use client";

import { Input } from "@/components/ui/input";
import { X } from "lucide-react";

interface StepPainPointsProps {
  data: Record<string, any>;
  onChange: (updates: Record<string, any>) => void;
}

function ListInput({
  label,
  description,
  values,
  onChange,
  placeholder,
}: {
  label: string;
  description?: string;
  values: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
}) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
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
      {description && (
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      )}
      <div className="space-y-2 mt-2">
        {values.map((v, i) => (
          <div
            key={i}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 border border-border"
          >
            <span className="flex-1 text-sm text-foreground">{v}</span>
            <button onClick={() => onChange(values.filter((_, j) => j !== i))}>
              <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
            </button>
          </div>
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

export function StepPainPoints({ data, onChange }: StepPainPointsProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Pain Points & Competitors</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Help Julian understand the sales context to handle objections and position against competitors.
        </p>
      </div>

      <div className="space-y-6">
        <ListInput
          label="Pain Points *"
          description="What problems do your prospects face?"
          values={data.pain_points || []}
          onChange={(v) => onChange({ pain_points: v })}
          placeholder="Low reply rates on cold outreach..."
        />

        <ListInput
          label="Common Objections"
          description="What do prospects say when they push back?"
          values={data.objections || []}
          onChange={(v) => onChange({ objections: v })}
          placeholder="Already using competitor X..."
        />

        <ListInput
          label="Competitors"
          values={data.competitors || []}
          onChange={(v) => onChange({ competitors: v })}
          placeholder="Outreach, Apollo, Salesloft..."
        />
      </div>
    </div>
  );
}
