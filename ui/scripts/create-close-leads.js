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
  
  // Extract company name from email domain
  const domain = from_email.split('@')[1];
  const company_name = domain?.split('.')[0]?.toUpperCase() || 'Unknown Company';
  
  // Determine status based on sentiment
  let statusId = CLOSE_STATUSES.INTERESTED;  // Positive replies = Interested
  let priority = 'hot';

  // Create lead with company name
  const lead = await closeApi('/lead/', 'POST', {
    name: company_name,
    status_id: statusId,
    contacts: [{
      name: from_name,
      title: 'Contact',
      emails: [{ email: from_email, type: 'office' }]
    }],
    description: `From campaign: ${campaign_id || 'Unknown'}`
  });

  if (!lead || !lead.id) {
    console.error(`❌ Failed to create lead for ${from_email}`);
    return null;
  }

  // Add note with full context
  const noteText = `🎯 GTM ENGINE - INBOX LEAD

📧 EMAIL: ${from_email}
👤 NAME: ${from_name}
📋 CAMPAIGN: ${campaign_id || 'Unknown'}
📅 RECEIVED: ${message.created_at}
💬 SENTIMENT: ${message.sentiment?.toUpperCase()}
🔖 TAGS: ${message.tags?.join(', ') || 'None'}

--- ORIGINAL EMAIL ---
Subject: ${subject}

${body?.slice(0, 800) || 'No content'}

---
Source: PlusVibe Unibox Import`;

  await closeApi('/activity/note/', 'POST', {
    lead_id: lead.id,
    note: noteText
  });

  // Add task to follow up
  await closeApi('/task/', 'POST', {
    lead_id: lead.id,
    text: `Follow up with ${from_name} - they replied positively to campaign`,
    due_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()  // Tomorrow
  });

  return lead;
}

async function main() {
  const COMPANY_ID = "a29720a9-f0f7-40d7-ac74-5fc4b815b9a1";

  console.log("=== Creating Close CRM Leads ===\n");

  // Get positive sentiment messages
  const { data: messages, error } = await admin
    .from("inbox_messages")
    .select("*")
    .eq("company_id", COMPANY_ID)
    .eq("sentiment", "positive");

  if (error) {
    console.error("Database error:", error.message);
    return;
  }

  if (!messages || messages.length === 0) {
    console.log("No positive replies found.");
    return;
  }

  console.log(`Found ${messages.length} positive replies to sync:\n`);

  const created = [];
  const failed = [];

  for (const msg of messages) {
    console.log(`\n${msg.from_email}`);
    console.log(`  Subject: ${msg.subject?.slice(0, 50)}`);
    console.log(`  Campaign: ${msg.campaign_id || 'Unknown'}`);
    console.log(`  Tags: ${msg.tags?.join(', ') || 'None'}`);

    const lead = await createCloseLead(msg);

    if (lead) {
      console.log(`  ✅ Created lead: ${lead.id}`);
      created.push({ email: msg.from_email, leadId: lead.id });
    } else {
      console.log(`  ❌ Failed`);
      failed.push(msg.from_email);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));
  console.log(`✅ Created: ${created.length} leads`);
  console.log(`❌ Failed: ${failed.length}`);
  
  if (created.length > 0) {
    console.log("\nCreated leads:");
    created.forEach(c => console.log(`  - ${c.email} → ${c.leadId}`));
  }
}

main().catch(console.error);
