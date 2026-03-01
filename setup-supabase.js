const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://your-project.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'your-service-key';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const setupSQL = `
-- Create the message queue table
CREATE TABLE IF NOT EXISTS agent_message_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  queue TEXT NOT NULL,
  message JSONB NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_queue_status ON agent_message_queue(queue, status);
CREATE INDEX IF NOT EXISTS idx_created_at ON agent_message_queue(created_at);

-- Enable Row Level Security
ALTER TABLE agent_message_queue ENABLE ROW LEVEL SECURITY;

-- Service role has full access
DROP POLICY IF EXISTS service_all ON agent_message_queue;
CREATE POLICY service_all ON agent_message_queue 
  FOR ALL TO service_role 
  USING (true) WITH CHECK (true);

-- Anon can insert (queue messages)
DROP POLICY IF EXISTS anon_insert ON agent_message_queue;
CREATE POLICY anon_insert ON agent_message_queue 
  FOR INSERT TO anon WITH CHECK (true);

-- Anon can read their own pending messages
DROP POLICY IF EXISTS anon_select_pending ON agent_message_queue;
CREATE POLICY anon_select_pending ON agent_message_queue 
  FOR SELECT TO anon USING (status = 'pending');

-- Anon can read completed responses
DROP POLICY IF EXISTS anon_select_complete ON agent_message_queue;
CREATE POLICY anon_select_complete ON agent_message_queue 
  FOR SELECT TO anon USING (status = 'complete');

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$ 
BEGIN 
  NEW.updated_at = now(); 
  RETURN NEW; 
END; 
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_agent_message_queue_updated_at ON agent_message_queue;
CREATE TRIGGER update_agent_message_queue_updated_at 
  BEFORE UPDATE ON agent_message_queue 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
`;

async function setup() {
  console.log('🔧 Setting up Agent Message Queue in Supabase...\n');

  // Execute SQL using rpc
  const { data, error } = await supabase.rpc('exec_sql', { sql: setupSQL });
  
  if (error) {
    // Try alternative method - create table directly via REST
    console.log('⚠️ RPC not available, trying REST method...\n');
    
    // Check if table exists by trying to select
    const { error: checkError } = await supabase
      .from('agent_message_queue')
      .select('id')
      .limit(1);
    
    if (checkError && checkError.code === '42P01') {
      console.log('❌ Table does not exist. You need to run the SQL manually:');
      console.log('\n--- COPY THIS SQL TO SUPABASE SQL EDITOR ---\n');
      console.log(setupSQL);
      console.log('\n--- END SQL ---\n');
      console.log('Go to: https://supabase.com/dashboard/project/ovymybiibcxunnqoaoub/sql/new');
      process.exit(1);
    } else if (checkError) {
      console.error('❌ Error checking table:', checkError.message);
      process.exit(1);
    } else {
      console.log('✅ Table already exists!');
    }
  } else {
    console.log('✅ Setup complete!');
  }

  // Insert test message
  const { data: insertData, error: insertError } = await supabase
    .from('agent_message_queue')
    .insert({
      queue: 'gtm:queue:dev',
      message: { type: 'test', message: 'Agent bridge connected', timestamp: new Date().toISOString() },
      status: 'complete'
    })
    .select()
    .single();

  if (insertError) {
    console.error('❌ Test insert failed:', insertError.message);
  } else {
    console.log('✅ Test message inserted:', insertData.id);
  }

  // Verify
  const { data: verifyData, error: verifyError } = await supabase
    .from('agent_message_queue')
    .select('*')
    .eq('status', 'complete')
    .order('created_at', { ascending: false })
    .limit(5);

  if (verifyError) {
    console.error('❌ Verification failed:', verifyError.message);
  } else {
    console.log(`✅ Verified! ${verifyData.length} messages in queue`);
  }

  console.log('\n🎉 Agent Bridge is ready to use!');
  console.log('   - Queue: agent_message_queue table');
  console.log('   - Dev messages: gtm:queue:dev');
  console.log('   - Company messages: gtm:queue:company');
}

setup().catch(err => {
  console.error('❌ Setup failed:', err.message);
  console.log('\n📋 Manual setup required:');
  console.log('   1. Go to: https://supabase.com/dashboard/project/ovymybiibcxunnqoaoub/sql/new');
  console.log('   2. Copy the SQL from supabase-setup.sql');
  console.log('   3. Run it in the SQL Editor');
  process.exit(1);
});
