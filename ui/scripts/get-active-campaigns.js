const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });

const PLUSVIBE_BASE = "https://api.plusvibe.ai/api/v1";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(supabaseUrl, supabaseServiceKey);

async function getActiveCampaigns(workspaceId, apiKey) {
  console.log("=== PlusVibe Active Campaigns ===\n");

  try {
    // Fetch campaign list
    const res = await fetch(
      `${PLUSVIBE_BASE}/campaign/list?workspace_id=${workspaceId}`,
      {
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
      }
    );

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`❌ API Error: ${res.status} - ${errorText.slice(0, 200)}`);
      return null;
    }

    const data = await res.json();
    
    // PlusVibe returns { data: [...] } or direct array
    const campaigns = Array.isArray(data) ? data : data.data || [];

    // Filter active campaigns
    const activeCampaigns = campaigns.filter(c => 
      c.status === "ACTIVE" || c.status === "active"
    );

    console.log(`📊 Total Campaigns: ${campaigns.length}`);
    console.log(`🟢 Active Campaigns: ${activeCampaigns.length}\n`);

    if (activeCampaigns.length === 0) {
      console.log("No active campaigns found.");
      return [];
    }

    // Get stats for each active campaign
    console.log("--- Active Campaign Details ---\n");
    
    for (const campaign of activeCampaigns) {
      console.log(`📧 ${campaign.name || 'Unnamed Campaign'}`);
      console.log(`   ID: ${campaign._id || campaign.id}`);
      console.log(`   Status: ${campaign.status}`);
      console.log(`   Created: ${campaign.created_at || 'N/A'}`);
      
      // Try to get campaign stats
      try {
        const statsRes = await fetch(
          `${PLUSVIBE_BASE}/campaign/stats?workspace_id=${workspaceId}&campaign_id=${campaign._id || campaign.id}`,
          {
            headers: {
              "Content-Type": "application/json",
              "x-api-key": apiKey,
            },
          }
        );
        
        if (statsRes.ok) {
          const stats = await statsRes.json();
          console.log(`   📈 Stats:`);
          console.log(`      Sent: ${stats.sent_count || stats.total_sent || 0}`);
          console.log(`      Opens: ${stats.open_count || stats.total_opens || 0}`);
          console.log(`      Clicks: ${stats.click_count || stats.total_clicks || 0}`);
          console.log(`      Replies: ${stats.reply_count || stats.total_replies || 0}`);
        }
      } catch (e) {
        // Stats endpoint might not exist or fail
      }
      
      // Show basic campaign data
      if (campaign.sent_count !== undefined) {
        console.log(`   📊 Basic Stats:`);
        console.log(`      Sent: ${campaign.sent_count || 0}`);
        console.log(`      Last Lead Sent: ${campaign.last_lead_sent || 'N/A'}`);
        console.log(`      Last Lead Replied: ${campaign.last_lead_replied || 'N/A'}`);
      }
      
      console.log();
    }

    return activeCampaigns;
  } catch (err) {
    console.error("❌ Error fetching campaigns:", err.message);
    return null;
  }
}

async function main() {
  const COMPANY_ID = "a29720a9-f0f7-40d7-ac74-5fc4b815b9a1";

  // Get company credentials
  const { data: company } = await admin
    .from("companies")
    .select("integration_credentials, plusvibe_api_key, plusvibe_workspace_id, name")
    .eq("id", COMPANY_ID)
    .single();

  if (!company) {
    console.error("Company not found");
    return;
  }

  console.log(`Company: ${company.name}\n`);

  const ic = company.integration_credentials || {};
  const apiKey = ic.plusvibe_api_key || company.plusvibe_api_key;
  const workspaceId = ic.plusvibe_workspace_id || company.plusvibe_workspace_id;

  if (!apiKey || !workspaceId) {
    console.error("❌ PlusVibe credentials not configured");
    return;
  }

  const activeCampaigns = await getActiveCampaigns(workspaceId, apiKey);

  if (activeCampaigns && activeCampaigns.length > 0) {
    console.log("\n=== Summary ===");
    console.log(`Active campaigns ready for monitoring: ${activeCampaigns.length}`);
  }
}

main().catch(console.error);
