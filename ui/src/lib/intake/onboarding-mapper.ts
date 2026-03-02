/**
 * BSOS Onboarding Mapper — Contract-Safe Adapter
 *
 * Translates the lean 5-step onboarding form into the full
 * OnboardingFormData interface that the intake pipeline expects.
 *
 * RULE: If you add/rename/remove a form field, update LeanFormPayload
 * and the mapper below.  The pipeline never changes.
 *
 * CHANGELOG:
 * v2 — Added CustomerFitEntry (best/poor-fit), avg_clv, avg_cac,
 *       brand_guidelines_notes. Step 0 gets unit economics,
 *       Step 1 gets customer fit, Step 3 gets brand guidelines prompt.
 */

// ─── Lean Form Payload (what the form actually produces) ──────────

export interface CompetitorEntry {
  name: string;
  url?: string;
}

export interface CustomerFitEntry {
  company_name: string;
  size?: string;      // e.g. "50 employees", "Series B", "$5M ARR"
  industry?: string;
  reason: string;     // why great fit / why poor fit
}

export interface LeanFormPayload {
  // Step 0: Company & Product
  company_name: string;
  slug: string;
  domain: string;
  website?: string;
  industry: string;
  core_product: string;        // "Describe your core product/service in 2-3 sentences"
  problem_solved: string;      // "What specific problem does your product/service solve?"
  deal_size?: string;          // "Typical price point or deal size"
  sales_cycle?: string;        // "Average sales cycle length"
  avg_clv?: string;            // "What is your average customer lifetime value?"
  avg_cac?: string;            // "What is your approximate customer acquisition cost?"

  // Step 1: ICP, Market & Positioning
  icp_titles: string[];
  icp_company_size: string;
  icp_verticals: string[];
  icp_geo: string[];
  pain_points: string[];
  usp: string;                 // "What makes you different from competitors?"
  competitors: CompetitorEntry[];  // name + optional URL
  objections: string[];        // "What objections do prospects most commonly raise?"
  competitor_notes?: string;   // "Competitor strategies you admire or want to avoid"
  best_fit_customers?: CustomerFitEntry[];  // 3 best-fit customers
  poor_fit_customers?: CustomerFitEntry[];  // 1-2 poor-fit customers

  // Step 2: Integrations (per-company credentials)
  plusvibe_api_key?: string;
  plusvibe_workspace_id?: string;
  calendly_api_key?: string;
  close_api_key?: string;
  telegram_token?: string;
  telegram_chat_id?: string;

  // Step 3: Uploads
  _uploaded_files?: any[];     // case studies, playbooks, brand guides, etc.
  _uploaded_file_count?: number;
  brand_guidelines_notes?: string;  // optional text if no file: "describe your brand voice"
}

// ─── Seniority inference helpers ──────────────────────────────────

const C_LEVEL_PATTERNS = /^(ceo|cto|cfo|coo|cmo|cro|ciso|chief|founder|co-founder|owner|partner)/i;
const VP_PATTERNS = /^(vp|vice president|svp|evp)/i;
const DIRECTOR_PATTERNS = /^(director|head of|sr\.?\s*director)/i;

function inferSeniority(title: string): "C-Level" | "VP" | "Director" | "Manager" | "IC" {
  const t = title.trim();
  if (C_LEVEL_PATTERNS.test(t)) return "C-Level";
  if (VP_PATTERNS.test(t)) return "VP";
  if (DIRECTOR_PATTERNS.test(t)) return "Director";
  if (/manager|lead|team lead/i.test(t)) return "Manager";
  return "IC";
}

function isDecisionMaker(title: string): boolean {
  const seniority = inferSeniority(title);
  return seniority === "C-Level" || seniority === "VP";
}

// ─── Main mapper ──────────────────────────────────────────────────

/**
 * Map the lean form payload to the full OnboardingFormData contract
 * that the intake pipeline, profile-builder, and agent-provisioning expect.
 *
 * Safe to call with partial data — every field has a fallback.
 */
export function mapFormToContract(form: Partial<LeanFormPayload>): Record<string, any> {
  const competitorNames = (form.competitors || []).map((c) =>
    typeof c === "string" ? c : c.name
  );

  const competitorsWithUrls = (form.competitors || []).map((c) =>
    typeof c === "string" ? { name: c } : c
  );

  // ── Normalize customer fit entries ──
  const bestFit = (form.best_fit_customers || []).map(normalizeCustomerFit);
  const poorFit = (form.poor_fit_customers || []).map(normalizeCustomerFit);

  // Derive brand voice from brand guidelines notes if present
  const brandVoice = inferBrandVoice(form.brand_guidelines_notes);

  return {
    // ── Identity (consumed by agent-provisioning.ts, deploy-agent) ──
    company_name: form.company_name || "",
    slug: form.slug || "",
    domain: form.domain || "",
    website: form.website || form.domain || "",
    industry: form.industry || "",

    // core_product → product_description (agent workspace AGENTS.md)
    product_description: form.core_product || "",

    // problem_solved → value_proposition (agent workspace + Supermemory)
    value_proposition: form.problem_solved || form.core_product || "",

    // New fields passed through for the company intelligence doc
    core_product: form.core_product || "",
    problem_solved: form.problem_solved || "",
    deal_size: form.deal_size || "",
    sales_cycle: form.sales_cycle || "",
    usp: form.usp || "",
    competitor_notes: form.competitor_notes || "",

    // ── Unit Economics (consumed by company intelligence doc, admin dashboard) ──
    avg_clv: form.avg_clv || "",
    avg_cac: form.avg_cac || "",

    // ── Customer Fit Profiles (consumed by agent SOUL.md, HCE scoring, Supermemory) ──
    best_fit_customers: bestFit,
    poor_fit_customers: poorFit,

    // ── Brand (consumed by agent-provisioning tone, document-analyzer classification) ──
    brand_guidelines_notes: form.brand_guidelines_notes || "",

    // ── ICP (consumed by deploy-agent, Supermemory seed, HCE) ──
    icp_titles: form.icp_titles || [],
    icp_company_size: form.icp_company_size || "",
    icp_verticals: form.icp_verticals || [],
    icp_geo: form.icp_geo || [],
    pain_points: form.pain_points || [],
    objections: form.objections || [],
    competitors: competitorNames,
    competitors_detailed: competitorsWithUrls,

    // ── Credentials (consumed by deploy-agent, cron-runner) ──
    plusvibe_api_key: form.plusvibe_api_key || "",
    plusvibe_workspace_id: form.plusvibe_workspace_id || "",
    calendly_api_key: form.calendly_api_key || "",
    close_api_key: form.close_api_key || "",
    telegram_token: form.telegram_token || "",
    telegram_chat_id: form.telegram_chat_id || "",

    // ── Defaults for fields the form no longer collects ──
    // (consumed by profile-builder.ts OnboardingFormData interface)
    tone: brandVoice,
    campaign_goals: "",
    differentiators: form.usp ? [form.usp] : [],

    // profile-builder structured fields
    service_tier: "Engine" as const,
    primary_service: form.core_product?.split(".")[0]?.trim() || "Outbound Services",
    secondary_services: [],
    company_size: form.icp_company_size || "11-50",
    annual_revenue: "",
    linkedin_url: "",
    target_industries: form.icp_verticals || [],
    target_personas: (form.icp_titles || []).map((title) => ({
      title,
      seniority: inferSeniority(title),
      pain_points: form.pain_points || [],
      decision_maker: isDecisionMaker(title),
    })),
    current_outbound_status: form.plusvibe_api_key ? "in-house" : "none",
    current_tools: [
      form.plusvibe_api_key ? "PlusVibe" : null,
      form.close_api_key ? "Close CRM" : null,
      form.calendly_api_key ? "Calendly" : null,
    ].filter(Boolean),
    current_challenges: form.pain_points || [],
    has_crm: !!form.close_api_key,
    crm_type: form.close_api_key ? "close" : undefined,
    has_calendly: !!form.calendly_api_key,
    has_existing_data: !!form.plusvibe_api_key,
    brand_voice: brandVoice,
    known_competitors: competitorNames,
    differentiated_angles: form.usp ? [form.usp] : [],
    existing_content: [],
    primary_goal: "Book qualified meetings",
    monthly_meeting_target: undefined,
    timeline: "immediate" as const,

    // ── Uploads (pass-through) ──
    _uploaded_files: form._uploaded_files || [],
    _uploaded_file_count: form._uploaded_file_count || 0,
  };
}

// ─── Customer fit normalizer ─────────────────────────────────────

function normalizeCustomerFit(entry: CustomerFitEntry | string): CustomerFitEntry {
  if (typeof entry === "string") {
    return { company_name: entry, reason: "" };
  }
  return {
    company_name: entry.company_name || "",
    size: entry.size || undefined,
    industry: entry.industry || undefined,
    reason: entry.reason || "",
  };
}

// ─── Brand voice inference ───────────────────────────────────────

/**
 * If the user provided brand guidelines notes, try to infer a voice.
 * Falls back to "professional" — Julian will learn the real voice
 * from uploaded brand guide files via document-analyzer.
 */
function inferBrandVoice(
  notes?: string
): "professional" | "casual" | "technical" | "playful" {
  if (!notes) return "professional";
  const n = notes.toLowerCase();
  if (/casual|friendly|warm|conversational/i.test(n)) return "casual";
  if (/technical|engineering|developer|precise/i.test(n)) return "technical";
  if (/playful|fun|witty|humor/i.test(n)) return "playful";
  return "professional";
}

/**
 * Merge new form data with existing onboarding_data without clobbering.
 * Use when a company re-runs onboarding or updates specific fields.
 */
export function mergeFormWithExisting(
  existing: Record<string, any>,
  newForm: Partial<LeanFormPayload>
): Record<string, any> {
  const mapped = mapFormToContract(newForm);

  // Merge customer fit arrays — append new entries, dedupe by company_name
  const mergedBestFit = dedupeCustomerFit([
    ...(existing.best_fit_customers || []),
    ...(mapped.best_fit_customers || []),
  ]);
  const mergedPoorFit = dedupeCustomerFit([
    ...(existing.poor_fit_customers || []),
    ...(mapped.poor_fit_customers || []),
  ]);

  return {
    ...existing,
    ...mapped,
    best_fit_customers: mergedBestFit,
    poor_fit_customers: mergedPoorFit,
    // Keep existing intake results if present
    intake_completed_at: existing.intake_completed_at,
    intake_result: existing.intake_result,
  };
}

function dedupeCustomerFit(entries: CustomerFitEntry[]): CustomerFitEntry[] {
  const seen = new Set<string>();
  return entries.filter((e) => {
    const key = (e.company_name || "").toLowerCase().trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default mapFormToContract;
