const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });

const PLUSVIBE_BASE = "https://api.plusvibe.ai/api/v1";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const admin = createClient(supabaseUrl, supabaseServiceKey);

async function fetchAllEmails(workspaceId, apiKey) {
  console.log(`=== Fetching ALL PlusVibe Unibox Emails ===\n`);

  let allEmails = [];
  let pageTrail = null;
  let page = 1;

  while (true) {
    console.log(`Fetching page ${page}...`);

    let url = `${PLUSVIBE_BASE}/unibox/emails?workspace_id=${workspaceId}`;
    if (pageTrail) {
      url += `&page_trail=${pageTrail}`;
    }

    try {
      const res = await fetch(url, {
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error(`❌ API Error: ${res.status} - ${errorText.slice(0, 200)}`);
        break;
      }

      const data = await res.json();
      const emails = data.data || [];

      console.log(`  Found ${emails.length} emails on this page`);

      allEmails = allEmails.concat(emails);

      // Check for next page
      pageTrail = data.page_trail;
      if (!pageTrail || emails.length === 0) {
        console.log(`  No more pages\n`);
        break;
      }

      page++;

      // Safety limit
      if (page > 10) {
        console.log(`  Reached page limit\n`);
        break;
      }
    } catch (err) {
      console.error(`❌ Error: ${err.message}`);
      break;
    }
  }

  return allEmails;
}

async function fetchByType(workspaceId, apiKey, emailType) {
  console.log(`\n=== Fetching type: ${emailType} ===`);

  try {
    const res = await fetch(
      `${PLUSVIBE_BASE}/unibox/emails?workspace_id=${workspaceId}&email_type=${emailType}`,
      {
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
      }
    );

    if (!res.ok) {
      console.error(`❌ Error: ${res.status}`);
      return [];
    }

    const data = await res.json();
    const emails = data.data || [];
    console.log(`  Found ${emails.length} emails`);
    return emails;
  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
    return [];
  }
}

async function fetchOthersFolder(workspaceId, apiKey) {
  console.log(`\n=== Fetching "Others" folder ===`);
  console.log("(Replies not related to campaigns - kept for 2 weeks)\n");

  try {
    const res = await fetch(
      `${PLUSVIBE_BASE}/unibox/others?workspace_id=${workspaceId}`,
      {
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
      }
    );

    if (!res.ok) {
      console.error(`❌ Error: ${res.status}`);
      return [];
    }

    const data = await res.json();
    const emails = data.data || [];
    console.log(`  Found ${emails.length} emails in Others folder`);
    return emails;
  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
    return [];
  }
}

async function main() {
  const COMPANY_ID = "a29720a9-f0f7-40d7-ac74-5fc4b815b9a1";

  // Get credentials
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

  // Fetch all pages
  const allEmails = await fetchAllEmails(workspaceId, apiKey);

  // Also try different email types
  const allType = await fetchByType(workspaceId, apiKey, "all");
  const receivedType = await fetchByType(workspaceId, apiKey, "received");
  const sentType = await fetchByType(workspaceId, apiKey, "sent");

  // Try Others folder
  const othersFolder = await fetchOthersFolder(workspaceId, apiKey);

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));
  console.log(`All pages (paginated): ${allEmails.length} emails`);
  console.log(`Type 'all':            ${allType.length} emails`);
  console.log(`Type 'received':       ${receivedType.length} emails`);
  console.log(`Type 'sent':           ${sentType.length} emails`);
  console.log(`Others folder:         ${othersFolder.length} emails`);
  console.log(`\nTOTAL UNIQUE: ${new Set([...allEmails, ...allType, ...othersFolder].map(e => e.id)).size} emails`);

  if (allEmails.length > 0) {
    console.log("\n\n--- All Email Subjects ---");
    allEmails.forEach((email, i) => {
      console.log(`${i + 1}. ${email.subject || 'No Subject'} (${email.from_address_email || 'Unknown'})`);
    });
  }
}

main().catch(console.error);
