const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const admin = createClient(supabaseUrl, supabaseServiceKey);

async function fixSentiment() {
  const COMPANY_ID = "a29720a9-f0f7-40d7-ac74-5fc4b815b9a1";

  console.log("=== Fixing Sentiment Values ===\n");

  // Get all messages
  const { data: messages } = await admin
    .from("inbox_messages")
    .select("id, subject, tags, sentiment")
    .eq("company_id", COMPANY_ID);

  if (!messages || messages.length === 0) {
    console.log("No messages found");
    return;
  }

  for (const msg of messages) {
    const label = (msg.tags?.[0] || "").toUpperCase();
    let sentiment = "neutral";
    let priority = "medium";

    if (label.includes("INTERESTED") || label.includes("MEETING")) {
      sentiment = "positive";
      priority = "high";
    } else if (label.includes("NOT_INTERESTED")) {
      sentiment = "negative";
      priority = "low";
    } else if (label.includes("AUTOMATIC_REPLY")) {
      sentiment = "neutral";
      priority = "low";
    }

    if (sentiment !== msg.sentiment) {
      const { error } = await admin
        .from("inbox_messages")
        .update({ sentiment, priority })
        .eq("id", msg.id);

      if (error) {
        console.log(`❌ ${msg.subject}: ${error.message}`);
      } else {
        console.log(`✅ ${msg.subject}: ${msg.sentiment} → ${sentiment}`);
      }
    } else {
      console.log(`⏭️  ${msg.subject}: already correct (${sentiment})`);
    }
  }
}

fixSentiment().catch(console.error);
