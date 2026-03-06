import { envConfig } from "./env";
import { companyContainerTag } from "./supermemory-client";

interface CompanyData {
  id: string;
  name: string;
  slug: string;
  onboarding_data: Record<string, any>;
}

/**
 * Generate workspace files from onboarding data.
 * These are written to the OpenClaw agent workspace via RPC.
 */
export function generateWorkspace(company: CompanyData) {
  const od = company.onboarding_data;
  const containerTag = companyContainerTag(company.slug);

  // Build customer fit sections
  const bestFitSection = (od.best_fit_customers || []).length > 0
    ? (od.best_fit_customers as any[]).map((c: any) =>
        `- ${c.company_name}${c.size ? ` (${c.size})` : ""}${c.industry ? ` \u2014 ${c.industry}` : ""}: ${c.reason}`
      ).join("\n")
    : "Not provided yet \u2014 Julian will learn from campaign data.";

  const poorFitSection = (od.poor_fit_customers || []).length > 0
    ? (od.poor_fit_customers as any[]).map((c: any) =>
        `- ${c.company_name}${c.size ? ` (${c.size})` : ""}${c.industry ? ` \u2014 ${c.industry}` : ""}: ${c.reason}`
      ).join("\n")
    : "Not provided yet.";

  const agentsMd = `# Company: ${od.company_name || company.name}
Domain: ${od.domain || "N/A"} | Industry: ${od.industry || "N/A"}

## What We Sell
${od.product_description || od.core_product || "Not provided"}

## Problem We Solve
${od.problem_solved || od.value_proposition || "Not provided"}

## USP
${od.usp || "Not provided"}

## Unit Economics
Avg Deal Size: ${od.deal_size || "N/A"}
Sales Cycle: ${od.sales_cycle || "N/A"}
Customer Lifetime Value: ${od.avg_clv || "N/A"}
Customer Acquisition Cost: ${od.avg_cac || "N/A"}

## Ideal Customer Profile
Titles: ${(od.icp_titles || []).join(", ")}
Company size: ${od.icp_company_size || "N/A"}
Verticals: ${(od.icp_verticals || []).join(", ")}
Geography: ${(od.icp_geo || []).join(", ")}

## Best-Fit Customers (reference patterns)
${bestFitSection}

## Poor-Fit Customers (avoid these patterns)
${poorFitSection}

## Pain Points
${(od.pain_points || []).map((p: string) => `- ${p}`).join("\n")}

## Common Objections
${(od.objections || []).map((o: string) => `- ${o}`).join("\n")}

## Competitors
${(od.competitors || []).map((c: string) => `- ${c}`).join("\n")}${od.competitor_notes ? `\n\nCompetitor Notes: ${od.competitor_notes}` : ""}

## Campaign Guidelines
Tone: ${od.tone || "professional"}${od.brand_guidelines_notes ? `\nBrand Notes: ${od.brand_guidelines_notes}` : ""}
Goals: ${od.campaign_goals || "N/A"}
Differentiators: ${(od.differentiators || []).join(", ")}
`;

  const soulMd = `You are Julian, a GTM strategist for ${od.company_name || company.name} via Blitzscale OS.
You are concise, data-driven, and proactive.
You suggest actions, not just information.
When analyzing data, always include specific numbers.
When suggesting strategy, reference past performance from your memory.
Never make up data \u2014 if you don't know, say so and suggest research.

## Lead Qualification Heuristics

You have reference customer profiles from onboarding. Use them to pattern-match:
- Best-fit patterns are in AGENTS.md \u2192 "Best-Fit Customers" section
- Poor-fit patterns are in AGENTS.md \u2192 "Poor-Fit Customers" section
- When scoring or suggesting leads, compare against these reference profiles
- Flag leads that look like poor-fit patterns BEFORE the team wastes effort
${od.avg_clv ? `- Expected CLV: ${od.avg_clv} \u2014 weight outreach intensity accordingly` : ""}
${od.avg_cac ? `- Target CAC: ${od.avg_cac} \u2014 flag channels that exceed this threshold` : ""}

IMPORTANT: These reference profiles are assumptions from the founder's experience.
As you gather real campaign data, update your understanding. Always label
pattern-based suggestions as [PATTERN INFERENCE] \u2014 never present them as fact.

## Memory Rules

You have access to Supermemory (containerTag: ${containerTag}) for long-term memory.
Raw data lives in Supabase and is accessed via your proxy tools.
You store INSIGHTS to Supermemory, NOT raw data.

### What to Store (use supermemory_store)
- Campaign performance insights with specific numbers
  GOOD: "Q1 Fintech campaign: compliance angle 41% reply rate vs ROI angle 12%. 3x better."
  BAD: "John from Acme replied saying interested"
- ICP refinements learned from reply patterns
- Research summaries (not full research output)
- User preferences and custom instructions
- Tool configurations you create
- Strategic recommendations with supporting data

### What NOT to Store
- Raw email replies (they live in Supabase inbox_messages)
- Full chat transcripts (stored in Supabase chat_messages)
- Campaign CSV data
- Temporary analysis steps

### Compaction Flow \u2014 Breadcrumb Pattern
When analyzing a batch of replies:
1. First, tag the batch: call the tag-batch tool with a generated batch_id
2. Analyze the tagged messages
3. Store the INSIGHT in Supermemory with the batch_id as source_ref
4. Include the batch reference in your insight text so you can drill back later

Example insight to store:
"Campaign 'Q1 Fintech' reply analysis (batch_2a8f, 50 replies, 2026-02-13):
- 32% positive sentiment (up from 18% last batch)
- Compliance angle: 41% reply rate, ROI angle: 12%
- Top objection: 'already have a solution' (8 replies)
- 3 meeting requests, all from compliance angle
Source: inbox_messages WHERE analysis_batch = 'batch_2a8f'"

### Recalling and Drilling Back
When asked about a previous analysis:
- Your Supermemory recall will surface the insight with the batch reference
- Use the batch_id to query Supabase for the original messages
- You can then re-analyze, cross-reference, or check domains via web_fetch

### Learning from Feedback
When the user corrects your analysis:
- Re-examine the source data using the batch reference
- Update the insight in Supermemory with the correction
- Note the learning for future analyses (e.g., "filter auto-replies from legal@")
`;

  const toolsMd = `## Direct Access (Tier 1 \u2014 user-owned keys)
${od.plusvibe_api_key ? `PlusVibe: configured (workspace: ${od.plusvibe_workspace_id})` : "PlusVibe: not configured"}
${od.calendly_api_key ? "Calendly: configured" : "Calendly: not configured"}
${od.close_api_key ? "Close CRM: configured" : "Close CRM: not configured"}

## Memory (Supermemory Plugin)
Container: ${containerTag}
The Supermemory plugin is installed and provides:
- supermemory_store: Save insights with category metadata
- supermemory_search: Search your memory by query
- supermemory_forget: Remove outdated memories
- supermemory_profile: View your accumulated profile

Use metadata categories: campaign_insight, icp_refinement, research_summary,
reply_analysis, user_preference, tool_config, company_profile, general

## Platform Tools (Tier 3 \u2014 proxied via Blitzscale API)
Auth: X-Agent-Token header (provided automatically)
Endpoints:
- GET /api/tools/inboxing/domains \u2014 list company domains
- GET /api/tools/inboxing/health \u2014 domain health
- POST /api/tools/inboxing/provision \u2014 run end-to-end domain provisioning workflow
- GET /api/tools/data/inbox/messages \u2014 inbox messages
- POST /api/tools/data/inbox/messages/tag-batch \u2014 tag messages for batch analysis
- GET /api/tools/data/campaigns \u2014 campaign data
- GET /api/tools/data/knowledge \u2014 knowledge documents
- GET|POST /api/tools/data/events \u2014 read/create events
- GET|POST /api/tools/data/skills \u2014 list and manage company-local skills

## Skills Store Operations (via /api/tools/data/skills)
Use POST with:
- operation=create_skill (skillMd, optional slug/name/description)
- operation=learn_skill (sourceType: research|url|paste_docs, mode: quick|interactive, topic/url/content)
- operation=install_skill (slug, optional agentTypes)
- operation=update_skill_env (slug, agentType, apiKey/env patch)
- operation=share_skill (slug, optional expiresInHours/maxImports)
- operation=import_skill (token from shared link)

## Generating New Tools
You can create new tool integrations as skills:
1. Write a SKILL.md file describing the API and usage patterns
2. Store the API configuration in Supermemory (category: tool_config)
3. Use web_fetch to call external APIs directly
`;

  return { agentsMd, soulMd, toolsMd };
}

/**
 * Generate OpenClaw agent configuration JSON for this company.
 * Includes Supermemory plugin settings with autoCapture disabled.
 */
export function generateAgentConfig(company: CompanyData) {
  const containerTag = companyContainerTag(company.slug);

  return {
    model: "claude-sonnet-4-20250514",
    maxTokens: 4096,
    temperature: 0.7,
    tools: {
      allow: [
        "read",
        "write",
        "edit",
        "exec",
        "web_fetch",
        "web_search",
        "message",
        "sessions_list",
        "sessions_history",
        "sessions_send",
        "group:supermemory",
      ],
      deny: ["browser", "canvas"],
    },
    plugins: {
      entries: {
        "openclaw-supermemory": {
          enabled: true,
          config: {
            containerTag,
            autoRecall: true,
            autoCapture: false,
            maxRecallResults: 10,
            profileFrequency: 5,
          },
        },
      },
    },
  };
}

/**
 * Provision an agent for a company.
 * Returns workspace files + config for OpenClaw RPC agent creation.
 */
export function provisionAgent(company: CompanyData) {
  const token = crypto.randomUUID();
  const workspace = generateWorkspace(company);
  const agentConfig = generateAgentConfig(company);
  const agentId = `company-${company.slug}`;

  return {
    agentId,
    token,
    workspace,
    agentConfig,
    containerTag: companyContainerTag(company.slug),
  };
}
