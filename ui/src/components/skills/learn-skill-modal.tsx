"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Search, Link2, FileText, Zap, MessageSquare, CircleDot } from "lucide-react";
import { learnCompanySkill, upsertCompanySkill } from "@/lib/hooks";

type LearnSourceTab = "research" | "url" | "paste_docs";
type LearnMode = "quick" | "interactive";

interface LearnSkillModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId?: string;
  onSaved?: () => Promise<void> | void;
}

interface ProgressLine {
  ts: string;
  text: string;
  level?: "info" | "warn" | "error";
}

export function LearnSkillModal({
  open,
  onOpenChange,
  companyId,
  onSaved,
}: LearnSkillModalProps) {
  const [sourceType, setSourceType] = useState<LearnSourceTab>("research");
  const [mode, setMode] = useState<LearnMode>("quick");
  const [topic, setTopic] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [docs, setDocs] = useState("");
  const [running, setRunning] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [progress, setProgress] = useState<ProgressLine[]>([]);
  const [draftSkillMd, setDraftSkillMd] = useState("");
  const [draftSlug, setDraftSlug] = useState("");
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftAuthType, setDraftAuthType] = useState("No Authentication");
  const [learnError, setLearnError] = useState<string | null>(null);

  const canRun = useMemo(() => {
    if (!companyId) return false;
    if (sourceType === "research") return topic.trim().length > 2;
    if (sourceType === "url") return sourceUrl.trim().length > 8;
    return docs.trim().length > 20;
  }, [companyId, docs, sourceType, sourceUrl, topic]);

  const addProgress = (text: string, level: ProgressLine["level"] = "info") => {
    setProgress((prev) => [
      ...prev,
      {
        ts: new Date().toISOString(),
        text,
        level,
      },
    ]);
  };

  const resetDraft = () => {
    setDraftSkillMd("");
    setDraftSlug("");
    setDraftName("");
    setDraftDescription("");
    setDraftAuthType("No Authentication");
  };

  const runLearn = async () => {
    if (!companyId || !canRun) return;
    setRunning(true);
    setLearnError(null);
    resetDraft();
    setProgress([]);

    try {
      addProgress(`Learning started (${mode} mode)`);
      const payload = {
        sourceType,
        mode,
        query: topic || undefined,
        url: sourceType === "url" || sourceType === "research" ? sourceUrl || undefined : undefined,
        content: sourceType === "paste_docs" ? docs : undefined,
        save: mode === "quick",
      } as const;

      const res = await learnCompanySkill(companyId, payload);

      if (res.validation?.warnings?.length) {
        for (const warning of res.validation.warnings) {
          addProgress(`Warning: ${warning}`, "warn");
        }
      }

      if (mode === "quick") {
        if (res.skill?.slug) {
          addProgress(`Skill saved: ${res.skill.slug}`);
          await onSaved?.();
        } else {
          throw new Error("Learn API did not return a saved skill");
        }
      } else {
        const draft = res.draft;
        if (!draft?.skillMd) {
          throw new Error("Interactive mode did not return a draft");
        }
        addProgress("Draft generated - review and save", "info");
        setDraftSkillMd(draft.skillMd);
        setDraftSlug(draft.slug || "");
        setDraftName(draft.name || "");
        setDraftDescription(draft.description || "");
        setDraftAuthType("No Authentication");
      }
    } catch (err: any) {
      const msg = err?.message || "Failed to learn skill";
      setLearnError(msg);
      addProgress(msg, "error");
    } finally {
      setRunning(false);
    }
  };

  const saveInteractiveDraft = async () => {
    if (!companyId || !draftSkillMd.trim()) return;
    setSavingDraft(true);
    setLearnError(null);
    try {
      await upsertCompanySkill(companyId, {
        slug: draftSlug || undefined,
        name: draftName || undefined,
        description: draftDescription || undefined,
        skillMd: draftSkillMd,
      });
      addProgress(`Skill saved: ${draftSlug || draftName || "new skill"}`);
      await onSaved?.();
      onOpenChange(false);
    } catch (err: any) {
      const msg = err?.message || "Failed to save draft";
      setLearnError(msg);
      addProgress(msg, "error");
    } finally {
      setSavingDraft(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden">
        <div className="p-6 space-y-5">
        <DialogHeader>
          <DialogTitle>Learn New Skill</DialogTitle>
          <DialogDescription>
            Describe what you want to learn, or provide documentation directly.
          </DialogDescription>
        </DialogHeader>

        {!draftSkillMd ? (
          <>
            <Tabs value={sourceType} onValueChange={(value) => setSourceType(value as LearnSourceTab)}>
              <TabsList className="w-full grid grid-cols-3 rounded-full bg-muted/60 p-1 h-auto">
                <TabsTrigger value="research" className="rounded-full py-2 text-xs">
                  <Search className="h-3.5 w-3.5 mr-1.5" />
                  Research
                </TabsTrigger>
                <TabsTrigger value="url" className="rounded-full py-2 text-xs">
                  <Link2 className="h-3.5 w-3.5 mr-1.5" />
                  From URL
                </TabsTrigger>
                <TabsTrigger value="paste_docs" className="rounded-full py-2 text-xs">
                  <FileText className="h-3.5 w-3.5 mr-1.5" />
                  Paste Docs
                </TabsTrigger>
              </TabsList>

              <TabsContent value="research" className="space-y-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium">What do you want to learn?</label>
                  <Input
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="e.g., Stripe API, how to write press releases, GitHub API..."
                  />
                </div>
                <Input
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  placeholder="Optional source URL for grounding"
                />
              </TabsContent>

              <TabsContent value="url" className="space-y-3">
                <Input
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  placeholder="https://..."
                />
                <Input
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="Optional skill topic/title"
                />
              </TabsContent>

              <TabsContent value="paste_docs" className="space-y-3">
                <Input
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="Skill topic/title"
                />
                <textarea
                  className="w-full min-h-[180px] rounded-md border border-border bg-background p-3 text-sm"
                  value={docs}
                  onChange={(e) => setDocs(e.target.value)}
                  placeholder="Paste API documentation or implementation guide..."
                />
              </TabsContent>
            </Tabs>

            <div className="space-y-2">
              <p className="text-sm font-medium">Mode</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setMode("quick")}
                  className={`rounded-lg border p-3 text-left transition ${
                    mode === "quick"
                      ? "border-foreground bg-muted/40"
                      : "border-border hover:border-foreground/30"
                  }`}
                >
                  <p className="text-sm font-medium flex items-center gap-2">
                    <Zap className="h-4 w-4" />
                    Quick Learn
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Research immediately. Best for simple, well-defined skills.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setMode("interactive")}
                  className={`rounded-lg border p-3 text-left transition ${
                    mode === "interactive"
                      ? "border-foreground bg-muted/40"
                      : "border-border hover:border-foreground/30"
                  }`}
                >
                  <p className="text-sm font-medium flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Interactive
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Discuss requirements first. Best for complex skills.
                  </p>
                </button>
              </div>
            </div>

            <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Research Progress</p>
              <div className="max-h-36 overflow-auto space-y-1">
                {progress.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No progress yet.</p>
                ) : (
                  progress.map((line, idx) => (
                    <p
                      key={`${line.ts}-${idx}`}
                      className={`text-xs ${
                        line.level === "error"
                          ? "text-red-500"
                          : line.level === "warn"
                          ? "text-amber-500"
                          : "text-muted-foreground"
                      }`}
                    >
                      {line.text}
                    </p>
                  ))
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-border p-4 space-y-3">
              <Input value={draftName} onChange={(e) => setDraftName(e.target.value)} placeholder="Skill name" />
              <Input value={draftDescription} onChange={(e) => setDraftDescription(e.target.value)} placeholder="Description" />
              <div>
                <p className="text-sm font-medium mb-2">API Documentation (Markdown)</p>
                <textarea
                  className="w-full min-h-[220px] rounded-md border border-border bg-muted/20 p-3 text-xs font-mono"
                  value={draftSkillMd}
                  onChange={(e) => setDraftSkillMd(e.target.value)}
                />
              </div>
            </div>

            <div className="rounded-xl border border-border p-4 space-y-2">
              <p className="text-sm font-medium">Authentication Type</p>
              <select
                value={draftAuthType}
                onChange={(e) => setDraftAuthType(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option>No Authentication</option>
                <option>API Key</option>
                <option>OAuth</option>
              </select>
            </div>
          </div>
        )}

        {learnError ? <p className="text-sm text-red-500">{learnError}</p> : null}

        <DialogFooter className="gap-2">
          {draftSkillMd ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={resetDraft}
                disabled={running || savingDraft}
              >
                Start Over
              </Button>
              <Button
                type="button"
                onClick={saveInteractiveDraft}
                disabled={running || savingDraft}
              >
                {savingDraft ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Save Skill
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={running || savingDraft}
              >
                {running ? "Cancel Research" : "Cancel"}
              </Button>
              <Button type="button" onClick={runLearn} disabled={!canRun || running || savingDraft}>
                {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CircleDot className="h-4 w-4 mr-2" />}
                {running ? "Researching..." : mode === "quick" ? "Quick Learn" : "Generate Draft"}
              </Button>
            </>
          )}
        </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
