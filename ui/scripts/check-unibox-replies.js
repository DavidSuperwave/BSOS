const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });

const PLUSVIBE_BASE = "https://server.plusvibe.com/api/v3";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const admin = createClient(supabaseUrl, supabaseServiceKey);

async function getPlusVibeUnibox(workspaceId, apiKey) {
  console.log(`\n=== Fetching PlusVibe Unibox Emails ===`);
  console.log(`Workspace: ${workspaceId}\n`);

  try {
    // Use the correct Unibox endpoint
    const res = await fetch(
      `${PLUSVIBE_BASE}/unibox/emails?workspace_id=${workspaceId}`,
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
    
    // PlusVibe returns emails array
    const emails = data.emails || [];

    console.log(`✅ Found ${emails.length} emails in Unibox\n`);

    // Count replies (emails with replies)
    const replies = emails.filter(e => e.replied || e.reply_count > 0 || e.last_reply);
    console.log(`📊 ${replies.length} emails have replies\n`);

    if (emails.length > 0) {
      console.log("--- Recent Emails ---");
      emails.slice(0, 5).forEach((email, i) => {
        console.log(`\n${i + 1}. ${email.subject || 'No Subject'}`);
        console.log(`   From: ${email.from_email || 'Unknown'}`);
        console.log(`   To: ${email.to_email || 'Unknown'}`);
        console.log(`   Has Reply: ${email.replied ? '✅ YES' : '❌ No'}`);
        console.log(`   Reply Count: ${email.reply_count || 0}`);
        console.log(`   Last Reply: ${email.last_reply || 'N/A'}`);
        console.log(`   Date: ${email.created_at || email.date || 'Unknown'}`);
        
        if (email.replied && email.replies && email.replies.length > 0) {
          console.log(`   Latest Reply Preview: ${(email.replies[0].body || '').substring(0, 100)}...`);
        }
      });

      // Show reply details
      if (replies.length > 0) {
        console.log("\n\n--- Emails WITH Replies ---");
        replies.forEach((email, i) => {
          console.log(`\n${i + 1}. ${email.subject}`);
          console.log(`   From Lead: ${email.from_email}`);
          console.log(`   Reply Count: ${email.reply_count || 1}`);
          if (email.replies) {
            email.replies.forEach((reply, j) => {
              console.log(`   Reply ${j + 1}: ${(reply.body || '').substring(0, 150)}...`);
            });
          }
        });
      }
    }

    return { emails, replies };
  } catch (err) {
    console.error("❌ Error fetching emails:", err.message);
    return null;
  }
}

async function checkInboxDatabase(companyId) {
  console.log(`\n=== Checking Database Inbox ===`);
  console.log(`Company: ${companyId}\n`);

  const { data: messages, error, count } = await admin
    .from("inbox_messages")
    .select("*", { count: "exact" })
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("❌ Database error:", error.message);
    return null;
  }

  console.log(`✅ Found ${count || 0} inbox messages in database`);
  console.log(`   Showing ${messages?.length || 0} most recent\n`);

  if (messages && messages.length > 0) {
    messages.forEach((msg, i) => {
      console.log(`${i + 1}. ${msg.subject || 'No Subject'}`);
      console.log(`   From: ${msg.from_email} → To: ${msg.to_email}`);
      console.log(`   Status: ${msg.status || 'unknown'}`);
      console.log(`   PlusVibe ID: ${msg.plusvibe_id || 'Not linked'}`);
      console.log(`   Created: ${msg.created_at}`);
      console.log();
    });
  } else {
    console.log("⚠️ Database inbox is EMPTY\n");
  }

  return { messages, count };
}

async function main() {
  const COMPANY_ID = "a29720a9-f0f7-40d7-ac74-5fc4b815b9a1";

  // Get company credentials
  const { data: company } = await admin
    .from("companies")
    .select("integration_credentials, plusvibe_api_key, plusvibe_workspace_id, name")
    .eq("id", COMPANY_ID)
    .single();

  if (!company) {
    console.error("Company not found");
    return;
  }

  console.log(`Company: ${company.name} (${COMPANY_ID})`);

  const ic = company.integration_credentials || {};
  const apiKey = ic.plusvibe_api_key || company.plusvibe_api_key;
  const workspaceId = ic.plusvibe_workspace_id || company.plusvibe_workspace_id;

  if (!apiKey || !workspaceId) {
    console.error("❌ PlusVibe credentials not configured");
    return;
  }

  // Fetch from PlusVibe Unibox
  const uniboxData = await getPlusVibeUnibox(workspaceId, apiKey);

  // Check database
  const dbData = await checkInboxDatabase(COMPANY_ID);

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("ANALYSIS SUMMARY");
  console.log("=".repeat(60));
  
  const plusvibeTotal = uniboxData?.emails?.length || 0;
  const plusvibeReplies = uniboxData?.replies?.length || 0;
  const dbTotal = dbData?.count || 0;

  console.log(`PlusVibe Unibox: ${plusvibeTotal} total emails`);
  console.log(`                 ${plusvibeReplies} with replies`);
  console.log(`Our Database:    ${dbTotal} inbox messages`);

  if (plusvibeReplies > 0 && dbTotal === 0) {
    console.log("\n🔴 CRITICAL ISSUE:");
    console.log("   PlusVibe has replies but our database is EMPTY!");
    console.log("\n   Root Cause:");
    console.log("   - Inbox sync has never run");
    console.log("   - No webhook receiving real-time updates");
    console.log("   - No initial import performed");
    console.log("\n   Solution:");
    console.log("   1. Run initial inbox import from PlusVibe");
    console.log("   2. Set up webhook for real-time updates");
    console.log("   3. Or run reply-monitor.js to sync");
  } else if (plusvibeReplies > dbTotal) {
    console.log("\n⚠️ SYNC NEEDED:");
    console.log(`   ${plusvibeReplies - dbTotal} replies not yet imported`);
  } else {
    console.log("\n✅ Inbox appears to be in sync");
  }
}

main().catch(console.error);
