"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  useSkillsStatus,
  useSkillsCatalog,
  upsertCompanySkill,
  deleteCompanySkill,
  importCompanySkill,
  createCompanySkillShareLink,
  revokeCompanySkillShareLink,
  useCompanySkillShareLinks,
  type SkillStatusEntry,
} from "@/lib/hooks";
import { useCompany } from "@/contexts/company-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Loader2,
  RefreshCw,
  Plus,
  Trash2,
  Download,
  Share2,
  ChevronDown,
  Sparkles,
  Pin,
  ArrowRight,
} from "lucide-react";
import { LearnSkillModal } from "@/components/skills/learn-skill-modal";
import { ReviewQueue } from "@/components/skills/review-queue";

type SkillFilter = "all" | "ready" | "needsSetup" | "disabled";
type ShelfTab = "all" | "pinned";
type MainTab = "skills" | "insights";

interface EnvEditorState {
  skillSlug: string;
  skillName: string;
  mode: "manual";
}

function skillMatchesFilter(skill: SkillStatusEntry, filter: SkillFilter): boolean {
  if (filter === "all") return true;
  if (filter === "ready") return skill.ready;
  if (filter === "needsSetup") return skill.needsSetup;
  return skill.disabled;
}

function getAuthTypeLabel(skill: SkillStatusEntry): string {
  return skill.requirements.env.length > 0 || skill.install.length > 0 ? "api_key auth" : "none auth";
}

function getCredentialsLabel(skill: SkillStatusEntry): string {
  if (skill.requirements.env.length === 0 && skill.install.length === 0) return "No credentials";
  const hasConfigured = skill.assignments.some(
    (assignment) => assignment.envConfigured.hasApiKey || assignment.envConfigured.keys.length > 0
  );
  return hasConfigured ? "Credentials configured" : "Needs credentials";
}

function getAgentsUsingCount(skill: SkillStatusEntry): number {
  return skill.assignments.filter((assignment) => assignment.enabled && assignment.install.status === "installed").length;
}

function placeholderArt(seed: string): string {
  const palette = [
    "from-sky-200/80 via-indigo-200/70 to-violet-200/70",
    "from-amber-200/80 via-orange-200/70 to-rose-200/70",
    "from-emerald-200/80 via-cyan-200/70 to-sky-200/70",
    "from-lime-200/80 via-emerald-200/70 to-cyan-200/70",
    "from-violet-200/80 via-fuchsia-200/70 to-pink-200/70",
  ];
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash + seed.charCodeAt(i) * (i + 1)) % 9999;
  return palette[hash % palette.length];
}

export default function SkillsSettings() {
  const searchParams = useSearchParams();
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id;
  const { data, isLoading, mutate } = useSkillsStatus(companyId);
  const { data: catalogData, mutate: mutateCatalog } = useSkillsCatalog(companyId);
  const { data: shareLinksData, mutate: mutateShareLinks } = useCompanySkillShareLinks(companyId);
  const skillCardRefs = useRef<Record<string, HTMLElement | null>>({});

  const [filter, setFilter] = useState<SkillFilter>("all");
  const [shelfTab, setShelfTab] = useState<ShelfTab>("all");
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [showHowSkillsWork, setShowHowSkillsWork] = useState(false);
  const [pinnedSlugs, setPinnedSlugs] = useState<string[]>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [editor, setEditor] = useState<EnvEditorState | null>(null);
  const [shareImportToken, setShareImportToken] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [showLearn, setShowLearn] = useState(false);
  const [mainTab, setMainTab] = useState<MainTab>("skills");
  const [newSlug, setNewSlug] = useState("");
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newSkillMd, setNewSkillMd] = useState(
    `---\nname: example-skill\ndescription: Example skill\nmetadata: {"openclaw":{"requires":{"env":[],"bins":[],"config":[]}}}\n---\n\n# Example Skill\n\nDescribe your skill usage here.\n`
  );
  const visibleSkills = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (data?.skills || [])
      .filter((skill) => (showArchived ? true : !skill.disabled))
      .filter((skill) => skillMatchesFilter(skill, filter))
      .filter((skill) => {
        if (!normalized) return true;
        return [skill.name, skill.slug, skill.description]
          .join(" ")
          .toLowerCase()
          .includes(normalized);
      })
      .filter((skill) => (shelfTab === "pinned" ? pinnedSlugs.includes(skill.slug) : true));
  }, [data?.skills, filter, pinnedSlugs, query, shelfTab, showArchived]);

  const skillsToLearn = useMemo(
    () =>
      (catalogData?.catalog || [])
        .filter((entry) => !entry.installed)
        .filter((entry) => {
          const normalized = query.trim().toLowerCase();
          if (!normalized) return true;
          return [entry.name, entry.slug, entry.description].join(" ").toLowerCase().includes(normalized);
        }),
    [catalogData?.catalog, query]
  );
  const focusedSkillSlug = useMemo(
    () => (searchParams.get("skill") || "").trim(),
    [searchParams]
  );

  useEffect(() => {
    if (!focusedSkillSlug) return;
    const node = skillCardRefs.current[focusedSkillSlug];
    if (!node) return;
    node.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusedSkillSlug, visibleSkills.length]);

  async function runBusy(key: string, fn: () => Promise<void>) {
    try {
      setBusyKey(key);
      await fn();
      await mutate();
      await mutateCatalog();
      await mutateShareLinks();
    } catch (err: any) {
      alert(err?.message || "Action failed");
    } finally {
      setBusyKey(null);
    }
  }

  const togglePinned = (slug: string) => {
    setPinnedSlugs((prev) => {
      if (prev.includes(slug)) return prev.filter((entry) => entry !== slug);
      return [...prev, slug];
    });
  };

  async function handleCreateSkill() {
    if (!companyId) return;
    if (!newSkillMd.trim()) {
      alert("SKILL.md content is required");
      return;
    }
    await runBusy("create-skill", async () => {
      await upsertCompanySkill(companyId, {
        slug: newSlug || undefined,
        name: newName || undefined,
        description: newDescription || undefined,
        skillMd: newSkillMd,
      });
      setShowCreate(false);
      setNewSlug("");
      setNewName("");
      setNewDescription("");
    });
  }

  async function handleDeleteSkill(slug: string) {
    if (!companyId) return;
    if (!confirm(`Delete "${slug}" from company catalog and all agent assignments?`)) return;
    await runBusy(`${slug}:delete`, async () => {
      await deleteCompanySkill(companyId, slug);
    });
  }

  async function handleImportCatalogSkill(blueprintId: string) {
    if (!companyId) return;
    await runBusy(`catalog:${blueprintId}:import`, async () => {
      await importCompanySkill(companyId, {
        type: "blueprint",
        blueprintId,
      });
      await mutateCatalog();
    });
  }

  async function handleShareSkill(skill: SkillStatusEntry) {
    if (!companyId) return;
    await runBusy(`${skill.slug}:share`, async () => {
      const result = await createCompanySkillShareLink(companyId, {
        slug: skill.slug,
        label: `${skill.name} share link`,
        expiresInHours: 24 * 7,
        maxImports: 25,
      });
      const link = result?.link?.import_url
        ? `${window.location.origin}${result.link.import_url}`
        : "";
      if (link) {
        await navigator.clipboard.writeText(link);
        alert("Share link copied to clipboard.");
      } else {
        alert("Share link created.");
      }
    });
  }

  async function handleImportFromShareLink() {
    if (!companyId) return;
    const raw = shareImportToken.trim();
    if (!raw) return;

    let token = raw;
    try {
      if (raw.includes("/api/skills/share/")) {
        const parts = raw.split("/api/skills/share/");
        token = parts[1]?.split("?")[0] || raw;
      }
    } catch {
      token = raw;
    }

    await runBusy("import-share-link", async () => {
      await importCompanySkill(companyId, {
        type: "share_link",
        token,
      });
      setShareImportToken("");
    });
  }

  async function handleRevokeShareLink(linkId: string) {
    if (!companyId) return;
    await runBusy(`share:${linkId}:revoke`, async () => {
      await revokeCompanySkillShareLink(companyId, linkId);
    });
  }

  if (!companyId) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Select a company to manage skills.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <section className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">Skills</h1>
        <p className="text-sm text-muted-foreground">API integrations and capabilities for your agents</p>
      </section>

      {/* Main Tabs: Skills | Insight Reviews */}
      <div className="flex items-center gap-1 border-b border-border">
        <button
          onClick={() => setMainTab("skills")}
          className={`px-4 py-2 text-sm font-medium transition-colors relative ${
            mainTab === "skills"
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Skills
          {mainTab === "skills" && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
          )}
        </button>
        <button
          onClick={() => setMainTab("insights")}
          className={`px-4 py-2 text-sm font-medium transition-colors relative ${
            mainTab === "insights"
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Insight Reviews
          {mainTab === "insights" && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
          )}
        </button>
      </div>

      {mainTab === "insights" ? (
        <ReviewQueue companyId={companyId} />
      ) : (
        <>
          <section className="rounded-xl border border-violet-200/70 bg-violet-50/60">
            <button
              className="w-full flex items-center justify-between gap-3 px-4 py-3"
              onClick={() => setShowHowSkillsWork((prev) => !prev)}
              type="button"
            >
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-violet-500" />
                <div>
                  <p className="text-sm font-medium">How Skills Work</p>
                  <p className="text-xs text-muted-foreground">Teach your agent new capabilities through docs and scripts.</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{showHowSkillsWork ? "Collapse" : "Expand"}</span>
                <ChevronDown className={`h-4 w-4 transition-transform ${showHowSkillsWork ? "rotate-180" : ""}`} />
              </div>
            </button>
            {showHowSkillsWork ? (
              <div className="px-4 pb-4">
                <div className="rounded-lg border border-violet-200/60 bg-white px-3 py-2 text-xs text-muted-foreground">
                  Learn from research or pasted docs, save skills to your company, then assign and configure them per agent in
                  each skill detail page.
                </div>
              </div>
            ) : null}
          </section>

          <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Show Archived</span>
          <Switch checked={showArchived} onCheckedChange={setShowArchived} />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => mutate()} disabled={isLoading || busyKey !== null}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline" onClick={() => setShowCreate((v) => !v)}>
            <Plus className="h-4 w-4 mr-2" />
            {showCreate ? "Close Manual Editor" : "Add Skill (Manual)"}
          </Button>
          <Button onClick={() => setShowLearn(true)}>Learn New Skill</Button>
        </div>
      </section>

      {showCreate ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Create / Update Company Skill</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Input
                placeholder="slug (optional)"
                value={newSlug}
                onChange={(e) => setNewSlug(e.target.value)}
              />
              <Input
                placeholder="name (optional)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <Input
                placeholder="description (optional)"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
              />
            </div>
            <textarea
              value={newSkillMd}
              onChange={(e) => setNewSkillMd(e.target.value)}
              rows={10}
              className="w-full rounded-md border border-border bg-background p-3 text-sm"
            />
            <div className="flex justify-end">
              <Button
                onClick={handleCreateSkill}
                disabled={busyKey === "create-skill"}
              >
                {busyKey === "create-skill" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save Skill
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Skills to learn</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => mutateCatalog()}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {skillsToLearn.length === 0 ? (
            <p className="text-sm text-muted-foreground">All catalog skills are already installed.</p>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-2">
              {skillsToLearn.map((entry) => (
                <article
                  key={entry.id}
                  className="min-w-[260px] max-w-[280px] rounded-xl border border-border bg-card p-3"
                >
                  <div className={`h-16 rounded-lg bg-gradient-to-r ${placeholderArt(entry.slug)}`} />
                  <div className="mt-3 space-y-2">
                    <p className="text-sm font-semibold leading-tight line-clamp-2">{entry.name}</p>
                    <p className="text-xs text-muted-foreground line-clamp-3">
                      {entry.description || "No description"}
                    </p>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      {entry.isDefault ? <Badge variant="outline">Default</Badge> : null}
                      <Badge variant="outline">{entry.version}</Badge>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleImportCatalogSkill(entry.id)}
                      disabled={busyKey === `catalog:${entry.id}:import`}
                    >
                      {busyKey === `catalog:${entry.id}:import` ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : (
                        <Download className="h-3 w-3 mr-1" />
                      )}
                      Import
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Import / Export</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Paste share token or /api/skills/share/{token} link"
              value={shareImportToken}
              onChange={(e) => setShareImportToken(e.target.value)}
            />
            <Button
              onClick={handleImportFromShareLink}
              disabled={busyKey === "import-share-link" || !shareImportToken.trim()}
            >
              {busyKey === "import-share-link" ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Import
            </Button>
          </div>
          {(shareLinksData?.links || []).length > 0 ? (
            <div className="space-y-2">
              {(shareLinksData?.links || []).slice(0, 3).map((link: any) => (
                <div key={link.id} className="rounded-md border border-border p-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{link.skill_slug}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{link.import_url}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleRevokeShareLink(link.id)}
                    disabled={busyKey === `share:${link.id}:revoke`}
                  >
                    Revoke
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No active share links yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <Input
            placeholder="Search skills by name, description, or tags..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="flex items-center gap-2 pt-2">
            <Button
              variant={shelfTab === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setShelfTab("all")}
            >
              Your Skills ({(data?.skills || []).length})
            </Button>
            <Button
              variant={shelfTab === "pinned" ? "default" : "outline"}
              size="sm"
              onClick={() => setShelfTab("pinned")}
            >
              Pinned ({pinnedSlugs.length})
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            {[
              { id: "all", label: "All" },
              { id: "ready", label: "Ready" },
              { id: "needsSetup", label: "Needs Setup" },
              { id: "disabled", label: "Disabled" },
            ].map((entry) => (
              <Button
                key={entry.id}
                size="sm"
                variant={filter === entry.id ? "default" : "outline"}
                onClick={() => setFilter(entry.id as SkillFilter)}
              >
                {entry.label}
              </Button>
            ))}
          </div>
        </CardHeader>
      </Card>

      {isLoading ? (
        <Card>
          <CardContent className="p-8 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      ) : visibleSkills.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-sm text-muted-foreground">
            No skills found for this filter.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {visibleSkills.map((skill) => (
            <article
              key={skill.slug}
              ref={(node) => {
                skillCardRefs.current[skill.slug] = node;
              }}
              className={
                skill.slug === focusedSkillSlug
                  ? "rounded-xl border border-primary/40 ring-1 ring-primary/60 bg-card p-4"
                  : "rounded-xl border border-border bg-card p-4"
              }
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xl">{skill.emoji || "⚙"}</span>
                    <Link href={`/skills/${skill.slug}`} className="font-semibold text-base hover:underline truncate">
                      {skill.name}
                    </Link>
                    <Badge variant="outline">{getAuthTypeLabel(skill)}</Badge>
                    <Badge variant="outline">{skill.version}</Badge>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                    <span>{getCredentialsLabel(skill)}</span>
                    <span>•</span>
                    <span>{getAgentsUsingCount(skill)} agents</span>
                    {skill.ready ? (
                      <>
                        <span>•</span>
                        <span className="text-emerald-600">Ready</span>
                      </>
                    ) : null}
                    {skill.needsSetup ? (
                      <>
                        <span>•</span>
                        <span className="text-amber-600">Needs setup</span>
                      </>
                    ) : null}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => togglePinned(skill.slug)}
                  aria-label="Pin skill"
                >
                  <Pin
                    className={`h-4 w-4 ${pinnedSlugs.includes(skill.slug) ? "fill-current text-foreground" : "text-muted-foreground"}`}
                  />
                </Button>
              </div>

              <p className="mt-3 text-sm text-muted-foreground line-clamp-2">
                {skill.description || "No description"}
              </p>

              <div className="mt-3 flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                <span className="rounded-full bg-muted px-2 py-0.5">#{skill.slug}</span>
                {skill.requirements.env.slice(0, 2).map((envKey) => (
                  <span key={envKey} className="rounded-full bg-muted px-2 py-0.5">
                    {envKey.toLowerCase()}
                  </span>
                ))}
                {skill.requirements.env.length > 2 ? (
                  <span className="rounded-full bg-muted px-2 py-0.5">+{skill.requirements.env.length - 2}</span>
                ) : null}
              </div>

              <div className="mt-4 flex items-center justify-between gap-2">
                <Link href={`/skills/${skill.slug}`}>
                  <Button size="sm" variant="outline">
                    Open
                    <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                  </Button>
                </Link>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditor({ skillSlug: skill.slug, skillName: skill.name, mode: "manual" });
                      setNewSlug(skill.slug);
                      setNewName(skill.name);
                      setNewDescription(skill.description || "");
                      setNewSkillMd(skill.skillMd || "");
                      setShowCreate(true);
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleShareSkill(skill)}
                    disabled={busyKey === `${skill.slug}:share`}
                  >
                    {busyKey === `${skill.slug}:share` ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Share2 className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDeleteSkill(skill.slug)}
                    disabled={busyKey === `${skill.slug}:delete`}
                  >
                    {busyKey === `${skill.slug}:delete` ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {editor ? (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Manual Editing Enabled</CardTitle>
              <p className="text-sm text-muted-foreground">
                {editor.skillName} is loaded in the manual editor.
              </p>
            </CardHeader>
            <CardContent>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditor(null)}>
                  Close
                </Button>
                <Button
                  onClick={() => {
                    setEditor(null);
                    const node = document.querySelector("textarea");
                    if (node instanceof HTMLTextAreaElement) node.focus();
                  }}
                >
                  Continue Editing
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <LearnSkillModal
        open={showLearn}
        onOpenChange={setShowLearn}
        companyId={companyId}
        onSaved={async () => {
          await mutate();
          await mutateCatalog();
        }}
      />
      </>
      )}
    </div>
  );
}
