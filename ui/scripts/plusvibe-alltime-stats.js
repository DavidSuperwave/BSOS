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

  console.log("=== PlusVibe ALL-TIME Stats ===\n");

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

  // Get all-time stats (wide date range)
  const startDate = "2020-01-01";
  const endDate = "2030-12-31";
  const dateRange = `start_date=${startDate}&end_date=${endDate}`;
  
  const stats = await plusvibeApi(
    `/campaign/stats?workspace_id=${workspaceId}&${dateRange}`,
    apiKey
  );
  
  if (stats.error) {
    console.error(`❌ Failed: ${stats.error}`);
    return;
  }

  // Aggregate all campaign stats
  let totalLeads = 0;
  let totalContacted = 0;
  let totalSent = 0;
  let totalReplied = 0;
  let totalPositive = 0;
  let totalBounced = 0;
  let totalCompleted = 0;

  stats.forEach(c => {
    totalLeads += c.lead_count || 0;
    totalContacted += c.lead_contacted_count || 0;
    totalSent += c.sent_count || 0;
    totalReplied += c.replied_count || 0;
    totalPositive += c.positive_reply_count || 0;
    totalBounced += c.bounced_count || 0;
    totalCompleted += c.completed_lead_count || 0;
  });

  // Calculate percentages
  const contactedPct = totalLeads > 0 ? ((totalContacted / totalLeads) * 100).toFixed(1) : 0;
  const repliedPct = totalLeads > 0 ? ((totalReplied / totalLeads) * 100).toFixed(1) : 0;
  const positivePct = totalReplied > 0 ? ((totalPositive / totalReplied) * 100).toFixed(1) : 0;
  const bouncedPct = totalLeads > 0 ? ((totalBounced / totalLeads) * 100).toFixed(1) : 0;
  const finishedPct = totalLeads > 0 ? ((totalCompleted / totalLeads) * 100).toFixed(1) : 0;

  console.log("📊 ALL-TIME CAMPAIGN STATISTICS\n");
  console.log("═══════════════════════════════════════════\n");
  
  console.log(`📧 Total Leads:        ${totalLeads.toLocaleString()}`);
  console.log(`📤 Total Contacted:    ${totalContacted.toLocaleString()} (${contactedPct}%)`);
  console.log(`✅ Finished:           ${totalCompleted.toLocaleString()} (${finishedPct}%)`);
  console.log(`📨 Total Sent:         ${totalSent.toLocaleString()}`);
  console.log(`💬 Total Replied:      ${totalReplied.toLocaleString()} (${repliedPct}%)`);
  console.log(`✅ Positive Replies:   ${totalPositive.toLocaleString()} (${positivePct}% of replies)`);
  console.log(`❌ Bounced:            ${totalBounced.toLocaleString()} (${bouncedPct}%)`);
  
  console.log("\n═══════════════════════════════════════════\n");
  
  console.log("📈 Comparison with Your Numbers:\n");
  console.log(`                    API          Your Numbers`);
  console.log(`─────────────────────────────────────────────`);
  console.log(`Total Leads:      ${totalLeads.toLocaleString().padStart(6)}       26,017`);
  console.log(`Contacted:        ${totalContacted.toLocaleString().padStart(6)}       18,175`);
  console.log(`Finished:         ${totalCompleted.toLocaleString().padStart(6)}       13,867 (53.3%)`);
  console.log(`Replied:          ${totalReplied.toLocaleString().padStart(6)}          317 (1.7%)`);
  console.log(`Positive:         ${totalPositive.toLocaleString().padStart(6)}           69 (21.8%)`);
  console.log(`Bounced:          ${totalBounced.toLocaleString().padStart(6)}          240 (0.7%)`);
  console.log(`─────────────────────────────────────────────`);
  
  if (totalLeads !== 26017) {
    console.log("\n⚠️  NOTE: Numbers don't match exactly.");
    console.log("   The API returns data for campaigns within the date range.");
    console.log("   Some campaigns may be outside this range or filtered.");
  }

  console.log("\n📊 Top Campaigns by Leads:\n");
  
  stats.sort((a, b) => (b.lead_count || 0) - (a.lead_count || 0));
  
  stats.slice(0, 10).forEach((c, i) => {
    console.log(`${i + 1}. ${c.camp_name || 'Unnamed'}`);
    console.log(`   Leads: ${c.lead_count?.toLocaleString() || 0} | Status: ${c.status}`);
    console.log(`   Sent: ${c.sent_count || 0} | Replied: ${c.replied_count || 0} | Positive: ${c.positive_reply_count || 0}`);
    console.log();
  });
}

main().catch(console.error);
