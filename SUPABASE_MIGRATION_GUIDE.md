# Supabase Migration Guide

## Migration Status

**File:** `ui/supabase/migrations/20250218_blitzscale_v2.sql`
**Status:** ⚠️ PENDING - Needs to be run manually
**Tables to Create:** 30 tables with RLS policies

## How to Run

Since the Supabase connector can do CRUD but cannot run raw SQL migrations, you need to run this via the Supabase Dashboard:

### Step 1: Open Supabase SQL Editor
1. Go to https://supabase.com/dashboard/project/wmncawwcgnotizhowzii/sql/new
2. Sign in with your Supabase account

### Step 2: Copy Migration SQL
1. Open `ui/supabase/migrations/20250218_blitzscale_v2.sql`
2. Copy the entire contents (800+ lines)

### Step 3: Run Migration
1. Paste the SQL into the editor
2. Click "Run" 
3. Wait for completion (should take ~10-30 seconds)

### Step 4: Verify
Run this query to verify tables were created:
```sql
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
```

You should see 30 tables including:
- accounts
- account_members
- companies
- company_agents
- chat_sessions
- chat_messages
- campaigns
- inbox_messages
- knowledge_projects
- knowledge_documents
- company_skill_registry
- skill_executions
- events
- activities
- platform_connections
- inboxing_domains
- And more...

## Alternative: Using Supabase CLI

If you have Supabase CLI installed locally:

```bash
cd ui
supabase login
supabase db push
```

## Troubleshooting

**Error: "relation already exists"**
- Some tables may already exist from previous migrations
- The script uses `CREATE TABLE IF NOT EXISTS` so it's safe to re-run

**Error: "permission denied"**
- Make sure you're running as project owner or have service_role access

**Missing tables after migration:**
- Check the output for any red error messages
- Common issues: duplicate indexes, constraint violations

## Post-Migration Verification

After running the migration, test with:

```bash
# Test database connection
npm run test:db

# Or run the test suite
node test-integrations.js
```

## Schema Overview

The migration creates these table groups:

1. **Core Multi-Tenancy** (4 tables)
   - accounts, account_members, companies, company_users

2. **Agents & Chat** (5 tables)
   - company_agents, chat_sessions, chat_messages, agent_decisions, chat_snapshots

3. **Campaigns & Pipeline** (4 tables)
   - campaigns, campaign_leads, pipeline_entries, pipeline_stages

4. **Inbox & Activities** (4 tables)
   - inbox_messages, email_threads, email_tags, activities

5. **Knowledge Base** (4 tables)
   - knowledge_projects, knowledge_documents, knowledge_document_refs, knowledge_relationships

6. **Skills Store** (4 tables)
   - company_skill_registry, company_agent_skill_assignments, company_agent_skill_env, skill_executions

7. **Events & Analytics** (3 tables)
   - events, agent_tasks, chat_tasks

8. **Inboxing** (4 tables)
   - platform_connections, registrar_credentials, inboxing_domains, inboxing_jobs

All tables include:
- RLS policies for service_role access
- Updated_at triggers
- Proper indexes for performance
