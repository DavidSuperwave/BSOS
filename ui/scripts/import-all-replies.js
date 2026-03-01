const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });

const PLUSVIBE_BASE = "https://api.plusvibe.ai/api/v1";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const admin = createClient(supabaseUrl, supabaseServiceKey);

async function fetchAllUniqueEmails(workspaceId, apiKey) {
  console.log(`=== Fetching All PlusVibe Emails ===\n`);

  const seenIds = new Set();
  const allEmails = [];
  let pageTrail = null;
  let page = 1;

  while (true) {
    let url = `${PLUSVIBE_BASE}/unibox/emails?workspace_id=${workspaceId}`;
    if (pageTrail) url += `&page_trail=${pageTrail}`;

    try {
      const res = await fetch(url, {
        headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      });

      if (!res.ok) break;

      const data = await res.json();
      const emails = data.data || [];

      // Only add unique emails
      for (const email of emails) {
        if (!seenIds.has(email.id)) {
          seenIds.add(email.id);
          allEmails.push(email);
        }
      }

      pageTrail = data.page_trail;
      if (!pageTrail || page >= 10) break;
      page++;
    } catch {
      break;
    }
  }

  return allEmails;
}

async function importEmails(companyId, emails) {
  console.log(`\n=== Importing ${emails.length} Emails ===\n`);

  let imported = 0;
  let skipped = 0;
  let errors = 0;

  for (const email of emails) {
    try {
      // Check if exists
      const { data: existing } = await admin
        .from("inbox_messages")
        .select("id")
        .eq("plusvibe_id", email.id)
        .single();

      if (existing) {
        skipped++;
        continue;
      }

      // Determine sentiment
      const label = (email.label || "").toUpperCase();
      let sentiment = "neutral";
      let priority = "medium";

      if (label === "INTERESTED" || label === "MEETING_BOOKED") {
        sentiment = "positive";
        priority = "high";
      } else if (label === "NOT_INTERESTED") {
        sentiment = "negative";
        priority = "low";
      } else if (label === "AUTOMATIC_REPLY" || label.includes("OOO")) {
        sentiment = "neutral";
        priority = "low";
      }

      // Insert
      const { error } = await admin.from("inbox_messages").insert({
        company_id: companyId,
        campaign_id: email.campaign_id || null,
        plusvibe_id: email.id,
        thread_id: email.thread_id || `thread_${email.lead}_${email.campaign_id || 'general'}`,
        from_email: email.from_address_email || email.lead,
        from_name: email.from_address_json?.[0]?.name || null,
        from_domain: (email.from_address_email || email.lead)?.split("@")[1] || null,
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
        console.log(`❌ ${email.subject}: ${error.message}`);
        errors++;
      } else {
        console.log(`✅ ${email.subject.substring(0, 50)}`);
        imported++;
      }
    } catch (err) {
      console.log(`❌ ${email.id}: ${err.message}`);
      errors++;
    }
  }

  console.log(`\n=== Results ===`);
  console.log(`✅ Imported: ${imported}`);
  console.log(`⏭️  Skipped: ${skipped}`);
  console.log(`❌ Errors: ${errors}`);

  return { imported, skipped, errors };
}

async function main() {
  const COMPANY_ID = "a29720a9-f0f7-40d7-ac74-5fc4b815b9a1";

  const { data: company } = await admin
    .from("companies")
    .select("integration_credentials, plusvibe_api_key, plusvibe_workspace_id, name")
    .eq("id", COMPANY_ID)
    .single();

  if (!company) {
    console.error("Company not found");
    return;
  }

  console.log(`Company: ${company.name}\n`);

  const ic = company.integration_credentials || {};
  const apiKey = ic.plusvibe_api_key || company.plusvibe_api_key;
  const workspaceId = ic.plusvibe_workspace_id || company.plusvibe_workspace_id;

  // Fetch all unique emails
  const emails = await fetchAllUniqueEmails(workspaceId, apiKey);
  console.log(`Found ${emails.length} unique emails\n`);

  // Show sample
  console.log("--- Sample ---");
  emails.slice(0, 5).forEach((e, i) => {
    console.log(`${i + 1}. ${e.subject?.substring(0, 60)} (${e.from_address_email || e.lead})`);
  });

  if (emails.length > 0) {
    console.log(`\nImport ${emails.length} emails? (yes/no): `);
    process.stdin.once("data", async (data) => {
      const answer = data.toString().trim().toLowerCase();
      if (answer === "yes" || answer === "y") {
        await importEmails(COMPANY_ID, emails);
        
        // Update sync timestamp
        await admin
          .from("companies")
          .update({ inbox_last_sync: new Date().toISOString() })
          .eq("id", COMPANY_ID);
        
        console.log("\n✅ Complete!");
      } else {
        console.log("\n❌ Cancelled");
      }
      process.exit(0);
    });
  }
}

main().catch(console.error);
