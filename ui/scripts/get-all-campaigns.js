const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });

const PLUSVIBE_BASE = "https://api.plusvibe.ai/api/v1";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(supabaseUrl, supabaseServiceKey);

async function getAllCampaigns(workspaceId, apiKey) {
  console.log("=== PlusVibe Campaign Overview ===\n");

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
    const campaigns = Array.isArray(data) ? data : data.data || [];

    console.log(`📊 Total Campaigns: ${campaigns.length}\n`);

    // Group by status
    const byStatus = {};
    campaigns.forEach(c => {
      const status = c.status || 'UNKNOWN';
      if (!byStatus[status]) byStatus[status] = [];
      byStatus[status].push(c);
    });

    console.log("--- Campaigns by Status ---\n");
    Object.entries(byStatus).forEach(([status, list]) => {
      console.log(`${status}: ${list.length} campaigns`);
      list.forEach(c => {
        console.log(`  • ${c.name || 'Unnamed'} (${c._id || c.id})`);
        console.log(`    Sent: ${c.sent_count || 0} | Last: ${c.last_lead_sent?.slice(0, 10) || 'N/A'}`);
      });
      console.log();
    });

    // Show most recent campaigns
    console.log("--- Most Recent Campaigns (All Statuses) ---\n");
    const sorted = campaigns
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      .slice(0, 10);

    sorted.forEach((c, i) => {
      console.log(`${i + 1}. ${c.name || 'Unnamed'}`);
      console.log(`   Status: ${c.status}`);
      console.log(`   ID: ${c._id || c.id}`);
      console.log(`   Created: ${c.created_at?.slice(0, 10) || 'N/A'}`);
      console.log(`   Sent: ${c.sent_count || 0} | Replied: ${c.last_lead_replied ? 'Yes' : 'No'}`);
      console.log();
    });

    return campaigns;
  } catch (err) {
    console.error("❌ Error:", err.message);
    return null;
  }
}

async function main() {
  const COMPANY_ID = "a29720a9-f0f7-40d7-ac74-5fc4b815b9a1";

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

  await getAllCampaigns(workspaceId, apiKey);
}

main().catch(console.error);
