"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Save, Trash2, Search, Loader2, X } from "lucide-react";
import type { KnowledgeDoc } from "@/lib/hooks";
import { DocumentEditor } from "@/components/documents/editor";

interface DocumentPanelProps {
  companyId?: string;
  document: KnowledgeDoc | null;
  onSave: (id: string, data: { title: string; content: string; category: string }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onResearch: (query: string) => Promise<string>;
}

function parseInitialEditorContent(content: string) {
  if (!content?.trim()) return null;
  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === "object" && parsed.type) return parsed;
  } catch {
    // Keep legacy text content as plain paragraph.
  }
  return content;
}

export function DocumentPanel({
  companyId,
  document,
  onSave,
  onDelete,
  onResearch,
}: DocumentPanelProps) {
  const [title, setTitle] = useState(document?.title || "");
  const [content, setContent] = useState(document?.content || "");
  const [category, setCategory] = useState(document?.category || "research");
  const [editorContent, setEditorContent] = useState<any>(null);
  const [embeddedReportIds, setEmbeddedReportIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [researchQuery, setResearchQuery] = useState("");
  const [researchResult, setResearchResult] = useState("");
  const [researching, setResearching] = useState(false);

  useEffect(() => {
    if (!document) return;
    setTitle(document.title);
    setContent(document.content || "");
    setCategory(document.category || "research");
    setEditorContent(parseInitialEditorContent(document.content || ""));
    setEmbeddedReportIds([]);
  }, [document?.id, document?.title, document?.content, document?.category]);

  const handleSave = async () => {
    if (!document) return;
    setSaving(true);
    const serializedContent =
      editorContent && typeof editorContent === "object"
        ? JSON.stringify(editorContent)
        : content;
    await onSave(document.id, { title, content: serializedContent, category });
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!document) return;
    setDeleting(true);
    await onDelete(document.id);
    setDeleting(false);
  };

  const handleResearch = async () => {
    if (!researchQuery.trim()) return;
    setResearching(true);
    const result = await onResearch(researchQuery);
    setResearchResult(result);
    setResearching(false);
  };

  if (!document) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <p className="text-sm">Select a document to view</p>
      </div>
    );
  }

  const canUseStructuredEditor = Boolean(companyId);

  return (
    <div className="flex h-full flex-col space-y-4">
      {/* Document Editor */}
      <div className="space-y-3 flex-1">
        <div className="flex items-center gap-2">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="font-semibold"
            placeholder="Document title"
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-2 text-sm text-foreground"
          >
            <option value="icp">ICP</option>
            <option value="research">Research</option>
            <option value="campaign">Campaign</option>
            <option value="company">Company</option>
          </select>
        </div>

        {canUseStructuredEditor && companyId ? (
          <DocumentEditor
            companyId={companyId}
            initialContent={editorContent ?? parseInitialEditorContent(content)}
            initialEmbeddedReports={embeddedReportIds}
            onChange={({ content: nextContent, embeddedReportIds: nextEmbeddedIds }) => {
              setEditorContent(nextContent);
              setEmbeddedReportIds(nextEmbeddedIds);
              setContent(typeof nextContent === "string" ? nextContent : JSON.stringify(nextContent));
            }}
          />
        ) : (
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full flex-1 min-h-[200px] rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-emerald-500 focus:outline-none resize-none"
            placeholder="Document content..."
          />
        )}

        <div className="flex items-center gap-2">
          <Button onClick={handleSave} disabled={saving} size="sm" className="gap-1">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save
          </Button>
          <Button
            onClick={handleDelete}
            disabled={deleting}
            size="sm"
            variant="outline"
            className="gap-1 text-red-400 hover:text-red-300"
          >
            {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            Delete
          </Button>
        </div>
      </div>

      {/* AI Research */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm">Ask Julian</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <div className="flex gap-2">
            <Input
              value={researchQuery}
              onChange={(e) => setResearchQuery(e.target.value)}
              placeholder="Ask about this document..."
              onKeyDown={(e) => e.key === "Enter" && handleResearch()}
            />
            <Button onClick={handleResearch} disabled={researching} size="icon">
              {researching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
            </Button>
          </div>

          {researchResult && (
            <div className="rounded-lg border border-border bg-muted/50 p-3">
              <div className="flex items-start justify-between">
                <p className="text-sm text-foreground whitespace-pre-wrap">
                  {researchResult}
                </p>
                <button
                  onClick={() => setResearchResult("")}
                  className="text-muted-foreground hover:text-foreground ml-2 shrink-0"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
