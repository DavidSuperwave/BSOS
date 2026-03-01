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

  console.log("=== PlusVibe Dashboard Stats ===\n");

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

  // Get stats for last 30 days
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const dateRange = `start_date=${thirtyDaysAgo.toISOString().split('T')[0]}&end_date=${now.toISOString().split('T')[0]}`;
  
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
  let totalUnsubscribed = 0;
  let totalOpened = 0;

  stats.forEach(c => {
    totalLeads += c.lead_count || 0;
    totalContacted += c.lead_contacted_count || 0;
    totalSent += c.sent_count || 0;
    totalReplied += c.replied_count || 0;
    totalPositive += c.positive_reply_count || 0;
    totalBounced += c.bounced_count || 0;
    totalUnsubscribed += c.unsubscribed_count || 0;
    totalOpened += c.unique_opened_count || 0;
  });

  // Calculate percentages
  const contactedPct = totalLeads > 0 ? ((totalContacted / totalLeads) * 100).toFixed(1) : 0;
  const repliedPct = totalLeads > 0 ? ((totalReplied / totalLeads) * 100).toFixed(1) : 0;
  const positivePct = totalReplied > 0 ? ((totalPositive / totalReplied) * 100).toFixed(1) : 0;
  const bouncedPct = totalLeads > 0 ? ((totalBounced / totalLeads) * 100).toFixed(1) : 0;
  const openRate = totalSent > 0 ? ((totalOpened / totalSent) * 100).toFixed(1) : 0;

  console.log("📊 CAMPAIGN STATISTICS (Last 30 Days)\n");
  console.log("═══════════════════════════════════════════\n");
  
  console.log(`📧 Total Leads:        ${totalLeads.toLocaleString()}`);
  console.log(`📤 Total Contacted:    ${totalContacted.toLocaleString()} (${contactedPct}%)`);
  console.log(`📨 Total Sent:         ${totalSent.toLocaleString()}`);
  console.log(`👁️  Open Rate:          ${openRate}% (${totalOpened} opens)`);
  console.log(`💬 Total Replied:      ${totalReplied.toLocaleString()} (${repliedPct}%)`);
  console.log(`✅ Positive Replies:   ${totalPositive.toLocaleString()} (${positivePct}% of replies)`);
  console.log(`❌ Bounced:            ${totalBounced.toLocaleString()} (${bouncedPct}%)`);
  console.log(`🚫 Unsubscribed:       ${totalUnsubscribed.toLocaleString()}`);
  
  console.log("\n═══════════════════════════════════════════\n");
  
  console.log("📈 Campaign Breakdown:\n");
  
  stats.sort((a, b) => (b.lead_count || 0) - (a.lead_count || 0));
  
  stats.forEach((c, i) => {
    const replyRate = c.sent_count > 0 ? ((c.replied_count / c.sent_count) * 100).toFixed(1) : 0;
    console.log(`${i + 1}. ${c.camp_name || 'Unnamed'}`);
    console.log(`   Status: ${c.status} | Leads: ${c.lead_count?.toLocaleString() || 0}`);
    console.log(`   Sent: ${c.sent_count || 0} | Replied: ${c.replied_count || 0} (${replyRate}%)`);
    console.log(`   Positive: ${c.positive_reply_count || 0} | Bounced: ${c.bounced_count || 0}`);
    console.log();
  });

  // Export for dashboard
  console.log("\n📤 DASHBOARD API RESPONSE FORMAT:\n");
  console.log(JSON.stringify({
    totalLeads,
    totalContacted,
    totalSent,
    totalReplied,
    totalPositive,
    totalBounced,
    totalUnsubscribed,
    percentages: {
      contacted: contactedPct,
      replied: repliedPct,
      positive: positivePct,
      bounced: bouncedPct,
      openRate
    },
    campaigns: stats.map(c => ({
      id: c._id,
      name: c.camp_name,
      status: c.status,
      leads: c.lead_count,
      sent: c.sent_count,
      replied: c.replied_count,
      positive: c.positive_reply_count,
      bounced: c.bounced_count
    }))
  }, null, 2));
}

main().catch(console.error);
