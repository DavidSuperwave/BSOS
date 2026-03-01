const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data } = await admin
    .from("inbox_messages")
    .select("from_email, sentiment, tags")
    .order("created_at", { ascending: false })
    .limit(10);
  
  console.log("Recent messages:");
  data?.forEach(m => {
    console.log(`${m.sentiment?.padEnd(8)} | ${m.tags?.[0]?.padEnd(20)} | ${m.from_email}`);
  });
  
  // Count by sentiment
  const { data: counts } = await admin
    .from("inbox_messages")
    .select("sentiment");
    
  const summary = {};
  counts?.forEach(m => {
    summary[m.sentiment] = (summary[m.sentiment] || 0) + 1;
  });
  
  console.log("\nSummary:", summary);
}
main();
