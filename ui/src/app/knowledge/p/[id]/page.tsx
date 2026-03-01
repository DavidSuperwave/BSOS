"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  useKnowledgeProject,
  useProjectDocuments,
  createProjectDocument,
  createDocumentVersion,
  updateProjectDocument,
  deleteProjectDocument,
  type ProjectDocument,
  PROJECT_TEMPLATES,
  type PrimaryTag,
} from "@/lib/hooks/use-knowledge-projects";
import { useCompany } from "@/contexts/company-context";
import { SupermemoryDocumentPanel } from "@/components/supermemory/supermemory-document-panel";
import { ProjectChatPanel } from "@/components/knowledge/project-chat-panel";
import {
  Tag,
  Plus,
  Loader2,
  Cloud,
  AlertCircle,
  Search,
  PanelRightOpen,
  PanelRightClose,
  ChevronRight,
  ArrowLeft,
  FileText,
  Filter,
  History,
} from "lucide-react";

// Primary tag options (replaces folders)
const PRIMARY_TAGS: { id: PrimaryTag; label: string; color: string }[] = [
  { id: "profile", label: "Profile", color: "bg-blue-100 text-blue-700" },
  { id: "icp", label: "ICP", color: "bg-green-100 text-green-700" },
  { id: "campaign", label: "Campaigns", color: "bg-purple-100 text-purple-700" },
  { id: "research", label: "Research", color: "bg-amber-100 text-amber-700" },
  { id: "asset", label: "Assets", color: "bg-pink-100 text-pink-700" },
  { id: "analysis", label: "Analysis", color: "bg-cyan-100 text-cyan-700" },
];

// Helper to get primary tag from document
function getDocumentPrimaryTag(document: ProjectDocument): PrimaryTag | null {
  return document.metadata?.tags?.primary || null;
}

// Helper to get all tags from document
function getDocumentTags(document: ProjectDocument): string[] {
  const primary = document.metadata?.tags?.primary;
  const secondary = document.metadata?.tags?.secondary || [];
  return primary ? [primary, ...secondary] : secondary;
}

export default function KnowledgeProjectPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;
  const { selectedCompany } = useCompany();

  const [activeTag, setActiveTag] = useState<PrimaryTag | "all">("all");
  const [secondaryFilter, setSecondaryFilter] = useState<string>("");
  const [selectedDoc, setSelectedDoc] = useState<ProjectDocument | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showChatPanel, setShowChatPanel] = useState(true);
  const [creating, setCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const { data: projectData, error: projectError } = useKnowledgeProject(
    projectId,
    selectedCompany?.id
  );

  const project = projectData?.project;

  const {
    data: docsData,
    error: docsError,
    isLoading: docsLoading,
    mutate: mutateDocs,
  } = useProjectDocuments(projectId, selectedCompany?.id);

  const documents = docsData?.documents || [];
  const containerTag = docsData?.containerTag;

  // Extract unique secondary tags from all documents
  const allSecondaryTags = useMemo(() => {
    const tags = new Set<string>();
    documents.forEach((doc) => {
      const secondary = doc.metadata?.tags?.secondary || [];
      secondary.forEach((tag: string) => tags.add(tag));
    });
    return Array.from(tags).sort();
  }, [documents]);

  // Compute document history for selected document
  const documentHistory = useMemo(() => {
    if (!selectedDoc || !documents.length) return [];
    
    const history: ProjectDocument[] = [selectedDoc];
    let currentId = selectedDoc.metadata?.relationships?.replaces;
    
    // Walk backwards through replacement chain
    while (currentId) {
      const prevDoc = documents.find(d => d.id === currentId);
      if (prevDoc) {
        history.push(prevDoc);
        currentId = prevDoc.metadata?.relationships?.replaces;
      } else {
        break;
      }
    }
    
    return history.reverse(); // Oldest first
  }, [documents, selectedDoc]);
  const tagDocumentCounts = useMemo(() => {
    const counts: Record<string, number> = { all: documents.length };
    PRIMARY_TAGS.forEach((tag) => {
      counts[tag.id] = documents.filter(
        (doc) => getDocumentPrimaryTag(doc) === tag.id
      ).length;
    });
    return counts;
  }, [documents]);

  // Filter documents
  const filteredDocuments = useMemo(() => {
    let scoped = documents;

    // Filter by primary tag
    if (activeTag !== "all") {
      scoped = scoped.filter((doc) => getDocumentPrimaryTag(doc) === activeTag);
    }

    // Filter by secondary tag
    if (secondaryFilter) {
      scoped = scoped.filter((doc) =>
        (doc.metadata?.tags?.secondary || []).includes(secondaryFilter)
      );
    }

    // Filter by search query
    if (!searchQuery.trim()) return scoped;
    const query = searchQuery.toLowerCase();
    return scoped.filter(
      (doc) =>
        doc.title?.toLowerCase().includes(query) ||
        doc.content?.toLowerCase().includes(query) ||
        (doc.metadata?.tags?.secondary || []).some((tag: string) =>
          tag.toLowerCase().includes(query)
        )
    );
  }, [activeTag, documents, secondaryFilter, searchQuery]);

  const handleCreateDocument = async (primaryTag: PrimaryTag = "research") => {
    if (!selectedCompany?.id || !projectId) return;

    setCreating(true);
    setErrorMessage(null);

    try {
      const defaultTitle = "Untitled Document";
      const defaultContent = `# ${defaultTitle}\n\n`;

      const result = await createProjectDocument(projectId, {
        companyId: selectedCompany.id,
        title: defaultTitle,
        content: defaultContent,
        type: "note",
        metadata: {
          tags: {
            primary: primaryTag,
            secondary: [],
            stage: "draft",
          },
          relationships: {},
        },
      });

      await mutateDocs();

      if (result.document?.id) {
        setSelectedDoc(result.document);
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to create document");
      console.error("[Project] Create error:", err);
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateDocument = async (
    id: string,
    payload: { title: string; content: string; metadata?: Record<string, any> }
  ) => {
    if (!selectedCompany?.id || !selectedDoc) return;
    setErrorMessage(null);
    setIsSaving(true);
    
    try {
      // Use versioning instead of direct update
      const newVersion = await createDocumentVersion(
        projectId,
        selectedDoc,
        {
          companyId: selectedCompany.id,
          title: payload.title,
          content: payload.content,
        }
      );

      if (newVersion?.document) {
        // Seamlessly switch to new version
        setSelectedDoc(newVersion.document);
        await mutateDocs();
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to save document");
      console.error("[Project] Version creation error:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteDocument = async (id: string) => {
    if (!selectedCompany?.id) return;
    setErrorMessage(null);
    try {
      await deleteProjectDocument(projectId, id, selectedCompany.id);
      if (selectedDoc?.id === id) {
        setSelectedDoc(null);
      }
      await mutateDocs();
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to delete document");
    }
  };

  useEffect(() => {
    if (!selectedDoc) return;
    const nextSelected = documents.find((doc) => doc.id === selectedDoc.id) || null;
    setSelectedDoc(nextSelected);
  }, [documents, selectedDoc?.id]);

  useEffect(() => {
    if (!selectedDoc || activeTag === "all") return;
    if (getDocumentPrimaryTag(selectedDoc) !== activeTag) {
      setSelectedDoc(null);
    }
  }, [activeTag, selectedDoc]);

  if (projectError) {
    return (
      <AppShell header={{ title: "Error", subtitle: "Failed to load project" }} mainClassName="p-6">
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-400">
          {projectError.message || "Failed to load project"}
        </div>
      </AppShell>
    );
  }

  if (!project) {
    return (
      <AppShell header={{ title: "Loading...", subtitle: "" }} mainClassName="p-6">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      header={{
        title: project.name,
        subtitle:
          project.description ||
          PROJECT_TEMPLATES[project.type as keyof typeof PROJECT_TEMPLATES]?.description ||
          "",
        actions: (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => router.push("/knowledge")} className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Vault
            </Button>
            <Button size="sm" variant="outline" className="gap-2" onClick={() => setShowChatPanel((v) => !v)}>
              {showChatPanel ? (
                <>
                  <PanelRightClose className="h-4 w-4" />
                  Hide Chat
                </>
              ) : (
                <>
                  <PanelRightOpen className="h-4 w-4" />
                  Show Chat
                </>
              )}
            </Button>
          </div>
        ),
      }}
      mainClassName="overflow-hidden p-6 lg:p-8"
    >
      {errorMessage && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 flex items-center gap-3 text-red-400">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span className="text-sm">{errorMessage}</span>
        </div>
      )}

      {docsError && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 flex items-center gap-3 text-red-400">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span className="text-sm">Failed to load project documents. Ensure Supermemory is configured.</span>
        </div>
      )}

      {/* Tag Bar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Filter by tag:</span>
        <button
          onClick={() => setActiveTag("all")}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            activeTag === "all" ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"
          }`}
        >
          All ({tagDocumentCounts.all})
        </button>
        {PRIMARY_TAGS.map((tag) => (
          <button
            key={tag.id}
            onClick={() => setActiveTag(tag.id)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              activeTag === tag.id ? tag.color : "bg-muted hover:bg-muted/80 text-muted-foreground"
            }`}
          >
            {tag.label} ({tagDocumentCounts[tag.id]})
          </button>
        ))}
      </div>

      {/* Secondary Tags */}
      {allSecondaryTags.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Filter className="h-3 w-3 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">Cross-cutting:</span>
          {secondaryFilter && (
            <button
              onClick={() => setSecondaryFilter("")}
              className="rounded-full px-2 py-0.5 text-xs bg-red-100 text-red-700 hover:bg-red-200"
            >
              Clear
            </button>
          )}
          {allSecondaryTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setSecondaryFilter(tag === secondaryFilter ? "" : tag)}
              className={`rounded-full px-2 py-0.5 text-xs transition-colors ${
                secondaryFilter === tag
                  ? "bg-primary/20 text-primary border border-primary/30"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted"
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      <div className="flex h-full min-h-0 flex-col gap-4 lg:flex-row">
        {/* Left: Document List Sidebar */}
        <aside className="glass-card flex min-h-0 w-full flex-col rounded-xl border border-border p-4 lg:w-[320px] lg:shrink-0">
          <div className="mb-4 space-y-2">
            <Button
              className="w-full justify-start gap-2"
              onClick={() => handleCreateDocument(activeTag !== "all" ? activeTag : "research")}
              disabled={creating || !selectedCompany?.id}
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              New Document
            </Button>

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search documents..."
                className="pl-9"
              />
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto space-y-1 pr-1">
            {docsLoading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            )}

            {!docsLoading && filteredDocuments.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <Cloud className="h-8 w-8 mx-auto mb-2 opacity-50" />
                {documents.length === 0 ? "No documents yet" : "No matching documents"}
              </div>
            )}

            {filteredDocuments.map((doc) => {
              const primaryTag = getDocumentPrimaryTag(doc);
              const secondaryTags = doc.metadata?.tags?.secondary || [];
              const tagConfig = PRIMARY_TAGS.find((t) => t.id === primaryTag);

              return (
                <button
                  key={doc.id}
                  onClick={() => setSelectedDoc(doc)}
                  className={`flex w-full flex-col gap-1 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                    selectedDoc?.id === doc.id
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <FileText className="h-4 w-4 mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{doc.title || "Untitled"}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1 pl-6">
                    {primaryTag && tagConfig && (
                      <Badge className={`text-[10px] px-1.5 py-0 ${tagConfig.color}`}>{tagConfig.label}</Badge>
                    )}
                    {secondaryTags.slice(0, 3).map((tag: string) => (
                      <Badge key={tag} variant="outline" className="text-[10px] px-1.5 py-0">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Middle + Right: Editor + Chat */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-2">
            <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
              <span className="truncate">{project.name}</span>
              <ChevronRight className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{activeTag === "all" ? "All Documents" : PRIMARY_TAGS.find(t => t.id === activeTag)?.label}</span>
              {selectedDoc && (
                <>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate text-foreground">{selectedDoc.title || "Untitled"}</span>
                </>
              )}
            </div>
          </div>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 xl:flex-row">
            <div className="min-h-0 min-w-0 flex-1">
              {selectedDoc ? (
                <SupermemoryDocumentPanel
                  document={{
                    ...selectedDoc,
                    metadata: {
                      ...selectedDoc.metadata,
                      tags: selectedDoc.metadata?.tags || { primary: "research", secondary: [], stage: "draft" },
                    },
                  }}
                  containerTag={containerTag}
                  tagOptions={PRIMARY_TAGS.map((t) => t.id)}
                  secondaryTagSuggestions={allSecondaryTags}
                  onUpdate={handleUpdateDocument}
                  onDelete={handleDeleteDocument}
                  onRelationshipClick={(docId) => {
                    const found = documents.find((d) => d.id === docId);
                    if (found) setSelectedDoc(found);
                  }}
                  // Versioning props
                  isSaving={isSaving}
                  version={selectedDoc.metadata?.version || 1}
                  versionHistory={documentHistory}
                  showHistory={showHistory}
                  onToggleHistory={() => setShowHistory(!showHistory)}
                  onSelectVersion={(version) => setSelectedDoc(version)}
                />
              ) : (
                <Card className="glass-card h-full border border-border">
                  <CardContent className="p-6 flex flex-col items-center justify-center h-full text-center">
                    <Tag className="h-12 w-12 text-muted-foreground mb-4 opacity-50" />
                    <h3 className="font-semibold">Select a document</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Documents are organized by tags, not folders.
                    </p>
                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                      {PRIMARY_TAGS.map((tag) => (
                        <button
                          key={tag.id}
                          onClick={() => {
                            setActiveTag(tag.id);
                            handleCreateDocument(tag.id);
                          }}
                          className={`rounded-full px-3 py-1 text-xs font-medium ${tag.color}`}
                        >
                          + {tag.label}
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {showChatPanel && (
              <div className="min-h-[320px] w-full xl:min-h-0 xl:w-[340px] xl:shrink-0">
                <ProjectChatPanel
                  projectId={projectId}
                  companyId={selectedCompany?.id}
                  project={project}
                  selectedDocument={selectedDoc}
                  onDocumentCreated={() => void mutateDocs()}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
