/**
 * Agent Tools Library
 *
 * Tools that Julian can call from the chat interface.
 * Each tool has a name, description, and execute function.
 * All tools accept companyId to scope data access.
 */

import { createClient } from "@supabase/supabase-js";

let supabaseClient: ReturnType<typeof createClient> | null = null;

function getSupabase() {
  if (!supabaseClient) {
    supabaseClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }
  return supabaseClient;
}

const PLUSVIBE_BASE = "https://api.plusvibe.ai/api/v1";

/**
 * Parse email scripts from AI-generated text
 */
function parseEmailScriptsFromText(text: string): any[] {
  const scripts: any[] = [];
  const scriptBlocks = text.split(/(?:Script|Email|Script \d+|Email \d+)[:\s]/i);
  
  for (let i = 1; i < scriptBlocks.length && scripts.length < 3; i++) {
    const block = scriptBlocks[i];
    const nameMatch = block.match(/^(\d+|[^:\n]+)/);
    const subjectMatch = block.match(/[Ss]ubject[:\s]+([^\n]+)/);
    const bodyMatch = block.match(/[Bb]ody[:\s]+([\s\S]+?)(?=\n\n|\n[A-Z]|$)/);
    const angleMatch = block.match(/[Aa]ngle[:\s]+([^\n]+)/);
    
    if (subjectMatch || bodyMatch) {
      scripts.push({
        name: nameMatch ? nameMatch[1].trim() : `Script ${scripts.length + 1}`,
        subject: subjectMatch ? subjectMatch[1].trim() : `Quick question about {{company}}`,
        body: bodyMatch ? bodyMatch[1].trim() : generateDefaultEmailBody(),
        angle: angleMatch ? angleMatch[1].trim() : "Pain point",
        framework: "F1",
      });
    }
  }
  
  return scripts;
}

/**
 * Generate default email scripts as fallback
 */
function generateDefaultEmailScripts(topic: string, companyName: string, senderEmail: string): any[] {
  const senderName = senderEmail.split("@")[0];
  const capitalizedName = senderName.charAt(0).toUpperCase() + senderName.slice(1);
  
  return [
    {
      name: "Infrastructure Pain Angle",
      subject: `Is {{company}} dealing with email deliverability issues?`,
      body: `<div>Hi {{firstName}},</div>
<div><br></div>
<div>I noticed {{company}} might be dealing with email deliverability issues. Most ${topic.toLowerCase()} burn through domains trying to scale cold outreach.</div>
<div><br></div>
<div>We guarantee 95%+ inbox placement—companies like yours scale from 500 emails/day to 5,000 without losing a single domain.</div>
<div><br></div>
<div>Want to see how much time you could reclaim?</div>
<div><br></div>
<div>Best,<br>${capitalizedName}</div>`,
      angle: "Infrastructure Pain",
      framework: "F1",
    },
    {
      name: "Data Quality Angle",
      subject: `{{company}} is likely wasting money on bad data`,
      body: `<div>Hi {{firstName}},</div>
<div><br></div>
<div>Your team is probably wasting money on bad data. 40% of B2B email addresses decay every year—and most companies don't even know it.</div>
<div><br></div>
<div>We provide bespoke, human-verified leads. No stale databases. No burned prospects.</div>
<div><br></div>
<div>Want to see what clean data looks like?</div>
<div><br></div>
<div>Best,<br>${capitalizedName}</div>`,
      angle: "Data Quality",
      framework: "F2",
    },
    {
      name: "Scale Without Hiring Angle",
      subject: `10x outreach without hiring`,
      body: `<div>Hi {{firstName}},</div>
<div><br></div>
<div>{{company}} shouldn't be spending hours on manual SDR work. AI can handle 90% of cold outreach—personalized, at scale.</div>
<div><br></div>
<div>We run complete outbound campaigns: infrastructure, data, AI writing, follow-ups. You just book the meetings.</div>
<div><br></div>
<div>See how it works?</div>
<div><br></div>
<div>Best,<br>${capitalizedName}</div>`,
      angle: "Scale Without Hiring",
      framework: "F3",
    },
  ];
}

function generateDefaultEmailBody(): string {
  return `<div>Hi {{firstName}},</div>
<div><br></div>
<div>Quick question about {{company}}—are you looking to improve your outbound email performance?</div>
<div><br></div>
<div>Best,<br>David</div>`;
}

export interface Tool {
  name: string;
  description: string;
  parameters: Record<
    string,
    { type: string; description: string; required?: boolean }
  >;
  execute: (params: Record<string, any>) => Promise<any>;
}

/**
 * Get PlusVibe credentials for a company, falling back to env vars.
 */
async function getPlusVibeKeys(companyId?: string) {
  if (companyId) {
    const supabase = getSupabase();
    const { data } = await supabase
      .from("companies")
      .select(
        "integration_credentials, plusvibe_api_key, plusvibe_workspace_id"
      )
      .eq("id", companyId)
      .single();

    if (data) {
      const row = data as any;
      const apiKey =
        row.integration_credentials?.plusvibe_api_key ||
        row.plusvibe_api_key ||
        process.env.PLUSVIBE_API_KEY;
      const workspaceId =
        row.integration_credentials?.plusvibe_workspace_id ||
        row.plusvibe_workspace_id ||
        process.env.PLUSVIBE_WORKSPACE_ID;
      return { apiKey, workspaceId };
    }
  }

  return {
    apiKey: process.env.PLUSVIBE_API_KEY,
    workspaceId: process.env.PLUSVIBE_WORKSPACE_ID,
  };
}

export const tools: Tool[] = [
  // ============================================
  // PLUSVIBE TOOLS
  // ============================================
  {
    name: "list_campaigns",
    description: "Get all campaigns from PlusVibe",
    parameters: {
      companyId: {
        type: "string",
        description: "Company ID for scoped access",
      },
      status: {
        type: "string",
        description:
          "Filter by status: ACTIVE, DRAFT, COMPLETED, ARCHIVED",
      },
      limit: { type: "number", description: "Maximum campaigns to return" },
    },
    execute: async (params) => {
      const { apiKey, workspaceId } = await getPlusVibeKeys(params.companyId);

      const res = await fetch(
        `${PLUSVIBE_BASE}/campaign/list?workspace_id=${workspaceId}`,
        {
          headers: {
            "x-api-key": apiKey!,
            "Content-Type": "application/json",
          },
        }
      );

      if (!res.ok) throw new Error(`PlusVibe API error: ${res.status}`);

      const data = await res.json();
      let campaigns = Array.isArray(data)
        ? data
        : data.value || data.data || [];

      if (params.status) {
        campaigns = campaigns.filter(
          (c: any) => c.status === params.status
        );
      }

      if (params.limit) {
        campaigns = campaigns.slice(0, params.limit);
      }

      return {
        count: campaigns.length,
        campaigns: campaigns.map((c: any) => ({
          id: c._id || c.id,
          name: c.name,
          status: c.status,
          createdAt: c.created_at,
          lastSent: c.last_lead_sent,
          lastReplied: c.last_lead_replied,
        })),
      };
    },
  },

  {
    name: "get_campaign_details",
    description: "Get details for a specific campaign",
    parameters: {
      companyId: {
        type: "string",
        description: "Company ID for scoped access",
      },
      campaignId: {
        type: "string",
        description: "Campaign ID",
        required: true,
      },
    },
    execute: async (params) => {
      const { apiKey, workspaceId } = await getPlusVibeKeys(params.companyId);

      const listRes = await fetch(
        `${PLUSVIBE_BASE}/campaign/list?workspace_id=${workspaceId}`,
        {
          headers: {
            "x-api-key": apiKey!,
            "Content-Type": "application/json",
          },
        }
      );
      const listData = await listRes.json();
      const campaigns = Array.isArray(listData)
        ? listData
        : listData.value || [];
      const campaign = campaigns.find(
        (c: any) =>
          c._id === params.campaignId || c.id === params.campaignId
      );

      if (!campaign) throw new Error("Campaign not found");
      return campaign;
    },
  },

  {
    name: "create_campaign",
    description: "Create a new campaign in PlusVibe with email sequences",
    parameters: {
      companyId: {
        type: "string",
        description: "Company ID for scoped access",
        required: true,
      },
      campaignName: {
        type: "string",
        description: "Campaign name",
        required: true,
      },
      emailScripts: {
        type: "array",
        description: "Array of email scripts with subject, body, and wait times",
        required: true,
      },
      senderEmail: {
        type: "string",
        description: "Sender email address",
        required: true,
      },
    },
    execute: async (params) => {
      const { apiKey, workspaceId } = await getPlusVibeKeys(params.companyId);

      if (!apiKey || !workspaceId) {
        throw new Error("PlusVibe credentials not configured");
      }

      // 1. Create campaign
      const createRes = await fetch(`${PLUSVIBE_BASE}/campaign/add/campaign`, {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          camp_name: params.campaignName,
          workspace_id: workspaceId,
        }),
      });

      if (!createRes.ok) {
        const errorText = await createRes.text();
        throw new Error(`Failed to create campaign: ${createRes.status} - ${errorText}`);
      }

      const campaignData = await createRes.json();
      const campaignId = campaignData.id || campaignData._id;

      if (!campaignId) {
        throw new Error("Campaign created but no ID returned");
      }

      // 2. Build sequences from email scripts
      const scripts = params.emailScripts || [];
      const sequences = scripts.map((script: any, index: number) => ({
        step: index + 1,
        wait_time: index === 0 ? 1 : index === 1 ? 3 : 5, // 1, 3, 5 days
        variations: [
          {
            variation: "A",
            subject: script.subject || `Quick question about {{company}}`,
            name: script.name || `Email ${index + 1}`,
            body: script.body || generateDefaultEmailBody(),
          },
        ],
      }));

      // 3. Update campaign with sequences
      const updateRes = await fetch(`${PLUSVIBE_BASE}/campaign/update/campaign`, {
        method: "PATCH",
        headers: {
          "x-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspace_id: workspaceId,
          campaign_id: campaignId,
          camp_name: params.campaignName,
          first_wait_time: 1,
          sequences,
        }),
      });

      if (!updateRes.ok) {
        const errorText = await updateRes.text();
        throw new Error(`Failed to update campaign sequences: ${updateRes.status} - ${errorText}`);
      }

      const updateData = await updateRes.json();

      return {
        success: true,
        campaignId,
        campaignName: params.campaignName,
        sequencesCount: sequences.length,
        senderEmail: params.senderEmail,
        message: `Campaign "${params.campaignName}" created successfully with ${sequences.length} email sequences. Ready to add leads and activate.`,
      };
    },
  },

  // ============================================
  // KNOWLEDGE BASE TOOLS
  // ============================================
  {
    name: "list_knowledge_docs",
    description: "List all knowledge base documents",
    parameters: {
      companyId: {
        type: "string",
        description: "Company ID for scoped access",
        required: true,
      },
      category: { type: "string", description: "Filter by category" },
      limit: { type: "number", description: "Maximum documents to return" },
    },
    execute: async (params) => {
      const supabase = getSupabase();
      let query = supabase
        .from("knowledge_documents")
        .select("id, title, category, created_at")
        .order("created_at", { ascending: false });

      if (params.companyId) {
        query = query.eq("company_id", params.companyId);
      }

      if (params.category) {
        query = query.eq("category", params.category);
      }

      if (params.limit) {
        query = query.limit(params.limit);
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);

      return { count: data?.length || 0, documents: data };
    },
  },

  {
    name: "get_knowledge_doc",
    description: "Get a specific knowledge document by ID",
    parameters: {
      id: { type: "string", description: "Document ID", required: true },
    },
    execute: async (params) => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("knowledge_documents")
        .select("*")
        .eq("id", params.id)
        .single();

      if (error) throw new Error(error.message);
      return data;
    },
  },

  {
    name: "create_knowledge_doc",
    description: "Create a new knowledge base document",
    parameters: {
      companyId: {
        type: "string",
        description: "Company ID",
        required: true,
      },
      title: {
        type: "string",
        description: "Document title",
        required: true,
      },
      content: {
        type: "string",
        description: "Document content (markdown)",
        required: true,
      },
      category: {
        type: "string",
        description:
          "Category: company_profile, icp, templates, research, analytics, sales, general",
      },
    },
    execute: async (params) => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("knowledge_documents")
        .insert({
          company_id: params.companyId,
          title: params.title,
          content: params.content,
          category: params.category || "general",
          metadata: {
            source: "julian-agent",
            createdAt: new Date().toISOString(),
          },
        } as any)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    },
  },

  {
    name: "update_knowledge_doc",
    description: "Update an existing knowledge document",
    parameters: {
      id: { type: "string", description: "Document ID", required: true },
      title: { type: "string", description: "New title" },
      content: { type: "string", description: "New content" },
      category: { type: "string", description: "New category" },
    },
    execute: async (params) => {
      const supabase = getSupabase();
      const updates: any = {};
      if (params.title) updates.title = params.title;
      if (params.content) updates.content = params.content;
      if (params.category) updates.category = params.category;
      updates.updated_at = new Date().toISOString();

      const { data, error } = await (
        supabase.from("knowledge_documents") as any
      )
        .update(updates)
        .eq("id", params.id)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    },
  },

  {
    name: "delete_knowledge_doc",
    description: "Delete a knowledge document",
    parameters: {
      id: { type: "string", description: "Document ID", required: true },
    },
    execute: async (params) => {
      const supabase = getSupabase();
      const { error } = await supabase
        .from("knowledge_documents")
        .delete()
        .eq("id", params.id);

      if (error) throw new Error(error.message);
      return { success: true, deletedId: params.id };
    },
  },

  // ============================================
  // PERPLEXITY RESEARCH
  // NOTE: Supermemory tools removed — provided by OpenClaw Supermemory plugin
  // (supermemory_store, supermemory_search, supermemory_forget, supermemory_profile)
  // ============================================
  {
    name: "research_topic",
    description: "Research a topic using Perplexity AI",
    parameters: {
      query: { type: "string", description: "Research query", required: true },
    },
    execute: async (params) => {
      const apiKey = process.env.PERPLEXITY_API_KEY;

      const res = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "sonar",
          messages: [
            {
              role: "system",
              content:
                "You are a research assistant for B2B sales and marketing. Provide concise, actionable insights.",
            },
            { role: "user", content: params.query },
          ],
          max_tokens: 1000,
        }),
      });

      if (!res.ok) throw new Error(`Perplexity API error: ${res.status}`);

      const data = await res.json();
      return {
        answer: data.choices?.[0]?.message?.content,
        citations: data.citations,
      };
    },
  },

  // ============================================
  // RESEARCH WORKFLOW - CAMPAIGN CREATION
  // ============================================
  {
    name: "research_and_create_campaign",
    description: "Research a target market/industry based on company profile, generate 3 email scripts, and prepare campaign creation. Stores research and actions in Supermemory.",
    parameters: {
      companyId: {
        type: "string",
        description: "Company ID for scoped access",
        required: true,
      },
      researchTopic: {
        type: "string",
        description: "Topic to research (e.g., 'Marketing agencies', 'SaaS companies', 'Healthcare providers')",
        required: true,
      },
      senderEmail: {
        type: "string",
        description: "Email address to use as sender (e.g., David@superwave.ai)",
        required: true,
      },
    },
    execute: async (params) => {
      const supabase = getSupabase();
      const { companyId, researchTopic, senderEmail } = params;

      // 1. Get company profile
      const { data: company } = await supabase
        .from("companies")
        .select("id, name, slug, onboarding_data, integration_credentials")
        .eq("id", companyId)
        .single();

      if (!company) {
        throw new Error("Company not found");
      }

      const profile = (company as any).onboarding_data || {};
      const companyName = (company as any).name || "Company";
      const companySlug = (company as any).slug || "company";

      // 2. Build research query with company context
      const researchQuery = `Research ${researchTopic} as a target market for ${companyName}. 
Focus on:
- Key pain points and challenges this market faces
- Common buyer personas and decision makers
- Industry trends and opportunities
- Competitive landscape
- Best messaging angles for cold outreach

Company context: ${JSON.stringify({
        industry: profile.identity?.industry || "B2B Services",
        services: profile.services?.primary?.name || "Outbound email services",
        valueProposition: profile.identity?.value_proposition || "Email infrastructure",
      })}`;

      // 3. Research using Perplexity
      const perplexityKey = 
        (company as any).integration_credentials?.perplexity_api_key ||
        process.env.PERPLEXITY_API_KEY;

      if (!perplexityKey) {
        throw new Error("Perplexity API key not configured");
      }

      const researchRes = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${perplexityKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "sonar",
          messages: [
            {
              role: "system",
              content: "You are a B2B market research expert specializing in outbound sales and email marketing. Provide detailed, actionable insights for campaign creation.",
            },
            { role: "user", content: researchQuery },
          ],
          max_tokens: 2000,
        }),
      });

      if (!researchRes.ok) {
        throw new Error(`Perplexity API error: ${researchRes.status}`);
      }

      const researchData = await researchRes.json();
      const researchContent = researchData.choices?.[0]?.message?.content || "";
      const citations = researchData.citations || [];

      // 4. Generate 3 email scripts using AI
      const emailScriptsPrompt = `Based on this research about ${researchTopic}:

${researchContent}

Generate 3 different email scripts for cold outreach. Each script should:
- Be under 75 words
- Address a specific pain point from the research
- Include a strong offer upfront
- Use a casual, direct tone
- Include personalization placeholders: {{firstName}}, {{company}}
- Have a clear CTA

Company context:
- Company: ${companyName}
- Service: ${profile.services?.primary?.name || "Outbound email services"}
- Value prop: ${profile.identity?.value_proposition || "Email infrastructure"}

Return JSON with this structure:
{
  "scripts": [
    {
      "name": "Script 1 Name",
      "subject": "Email subject line",
      "body": "Email body HTML",
      "angle": "Pain point angle",
      "framework": "F1-F6 framework identifier"
    },
    ...
  ]
}`;

      const scriptsRes = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${perplexityKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "sonar",
          messages: [
            {
              role: "system",
              content: "You are an expert email copywriter for B2B cold outreach. Generate high-converting email scripts based on market research.",
            },
            { role: "user", content: emailScriptsPrompt },
          ],
          max_tokens: 3000,
        }),
      });

      if (!scriptsRes.ok) {
        throw new Error(`Perplexity API error: ${scriptsRes.status}`);
      }

      const scriptsData = await scriptsRes.json();
      let emailScripts: any[] = [];
      
      try {
        const scriptsText = scriptsData.choices?.[0]?.message?.content || "";
        // Try to extract JSON from the response
        const jsonMatch = scriptsText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          emailScripts = parsed.scripts || [];
        } else {
          // Fallback: parse as structured text
          emailScripts = parseEmailScriptsFromText(scriptsText);
        }
      } catch (e) {
        // Fallback to default scripts if parsing fails
        emailScripts = generateDefaultEmailScripts(researchTopic, companyName, senderEmail);
      }

      // Ensure we have exactly 3 scripts
      while (emailScripts.length < 3) {
        emailScripts.push(generateDefaultEmailScripts(researchTopic, companyName, senderEmail)[0]);
      }
      emailScripts = emailScripts.slice(0, 3);

      // 5. Store research and scripts in Supermemory
      const supermemoryKey = 
        (company as any).integration_credentials?.supermemory_api_key ||
        process.env.SUPERMEMORY_API_KEY;

      if (supermemoryKey) {
        const supermemoryClient = await import("@/lib/supermemory-client");
        const containerTag = supermemoryClient.companyContainerTag(companySlug);

        // Store research summary
        const researchSummary = `# Research: ${researchTopic}

## Research Findings
${researchContent}

## Citations
${citations.map((c: string, i: number) => `${i + 1}. ${c}`).join("\n")}

## Email Scripts Generated
${emailScripts.map((s, i) => `### Script ${i + 1}: ${s.name}\n**Angle:** ${s.angle}\n**Framework:** ${s.framework}\n**Subject:** ${s.subject}\n\n**Body:**\n${s.body}`).join("\n\n")}

## Actions Taken
- Research completed on ${new Date().toISOString()}
- 3 email scripts generated
- Ready for campaign creation
- Sender: ${senderEmail}
`;

        await supermemoryClient.storeInsight(supermemoryKey, containerTag, {
          content: researchSummary,
          category: "research_summary",
          metadata: {
            research_topic: researchTopic,
            company_id: companyId,
            sender_email: senderEmail,
            scripts_count: emailScripts.length,
            created_at: new Date().toISOString(),
          },
          customId: `research_${companySlug}_${researchTopic.toLowerCase().replace(/\s+/g, "_")}_${Date.now()}`,
        });
      }

      // 6. Return results with campaign creation option
      return {
        success: true,
        research: {
          topic: researchTopic,
          content: researchContent,
          citations,
        },
        emailScripts,
        campaignReady: true,
        nextSteps: [
          "Review the 3 email scripts generated above",
          "Select one or more scripts to use for the campaign",
          "Use the create_campaign tool with the emailScripts parameter to create the campaign",
          "Example: create_campaign with campaignName, emailScripts array, and senderEmail",
        ],
        senderEmail,
        companyName,
      };
    },
  },
];

// ============================================
// TOOL EXECUTOR
// ============================================

export async function executeTool(
  name: string,
  params: Record<string, any>
): Promise<any> {
  const tool = tools.find((t) => t.name === name);
  if (!tool) {
    throw new Error(`Unknown tool: ${name}`);
  }

  return await tool.execute(params);
}

export function getToolDescriptions(): string {
  return tools
    .map(
      (t) =>
        `- ${t.name}: ${t.description}\n  Parameters: ${Object.entries(
          t.parameters
        )
          .map(
            ([k, v]) =>
              `${k} (${v.type}${v.required ? ", required" : ""})`
          )
          .join(", ")}`
    )
    .join("\n");
}

export default { tools, executeTool, getToolDescriptions };
