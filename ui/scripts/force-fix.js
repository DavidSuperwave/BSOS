const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data: msgs } = await admin.from("inbox_messages").select("id,subject,tags");
  for (const msg of msgs) {
    const label = (msg.tags?.[0] || "").toUpperCase();
    let sentiment = "neutral";
    // Check NOT_INTERESTED first since it contains "INTERESTED"
    if (label === "NOT_INTERESTED") sentiment = "negative";
    else if (label === "INTERESTED") sentiment = "positive";
    else if (label === "AUTOMATIC_REPLY") sentiment = "neutral";
    console.log("Updating " + msg.subject + " to " + sentiment + " (label: " + label + ")");
    await admin.from("inbox_messages").update({ sentiment }).eq("id", msg.id);
  }
}
main();
