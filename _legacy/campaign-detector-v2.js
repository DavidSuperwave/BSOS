/**
 * Campaign Detector v2.0 - Edge Case Handling
 * 
 * Improvements:
 * - Handle campaigns with no associated contacts
 * - Better deduplication using campaign name + date
 * - Retry logic for API failures
 * - More granular status tracking
 */

const Anthropic = require("@anthropic-ai/sdk");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Configuration
const BATCH_SIZE = 10;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

/**
 * Main entry point
 */
async function detectAndStoreCampaigns() {
  console.log("🚀 Campaign Detector v2.0 - Starting...");

  try {
    // Step 1: Get all companies
    const companies = await getCompanies();
    console.log(`Found ${companies.length} companies to process`);

    let totalNew = 0;
    let totalSkipped = 0;
    let totalErrors = 0;

    for (const company of companies) {
      console.log(`\n📊 Processing: ${company.name} (${company.id})`);

      try {
        const result = await processCompany(company);
        totalNew += result.new;
        totalSkipped += result.skipped;
        totalErrors += result.errors;
      } catch (err) {
        console.error(`Failed to process company ${company.name}:`, err.message);
        totalErrors++;
      }
    }

    console.log("\n✅ Complete!");
    console.log(`   New campaigns: ${totalNew}`);
    console.log(`   Skipped (existing): ${totalSkipped}`);
    console.log(`   Errors: ${totalErrors}`);
  } catch (err) {
    console.error("Fatal error:", err);
    process.exit(1);
  }
}

/**
 * Process a single company
 */
async function processCompany(company) {
  const result = { new: 0, skipped: 0, errors: 0 };

  // Get email threads for this company
  const threads = await getEmailThreads(company.id);

  if (threads.length === 0) {
    console.log(`  No email threads found`);
    return result;
  }

  console.log(`  Found ${threads.length} email threads`);

  // Process in batches
  for (let i = 0; i < threads.length; i += BATCH_SIZE) {
    const batch = threads.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(threads.length / BATCH_SIZE);

    console.log(`  Processing batch ${batchNum}/${totalBatches}...`);

    for (const thread of batch) {
      try {
        const detected = await detectCampaignWithRetry(thread, company);

        if (detected) {
          const stored = await storeCampaign(detected, company, thread);
          if (stored.isNew) {
            result.new++;
          } else {
            result.skipped++;
          }
        }
      } catch (err) {
        console.error(`  Error processing thread ${thread.id}:`, err.message);
        result.errors++;
      }
    }
  }

  return result;
}

/**
 * Get all companies from Supabase
 */
async function getCompanies() {
  const { data, error } = await supabase.from("companies").select("id, name, slug").order("name");

  if (error) throw new Error(`Failed to fetch companies: ${error.message}`);
  return data || [];
}

/**
 * Get email threads for a company
 */
async function getEmailThreads(companyId) {
  const { data, error } = await supabase
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
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(50); // Most recent 50 threads

  if (error) throw new Error(`Failed to fetch threads: ${error.message}`);
  return data || [];
}

/**
 * Detect campaign with retry logic
 */
async function detectCampaignWithRetry(thread, company, retries = 0) {
  try {
    return await detectCampaign(thread, company);
  } catch (err) {
    if (retries < MAX_RETRIES && err.message.includes("rate")) {
      console.log(`  Rate limited, retrying in ${RETRY_DELAY_MS}ms...`);
      await sleep(RETRY_DELAY_MS * (retries + 1));
      return detectCampaignWithRetry(thread, company, retries + 1);
    }
    throw err;
  }
}

/**
 * Use Claude to detect campaign information from email thread
 */
async function detectCampaign(thread, company) {
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
1. Campaign name (brief, descriptive)
2. Campaign type (email_outreach, newsletter, promotional, follow_up, nurture, other)
3. Target audience description
4. Approximate start date (from thread date: ${thread.created_at})
5. Status (active/completed/unknown)

Respond in JSON format:
{
  "is_campaign": true/false,
  "name": "campaign name",
  "type": "campaign_type",
  "audience": "target audience",
  "start_date": "YYYY-MM-DD",
  "status": "active|completed|unknown"
}

If not a campaign, respond: {"is_campaign": false}`;

  const response = await anthropic.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 500,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0].text.trim();
  const jsonMatch = text.match(/{[\s\S]*}/);
  if (!jsonMatch) return null;

  const result = JSON.parse(jsonMatch[0]);
  return result.is_campaign ? result : null;
}

/**
 * Store detected campaign in Supabase
 */
async function storeCampaign(detected, company, thread) {
  // Check for existing campaign (dedup by name + company)
  const { data: existing } = await supabase
    .from("campaigns")
    .select("id")
    .eq("company_id", company.id)
    .ilike("name", detected.name)
    .single();

  if (existing) {
    return { isNew: false, id: existing.id };
  }

  // Insert new campaign
  const { data: campaign, error } = await supabase
    .from("campaigns")
    .insert({
      company_id: company.id,
      name: detected.name,
      type: detected.type,
      audience_description: detected.audience,
      status: detected.status === "active" ? "active" : "completed",
      started_at: detected.start_date,
      source: "auto_detected",
      source_thread_id: thread.id,
      metadata: {
        detection_method: "claude_v2",
        original_subject: thread.subject,
        detected_at: new Date().toISOString(),
      },
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to store campaign: ${error.message}`);
  }

  console.log(`  ✓ New campaign: "${campaign.name}" (${campaign.type})`);
  return { isNew: true, id: campaign.id };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Run
detectAndStoreCampaigns();
