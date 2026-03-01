import { normalizeSkillSlug } from "./common";
import { parseSkillFrontmatter } from "./frontmatter";
import type { OpenClawSkillMetadata, SkillInstallSpec } from "./types";

export interface SkillValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  slug: string;
  name: string;
  description: string;
  version: string;
  skillMd: string;
  metadata: { openclaw: OpenClawSkillMetadata };
  routing?: {
    useWhen: string[];
    dontUseWhen: string[];
    edgeCases: string[];
  };
}

function validateInstallSpec(spec: SkillInstallSpec, errors: string[]) {
  if (!spec?.kind) {
    errors.push("install item is missing kind");
    return;
  }

  if (spec.kind === "node") {
    if (!spec.package) {
      errors.push("node install item requires package");
    } else if (!/^[A-Za-z0-9@/_\-.]+$/.test(spec.package)) {
      errors.push(`node package contains unsupported characters: ${spec.package}`);
    }
    return;
  }

  if (spec.kind === "download") {
    if (!spec.url) {
      errors.push("download install item requires url");
    } else if (!/^https?:\/\//i.test(spec.url)) {
      errors.push(`download url must be http/https: ${spec.url}`);
    }
    return;
  }

  if (spec.kind === "brew" || spec.kind === "go" || spec.kind === "uv") {
    // accepted but not currently executed by runtime installer
    return;
  }

  errors.push(`unsupported install kind: ${spec.kind}`);
}

function ensureFrontmatter(content: string, name: string, description: string): string {
  if (/^---\s*\n[\s\S]*?\n---/.test(content)) return content;
  const safeName = name || "custom-skill";
  const safeDescription = description || "Custom skill";
  return `---\nname: ${safeName}\ndescription: ${safeDescription}\nmetadata: {"openclaw":{"requires":{"env":[],"bins":[],"config":[]}}}\n---\n\n${content.trim()}\n`;
}

function stripControlChars(input: string): string {
  return input.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

export function validateAndNormalizeSkill(input: {
  skillMd: string;
  slug?: string;
  name?: string;
  description?: string;
  version?: string;
  metadata?: Record<string, any>;
}): SkillValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  let rawSkillMd = String(input.skillMd || "").trim();
  if (!rawSkillMd) {
    errors.push("skillMd is required");
    rawSkillMd = "# Empty skill";
  }

  rawSkillMd = stripControlChars(rawSkillMd);
  const hintedName = String(input.name || "").trim();
  const hintedDescription = String(input.description || "").trim();
  rawSkillMd = ensureFrontmatter(rawSkillMd, hintedName, hintedDescription);

  const parsed = parseSkillFrontmatter(rawSkillMd);
  const slug = normalizeSkillSlug(String(input.slug || parsed.name || hintedName || ""));
  if (!slug) {
    errors.push("Could not determine skill slug from input/frontmatter");
  }

  const name = String(input.name || parsed.name || slug || "skill").trim();
  const description = String(input.description || parsed.description || "").trim();
  const version = String(input.version || "1.0.0").trim();
  const openclawMeta: OpenClawSkillMetadata =
    (input.metadata?.openclaw as OpenClawSkillMetadata | undefined) ||
    parsed.metadata ||
    {};

  const useWhen = parsed.useWhen || [];
  const dontUseWhen = parsed.dontUseWhen || [];
  const edgeCases = parsed.edgeCases || [];

  if (openclawMeta.install && Array.isArray(openclawMeta.install)) {
    for (const spec of openclawMeta.install) {
      validateInstallSpec(spec, errors);
    }
  }

  if (!/^#|^\s*-\s+/m.test(rawSkillMd)) {
    warnings.push("Skill body looks sparse; include clear markdown instructions.");
  }

  if (name.length < 3) {
    warnings.push("Skill name is very short.");
  }

  if (description.length === 0) {
    warnings.push("Skill description is empty.");
  }

  if (useWhen.length === 0) {
    warnings.push("Missing `use_when` routing examples in frontmatter.");
  }

  if (dontUseWhen.length === 0) {
    warnings.push("Missing `dont_use_when` routing guardrails in frontmatter.");
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    slug,
    name,
    description,
    version,
    skillMd: rawSkillMd,
    metadata: { openclaw: openclawMeta },
    routing: {
      useWhen,
      dontUseWhen,
      edgeCases,
    },
  };
}
