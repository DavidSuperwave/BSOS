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

async function main() {
  const COMPANY_ID = "a29720a9-f0f7-40d7-ac74-5fc4b815b9a1";

  console.log("=== PlusVibe Campaign Stats with Date Range ===\n");

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

  // Get campaign list first
  const campaignsRes = await plusvibeApi(`/campaign/list?workspace_id=${workspaceId}`, apiKey);
  const campaigns = Array.isArray(campaignsRes) ? campaignsRes : campaignsRes.data || [];

  console.log(`Found ${campaigns.length} campaigns\n`);

  // Try to get stats for each campaign
  let totalLeads = 0;
  let totalSent = 0;
  let totalReplies = 0;
  let totalBounced = 0;

  console.log("--- Fetching Individual Campaign Stats ---\n");

  for (const campaign of campaigns.slice(0, 5)) {
    const campaignId = campaign._id || campaign.id;
    console.log(`Campaign: ${campaign.name || 'Unnamed'}`);
    console.log(`ID: ${campaignId}`);
    
    // Try /campaign/stats with campaign_id
    const stats = await plusvibeApi(
      `/campaign/stats?workspace_id=${workspaceId}&campaign_id=${campaignId}`, 
      apiKey
    );
    
    if (stats.error) {
      console.log(`  Stats: ❌ ${stats.error}`);
    } else {
      console.log(`  Stats: ✅`);
      console.log(`  Data:`, JSON.stringify(stats, null, 2).slice(0, 300));
      
      // Aggregate
      if (stats.data) {
        totalLeads += stats.data.total_leads || 0;
        totalSent += stats.data.sent_count || stats.data.total_sent || 0;
        totalReplies += stats.data.reply_count || stats.data.total_replies || 0;
        totalBounced += stats.data.bounce_count || stats.data.total_bounced || 0;
      }
    }
    console.log();
  }

  console.log("--- Aggregate Stats ---");
  console.log(`Total Leads: ${totalLeads}`);
  console.log(`Total Sent: ${totalSent}`);
  console.log(`Total Replies: ${totalReplies}`);
  console.log(`Total Bounced: ${totalBounced}`);

  // Also try workspace stats with date range
  console.log("\n--- Trying Workspace Stats with Date Range ---\n");
  
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  
  const dateRange = `start_date=${thirtyDaysAgo.toISOString().split('T')[0]}&end_date=${now.toISOString().split('T')[0]}`;
  
  const workspaceStats = await plusvibeApi(
    `/campaign/stats?workspace_id=${workspaceId}&${dateRange}`,
    apiKey
  );
  
  if (workspaceStats.error) {
    console.log(`❌ Failed: ${workspaceStats.error}`);
  } else {
    console.log("✅ Success");
    console.log(JSON.stringify(workspaceStats, null, 2));
  }
}

main().catch(console.error);
