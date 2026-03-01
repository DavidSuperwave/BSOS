const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing Supabase credentials in .env.local");
  process.exit(1);
}

const admin = createClient(supabaseUrl, supabaseServiceKey);

async function checkCompany(companyId) {
  console.log(`\n=== Checking Company: ${companyId} ===\n`);

  const { data: company, error } = await admin
    .from("companies")
    .select("*")
    .eq("id", companyId)
    .single();

  if (error || !company) {
    console.error("Error fetching company:", error?.message || "Not found");
    return;
  }

  console.log("Company Name:", company.name);
  console.log("Slug:", company.slug);
  console.log("Owner Email:", company.owner_email);
  console.log("\n--- Legacy Columns ---");
  console.log("plusvibe_api_key:", company.plusvibe_api_key ? `${company.plusvibe_api_key.substring(0, 10)}...` : "NULL");
  console.log("plusvibe_workspace_id:", company.plusvibe_workspace_id || "NULL");

  console.log("\n--- Integration Credentials (JSONB) ---");
  const ic = company.integration_credentials || {};
  console.log("plusvibe_api_key:", ic.plusvibe_api_key ? `${ic.plusvibe_api_key.substring(0, 10)}...` : "NULL");
  console.log("plusvibe_workspace_id:", ic.plusvibe_workspace_id || "NULL");
  console.log("calendly_api_key:", ic.calendly_api_key ? "SET" : "NULL");
  console.log("calendly_user_uri:", ic.calendly_user_uri || "NULL");
  console.log("close_api_key:", ic.close_api_key ? "SET" : "NULL");

  // Check if PlusVibe key equals workspace ID (misconfiguration)
  const pvKey = ic.plusvibe_api_key || company.plusvibe_api_key;
  const pvWorkspace = ic.plusvibe_workspace_id || company.plusvibe_workspace_id;
  
  console.log("\n--- Validation ---");
  if (pvKey === pvWorkspace) {
    console.log("❌ ISSUE: PlusVibe API key equals workspace ID - misconfigured!");
  } else if (pvKey && pvWorkspace) {
    console.log("✅ PlusVibe credentials look valid (key != workspace)");
  } else {
    console.log("⚠️ PlusVibe credentials incomplete");
  }

  if (ic.calendly_api_key && !ic.calendly_user_uri) {
    console.log("⚠️ Calendly API key set but user URI missing - needs auto-resolution");
  } else if (ic.calendly_api_key && ic.calendly_user_uri) {
    console.log("✅ Calendly fully configured");
  } else {
    console.log("⚠️ Calendly not configured");
  }
}

async function findCompanyByEmail(email) {
  console.log(`\n=== Searching for company by email: ${email} ===\n`);

  // Try to find via account_members join
  const { data: members, error: memberError } = await admin
    .from("account_members")
    .select("company_id")
    .eq("user_id", email); // This might not work - need to check schema

  if (memberError) {
    console.log("Could not query by email, trying name search...");
  }

  // Fallback to name search
  const { data: companies, error } = await admin
    .from("companies")
    .select("id, name, slug")
    .ilike("name", "%superdunked%");

  if (error) {
    console.error("Error:", error.message);
    return;
  }

  if (!companies || companies.length === 0) {
    console.log("No companies found.");
    return;
  }

  console.log(`Found ${companies.length} company(s):`);
  companies.forEach(c => {
    console.log(`  - ${c.name} (${c.slug}) - ID: ${c.id}`);
  });

  return companies[0].id;
}

async function main() {
  // First find Superdunked by email
  const companyId = await findCompanyByEmail("axeljlxmarkeing@gmail.com");
  
  if (companyId) {
    await checkCompany(companyId);
  }

  // Also check if there's a company named Superdunked
  console.log("\n\n=== Searching for 'Superdunked' by name ===\n");
  const { data: byName } = await admin
    .from("companies")
    .select("id, name, slug")
    .ilike("name", "%superdunked%");

  if (byName && byName.length > 0) {
    console.log("Found:");
    byName.forEach(c => console.log(`  - ${c.name} (${c.slug}) - ID: ${c.id}`));
  }
}

main().catch(console.error);
