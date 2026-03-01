/**
 * Apply database migration directly via Supabase service role
 * Run: node apply-migration.js
 */
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const migrations = [
  {
    name: "inbox_messages",
    sql: `CREATE TABLE IF NOT EXISTS inbox_messages (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
      campaign_id TEXT NOT NULL,
      campaign_name TEXT,
      thread_id TEXT NOT NULL,
      plusvibe_id TEXT,
      from_email TEXT NOT NULL,
      from_name TEXT,
      from_domain TEXT,
      to_email TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      body_text TEXT,
      sentiment TEXT DEFAULT 'neutral',
      intent TEXT,
      tags TEXT[] DEFAULT '{}',
      status TEXT DEFAULT 'unread',
      priority TEXT DEFAULT 'medium',
      reply_count INT DEFAULT 0,
      last_reply_at TIMESTAMPTZ,
      ai_summary TEXT,
      suggested_actions JSONB,
      company_enrichment JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
    )`,
  },
  {
    name: "email_threads",
    sql: `CREATE TABLE IF NOT EXISTS email_threads (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
      campaign_id TEXT NOT NULL,
      prospect_email TEXT NOT NULL,
      prospect_name TEXT,
      prospect_company TEXT,
      status TEXT DEFAULT 'active',
      message_count INT DEFAULT 0,
      last_activity TIMESTAMPTZ DEFAULT NOW(),
      ai_analysis JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
    )`,
  },
  {
    name: "email_tags",
    sql: `CREATE TABLE IF NOT EXISTS email_tags (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      color TEXT DEFAULT '#6b7280',
      category TEXT DEFAULT 'custom',
      rules JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
    )`,
  },
  {
    name: "registrar_credentials",
    sql: `CREATE TABLE IF NOT EXISTS registrar_credentials (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      name TEXT NOT NULL,
      api_key TEXT NOT NULL,
      api_secret TEXT,
      is_active BOOLEAN DEFAULT true,
      last_tested_at TIMESTAMPTZ,
      status TEXT DEFAULT 'connected',
      created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
    )`,
  },
  {
    name: "platform_connections",
    sql: `CREATE TABLE IF NOT EXISTS platform_connections (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
      platform TEXT NOT NULL,
      name TEXT NOT NULL,
      username TEXT,
      password TEXT,
      api_key TEXT,
      workspace_id TEXT,
      extra_config JSONB DEFAULT '{}',
      verification_status TEXT DEFAULT 'pending',
      verification_error TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
    )`,
  },
  {
    name: "inboxing_domains",
    sql: `CREATE TABLE IF NOT EXISTS inboxing_domains (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
      domain TEXT NOT NULL UNIQUE,
      status TEXT DEFAULT 'pending',
      inboxing_id TEXT,
      registrar_id UUID,
      cloudflare_id TEXT,
      platform_connection_id UUID,
      user_count INT DEFAULT 49,
      mailbox_count INT DEFAULT 0,
      tags TEXT[] DEFAULT '{}',
      campaign_id TEXT,
      redirect_url TEXT,
      redirect_type TEXT DEFAULT 'NONE',
      csv_available_at TIMESTAMPTZ,
      nameservers TEXT[] DEFAULT '{}',
      failure_reason TEXT,
      health_score INT DEFAULT 100,
      last_health_check TIMESTAMPTZ,
      dns_spf BOOLEAN DEFAULT false,
      dns_dkim BOOLEAN DEFAULT false,
      dns_dmarc BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
    )`,
  },
  {
    name: "inboxing_jobs",
    sql: `CREATE TABLE IF NOT EXISTS inboxing_jobs (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
      domain_id UUID,
      type TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      payload JSONB DEFAULT '{}',
      result JSONB,
      error TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
      completed_at TIMESTAMPTZ
    )`,
  },
];

async function run() {
  console.log("Checking existing tables...");

  // Check what tables exist by trying to select from them
  for (const m of migrations) {
    const { error } = await supabase.from(m.name).select("id").limit(1);
    if (error && error.code === "42P01") {
      console.log(`  Table ${m.name}: MISSING - will create`);
    } else if (error) {
      console.log(`  Table ${m.name}: ERROR - ${error.message}`);
    } else {
      console.log(`  Table ${m.name}: EXISTS`);
    }
  }

  console.log("\nTo apply the full migration with indexes, constraints, and RLS,");
  console.log("paste the contents of prisma/migrations/001_inbox_and_inboxing.sql");
  console.log("into the Supabase SQL Editor at:");
  console.log("https://supabase.com/dashboard/project/ovymybiibcxunnqoaoub/sql/new\n");
}

run().catch(console.error);
