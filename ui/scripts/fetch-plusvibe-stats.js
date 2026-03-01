const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });

const PLUSVIBE_BASE = "https://api.plusvibe.ai/api/v1";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(supabaseUrl, supabaseServiceKey);

async function plusvibeApi(endpoint, apiKey, workspaceId) {
  try {
    const url = endpoint.includes('?') 
      ? `${PLUSVIBE_BASE}${endpoint}&workspace_id=${workspaceId}`
      : `${PLUSVIBE_BASE}${endpoint}?workspace_id=${workspaceId}`;
    
    const res = await fetch(url, {
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

async function main() {
  const COMPANY_ID = "a29720a9-f0f7-40d7-ac74-5fc4b815b9a1";

  console.log("=== PlusVibe Campaign Analytics ===\n");

  const { data: company } = await admin
    .from("companies")
    .select("name, integration_credentials, plusvibe_api_key, plusvibe_workspace_id")
    .eq("id", COMPANY_ID)
    .single();

  if (!company) {
    console.error("Company not found");
    return;
  }

  const ic = company.integration_credentials || {};
  const apiKey = ic.plusvibe_api_key || company.plusvibe_api_key;
  const workspaceId = ic.plusvibe_workspace_id || company.plusvibe_workspace_id;

  if (!apiKey || !workspaceId) {
    console.error("❌ PlusVibe credentials not configured");
    return;
  }

  console.log(`Company: ${company.name}`);
  console.log(`Workspace: ${workspaceId}\n`);

  // Try to get campaign stats
  console.log("--- Attempting to Fetch Campaign Stats ---\n");

  // Method 1: Try /campaign/stats endpoint
  console.log("1. GET /campaign/stats");
  const stats1 = await plusvibeApi("/campaign/stats", apiKey, workspaceId);
  if (stats1.error) {
    console.log(`   ❌ Failed: ${stats1.error}`);
  } else {
    console.log("   ✅ Success");
    console.log(JSON.stringify(stats1, null, 2).slice(0, 500));
  }
  console.log();

  // Method 2: Try /analytics/campaigns
  console.log("2. GET /analytics/campaigns");
  const stats2 = await plusvibeApi("/analytics/campaigns", apiKey, workspaceId);
  if (stats2.error) {
    console.log(`   ❌ Failed: ${stats2.error}`);
  } else {
    console.log("   ✅ Success");
    console.log(JSON.stringify(stats2, null, 2).slice(0, 500));
  }
  console.log();

  // Method 3: Try /campaign/summary
  console.log("3. GET /campaign/summary");
  const summary = await plusvibeApi("/campaign/summary", apiKey, workspaceId);
  if (summary.error) {
    console.log(`   ❌ Failed: ${summary.error}`);
  } else {
    console.log("   ✅ Success");
    console.log(JSON.stringify(summary, null, 2).slice(0, 500));
  }
  console.log();

  // Method 4: Aggregate from campaign list
  console.log("4. Aggregating from /campaign/list");
  const campaigns = await plusvibeApi("/campaign/list", apiKey, workspaceId);
  if (campaigns.error) {
    console.log(`   ❌ Failed: ${campaigns.error}`);
  } else {
    console.log("   ✅ Success");
    const list = Array.isArray(campaigns) ? campaigns : campaigns.data || [];
    
    // Calculate aggregates
    let totalLeads = 0;
    let totalContacted = 0;
    let totalReplied = 0;
    let totalPositive = 0;
    let totalBounced = 0;

    list.forEach(c => {
      totalLeads += c.total_leads || c.lead_count || 0;
      totalContacted += c.contacted_count || c.sent_count || 0;
      totalReplied += c.reply_count || c.replied_count || 0;
      totalPositive += c.positive_reply_count || c.interested_count || 0;
      totalBounced += c.bounce_count || c.bounced_count || 0;
    });

    console.log(`\n   📊 Aggregated Stats from ${list.length} campaigns:`);
    console.log(`   Total Leads: ${totalLeads.toLocaleString()}`);
    console.log(`   Total Contacted: ${totalContacted.toLocaleString()}`);
    console.log(`   Total Replied: ${totalReplied.toLocaleString()}`);
    console.log(`   Total Positive: ${totalPositive.toLocaleString()}`);
    console.log(`   Total Bounced: ${totalBounced.toLocaleString()}`);
    
    if (totalLeads > 0) {
      console.log(`\n   📈 Percentages:`);
      console.log(`   Contacted: ${((totalContacted/totalLeads)*100).toFixed(1)}%`);
      console.log(`   Replied: ${((totalReplied/totalLeads)*100).toFixed(1)}%`);
      console.log(`   Positive: ${((totalPositive/totalLeads)*100).toFixed(1)}%`);
      console.log(`   Bounced: ${((totalBounced/totalLeads)*100).toFixed(1)}%`);
    }
  }
  console.log();

  // Method 5: Try workspace-level analytics
  console.log("5. GET /workspace/analytics");
  const workspaceStats = await plusvibeApi("/workspace/analytics", apiKey, workspaceId);
  if (workspaceStats.error) {
    console.log(`   ❌ Failed: ${workspaceStats.error}`);
  } else {
    console.log("   ✅ Success");
    console.log(JSON.stringify(workspaceStats, null, 2).slice(0, 500));
  }
}

main().catch(console.error);
