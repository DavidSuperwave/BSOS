"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, GripVertical, Send } from "lucide-react";

interface SequenceStep {
  id: string;
  subject: string;
  body: string;
  waitDays: number;
}

interface SequenceEditorProps {
  campaignId: string;
  onPublish: (steps: SequenceStep[]) => void;
  onCancel: () => void;
}

export function SequenceEditor({ campaignId, onPublish, onCancel }: SequenceEditorProps) {
  const [steps, setSteps] = useState<SequenceStep[]>([
    { id: "1", subject: "", body: "", waitDays: 0 },
  ]);

  const handlePublish = () => {
    onPublish(steps);
  };

  const addStep = () => {
    setSteps((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        subject: "",
        body: "",
        waitDays: 3,
      },
    ]);
  };

  const removeStep = (id: string) => {
    if (steps.length <= 1) return;
    setSteps((prev) => prev.filter((s) => s.id !== id));
  };

  const updateStep = (id: string, field: keyof SequenceStep, value: any) => {
    setSteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, [field]: value } : s))
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground">
          Email Sequence
        </h3>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={handlePublish} className="gap-2">
            <Send className="h-4 w-4" />
            Publish to PlusVibe
          </Button>
        </div>
      </div>

      {steps.map((step, index) => (
        <Card key={step.id}>
          <CardHeader className="py-3 px-4">
            <div className="flex items-center gap-3">
              <GripVertical className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm">
                Step {index + 1}
                {index > 0 && (
                  <span className="ml-2 text-muted-foreground font-normal">
                    wait{" "}
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={step.waitDays}
                      onChange={(e) =>
                        updateStep(step.id, "waitDays", parseInt(e.target.value) || 1)
                      }
                      className="w-12 inline-block rounded border border-border bg-background px-2 py-0.5 text-sm text-center"
                    />{" "}
                    days
                  </span>
                )}
              </CardTitle>
              {steps.length > 1 && (
                <button
                  onClick={() => removeStep(step.id)}
                  className="ml-auto text-muted-foreground hover:text-red-400 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3 px-4 pb-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Subject Line
              </label>
              <Input
                value={step.subject}
                onChange={(e) => updateStep(step.id, "subject", e.target.value)}
                placeholder="Email subject..."
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Email Body
              </label>
              <textarea
                value={step.body}
                onChange={(e) => updateStep(step.id, "body", e.target.value)}
                placeholder="Write your email..."
                rows={4}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none resize-none"
              />
            </div>
          </CardContent>
        </Card>
      ))}

      <Button variant="outline" onClick={addStep} className="w-full gap-2">
        <Plus className="h-4 w-4" />
        Add Step
      </Button>
    </div>
  );
}
