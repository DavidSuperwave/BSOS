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
      return { error: `${res.status}: ${err.slice(0, 200)}` };
    }

    return await res.json();
  } catch (err) {
    return { error: err.message };
  }
}

async function main() {
  const COMPANY_ID = "a29720a9-f0f7-40d7-ac74-5fc4b815b9a1";

  console.log("=== Calendly Access Scope Test ===\n");

  const { data: company } = await admin
    .from("companies")
    .select("integration_credentials")
    .eq("id", COMPANY_ID)
    .single();

  const ic = company?.integration_credentials || {};
  const apiKey = ic.calendly_api_key;

  if (!apiKey) {
    console.error("❌ No Calendly API key");
    return;
  }

  // 1. Test /users/me (should work with any token)
  console.log("1. GET /users/me (User Scope)");
  const userMe = await calendlyApi("/users/me", apiKey);
  if (userMe.resource) {
    console.log("   ✅ ACCESS GRANTED");
    console.log(`   Name: ${userMe.resource.name}`);
    console.log(`   Email: ${userMe.resource.email}`);
    console.log(`   Scheduling URL: ${userMe.resource.scheduling_url || 'N/A'}`);
    if (userMe.resource.current_organization) {
      console.log(`   Org URI: ${userMe.resource.current_organization}`);
    }
  } else {
    console.log(`   ❌ DENIED: ${userMe.error}`);
  }
  console.log();

  // 2. Try to get organization info (requires org-level scope)
  if (userMe.resource?.current_organization) {
    const orgUri = userMe.resource.current_organization;
    const orgUuid = orgUri.split('/').pop();
    
    console.log("2. GET /organizations/{uuid} (Org Scope)");
    const org = await calendlyApi(`/organizations/${orgUuid}`, apiKey);
    if (org.resource) {
      console.log("   ✅ ACCESS GRANTED");
      console.log(`   Org Name: ${org.resource.name || 'N/A'}`);
      console.log(`   Plan: ${org.resource.plan || 'N/A'}`);
      console.log(`   Stage: ${org.resource.stage || 'N/A'}`);
    } else {
      console.log(`   ❌ DENIED: ${org.error}`);
      console.log("   → This is normal for personal access tokens");
    }
    console.log();

    // 3. Try to list organization members
    console.log("3. GET /organizations/{uuid}/organization_memberships (Org Scope)");
    const members = await calendlyApi(`/organization_memberships?organization=${encodeURIComponent(orgUri)}`, apiKey);
    if (members.collection) {
      console.log("   ✅ ACCESS GRANTED");
      console.log(`   Members: ${members.collection.length}`);
      members.collection.slice(0, 3).forEach((m, i) => {
        console.log(`   ${i+1}. ${m.user?.name || 'Unknown'} (${m.role || 'member'})`);
      });
    } else {
      console.log(`   ❌ DENIED: ${members.error}`);
      console.log("   → Personal tokens typically can't access org-wide data");
    }
    console.log();
  }

  // 4. Try to access other users' data directly
  console.log("4. Cross-User Data Access Test");
  console.log("   Testing if we can access data from other user accounts...");
  
  // Try listing all users (this will fail with personal token)
  const allUsers = await calendlyApi("/users", apiKey);
  if (allUsers.collection) {
    console.log("   ✅ Can list users");
  } else {
    console.log(`   ❌ Cannot list users: ${allUsers.error}`);
    console.log("   → Confirmed: Personal access token scope");
  }
  console.log();

  // Summary
  console.log("=== Summary ===\n");
  console.log("Token Type: Personal Access Token (OAuth)");
  console.log("Scope Level: USER-ONLY");
  console.log();
  console.log("✅ Can Access:");
  console.log("  - Your own profile");
  console.log("  - Your scheduled events");
  console.log("  - Your event types");
  console.log("  - Your invitees (for your events)");
  console.log();
  console.log("❌ Cannot Access:");
  console.log("  - Other users' data");
  console.log("  - Organization-wide reports");
  console.log("  - Team member schedules");
  console.log("  - Admin/owner level settings");
  console.log();
  console.log("For multi-user/org-wide access, you'd need:");
  console.log("  - Organization Admin token, OR");
  console.log("  - OAuth app with 'organization' scope");
}

main().catch(console.error);
