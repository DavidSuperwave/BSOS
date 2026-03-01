import type { CompanyAgentType } from "./types";

export function normalizeSkillSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function legacySkillFileName(slug: string): string {
  return `SKILL_${slug.toUpperCase().replace(/[^A-Z0-9]/g, "_")}.md`;
}

export function workspaceSkillFilePath(slug: string): string {
  const safe = normalizeSkillSlug(slug);
  if (!safe) throw new Error("Invalid skill slug");
  return `skills/${safe}/SKILL.md`;
}

export function sanitizeAgentType(agentType: string): CompanyAgentType | null {
  if (
    agentType === "main" ||
    agentType === "campaigns" ||
    agentType === "crm" ||
    agentType === "inbox"
  ) {
    return agentType;
  }
  return null;
}

export function readTruthyPath(obj: Record<string, any> | null | undefined, path: string): boolean {
  if (!obj || !path) return false;
  const parts = path.split(".").filter(Boolean);
  let current: any = obj;
  for (const part of parts) {
    if (!current || typeof current !== "object") return false;
    current = current[part];
  }
  return Boolean(current);
}
