const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(supabaseUrl, supabaseServiceKey);

async function testDashboardApi() {
  const COMPANY_ID = "a29720a9-f0f7-40d7-ac74-5fc4b815b9a1";

  console.log("=== Testing Dashboard Metrics API ===\n");

  // Simulate the API call
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  
  try {
    const res = await fetch(`${baseUrl}/api/dashboard/metrics?companyId=${COMPANY_ID}`, {
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`❌ API Error: ${res.status}`);
      console.error(err.slice(0, 500));
      return;
    }

    const data = await res.json();
    
    console.log("✅ Dashboard API Response:\n");
    console.log(JSON.stringify(data, null, 2));
    
    // Check for new plusvibeStats
    if (data.plusvibeStats) {
      console.log("\n📊 PlusVibe Stats Cards:\n");
      console.log(`Total Leads: ${data.plusvibeStats.totalLeads?.toLocaleString()}`);
      console.log(`Contacted: ${data.plusvibeStats.contacted?.toLocaleString()}`);
      console.log(`Replied: ${data.plusvibeStats.replied?.toLocaleString()}`);
      console.log(`Positive: ${data.plusvibeStats.positive?.toLocaleString()}`);
    }
  } catch (err) {
    console.error("❌ Error:", err.message);
    console.log("\n⚠️  Could not connect to local API.");
    console.log("Make sure the Next.js dev server is running on port 3000.");
  }
}

testDashboardApi().catch(console.error);
