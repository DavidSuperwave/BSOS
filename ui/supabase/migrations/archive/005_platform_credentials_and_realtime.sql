-- platform_credentials: Shared platform API keys (service-role only)
CREATE TABLE IF NOT EXISTS platform_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service text NOT NULL UNIQUE,
  api_key text NOT NULL,
  config jsonb DEFAULT '{}'::jsonb,
  is_active boolean DEFAULT true,
  rotated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE platform_credentials ENABLE ROW LEVEL SECURITY;

-- Enable Supabase Realtime on key tables
ALTER PUBLICATION supabase_realtime ADD TABLE events;
ALTER PUBLICATION supabase_realtime ADD TABLE inbox_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
