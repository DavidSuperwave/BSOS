const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data } = await admin
    .from("inbox_messages")
    .select("from_email, sentiment, close_lead_id, tags")
    .eq("sentiment", "positive");
  
  console.log("Positive messages:", data?.length || 0);
  data?.forEach(m => {
    console.log(`${m.from_email} | ${m.sentiment} | tag: ${m.tags?.[0] || 'none'} | close_id: ${m.close_lead_id || 'null'}`);
  });
}
main();
