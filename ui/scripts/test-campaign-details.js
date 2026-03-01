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

  console.log("=== Testing Individual Campaign Data ===\n");

  const { data: company } = await admin
    .from("companies")
    .select("integration_credentials")
    .eq("id", COMPANY_ID)
    .single();

  const ic = company?.integration_credentials || {};
  const apiKey = ic.plusvibe_api_key;
  const workspaceId = ic.plusvibe_workspace_id;
  const campaignId = "698f5d50c9113ffb4aa9a188"; // M&A 11-50 emp campaign

  if (!apiKey || !workspaceId) {
    console.error("❌ PlusVibe credentials not configured");
    return;
  }

  // Test different endpoints for individual campaign data
  const tests = [
    {
      name: "Campaign Stats with campaign_id",
      url: `/campaign/stats?workspace_id=${workspaceId}&campaign_id=${campaignId}&start_date=2020-01-01&end_date=2030-12-31`
    },
    {
      name: "Campaign Summary",
      url: `/campaign/summary?workspace_id=${workspaceId}&campaign_id=${campaignId}`
    },
    {
      name: "Campaign Status",
      url: `/campaign/status?workspace_id=${workspaceId}&campaign_id=${campaignId}`
    },
    {
      name: "Campaign Details (list with filter)",
      url: `/campaign/list?workspace_id=${workspaceId}`
    },
    {
      name: "Campaign Emails",
      url: `/campaign/emails?workspace_id=${workspaceId}&campaign_id=${campaignId}`
    },
  ];

  for (const test of tests) {
    console.log(`\n🔍 ${test.name}`);
    console.log(`URL: ${test.url}`);
    const result = await plusvibeApi(test.url, apiKey);
    
    if (result.error) {
      console.log(`❌ Error: ${result.error}`);
    } else {
      console.log(`✅ Success`);
      // Show sample of data
      const dataStr = JSON.stringify(result, null, 2);
      console.log(dataStr.slice(0, 800) + (dataStr.length > 800 ? "..." : ""));
    }
  }

  console.log("\n\n=== Best Approach for Campaign Stats ===");
  console.log("The /campaign/stats endpoint returns ALL campaigns by default.");
  console.log("To get individual campaign stats, filter the results by campaign_id.");
}

main().catch(console.error);
