const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const admin = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
  const COMPANY_ID = "a29720a9-f0f7-40d7-ac74-5fc4b815b9a1";

  console.log("=== Verifying Inbox Import ===\n");

  const { data: messages, error, count } = await admin
    .from("inbox_messages")
    .select("*", { count: "exact" })
    .eq("company_id", COMPANY_ID)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("❌ Error:", error.message);
    return;
  }

  console.log(`✅ Database now has ${count || 0} inbox messages\n`);

  if (messages && messages.length > 0) {
    console.log("--- Messages ---");
    messages.forEach((msg, i) => {
      const sentimentIcon = msg.sentiment === 'positive' ? '✅' : msg.sentiment === 'negative' ? '❌' : '➖';
      console.log(`${i + 1}. ${sentimentIcon} ${msg.subject}`);
      console.log(`   From: ${msg.from_email}`);
      console.log(`   Sentiment: ${msg.sentiment} | Priority: ${msg.priority}`);
      console.log(`   PlusVibe ID: ${msg.plusvibe_id}`);
      console.log(`   Date: ${msg.created_at}`);
      console.log();
    });
  }

  // Summary
  const positive = messages?.filter(m => m.sentiment === 'positive').length || 0;
  const negative = messages?.filter(m => m.sentiment === 'negative').length || 0;
  const neutral = messages?.filter(m => m.sentiment === 'neutral').length || 0;

  console.log("=== Summary ===");
  console.log(`Total: ${count}`);
  console.log(`✅ Positive: ${positive}`);
  console.log(`❌ Negative: ${negative}`);
  console.log(`➖ Neutral: ${neutral}`);
}

main().catch(console.error);
