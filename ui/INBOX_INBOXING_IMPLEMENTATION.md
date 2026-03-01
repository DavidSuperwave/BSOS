# Inbox Management & Inboxing Integration - Implementation Guide

**Status:** Backend API Complete, Database Migration Ready, Frontend Pending
**Date:** 2026-02-11

---

## What Was Built

### Files Created

#### Database
| File | Purpose |
|------|---------|
| `prisma/migrations/001_inbox_and_inboxing.sql` | Full SQL migration for all 7 new tables |

#### Libraries
| File | Purpose |
|------|---------|
| `src/lib/inboxing-client.ts` | Typed client for Inboxing API v2 (`https://v2.inboxing.com/api/v2`) |

#### Feature 1: Inbox Management API (7 routes)
| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/inbox/messages` | GET, POST | List messages with filters; create/sync messages |
| `/api/inbox/messages/[id]` | GET, PATCH | Get single message; update status/tags/priority |
| `/api/inbox/threads/[id]` | GET, PATCH | Get thread with messages; update thread status |
| `/api/inbox/reply` | POST | Send reply via PlusVibe, track in DB |
| `/api/inbox/tags` | GET, POST, DELETE | CRUD for email tags |
| `/api/inbox/ai/analyze` | POST | Sentiment analysis, company research, thread summary |
| `/api/inbox/ai/suggest` | POST | Reply suggestions, action suggestions, template matching |

#### Feature 2: Inboxing Integration API (8 routes)
| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/inboxing/registrars` | GET, POST | List/connect domain registrars |
| `/api/inboxing/registrars/[id]` | DELETE | Remove registrar connection |
| `/api/inboxing/domains` | GET, POST | List managed domains; bulk create with provisioning |
| `/api/inboxing/domains/[id]/status` | GET | Domain provisioning status (syncs with Inboxing API) |
| `/api/inboxing/domains/[id]/csv` | GET | Download mailbox credentials CSV |
| `/api/inboxing/domains/generate` | POST | AI-powered domain name generation |
| `/api/inboxing/domains/check` | POST | Check domain availability via DNS |
| `/api/inboxing/health` | GET, POST | Domain health dashboard; trigger health checks |
| `/api/inboxing/upload` | POST | Upload domain mailboxes to PlusVibe |
| `/api/inboxing/upload/status` | GET | Check upload progress |
| `/api/inboxing/platforms` | GET, POST | List/connect email platforms |

#### Modified Files
| File | Changes |
|------|---------|
| `src/lib/hooks.ts` | Added 7 new SWR hooks: `useInboxMessages`, `useEmailTags`, `useInboxingDomains`, `useInboxingHealth`, `useRegistrars`, `usePlatformConnections` |
| `src/lib/env.ts` | Added `inboxing.apiKey` config |

---

## Database Schema (7 New Tables)

### Feature 1: Inbox Management

**`inbox_messages`** — Campaign email replies with AI analysis
- Columns: id, company_id, campaign_id, campaign_name, thread_id, plusvibe_id, from_email, from_name, from_domain, to_email, subject, body, body_text, sentiment, intent, tags[], status, priority, reply_count, last_reply_at, ai_summary, suggested_actions, company_enrichment, created_at, updated_at
- Indexes: company_id, campaign_id, thread_id, sentiment, status, priority, created_at, from_domain
- Check constraints on sentiment, intent, status, priority

**`email_threads`** — Threaded conversation tracking
- Columns: id, company_id, campaign_id, prospect_email, prospect_name, prospect_company, status, message_count, last_activity, ai_analysis, created_at, updated_at
- Indexes: company_id, campaign_id, prospect_email, status, last_activity

**`email_tags`** — Tagging system
- Columns: id, company_id, name, color, category, rules, created_at
- Unique constraint: (company_id, name)

### Feature 2: Inboxing Integration

**`registrar_credentials`** — Domain provider connections (Porkbun, GoDaddy, Dynadot, Spaceship)
- Columns: id, company_id, provider, name, api_key, api_secret, is_active, last_tested_at, status, created_at, updated_at

**`platform_connections`** — Email platform connections (PlusVibe, Instantly, Smartlead, Email Bison)
- Columns: id, company_id, platform, name, username, password, api_key, workspace_id, extra_config, verification_status, verification_error, created_at, updated_at

**`inboxing_domains`** — Managed domains for outbound campaigns
- Columns: id, company_id, domain (unique), status, inboxing_id, registrar_id, cloudflare_id, platform_connection_id, user_count, mailbox_count, tags[], campaign_id, redirect_url, redirect_type, csv_available_at, nameservers[], failure_reason, health_score, last_health_check, dns_spf, dns_dkim, dns_dmarc, created_at, updated_at
- Status lifecycle: pending -> dns_setup -> update_nameservers -> queued -> setting_up -> active | failed

**`inboxing_jobs`** — Async provisioning job tracker
- Columns: id, company_id, domain_id, type, status, payload, result, error, created_at, completed_at

---

## Environment Variables (New)

Add to `.env`:
```
INBOXING_API_KEY=your_inboxing_api_key
```

Existing variables still required:
```
PLUSVIBE_API_KEY, PLUSVIBE_WORKSPACE_ID  # For reply sending
PERPLEXITY_API_KEY                       # For AI analysis & domain generation
SUPABASE_SERVICE_ROLE_KEY                # For all DB operations
```

---

## API Endpoint Reference

### Inbox Management

#### GET /api/inbox/messages
Query params: `companyId`, `campaignId`, `sentiment` (positive|neutral|negative|ooo|auto_reply), `status` (unread|read|replied|archived|booked), `priority` (high|medium|low), `search`, `page`, `limit`

Response:
```json
{
  "messages": [...],
  "pagination": { "page": 1, "limit": 50, "total": 123, "pages": 3 }
}
```

#### POST /api/inbox/messages
Body: `{ campaign_id, from_email, to_email, subject, body, company_id?, thread_id?, sentiment?, intent?, tags?, priority? }`

#### PATCH /api/inbox/messages/:id
Body: `{ status?, priority?, tags?, sentiment?, intent?, ai_summary?, suggested_actions? }`

#### GET /api/inbox/threads/:id
Returns thread + all messages in chronological order.

#### POST /api/inbox/reply
Body: `{ to, subject, body, from?, thread_id?, message_id?, company_id?, scheduled_for? }`
Sends via PlusVibe unibox reply API, updates message status to "replied".

#### POST /api/inbox/ai/analyze
Body: `{ message_id?, thread_id?, type: "sentiment" | "company" | "thread_summary" }`
- `sentiment`: Rule-based sentiment + intent detection, updates message
- `company`: Perplexity research on from_domain, stores enrichment
- `thread_summary`: Analyzes full thread, stores AI analysis

#### POST /api/inbox/ai/suggest
Body: `{ message_id, type: "reply" | "actions" | "template" }`
- `reply`: Generates 2-3 reply drafts with different tones
- `actions`: Suggests next steps (check calendly, draft reply, research company, etc.)
- `template`: Matches message to best templates by sentiment/intent

### Inboxing Integration

#### POST /api/inboxing/domains
Body:
```json
{
  "company_id": "uuid",
  "domains": ["domain1.com", "domain2.com"],
  "names": [{ "first_name": "John", "last_name": "Doe" }],
  "user_count": 49,
  "tags": ["campaign-q1"],
  "auto_upload": true,
  "platform_connection_id": "uuid",
  "campaign_id": "campaign_123"
}
```

#### POST /api/inboxing/domains/generate
Body: `{ niche: "SaaS Growth", keywords: ["scale", "revenue"], count: 10 }`
Returns AI-generated brandable domain suggestions with relevance scores.

#### POST /api/inboxing/domains/check
Body: `{ domains: ["example.com", "test.io"] }`
Returns availability status via DNS lookup heuristic.

#### GET /api/inboxing/domains/:id/status
Syncs with Inboxing API, returns domain status + recent jobs.

#### GET /api/inboxing/domains/:id/csv
Downloads mailbox credentials CSV (requires domain active + 24hr warmup).

#### POST /api/inboxing/upload
Body: `{ domain_id, platform_connection_id, enable_warmup: true, sync_tags: true }`

#### GET /api/inboxing/health
Returns all domains with health scores and DNS status summary.

#### POST /api/inboxing/health
Triggers DNS health check (SPF, DKIM, DMARC) for all active domains.

---

## Frontend Changes Needed

### New Pages

#### 1. `/inbox` — Inbox Management Page
**Layout:** Three-column (thread list | conversation | AI sidebar)

**Components needed:**
- `InboxList` — Filterable list of threads/messages with sentiment badges
- `ThreadView` — Collapsible message chain showing conversation history
- `ReplyComposer` — Rich text editor with PlusVibe send, template picker, tone selector
- `AISidebar` — Julian AI panel for analysis, suggestions, and actions
- `TagManager` — Tag creation/assignment with color picker
- `InboxFilters` — Campaign, sentiment, status, priority, search filters

**Data hooks:** `useInboxMessages()`, `useEmailTags()`

**Key interactions:**
- Click message -> mark as read, show thread
- Reply button -> open composer, send via PlusVibe
- AI Analyze -> call `/api/inbox/ai/analyze`
- Suggested Actions -> render action buttons from `/api/inbox/ai/suggest`

#### 2. `/inboxes` — Inboxes Page (Domain/Inbox Provisioning)
**Layout:** Stepper wizard + status dashboard

**Components needed:**
- `ProviderSetup` — Connect registrars (Porkbun, GoDaddy, etc.) and platforms (PlusVibe)
- `DomainGenerator` — Niche/keywords input, AI generation, availability check
- `DomainSelector` — Checkbox list of generated domains with scores
- `InboxConfigurator` — Mailbox count, name variations, auto-upload toggle
- `ProvisioningStatus` — Real-time progress bars per domain
- `HealthDashboard` — Domain health scores, DNS status, at-risk alerts

**Data hooks:** `useInboxingDomains()`, `useInboxingHealth()`, `useRegistrars()`, `usePlatformConnections()`

**Key interactions:**
- Generate domains -> select -> bulk create -> monitor provisioning
- Health dashboard -> trigger check -> view DNS issues
- Upload to PlusVibe -> monitor upload stages

### Navigation Updates

Add to `src/components/app-shell.tsx` `navItems`:
```typescript
{ name: "Inbox", href: "/inbox", icon: Mail },
{ name: "Inboxes", href: "/inboxes", icon: Globe },
```

### New SWR Hooks (Already Added)

| Hook | Endpoint | Returns |
|------|----------|---------|
| `useInboxMessages(filters?)` | `/api/inbox/messages` | Messages + pagination |
| `useEmailTags(companyId?)` | `/api/inbox/tags` | Tag list |
| `useInboxingDomains(companyId?, status?)` | `/api/inboxing/domains` | Domain list + pagination |
| `useInboxingHealth(companyId?)` | `/api/inboxing/health` | Domains + health summary |
| `useRegistrars(companyId?)` | `/api/inboxing/registrars` | Registrar connections |
| `usePlatformConnections(companyId?)` | `/api/inboxing/platforms` | Platform connections |

---

## Setup Steps

### 1. Apply Database Migration
```bash
# Option A: Via Supabase MCP (after re-auth with /mcp)
# The SQL is in prisma/migrations/001_inbox_and_inboxing.sql

# Option B: Paste into Supabase SQL Editor
# https://supabase.com/dashboard/project/ovymybiibcxunnqoaoub/sql/new
```

### 2. Add Environment Variable
```bash
# Add to .env
INBOXING_API_KEY=your_key_from_inboxing_dashboard
```

### 3. Verify API Endpoints
```bash
npm run dev

# Test inbox messages
curl http://localhost:3000/api/inbox/messages

# Test inboxing domains
curl http://localhost:3000/api/inboxing/domains

# Test domain generation
curl -X POST http://localhost:3000/api/inboxing/domains/generate \
  -H "Content-Type: application/json" \
  -d '{"niche": "SaaS Growth", "keywords": ["scale"], "count": 5}'

# Test health dashboard
curl http://localhost:3000/api/inboxing/health
```

### 4. Build Frontend Pages
Follow the component structure outlined in "Frontend Changes Needed" above.

---

## Architecture Decisions

1. **Supabase direct queries** (not Prisma) for new tables — matches the existing chat API pattern and avoids needing `prisma db push` for new tables alongside existing Supabase-managed tables.

2. **Inboxing API v2 client** (`src/lib/inboxing-client.ts`) wraps all external API calls with typed interfaces and proper error handling.

3. **AI analysis is rule-based first**, with Perplexity for company research. This keeps it fast and free for basic sentiment/intent detection while using AI only for deeper analysis.

4. **Domain health uses Google DNS API** for SPF/DKIM/DMARC checks — no extra dependencies, works serverlessly.

5. **All tables have RLS enabled** with service_role full access policies, consistent with existing schema.
