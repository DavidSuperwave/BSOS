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

  console.log("=== Verifying All Campaigns Get Stats ===\n");

  const { data: company } = await admin
    .from("companies")
    .select("integration_credentials")
    .eq("id", COMPANY_ID)
    .single();

  const ic = company?.integration_credentials || {};
  const apiKey = ic.plusvibe_api_key;
  const workspaceId = ic.plusvibe_workspace_id;

  // Get campaign list
  const listRes = await plusvibeApi(`/campaign/list?workspace_id=${workspaceId}`, apiKey);
  const campaigns = Array.isArray(listRes) ? listRes : listRes.data || [];
  
  console.log(`📊 Total campaigns from /campaign/list: ${campaigns.length}\n`);

  // Get stats
  const startDate = "2020-01-01";
  const endDate = "2030-12-31";
  const statsRes = await plusvibeApi(
    `/campaign/stats?workspace_id=${workspaceId}&start_date=${startDate}&end_date=${endDate}`,
    apiKey
  );

  const stats = Array.isArray(statsRes) ? statsRes : [];
  console.log(`📈 Campaigns with stats: ${stats.length}\n`);

  // Create stats map
  const statsMap = stats.reduce((acc, stat) => {
    if (stat._id) acc[stat._id] = stat;
    return acc;
  }, {});

  // Check each campaign
  let withStats = 0;
  let withoutStats = 0;

  console.log("--- Campaign Stats Status ---\n");
  
  campaigns.forEach((c, i) => {
    const id = c._id || c.id;
    const hasStats = !!statsMap[id];
    
    if (hasStats) {
      withStats++;
      console.log(`${i+1}. ✅ ${c.name?.slice(0, 40)} (${c.status}) - HAS STATS`);
    } else {
      withoutStats++;
      console.log(`${i+1}. ❌ ${c.name?.slice(0, 40)} (${c.status}) - NO STATS`);
    }
  });

  console.log("\n=== Summary ===");
  console.log(`Total campaigns: ${campaigns.length}`);
  console.log(`With stats: ${withStats}`);
  console.log(`Without stats: ${withoutStats}`);
  
  console.log("\n💡 Note:");
  console.log("Campaigns WITHOUT stats are likely:");
  console.log("- DRAFT campaigns (never activated)");
  console.log("- Campaigns with no email activity");
  console.log("- Newly created campaigns");
}

main().catch(console.error);
