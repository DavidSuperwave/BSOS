import { parseSkillFrontmatter } from "./frontmatter";

export interface RoutableSkill {
  slug: string;
  name: string;
  skillMd: string;
}

const KEYWORD_HINTS: Record<string, string[]> = {
  "copy-analyzer": ["copy", "subject", "cta", "hook", "messaging"],
  "reply-miner": ["reply", "replies", "sentiment", "objection", "classify", "classification"],
  "lead-profiler": ["lead", "profile", "profiling", "fit", "scoring"],
  "bounce-diagnostician": ["bounce", "smtp", "deliverability", "diagnose"],
  "deal-miner": ["deal", "win", "loss", "pipeline"],
  "deliverability-assessor": ["deliverability", "domain", "mailbox", "audit"],
  "campaign-monitor": ["anomaly", "monitor", "drift", "hourly"],
  "deliverability-watchdog": ["watchdog", "inbox", "sender", "reputation"],
  "pipeline-tracker": ["pipeline", "stage", "crm", "movement"],
  "icp-validator": ["icp", "segment", "assumption", "validation", "weekly"],
  "intelligence-reporter": ["report", "brief", "eod", "intelligence"],
  "profile-enricher": ["enrich", "enrichment", "company profile", "record update"],
  "campaign-researcher": ["research", "market", "angle", "positioning"],
  "campaign-builder": ["build", "draft", "sequence", "asset"],
  "campaign-launcher": ["launch", "preflight", "go live", "go-live"],
};

function scoreIntent(userIntent: string, positives: string[], negatives: string[]): number {
  const intent = userIntent.toLowerCase();
  const intentTokens = new Set(intent.split(/[^a-z0-9]+/).filter(Boolean));

  const overlapScore = (phrase: string): number => {
    const phraseTokens = phrase
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
    if (!phraseTokens.length) return 0;
    let overlap = 0;
    for (const token of phraseTokens) {
      if (intentTokens.has(token)) overlap += 1;
    }
    return overlap / phraseTokens.length;
  };

  let score = 0;

  for (const phrase of positives) {
    const p = phrase.toLowerCase();
    if (!p) continue;
    if (intent.includes(p)) {
      score += 3;
      continue;
    }

    const ratio = overlapScore(p);
    if (ratio >= 0.35) score += 2 * ratio;
  }
  for (const phrase of negatives) {
    const n = phrase.toLowerCase();
    if (!n) continue;
    if (intent.includes(n)) {
      score -= 3;
      continue;
    }

    const ratio = overlapScore(n);
    if (ratio >= 0.4) score -= 2 * ratio;
  }
  return score;
}

export function selectSkill(userIntent: string, availableSkills: RoutableSkill[]): RoutableSkill | null {
  let best: { skill: RoutableSkill; score: number } | null = null;

  for (const skill of availableSkills) {
    const parsed = parseSkillFrontmatter(skill.skillMd || "");
    const baseScore = scoreIntent(userIntent, parsed.useWhen || [], parsed.dontUseWhen || []);
    const hintScore = (KEYWORD_HINTS[skill.slug] || []).reduce((acc, keyword) => {
      return userIntent.toLowerCase().includes(keyword.toLowerCase()) ? acc + 0.9 : acc;
    }, 0);
    const score = baseScore + hintScore;
    if (!best || score > best.score) {
      best = { skill, score };
    }
  }

  if (best && best.score > 0) return best.skill;

  // Fallback: lexical overlap against slug/name/description/useWhen text.
  const intentTokens = new Set(userIntent.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  const lexicalOverlap = (text: string): number => {
    const tokens = new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
    if (!tokens.size || !intentTokens.size) return 0;
    let overlap = 0;
    intentTokens.forEach((token) => {
      if (tokens.has(token)) overlap += 1;
    });
    return overlap / intentTokens.size;
  };

  let fallback: { skill: RoutableSkill; score: number } | null = null;
  for (const skill of availableSkills) {
    const parsed = parseSkillFrontmatter(skill.skillMd || "");
    const corpus = [
      skill.slug,
      parsed.name || "",
      parsed.description || "",
      ...(parsed.useWhen || []),
      ...(parsed.dontUseWhen || []),
    ].join(" ");
    const score = lexicalOverlap(corpus);
    if (!fallback || score > fallback.score) fallback = { skill, score };
  }

  if (fallback && fallback.score >= 0.2) return fallback.skill;
  return null;
}

