export const COMPANY_AGENT_TYPES = ["main", "campaigns", "crm", "inbox"] as const;

export type CompanyAgentType = (typeof COMPANY_AGENT_TYPES)[number];

export type SkillInstallKind = "brew" | "node" | "go" | "uv" | "download";

export interface SkillInstallSpec {
  id?: string;
  kind: SkillInstallKind;
  label?: string;
  bins?: string[];
  os?: string[];
  formula?: string;
  package?: string;
  module?: string;
  url?: string;
  archive?: string;
  extract?: boolean;
  stripComponents?: number;
  targetDir?: string;
}

export interface OpenClawSkillMetadata {
  always?: boolean;
  inject?: boolean;
  skillKey?: string;
  primaryEnv?: string;
  emoji?: string;
  homepage?: string;
  os?: string[];
  requires?: {
    bins?: string[];
    anyBins?: string[];
    env?: string[];
    config?: string[];
  };
  install?: SkillInstallSpec[];
}

export interface ParsedSkillFrontmatter {
  name?: string;
  description?: string;
  emoji?: string;
  metadata?: OpenClawSkillMetadata;
  useWhen?: string[];
  dontUseWhen?: string[];
  edgeCases?: string[];
  templates?: Array<{ name: string; template: string }>;
}

export interface SkillInstallOption {
  id: string;
  kind: SkillInstallKind;
  label: string;
  bins: string[];
}

export interface SkillMissing {
  bins: string[];
  env: string[];
  config: string[];
  os: string[];
}

export interface SkillRequirements {
  bins: string[];
  anyBins: string[];
  env: string[];
  config: string[];
  os: string[];
}

export interface SkillInstallResult {
  ok: boolean;
  message: string;
  stdout?: string;
  stderr?: string;
  code?: number | null;
  warnings?: string[];
}
