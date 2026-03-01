const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });

const PLUSVIBE_BASE = "https://api.plusvibe.ai/api/v1";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const admin = createClient(supabaseUrl, supabaseServiceKey);

async function getPlusVibeUnibox(workspaceId, apiKey) {
  console.log(`\n=== Fetching PlusVibe Unibox Emails ===`);
  console.log(`Workspace: ${workspaceId}\n`);

  try {
    const res = await fetch(
      `${PLUSVIBE_BASE}/unibox/emails?workspace_id=${workspaceId}&email_type=received`,
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
    
    // PlusVibe returns { data: [...], page_trail: "..." }
    const emails = data.data || [];

    console.log(`✅ Found ${emails.length} emails in Unibox\n`);

    if (emails.length > 0) {
      console.log("--- All Received Emails ---");
      emails.forEach((email, i) => {
        console.log(`\n${i + 1}. ${email.subject || 'No Subject'}`);
        console.log(`   ID: ${email.id}`);
        console.log(`   From: ${email.from_address_email || email.lead || 'Unknown'}`);
        console.log(`   To: ${email.to_address_email_list || 'Unknown'}`);
        console.log(`   Lead: ${email.lead || 'N/A'}`);
        console.log(`   Campaign ID: ${email.campaign_id || 'N/A'}`);
        console.log(`   Label: ${email.label || 'None'}`);
        console.log(`   Is Unread: ${email.is_unread ? '✅ YES' : '❌ No'}`);
        console.log(`   Date: ${email.timestamp_created || 'Unknown'}`);
        console.log(`   Preview: ${email.content_preview?.substring(0, 100) || 'No preview'}...`);
        
        if (email.body?.text) {
          console.log(`   Body: ${email.body.text.substring(0, 150)}...`);
        }
      });
    }

    return emails;
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

async function importEmailsToInbox(companyId, emails) {
  console.log(`\n=== Importing ${emails.length} Emails to Database ===\n`);

  let imported = 0;
  let skipped = 0;
  let errors = 0;

  for (const email of emails) {
    try {
      // Check if already exists
      const { data: existing } = await admin
        .from("inbox_messages")
        .select("id")
        .eq("plusvibe_id", email.id)
        .single();

      if (existing) {
        console.log(`⏭️  Skipped (already exists): ${email.subject}`);
        skipped++;
        continue;
      }

      // Determine sentiment from label
      let sentiment = "neutral";
      let priority = "medium";

      if (email.label) {
        const label = email.label.toUpperCase();
        if (label.includes("INTERESTED") || label.includes("POSITIVE") || label.includes("MEETING")) {
          sentiment = "positive";
          priority = "high";
        } else if (label.includes("NOT_INTERESTED") || label.includes("NEGATIVE")) {
          sentiment = "negative";
          priority = "low";
        } else if (label.includes("AUTOMATIC_REPLY") || label.includes("OOO")) {
          sentiment = "neutral";
          priority = "low";
        }
      }

      // Insert into database
      const { error } = await admin.from("inbox_messages").insert({
        company_id: companyId,
        campaign_id: email.campaign_id || null,
        plusvibe_id: email.id,
        thread_id: email.thread_id || `thread_${email.lead}_${email.campaign_id || 'general'}`,
        from_email: email.from_address_email || email.lead,
        from_name: email.from_address_json?.[0]?.name || null,
        from_domain: (email.from_address_email || email.lead)?.split('@')[1] || null,
        to_email: email.to_address_email_list || email.eaccount,
        subject: email.subject,
        body: email.body?.html || email.body?.text || email.content_preview || "",
        body_text: email.body?.text || email.content_preview || "",
        sentiment,
        priority,
        tags: email.label ? [email.label] : [],
        created_at: email.timestamp_created || new Date().toISOString(),
      });

      if (error) {
        console.error(`❌ Error importing ${email.subject}:`, error.message);
        errors++;
      } else {
        console.log(`✅ Imported: ${email.subject}`);
        imported++;
      }
    } catch (err) {
      console.error(`❌ Error processing ${email.id}:`, err.message);
      errors++;
    }
  }

  console.log(`\n=== Import Summary ===`);
  console.log(`✅ Imported: ${imported}`);
  console.log(`⏭️  Skipped: ${skipped}`);
  console.log(`❌ Errors: ${errors}`);
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
  const emails = await getPlusVibeUnibox(workspaceId, apiKey);

  // Check database
  const dbData = await checkInboxDatabase(COMPANY_ID);

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("ANALYSIS SUMMARY");
  console.log("=".repeat(60));
  
  const plusvibeTotal = emails?.length || 0;
  const dbTotal = dbData?.count || 0;

  console.log(`PlusVibe Unibox: ${plusvibeTotal} emails`);
  console.log(`Our Database:    ${dbTotal} messages`);

  if (plusvibeTotal > 0 && plusvibeTotal > dbTotal) {
    console.log(`\n🔴 FOUND ${plusvibeTotal - dbTotal} EMAILS TO IMPORT!`);
    
    // Ask for confirmation or auto-import
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });

    readline.question('\nImport these emails to database? (yes/no): ', async (answer) => {
      readline.close();
      if (answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y') {
        await importEmailsToInbox(COMPANY_ID, emails);
        
        // Update company last sync
        await admin
          .from("companies")
          .update({ inbox_last_sync: new Date().toISOString() })
          .eq("id", COMPANY_ID);
        
        console.log("\n✅ Sync complete!");
      } else {
        console.log("\n❌ Import cancelled");
      }
    });
  } else if (plusvibeTotal === 0) {
    console.log("\n⚠️ No emails found in PlusVibe Unibox");
    console.log("   The 5 replies might be:");
    console.log("   - In your Gmail inbox (not PlusVibe)");
    console.log("   - In a different PlusVibe workspace");
    console.log("   - Not yet synced to Unibox");
  } else {
    console.log("\n✅ Inbox appears to be in sync");
  }
}

main().catch(console.error);
