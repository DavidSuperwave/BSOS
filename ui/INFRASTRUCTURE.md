# Blitzscale OS — Infrastructure & Architecture

## Three-System Architecture

Blitzscale OS uses three systems with distinct responsibilities. No system duplicates another's job.

### Supermemory — "The Agent's Brain"

Long-term memory for actionable insights. The agent recalls context here before every turn and stores learnings selectively.

**What goes here:**
- Company profile (product, ICP, pain points, tone) — seeded at onboarding
- Campaign insights with specific numbers ("compliance angle 3x better than ROI")
- ICP refinements learned from reply patterns
- Research summaries (not raw research output)
- User preferences and custom agent instructions
- Tool configurations the agent generates
- Compacted analysis with breadcrumb references back to Supabase

**What does NOT go here:**
- Raw email replies
- Full chat transcripts
- Campaign CSV data
- Every conversation turn

**Isolation:** One `containerTag` per company (`gtm_{slug}`). All categories live in the same container so the knowledge graph connects insights across categories (campaign data links to ICP links to research). Metadata fields categorize content within the container.

**Categories (metadata.category):**
- `company_profile` — Core company data from onboarding
- `campaign_insight` — Performance analysis, A/B results, angle effectiveness
- `icp_refinement` — Learned ICP patterns from reply analysis
- `research_summary` — Perplexity/web research condensed findings
- `reply_analysis` — Compacted batch analysis with breadcrumb reference
- `user_preference` — Custom instructions, corrections, agent behavior tuning
- `tool_config` — Agent-generated tool/skill configurations
- `general` — Everything else

### Supabase — "The System of Record"

PostgreSQL database for raw data, auth, and UI display. Everything the UI shows comes from Supabase.

**Tables:**
- `companies` — Company records, agent config, integration credentials
- `accounts` / `account_members` — Multi-tenant auth
- `chat_sessions` / `chat_messages` — Chat history (individual message rows)
- `inbox_messages` — Raw email replies with sentiment, intent, analysis_batch
- `email_threads` — Threaded conversations
- `events` — Agent-generated events, webhook events, action items
- `knowledge_documents` — Knowledge base CRUD
- `tool_invocations` — Audit log of agent tool usage
- `inboxing_domains` — Email domain provisioning

**Auth:** Supabase Auth with SSR cookies. RLS policies scope data to accounts.

**Realtime:** Enabled on `events`, `inbox_messages`, `chat_messages` for instant UI updates.

### OpenClaw — "The Execution Engine"

Runs agent turns. Receives messages via HTTP hooks, executes tools, returns responses.

**What it does:**
- Runs agent turns (receives prompts, calls tools, returns responses)
- Manages agent sessions and transcripts locally (SQLite + markdown)
- Provides built-in tools: `web_fetch`, `web_search`, `exec`, `read`, `write`, `edit`
- Hosts the Supermemory plugin for auto-recall
- Supports skill-based tool generation (SKILL.md files)

**What we don't use it for:**
- Long-term storage (Supermemory handles this)
- Raw data storage (Supabase handles this)
- OpenClaw's built-in MEMORY.md system is not used; Supermemory replaces it

---

## Decision Log

### Why one containerTag per company, not per category?

Supermemory builds a knowledge graph within each container. Splitting `company_acme_campaigns` / `company_acme_icp` / `company_acme_research` into separate containers fragments the graph. The agent loses the ability to connect "ICP targets compliance buyers" with "compliance angle has 3x reply rate" — those connections only happen within the same container. We use metadata categories for filtering instead.

### Why autoCapture: false?

The default Supermemory OpenClaw plugin stores every conversation turn. This congests memory with raw operational noise ("here's the 50 replies I'm analyzing"). Instead, the agent selectively stores insights using `supermemory_store` after analysis. The SOUL.md teaches the agent what to store vs. what to discard.

### Why autoRecall: true?

Before every agent turn, the Supermemory plugin queries for relevant memories and injects them into context. This means the agent always has access to past insights without re-reading raw data. The full user profile is injected every 5 turns (`profileFrequency: 5`) so the agent maintains awareness of company context.

### Why breadcrumb references instead of storing raw data?

Following the Anthropic context engineering pattern: store "lightweight identifiers" in long-term memory, load actual data "just-in-time" via tools. An insight stored in Supermemory references `analysis_batch = 'batch_2a8f'` — when the agent needs to drill back into the source data, it queries Supabase using that batch ID. This keeps Supermemory lean (insights only) while maintaining full traceability.

### Why forward webhooks to the agent?

Calendly and PlusVibe webhooks store raw data in Supabase first (system of record), then forward to the agent via `/hooks/agent`. The agent can then intelligently process the event — check ICP fit, update CRM, adjust campaign strategy, create follow-up tasks. Without agent forwarding, webhooks are just passive data storage.

### Why remove the Supermemory tool from agent-tools.ts?

The OpenClaw Supermemory plugin provides four tools natively: `supermemory_store`, `supermemory_search`, `supermemory_forget`, `supermemory_profile`. These are registered directly in the agent's tool set by the plugin. Our old `search_knowledge` tool in `agent-tools.ts` was a redundant, less capable version that used the wrong API (document search vs. memory search).

### Why agents generate their own tools via skills?

Instead of hardcoding every integration as a Next.js API route, the agent can write SKILL.md files that teach itself how to use new APIs via `web_fetch`. This means adding a new tool (e.g., Slack notifications, LinkedIn scraping) doesn't require a code deployment — the agent creates the skill, stores the config in Supermemory, and uses it on future turns. Our Tier 3 proxy routes remain for company-scoped data access that requires auth.

### Why WebSocket RPC for agent management?

OpenClaw v2026.2.9 introduced `agents.create`, `agents.update`, `agents.delete`, and `agents.files.set` via WebSocket JSON-RPC. This replaces the previous approach of writing workspace files to a shared Docker volume. RPC is more reliable, supports atomic operations, and doesn't require volume mounts between containers.

---

## Compaction Flow — Breadcrumb Pattern

The core pattern for analyzing data without congesting Supermemory:

```
1. BATCH & TAG
   Agent generates batch_id (e.g., "batch_2a8f")
   Agent calls POST /api/tools/data/inbox/messages/tag-batch
   Messages in Supabase stamped with analysis_batch = "batch_2a8f"

2. ANALYZE
   Agent reads tagged messages via GET /api/tools/data/inbox/messages
   Agent identifies patterns: sentiment, intent, angles, objections

3. COMPACT & STORE
   Agent stores INSIGHT in Supermemory via supermemory_store:
   - Content: the analysis with specific numbers
   - metadata.category: "campaign_insight" or "reply_analysis"
   - metadata.source_ref: "batch_2a8f"
   - Content includes: "Source: inbox_messages WHERE analysis_batch = 'batch_2a8f'"
   Raw replies stay in Supabase. Only the insight goes to Supermemory.

4. RECALL (future turns)
   autoRecall injects relevant insights before each turn
   Agent knows "compliance 3x better, batch_2a8f" without re-reading replies
   If asked to drill down: queries Supabase with batch_id, gets originals back

5. FEEDBACK LOOP
   User says "that analysis was off"
   Agent recalls insight → has batch_2a8f reference
   Agent queries Supabase for batch, re-examines, updates insight
   Updated insight includes the correction + learning
```

---

## Agent Provisioning Flow

When a company completes onboarding and clicks "Deploy Agent":

```
1. provisionAgent() generates:
   - agentId: "company-{slug}"
   - Agent token (UUID)
   - Workspace files: AGENTS.md, SOUL.md, TOOLS.md
   - OpenClaw agent config with Supermemory plugin settings
   - containerTag: "gtm_{slug}"

2. Supabase updated:
   - companies.agent_config = { agent_id, token, container_tag, model }
   - companies.agent_status = "provisioning"
   - companies.integration_credentials populated

3. OpenClaw RPC (if gateway available):
   - agents.create → creates agent with workspace
   - agents.files.set → writes AGENTS.md, SOUL.md, TOOLS.md
   - Falls back gracefully if OpenClaw not running

4. Supermemory seeded:
   - Company profile stored (category: company_profile)
   - ICP definition stored (category: icp_refinement)
   - Both use company-scoped containerTag

5. companies.agent_status = "active"
```

---

## Tool Tiers

### Tier 1 — Direct (User-Owned Keys)
Agent uses the company's own API keys to call external services directly.
- PlusVibe (campaign management)
- Calendly (meeting scheduling)
- Close CRM (deal management)

Keys stored in `companies.integration_credentials` JSONB.

### Tier 2 — Supermemory (Plugin-Managed)
The OpenClaw Supermemory plugin provides four tools:
- `supermemory_store` — Save insights with category metadata
- `supermemory_search` — Semantic search across company memory
- `supermemory_forget` — Remove outdated memories
- `supermemory_profile` — View accumulated company/user profile

All scoped to `containerTag: "gtm_{slug}"`.

### Tier 3 — Proxied (Blitzscale API Routes)
Company-scoped data access through authenticated proxy routes.
Auth: `X-Agent-Token` header validated against `companies.agent_config.token`.

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/tools/inboxing/domains` | GET | List company email domains |
| `/api/tools/inboxing/health` | GET | Domain health summary |
| `/api/tools/data/inbox/messages` | GET | Company inbox messages |
| `/api/tools/data/inbox/messages/tag-batch` | POST | Tag messages for batch analysis |
| `/api/tools/data/campaigns` | GET | Campaign data via PlusVibe |
| `/api/tools/data/knowledge` | GET | Knowledge documents |
| `/api/tools/data/events` | GET/POST | Read/create events |

### Tier 4 — Agent-Generated (Skills)
The agent can create new tool integrations by:
1. Writing a SKILL.md file to its workspace via `write` tool
2. Storing API configuration in Supermemory (`category: tool_config`)
3. Using `web_fetch` to call external APIs directly
4. Skills are loaded into the agent's context on subsequent sessions

No code deployment required for new integrations.

---

## Webhook Architecture

External services push data into the system via webhook endpoints.

### Flow
```
External Service → POST /api/webhooks/{service}
                      │
                      ├── Store raw data in Supabase (system of record)
                      ├── Create event in events table
                      └── Forward to OpenClaw /hooks/agent (async, non-blocking)
                              │
                              └── Agent processes intelligently:
                                  - Check ICP fit
                                  - Suggest next steps
                                  - Store insights to Supermemory
                                  - Create follow-up events
```

### PlusVibe Webhook (`/api/webhooks/plusvibe`)
- Receives reply callbacks when prospects respond
- Upserts into `inbox_messages`, creates event
- If `company.settings.auto_analyze` enabled: spawns OpenClaw inbox session
- Agent analyzes sentiment, intent, stores insight with batch reference

### Calendly Webhook (`/api/webhooks/calendly`)
- Receives booking/cancellation notifications
- Resolves company via UTM tracking, email lookup, or single-tenant fallback
- Stores event in Supabase
- Forwards to agent with full context (invitee, event type, schedule)
- Agent checks prospect ICP fit, suggests prep notes, updates CRM

---

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (server-side) |
| `SUPERMEMORY_API_KEY` | Yes | Supermemory API key (sm_...) |
| `OPENCLAW_URL` | No | OpenClaw gateway URL (default: http://localhost:18789) |
| `OPENCLAW_GATEWAY_TOKEN` | Yes | Gateway auth token |
| `PLUSVIBE_API_KEY` | No | Default PlusVibe key (fallback) |
| `PLUSVIBE_WORKSPACE_ID` | No | Default PlusVibe workspace (fallback) |
| `PERPLEXITY_API_KEY` | No | Perplexity AI research |
| `INBOXING_API_KEY` | No | Inboxing v2 domain provisioning |
| `CALENDLY_API_KEY` | No | Calendly integration |
| `CALENDLY_USER_URI` | No | Calendly user URI |
| `CLOSE_API_KEY` | No | Close CRM |

---

## Deployment

### Docker Compose (Local / VPS)

```bash
# Build and start both services
docker compose up -d

# Services:
# - nextjs: port 3000 (public)
# - openclaw: port 18789 (internal bridge network only)

# OpenClaw config mounted read-only from ./openclaw/openclaw.json
# Supermemory plugin configured via environment variables
# No shared workspace volumes — RPC manages agent files
```

### Railway (Recommended for Production)

Two-service deployment on Railway:

**Service 1 — Next.js App (Dockerfile)**
- Uses `railway.json` for build config
- Health check at `/api/health`
- Set all environment variables in Railway dashboard
- `OPENCLAW_URL` → set to OpenClaw service's internal Railway URL

**Service 2 — OpenClaw Gateway (Docker image)**
- Image: `ghcr.io/openclaw/gateway:latest`
- Mount `openclaw.json` as config or inject via `OPENCLAW_CONFIG` env var
- Set `OPENCLAW_GATEWAY_TOKEN` and `SUPERMEMORY_API_KEY`
- Internal networking only — no public port needed

**Setup steps:**
1. Create a new Railway project
2. Add the Next.js service (deploy from GitHub repo, uses Dockerfile)
3. Add OpenClaw as a Docker service (`ghcr.io/openclaw/gateway:latest`)
4. Set `OPENCLAW_URL` on the Next.js service to the OpenClaw internal URL (e.g., `http://openclaw.railway.internal:18789`)
5. Copy all env vars from `.env.example` into Railway service variables
6. Deploy both services

**Why Railway over Vercel:**
- Vercel cannot run persistent processes (OpenClaw needs a long-running gateway)
- Railway supports internal service-to-service networking (WebSocket RPC)
- Railway supports Docker services natively
- Both services scale independently

---

## Remote Agent Management

Agents can be managed remotely after deployment via REST API. No redeployment required.

### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/companies/[id]/agent` | GET | Agent status, health, config |
| `/api/companies/[id]/agent` | PATCH | Update model, settings, regenerate workspace |
| `/api/companies/[id]/agent` | DELETE | Decommission agent |
| `/api/companies/[id]/agent/skills` | GET | List installed skills |
| `/api/companies/[id]/agent/skills` | POST | Push a new skill (SKILL.md + Supermemory config) |
| `/api/companies/[id]/agent/skills?slug=x` | DELETE | Remove a skill |
| `/api/companies/[id]/agent/files?name=x` | GET | Read a workspace file |
| `/api/companies/[id]/agent/files` | PUT | Write/update a workspace file |

### Updating Agent Config

```
PATCH /api/companies/{id}/agent
{
  "model": "claude-sonnet-4-20250514",
  "settings": { "auto_analyze": true },
  "regenerate_workspace": true
}
```

When `regenerate_workspace: true`, the API re-generates AGENTS.md, SOUL.md, and TOOLS.md from the company's onboarding data and pushes them to OpenClaw via RPC.

### Pushing Skills Remotely

```
POST /api/companies/{id}/agent/skills
{
  "slug": "slack_notify",
  "name": "Slack Notification",
  "description": "Send messages to a Slack channel via webhook",
  "content": "# SKILL: Slack Notification\n\n## Usage\nUse web_fetch to POST to the Slack webhook URL...",
  "api_config": {
    "base_url": "https://hooks.slack.com/services/...",
    "auth_type": "none"
  }
}
```

This writes `SKILL_SLACK_NOTIFY.md` to the agent's OpenClaw workspace and stores the config in Supermemory (`category: tool_config`) for recall.

### Updating Workspace Files

```
PUT /api/companies/{id}/agent/files
{
  "name": "SOUL.md",
  "content": "Updated SOUL.md content..."
}
```

Allowed files: `AGENTS.md`, `SOUL.md`, `TOOLS.md`, and `SKILL_*.md`. Other file names are rejected for safety.

### Decision: Why a REST API over direct WebSocket?

The agent management REST API wraps OpenClaw's WebSocket RPC in standard HTTP endpoints. This means:
- The UI can manage agents with regular fetch calls (no WebSocket client needed in browser)
- Supabase records stay in sync (config changes update both OpenClaw and Supabase atomically)
- Authentication uses existing Supabase auth (not raw gateway tokens)
- The REST layer handles graceful fallback when OpenClaw is unreachable

---

## File Map

### Core Libraries
| File | Purpose |
|------|---------|
| `src/lib/supermemory-client.ts` | Supermemory v3 API client, containerTag helper, store/search methods |
| `src/lib/openclaw-client.ts` | HTTP hooks (sendMessage, wakeAgent) + WebSocket RPC (agent CRUD, file ops) |
| `src/lib/agent-provisioning.ts` | Workspace file generation (AGENTS.md, SOUL.md, TOOLS.md) + OpenClaw config |
| `src/lib/agent-tools.ts` | Tier 3 proxy tools (PlusVibe, knowledge, Perplexity) |
| `src/lib/agent-auth.ts` | X-Agent-Token validation for proxy routes |
| `src/lib/tool-logger.ts` | Tool invocation audit logging |
| `src/lib/realtime.ts` | Supabase Realtime subscription hook |
| `src/lib/env.ts` | Centralized environment variable access |

### Webhook Routes
| File | Purpose |
|------|---------|
| `src/app/api/webhooks/plusvibe/route.ts` | PlusVibe reply callbacks → store + optional agent analysis |
| `src/app/api/webhooks/calendly/route.ts` | Calendly bookings → store + agent processing |

### Agent Proxy Routes (Tier 3)
| File | Purpose |
|------|---------|
| `src/app/api/tools/data/inbox/messages/route.ts` | Company-scoped inbox messages |
| `src/app/api/tools/data/inbox/messages/tag-batch/route.ts` | Batch tagging for compaction |
| `src/app/api/tools/data/campaigns/route.ts` | Campaign data via PlusVibe |
| `src/app/api/tools/data/knowledge/route.ts` | Knowledge documents |
| `src/app/api/tools/data/events/route.ts` | Events read/create |
| `src/app/api/tools/inboxing/domains/route.ts` | Inboxing domains |
| `src/app/api/tools/inboxing/health/route.ts` | Inboxing health |

### Agent Management Routes
| File | Purpose |
|------|---------|
| `src/app/api/companies/[id]/agent/route.ts` | Agent status, config update, decommission |
| `src/app/api/companies/[id]/agent/skills/route.ts` | Skill CRUD (push/list/remove SKILL.md files) |
| `src/app/api/companies/[id]/agent/files/route.ts` | Read/write workspace files (AGENTS.md, SOUL.md, TOOLS.md) |
| `src/app/api/companies/[id]/deploy-agent/route.ts` | Initial agent provisioning + Supermemory seeding |

### Configuration
| File | Purpose |
|------|---------|
| `openclaw/openclaw.json` | Gateway config with Supermemory plugin, tool policies, hooks |
| `docker-compose.yml` | Next.js + OpenClaw gateway services |
| `Dockerfile` | Multi-stage Next.js standalone build |
| `railway.json` | Railway deployment configuration |
