/**
 * Setup Knowledge Documents Table in Supabase
 * Run: node setup-knowledge-table.js
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://your-project.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'your-service-key';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function setupKnowledgeTable() {
  console.log('🔧 Setting up knowledge_documents table...\n');

  // Check if table exists by trying to select from it
  const { error: checkError } = await supabase
    .from('knowledge_documents')
    .select('count')
    .limit(1);

  if (!checkError) {
    console.log('✅ Table already exists!');
    return;
  }

  if (checkError.code !== 'PGRST205') {
    console.error('❌ Unexpected error:', checkError);
    return;
  }

  console.log('📝 Table does not exist. Creating via SQL...\n');
  console.log('Please run the following SQL in the Supabase Dashboard SQL Editor:\n');
  console.log('Go to: https://supabase.com/dashboard/project/ovymybiibcxunnqoaoub/sql/new\n');
  console.log('─'.repeat(60));
  console.log(`
-- Create knowledge_documents table for Blitzscale OS
CREATE TABLE IF NOT EXISTS knowledge_documents (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT,
    company_id TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_knowledge_company ON knowledge_documents(company_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_category ON knowledge_documents(category);

-- Enable RLS
ALTER TABLE knowledge_documents ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role full access" ON knowledge_documents
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Allow anon read access
CREATE POLICY "Anon read access" ON knowledge_documents
    FOR SELECT TO anon USING (true);
`);
  console.log('─'.repeat(60));
  console.log('\nAfter running the SQL, re-run this script to verify.\n');
}

setupKnowledgeTable().catch(console.error);
