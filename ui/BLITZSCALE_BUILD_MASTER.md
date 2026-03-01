# BLITZSCALE OS — Master Build Document

**Last Updated:** February 18, 2026
**Status:** Database applied, codebase audit complete, implementation ready
**Schema Version:** v2.0 (30 tables, Supabase live)

---

## HOW TO USE THIS DOCUMENT

This is the single source of truth for the Blitzscale OS project. When resuming work in a new session, read this file first. It tells you:
- What's built and working
- What's dead code to remove
- What the database looks like
- What needs to be built next (in order)
- Every flow and how tables connect

---

## PROJECT OVERVIEW

Multi-tenant SaaS GTM platform. Users create AI-powered agents for outbound sales, connect PlusVibe for email campaigns, monitor replies, qualify leads, and manage pipelines — all scoped per company with isolated Docker containers.

**Stack:** Next.js 14 (App Router) | Supabase (PostgreSQL + Auth + Realtime) | Tailwind 4 | SWR | Recharts | Radix/shadcn | Lucide

**Key repos:**
- UI: `C:\Users\Kecin\Desktop\gtm-engine\ui`
- Docs: `C:\Users\Kecin\clawd\automation\gtm-engine\docs\`

---

## CURRENT STATE SUMMARY

### Database: LIVE (30 tables)
Migration `blitzscale_complete_schema` applied to Supabase. All tables created with RLS (service_role), indexes, triggers, and realtime on key tables.

### Codebase: FUNCTIONAL (cleanup done)
The Next.js app runs. Core features work: onboarding, company management, campaigns, inbox, chat, knowledge base, analytics. Dead code removed (prisma/, supermemory.ts, workflow-engine.ts, ioredis, jose). Components still to wire up: chat-message.tsx, tool-call-card.tsx into main chat page.

### Infrastructure: NOT STARTED
Docker provisioning, GHCR, OpenClaw fork, SSH setup — all unbuilt.

---

## DATABASE SCHEMA (v2.0)

### Table Inventory (30 tables)

| # | Table | Purpose | Realtime |
|---|-------|---------|----------|
| 1 | `accounts` | Organization/billing entity | No |
| 2 | `account_members` | User-to-account junction | No |
| 3 | `companies` | Core multi-tenant entity (32 columns) | No |
| 4 | `company_users` | Legacy user-company junction | No |
| 5 | `company_agents` | Pre-provisioned agents per company | No |
| 6 | `chat_sessions` | Isolated chat sessions (main/group/isolated) | No |
| 7 | `chat_messages` | Messages with chain-of-thought support | Yes |
| 8 | `channels` | Multi-platform connection registry | No |
| 9 | `channel_messages` | Unified inbound/outbound message log | Yes |
| 10 | `inbox_messages` | Campaign email replies with AI analysis | Yes |
| 11 | `email_threads` | Threaded conversation tracking | No |
| 12 | `email_tags` | Email tagging system | No |
| 13 | `pipelines` | Kanban board definitions | No |
| 14 | `pipeline_stages` | Board columns with auto-move rules | No |
| 15 | `pipeline_entries` | Lead/deal cards | Yes |
| 16 | `reports` | Saved chart configurations | No |
| 17 | `documents` | Rich text docs with embedded charts | No |
| 18 | `media_files` | File/media library | No |
| 19 | `events` | Agent-generated notifications | Yes |
| 20 | `tool_invocations` | Agent tool audit log | No |
| 21 | `research_jobs` | Perplexity research tracking | No |
| 22 | `scheduled_jobs` | Cron automation definitions | No |
| 23 | `job_runs` | Cron execution history | No |
| 24 | `registrar_credentials` | Domain registrar connections | No |
| 25 | `platform_connections` | ESP connections (PlusVibe, etc) | No |
| 26 | `inboxing_domains` | Managed domains for outbound | No |
| 27 | `inboxing_jobs` | Domain provisioning jobs | No |
| 28 | `platform_credentials` | Shared API keys (service-role only) | No |
| 29 | `company_integrations` | Per-company service connections | No |
| 30 | `knowledge_documents` | RAG documents | No |

### Companies Table — Full Column Reference

```
companies
├── id, account_id, user_id, name, slug, domain, industry, status
├── onboarding_data (JSONB), onboarding_step, onboarding_completed_at
├── plusvibe_workspace_id, plusvibe_api_key, plusvibe_enabled
├── supermemory_namespace, supermemory_container_tag
├── agent_status, agent_config (JSONB), integration_credentials (JSONB)
├── container_name, container_port, container_status, container_url
├── telegram_bot_token, telegram_chat_id
├── ai_provider, ai_model
├── provisioned_at, last_health_check
└── settings (JSONB), created_at, updated_at
```

### Chat Messages — Chain-of-Thought Columns

```
chat_messages
├── id, session_id, role, content, tool_calls (JSONB)
├── tokens_used, model
├── reasoning_content (TEXT)        ← AI thinking/reasoning text
├── reasoning_duration (INTEGER)    ← ms spent thinking
├── tool_steps (JSONB)              ← structured tool execution log
├── content_parts (JSONB)           ← ordered message segments
├── is_compacted, compacted_into
└── created_at
```

### Chat Sessions — Extended Session Types

```
chat_sessions.session_type: main | group | isolated | campaigns | crm | inbox
chat_sessions.parent_session_id   ← sub-agent sessions
chat_sessions.channel_id          ← which channel spawned this
chat_sessions.is_background       ← isolated background sessions
chat_sessions.mention_gated       ← group sessions respond on @mention only
chat_sessions.expires_at          ← auto-cleanup for isolated sessions
```

### Helper Functions

- `update_updated_at_column()` — trigger function for auto-updating `updated_at`
- `increment_session_message_count(session_uuid, add_tokens)` — atomic counter increment

### Seed Data

- Company "Superwave" (slug: `superwave`, domain: `superwave.ai`) auto-created

---

## CODEBASE AUDIT — WHAT TO KEEP / DISCARD

### DISCARDED (Dead Code — Cleaned Feb 18, 2026)

| File/Item | Status |
|-----------|--------|
| `prisma/` directory | ✅ DELETED — Prisma fully abandoned, zero imports |
| `src/lib/supermemory.ts` | ✅ DELETED — Replaced by `supermemory-client.ts` |
| `src/lib/workflow-engine.ts` | ✅ DELETED — Never imported anywhere |
| `ioredis` (package.json) | ✅ REMOVED — Zero imports |
| `jose` (package.json) | ✅ REMOVED — JWT handled by Supabase |
| Old migrations (002-005) | To archive (move to `supabase/migrations/archive/`) |
| `20250217_multi_tenant_agents.sql` | To archive (duplicate of complete_setup) |

**False positives from initial audit (NOT dead):**
- `src/components/CompanySettings.tsx` — actively used by Settings.tsx
- `src/components/Settings.tsx` — actively used by `src/app/settings/page.tsx`

### KEEP & REFACTOR

| File | Action |
|------|--------|
| `src/components/chat/chat-message.tsx` | Wire into main chat page (replace inline MessageBubble) |
| `src/components/chat/tool-call-card.tsx` | Used by chat-message.tsx, will be activated when wired |
| `src/components/ui/text-effects.tsx` | Has TextShimmer + LoadingDots for thinking states |
| `src/app/page.tsx` | Replace inline MessageBubble with proper chat-message component |

### KEEP (Active & Working)

All API routes, all hooks in `hooks.ts`, `rate-limit.ts`, `inboxing-client.ts`, `plusvibe-project.ts`, `api-auth.ts`, `agent-tools.ts`, `agent-provisioning.ts`, `openclaw-client.ts`, `env.ts`, `realtime.ts`, `tool-logger.ts`, `supermemory-client.ts`, `supermemory-namespace.ts`, `web-agent.ts`, all page components, `app-shell.tsx`, onboarding flow.

---

## ARCHITECTURE — DATA ACCESS PATTERN

**Supabase-only.** No Prisma. All routes use:
```typescript
const supabase = createClient(supabaseUrl, supabaseServiceKey);
```

**Auth flow:**
1. `authenticateUser()` → Supabase auth session → `{ userId, email }`
2. `verifyCompanyAccess(userId, companyId)` → `account_members` → `companies`
3. All queries scoped by `company_id`

**Multi-tenancy hierarchy:**
```
auth.users → account_members → accounts → companies → [everything else]
```

---

## COMPLETE FLOW MAP

### Flow 1: Signup → First Company
```
Supabase Auth signup → /api/auth/account-setup
  → INSERT accounts (org)
  → INSERT account_members (owner role)
  → Redirect to /onboarding
  → INSERT companies (status: onboarding)
  → POST /api/companies/[id]/agents/provision → INSERT company_agents
  → Steps 1-6: PATCH companies.onboarding_data
  → Complete: UPDATE companies.status → active
```

### Flow 2: Chat with Julian (Chain-of-Thought)
```
User message → POST /api/chat (SSE stream)
  → Find/create chat_sessions
  → Read company_agents (model, tools config)
  → INSERT chat_messages (role: user)
  → AI streams response:
    → SSE: reasoning-start/delta/end
    → SSE: tool-start/output (per tool)
    → SSE: text-delta
  → INSERT chat_messages (role: assistant)
    → reasoning_content, tool_steps, content_parts saved
  → INSERT tool_invocations (per tool call)
  → UPDATE chat_sessions (message_count, token_count)
```

### Flow 3: Email Reply → Pipeline Auto-Move
```
PlusVibe webhook → POST /api/webhooks/plusvibe
  → UPSERT inbox_messages (by plusvibe_id)
  → UPDATE email_threads (message_count, last_activity)
  → INSERT events (reply_received)
  → AI classify sentiment/intent
  → UPDATE inbox_messages (sentiment, intent)
  → IF sentiment = interested:
    → SELECT pipeline_entries WHERE contact_email = ?
    → UPDATE pipeline_entries.stage_id → "Interested" stage
    → Realtime pushes to Kanban UI
    → INSERT events (lead_qualified)
```

### Flow 4: Channel Message → Session → Response
```
Telegram message → webhook
  → INSERT channel_messages (inbound)
  → SELECT channels WHERE platform_account_id = ?
  → Find/create chat_sessions (type: main|group)
  → INSERT chat_messages (user)
  → AI response
  → INSERT chat_messages (assistant)
  → INSERT channel_messages (outbound)
  → Deliver via Telegram API
```

### Flow 5: Docker Provisioning (TO BUILD)
```
Onboarding complete → POST /api/companies/[id]/provision
  → UPDATE companies.container_status → 'provisioning'
  → Allocate port (scan companies.container_port, first available 18790-18850)
  → SSH to droplet → generate docker-compose.yml + .env + AGENTS.md
  → docker compose up -d
  → Health check loop (5 retries, 5s delay)
  → UPDATE companies (container_name, port, url, status → 'running', provisioned_at)
  → Poll from UI: GET /api/companies/[id]/container-status
```

### Flow 6: Cron → Isolated Session → Report
```
scheduled_jobs.next_run_at reached
  → INSERT job_runs (status: running)
  → INSERT chat_sessions (type: isolated, is_background: true, expires_at)
  → Agent executes in isolated context
  → Aggregate pipeline_entries data
  → UPDATE/INSERT reports
  → INSERT channel_messages (send summary to Telegram)
  → UPDATE job_runs (status: completed)
  → UPDATE scheduled_jobs (last_run_at, next_run_at, run_count++)
```

### Flow 7: Document ↔ Live Report
```
Open document → SELECT documents.content (TipTap JSON)
  → embedded_reports[] → SELECT reports
  → reports.query_config → execute aggregate query
  → Render chart inline in TipTap editor
```

### Flow 8: Media Upload
```
Upload in chat/entry/document
  → Store file in Supabase Storage
  → INSERT media_files (storage_path, file_type, metadata)
  → Link via context + context_id
  → Media viewer renders based on file_type
```

---

## IMPLEMENTATION GAMEPLAN — PHASES

### Phase 0: Cleanup ✅ DONE (Feb 18, 2026)
- [x] Delete dead files (prisma/, supermemory.ts, workflow-engine.ts)
- [x] Remove `ioredis` and `jose` from package.json
- [x] Archive old migration files (moved to `supabase/migrations/archive/`)
- [x] Save the consolidated v2.0 migration SQL to `supabase/migrations/20250218_blitzscale_v2.sql`

### Phase 1: Foundation — OpenClaw Fork + Docker ✅ DONE (Feb 19, 2026)
- [x] Create custom Dockerfile with GTM Engine skill layer (`Dockerfile.openclaw`)
- [x] Set up GHCR + GitHub Actions CI workflow (`.github/workflows/docker-build.yml`)
- [x] Create GTM Engine skill manifest (`openclaw/skills/gtm-engine/SKILL.md`)
- [x] Update `openclaw.json` with OpenRouter + Minimax model config
- [x] Update `docker-compose.yml` to build from custom Dockerfile
- [x] Create per-company docker-compose template (`openclaw/docker-compose.template.yml`)
- [x] Create `/api/companies/[id]/provision` route (SSH, docker-compose, port allocation)
- [x] Create `/api/companies/[id]/container-status` route (health check polling)
- [x] Add provisioner config to `env.ts` + `.env.example`
- [ ] Fork OpenClaw repo to GitHub (requires `gh` CLI — manual step)
- [ ] Set up SSH keys for droplet access (manual step)
- [ ] Build and push first image (after fork + push to GitHub)
- [ ] Test container locally

### Phase 2: Provisioning System (mostly merged into Phase 1)
- [x] Create `/api/companies/[id]/provision` route (SSH, docker-compose, port allocation)
- [x] Create `/api/companies/[id]/container-status` route (health check)
- [ ] Set up SSH keys for droplet access
- [ ] Test provisioning on DigitalOcean droplet

### Phase 3: Missing API Routes
- [ ] Create `/api/plusvibe/workspaces` route (fetch workspaces from API key)
- [ ] Create `/api/telegram/validate` route (validate bot token)
- [ ] Create `/api/companies/[id]` PATCH route (update by ID)
- [ ] Create pipeline CRUD routes (`/api/pipelines/*`)
- [ ] Create report CRUD routes (`/api/reports/*`)
- [ ] Create document CRUD routes (`/api/documents/*`)
- [ ] Create media upload routes (`/api/media/*`)
- [ ] Create channel CRUD routes (`/api/channels/*`)
- [ ] Create scheduled_jobs CRUD routes (`/api/jobs/*`)

### Phase 4: Chat Upgrade — Chain-of-Thought
- [ ] Install `react-markdown`, `remark-gfm`, `rehype-highlight`, `framer-motion`
- [ ] Build `ChainOfThought` component (collapsible reasoning panel, tool timeline, animations)
- [ ] Upgrade `ChatMessage` component (content_parts rendering, markdown, syntax highlight, streaming optimization)
- [ ] Upgrade `useStreamingChat` hook (parse reasoning/tool SSE events, track thinking state)
- [ ] Update `/api/chat` route to emit new SSE event format (reasoning-start/delta/end, tool-start/output, text-delta)
- [ ] Replace inline MessageBubble in `page.tsx` with proper ChatMessage component
- [ ] Wire ToolCallCard into ChatMessage
- [ ] Wire TextShimmer/LoadingDots for thinking states

### Phase 5: Pipeline / Kanban UI
- [ ] Build pipeline page with Kanban board (drag-drop via @dnd-kit, already installed)
- [ ] Pipeline stage management (add/remove/reorder columns)
- [ ] Entry detail modal with field editing
- [ ] Auto-move logic (webhook reply → pipeline stage update)
- [ ] Realtime subscription for live Kanban updates

### Phase 6: Reports & Documents
- [ ] Build report creation UI (chart type selector, data source picker, filter bar)
- [ ] Build report viewer (chart-panel with Recharts)
- [ ] Build document editor (TipTap integration)
- [ ] Embedded chart blocks in TipTap (reference report by ID)
- [ ] Dashboard pinned reports widget

### Phase 7: Channel Integration
- [ ] Telegram bot setup flow (validate token, register webhook)
- [ ] Channel message routing (inbound → session → response → outbound)
- [ ] Multi-channel management UI
- [ ] WhatsApp/Slack extensibility (later)

### Phase 8: Automation / Cron
- [ ] Scheduled jobs management UI
- [ ] Cron execution engine (isolated sessions)
- [ ] Job run history and logs viewer
- [ ] Pre-built templates (pipeline summary, lead enrichment, inbox digest)

### Phase 9: Media & Files
- [ ] Supabase Storage bucket setup
- [ ] Upload component (drag-drop, progress, thumbnails)
- [ ] Media viewer (images, video, audio, PDFs)
- [ ] Attachment support in chat, entries, documents

### Phase 10: Production Deployment
- [ ] GHCR image builds on push
- [ ] Droplet firewall rules (ports 18790-18850)
- [ ] Health monitoring dashboard
- [ ] Container auto-restart on failure
- [ ] Backup strategy (Supabase + DO Spaces)
- [ ] Company deletion with container cleanup

---

## NPM PACKAGES TO ADD

| Package | Purpose | Phase |
|---------|---------|-------|
| `react-markdown` | Markdown rendering in chat | 4 |
| `remark-gfm` | GitHub-flavored markdown support | 4 |
| `rehype-highlight` | Syntax highlighting in code blocks | 4 |
| `framer-motion` | Chain-of-thought animations | 4 |
| `@tiptap/react` + extensions | Document editor | 6 |
| `node-ssh` | Docker provisioning via SSH | 2 |

---

## ENVIRONMENT VARIABLES NEEDED

```bash
# Already configured
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
PLUSVIBE_API_KEY=
PLUSVIBE_WORKSPACE_ID=
CLOSE_API_KEY=
CALENDLY_API_KEY=
OPENROUTER_API_KEY=
SUPERMEMORY_API_KEY=
MINIMAX_API_KEY=

# Needed for provisioning (Phase 2)
DROPLET_IP=159.65.220.183
PROVISIONER_SSH_KEY=           # ed25519 private key
GHCR_IMAGE=ghcr.io/davidsuperwave/bsos/openclaw:latest

# Needed for Telegram (Phase 7)
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

---

## KEY DECISIONS LOG

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Database access | Supabase direct (no Prisma) | Single pattern, Prisma abandoned |
| Container registry | GHCR | Unlimited pulls, no vendor lock-in |
| AI provider | OpenRouter → Minimax | 10x cheaper, good performance |
| Session model | main/group/isolated | Matches Ironclaw, enables background tasks |
| Chat rendering | content_parts array | Preserves reasoning + tool + text ordering |
| Kanban data | Dedicated tables (not JSONB) | Queryable, indexable, realtime-ready |
| Document editor | TipTap | Rich text + embedded charts, extensible |
| Hosting | Single DO droplet → K8s | Start simple, scale when needed |

---

## OPEN QUESTIONS

1. Should `company_users` table be removed? `account_members` handles the same role.
2. Backup strategy: Supabase auto-backups + DO Spaces for container data?
3. API key rotation: Store in `platform_credentials` or Vault?
4. GDPR: Data residency requirements for EU customers?
5. Rate limiting: Per-company or per-user quotas for chat?

---

## QUICK REFERENCE — FILE LOCATIONS

| What | Where |
|------|-------|
| Main chat page | `src/app/page.tsx` |
| App shell / sidebar | `src/components/app-shell.tsx` |
| Streaming chat hook | `src/lib/hooks/use-streaming-chat.ts` |
| Chat API (SSE) | `src/app/api/chat/route.ts` |
| Auth helpers | `src/lib/api-auth.ts` |
| Company context | `src/contexts/company-context.tsx` |
| PlusVibe credentials | `src/lib/plusvibe-project.ts` |
| Agent tools | `src/lib/agent-tools.ts` |
| Agent provisioning (workspace gen) | `src/lib/agent-provisioning.ts` |
| OpenClaw client (RPC + HTTP) | `src/lib/openclaw-client.ts` |
| Container provisioning API | `src/app/api/companies/[id]/provision/route.ts` |
| Container status API | `src/app/api/companies/[id]/container-status/route.ts` |
| Agent provisioning API | `src/app/api/companies/[id]/agents/provision/route.ts` |
| Agent management API | `src/app/api/companies/[id]/agent/route.ts` |
| Supermemory client | `src/lib/supermemory-client.ts` |
| Onboarding wizard | `src/app/onboarding/page.tsx` |
| SWR hooks | `src/lib/hooks.ts` |
| Env config | `src/lib/env.ts` |
| Rate limiter | `src/lib/rate-limit.ts` |
| OpenClaw gateway config | `openclaw/openclaw.json` |
| GTM Engine skill | `openclaw/skills/gtm-engine/SKILL.md` |
| Custom OpenClaw Dockerfile | `Dockerfile.openclaw` |
| Per-company compose template | `openclaw/docker-compose.template.yml` |
| GitHub Actions CI | `.github/workflows/docker-build.yml` |
| Master migration | `supabase/migrations/20250218_blitzscale_v2.sql` |

---

*This document is the project's memory. Update it as work progresses.*
