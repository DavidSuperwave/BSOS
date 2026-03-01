/** Centralized env var access. Returns null when keys missing (never crashes). */

export function env(key: string): string | null {
  return process.env[key] ?? null;
}

export const envConfig = {
  supabase: {
    url: () => env("NEXT_PUBLIC_SUPABASE_URL"),
    anonKey: () => env("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    serviceRoleKey: () => env("SUPABASE_SERVICE_ROLE_KEY"),
  },
  database: {
    url: () => env("DATABASE_URL"),
  },
  openclaw: {
    url: () => env("OPENCLAW_URL") || "http://localhost:18789",
  },
  plusvibe: {
    apiKey: () => env("PLUSVIBE_API_KEY"),
    workspaceId: () => env("PLUSVIBE_WORKSPACE_ID"),
  },
  close: {
    apiKey: () => env("CLOSE_API_KEY"),
  },
  calendly: {
    apiKey: () => env("CALENDLY_API_KEY"),
    userUri: () => env("CALENDLY_USER_URI"),
  },
  supermemory: {
    apiKey: () => env("SUPERMEMORY_API_KEY"),
  },
  perplexity: {
    apiKey: () => env("PERPLEXITY_API_KEY"),
  },
  inboxing: {
    apiKey: () => env("INBOXING_API_KEY"),
  },
  provisioner: {
    dropletIp: () => env("DROPLET_IP"),
    sshKey: () => env("PROVISIONER_SSH_KEY"),
    ghcrImage: () => env("GHCR_IMAGE") || "ghcr.io/openclaw/openclaw:latest",
    portRangeStart: () => parseInt(env("PORT_RANGE_START") || "18790", 10),
    portRangeEnd: () => parseInt(env("PORT_RANGE_END") || "18850", 10),
  },
  openrouter: {
    apiKey: () => env("OPENROUTER_API_KEY"),
  },
  anthropic: {
    apiKey: () => env("ANTHROPIC_API_KEY"),
    baseUrl: () => env("ANTHROPIC_BASE_URL"),
  },
  sentry: {
    dsn: () => env("NEXT_PUBLIC_SENTRY_DSN"),
  },
};
