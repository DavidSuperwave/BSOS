const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });

const CALENDLY_BASE = "https://api.calendly.com";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(supabaseUrl, supabaseServiceKey);

async function calendlyApi(endpoint, apiKey) {
  try {
    const res = await fetch(`${CALENDLY_BASE}${endpoint}`, {
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`❌ Calendly API error ${res.status}: ${err.slice(0, 200)}`);
      return null;
    }

    return await res.json();
  } catch (err) {
    console.error("❌ Error:", err.message);
    return null;
  }
}

async function main() {
  const COMPANY_ID = "a29720a9-f0f7-40d7-ac74-5fc4b815b9a1";

  console.log("=== Calendly Data for Superdunked ===\n");

  // Get credentials
  const { data: company } = await admin
    .from("companies")
    .select("name, integration_credentials")
    .eq("id", COMPANY_ID)
    .single();

  if (!company) {
    console.error("Company not found");
    return;
  }

  const ic = company.integration_credentials || {};
  const apiKey = ic.calendly_api_key;
  const userUri = ic.calendly_user_uri;

  if (!apiKey || !userUri) {
    console.error("❌ Calendly not configured");
    return;
  }

  console.log(`Company: ${company.name}\n`);

  // 1. Get user info
  console.log("--- User Info ---");
  const userData = await calendlyApi("/users/me", apiKey);
  if (userData?.resource) {
    const u = userData.resource;
    console.log(`Name: ${u.name || 'N/A'}`);
    console.log(`Email: ${u.email || 'N/A'}`);
    console.log(`Timezone: ${u.timezone || 'N/A'}`);
    console.log(`Created: ${u.created_at?.slice(0, 10) || 'N/A'}`);
    console.log(`Updated: ${u.updated_at?.slice(0, 10) || 'N/A'}`);
  }
  console.log();

  // 2. Get scheduled events (meetings)
  console.log("--- Scheduled Events (Last 7 Days) ---\n");
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  
  const eventsUrl = `/scheduled_events?user=${encodeURIComponent(userUri)}&min_start_time=${weekAgo.toISOString()}&max_start_time=${now.toISOString()}&count=100`;
  const eventsData = await calendlyApi(eventsUrl, apiKey);
  
  if (eventsData?.collection) {
    console.log(`Found ${eventsData.collection.length} events\n`);
    
    eventsData.collection.forEach((evt, i) => {
      console.log(`${i + 1}. ${evt.name || 'Meeting'}`);
      console.log(`   Status: ${evt.status}`);
      console.log(`   Start: ${new Date(evt.start_time).toLocaleString()}`);
      console.log(`   End: ${new Date(evt.end_time).toLocaleString()}`);
      console.log(`   Event Type: ${evt.event_type?.split('/').pop() || 'N/A'}`);
      console.log(`   Location: ${evt.location?.type || 'N/A'} ${evt.location?.location || ''}`);
      console.log(`   Created: ${new Date(evt.created_at).toLocaleDateString()}`);
      console.log(`   Updated: ${new Date(evt.updated_at).toLocaleDateString()}`);
      console.log();
    });

    // Summary
    const confirmed = eventsData.collection.filter(e => e.status === 'active').length;
    const canceled = eventsData.collection.filter(e => e.status === 'canceled').length;
    console.log(`Summary: ${confirmed} active, ${canceled} canceled`);
  } else {
    console.log("No events found in last 7 days");
  }

  console.log("\n--- Available Calendly Data Types ---\n");
  console.log("✅ User Profile");
  console.log("  - Name, email, timezone, avatar");
  console.log("  - Organization membership");
  console.log();
  console.log("✅ Scheduled Events");
  console.log("  - Meeting name, status (active/canceled)");
  console.log("  - Start/end times");
  console.log("  - Event type (15min, 30min, etc.)");
  console.log("  - Location (Zoom, phone, in-person)");
  console.log("  - Invitees (attendees)");
  console.log("  - Cancellation reason");
  console.log("  - Rescheduling info");
  console.log();
  console.log("✅ Event Types");
  console.log("  - Available meeting types you offer");
  console.log("  - Duration, description, scheduling URL");
  console.log();
  console.log("✅ Invitees (per event)");
  console.log("  - Attendee name, email");
  console.log("  - Questions/answers");
  console.log("  - No-show status");
  console.log("  - Rescheduling count");
  console.log();
  console.log("✅ Availability");
  console.log("  - Free/busy times");
  console.log("  - Scheduling links");
  console.log();
  console.log("✅ Webhook Subscriptions");
  console.log("  - Real-time event notifications");
  console.log("  - Invitee created/canceled/rescheduled");
}

main().catch(console.error);
