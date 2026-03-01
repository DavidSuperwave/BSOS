const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing Supabase credentials");
  process.exit(1);
}

const admin = createClient(supabaseUrl, supabaseServiceKey);

const CALENDLY_BASE = "https://api.calendly.com";

async function resolveCalendlyUserUri(apiKey) {
  try {
    const res = await fetch(`${CALENDLY_BASE}/users/me`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.resource?.uri || null;
  } catch {
    return null;
  }
}

async function fixCompany(companyId) {
  console.log(`\n=== Fixing Company: ${companyId} ===\n`);

  const { data: company, error } = await admin
    .from("companies")
    .select("*")
    .eq("id", companyId)
    .single();

  if (error || !company) {
    console.error("Error:", error?.message || "Not found");
    return;
  }

  console.log("Company:", company.name);
  
  const ic = company.integration_credentials || {};
  const legacyKey = company.plusvibe_api_key;
  const legacyWorkspace = company.plusvibe_workspace_id;
  
  let updates = { ...ic };
  let changes = [];

  // Fix PlusVibe if misconfigured
  if (ic.plusvibe_api_key === ic.plusvibe_workspace_id) {
    console.log("❌ PlusVibe API key equals workspace ID in JSONB");
    if (legacyKey && legacyWorkspace && legacyKey !== legacyWorkspace) {
      updates.plusvibe_api_key = legacyKey;
      updates.plusvibe_workspace_id = legacyWorkspace;
      changes.push("PlusVibe credentials copied from legacy columns");
      console.log("✅ Fixed: Copied correct values from legacy columns");
    } else {
      console.log("⚠️ Legacy columns also invalid - manual fix needed");
    }
  } else {
    console.log("✅ PlusVibe credentials look correct");
  }

  // Fix Calendly user URI if missing
  if (ic.calendly_api_key && !ic.calendly_user_uri) {
    console.log("⚠️ Calendly user URI missing, attempting to resolve...");
    const userUri = await resolveCalendlyUserUri(ic.calendly_api_key);
    if (userUri) {
      updates.calendly_user_uri = userUri;
      changes.push("Calendly user URI auto-resolved");
      console.log("✅ Fixed: Calendly user URI resolved and saved");
    } else {
      console.log("❌ Could not resolve Calendly user URI");
    }
  } else if (ic.calendly_user_uri) {
    console.log("✅ Calendly user URI already set");
  }

  // Apply updates if any
  if (changes.length > 0) {
    const { error: updateError } = await admin
      .from("companies")
      .update({ integration_credentials: updates })
      .eq("id", companyId);

    if (updateError) {
      console.error("❌ Failed to save updates:", updateError.message);
    } else {
      console.log("\n✅ Updates saved successfully:");
      changes.forEach(c => console.log(`  - ${c}`));
    }
  } else {
    console.log("\n✅ No changes needed");
  }
}

// Fix Superdunked
const SUPERDUNKED_ID = "a29720a9-f0f7-40d7-ac74-5fc4b815b9a1";

fixCompany(SUPERDUNKED_ID).catch(console.error);
