const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(supabaseUrl, supabaseServiceKey);

const CLOSE_API_KEY = process.env.CLOSE_API_KEY || "api_0HdbdhMSeluyXFS5vtZqoG.3rpXMwHXC84v547rzntLmD";

// Close CRM Status IDs
const CLOSE_STATUSES = {
  INTERESTED: 'stat_YZPfE0rqYeUym9EF0twuDwZl6dYKUzpSG11PwLPYVTQ',
  POTENTIAL: 'stat_vJnznN7N4fJTSxi9pn1M6hbs4RfeuCbu124DX8bIUz0',
  BAD_FIT: 'stat_v8gPNNVhTBlqy8fpsn8otCbrk0UNZwmjpSVdCGdWCFq',
  NURTURE: 'stat_4UtQuE9aIUZ1Y4Imr8UavuubTSlbWZo2LYgqfOsfFPO'
};

async function closeApi(endpoint, method = 'GET', body = null) {
  const auth = Buffer.from(`${CLOSE_API_KEY}:`).toString('base64');
  const opts = {
    method,
    headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' }
  };
  if (body) opts.body = JSON.stringify(body);
  
  try {
    const r = await fetch(`https://api.close.com/api/v1${endpoint}`, opts);
    if (!r.ok) {
      const err = await r.text();
      console.error(`Close API error ${r.status}: ${err.slice(0, 200)}`);
      return null;
    }
    return await r.json();
  } catch (e) {
    console.error('Close API error:', e.message);
    return null;
  }
}

async function createCloseLead(message) {
  const from_email = message.from_email;
  const from_name = message.from_name || from_email.split('@')[0];
  const subject = message.subject;
  const body = message.body_text || message.body;
  const campaign_id = message.campaign_id;
  
  // Determine status based on sentiment
  let statusId = CLOSE_STATUSES.POTENTIAL;
  let priority = 'warm';
  
  if (message.sentiment === 'positive') {
    statusId = CLOSE_STATUSES.INTERESTED;
    priority = 'hot';
  } else if (message.sentiment === 'negative') {
    statusId = CLOSE_STATUSES.BAD_FIT;
    priority = 'none';
  } else {
    statusId = CLOSE_STATUSES.NURTURE;
    priority = 'nurture';
  }

  // Create lead
  const lead = await closeApi('/lead/', 'POST', {
    name: from_name,
    status_id: statusId,
    contacts: [{
      name: from_name,
      emails: [{ email: from_email, type: 'office' }]
    }]
  });

  if (!lead || !lead.id) {
    console.error(`❌ Failed to create lead for ${from_email}`);
    return null;
  }

  // Add note with campaign info
  const noteText = `🎯 GTM ENGINE INBOX

CAMPAIGN: ${campaign_id || 'Unknown'}
SUBJECT: ${subject}
SENTIMENT: ${message.sentiment?.toUpperCase() || 'UNKNOWN'}
PRIORITY: ${priority.toUpperCase()}

---
${body?.slice(0, 500) || 'No content'}
---

Imported from PlusVibe Unibox`;

  await closeApi('/activity/note/', 'POST', {
    lead_id: lead.id,
    note: noteText
  });

  return lead;
}

async function main() {
  const COMPANY_ID = "a29720a9-f0f7-40d7-ac74-5fc4b815b9a1";

  console.log("=== Creating Close CRM Leads ===\n");

  // Get positive sentiment messages that haven't been synced to Close yet
  const { data: messages } = await admin
    .from("inbox_messages")
    .select("*")
    .eq("company_id", COMPANY_ID)
    .eq("sentiment", "positive")
    .is("close_lead_id", null);  // Only unsynced

  if (!messages || messages.length === 0) {
    console.log("No new positive replies to sync.");
    
    // Show already synced
    const { data: synced } = await admin
      .from("inbox_messages")
      .select("subject, from_email, close_lead_id")
      .eq("company_id", COMPANY_ID)
      .eq("sentiment", "positive")
      .not("close_lead_id", "is", null);
    
    if (synced?.length > 0) {
      console.log(`\nAlready synced to Close: ${synced.length} leads`);
      synced.forEach(m => console.log(`  ✅ ${m.from_email} → ${m.close_lead_id}`));
    }
    return;
  }

  console.log(`Found ${messages.length} positive replies to sync:\n`);

  for (const msg of messages) {
    console.log(`Creating lead for: ${msg.from_email}`);
    console.log(`  Subject: ${msg.subject?.slice(0, 60)}`);
    console.log(`  Campaign: ${msg.campaign_id || 'Unknown'}`);

    const lead = await createCloseLead(msg);

    if (lead) {
      // Update message with Close lead ID
      await admin
        .from("inbox_messages")
        .update({ close_lead_id: lead.id })
        .eq("id", msg.id);

      console.log(`  ✅ Created: ${lead.id}\n`);
    } else {
      console.log(`  ❌ Failed\n`);
    }
  }

  console.log("=== Sync Complete ===");
}

main().catch(console.error);
