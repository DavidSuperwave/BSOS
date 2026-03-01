"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  useKnowledgeProjects,
  createProject,
  PROJECT_TEMPLATES,
  type ProjectType,
} from "@/lib/hooks/use-knowledge-projects";
import { useCompany } from "@/contexts/company-context";
import { useAuth } from "@/contexts/auth-context";
import {
  Folder,
  BookOpen,
  Briefcase,
  Megaphone,
  Microscope,
  Plus,
  Search,
  Clock,
  FileText,
  Loader2,
  ArrowRight,
  Database,
} from "lucide-react";
import { StorageDashboard } from "@/components/supermemory/storage-dashboard";
import { formatDistanceToNow } from "date-fns";

const ICONS: Record<ProjectType | string, React.ComponentType<{ className?: string }>> = {
  vault: Folder,
  knowledge_base: BookOpen,
  deal_room: Briefcase,
  campaign: Megaphone,
  research: Microscope,
};

export default function KnowledgeVaultPage() {
  const router = useRouter();
  const { selectedCompany } = useCompany();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [activeTab, setActiveTab] = useState<"projects" | "storage">("projects");

  const {
    data,
    error,
    isLoading,
    mutate: mutateProjects,
  } = useKnowledgeProjects(selectedCompany?.id);

  const projects = data?.projects || [];

  const filteredProjects = searchQuery.trim()
    ? projects.filter(
        (p) =>
          p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.description?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : projects;

  const handleCreateProject = async (type: ProjectType, name: string) => {
    if (!selectedCompany?.id || !user?.id) return;

    setCreating(true);
    try {
      const result = await createProject(selectedCompany.id, {
        name,
        type,
      });

      setIsCreateOpen(false);
      mutateProjects();

      // Navigate to the new project
      if (result.project?.id) {
        router.push(`/knowledge/p/${result.project.id}`);
      }
    } catch (err: any) {
      console.error("Failed to create project:", err);
      alert(err.message || "Failed to create project");
    } finally {
      setCreating(false);
    }
  };

  return (
    <AppShell
      header={{
        title: "Vault",
        subtitle: "Organize your knowledge into projects",
        actions: (
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Create Project
              </Button>
            </DialogTrigger>
            <CreateProjectDialog
              onCreate={handleCreateProject}
              creating={creating}
            />
          </Dialog>
        ),
      }}
      mainClassName="p-6 lg:p-8"
    >
      {/* Tab Toggle */}
      <div className="mb-6 flex items-center gap-4">
        <div className="flex rounded-lg border border-border p-1 bg-muted/30">
          <button
            type="button"
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === "projects"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveTab("projects")}
          >
            <Folder className="h-3.5 w-3.5 inline mr-1.5" />
            Projects
          </button>
          <button
            type="button"
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === "storage"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveTab("storage")}
          >
            <Database className="h-3.5 w-3.5 inline mr-1.5" />
            Storage
          </button>
        </div>

        {activeTab === "projects" && (
          <div className="relative max-w-md flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search projects..."
              className="pl-9"
            />
          </div>
        )}
      </div>

      {activeTab === "storage" ? (
        <StorageDashboard />
      ) : (
        <>
          {/* Error */}
          {error && (
            <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-400">
              Failed to load projects: {error.message}
            </div>
          )}

          {/* Loading */}
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}

          {/* Empty State */}
          {!isLoading && filteredProjects.length === 0 && !searchQuery && (
            <Card className="glass-card">
              <CardContent className="py-12 text-center">
                <Folder className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold">No projects yet</h3>
                <p className="text-sm text-muted-foreground mt-1 mb-4">
                  Create your first project to start organizing your knowledge.
                </p>
                <Button onClick={() => setIsCreateOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Project
                </Button>
              </CardContent>
            </Card>
          )}

          {/* No Search Results */}
          {!isLoading && filteredProjects.length === 0 && searchQuery && (
            <Card className="glass-card">
              <CardContent className="py-12 text-center">
                <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold">No matching projects</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Try a different search term.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Project Grid */}
          {!isLoading && filteredProjects.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredProjects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onClick={() => router.push(`/knowledge/p/${project.id}`)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}

function ProjectCard({
  project,
  onClick,
}: {
  project: {
    id: string;
    name: string;
    description?: string;
    type: string;
    document_count: number;
    documentCount?: number;
    updated_at: string;
  };
  onClick: () => void;
}) {
  const Icon = ICONS[project.type] || Folder;

  return (
    <Card
      className="glass-card cursor-pointer transition-all hover:shadow-md hover:border-primary/30 group"
      onClick={onClick}
    >
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <div className="rounded-lg border border-border bg-muted p-3">
            <Icon className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground truncate">{project.name}</h3>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
              {project.description || PROJECT_TEMPLATES[project.type as ProjectType]?.description}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <FileText className="h-3.5 w-3.5" />
            {(project.documentCount ?? project.document_count ?? 0).toLocaleString()} files
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {formatDistanceToNow(new Date(project.updated_at), { addSuffix: true })}
          </span>
        </div>

        <div className="mt-3 pt-3 border-t border-border">
          <span className="text-xs text-primary font-medium group-hover:underline">
            Open Project
            <ArrowRight className="inline h-3 w-3 ml-1" />
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function CreateProjectDialog({
  onCreate,
  creating,
}: {
  onCreate: (type: ProjectType, name: string) => void;
  creating: boolean;
}) {
  const [selectedType, setSelectedType] = useState<ProjectType>("vault");
  const [name, setName] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onCreate(selectedType, name.trim());
    }
  };

  return (
    <DialogContent className="sm:max-w-[500px]">
      <DialogHeader>
        <DialogTitle>Create New Project</DialogTitle>
        <DialogDescription>
          Choose a template and name for your project.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit}>
        <div className="space-y-4 py-4">
          {/* Template Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Project Type</label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.entries(PROJECT_TEMPLATES) as [ProjectType, typeof PROJECT_TEMPLATES.vault][]).map(
                ([type, template]) => {
                  const Icon = ICONS[type];
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setSelectedType(type)}
                      className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-colors ${
                        selectedType === type
                          ? "border-primary bg-primary/10"
                          : "border-border hover:bg-muted"
                      }`}
                    >
                      <Icon className="h-5 w-5 text-primary shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{template.name}</p>
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {template.description}
                        </p>
                      </div>
                    </button>
                  );
                }
              )}
            </div>
          </div>

          {/* Name Input */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Project Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Q1 Enterprise Campaign"
              required
            />
          </div>

          {/* Tag Preview */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Suggested Tags</label>
            <div className="flex flex-wrap gap-1">
              {PROJECT_TEMPLATES[selectedType].suggestedTags.primary.map((tag) => (
                <span
                  key={tag}
                  className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-md font-medium"
                >
                  {tag}
                </span>
              ))}
              {PROJECT_TEMPLATES[selectedType].suggestedTags.secondary.map((tag) => (
                <span
                  key={tag}
                  className="text-xs bg-muted px-2 py-1 rounded-md text-muted-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="submit" disabled={creating || !name.trim()}>
            {creating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Project"
            )}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
