"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { useCompany } from "@/contexts/company-context";
import {
  createCompanySkillShareLink,
  installCompanySkill,
  uninstallCompanySkill,
  updateCompanySkillSettings,
  upsertCompanySkill,
  useChatSessions,
  useCompanySkillShareLinks,
  useSkillsStatus,
} from "@/lib/hooks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, ExternalLink, Save, ArrowLeft, MessageSquare, ChevronDown, ChevronUp, Wrench } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { formatDistanceToNow } from "date-fns";

const AGENT_TYPES = ["main", "campaigns", "crm", "inbox"] as const;
type AgentType = (typeof AGENT_TYPES)[number];

interface AssignmentEditorState {
  agentType: AgentType;
  mode: "apiKey" | "env";
  envKey: string;
}

export default function SkillDetailPage() {
  const params = useParams<{ slug: string }>();
  const slug = String(params?.slug || "");
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id;

  const { data, isLoading, mutate } = useSkillsStatus(companyId);
  const { data: linksData, mutate: mutateLinks } = useCompanySkillShareLinks(companyId, slug);
  const { data: sessionsData } = useChatSessions(companyId, "main");

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [showDocumentation, setShowDocumentation] = useState(true);
  const [installSelection, setInstallSelection] = useState<Record<string, string>>({});
  const [assignmentEditor, setAssignmentEditor] = useState<AssignmentEditorState | null>(null);
  const [assignmentEditorValue, setAssignmentEditorValue] = useState("");
  const [customEnvKey, setCustomEnvKey] = useState("");

  const skill = useMemo(
    () => (data?.skills || []).find((entry) => entry.slug === slug),
    [data?.skills, slug]
  );

  const relatedSessions = useMemo(() => {
    const sessions = sessionsData?.sessions || [];
    if (!slug) return sessions.slice(0, 5);
    return sessions
      .filter((session) => (session.title || "").toLowerCase().includes(slug.toLowerCase()))
      .slice(0, 5);
  }, [sessionsData?.sessions, slug]);

  const chatLink = useMemo(() => {
    const prompt = `Use the ${slug} skill to help me with the current task.`;
    const q = new URLSearchParams({
      actionPrompt: prompt,
      issue: "skill",
      skill: slug,
      agent: "main",
    });
    return `/?${q.toString()}`;
  }, [slug]);

  const authType = useMemo(() => {
    if (!skill) return "None";
    return skill.requirements.env.length > 0 || skill.install.length > 0 ? "API Key" : "None";
  }, [skill]);

  const agentsUsing = useMemo(() => {
    if (!skill) return 0;
    return skill.assignments.filter((entry) => entry.enabled && entry.install.status === "installed").length;
  }, [skill]);

  const usageScope = useMemo(() => {
    if (!skill) return "Limited - 0 agents";
    if (agentsUsing === AGENT_TYPES.length) return "All agents";
    return `Limited - ${agentsUsing} agents`;
  }, [agentsUsing, skill]);

  const startEditing = () => {
    if (!skill) return;
    setEditing(true);
    setName(skill.name || "");
    setDescription(skill.description || "");
    setDraft(skill.skillMd || "");
  };

  const saveEdit = async () => {
    if (!companyId || !skill) return;
    setBusy("save");
    try {
      await upsertCompanySkill(companyId, {
        slug: skill.slug,
        name: name || undefined,
        description: description || undefined,
        skillMd: draft || skill.skillMd || "",
      });
      await mutate();
      setEditing(false);
    } catch (err: any) {
      alert(err?.message || "Failed to save skill");
    } finally {
      setBusy(null);
    }
  };

  const runBusy = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
      await mutate();
      await mutateLinks();
    } catch (err: any) {
      alert(err?.message || "Action failed");
    } finally {
      setBusy(null);
    }
  };

  const byAgentType = (agentType: AgentType) =>
    skill?.assignments.find((entry) => entry.agentType === agentType) || null;

  const handleAssignOrInstall = async (agentType: AgentType) => {
    if (!companyId || !skill) return;
    const installId = installSelection[agentType] || skill.install[0]?.id;
    await runBusy(`${agentType}:install`, async () => {
      await installCompanySkill(companyId, {
        slug: skill.slug,
        agentTypes: [agentType],
        installId: installId || undefined,
      });
    });
  };

  const handleEnableToggle = async (agentType: AgentType, enabled: boolean) => {
    if (!companyId || !skill) return;
    await runBusy(`${agentType}:toggle`, async () => {
      await updateCompanySkillSettings(companyId, {
        slug: skill.slug,
        agentType,
        enabled: !enabled,
      });
    });
  };

  const handleUninstall = async (agentType: AgentType) => {
    if (!companyId || !skill) return;
    await runBusy(`${agentType}:uninstall`, async () => {
      await uninstallCompanySkill(companyId, {
        slug: skill.slug,
        agentTypes: [agentType],
      });
    });
  };

  const saveAssignmentEditor = async () => {
    if (!companyId || !skill || !assignmentEditor || !assignmentEditorValue.trim()) return;

    await runBusy(`${assignmentEditor.agentType}:env`, async () => {
      if (assignmentEditor.mode === "apiKey") {
        await updateCompanySkillSettings(companyId, {
          slug: skill.slug,
          agentType: assignmentEditor.agentType,
          apiKey: assignmentEditorValue,
        });
      } else {
        const envKey = (assignmentEditor.envKey || customEnvKey).trim();
        if (!envKey) throw new Error("Environment key is required");
        await updateCompanySkillSettings(companyId, {
          slug: skill.slug,
          agentType: assignmentEditor.agentType,
          env: { [envKey]: assignmentEditorValue },
        });
      }
    });

    setAssignmentEditor(null);
    setAssignmentEditorValue("");
    setCustomEnvKey("");
  };

  const createShare = async () => {
    if (!companyId || !skill) return;
    setBusy("share");
    try {
      const result = await createCompanySkillShareLink(companyId, {
        slug: skill.slug,
        label: `${skill.name} share`,
        expiresInHours: 24 * 7,
        maxImports: 25,
      });
      const full = result?.link?.import_url
        ? `${window.location.origin}${result.link.import_url}`
        : "";
      if (full) {
        await navigator.clipboard.writeText(full);
        alert("Share link copied.");
      }
      await mutateLinks();
    } catch (err: any) {
      alert(err?.message || "Failed to create share link");
    } finally {
      setBusy(null);
    }
  };

  return (
    <AppShell
      header={{
        title: skill?.name || "Skill Details",
        subtitle: "Skill usage, documentation, and controls",
      }}
    >
      {!companyId ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Select a company to view skill details.
          </CardContent>
        </Card>
      ) : isLoading ? (
        <Card>
          <CardContent className="p-8 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      ) : !skill ? (
        <Card>
          <CardContent className="p-6 space-y-3">
            <p className="text-sm text-muted-foreground">Skill not found for this company.</p>
            <Link href="/skills">
              <Button variant="outline">Back to Skills</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <Link href="/skills" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              Back to Skills
            </Link>
            <Button variant="outline" onClick={startEditing}>Edit Skill</Button>
          </div>

          <Card>
            <CardHeader className="pb-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-xl border border-border bg-muted/30 flex items-center justify-center text-xl">
                      {skill.emoji || "⚙"}
                    </div>
                    <div>
                      <CardTitle className="text-2xl">{skill.name}</CardTitle>
                      <p className="text-sm text-muted-foreground">{skill.description || "No description"}</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Created {formatDistanceToNow(new Date(skill.createdAt), { addSuffix: true })}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Link href={chatLink}>
                    <Button>Try This Skill</Button>
                  </Link>
                  <Button variant="outline" onClick={createShare} disabled={busy === "share"}>
                    {busy === "share" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ExternalLink className="h-4 w-4 mr-2" />}
                    Share
                  </Button>
                </div>
              </div>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base">Recent Threads</CardTitle>
                <Link href={chatLink}>
                  <Button variant="outline" size="sm">+ New Thread</Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {relatedSessions.length === 0 ? (
                <div className="rounded-lg border border-border bg-muted/10 p-10 text-center space-y-2">
                  <MessageSquare className="h-5 w-5 mx-auto text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">No threads yet</p>
                  <p className="text-xs text-muted-foreground">Start a conversation to use this skill</p>
                </div>
              ) : (
                relatedSessions.map((session) => (
                  <div key={session.id} className="rounded-md border border-border p-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{session.title}</p>
                      <p className="text-xs text-muted-foreground">{session.message_count} messages</p>
                    </div>
                    <Link href="/">
                      <Button size="sm" variant="outline">Open</Button>
                    </Link>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Overview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Authentication</span>
                  <Badge variant="outline">{authType}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Global Pin</span>
                  <Badge variant="outline">On-demand</Badge>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Usage</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Availability</span>
                  <Badge variant="outline">{usageScope}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Agents using</span>
                  <Badge variant="outline">{agentsUsing}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Threads</span>
                  <Badge variant="outline">{relatedSessions.length}</Badge>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Documentation</CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowDocumentation((prev) => !prev)}
                >
                  {showDocumentation ? (
                    <>
                      <ChevronUp className="h-4 w-4 mr-1.5" />
                      Collapse
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-4 w-4 mr-1.5" />
                      Expand
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            {showDocumentation ? (
              <CardContent className="space-y-3">
                {editing ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Skill name" />
                      <Input
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Description"
                      />
                    </div>
                    <textarea
                      className="w-full min-h-[280px] rounded-md border border-border bg-background p-3 text-sm font-mono"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                    />
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setEditing(false)}>
                        Cancel
                      </Button>
                      <Button onClick={saveEdit} disabled={busy === "save"}>
                        {busy === "save" ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4 mr-2" />
                        )}
                        Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-md border border-border bg-muted/20 p-3 overflow-auto prose prose-sm max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {skill.skillMd || "No SKILL.md content available."}
                    </ReactMarkdown>
                  </div>
                )}
              </CardContent>
            ) : null}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Agent Assignments</CardTitle>
              <p className="text-sm text-muted-foreground">
                Configure install, enablement, and environment values per agent.
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                {AGENT_TYPES.map((agentType) => {
                  const assignment = byAgentType(agentType);
                  const isBusy =
                    busy?.startsWith(`${agentType}:`) ||
                    false;

                  return (
                    <div key={agentType} className="rounded-lg border border-border bg-card/60 p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium capitalize">{agentType}</p>
                        <Badge variant="outline">{assignment ? assignment.install.status : "not assigned"}</Badge>
                      </div>
                      {skill.install.length > 0 ? (
                        <div className="mt-2">
                          <select
                            value={installSelection[agentType] || skill.install[0]?.id || ""}
                            onChange={(event) =>
                              setInstallSelection((prev) => ({ ...prev, [agentType]: event.target.value }))
                            }
                            className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
                          >
                            {skill.install.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : null}
                      {assignment ? (
                        <div className="mt-2 space-y-2">
                          <p className="text-xs text-muted-foreground">{assignment.install.message || "No status message"}</p>
                          {assignment.missing.env.length > 0 ? (
                            <p className="text-xs text-amber-500">Missing env: {assignment.missing.env.join(", ")}</p>
                          ) : null}
                          {assignment.missing.bins.length > 0 ? (
                            <p className="text-xs text-amber-500">Missing bins: {assignment.missing.bins.join(", ")}</p>
                          ) : null}
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEnableToggle(agentType, assignment.enabled)}
                              disabled={Boolean(isBusy)}
                            >
                              {assignment.enabled ? "Disable" : "Enable"}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleAssignOrInstall(agentType)}
                              disabled={Boolean(isBusy)}
                            >
                              <Wrench className="h-3 w-3 mr-1" />
                              Install
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleUninstall(agentType)}
                              disabled={Boolean(isBusy)}
                            >
                              Uninstall
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setAssignmentEditor({
                                  agentType,
                                  mode: "apiKey",
                                  envKey: "",
                                });
                                setAssignmentEditorValue("");
                              }}
                              disabled={Boolean(isBusy)}
                            >
                              API Key
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setAssignmentEditor({
                                  agentType,
                                  mode: "env",
                                  envKey: assignment.missing.env[0] || "",
                                });
                                setAssignmentEditorValue("");
                                setCustomEnvKey("");
                              }}
                              disabled={Boolean(isBusy)}
                            >
                              Env
                            </Button>
                          </div>
                          {isBusy ? (
                            <p className="text-xs text-muted-foreground flex items-center">
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                              Applying...
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <div className="mt-2 space-y-2">
                          <p className="text-xs text-muted-foreground">Not assigned to this agent.</p>
                          <Button size="sm" onClick={() => handleAssignOrInstall(agentType)} disabled={Boolean(isBusy)}>
                            {isBusy ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
                            Assign
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 text-xs text-muted-foreground">
                Share links: {(linksData?.links || []).length}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {assignmentEditor ? (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <Card className="w-full max-w-lg">
            <CardHeader>
              <CardTitle>{assignmentEditor.mode === "apiKey" ? "Set API Key" : "Set Environment Variable"}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {skill?.name} · {assignmentEditor.agentType}
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {assignmentEditor.mode === "env" ? (
                <Input
                  placeholder="ENV key"
                  value={assignmentEditor.envKey || customEnvKey}
                  onChange={(event) => {
                    if (assignmentEditor.envKey) {
                      setAssignmentEditor((prev) => (prev ? { ...prev, envKey: event.target.value } : prev));
                    } else {
                      setCustomEnvKey(event.target.value);
                    }
                  }}
                />
              ) : null}
              <Input
                placeholder={assignmentEditor.mode === "apiKey" ? "API key" : "ENV value"}
                value={assignmentEditorValue}
                onChange={(event) => setAssignmentEditorValue(event.target.value)}
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setAssignmentEditor(null);
                    setAssignmentEditorValue("");
                    setCustomEnvKey("");
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={saveAssignmentEditor} disabled={busy !== null}>
                  {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Save
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </AppShell>
  );
}
