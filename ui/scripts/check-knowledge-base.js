const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(supabaseUrl, supabaseServiceKey);

async function checkKnowledgeBase() {
  console.log("=== Checking Knowledge Base ===\n");

  const COMPANY_ID = "a29720a9-f0f7-40d7-ac74-5fc4b815b9a1";

  // 1. Check if knowledge_base table exists and has data
  console.log("1. Knowledge Base Table");
  const { data: kb, error: kbError } = await admin
    .from("knowledge_base")
    .select("*")
    .eq("company_id", COMPANY_ID);

  if (kbError) {
    console.log(`   ❌ Error: ${kbError.message}`);
    if (kbError.message.includes("does not exist")) {
      console.log("   Table doesn't exist!");
    }
  } else {
    console.log(`   ✅ Found ${kb?.length || 0} entries`);
    if (kb && kb.length > 0) {
      kb.slice(0, 3).forEach((item, i) => {
        console.log(`   ${i+1}. ${item.title || 'Untitled'} (${item.source_type || 'unknown'})`);
      });
    }
  }
  console.log();

  // 2. Check company credentials for Supermemory
  console.log("2. Supermemory Credentials");
  const { data: company } = await admin
    .from("companies")
    .select("name, integration_credentials")
    .eq("id", COMPANY_ID)
    .single();

  const ic = company?.integration_credentials || {};
  console.log(`   supermemory_api_key: ${ic.supermemory_api_key ? '✅ SET' : '❌ NOT SET'}`);
  console.log(`   supermemory_user_id: ${ic.supermemory_user_id ? '✅ SET' : '❌ NOT SET'}`);
  console.log();

  // 3. Check supermemory_documents table
  console.log("3. Supermemory Documents Table");
  const { data: docs, error: docsError } = await admin
    .from("supermemory_documents")
    .select("*")
    .eq("company_id", COMPANY_ID);

  if (docsError) {
    console.log(`   ❌ Error: ${docsError.message}`);
  } else {
    console.log(`   ✅ Found ${docs?.length || 0} documents`);
    if (docs && docs.length > 0) {
      docs.slice(0, 3).forEach((doc, i) => {
        console.log(`   ${i+1}. ${doc.title || 'Untitled'} (${doc.status || 'unknown'})`);
      });
    }
  }
  console.log();

  // 4. Check integrations status
  console.log("4. Integration Status");
  const { data: integrations } = await admin
    .from("company_integrations")
    .select("*")
    .eq("company_id", COMPANY_ID)
    .eq("integration_type", "supermemory");

  if (integrations && integrations.length > 0) {
    console.log(`   ✅ Found ${integrations.length} Supermemory integration(s)`);
    integrations.forEach((int, i) => {
      console.log(`   ${i+1}. Status: ${int.status || 'unknown'}`);
      console.log(`      Last sync: ${int.last_sync_at || 'never'}`);
    });
  } else {
    console.log(`   ❌ No Supermemory integration found`);
  }
  console.log();

  // 5. Summary
  console.log("=== Summary ===\n");
  if (!ic.supermemory_api_key) {
    console.log("🔴 MISSING: Supermemory API key not configured");
    console.log("   → Add to integration_credentials.supermemory_api_key");
  } else if ((kb?.length || 0) === 0 && (docs?.length || 0) === 0) {
    console.log("🟡 CONFIGURED BUT EMPTY: API key is set but no documents synced");
    console.log("   → Run Supermemory sync or add documents manually");
  } else {
    console.log("🟢 WORKING: Knowledge base has content");
  }
}

checkKnowledgeBase().catch(console.error);
