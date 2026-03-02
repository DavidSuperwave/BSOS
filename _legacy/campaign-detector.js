/**
 * Campaign Detector with Supermemory Auto-Store
 *
 * Detects new PlusVibe campaigns from Supabase email threads
 * and auto-stores them in Supermemory with proper metadata
 */

const Anthropic = require("@anthropic-ai/sdk");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SUPERMEMORY_API_KEY = process.env.SUPERMEMORY_API_KEY;
const SUPERMEMORY_BASE = "https://api.supermemory.ai/v3";

/**
 * Main entry point
 */
async function detectAndStoreCampaigns() {
  console.log("Starting campaign detector...");

  // Get all companies
  const { data: companies, error: companiesError } = await supabase
    .from("companies")
    .select("id, name, slug");

  if (companiesError) {
    console.error("Error fetching companies:", companiesError);
    return;
  }

  for (const company of companies) {
    await processCompany(company);
  }

  console.log("Done!");
}

/**
 * Process a single company
 */
async function processCompany(company) {
  console.log(`\nProcessing company: ${company.name}`);

  // Get recent email threads
  const { data: threads, error: threadsError } = await supabase
    .from("email_threads")
    .select(
      `
      id, 
      subject, 
      snippet,
      from_email,
      to_emails,
      created_at,
      email_messages(content, from_email, created_at)
    `
    )
    .eq("company_id", company.id)
    .order("created_at", { ascending: false })
    .limit(20);

  if (threadsError || !threads?.length) {
    console.log(`  No threads found`);
    return;
  }

  for (const thread of threads) {
    await detectAndStore(thread, company);
  }
}

/**
 * Detect if thread is a campaign and store in Supermemory
 */
async function detectAndStore(thread, company) {
  // Use Claude to analyze the thread
  const messages = thread.email_messages || [];
  const messageContent =
    messages
      .slice(0, 3)
      .map((m) => m.content)
      .join("\n---\n") || thread.snippet;

  const prompt = `Analyze this email thread and determine if it represents a marketing campaign.

Company: ${company.name}
Subject: ${thread.subject}
From: ${thread.from_email}
Content preview: ${messageContent?.slice(0, 500)}

If this is a marketing campaign, extract:
1. Campaign name
2. Campaign type (email_outreach, newsletter, promotional, etc.)
3. Target audience
4. Start date (use thread date: ${thread.created_at})

Respond in JSON:
{
  "is_campaign": true/false,
  "name": "...",
  "type": "...",
  "audience": "...",
  "start_date": "YYYY-MM-DD"
}`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0].text.trim();
    const jsonMatch = text.match(/{[\s\S]*}/);
    if (!jsonMatch) return;

    const result = JSON.parse(jsonMatch[0]);
    if (!result.is_campaign) return;

    // Store in Supermemory
    await storeInSupermemory(result, company, thread);
  } catch (err) {
    console.error(`Error processing thread ${thread.id}:`, err.message);
  }
}

/**
 * Store campaign in Supermemory with proper metadata
 */
async function storeInSupermemory(campaign, company, thread) {
  const containerTag = `company-${company.slug}`;

  const content = `Campaign: ${campaign.name}
Type: ${campaign.type}
Target Audience: ${campaign.audience}
Start Date: ${campaign.start_date}
Email Subject: ${thread.subject}
From: ${thread.from_email}`;

  const response = await fetch(`${SUPERMEMORY_BASE}/memories`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUPERMEMORY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      content,
      containerTag,
      metadata: {
        type: "campaign",
        campaign_name: campaign.name,
        campaign_type: campaign.type,
        company_id: company.id,
        company_slug: company.slug,
        source_thread_id: thread.id,
        created_at: new Date().toISOString(),
      },
    }),
  });

  if (response.ok) {
    const data = await response.json();
    console.log(`  Stored campaign: "${campaign.name}" (${data.id})`);
  } else {
    console.error(`  Failed to store campaign: ${response.status}`);
  }
}

// Run the detector
detectAndStoreCampaigns();
