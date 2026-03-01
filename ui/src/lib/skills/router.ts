import { parseSkillFrontmatter } from "./frontmatter";

export interface RoutableSkill {
  slug: string;
  name: string;
  skillMd: string;
}

function scoreIntent(userIntent: string, positives: string[], negatives: string[]): number {
  const intent = userIntent.toLowerCase();
  let score = 0;

  for (const phrase of positives) {
    const p = phrase.toLowerCase();
    if (p && intent.includes(p)) score += 2;
  }
  for (const phrase of negatives) {
    const n = phrase.toLowerCase();
    if (n && intent.includes(n)) score -= 3;
  }
  return score;
}

export function selectSkill(userIntent: string, availableSkills: RoutableSkill[]): RoutableSkill | null {
  let best: { skill: RoutableSkill; score: number } | null = null;

  for (const skill of availableSkills) {
    const parsed = parseSkillFrontmatter(skill.skillMd || "");
    const score = scoreIntent(userIntent, parsed.useWhen || [], parsed.dontUseWhen || []);
    if (!best || score > best.score) {
      best = { skill, score };
    }
  }

  if (!best || best.score <= 0) return null;
  return best.skill;
}

