"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SupermemoryDocument } from "@/lib/hooks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RelationshipSection } from "@/components/knowledge/relationship-section";
import {
  FileText,
  Cloud,
  Tag,
  Calendar,
  Hash,
  Loader2,
  Save,
  Trash2,
  Type,
  Heading1,
  Heading2,
  Heading3,
  Bold,
  Italic,
  Strikethrough,
  List,
  Link,
  Code,
  Eye,
  PencilLine,
  ChevronDown,
  X,
  History,
} from "lucide-react";

const PRIMARY_TAG_OPTIONS: {
  id: string;
  label: string;
  color: string;
}[] = [
  { id: "profile", label: "Profile", color: "bg-blue-100 text-blue-700 border-blue-200" },
  { id: "icp", label: "ICP", color: "bg-green-100 text-green-700 border-green-200" },
  { id: "campaign", label: "Campaigns", color: "bg-purple-100 text-purple-700 border-purple-200" },
  { id: "research", label: "Research", color: "bg-amber-100 text-amber-700 border-amber-200" },
  { id: "asset", label: "Assets", color: "bg-pink-100 text-pink-700 border-pink-200" },
  { id: "analysis", label: "Analysis", color: "bg-cyan-100 text-cyan-700 border-cyan-200" },
];

const STAGE_OPTIONS = ["draft", "review", "approved", "archived"] as const;

interface DocumentTags {
  primary: string;
  secondary: string[];
  stage?: string;
}

interface DocumentRelationships {
  derived_from?: Array<{ id: string; title: string }>;
  related_to?: Array<{ id: string; title: string }>;
  used_in?: Array<{ id: string; title: string }>;
}

interface SupermemoryDocumentPanelProps {
  document: SupermemoryDocument | null;
  containerTag?: string;
  onDelete?: (id: string) => Promise<void>;
  onUpdate?: (
    id: string,
    payload: { title: string; content: string; folder?: string; metadata?: Record<string, any> }
  ) => Promise<void>;
  folderOptions?: string[];
  tagOptions?: string[];
  secondaryTagSuggestions?: string[];
  relationships?: DocumentRelationships;
  onRelationshipClick?: (documentId: string) => void;
  deleting?: boolean;
  saving?: boolean;
  loading?: boolean;
  // Versioning props
  isSaving?: boolean;
  version?: number;
  versionHistory?: SupermemoryDocument[];
  showHistory?: boolean;
  onToggleHistory?: () => void;
  onSelectVersion?: (version: SupermemoryDocument) => void;
}

function resolveDocumentTags(document: SupermemoryDocument): DocumentTags {
  const tags = document.metadata?.tags;
  if (tags && tags.primary) {
    return {
      primary: tags.primary,
      secondary: Array.isArray(tags.secondary) ? tags.secondary : [],
      stage: tags.stage || "draft",
    };
  }
  // Fallback from folder
  const folder =
    typeof document.metadata?.folder === "string"
      ? document.metadata.folder
      : null;
  return {
    primary: folder || "research",
    secondary: [],
    stage: "draft",
  };
}

export function SupermemoryDocumentPanel({
  document,
  containerTag,
  onDelete,
  onUpdate,
  folderOptions = [],
  tagOptions = [],
  secondaryTagSuggestions = [],
  relationships,
  onRelationshipClick,
  deleting = false,
  saving = false,
  loading = false,
  // Versioning props
  isSaving = false,
  version = 1,
  versionHistory = [],
  showHistory = false,
  onToggleHistory,
  onSelectVersion,
}: SupermemoryDocumentPanelProps) {
  const resolvedContent = document?.content || document?.raw || "";
  const title =
    document?.title ||
    document?.metadata?.title ||
    resolvedContent.split("\n")[0]?.replace(/^#+\s*/, "") ||
    "Untitled";
  const type = document?.type || document?.metadata?.type || "document";
  const createdAt =
    document?.createdAt || document?.metadata?.created_at
      ? new Date(
          document?.createdAt || document?.metadata?.created_at
        ).toLocaleString()
      : null;
  const resolvedContainer =
    document?.containerTag || document?.containerTags?.[0] || containerTag || "n/a";
  const resolvedTags = document ? resolveDocumentTags(document) : { primary: "research", secondary: [] as string[], stage: "draft" };

  const [draftTitle, setDraftTitle] = useState(title);
  const [draftContent, setDraftContent] = useState(resolvedContent);
  const [draftTags, setDraftTags] = useState<DocumentTags>(resolvedTags);
  const [secondaryInput, setSecondaryInput] = useState("");
  const [viewMode, setViewMode] = useState<"edit" | "preview">("edit");
  const contentEditorRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!document) return;
    setDraftTitle(title);
    setDraftContent(resolvedContent);
    setDraftTags(resolveDocumentTags(document));
    setSecondaryInput("");
    setViewMode("edit");
  }, [document?.id, title, resolvedContent, document]);

  const isDirty = useMemo(() => {
    if (draftTitle !== title) return true;
    if (draftContent !== resolvedContent) return true;
    if (draftTags.primary !== resolvedTags.primary) return true;
    if (draftTags.stage !== resolvedTags.stage) return true;
    if (JSON.stringify(draftTags.secondary) !== JSON.stringify(resolvedTags.secondary))
      return true;
    return false;
  }, [draftContent, draftTags, draftTitle, resolvedContent, resolvedTags, title]);

  if (!document) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
        <Cloud className="h-12 w-12 mb-4 opacity-50" />
        <p>Select a Supermemory document to view</p>
      </div>
    );
  }

  const handleSave = async () => {
    if (!onUpdate || !document.id || !isDirty) return;
    await onUpdate(document.id, {
      title: draftTitle.trim() || "Untitled",
      content: draftContent,
      folder: draftTags.primary,
      metadata: {
        tags: draftTags,
        relationships: document.metadata?.relationships || {},
      },
    });
  };

  const addSecondaryTag = (tag: string) => {
    const cleaned = tag.trim().toLowerCase().replace(/\s+/g, "-");
    if (!cleaned || draftTags.secondary.includes(cleaned)) return;
    setDraftTags((prev) => ({
      ...prev,
      secondary: [...prev.secondary, cleaned],
    }));
    setSecondaryInput("");
  };

  const removeSecondaryTag = (tag: string) => {
    setDraftTags((prev) => ({
      ...prev,
      secondary: prev.secondary.filter((t) => t !== tag),
    }));
  };

  const applyWrap = (prefix: string, suffix = prefix, placeholder = "text") => {
    const input = contentEditorRef.current;
    if (!input || saving || deleting) return;

    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? 0;
    const selected = draftContent.slice(start, end) || placeholder;
    const next =
      draftContent.slice(0, start) + prefix + selected + suffix + draftContent.slice(end);
    setDraftContent(next);

    requestAnimationFrame(() => {
      input.focus();
      const caretStart = start + prefix.length;
      const caretEnd = caretStart + selected.length;
      input.setSelectionRange(caretStart, caretEnd);
    });
  };

  const applyLinePrefix = (prefix: string) => {
    const input = contentEditorRef.current;
    if (!input || saving || deleting) return;

    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? 0;
    const selected = draftContent.slice(start, end) || "New line";
    const transformed = selected
      .split("\n")
      .map((line) => `${prefix}${line}`)
      .join("\n");
    const next = draftContent.slice(0, start) + transformed + draftContent.slice(end);
    setDraftContent(next);
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(start, start + transformed.length);
    });
  };

  const currentPrimaryConfig = PRIMARY_TAG_OPTIONS.find(
    (t) => t.id === draftTags.primary
  );

  // Resolve relationship data from metadata if not provided as prop
  const relData = relationships || {
    derived_from: (document.metadata?.relationships?.derived_from || []).map(
      (id: string) => ({ id, title: id })
    ),
    related_to: (document.metadata?.relationships?.related_to || []).map(
      (id: string) => ({ id, title: id })
    ),
    used_in: (document.metadata?.relationships?.used_in || []).map(
      (id: string) => ({ id, title: id })
    ),
  };

  return (
    <div className="h-full flex flex-col">
      <Card className="glass-card flex-1 flex flex-col overflow-hidden border border-border">
        <CardHeader className="border-b shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <CardTitle className="font-serif text-3xl font-medium leading-tight tracking-tight">
                {title}
              </CardTitle>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <Badge variant="secondary" className="gap-1">
                  <FileText className="h-3 w-3" />
                  {type}
                </Badge>
                {currentPrimaryConfig && (
                  <Badge className={`gap-1 ${currentPrimaryConfig.color}`}>
                    <Tag className="h-3 w-3" />
                    {currentPrimaryConfig.label}
                  </Badge>
                )}
                {draftTags.stage && (
                  <Badge variant="outline" className="gap-1 capitalize">
                    {draftTags.stage}
                  </Badge>
                )}
                {/* Version Indicator */}
                {version && version > 1 && (
                  <Badge variant="outline" className="gap-1 bg-slate-100">
                    v{version}
                  </Badge>
                )}
                {isDirty && (
                  <Badge variant="outline" className="gap-1 border-amber-300 text-amber-700">
                    Unsaved changes
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* History Button */}
              {onToggleHistory && versionHistory && versionHistory.length > 1 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onToggleHistory}
                  className="gap-2"
                >
                  <History className="h-4 w-4" />
                  History ({versionHistory.length})
                </Button>
              )}
              {onUpdate && document.id && (
                <Button
                  variant={isDirty ? "default" : "secondary"}
                  size="sm"
                  onClick={() => void handleSave()}
                  disabled={saving || !isDirty}
                  className="gap-2"
                >
                  {saving || isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Save{isDirty && " *"}
                </Button>
              )}
              {onDelete && document.id && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void onDelete(document.id)}
                  disabled={deleting || saving}
                  className="gap-2"
                >
                  {deleting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  Delete
                </Button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
            {document.id && (
              <span className="flex items-center gap-1">
                <Hash className="h-3 w-3" />
                ID: {document.id.slice(0, 8)}...
              </span>
            )}
            {createdAt && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {createdAt}
              </span>
            )}
          </div>
        </CardHeader>

        <CardContent className="flex-1 p-0 overflow-hidden">
          <div className="h-full overflow-y-auto">
            <div className="p-6">
              {loading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading full document...
                </div>
              )}

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Title
                  </label>
                  <div className="relative">
                    <Type className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={draftTitle}
                      onChange={(e) => setDraftTitle(e.target.value)}
                      disabled={saving || deleting}
                      className="pl-9"
                    />
                  </div>
                </div>

                {/* Primary Tag Selector */}
                <div className="space-y-2">
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Primary Tag
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {PRIMARY_TAG_OPTIONS.map((tag) => (
                      <button
                        key={tag.id}
                        type="button"
                        disabled={saving || deleting}
                        onClick={() =>
                          setDraftTags((prev) => ({ ...prev, primary: tag.id }))
                        }
                        className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                          draftTags.primary === tag.id
                            ? tag.color
                            : "bg-muted text-muted-foreground border-transparent hover:bg-muted/80"
                        }`}
                      >
                        {tag.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Secondary Tags */}
                <div className="space-y-2">
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Secondary Tags
                  </label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {draftTags.secondary.map((tag) => (
                      <Badge
                        key={tag}
                        variant="outline"
                        className="gap-1 pr-1"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => removeSecondaryTag(tag)}
                          disabled={saving || deleting}
                          className="ml-0.5 rounded-full hover:bg-muted p-0.5"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={secondaryInput}
                      onChange={(e) => setSecondaryInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === ",") {
                          e.preventDefault();
                          addSecondaryTag(secondaryInput);
                        }
                      }}
                      disabled={saving || deleting}
                      placeholder="Add tag (press Enter)"
                      className="flex-1"
                    />
                  </div>
                  {secondaryTagSuggestions.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {secondaryTagSuggestions
                        .filter((s) => !draftTags.secondary.includes(s))
                        .slice(0, 5)
                        .map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => addSecondaryTag(s)}
                            disabled={saving || deleting}
                            className="rounded-full px-2 py-0.5 text-[10px] bg-muted/50 text-muted-foreground hover:bg-muted transition-colors"
                          >
                            + {s}
                          </button>
                        ))}
                    </div>
                  )}
                </div>

                {/* Stage Dropdown */}
                <div className="space-y-2">
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Stage
                  </label>
                  <select
                    value={draftTags.stage || "draft"}
                    onChange={(e) =>
                      setDraftTags((prev) => ({ ...prev, stage: e.target.value }))
                    }
                    disabled={saving || deleting}
                    className="h-10 w-full max-w-[200px] rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring capitalize"
                  >
                    {STAGE_OPTIONS.map((stage) => (
                      <option key={stage} value={stage}>
                        {stage}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      Content
                    </label>
                    <div className="flex items-center gap-1 rounded-md border border-border p-1">
                      <Button
                        type="button"
                        size="sm"
                        variant={viewMode === "edit" ? "default" : "ghost"}
                        onClick={() => setViewMode("edit")}
                        className="h-7 px-2 text-xs"
                      >
                        <PencilLine className="mr-1 h-3.5 w-3.5" />
                        Edit
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={viewMode === "preview" ? "default" : "ghost"}
                        onClick={() => setViewMode("preview")}
                        className="h-7 px-2 text-xs"
                      >
                        <Eye className="mr-1 h-3.5 w-3.5" />
                        Preview
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border bg-background">
                    <div className="flex flex-wrap items-center gap-1 border-b border-border p-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => applyLinePrefix("# ")}
                        disabled={viewMode !== "edit" || saving || deleting}
                      >
                        <Heading1 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => applyLinePrefix("## ")}
                        disabled={viewMode !== "edit" || saving || deleting}
                      >
                        <Heading2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => applyLinePrefix("### ")}
                        disabled={viewMode !== "edit" || saving || deleting}
                      >
                        <Heading3 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => applyWrap("**")}
                        disabled={viewMode !== "edit" || saving || deleting}
                      >
                        <Bold className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => applyWrap("*")}
                        disabled={viewMode !== "edit" || saving || deleting}
                      >
                        <Italic className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => applyWrap("~~")}
                        disabled={viewMode !== "edit" || saving || deleting}
                      >
                        <Strikethrough className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => applyLinePrefix("- ")}
                        disabled={viewMode !== "edit" || saving || deleting}
                      >
                        <List className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => applyWrap("`")}
                        disabled={viewMode !== "edit" || saving || deleting}
                      >
                        <Code className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        onClick={() =>
                          applyWrap("[", "](https://example.com)", "link text")
                        }
                        disabled={viewMode !== "edit" || saving || deleting}
                      >
                        <Link className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    {viewMode === "edit" ? (
                      <textarea
                        ref={contentEditorRef}
                        value={draftContent}
                        onChange={(e) => setDraftContent(e.target.value)}
                        disabled={saving || deleting}
                        className="min-h-[320px] w-full resize-y border-0 bg-transparent px-3 py-3 font-sans text-sm leading-relaxed outline-none ring-0"
                      />
                    ) : (
                      <pre className="min-h-[320px] whitespace-pre-wrap px-3 py-3 font-sans text-sm leading-relaxed text-foreground">
                        {draftContent || "Nothing to preview yet."}
                      </pre>
                    )}
                  </div>
                </div>
              </div>

              {/* Relationships */}
              <RelationshipSection
                derivedFrom={relData.derived_from}
                relatedTo={relData.related_to}
                usedIn={relData.used_in}
                onRelationshipClick={onRelationshipClick}
              />

              {/* Version History */}
              {showHistory && versionHistory && versionHistory.length > 1 && onSelectVersion && (
                <div className="mt-4 rounded-lg border border-border bg-card">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                    <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
                      <History className="h-4 w-4" />
                      Version History
                    </h4>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={onToggleHistory}
                      className="h-7 px-2"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="divide-y divide-border">
                    {versionHistory.map((version, index) => (
                      <button
                        key={version.id}
                        onClick={() => onSelectVersion(version)}
                        className={`w-full px-4 py-3 text-left hover:bg-muted/50 transition-colors ${
                          version.id === document.id ? 'bg-primary/5 border-l-2 border-l-primary' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">
                            Version {version.metadata?.version || index + 1}
                            {version.id === document.id && (
                              <span className="ml-2 text-xs text-primary">(current)</span>
                            )}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(version.createdAt || Date.now()).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 truncate">
                          {version.title}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {document.metadata && Object.keys(document.metadata).length > 0 && (
                <details className="mt-4 rounded-lg border border-border bg-card">
                  <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium text-foreground">
                    Metadata
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </summary>
                  <div className="space-y-2 border-t border-border px-4 py-3">
                    {Object.entries(document.metadata)
                      .filter(
                        ([key]) =>
                          !["title", "type", "created_at", "tags", "relationships"].includes(
                            key
                          )
                      )
                      .map(([key, value]) => (
                        <div key={key} className="flex gap-2 text-sm">
                          <span className="text-muted-foreground font-medium">
                            {key}:
                          </span>
                          <span className="text-foreground break-all">
                            {typeof value === "object"
                              ? JSON.stringify(value)
                              : String(value)}
                          </span>
                        </div>
                      ))}
                  </div>
                </details>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
