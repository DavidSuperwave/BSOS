"use client";

import { Input } from "@/components/ui/input";
import { X } from "lucide-react";

interface StepMessagingProps {
  data: Record<string, any>;
  onChange: (updates: Record<string, any>) => void;
}

const TONES = [
  { value: "professional", label: "Professional" },
  { value: "professional-casual", label: "Professional Casual" },
  { value: "casual", label: "Casual" },
  { value: "bold", label: "Bold / Assertive" },
  { value: "empathetic", label: "Empathetic" },
  { value: "data-driven", label: "Data-Driven" },
];

export function StepMessaging({ data, onChange }: StepMessagingProps) {
  const handleAddDiff = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const val = (e.target as HTMLInputElement).value.trim();
      const current = data.differentiators || [];
      if (val && !current.includes(val)) {
        onChange({ differentiators: [...current, val] });
        (e.target as HTMLInputElement).value = "";
      }
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Messaging & Goals</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Define Julian&apos;s communication style and campaign objectives.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-foreground">Tone *</label>
          <div className="grid grid-cols-3 gap-2 mt-2">
            {TONES.map((tone) => (
              <button
                key={tone.value}
                type="button"
                onClick={() => onChange({ tone: tone.value })}
                className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
                  data.tone === tone.value
                    ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                {tone.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-foreground">Campaign Goals *</label>
          <Input
            value={data.campaign_goals || ""}
            onChange={(e) => onChange({ campaign_goals: e.target.value })}
            placeholder="Book 20 meetings per month"
            className="mt-1"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-foreground">Key Differentiators</label>
          <div className="flex flex-wrap gap-2 mt-2">
            {(data.differentiators || []).map((d: string) => (
              <span
                key={d}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
              >
                {d}
                <button onClick={() => onChange({ differentiators: (data.differentiators || []).filter((x: string) => x !== d) })}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
          <Input
            onKeyDown={handleAddDiff}
            placeholder="AI-driven optimization, Multi-channel..."
            className="mt-2"
          />
          <p className="text-xs text-muted-foreground mt-1">Press Enter to add</p>
        </div>
      </div>
    </div>
  );
}
