"use client";

interface StepProductProps {
  data: Record<string, any>;
  onChange: (updates: Record<string, any>) => void;
}

export function StepProduct({ data, onChange }: StepProductProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Product Information</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Describe what you sell so Julian can craft accurate messaging.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-foreground">Product Description *</label>
          <textarea
            value={data.product_description || ""}
            onChange={(e) => onChange({ product_description: e.target.value })}
            placeholder="We build AI-powered analytics that help SaaS companies understand their customer journey and reduce churn by 30%."
            rows={4}
            className="mt-1 w-full rounded-lg border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-emerald-500 focus:outline-none resize-none"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-foreground">Value Proposition *</label>
          <textarea
            value={data.value_proposition || ""}
            onChange={(e) => onChange({ value_proposition: e.target.value })}
            placeholder="We help companies see 3x ROI within 60 days through automated customer intelligence."
            rows={3}
            className="mt-1 w-full rounded-lg border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-emerald-500 focus:outline-none resize-none"
          />
          <p className="text-xs text-muted-foreground mt-1">
            One sentence that captures why customers choose you.
          </p>
        </div>
      </div>
    </div>
  );
}
