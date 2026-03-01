const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });

const PLUSVIBE_BASE = "https://api.plusvibe.ai/api/v1";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const admin = createClient(supabaseUrl, supabaseServiceKey);

async function getPlusVibeReplies(workspaceId, apiKey) {
  console.log(`\n=== Fetching PlusVibe Replies ===`);
  console.log(`Workspace: ${workspaceId}\n`);

  try {
    // Fetch replies from PlusVibe
    const res = await fetch(
      `${PLUSVIBE_BASE}/replies?workspace_id=${workspaceId}&limit=50`,
      {
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
      }
    );

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`❌ API Error: ${res.status} - ${errorText.slice(0, 200)}`);
      return null;
    }

    const data = await res.json();
    
    // PlusVibe might return different structures
    const replies = Array.isArray(data) ? data : 
                    Array.isArray(data?.data) ? data.data :
                    Array.isArray(data?.replies) ? data.replies :
                    Array.isArray(data?.value) ? data.value : [];

    console.log(`✅ Found ${replies.length} replies\n`);

    if (replies.length > 0) {
      console.log("--- Reply Summary ---");
      replies.slice(0, 10).forEach((reply, i) => {
        console.log(`\n${i + 1}. ${reply.subject || 'No Subject'}`);
        console.log(`   From: ${reply.from_email || reply.from || 'Unknown'}`);
        console.log(`   Date: ${reply.created_at || reply.date || 'Unknown'}`);
        console.log(`   Status: ${reply.status || 'Unknown'}`);
        console.log(`   Content preview: ${(reply.body || reply.content || '').substring(0, 100)}...`);
      });
    }

    return replies;
  } catch (err) {
    console.error("❌ Error fetching replies:", err.message);
    return null;
  }
}

async function checkInboxInDatabase(companyId) {
  console.log(`\n=== Checking Database Inbox for Company: ${companyId} ===\n`);

  const { data: messages, error } = await admin
    .from("inbox_messages")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("❌ Database error:", error.message);
    return null;
  }

  console.log(`✅ Found ${messages?.length || 0} inbox messages in database\n`);

  if (messages && messages.length > 0) {
    console.log("--- Database Messages ---");
    messages.forEach((msg, i) => {
      console.log(`\n${i + 1}. ${msg.subject || 'No Subject'}`);
      console.log(`   From: ${msg.from_email || 'Unknown'}`);
      console.log(`   Status: ${msg.status || 'Unknown'}`);
      console.log(`   Created: ${msg.created_at || 'Unknown'}`);
      console.log(`   PlusVibe ID: ${msg.plusvibe_reply_id || 'Not linked'}`);
    });
  } else {
    console.log("⚠️ No inbox messages found in database");
    console.log("   This explains why the inbox component appears empty!");
  }

  return messages;
}

async function checkInboxSyncStatus(companyId) {
  console.log(`\n=== Checking Inbox Sync Configuration ===\n`);

  // Check if there's a last_sync timestamp
  const { data: company } = await admin
    .from("companies")
    .select("inbox_last_sync, integration_credentials")
    .eq("id", companyId)
    .single();

  if (company?.inbox_last_sync) {
    console.log(`Last inbox sync: ${company.inbox_last_sync}`);
  } else {
    console.log("⚠️ No inbox_last_sync timestamp found");
    console.log("   Inbox may never have been synced from PlusVibe");
  }

  // Check webhook configuration
  const ic = company?.integration_credentials || {};
  if (ic.plusvibe_webhook_configured) {
    console.log("✅ PlusVibe webhooks configured");
  } else {
    console.log("⚠️ PlusVibe webhooks not configured");
    console.log("   Real-time reply updates won't work");
  }
}

async function main() {
  // Superdunked company ID
  const COMPANY_ID = "a29720a9-f0f7-40d7-ac74-5fc4b815b9a1";

  // Get company credentials
  const { data: company } = await admin
    .from("companies")
    .select("integration_credentials, plusvibe_api_key, plusvibe_workspace_id")
    .eq("id", COMPANY_ID)
    .single();

  if (!company) {
    console.error("Company not found");
    return;
  }

  const ic = company.integration_credentials || {};
  const apiKey = ic.plusvibe_api_key || company.plusvibe_api_key;
  const workspaceId = ic.plusvibe_workspace_id || company.plusvibe_workspace_id;

  if (!apiKey || !workspaceId) {
    console.error("❌ PlusVibe credentials not configured");
    return;
  }

  // Fetch from PlusVibe API
  const plusvibeReplies = await getPlusVibeReplies(workspaceId, apiKey);

  // Check what's in our database
  const dbMessages = await checkInboxInDatabase(COMPANY_ID);

  // Check sync status
  await checkInboxSyncStatus(COMPANY_ID);

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));
  console.log(`PlusVibe API: ${plusvibeReplies?.length || 0} replies`);
  console.log(`Our Database: ${dbMessages?.length || 0} messages`);
  
  if ((plusvibeReplies?.length || 0) > (dbMessages?.length || 0)) {
    console.log("\n⚠️ DISCREPANCY DETECTED!");
    console.log("PlusVibe has replies that aren't in our database.");
    console.log("\nPossible causes:");
    console.log("1. Inbox sync never ran");
    console.log("2. Webhook not receiving real-time updates");
    console.log("3. Import/migration script failed");
    console.log("\nNext step: Run inbox sync or check webhook configuration");
  }
}

main().catch(console.error);
