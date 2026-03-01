const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data, error } = await admin
    .from("inbox_messages")
    .select("from_email, sentiment, close_lead_id, subject, tags")
    .eq("sentiment", "positive");
  
  if (error) {
    console.log("Error:", error.message);
    return;
  }
  
  console.log("Positive messages:", data?.length || 0);
  data?.forEach(m => {
    const status = m.close_lead_id ? "✅ SYNCED" : "⏳ NOT SYNCED";
    console.log(status + " | " + m.from_email + " | " + (m.subject?.slice(0, 40) || ""));
  });
}
main();
