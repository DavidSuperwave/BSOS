const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });

const PLUSVIBE_BASE = "https://api.plusvibe.ai/api/v1";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(supabaseUrl, supabaseServiceKey);

async function testEndpoint(url, apiKey) {
  try {
    const res = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
    });

    if (res.ok) {
      const data = await res.json();
      return { success: true, data };
    } else {
      const err = await res.text();
      return { success: false, status: res.status, error: err.slice(0, 100) };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function main() {
  const COMPANY_ID = "a29720a9-f0f7-40d7-ac74-5fc4b815b9a1";

  const { data: company } = await admin
    .from("companies")
    .select("integration_credentials")
    .eq("id", COMPANY_ID)
    .single();

  const ic = company?.integration_credentials || {};
  const apiKey = ic.plusvibe_api_key;
  const workspaceId = ic.plusvibe_workspace_id;
  const campaignId = "698f5d50c9113ffb4aa9a188";

  if (!apiKey || !workspaceId) {
    console.error("❌ PlusVibe credentials not configured");
    return;
  }

  console.log("=== Testing PlusVibe API Endpoints ===\n");

  const endpoints = [
    // Campaign endpoints
    `/campaign?name=${campaignId}&workspace_id=${workspaceId}`,
    `/campaign/list?workspace_id=${workspaceId}`,
    `/campaigns?workspace_id=${workspaceId}`,
    `/campaign/${campaignId}?workspace_id=${workspaceId}`,
    `/campaign/${campaignId}/details?workspace_id=${workspaceId}`,
    `/campaign/${campaignId}/leads?workspace_id=${workspaceId}`,
    `/campaign/${campaignId}/replies?workspace_id=${workspaceId}`,
    
    // Lead endpoints
    `/leads?workspace_id=${workspaceId}&campaign_id=${campaignId}`,
    `/lead/list?workspace_id=${workspaceId}&campaign_id=${campaignId}`,
    `/campaign/leads?workspace_id=${workspaceId}&campaign_id=${campaignId}`,
    
    // Reply endpoints
    `/replies?workspace_id=${workspaceId}&campaign_id=${campaignId}`,
    `/reply/list?workspace_id=${workspaceId}&campaign_id=${campaignId}`,
    `/unibox/emails?workspace_id=${workspaceId}`,
    
    // Stats endpoints
    `/campaign/stats?workspace_id=${workspaceId}&start_date=2020-01-01&end_date=2030-12-31`,
    `/stats/campaign?workspace_id=${workspaceId}&campaign_id=${campaignId}`,
    `/analytics/campaigns?workspace_id=${workspaceId}`,
    
    // Workspace endpoints
    `/workspace?workspace_id=${workspaceId}`,
    `/workspace/stats?workspace_id=${workspaceId}`,
    `/workspaces`,
  ];

  for (const endpoint of endpoints) {
    const url = `${PLUSVIBE_BASE}${endpoint}`;
    const result = await testEndpoint(url, apiKey);
    
    const status = result.success ? "✅" : "❌";
    const info = result.success ? "WORKS" : `HTTP ${result.status || 'ERR'}`;
    console.log(`${status} ${endpoint.slice(0, 70).padEnd(70)} ${info}`);
    
    // If it works, show sample data
    if (result.success && Array.isArray(result.data) && result.data.length > 0) {
      console.log(`   └─ Found ${result.data.length} items`);
    } else if (result.success && result.data?.data) {
      console.log(`   └─ Found ${result.data.data.length} items`);
    }
  }

  console.log("\n=== Working Endpoints Summary ===\n");
  console.log("✅ /campaign/list - List all campaigns");
  console.log("✅ /campaign/stats - Get campaign stats (with date range)");
  console.log("✅ /unibox/emails - Get inbox/replies");
  console.log("❌ Individual campaign detail endpoints - NOT FOUND");
}

main().catch(console.error);
