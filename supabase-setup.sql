-- Agent Message Queue Setup for Supabase
-- Run this in Supabase SQL Editor

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
CREATE POLICY service_all ON agent_message_queue 
  FOR ALL TO service_role 
  USING (true) WITH CHECK (true);

-- Anon can insert (queue messages)
CREATE POLICY anon_insert ON agent_message_queue 
  FOR INSERT TO anon WITH CHECK (true);

-- Anon can read their own pending messages
CREATE POLICY anon_select_pending ON agent_message_queue 
  FOR SELECT TO anon USING (status = 'pending');

-- Anon can read completed responses
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

-- Test message
INSERT INTO agent_message_queue (queue, message, status)
VALUES (
  'gtm:queue:dev', 
  '{"type": "test", "message": "Agent bridge connected", "timestamp": "' || now() || '"}'::jsonb, 
  'complete'
)
ON CONFLICT DO NOTHING;
