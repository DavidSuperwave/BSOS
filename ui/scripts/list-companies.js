const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = "https://wmncawwcgnotizhowzii.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

async function main() {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // List all companies
  const { data: companies, error } = await supabase
    .from("companies")
    .select("id, name, slug")
    .limit(20);

  if (error) {
    console.error("Error:", error);
    process.exit(1);
  }

  console.log("Companies:");
  companies.forEach(c => console.log(`- ${c.name} (${c.slug}) - ${c.id}`));
}

main();
