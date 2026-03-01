const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data } = await admin.from("inbox_messages").select("subject,tags,sentiment");
  data.forEach(m => console.log(`${m.subject}: tags=${JSON.stringify(m.tags)}, sentiment=${m.sentiment}`));
}
main();
