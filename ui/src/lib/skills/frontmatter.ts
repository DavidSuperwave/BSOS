import type { OpenClawSkillMetadata, ParsedSkillFrontmatter } from "./types";

function safeJsonParse<T>(value: string): T | undefined {
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

function normalizeMetadata(raw: unknown): OpenClawSkillMetadata | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const meta = raw as Record<string, any>;
  const openclaw = meta.openclaw;
  if (!openclaw || typeof openclaw !== "object") return undefined;
  return openclaw as OpenClawSkillMetadata;
}

/**
 * Lightweight frontmatter parser.
 * Keeps compatibility with the AgentSkills/OpenClaw style:
 * - one key per line
 * - optional metadata JSON in `metadata: {...}`
 */
export function parseSkillFrontmatter(content: string): ParsedSkillFrontmatter {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return {};

  const block = match[1];
  const lines = block.split("\n");
  const out: ParsedSkillFrontmatter = {};
  let metadataBuffer: string | null = null;
  const useWhen: string[] = [];
  const dontUseWhen: string[] = [];
  const edgeCases: string[] = [];
  let currentList: "useWhen" | "dontUseWhen" | "edgeCases" | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line === "use_when:" || line === "useWhen:") {
      currentList = "useWhen";
      continue;
    }
    if (line === "dont_use_when:" || line === "dontUseWhen:") {
      currentList = "dontUseWhen";
      continue;
    }
    if (line === "edge_cases:" || line === "edgeCases:") {
      currentList = "edgeCases";
      continue;
    }
    if (currentList && line.startsWith("- ")) {
      const value = line.slice(2).trim();
      if (currentList === "useWhen") useWhen.push(value);
      if (currentList === "dontUseWhen") dontUseWhen.push(value);
      if (currentList === "edgeCases") edgeCases.push(value);
      continue;
    }
    currentList = null;

    if (metadataBuffer !== null) {
      metadataBuffer += line;
      continue;
    }

    const kv = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.+)?$/);
    if (!kv) continue;
    const key = kv[1].trim().toLowerCase();
    const value = (kv[2] ?? "").trim();

    if (key === "name") {
      out.name = value.replace(/^["']|["']$/g, "");
      continue;
    }
    if (key === "description") {
      out.description = value.replace(/^["']|["']$/g, "");
      continue;
    }
    if (key === "emoji") {
      out.emoji = value.replace(/^["']|["']$/g, "");
      continue;
    }
    if (key === "metadata") {
      metadataBuffer = value;
    }
  }

  if (metadataBuffer) {
    const parsed = safeJsonParse<Record<string, any>>(metadataBuffer);
    out.metadata = normalizeMetadata(parsed);
  }

  if (useWhen.length > 0) out.useWhen = useWhen;
  if (dontUseWhen.length > 0) out.dontUseWhen = dontUseWhen;
  if (edgeCases.length > 0) out.edgeCases = edgeCases;

  return out;
}
