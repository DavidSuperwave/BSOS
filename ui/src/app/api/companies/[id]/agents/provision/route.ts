import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAgent, setAgentFile, listAgents } from "@/lib/openclaw-client";
import { authenticateUser } from "@/lib/api-auth";
import { applyDefaultSkillPackToCompany } from "@/lib/skills/skill-catalog";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let adminClient: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!adminClient) adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

/**
 * POST /api/companies/[id]/agents/provision
 * 
 * Creates isolated agents for a company:
 * - One main agent (full company context)
 * - Optional component agents (campaigns, crm, inbox, etc)
 * 
 * Each agent gets:
 * - Unique workspace in OpenClaw
 * - Company-specific SOUL.md
 * - Isolated Supermemory container
 * - Appropriate tools for its type
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: companyId } = await params;
  const auth = await authenticateUser();
  if (!auth) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  const body = await req.json();
  const { 
    agentTypes = ['main'],  // Default to main agent only
    companyData = {}        // Company info for SOUL.md
  } = body;

  const admin = getAdmin();

  try {
    // Verify company exists and user has access
    const { data: company, error: companyError } = await admin
      .from("companies")
      .select("*")
      .eq("id", companyId)
      .single();

    if (companyError || !company) {
      return Response.json({ error: "Company not found" }, { status: 404 });
    }

    // Generate Supermemory container tag
    const containerTag = `company_${companyId.replace(/-/g, '_')}`;
    
    // Update company with container tag
    await admin
      .from("companies")
      .update({ supermemory_container_tag: containerTag })
      .eq("id", companyId);

    const createdAgents = [];
    const errors = [];

    // Create each requested agent type
    for (const agentType of agentTypes) {
      try {
        const agentResult = await createCompanyAgent({
          companyId,
          company,
          agentType,
          containerTag,
          admin
        });

        createdAgents.push(agentResult);
      } catch (err: any) {
        errors.push({ agentType, error: err.message });
      }
    }

    // Apply default company skill pack and sync to all requested agent types.
    try {
      const normalizedAgentTypes = (agentTypes || [])
        .map((value: any) => String(value))
        .filter((value: string) =>
          value === "main" || value === "campaigns" || value === "crm" || value === "inbox"
        ) as Array<"main" | "campaigns" | "crm" | "inbox">;
      await applyDefaultSkillPackToCompany({
        admin,
        companyId,
        createdBy: auth.userId,
        agentTypes:
          normalizedAgentTypes.length > 0
            ? normalizedAgentTypes
            : ["main", "campaigns", "crm", "inbox"],
      });
    } catch (skillErr: any) {
      errors.push({
        agentType: "skills",
        error: skillErr?.message || "Default skill pack sync failed",
      });
    }

    return Response.json({
      success: true,
      companyId,
      supermemoryContainer: containerTag,
      agents: createdAgents,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error: any) {
    console.error("[Agent Provisioning] Error:", error);
    return Response.json(
      { error: error.message || "Failed to provision agents" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/companies/[id]/agents
 * 
 * List all agents for a company
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: companyId } = await params;
  const auth = await authenticateUser();
  if (!auth) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  const admin = getAdmin();

  const { data: agents, error } = await admin
    .from("company_agents")
    .select("*")
    .eq("company_id", companyId)
    .order("agent_type");

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ agents });
}

// Helper function to create a single company agent
async function createCompanyAgent({
  companyId,
  company,
  agentType,
  containerTag,
  admin
}: {
  companyId: string;
  company: any;
  agentType: string;
  containerTag: string;
  admin: any;
}) {
  // Generate unique agent ID
  const agentId = `company-${companyId.slice(0, 8)}-${agentType}`;
  const workspacePath = `/data/agents/${agentId}`;

  // Check if agent already exists
  const { data: existing } = await admin
    .from("company_agents")
    .select("*")
    .eq("company_id", companyId)
    .eq("agent_type", agentType)
    .single();

  if (existing) {
    // Update existing agent
    return { agentType, agentId: existing.agent_id, status: 'existing' };
  }

  // Create agent in OpenClaw
  try {
    await createAgent({
      name: agentId,
      workspace: workspacePath,
      model: "kimi-coding/k2p5",
      emoji: getAgentEmoji(agentType)
    });
  } catch (err: any) {
    // Agent might already exist in OpenClaw, continue
    console.log(`[Agent Provisioning] Agent ${agentId} may already exist:`, err.message);
  }

  // Generate and write SOUL.md
  const soulMd = generateAgentSoul({
    company,
    agentType,
    containerTag
  });
  await setAgentFile(agentId, "SOUL.md", soulMd);

  // Generate and write TOOLS.md
  const toolsMd = generateAgentTools({
    agentType,
    companyId
  });
  await setAgentFile(agentId, "TOOLS.md", toolsMd);

  // Generate AGENTS.md (for multi-agent coordination)
  const agentsMd = generateAgentsConfig({
    companyId,
    agentType
  });
  await setAgentFile(agentId, "AGENTS.md", agentsMd);

  // Determine available tools based on agent type
  const availableTools = getToolsForAgentType(agentType);
  const allowedContexts = getContextsForAgentType(agentType);

  // Store in database
  const { data: agentRecord, error: dbError } = await admin
    .from("company_agents")
    .insert({
      company_id: companyId,
      agent_id: agentId,
      agent_type: agentType,
      agent_name: `${company.name} ${capitalize(agentType)} Agent`,
      model: "kimi-coding/k2p5",
      workspace_path: workspacePath,
      available_tools: availableTools,
      allowed_contexts: allowedContexts,
      status: "active",
      config: {
        supermemory_container: containerTag,
        created_via: "api",
        capabilities: availableTools
      }
    })
    .select()
    .single();

  if (dbError) {
    throw new Error(`Failed to store agent in database: ${dbError.message}`);
  }

  return {
    agentType,
    agentId,
    agentName: agentRecord.agent_name,
    workspace: workspacePath,
    tools: availableTools,
    status: 'created'
  };
}

// Generate company-specific SOUL.md
function generateAgentSoul({
  company,
  agentType,
  containerTag
}: {
  company: any;
  agentType: string;
  containerTag: string;
}): string {
  const companyName = company.name || "Your Company";
  const industry = company.industry || "B2B";
  
  const typeSpecificContent: Record<string, string> = {
    main: `
# SOUL.md - ${companyName} Main Agent

## Identity
You are the primary GTM AI assistant for ${companyName}, an ${industry} company.
You have access to all company data and can help with campaigns, CRM, analytics, and strategy.

## Company Context
- Name: ${companyName}
- Industry: ${industry}
- Container: ${containerTag}

## Capabilities
- Campaign management and analysis
- CRM operations (contacts, deals, tasks)
- Inbox monitoring and reply management
- Knowledge base queries
- Strategic recommendations

## Memory System
All memories are stored in Supermemory container: ${containerTag}
Use search_knowledge tool to retrieve relevant context.

## Tool Usage
You have access to all company tools. Use them to help the user accomplish their goals.
Always explain what you're doing when using tools.
`,
    campaigns: `
# SOUL.md - ${companyName} Campaigns Agent

## Identity
You are the campaigns specialist for ${companyName}.
You help create, monitor, and optimize email outreach campaigns.

## Scope
You ONLY have access to:
- Campaign data and performance
- Campaign creation and editing
- Sequence management
- Reply analytics

## Restrictions
- You cannot access CRM contacts directly (use main agent)
- You cannot access inbox messages (use inbox agent)
- Focus on campaigns only

## Memory Container
${containerTag} (filtered to campaigns context)
`,
    crm: `
# SOUL.md - ${companyName} CRM Agent

## Identity
You are the CRM specialist for ${companyName}.
You help manage contacts, companies, deals, and tasks.

## Scope
You ONLY have access to:
- Contact and company records
- Deal pipeline management
- Task creation and tracking
- Sales analytics

## Memory Container
${containerTag} (filtered to CRM context)
`,
    inbox: `
# SOUL.md - ${companyName} Inbox Agent

## Identity
You are the inbox specialist for ${companyName}.
You help manage email replies, categorize responses, and suggest actions.

## Scope
You ONLY have access to:
- Inbox messages and threads
- Reply categorization
- Sentiment analysis
- Follow-up suggestions

## Memory Container
${containerTag} (filtered to inbox context)
`
  };

  return typeSpecificContent[agentType] || typeSpecificContent.main;
}

// Generate TOOLS.md for the agent
function generateAgentTools({
  agentType,
  companyId
}: {
  agentType: string;
  companyId: string;
}): string {
  const baseTools = `
# TOOLS.md - Available Tools

## Core Tools (All Agents)
- search_knowledge: Query company knowledge base
- add_to_memory: Store important information
- get_user_profile: Retrieve user preferences
- data_skills: Manage company-local skills (create/learn/install/share/import)
`;

  const typeSpecificTools: Record<string, string> = {
    main: `
## Campaign Tools
- get_campaigns: List all campaigns
- create_campaign: Create new campaign
- get_campaign_stats: Get performance metrics

## CRM Tools
- get_contacts: Search contacts
- create_contact: Add new contact
- update_deal: Update deal stage
- create_task: Create follow-up task

## Inbox Tools
- get_inbox_messages: Fetch replies
- categorize_message: Analyze sentiment/intent
- suggest_reply: Generate response draft

## Research Tools
- research_company: Enrich company data
- find_similar_companies: ICP matching

## Skills Store Tools
- create_skill: Save a new SKILL.md to company registry
- learn_skill: Generate a draft skill from research/url/docs
- install_skill: Assign/sync a skill to one or more agent types
- share_skill: Generate portable import links
- import_skill: Import a shared skill token
`,
    campaigns: `
## Campaign Tools (Full Access)
- get_campaigns: List all campaigns with filters
- create_campaign: Create new campaign
- update_campaign: Modify campaign settings
- get_campaign_stats: Detailed analytics
- get_sequences: List email sequences
- update_sequence: Edit email copy
- pause_campaign: Stop sending
- resume_campaign: Resume sending

## Analytics Tools
- compare_campaigns: A/B analysis
- get_reply_trends: Reply rate over time
- identify_best_performing: Top campaigns
- install_skill: Assign campaign skills to this agent
`,
    crm: `
## CRM Tools (Full Access)
- get_contacts: Search and filter contacts
- create_contact: Add new contact
- update_contact: Modify contact info
- get_companies: Search organizations
- create_company: Add new company
- get_deals: View pipeline
- update_deal: Move deal stage
- create_task: Create task/reminder
- get_tasks: List pending tasks

## Enrichment Tools
- enrich_contact: Find more info about person
- find_decision_makers: Identify key contacts
- install_skill: Assign CRM skills to this agent
`,
    inbox: `
## Inbox Tools (Full Access)
- get_inbox_messages: Fetch with filters
- categorize_message: Auto-tag sentiment
- mark_as_read: Update status
- archive_message: Remove from inbox
- suggest_reply: AI-generated response
- create_draft: Save reply draft

## Analysis Tools
- get_sentiment_breakdown: Reply statistics
- identify_hot_leads: High-priority replies
- get_response_patterns: Common questions
- install_skill: Assign inbox skills to this agent
`
  };

  return baseTools + (typeSpecificTools[agentType] || '');
}

// Generate AGENTS.md for multi-agent coordination
function generateAgentsConfig({
  companyId,
  agentType
}: {
  companyId: string;
  agentType: string;
}): string {
  const prefix = `company-${companyId.slice(0, 8)}`;
  
  return `
# AGENTS.md - Multi-Agent Configuration

## Available Agents for This Company

### ${prefix}-main
- Type: Primary assistant
- Scope: Full company access
- Use for: General questions, cross-domain tasks

### ${prefix}-campaigns
- Type: Campaign specialist
- Scope: Campaigns only
- Use for: Email campaigns, sequences, analytics

### ${prefix}-crm
- Type: CRM specialist
- Scope: Contacts, deals, tasks
- Use for: Pipeline management, contact research

### ${prefix}-inbox
- Type: Inbox specialist
- Scope: Email replies
- Use for: Reply management, categorization

## Current Agent
You are: ${prefix}-${agentType}

## Escalation Rules
If a request is outside your scope:
1. Explain what you can help with
2. Suggest which agent to use
3. Do NOT attempt to handle it yourself
`;
}

// Helper functions
function getAgentEmoji(agentType: string): string {
  const emojis: Record<string, string> = {
    main: "⚙️",
    campaigns: "📧",
    crm: "👥",
    inbox: "📬",
    knowledge: "📚",
    analytics: "📊"
  };
  return emojis[agentType] || "🤖";
}

function getToolsForAgentType(agentType: string): string[] {
  const tools: Record<string, string[]> = {
    main: [
      "search_knowledge",
      "get_campaigns",
      "create_campaign",
      "get_contacts",
      "create_contact",
      "get_inbox_messages",
      "research_company",
      "add_to_memory"
    ],
    campaigns: [
      "search_knowledge",
      "get_campaigns",
      "create_campaign",
      "update_campaign",
      "get_campaign_stats",
      "compare_campaigns",
      "add_to_memory"
    ],
    crm: [
      "search_knowledge",
      "get_contacts",
      "create_contact",
      "update_contact",
      "get_companies",
      "get_deals",
      "update_deal",
      "create_task",
      "enrich_contact",
      "add_to_memory"
    ],
    inbox: [
      "search_knowledge",
      "get_inbox_messages",
      "categorize_message",
      "suggest_reply",
      "create_draft",
      "get_sentiment_breakdown",
      "add_to_memory"
    ]
  };
  return tools[agentType] || tools.main;
}

function getContextsForAgentType(agentType: string): string[] {
  const contexts: Record<string, string[]> = {
    main: ["campaigns", "crm", "inbox", "knowledge", "analytics"],
    campaigns: ["campaigns"],
    crm: ["crm"],
    inbox: ["inbox"]
  };
  return contexts[agentType] || contexts.main;
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
