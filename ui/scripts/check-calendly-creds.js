const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
  const COMPANY_ID = "a29720a9-f0f7-40d7-ac74-5fc4b815b9a1";

  console.log("=== Superdunked Calendly Credentials ===\n");

  const { data: company, error } = await admin
    .from("companies")
    .select("name, integration_credentials")
    .eq("id", COMPANY_ID)
    .single();

  if (error || !company) {
    console.error("Error:", error?.message || "Company not found");
    return;
  }

  console.log(`Company: ${company.name}\n`);

  const ic = company.integration_credentials || {};

  console.log("--- Integration Credentials JSONB ---");
  console.log("calendly_api_key:", ic.calendly_api_key ? "✅ SET" : "❌ NOT SET");
  console.log("calendly_user_uri:", ic.calendly_user_uri ? "✅ SET" : "❌ NOT SET");

  if (ic.calendly_api_key) {
    console.log("\n✅ Calendly is configured!");
    console.log("User URI:", ic.calendly_user_uri);
  } else {
    console.log("\n❌ Calendly API key NOT found in Supabase");
  }
}

main().catch(console.error);
