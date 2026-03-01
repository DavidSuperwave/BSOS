# Blitzscale OS — System Architecture Specification

This document is the single source of truth for how the Blitzscale OS UI is built, how its components interact, and the reasoning behind each architectural decision. All feature development references this document.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Deployment Topology](#2-deployment-topology)
3. [Authentication & Multi-Tenancy](#3-authentication--multi-tenancy)
4. [Database Schema](#4-database-schema)
5. [Tool Security Model](#5-tool-security-model)
6. [OpenClaw Agent Architecture](#6-openclaw-agent-architecture)
7. [Chat System](#7-chat-system)
8. [Compaction & Memory Strategy](#8-compaction--memory-strategy)
9. [Session Types & Sub-Agents](#9-session-types--sub-agents)
10. [Event System](#10-event-system)
11. [Onboarding Wizard](#11-onboarding-wizard)
12. [API Route Structure](#12-api-route-structure)
13. [UI Component Architecture](#13-ui-component-architecture)
14. [Data Flow Diagrams](#14-data-flow-diagrams)
15. [Platform Credentials & Key Management](#15-platform-credentials--key-management)
16. [Feature Pages](#16-feature-pages)

---

## 1. System Overview

Blitzscale OS is a multi-tenant GTM (Go-To-Market) operating system. Users create an account, onboard companies, and deploy AI agents (powered by OpenClaw) that are pre-loaded with company knowledge. The agents help with campaign management, inbox reply analysis, ICP research, and GTM strategy.

### Core Principle: App Does Grunt Work, Agent Does Thinking

The Next.js application handles all data display, CRUD, filtering, and pagination directly via Supabase queries. The AI agent is only invoked when reasoning is needed — analyzing replies, generating strategy, optimizing campaigns. This keeps token costs low and response times fast for routine operations.

### Core Principle: Separate Sessions Prevent Context Bloat

Each distinct task type (main chat, inbox analysis, research, campaign optimization) gets its own OpenClaw session with isolated context. The main agent stays lean by reading summaries from Supabase and Supermemory rather than replaying full sub-session transcripts.

### Storage Division

| Store | Purpose | Accessed By |
|-------|---------|-------------|
| **Supabase** | System of record. Users, companies, chat transcripts, inbox messages, campaigns, events, audit logs. Powers all UI components directly. | Next.js app (SWR hooks, API routes) |
| **Supermemory** | Intelligence vault. Research results, ICP learnings, campaign insights, reply patterns, session summaries. Namespaced per company. | OpenClaw agents (semantic search) |
| **OpenClaw workspace** | Agent persona + memory. AGENTS.md (company profile), SOUL.md (persona), MEMORY.md (learnings), daily logs. | OpenClaw runtime |

**Rule:** If a UI component needs to display it, it must be in Supabase. If an agent needs to recall it semantically, it must be in Supermemory. Some data goes to both.

---

## 2. Deployment Topology

### Docker Compose (Production & Local Dev)

Two containers on the same Docker network:

```
┌─────────────────────────────────────────────────────┐
│                 Docker Network                       │
│                                                     │
│  ┌───────────────────┐    ┌──────────────────────┐ │
│  │  nextjs            │    │  openclaw-gateway     │ │
│  │  Port 3000 (public)│◄──►│  Port 18789 (internal)│ │
│  └───────────────────┘    └──────────────────────┘ │
│                                                     │
│  Volumes:                                           │
│  - openclaw-data:/data/.openclaw                    │
│  - workspaces:/data/workspaces                      │
└─────────────────────────────────────────────────────┘
         │                        │
         ▼                        ▼
   Supabase (hosted)       Supermemory (hosted)
```

**Why this topology:**
- OpenClaw is NOT public-facing. Only Next.js can reach it on the internal Docker network.
- Next.js is the single entry point for all user interactions and API calls.
- Agent communication is proxied through Next.js API routes, giving us auth validation, scoping, and audit logging at the proxy layer.
- OpenClaw needs outbound internet access (to call PlusVibe, Perplexity, etc.) but no inbound access from the internet.

### Key Environment Variables

```bash
# Next.js container
OPENCLAW_URL=http://openclaw-gateway:18789          # internal Docker network
OPENCLAW_GATEWAY_TOKEN=<shared-secret>               # auth for hooks API
NEXT_PUBLIC_SUPABASE_URL=<supabase-project-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<supabase-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<supabase-service-role>
DATABASE_URL=<postgres-connection-string>

# OpenClaw container
OPENCLAW_STATE_DIR=/data/.openclaw
OPENCLAW_GATEWAY_TOKEN=<same-shared-secret>
# Model provider keys (agent uses these directly)
ANTHROPIC_API_KEY=<key>
# OR
OPENAI_API_KEY=<key>
```

### Local Development

For local dev, OpenClaw runs natively (not in Docker) at `localhost:18789`. The Next.js dev server runs at `localhost:3000`. All `.env.local` keys are used as-is. The `platform_credentials` table can be empty — the app falls back to env vars.

---

## 3. Authentication & Multi-Tenancy

### Auth Provider: Supabase Auth

We use Supabase Auth with SSR cookie handling (`@supabase/ssr`). No Clerk, no NextAuth.

**Flow:**
1. User visits any protected route
2. `src/middleware.ts` calls `updateSession()` which refreshes the Supabase session cookie
3. No valid session → redirect to `/login`
4. Valid session on auth pages → redirect to `/`

**Why Supabase Auth:** Already integrated, powers RLS policies, consistent with our database layer. Avoids adding another service dependency.

### Multi-Tenancy Model

```
auth.users (Supabase Auth)
    │
    └── account_members (role: owner/admin/member)
            │
            └── accounts (organization level)
                    │
                    └── companies (one or many per account)
                            │
                            ├── chat_sessions
                            ├── inbox_messages
                            ├── events
                            └── ... all company-scoped data
```

**Account** is the billing/team entity. A user can belong to multiple accounts. A company always belongs to one account.

**On signup:**
1. Supabase Auth creates the user
2. API auto-creates an `accounts` row with the user as `owner`
3. API auto-creates an `account_members` row
4. User enters onboarding wizard to create their first company

**Company switching:** The sidebar company selector reads `companies` for the user's account(s). Selected company ID is stored in a React context (`CompanyContext`) and passed to all data hooks and API calls.

### Row Level Security

All company-scoped tables have RLS policies that check:
```sql
company_id IN (
  SELECT id FROM companies WHERE account_id IN (
    SELECT account_id FROM account_members WHERE user_id = auth.uid()
  )
)
```

This ensures a user can only access data for companies in accounts they belong to. The `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS and is only used server-side in API routes and the agent proxy layer.

---

## 4. Database Schema

### Design Decisions

- **Supabase raw SQL + RLS** replaces Prisma ORM. Prisma added complexity with a parallel schema that diverged from Supabase tables. Single source of truth is Supabase.
- **Chat messages are individual rows**, not a JSON blob. Enables pagination, search, compaction marking, and per-message token tracking.
- **Credentials are JSONB** on the companies table for Tier 1 (user-owned) keys. This avoids a separate credentials table per integration and makes it easy to add new integrations without schema changes.
- **Platform credentials** get their own table because they're shared across all companies, rotatable, and must never be exposed to agents.

### Tables

#### `accounts`
Organization-level entity. Owns companies.
- `id`, `name`, `owner_user_id` (auth.users.id), `plan`, `created_at`

#### `account_members`
Maps users to accounts with roles.
- `id`, `account_id`, `user_id`, `role` (owner/admin/member), `invited_at`, `accepted_at`
- Unique constraint on (account_id, user_id)

#### `companies`
The core tenant entity. Everything is scoped to a company.
- Identity: `id`, `account_id`, `name`, `slug` (unique), `domain`, `industry`, `status`
- Onboarding: `onboarding_data` (JSONB), `onboarding_step` (int), `onboarding_completed_at`
- Integrations: `integration_credentials` (JSONB — Tier 1 user-owned keys)
- Agent: `agent_status`, `agent_config` (JSONB — OpenClaw agent ID, auth token, workspace path, model, compaction strategy)
- Memory: `supermemory_namespace` (auto-generated: `blitzscale:company:{id}`)

#### `chat_sessions`
One row per conversation session.
- `id`, `company_id`, `user_id`
- `session_type`: main, inbox, campaign, research, cron
- `openclaw_session_key`: maps to OpenClaw's session identifier
- `title`, `status` (active/completed/archived), `context_ref` (e.g., message_id for inbox sessions)
- `summary`, `summary_updated_at`: written after compaction or session end
- `total_tokens`, `message_count`

#### `chat_messages`
Individual messages within a session. Never stored as a JSON blob.
- `id`, `session_id`, `role` (user/assistant/system/tool), `content`
- `tool_calls` (JSONB array), `tokens_used`, `model`
- `is_compacted` (boolean), `compacted_into` (references the summary message that replaced this group)

#### `events`
Agent-generated notifications and action items.
- `id`, `company_id`, `session_id`
- `event_type`: action_item, insight, alert, status_update, cron_result
- `title`, `description`, `priority` (low/medium/high/urgent)
- `actions` (JSONB): structured action buttons `[{label, type, params}]`
- `status`: unread, read, acted, dismissed

#### `tool_invocations`
Audit log of every tool the agent calls.
- `id`, `company_id`, `session_id`, `message_id`
- `tool_name`, `tool_tier` (open/provisioned/proxied)
- `input_params`, `output_summary` (truncated), `status`, `error_message`
- `duration_ms`, `tokens_used`

#### `research_jobs`
Tracks research pipeline jobs.
- `id`, `company_id`, `session_id`
- `job_type`: market, tam, icp, competitor, custom
- `query`, `status`, `result` (JSONB), `citations` (JSONB)
- `supermemory_synced` (boolean)

#### `platform_credentials`
Shared platform API keys. Never exposed to agents.
- `id`, `service` (unique: inboxing, supabase, supermemory_admin, perplexity)
- `api_key`, `config` (JSONB), `is_active`, `rotated_at`
- For local dev: table can be empty, code falls back to `.env.local`

#### Existing Tables (Kept)
- `inbox_messages` — campaign email replies with AI analysis fields
- `email_threads` — thread-level metadata
- `email_tags` — custom tags
- `inboxing_domains` — managed domains (already has `company_id`)
- `inboxing_jobs` — async provisioning jobs
- `registrar_credentials` — domain provider connections
- `platform_connections` — PlusVibe/Instantly/Smartlead connections
- `knowledge_documents` — company knowledge base (migrated from Prisma)

---

## 5. Tool Security Model

### Three Tiers

#### Tier 1: Open (User-Owned Keys)
Agent gets direct access. Keys stored in `companies.integration_credentials` and written to the agent's workspace `TOOLS.md`.

**Examples:** PlusVibe, Close CRM, Calendly, any custom API the user configures.

**Why direct:** The user owns these keys and this data. There's no cross-tenant risk. The agent calling PlusVibe with the user's key can only access the user's PlusVibe workspace.

**Agent can also create custom Tier 1 tools** — this is native OpenClaw behavior. If the user says "check my Notion," the agent can create a tool that hits the Notion API with the user's key. No restrictions beyond the OpenClaw sandbox.

#### Tier 2: Provisioned (Isolated by Design)
Agent gets direct access to a scoped resource. We provision the credential, but the service itself enforces isolation.

**Example:** Supermemory. Each company gets namespace `blitzscale:company:{id}`. The agent stores/queries with `containerTags` that include its namespace. Even with the same API key, different companies' data is isolated by namespace tagging.

**Why direct:** Supermemory's containerTag system is the isolation boundary. The agent can't accidentally (or intentionally) access another company's data because queries are filtered by tag.

#### Tier 3: Proxied (Shared Keys, Multi-Tenant)
Agent NEVER gets the raw key. All access goes through Next.js API proxy routes (`/api/tools/*`) that validate the agent's identity and inject company scoping.

**Examples:** Inboxing API (one key, all companies' domains), Supabase (service role key = god mode over all tables).

**Why proxied:** These keys grant access to ALL companies' data. If an agent had the Inboxing API key, it could list/modify any company's domains. If it had the Supabase service role key, it could read any table.

**How it works:**
1. Each company gets a unique `agent_config.token` (UUID) when provisioned
2. Agent's `TOOLS.md` has proxy URLs: `http://nextjs:3000/api/tools/inboxing/domains`
3. Agent sends requests with `X-Agent-Token` header
4. Proxy validates token → extracts `company_id`
5. Proxy calls the actual service with the shared key, filtering results to that company
6. Agent receives only its own company's data

**Inboxing-specific scoping:** The Inboxing API has no company concept. Our proxy queries `inboxing_domains WHERE company_id = {extracted_id}` to get the list of domain IDs that belong to this company, then filters Inboxing API responses to only include those domains.

### Agent Token Lifecycle
- Generated: when company agent is provisioned
- Stored: `companies.agent_config.token` in Supabase
- Written to: agent workspace `TOOLS.md`
- Validated: on every `/api/tools/*` request
- Rotatable: update Supabase + rewrite agent `TOOLS.md`

---

## 6. OpenClaw Agent Architecture

### One Agent Per Company

When a company completes onboarding, we provision a dedicated OpenClaw agent:

```
Agent ID: company-{companyId}
Workspace: /data/workspaces/company-{companyId}/
```

Each agent has its own:
- Workspace directory (persona, tools, memory)
- Session store (conversation history)
- Memory index (SQLite per agent)
- Tool permissions (sandbox config)

### Workspace Bootstrap Files

Generated from onboarding data and templates:

**AGENTS.md** — Operating instructions, company-specific knowledge:
```markdown
# Company: {name}
Domain: {domain} | Industry: {industry}

## What We Sell
{onboarding_data.product_description}

## Ideal Customer Profile
Titles: {onboarding_data.icp_titles}
Company size: {onboarding_data.icp_company_size}
Verticals: {onboarding_data.icp_verticals}
Pain points: {onboarding_data.pain_points}

## Campaign Guidelines
Tone: {onboarding_data.tone}
Goals: {onboarding_data.campaign_goals}
Competitors: {onboarding_data.competitors}
```

**SOUL.md** — Shared persona (same for all agents):
```markdown
You are Julian, a GTM strategist for Blitzscale OS.
You are concise, data-driven, and proactive.
You suggest actions, not just information.
When analyzing data, always include specific numbers.
When suggesting strategy, reference past performance.
Never make up data — if you don't know, say so and suggest research.
```

**TOOLS.md** — Tool access configuration per company:
```markdown
## Direct Access (your keys)
[Tier 1 keys from integration_credentials]

## Knowledge Vault (your namespace)
[Tier 2 Supermemory config]

## Platform Tools (proxied)
Base URL: http://nextjs:3000/api/tools
Auth: X-Agent-Token: {agent_token}
[Tier 3 proxy endpoint documentation]
```

**MEMORY.md** — Starts empty, grows as agent works.

### OpenClaw Gateway Configuration

```json5
{
  agents: {
    list: [
      // One entry per company, dynamically managed
      {
        id: "company-abc123",
        workspace: "/data/workspaces/company-abc123"
      }
    ]
  },
  hooks: {
    enabled: true,
    token: "<OPENCLAW_GATEWAY_TOKEN>",
    path: "/hooks"
  },
  // Webhook endpoints for Next.js to call:
  // POST /hooks/agent  — send message to agent (fire-and-forget or sync)
  // POST /hooks/wake   — trigger agent turn
}
```

### How Next.js Communicates With OpenClaw

**Sending a message to an agent:**
```
POST http://openclaw-gateway:18789/hooks/agent
Headers: Authorization: Bearer <OPENCLAW_GATEWAY_TOKEN>
Body: {
  "message": "Analyze this email: ...",
  "agentId": "company-abc123",
  "session": "inbox-msg-456"   // optional: target specific session
}
```

**For streaming responses (main chat):**
The Next.js API route opens a WebSocket connection to the OpenClaw gateway and proxies it to the browser as Server-Sent Events (SSE). This gives the user real-time streaming while keeping OpenClaw internal.

**For background tasks (inbox analysis, cron results):**
Fire-and-forget webhook. OpenClaw processes it asynchronously. Results are written to Supabase by the agent via proxy tools, and the UI picks them up via SWR polling or real-time subscriptions.

---

## 7. Chat System

### Architecture Change

**Before:** HTTP polling (1s interval, 60s timeout) against Supabase `agent_message_queue`. Single channel. Messages stored as JSON blob.

**After:** WebSocket/SSE streaming from OpenClaw. Multiple session types. Individual message rows in Supabase.

### Message Flow (Main Chat)

```
1. User types message in Julian tab
2. Frontend: POST /api/chat
   { message, companyId, sessionType: "main" }
3. API route:
   a. Get or create chat_sessions row
   b. Write chat_messages row (role: 'user')
   c. Forward to OpenClaw: POST /hooks/agent
   d. Open SSE stream back to browser
   e. As tokens stream in, send to browser
   f. On completion:
      - Write chat_messages row (role: 'assistant', tool_calls, tokens_used)
      - Write tool_invocations rows (one per tool call)
      - Update chat_sessions (message_count, total_tokens)
4. Frontend renders message incrementally
```

### Chat Components

**ChatProvider** (React context):
- Holds: current `companyId`, current `sessionId`, `sessionType`
- Provides: `sendMessage()`, `loadSession()`, `startNewSession()`
- Manages SSE connection lifecycle

**ChatMessageList** — renders messages from Supabase, handles compacted message display.

**ChatInput** — text input with suggestion chips. Suggestions are context-aware based on session type.

**ChatHistory** (sidebar) — lists past sessions, grouped by date. Shows session type icon and title.

**ToolCallCard** — displays tool invocations inline with status badges.

### Session Persistence

Every message is written to `chat_messages` as an individual row immediately. No more auto-save of JSON blobs. The session list in the sidebar reads from `chat_sessions` ordered by `updated_at`.

Loading a session:
```sql
SELECT * FROM chat_messages
WHERE session_id = $1 AND is_compacted = false
ORDER BY created_at ASC;
```

Compacted messages are hidden by default but expandable in the UI (they're marked, not deleted).

---

## 8. Compaction & Memory Strategy

### The Two-Write Pattern

Every meaningful agent action produces two writes:

1. **Supabase** — structured, exact, queryable. Powers UI.
2. **Supermemory** — narrative, semantic, searchable. Powers agent recall.

Example: Agent analyzes an inbox reply.
- Supabase: `inbox_messages.ai_summary = "Positive, meeting request"`, `chat_messages` row with full analysis
- Supermemory: `"Analyzed reply from john@acme.com. Positive sentiment, meeting request. Recommended scheduling follow-up via Calendly."` tagged `company:{id}:actions`

### When Compaction Happens

OpenClaw has native compaction. When the context window fills up:

1. OpenClaw triggers a memory flush → agent writes durable notes to `MEMORY.md`
2. OpenClaw summarizes older messages → compacted context replaces them in the window
3. Our compaction hook fires (webhook or polling):
   a. Mark old `chat_messages` rows as `is_compacted = true`
   b. Create a system message: `"[Compacted: N messages summarized]"`
   c. Write narrative summary to Supermemory (`company:{id}:sessions`)
   d. Update `chat_sessions.summary`

### Compaction Strategies

Stored in `companies.agent_config.compaction_strategy`:

| Strategy | Behavior | Use Case |
|----------|----------|----------|
| `default` | OpenClaw decides (softTokens: 4000) | Most companies |
| `aggressive` | Compact early (softTokens: 2000) | High-volume chatters |
| `conservative` | Keep more context (softTokens: 8000) | Complex strategy work |
| `manual` | Never auto-compact | User triggers `/compact` |
| `session-summary` | Compact at session end/reset | Fresh start each day |

**Future modification:** Update `companies.agent_config`, rewrite OpenClaw config file, agent picks up new thresholds on next session.

### How the Main Agent Stays Informed

The main agent doesn't replay sub-sessions. It reads:

1. **MEMORY.md** — persistent learnings (auto-maintained by OpenClaw + our hooks)
2. **memory_search** tool — semantic search across MEMORY.md and daily logs
3. **Supermemory query** — deep semantic search across all stored knowledge
4. **Proxy tools** — structured Supabase queries for exact records (inbox summary, campaign stats)

---

## 9. Session Types & Sub-Agents

### Session Types

| Type | Trigger | Context | Lifecycle | Output |
|------|---------|---------|-----------|--------|
| `main` | User chats in Julian tab | Company profile + memory + recent tools | Persistent, compacts over time | Direct conversation |
| `inbox` | User clicks "Analyze" on email, or automatic | Email content + thread + sender info | Short-lived, ends after task | Updates inbox_messages fields + Supermemory summary |
| `campaign` | User requests campaign optimization | Campaign data + reply analytics | Medium-lived, ends after task | Strategy recommendations + events |
| `research` | User or cron triggers research | Research query + company ICP | Medium-lived, ends after job | research_jobs row + Supermemory |
| `cron` | OpenClaw scheduler | Configurable per job | One-shot | Events/notifications |

### Sub-Session Flow

```
User clicks "Analyze" on inbox reply #456
    │
    ├── 1. POST /api/chat { sessionType: 'inbox', contextRef: 'msg-456' }
    │
    ├── 2. API creates chat_sessions row:
    │       session_type: 'inbox'
    │       context_ref: 'msg-456'
    │       title: "Inbox: john@acme.com re: Q1 SaaS..."
    │
    ├── 3. API sends to OpenClaw:
    │       POST /hooks/agent {
    │         agentId: "company-abc",
    │         session: "inbox-msg-456",
    │         message: "Analyze this email reply:\n\n
    │           From: john@acme.com\n
    │           Subject: Re: Quick question about...\n
    │           Body: [email content]\n\n
    │           Determine: sentiment, intent, suggested actions."
    │       }
    │
    ├── 4. Agent processes in isolated session:
    │       - No main chat context pollution
    │       - Uses tools: research company domain, check thread history
    │       - Returns structured analysis
    │
    ├── 5. API writes results:
    │       - chat_messages: full analysis
    │       - inbox_messages: update ai_summary, sentiment, intent
    │       - tool_invocations: any tools used
    │       - Supermemory: narrative summary for future recall
    │       - chat_sessions: mark as 'completed', write summary
    │
    └── 6. UI updates:
            - Inbox page shows analysis results inline
            - Dashboard events card shows action item if applicable
```

### Cron Jobs

Configured per company via OpenClaw's cron system:

```bash
# Example: Daily positive reply check
openclaw cron add \
  --name "check-positive-replies" \
  --cron "0 8 * * *" \
  --tz "America/New_York" \
  --session isolated \
  --agentId "company-abc" \
  --message "Check for new positive replies since yesterday. If any have meeting requests, create action items."
```

Cron results write to the `events` table. The dashboard action items card picks them up.

---

## 10. Event System

### Event Types

| Type | Display | Example |
|------|---------|---------|
| `action_item` | Dashboard card + sidebar badge | "3 meeting requests need follow-up" |
| `insight` | Sidebar notification | "Campaign reply rate improved 1.2%" |
| `alert` | Toast notification | "High-priority lead replied" |
| `status_update` | Inline in chat | "Research job completed" |
| `cron_result` | Dashboard card | "Morning brief: 5 new replies" |

### Event Actions

Events can have structured action buttons:

```json
[
  {
    "label": "View Replies",
    "type": "navigate",
    "params": { "path": "/inbox?status=unread&sentiment=positive" }
  },
  {
    "label": "Draft Follow-ups",
    "type": "agent",
    "params": { "message": "Draft follow-up emails for pending meeting requests" }
  }
]
```

Action types:
- `navigate` — link to a page with optional query params
- `agent` — send a message to the main agent chat
- `dismiss` — mark event as dismissed
- `external` — open external URL

### Event Polling

The UI polls events via SWR:
```
useEvents(companyId) → GET /api/events?companyId={id}&status=unread
```

For the dashboard, events are displayed in an "Action Items" card. For the sidebar, a badge count shows unread events. Toast notifications fire for `alert` type events.

---

## 11. Onboarding Wizard

### When It Triggers

1. **New signup:** After auth, no companies exist → wizard starts automatically
2. **Add company:** User clicks "Add Company" in sidebar → wizard starts

### Steps

The wizard is a multi-step form. Each step saves progress to `companies.onboarding_data` and `companies.onboarding_step` so the user can resume if they leave.

| Step | Fields | Purpose |
|------|--------|---------|
| 1. Company Basics | name, slug, domain, industry | Identity |
| 2. Product | product_description, value_proposition | What they sell |
| 3. ICP | icp_titles, icp_company_size, icp_verticals, icp_geo | Who they sell to |
| 4. Pain Points | pain_points[], objections[], competitors[] | Sales context |
| 5. Messaging | tone, campaign_goals, differentiators | Communication style |
| 6. Integrations | plusvibe_api_key, plusvibe_workspace_id, calendly, close | Connect services |
| 7. Review & Deploy | Preview agent profile, confirm | Trigger agent provisioning |

### What Happens on Completion

1. `companies.onboarding_completed_at` is set
2. `companies.status` changes from `onboarding` to `active`
3. Agent provisioning kicks off:
   - Generate workspace from onboarding_data (AGENTS.md, SOUL.md, TOOLS.md)
   - Generate `agent_config.token` (UUID)
   - Register agent in OpenClaw gateway config
   - Initialize Supermemory namespace with onboarding data as seed documents
   - Set `agent_status` to `active`
4. User is redirected to the dashboard for that company

### Data Structure

```json
{
  "company_name": "Acme Corp",
  "domain": "acme.com",
  "industry": "SaaS",
  "product_description": "AI-powered analytics for...",
  "value_proposition": "We help companies...",
  "icp_titles": ["VP Sales", "CRO", "Head of Growth"],
  "icp_company_size": "50-500",
  "icp_verticals": ["SaaS", "FinTech"],
  "icp_geo": ["US", "UK"],
  "pain_points": ["Low reply rates", "No ICP clarity"],
  "objections": ["Already using competitor X"],
  "competitors": ["Outreach", "Apollo"],
  "tone": "professional-casual",
  "campaign_goals": "Book 20 meetings/month",
  "differentiators": ["AI-driven optimization", "Multi-channel"]
}
```

---

## 12. API Route Structure

### Public Routes (Browser → Next.js)

```
/api/auth/
  callback/           POST  Supabase auth callback

/api/accounts/
  route.ts            GET   List user's accounts
                      POST  Create account
  [id]/members/       GET   List members
                      POST  Invite member

/api/companies/
  route.ts            GET   List companies for account
                      POST  Create company (starts onboarding)
                      PATCH Update company
  [id]/deploy-agent/  POST  Provision OpenClaw agent
  [id]/onboarding/    PATCH Update onboarding progress

/api/chat/
  route.ts            POST  Send message (proxies to OpenClaw, returns SSE)
  sessions/           GET   List sessions for company
                      POST  Create session
                      DELETE Delete session
  messages/           GET   Get messages for session (paginated)

/api/dashboard/
  metrics/            GET   Dashboard KPIs (scoped to company)

/api/inbox/
  messages/           GET   List messages (filtered)
                      POST  Create/sync message
  messages/[id]/      GET   Single message
                      PATCH Update message fields
  ai/analyze/         POST  Trigger AI analysis (spawns inbox session)
  ai/suggest/         POST  Get AI suggestions
  reply/              POST  Send reply via PlusVibe
  tags/               GET   List tags
  threads/[id]/       GET   Thread detail

/api/inboxing/
  domains/            GET   List domains (company-scoped)
                      POST  Create domains
  health/             GET   Domain health
  registrars/         GET   List registrars
  platforms/          GET   List platform connections

/api/knowledge/
  documents/          GET   List documents
                      POST  Create document
  documents/[id]/     PATCH Update
                      DELETE Delete

/api/events/
  route.ts            GET   List events (filtered by status/type)
                      PATCH Mark event as read/acted/dismissed

/api/research/
  jobs/               GET   List research jobs
                      POST  Trigger research job

/api/settings/
  status/             GET   API health checks
  credentials/        GET   Check which integrations are configured
                      PATCH Update integration credentials
```

### Agent Proxy Routes (OpenClaw Agent → Next.js)

```
/api/tools/
  (middleware: validate X-Agent-Token, extract company_id)

  inboxing/
    domains/          GET   List company's domains
                      POST  Create domains (tags with company_id)
    health/           GET   Domain health (scoped)
    registrars/       GET   List registrars (scoped)

  data/
    inbox/
      messages/       GET   Company's inbox messages
      threads/        GET   Company's email threads
    campaigns/        GET   Company's campaign records
    knowledge/        GET   Company's knowledge documents
                      POST  Create document
    events/           POST  Create event (agent can post notifications)

  invoke/             POST  Generic tool invocation + audit logging
```

---

## 13. UI Component Architecture

### Layout

**AppShell** remains the top-level layout wrapper. Changes:
- Company selector becomes functional (reads from Supabase, stores in CompanyContext)
- Event notification badge on sidebar
- User info from Supabase Auth (not hardcoded)

### Context Providers

```tsx
<AuthProvider>           {/* Supabase auth state */}
  <CompanyProvider>      {/* Selected company ID + data */}
    <EventProvider>      {/* Unread event count, toast triggers */}
      <AppShell>
        {children}
      </AppShell>
    </EventProvider>
  </CompanyProvider>
</AuthProvider>
```

### Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `CompanyProvider` | context | Holds selected company, provides `useCompany()` hook |
| `EventProvider` | context | Polls events, provides `useEvents()`, fires toasts |
| `OnboardingWizard` | `components/onboarding/` | Multi-step company setup form |
| `ChatPanel` | `components/chat/` | Unified chat component used on Julian page and embeddable elsewhere |
| `ChatHistory` | `components/chat/` | Session list sidebar |
| `ChatMessage` | `components/chat/` | Single message renderer (keep existing, extend for compaction markers) |
| `ChatInput` | `components/chat/` | Message input with context-aware suggestions |
| `ToolCallCard` | `components/chat/` | Tool invocation display (keep existing) |
| `EventsCard` | `components/dashboard/` | Action items card for dashboard |
| `EventToast` | `components/events/` | Toast notification for alerts |
| `ActionButton` | `components/events/` | Renders event action buttons (navigate/agent/dismiss) |

### Page Structure

| Route | Component | Data Source |
|-------|-----------|-------------|
| `/` | ChatPage | chat_sessions, chat_messages via API |
| `/dashboard` | DashboardPage | dashboard/metrics API + events API |
| `/campaigns` | CampaignsPage | plusvibe API (via company credentials) |
| `/inbox` | InboxPage | inbox_messages, email_threads |
| `/inboxes` | InboxesPage | inboxing_domains, registrars, platforms |
| `/icp` | ICPPage | supermemory + knowledge_documents |
| `/knowledge` | KnowledgePage | knowledge_documents |
| `/settings` | SettingsPage | companies, integration status checks |
| `/onboarding` | OnboardingPage | companies.onboarding_data |

All pages wrap in `<AppShell>`. All data hooks receive `companyId` from `useCompany()` context.

---

## 14. Data Flow Diagrams

### Flow 1: User Signup → First Company

```
Browser                    Next.js API              Supabase         OpenClaw
───────                    ───────────              ────────         ────────
POST /signup
  email, password    →
                           supabase.auth.signUp() →  auth.users row
                     ←     redirect to /
GET / (chat page)    →
                           check: any companies?  →  companies: none
                     ←     redirect to /onboarding

[Wizard steps 1-6]   →    PATCH /companies/{id}/onboarding
                           update onboarding_data →  companies row updated

[Step 7: Deploy]     →     POST /companies/{id}/deploy-agent
                           1. generate token      →  companies.agent_config
                           2. write workspace
                           3. register agent       →                  agents.list updated
                           4. seed supermemory     →                  (via Supermemory API)
                     ←     redirect to /dashboard
```

### Flow 2: Inbox Email → AI Analysis → Action Item

```
PlusVibe webhook     →     POST /api/inbox/messages
                           write to inbox_messages →  inbox_messages row

[User clicks Analyze] →    POST /api/inbox/ai/analyze
                           1. create chat_sessions →  session_type: 'inbox'
                           2. write chat_messages   →  role: 'user' (analysis request)
                           3. POST /hooks/agent     →                  agent processes
                           4. receive result        ←                  analysis response
                           5. write chat_messages   →  role: 'assistant'
                           6. update inbox_messages →  ai_summary, sentiment, intent
                           7. write Supermemory     →                  (via Supermemory API)
                           8. if meeting_request:
                              write events          →  event_type: 'action_item'
                     ←     return analysis to UI

[Dashboard shows]    ←     GET /api/events?status=unread
                           action_item card displayed
```

### Flow 3: Main Chat → Agent Uses Sub-Session Summary

```
User: "How are my campaigns doing?"

Chat page             →    POST /api/chat (main session)
                           write chat_messages      → user message
                           POST /hooks/agent         →  main session

                           Agent internally:
                           1. memory_search("campaigns") → reads MEMORY.md
                           2. supermemory_query("campaign performance") → Supermemory
                           3. /api/tools/data/inbox/messages?summary=true → proxy

                           Agent responds with analysis using:
                           - MEMORY.md: "Campaign Q1 optimized on 2/10, angle changed"
                           - Supermemory: "3 positive replies from SaaS vertical"
                           - Supabase: "15 unread, 8 positive, 3 meetings pending"

                     ←     Streaming response via SSE
                           write chat_messages      → assistant response
```

---

## 15. Platform Credentials & Key Management

### Key Resolution Order

```typescript
async function getPlatformKey(service: string): Promise<string | null> {
  // 1. Check platform_credentials table (production)
  const row = await supabase.from('platform_credentials')
    .select('api_key').eq('service', service).eq('is_active', true).single();
  if (row.data?.api_key) return row.data.api_key;

  // 2. Fall back to env var (local dev)
  const envMap = {
    'inboxing': 'INBOXING_API_KEY',
    'perplexity': 'PERPLEXITY_API_KEY',
    'supermemory_admin': 'SUPERMEMORY_API_KEY',
  };
  return process.env[envMap[service]] ?? null;
}
```

### Which Keys Go Where

| Key | Category | Storage | Agent Access |
|-----|----------|---------|--------------|
| `SUPABASE_SERVICE_ROLE_KEY` | Tier 3 | env var only | Never (proxied) |
| `INBOXING_API_KEY` | Tier 3 | platform_credentials / env | Never (proxied) |
| `SUPERMEMORY_API_KEY` | Tier 2 | provisioned per company namespace | Direct (in TOOLS.md) |
| `PERPLEXITY_API_KEY` | Tier 3 | platform_credentials / env | Provisioned into agent via TOOLS.md (we provide to each agent) |
| `PLUSVIBE_API_KEY` (user's) | Tier 1 | companies.integration_credentials | Direct (in TOOLS.md) |
| `CALENDLY_API_KEY` (user's) | Tier 1 | companies.integration_credentials | Direct (in TOOLS.md) |
| `CLOSE_API_KEY` (user's) | Tier 1 | companies.integration_credentials | Direct (in TOOLS.md) |
| `OPENCLAW_GATEWAY_TOKEN` | Internal | env var | N/A (Next.js ↔ OpenClaw only) |

### Local Dev

Keep current `.env.local` as-is. All existing keys continue to work. The `platform_credentials` table is empty in local dev — the resolver falls back to env vars. No code changes needed for local dev to keep working.

---

## 16. Feature Pages

### Dashboard (`/dashboard`)

**Data sources:** `/api/dashboard/metrics` (PlusVibe + Calendly), `/api/events` (action items)

**Components:**
- StatsGrid: total replies, positive replies, active leads, meetings booked (scoped to selected company)
- Active Campaigns card: list of active campaigns with reply rates
- **Action Items card (NEW):** displays unread events with action buttons
- Quick Actions card: navigation shortcuts

**Company scoping:** Metrics API uses the selected company's PlusVibe credentials from `integration_credentials`. If no company-specific key, falls back to global env var (local dev).

### Julian Chat (`/`)

**Layout:** Chat history sidebar (left) + main chat area (center)

**Features:**
- Session list from `chat_sessions` (filtered to `session_type: 'main'`)
- Per-message persistence (individual `chat_messages` rows)
- SSE streaming for responses
- Tool call display inline
- Compaction markers (expandable archived messages)
- Suggestion chips (context-aware)
- "Save to Knowledge Base" on assistant messages

### Inbox (`/inbox`)

**Layout:** Three columns — message list (left), message detail (center), AI sidebar (right)

**AI sidebar changes:**
- "Analyze" button spawns an `inbox` type session via OpenClaw (not rule-based keywords)
- "Research Company" triggers Perplexity via agent
- "Suggest Reply" gets AI-generated templates via agent
- Results still write to same Supabase fields (backwards compatible with current UI)

### Settings (`/settings`)

**New sections:**
- Agent status: shows OpenClaw connection, agent health per company
- Integration credentials: manage PlusVibe/Calendly/Close keys
- Compaction strategy selector
- Agent token rotation

---

*End of specification. All feature development should reference this document for architectural decisions, data flows, and component structure.*
