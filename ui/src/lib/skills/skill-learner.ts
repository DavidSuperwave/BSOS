import { normalizeSkillSlug } from "./common";

export type SkillLearnSourceType = "research" | "url" | "paste_docs";
export type SkillLearnMode = "quick" | "interactive";

export interface SkillLearnProgressEntry {
  ts: string;
  level: "info" | "warn" | "error";
  message: string;
}

function nowIso() {
  return new Date().toISOString();
}

export function isSafePublicUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!/^https?:$/i.test(parsed.protocol)) return false;
    const host = parsed.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host.endsWith(".localhost") ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host.startsWith("10.") ||
      host.startsWith("192.168.") ||
      host.startsWith("169.254.") ||
      /^127\./.test(host)
    ) {
      return false;
    }
    // Check RFC 1918 172.16.0.0/12 range (172.16.x.x – 172.31.x.x)
    const match172 = host.match(/^172\.(\d+)\./);
    if (match172) {
      const second = parseInt(match172[1], 10);
      if (second >= 16 && second <= 31) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function guessNameFromTopic(topic: string) {
  const compact = topic
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^A-Za-z0-9 ]+/g, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 5)
    .join(" ");
  return compact || "Custom Skill";
}

function buildSkillMarkdown(input: {
  name: string;
  description: string;
  topic: string;
  sourceType: SkillLearnSourceType;
  sourceUrl?: string;
  sourceExcerpt?: string;
  mode: SkillLearnMode;
}) {
  const slug = normalizeSkillSlug(input.name) || "custom-skill";
  const metadata = {
    openclaw: {
      requires: { env: [], bins: [], config: [] },
      install: [],
    },
  };

  const sourceBlock = input.sourceUrl
    ? `\n- Source URL: ${input.sourceUrl}`
    : "";
  const excerpt = input.sourceExcerpt
    ? `\n## Source Excerpt\n${input.sourceExcerpt.slice(0, 1200)}\n`
    : "";

  return `---
name: ${slug}
description: ${input.description}
metadata: ${JSON.stringify(metadata)}
---

# ${input.name}

## Purpose
${input.description}

## Usage
- Use this skill when working on: ${input.topic}
- Ask clarifying questions when required credentials or context are missing.
- Prefer concise, actionable outputs.

## Workflow
1. Understand the user's objective.
2. Identify required inputs, credentials, and constraints.
3. Execute the task with clear intermediate summaries.
4. Return output plus recommended next steps.

## Safety Notes
- Do not expose secrets in responses.
- If external calls are needed, confirm valid auth setup first.

## Provenance
- Generated via ${input.sourceType} (${input.mode} mode)${sourceBlock}
${excerpt}
`;
}

async function fetchSourceUrl(sourceUrl: string): Promise<string> {
  const res = await fetch(sourceUrl, {
    headers: {
      "User-Agent": "Blitzscale-Skills-Learner/1.0",
      Accept: "text/html, text/plain, application/json;q=0.9, */*;q=0.1",
    },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch URL (${res.status})`);
  }
  const text = await res.text();
  return text.slice(0, 30000);
}

export async function startSkillLearningSession(params: {
  admin: any;
  companyId: string;
  createdBy?: string | null;
  sourceType: SkillLearnSourceType;
  learnMode: SkillLearnMode;
  query?: string;
  sourceUrl?: string;
  sourceContent?: string;
}) {
  const { data, error } = await params.admin
    .from("company_skill_learning_sessions")
    .insert({
      company_id: params.companyId,
      created_by: params.createdBy || null,
      source_type: params.sourceType,
      learn_mode: params.learnMode,
      status: "queued",
      query: params.query || null,
      source_url: params.sourceUrl || null,
      source_content: params.sourceContent || null,
      progress: [],
      started_at: nowIso(),
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function appendLearningProgress(params: {
  admin: any;
  sessionId: string;
  entry: SkillLearnProgressEntry;
  status?: string;
}) {
  const { data: current, error: readErr } = await params.admin
    .from("company_skill_learning_sessions")
    .select("progress")
    .eq("id", params.sessionId)
    .single();
  if (readErr) throw new Error(readErr.message);

  const progress = Array.isArray(current?.progress) ? current.progress : [];
  progress.push(params.entry);

  const payload: Record<string, any> = { progress };
  if (params.status) payload.status = params.status;

  const { error } = await params.admin
    .from("company_skill_learning_sessions")
    .update(payload)
    .eq("id", params.sessionId);
  if (error) throw new Error(error.message);
}

export async function markLearningSessionCompleted(params: {
  admin: any;
  sessionId: string;
  skillSlug: string;
  draftSkillMd: string;
  draftMetadata?: Record<string, any>;
}) {
  const { error } = await params.admin
    .from("company_skill_learning_sessions")
    .update({
      status: "completed",
      output_skill_slug: params.skillSlug,
      draft_skill_md: params.draftSkillMd,
      draft_metadata: params.draftMetadata || {},
      completed_at: nowIso(),
    })
    .eq("id", params.sessionId);
  if (error) throw new Error(error.message);
}

export async function markLearningSessionError(params: {
  admin: any;
  sessionId: string;
  message: string;
}) {
  const { error } = await params.admin
    .from("company_skill_learning_sessions")
    .update({
      status: "error",
      error_message: params.message,
      completed_at: nowIso(),
    })
    .eq("id", params.sessionId);
  if (error) throw new Error(error.message);
}

export async function buildDraftSkillFromLearningInput(params: {
  sourceType: SkillLearnSourceType;
  mode: SkillLearnMode;
  topic?: string;
  sourceUrl?: string;
  sourceContent?: string;
}) {
  const progress: SkillLearnProgressEntry[] = [];
  const topic = String(params.topic || "").trim() || "custom API workflow";

  progress.push({
    ts: nowIso(),
    level: "info",
    message: "Research started - analyzing skill intent",
  });

  let sourceExcerpt = "";
  if (params.sourceType === "url" || params.sourceType === "research") {
    if (params.sourceUrl) {
      if (!isSafePublicUrl(params.sourceUrl)) {
        throw new Error("Only public http/https URLs are allowed.");
      }
      progress.push({
        ts: nowIso(),
        level: "info",
        message: `Fetching source URL: ${params.sourceUrl}`,
      });
      sourceExcerpt = await fetchSourceUrl(params.sourceUrl);
    }
  }

  if (!sourceExcerpt && params.sourceContent) {
    sourceExcerpt = params.sourceContent.slice(0, 30000);
  }

  const name = guessNameFromTopic(topic);
  const description = `Generated skill for ${topic}`;
  const skillMd = buildSkillMarkdown({
    name,
    description,
    topic,
    sourceType: params.sourceType,
    sourceUrl: params.sourceUrl,
    sourceExcerpt,
    mode: params.mode,
  });

  progress.push({
    ts: nowIso(),
    level: "info",
    message: "Drafted SKILL.md scaffold",
  });

  return {
    skillMd,
    name,
    description,
    slugHint: normalizeSkillSlug(name),
    progress,
  };
}
