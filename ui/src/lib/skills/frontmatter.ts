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

function stripQuotes(value: string): string {
  return value.replace(/^["']|["']$/g, "");
}

function parseYamlScalar(raw: string): any {
  const value = stripQuotes((raw ?? "").trim());
  if (!value) return "";
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return value;
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
  const body = content.slice(match[0].length);
  const lines = block.split("\n");
  const out: ParsedSkillFrontmatter = {};
  let metadataBuffer: string | null = null;
  const metadataYaml: Record<string, any> = {};
  let readingMetadataYaml = false;
  const useWhen: string[] = [];
  const dontUseWhen: string[] = [];
  const edgeCases: string[] = [];
  let currentList: "useWhen" | "dontUseWhen" | "edgeCases" | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (readingMetadataYaml) {
      const nestedKv = rawLine.match(/^\s{2,}([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
      if (nestedKv) {
        metadataYaml[nestedKv[1]] = parseYamlScalar(nestedKv[2] ?? "");
        continue;
      }
      if (/^\s+/.test(rawLine)) {
        continue;
      }
      readingMetadataYaml = false;
    }

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
      out.name = stripQuotes(value);
      continue;
    }
    if (key === "description") {
      out.description = stripQuotes(value);
      continue;
    }
    if (key === "emoji") {
      out.emoji = stripQuotes(value);
      continue;
    }
    if (key === "metadata") {
      if (value) {
        metadataBuffer = value;
      } else {
        readingMetadataYaml = true;
      }
    }
  }

  if (metadataBuffer) {
    const parsed = safeJsonParse<Record<string, any>>(metadataBuffer);
    out.metadata = normalizeMetadata(parsed);
  } else if (Object.keys(metadataYaml).length > 0) {
    const normalized = normalizeMetadata({ openclaw: metadataYaml });
    out.metadata = normalized ?? (metadataYaml as OpenClawSkillMetadata);
  }

  // Many skills define routing examples in markdown sections instead of frontmatter lists.
  // Parse these sections as a fallback so routing still works.
  const bodyUseWhen: string[] = [];
  const bodyDontUseWhen: string[] = [];
  const bodyEdgeCases: string[] = [];
  let bodySection: "useWhen" | "dontUseWhen" | "edgeCases" | null = null;

  for (const rawLine of body.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    if (/^##+\s+use when$/i.test(line)) {
      bodySection = "useWhen";
      continue;
    }
    if (/^##+\s+don'?t use when$/i.test(line)) {
      bodySection = "dontUseWhen";
      continue;
    }
    if (/^##+\s+edge cases$/i.test(line)) {
      bodySection = "edgeCases";
      continue;
    }
    if (/^##+\s+/.test(line)) {
      bodySection = null;
      continue;
    }

    if (bodySection && line.startsWith("- ")) {
      const item = line.slice(2).trim();
      if (!item) continue;
      if (bodySection === "useWhen") bodyUseWhen.push(item);
      if (bodySection === "dontUseWhen") bodyDontUseWhen.push(item);
      if (bodySection === "edgeCases") bodyEdgeCases.push(item);
    }
  }

  if (useWhen.length > 0) out.useWhen = useWhen;
  else if (bodyUseWhen.length > 0) out.useWhen = bodyUseWhen;

  if (dontUseWhen.length > 0) out.dontUseWhen = dontUseWhen;
  else if (bodyDontUseWhen.length > 0) out.dontUseWhen = bodyDontUseWhen;

  if (edgeCases.length > 0) out.edgeCases = edgeCases;
  else if (bodyEdgeCases.length > 0) out.edgeCases = bodyEdgeCases;

  return out;
}
