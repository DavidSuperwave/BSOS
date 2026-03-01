-- Create knowledge_documents table for Blitzscale OS
-- Run this in Supabase SQL Editor

-- Create table
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

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_knowledge_company ON knowledge_documents(company_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_category ON knowledge_documents(category);
CREATE INDEX IF NOT EXISTS idx_knowledge_updated ON knowledge_documents(updated_at DESC);

-- Enable RLS
ALTER TABLE knowledge_documents ENABLE ROW LEVEL SECURITY;

-- Create policy for service role (full access)
CREATE POLICY "Service role full access" ON knowledge_documents
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Create policy for anon access (read only)
CREATE POLICY "Anon read access" ON knowledge_documents
    FOR SELECT
    TO anon
    USING (true);

-- Grant permissions
GRANT ALL ON knowledge_documents TO service_role;
GRANT SELECT ON knowledge_documents TO anon;

COMMENT ON TABLE knowledge_documents IS 'Knowledge base documents for Blitzscale OS companies';
