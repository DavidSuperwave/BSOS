const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });

const PLUSVIBE_BASE = "https://api.plusvibe.ai/api/v1";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(supabaseUrl, supabaseServiceKey);

async function plusvibeApi(endpoint, apiKey) {
  try {
    const res = await fetch(`${PLUSVIBE_BASE}${endpoint}`, {
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
    });

    if (!res.ok) {
      const err = await res.text();
      return { error: `${res.status}: ${err.slice(0, 200)}` };
    }

    return await res.json();
  } catch (err) {
    return { error: err.message };
  }
}

async function getCampaignDetails(campaignId, apiKey, workspaceId) {
  console.log(`\n🔍 Detailed Campaign Info: ${campaignId}\n`);

  // Get campaign basic info
  const campaign = await plusvibeApi(`/campaign?name=${campaignId}&workspace_id=${workspaceId}`, apiKey);
  if (campaign.error) {
    console.log(`Campaign basic info: ❌ ${campaign.error}`);
  } else {
    console.log("📋 Basic Info:");
    console.log(JSON.stringify(campaign, null, 2).slice(0, 1000));
  }
  console.log();

  // Get campaign leads
  const leads = await plusvibeApi(`/campaign/leads?campaign_id=${campaignId}&workspace_id=${workspaceId}`, apiKey);
  if (leads.error) {
    console.log(`Campaign leads: ❌ ${leads.error}`);
  } else {
    const leadList = Array.isArray(leads) ? leads : leads.data || [];
    console.log(`👥 Leads: ${leadList.length} total`);
    if (leadList.length > 0) {
      console.log("\nSample leads:");
      leadList.slice(0, 5).forEach((lead, i) => {
        console.log(`  ${i + 1}. ${lead.email || lead.name || 'Unknown'}`);
        console.log(`     Status: ${lead.status || 'N/A'} | Sent: ${lead.sent ? 'Yes' : 'No'}`);
        console.log(`     Replied: ${lead.replied ? 'Yes' : 'No'} | Opened: ${lead.opened ? 'Yes' : 'No'}`);
      });
    }
  }
  console.log();

  // Get campaign sequences/steps
  const sequences = await plusvibeApi(`/campaign/sequences?campaign_id=${campaignId}&workspace_id=${workspaceId}`, apiKey);
  if (sequences.error) {
    console.log(`Campaign sequences: ❌ ${sequences.error}`);
  } else {
    console.log("📧 Sequences/Email Steps:");
    console.log(JSON.stringify(sequences, null, 2).slice(0, 800));
  }
  console.log();

  // Get campaign replies
  const replies = await plusvibeApi(`/campaign/replies?campaign_id=${campaignId}&workspace_id=${workspaceId}`, apiKey);
  if (replies.error) {
    console.log(`Campaign replies: ❌ ${replies.error}`);
  } else {
    const replyList = Array.isArray(replies) ? replies : replies.data || [];
    console.log(`💬 Replies: ${replyList.length} total`);
    if (replyList.length > 0) {
      replyList.slice(0, 3).forEach((reply, i) => {
        console.log(`  ${i + 1}. From: ${reply.from_email || 'Unknown'}`);
        console.log(`     Subject: ${reply.subject || 'N/A'}`);
        console.log(`     Date: ${reply.created_at || 'N/A'}`);
      });
    }
  }
}

async function main() {
  const COMPANY_ID = "a29720a9-f0f7-40d7-ac74-5fc4b815b9a1";

  console.log("=== PlusVibe Individual Campaign Details ===\n");

  const { data: company } = await admin
    .from("companies")
    .select("integration_credentials")
    .eq("id", COMPANY_ID)
    .single();

  const ic = company?.integration_credentials || {};
  const apiKey = ic.plusvibe_api_key;
  const workspaceId = ic.plusvibe_workspace_id;

  if (!apiKey || !workspaceId) {
    console.error("❌ PlusVibe credentials not configured");
    return;
  }

  // Campaign IDs to investigate
  const campaignIds = [
    "698f5d50c9113ffb4aa9a188", // M&A 11-50 emp (has replies)
    "698cf1dc98b5daadac2b9dbc", // M&A 1-10 emp (has replies)
    "6913e543a64dfcb79833ff0c", // AI Intro (largest)
  ];

  for (const campaignId of campaignIds) {
    await getCampaignDetails(campaignId, apiKey, workspaceId);
    console.log("\n" + "=".repeat(60) + "\n");
  }

  console.log("\n📊 Available Campaign Data from PlusVibe API:\n");
  console.log("✅ Basic Info:");
  console.log("  - Campaign name, status, created date");
  console.log("  - Lead count, sent count, reply count");
  console.log("  - Email sequences/steps");
  console.log();
  console.log("✅ Lead Details:");
  console.log("  - Email addresses, names, companies");
  console.log("  - Individual lead status");
  console.log("  - Sent/replied/opened/bounced per lead");
  console.log();
  console.log("✅ Replies:");
  console.log("  - Reply content, sender info");
  console.log("  - Reply date, sentiment");
  console.log();
  console.log("✅ Analytics:");
  console.log("  - Open rates, click rates");
  console.log("  - Bounce rates, unsubscribe rates");
}

main().catch(console.error);
