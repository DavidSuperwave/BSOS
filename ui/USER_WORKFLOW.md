# GTM Engine - User Workflow & Requirements Checklist

**Project:** Blitzscale OS (BSOS)  
**Repo:** DavidSuperwave/BSOS (Vercel root: `ui/`)  
**Last Updated:** 2026-03-02  
**Status:** 🟡 Deployed to Vercel — env vars + migration needed for full functionality

---

## 🏗️ ARCHITECTURE OVERVIEW

| Layer | Stack | Notes |
|-------|-------|-------|
| Frontend | Next.js 14.1, React 18, Tailwind, shadcn/ui, Recharts | 23 pages, dark glass-card theme |
| API | Next.js API Routes (135 routes) | Auth via `authenticateUser()` + `requireCompanyAccess()` |
| BSOS Engine | 19 lib files at `src/lib/bsos/` | Signal pipeline, diagnostics, learning, approvals |
| Database | Supabase (Postgres + Auth + RLS) | 17 BSOS tables + existing app tables |
| Cron | Vercel Cron (4 BSOS + 6 existing) | Failure check, sync, EOD, decay |
| Notifications | Telegram Bot | Per-company bot token stored in DB |
| Integrations | PlusVibe, Close CRM, Calendly, Supermemory, OpenClaw | All per-company — keys stored in `companies` table, NOT env vars |
| Admin | Separate login at `/admin-login` | ADMIN_EMAILS env var whitelist |
| Hosting | Vercel (Next.js) + DigitalOcean (OpenClaw) | Supabase for DB/Auth |

### Key Design Rules
- **Agent suggests, never acts unilaterally** — L2+ actions require human-in-the-loop approval
- **Pattern inference = assumption, never fact** — all inferences labeled explicitly
- **Per-company credentials** — PlusVibe, Close, Calendly, Telegram keys come from the `companies` table via user onboarding, NOT from environment variables
- **Skills cannot contaminate core data** — write-validator enforces scope boundaries
- **Reply rate is meaningless without quality breakdown** — 3-factor analysis: ICP Fit, Timing, Offer Strength

---

## 🎯 COMPLETE USER JOURNEY

### Phase 1: Authentication & Onboarding

| # | Requirement | Status | Route/File | Test Notes |
|---|-------------|--------|------------|------------|
| 1.1 | User can sign up with email/password | ✅ | `/signup` → `(auth)/signup/page.tsx` | Supabase auth, auto-creates account via `/api/auth/account-setup` |
| 1.2 | User can log in | ✅ | `/login` → `(auth)/login/page.tsx` | Session persistence via Supabase SSR cookies |
| 1.3 | User can reset password | ⬜ | No dedicated page exists | Supabase supports it — needs `/forgot-password` page |
| 1.4 | User is redirected to login if not authenticated | ✅ | `src/middleware.ts` | Excludes `/api/` routes from redirect |
| 1.5 | User is redirected to dashboard if already logged in | ✅ | `src/middleware.ts` | Supabase session check |
| 1.6 | First-time onboarding flow (8-step wizard) | ✅ | `/onboarding` → `onboarding/page.tsx` | Steps: Basics, Product, ICP, Pain Points, Messaging, Integrations, Uploads, Review |
| 1.7 | Account setup creates company + account_members row | ✅ | `/api/auth/account-setup` | Idempotent — skips if already exists |

### Phase 2: Company Setup (via Onboarding Wizard)

| # | Requirement | Status | Route/File | Test Notes |
|---|-------------|--------|------------|------------|
| 2.1 | Create company profile (name, slug, timezone) | ✅ | `step-basics.tsx` → `/api/companies/[id]/onboarding` | Saved during onboarding |
| 2.2 | Upload company assets (logos, case studies) | ✅ | `step-uploads.tsx` → `/api/media/upload` | File storage via media routes |
| 2.3 | Configure ICP (Ideal Customer Profile) | ✅ | `step-icp.tsx` | Industry, roles, company size |
| 2.4 | Configure pain points & messaging | ✅ | `step-pain-points.tsx`, `step-messaging.tsx` | Framework selection during onboarding |
| 2.5 | Connect integrations (PlusVibe, Close, Calendly) | ✅ | `step-integrations.tsx` | **API keys stored in `companies` table** — per-company, not env vars |
| 2.6 | Supermemory container provisioning | ✅ | `/api/companies/[id]/provision` | Auto-provisioned on company create |
| 2.7 | OpenClaw agent provisioning | ✅ | `/api/companies/[id]/agents/provision`, `/api/companies/[id]/deploy-agent` | Deploys agent container on DigitalOcean |
| 2.8 | Configure notification preferences | ⬜ | — | Telegram token collected in integrations step, but no toggle UI for notification types |

### Phase 3: Dashboard & Metrics

| # | Requirement | Status | Route/File | Test Notes |
|---|-------------|--------|------------|------------|
| 3.1 | View key metrics grid (replies, positive rate, active leads, meetings) | ✅ | `/dashboard` → `dashboard/page.tsx` | Uses `useDashboardMetrics()` hook → `/api/dashboard/metrics` |
| 3.2 | Daily send chart | ✅ | `daily-send-chart.tsx` | Recharts line chart |
| 3.3 | SLA monitoring table | ✅ | `sla-monitoring-table.tsx` | Per-campaign SLA tracking |
| 3.4 | Real-time event feed | ✅ | `events-card.tsx` → `/api/dashboard/activities` | New replies, interested leads |
| 3.5 | Skills health panel on dashboard | ✅ | `skills-health-panel.tsx` | Shows skill status inline |
| 3.6 | Setup banner for incomplete onboarding | ✅ | `setup-banner.tsx` | Prompts to complete missing config |

### Phase 4: Campaign Management

| # | Requirement | Status | Route/File | Test Notes |
|---|-------------|--------|------------|------------|
| 4.1 | View all campaigns list | ✅ | `/campaigns` → `campaigns/page.tsx` | With status badges, via PlusVibe API |
| 4.2 | Create new campaign (wizard) | ✅ | `campaign-wizard.tsx` | Name, industry, role, framework |
| 4.3 | Campaign analytics view | ✅ | `campaign-analytics.tsx` → `/api/plusvibe/campaigns/[id]/analytics` | Leads, sent, replies, positive rate |
| 4.4 | Sequence editor | ✅ | `sequence-editor.tsx` | Edit email sequences within campaign |
| 4.5 | View campaign leads | ✅ | `/api/plusvibe/campaigns/[id]/leads` | Lead list per campaign |
| 4.6 | Campaign score (HCE) | ✅ | `/api/campaigns/[id]/score` + `/api/bsos/score` | 4-factor HCE scoring: Volume 20%, Engagement 35%, Health 25%, Quality 20% |
| 4.7 | Optimization mode toggle (Facebook Ads-style) | ✅ | `/api/bsos/optimization` | GET status + PATCH to toggle/advance phase |
| 4.8 | Activate/pause campaign | 🟡 | Via PlusVibe API | Toggle exists in PlusVibe, needs UI confirmation |
| 4.9 | Duplicate / delete campaign | ⬜ | — | Not implemented yet |

### Phase 5: Analytics & Reporting

| # | Requirement | Status | Route/File | Test Notes |
|---|-------------|--------|------------|------------|
| 5.1 | Analytics page with charts | ✅ | `/analytics` → `analytics/page.tsx` | Recharts: bar, pie, line charts |
| 5.2 | Report filter bar (date range, campaign) | ✅ | `report-filter-bar.tsx` | Date range selector |
| 5.3 | Report cards with data visualization | ✅ | `report-card.tsx` → `/api/reports/[id]/data` | Per-report data endpoints |
| 5.4 | Report CRUD | ✅ | `/api/reports` (GET/POST), `/api/reports/[id]` | Create, read, update, delete |
| 5.5 | Export analytics data | ⬜ | — | CSV/JSON export not implemented |
| 5.6 | Daily intelligence snapshots | ✅ | `/api/bsos/snapshots` | Stored by date, queryable |

### Phase 6: BSOS Diagnostic Engine

| # | Requirement | Status | Route/File | Test Notes |
|---|-------------|--------|------------|------------|
| 6.1 | Reply classification (9 types, no LLM) | ✅ | `/api/bsos/replies/classify` → `reply-classifier.ts` | Keyword-based: interested, meeting_request, objection, not_interested, OOO, bounce, unsubscribe, neutral, spam |
| 6.2 | Reply quality 3-factor scoring | ✅ | `reply-classifier.ts` → `computeReplyQuality()` | Factor 1: ICP Fit, Factor 2: Timing, Factor 3: Offer Strength |
| 6.3 | Campaign diagnostics | ✅ | `/api/bsos/diagnose` → `campaign-diagnostician.ts` | Bounce/reply/health thresholds, inferences LABELED as assumptions |
| 6.4 | Bounce classification (7 types) | ✅ | `/api/bsos/bounces` → `signal-pipeline.ts` | hard_bounce, soft_bounce, mailbox_full, invalid_address, dns_failure, policy_block, unknown |
| 6.5 | EOD reports | ✅ | `/api/bsos/eod` → `eod-reporter.ts` | Per-campaign summaries, cross-company aggregation, Telegram delivery |
| 6.6 | Signal ingestion & normalization | ✅ | `/api/bsos/signals` + `/api/bsos/signals/ingest` → `signal-pipeline.ts` | Proxy scoring, PlusVibe event normalization, batch writes |

### Phase 7: BSOS Learning System

| # | Requirement | Status | Route/File | Test Notes |
|---|-------------|--------|------------|------------|
| 7.1 | Thompson Sampling bandit engine | ✅ | `/api/bsos/bandit` → `bandit-engine.ts` | Beta distribution sampling, pessimistic priors (beta=49) |
| 7.2 | Optimization phase management | ✅ | `/api/bsos/optimization` → `phase-manager.ts` | cold_start → discovery → signal_accumulation → optimization → scaling |
| 7.3 | Confidence lifecycle (Ebbinghaus decay) | ✅ | `/api/bsos/learnings` → `confidence-lifecycle.ts` | 10%/30 days decay, auto-expire below 0.05 |
| 7.4 | Cold start management | ✅ | `/api/bsos/cold-start` → `cold-start.ts` | Industry priors (LABELED as inferences), graduation checks |
| 7.5 | HCE 4-factor scoring | ✅ | `/api/bsos/score` → `hce-scoring.ts` | Volume 20% + Engagement 35% + Health 25% + Quality 20%, target <50ms |

### Phase 8: Skills & Approval System

| # | Requirement | Status | Route/File | Test Notes |
|---|-------------|--------|------------|------------|
| 8.1 | Skills store (browse, install, configure) | ✅ | `/skills` → `skills-settings.tsx` | Browse catalog, install/uninstall, configure per-company |
| 8.2 | Skill execution with guardrails | ✅ | `/api/bsos/skills/execute` → `skill-executor.ts` | Risk level check, write scope validation, trace logging |
| 8.3 | Human-in-the-loop approval queue | ✅ | `/api/bsos/approvals` → `approval-manager.ts` | L2+ actions routed to approval, Telegram notification, 24hr expiry |
| 8.4 | Approve/reject actions | ✅ | `/api/bsos/approvals/[id]` | PATCH to approve/reject, auto-executes on approval |
| 8.5 | Write contamination guard | ✅ | `write-validator.ts` | Skills cannot write outside declared containers |
| 8.6 | Agent trace log (observability) | ✅ | `/api/bsos/traces` | Full execution trace: input, output, duration, errors |
| 8.7 | Skill sharing & import | ✅ | `/api/companies/[id]/agent/skills/share`, `/skills/import` | Share skills across companies |
| 8.8 | Insight review queue | ✅ | `/insights/review` → `review-queue.tsx` | Validate low-confidence generated insights |

### Phase 9: Chat Interface (JulianAI)

| # | Requirement | Status | Route/File | Test Notes |
|---|-------------|--------|------------|------------|
| 9.1 | Chat with AI agent | ✅ | `/api/chat` → `openclaw-client.ts` | Streaming SSE responses via OpenClaw |
| 9.2 | Chat session management | ✅ | `/api/chat/sessions`, `/api/chat/messages` | Persistent sessions, history |
| 9.3 | Task system (approve/cancel/retry) | ✅ | `/api/chat/tasks/[id]/approve`, `cancel`, `retry` | Agent proposes actions, user approves |
| 9.4 | Context-aware responses (Supermemory) | ✅ | `supermemory-client.ts`, knowledge tools | Company-scoped memory retrieval |
| 9.5 | Knowledge base (projects, documents) | ✅ | `/knowledge` → knowledge API routes | Upload docs, organize in projects, query via agent |
| 9.6 | Preset flows | ✅ | `preset-flows.ts` | Guided conversation flows |
| 9.7 | Feature flags for chat | ✅ | `feature-flags.ts` | Toggle chat capabilities |

### Phase 10: Inbox & Deliverability

| # | Requirement | Status | Route/File | Test Notes |
|---|-------------|--------|------------|------------|
| 10.1 | Inbox message viewer | ✅ | `/inbox` → `inbox/page.tsx` | View messages with search, filter, tags |
| 10.2 | AI inbox analysis & suggestions | ✅ | `/api/inbox/ai/analyze`, `/api/inbox/ai/suggest` | AI-powered reply suggestions |
| 10.3 | Inbox reply | ✅ | `/api/inbox/reply` | Send replies from within the app |
| 10.4 | Inbox chat | ✅ | `inbox-chat.tsx` → `/api/inbox/chat` | Chat about specific inbox threads |
| 10.5 | Domain management (Inboxing moat) | ✅ | `/inboxes` → `inboxes/page.tsx` | Domain list, DNS status, nameservers |
| 10.6 | Domain provisioning & upload | ✅ | `/api/inboxing/domains`, `/api/inboxing/upload` | Generate, check, upload domains |
| 10.7 | Platform connections | ✅ | `/api/inboxing/platforms` | Connect email sending platforms |
| 10.8 | Inboxing health monitoring | ✅ | `/api/inboxing/health` | Deliverability scores |
| 10.9 | Warm-up status tracking | 🟡 | — | Health endpoint exists, needs dedicated warmup UI with progress bars |
| 10.10 | Operational limits enforcement | ✅ | `env-bsos.ts` | 8-10 warmup/day + 2-5 cold/day = max 15/day per mailbox, 60-min spacing, 14-day warmup minimum |

### Phase 11: Settings & Configuration

| # | Requirement | Status | Route/File | Test Notes |
|---|-------------|--------|------------|------------|
| 11.1 | General settings (company name, timezone) | ✅ | `/settings` → `CompanySettings.tsx` | Tabbed interface |
| 11.2 | Integration credentials management | ✅ | `Settings.tsx` → `INTEGRATION_FIELDS` | PlusVibe, Close, Calendly, Supermemory, Perplexity, OpenClaw |
| 11.3 | Integration status indicators | ✅ | `/api/settings/status` | Connected/disconnected per service |
| 11.4 | User management (team members) | 🟡 | `account_members` table exists | Needs dedicated UI for invite/remove |
| 11.5 | Security settings (change password, 2FA) | ⬜ | — | Not implemented |
| 11.6 | Notification settings toggle UI | ⬜ | — | Telegram token collected but no per-type toggle |

### Phase 12: Admin Dashboard (Separate Login)

| # | Requirement | Status | Route/File | Test Notes |
|---|-------------|--------|------------|------------|
| 12.1 | Separate admin login | ✅ | `/admin-login` → `admin-login/page.tsx` | Email whitelist via `ADMIN_EMAILS` env var + DB role check |
| 12.2 | Admin verify API | ✅ | `/api/admin/verify` | POST — checks email + `account_members` owner role |
| 12.3 | Platform overview dashboard | ✅ | `/admin/dashboard` | Companies, users, domains, system health |
| 12.4 | User management | ✅ | `/admin/users` | Search, email, role, company, join date |
| 12.5 | Cross-company campaign monitoring | ✅ | `/admin/campaigns` | All campaigns across all companies |
| 12.6 | System health panel | ✅ | `/admin/health` | Supabase, PlusVibe, Telegram, OpenClaw with latency |
| 12.7 | Approval queue (admin view) | ✅ | `/admin/approvals` | Approve/reject agent actions across companies |
| 12.8 | Cron execution logs | ✅ | `/admin/cron-logs` → `/api/bsos/admin/cron-logs` | Type, timestamp, result JSON |
| 12.9 | Usage metrics | ✅ | `/api/admin/usage` | Platform-wide usage stats |

---

## 🔧 TECHNICAL REQUIREMENTS

### Backend/API

| # | Requirement | Status | Notes |
|---|-------------|--------|-------|
| T.1 | All API routes protected by auth | ✅ | `authenticateUser()` + `requireCompanyAccess()` from `@/lib/api-auth` |
| T.2 | Company-scoped data access | ✅ | `requireCompanyAccess()` ensures user belongs to company |
| T.3 | Rate limiting on API endpoints | ✅ | `rate-limit.ts` — in-memory token bucket (chat route uses it) |
| T.4 | Error handling & logging | ✅ | Sentry integration (optional via `NEXT_PUBLIC_SENTRY_DSN`) |
| T.5 | Webhook handlers (PlusVibe, Close, Calendly) | ✅ | `/api/webhooks/plusvibe`, `/api/webhooks/close`, `/api/webhooks/calendly` |
| T.6 | BSOS Cron jobs (4 Vercel crons) | ✅ | Failure check (30min), full sync (2hr), EOD (11PM UTC), decay (monthly 1st) |
| T.7 | Legacy cron jobs (6 routes) | ✅ | classify-replies, daily-snapshot, eod-report, health-check, learning-decay, sync-signals |
| T.8 | CRON_SECRET verification | ✅ | `verifyCronSecret()` in `cron-runner.ts` — all cron routes protected |
| T.9 | Per-company credential resolution | ✅ | `company-credentials.ts` — reads from `companies` table, NO env var fallback |

### Database (Supabase)

| # | Requirement | Status | Notes |
|---|-------------|--------|-------|
| D.1 | Users / Auth | ✅ | Supabase Auth built-in |
| D.2 | Companies table | ✅ | Includes integration credentials columns |
| D.3 | Account members | ✅ | Multi-tenancy: user_id + account_id + role |
| D.4 | BSOS tables (17 new) | 🔴 MIGRATION NEEDED | `BSOS_production_migration.sql` — not yet applied |
| D.5 | RLS policies on all BSOS tables | ✅ | 16 tables have RLS enabled in migration |
| D.6 | Cron log table | ✅ | `bsos_cron_log` — included in migration |
| D.7 | Indexes for query performance | ✅ | Composite indexes on company_id + campaign_id + timestamps |

### BSOS Tables (in migration SQL)

| Table | Purpose |
|-------|---------|
| `campaign_signals` | Raw event stream (opens, replies, bounces, clicks) |
| `bounce_events` | Detailed bounce classification (7 types) |
| `account_health_snapshots` | Per-account deliverability health |
| `learning_entries` | Accumulated learnings with confidence scores |
| `daily_intelligence_snapshots` | EOD aggregated reports |
| `action_outcome_pairs` | What was tried → what happened |
| `bandit_state` | Thompson Sampling arm state |
| `campaign_optimization_state` | Per-campaign optimization phase + toggle |
| `approval_queue` | Human-in-the-loop action approvals |
| `agent_trace_log` | Full skill execution traces |
| `skill_registry` | Global skill definitions |
| `company_skill_registry` | (ALTER) Added risk_level, permissions, contamination_scope, stage |
| `reply_quality_scores` | 3-factor reply quality breakdown |
| `icp_performance_tracking` | ICP effectiveness metrics |
| `competitive_intelligence` | Market/competitor data store |
| `sender_reputation_log` | Per-sender deliverability tracking |
| `bsos_cron_log` | Cron execution audit trail |

### Integrations

| # | Integration | Status | Storage | Notes |
|---|-------------|--------|---------|-------|
| I.1 | PlusVibe API | ✅ | `companies.plusvibe_api_key` + `plusvibe_workspace_id` | Campaign sending, analytics, leads |
| I.2 | Close CRM API | ✅ | `companies.close_api_key` | Lead push on interested replies |
| I.3 | Supermemory v3 | ✅ | `companies.supermemory_api_key` | Company-scoped knowledge memory |
| I.4 | Calendly | ✅ | `companies.calendly_api_key` | Meeting booking webhooks |
| I.5 | Telegram | ✅ | `companies.telegram_bot_token` + `telegram_chat_id` | Bot alerts — **per-company** |
| I.6 | OpenClaw | ✅ | Per-company agent container on DigitalOcean | Chat backbone, agent execution |
| I.7 | Inboxing.com | ✅ | `companies.inboxing_api_key` | Domain/mailbox provisioning moat |
| I.8 | Perplexity AI | ✅ | `companies.perplexity_api_key` | Market research |

### Frontend

| # | Requirement | Status | Notes |
|---|-------------|--------|-------|
| F.1 | Responsive design (mobile/desktop) | ✅ | Tailwind breakpoints, AppShell with sidebar |
| F.2 | Dark mode UI | ✅ | Glass card theme throughout |
| F.3 | Loading states | ✅ | Suspense boundaries with fallbacks on all pages |
| F.4 | Error boundaries | 🟡 | Sentry captures, but no visible error boundary UI |
| F.5 | Toast notifications | 🟡 | Some exist, not consistent across all actions |
| F.6 | Form validation | 🟡 | Basic validation exists, no Zod/react-hook-form |

---

## ✅ ACCEPTANCE CRITERIA

### MVP (Must Have for Testing)
- [x] User can sign up and create company (via onboarding wizard)
- [x] User can connect PlusVibe/Close/Calendly during onboarding
- [x] Dashboard shows metrics from PlusVibe
- [x] Chat works with OpenClaw integration
- [x] Webhooks process replies (PlusVibe, Close, Calendly)
- [x] Campaigns page shows PlusVibe campaigns
- [x] Admin dashboard at `/admin-login` with separate auth
- [ ] **Supabase migration applied** (BSOS tables exist)
- [ ] **Vercel env vars set** (Supabase + CRON_SECRET + ADMIN_EMAILS)
- [ ] **Admin user created** in Supabase Auth

### v1.1 (Post-Launch)
- [ ] Password reset page
- [ ] User invitation/team management UI
- [ ] Campaign duplicate/delete
- [ ] Analytics CSV/JSON export
- [ ] Notification preference toggles
- [ ] Warm-up progress bar UI
- [ ] Error boundary UI components
- [ ] Consistent toast notifications

### v1.2 (Future)
- [ ] Advanced analytics (cohorts, funnels)
- [ ] Multi-company switching
- [ ] White-label options
- [ ] External API access for third-party tools

---

## 🧪 TESTING WORKFLOW

### Pre-Test Setup (REQUIRED)

```
1. Apply Supabase migration:
   - Run BSOS_production_migration.sql in Supabase SQL Editor
   - Verify 17 tables created + RLS enabled

2. Set Vercel environment variables:
   - NEXT_PUBLIC_SUPABASE_URL = <your Supabase project URL>
   - NEXT_PUBLIC_SUPABASE_ANON_KEY = <your anon key>
   - SUPABASE_SERVICE_ROLE_KEY = <your service role key>
   - CRON_SECRET = <any random string>
   - ADMIN_EMAILS = david@superwave.io

3. Create admin user in Supabase Auth:
   - Email: david@superwave.io
   - Password: Bsos@Admin2026!
   - Ensure account_members row with role='owner'

4. Redeploy Vercel after adding env vars
```

### E2E Test Scenarios

```
Test 1 — Auth Flow:
Sign Up → Account Created → Redirected to Onboarding → Complete 8 Steps → Dashboard

Test 2 — Campaign Flow:
Login → Dashboard → Campaigns → View PlusVibe Campaigns → Campaign Analytics → HCE Score

Test 3 — Chat Flow:
Login → Chat → Send Message → Streaming Response → Context from Supermemory → Session Restore

Test 4 — Webhook Flow:
PlusVibe sends reply webhook → Reply classified → Signal stored → Telegram alert → Close CRM updated

Test 5 — BSOS Diagnostics:
GET /api/bsos/health → All services green
GET /api/bsos/diagnose?company_id=X&campaign_id=Y → Diagnostic result
POST /api/bsos/replies/classify → Reply classified with 3-factor quality

Test 6 — BSOS Learning:
POST /api/bsos/cold-start → Initialize with industry priors
GET /api/bsos/bandit → Get arm recommendations
GET /api/bsos/optimization → Check phase status
GET /api/bsos/learnings → View accumulated learnings

Test 7 — Approval Flow:
POST /api/bsos/skills/execute (L2 skill) → Approval created → Telegram notification
GET /api/bsos/approvals → See pending approval
PATCH /api/bsos/approvals/[id] → Approve → Skill executes

Test 8 — Admin Flow:
Go to /admin-login → Sign in → Dashboard overview
/admin/users → See all users
/admin/health → All services with latency
/admin/cron-logs → Verify cron execution history

Test 9 — Inbox/Inboxing Flow:
/inbox → View messages → AI analysis → Reply
/inboxes → View domains → Check DNS → Upload new domain

Test 10 — Cron Jobs (wait-and-verify):
After 30 min → Check /admin/cron-logs for bsos-failure-check entry
After 2 hours → Check for bsos-full-sync entry
After 11PM UTC → Check for bsos-eod entry
```

### API Endpoint Quick Test (curl)

```bash
# Health check (no auth needed for basic check)
curl https://blitzscaleos.vercel.app/api/bsos/health

# After login, use session cookie or service role key for authenticated routes
# Example: Get signals
curl -H "Authorization: Bearer <token>" \
  "https://blitzscaleos.vercel.app/api/bsos/signals?company_id=<id>"

# Example: Classify a reply
curl -X POST -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"reply_text": "Sounds interesting, can we schedule a call next week?"}' \
  "https://blitzscaleos.vercel.app/api/bsos/replies/classify"
```

---

## 📋 CURRENT BLOCKERS

| Issue | Priority | Owner | Status |
|-------|----------|-------|--------|
| Supabase migration not applied (17 BSOS tables) | 🔴 Critical | David | Pending — must run `BSOS_production_migration.sql` |
| Vercel env vars incomplete | 🔴 Critical | David | Need Supabase URL/keys + CRON_SECRET + ADMIN_EMAILS |
| Admin user not created in Supabase Auth | 🔴 Critical | David | Create via Supabase dashboard |
| `env-bsos.ts` reads Telegram from env vars | 🟡 Medium | Dev | Should read from company record instead — needs refactor |
| ssh2 native module build warning | 🟢 Low | Fixed | `next.config.js` updated to externalize ssh2 |
| No password reset page | 🟢 Low | Dev | v1.1 — Supabase supports it, needs UI page |

---

## 🚀 DEPLOYMENT CHECKLIST

### Pre-Launch (DO THESE NOW)
- [ ] Apply `BSOS_production_migration.sql` in Supabase SQL Editor
- [ ] Add Vercel env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- [ ] Add Vercel env vars: `CRON_SECRET`, `ADMIN_EMAILS=david@superwave.io`
- [ ] Create admin user in Supabase Auth (david@superwave.io / Bsos@Admin2026!)
- [ ] Ensure `account_members` has row with admin user_id + role='owner'
- [ ] Redeploy Vercel (auto-triggers on env var change or manual redeploy)

### Post-Launch Verification
- [ ] Hit `/admin-login` — sign in with admin creds
- [ ] Hit `/api/bsos/health` — should return service status
- [ ] Check `/admin/cron-logs` after 30 min — first failure check should appear
- [ ] Sign up as test user → complete onboarding → verify dashboard loads
- [ ] Connect PlusVibe API key during onboarding → verify campaigns load
- [ ] Test chat with JulianAI → verify streaming responses

---

## 📁 FILE REFERENCE

### BSOS Lib Files (19 files at `src/lib/bsos/`)

| File | Purpose |
|------|---------|
| `types.ts` | 25+ interfaces: SignalType, BounceClassification, ReplyClassification, HCEScore, etc. |
| `env-bsos.ts` | BSOS config — scoring weights, bandit config, operational limits |
| `db.ts` | Shared Supabase admin client, `isAdminEmail()`, `verifyAdminAccess()` |
| `telegram.ts` | `sendTelegramMessage()`, `sendCriticalAlert()`, `sendEODSummary()`, `sendHealthAlert()` |
| `signal-pipeline.ts` | Proxy scoring, PlusVibe event normalization, bounce classification (7 types) |
| `health-monitor.ts` | Multi-service health checks with latency (Supabase, PlusVibe, Telegram, OpenClaw) |
| `plusvibe-sync.ts` | Full sync + quick failure check for 30-min cadence |
| `cron-runner.ts` | `verifyCronSecret()`, `runFailureCheck()`, `runFullSync()`, `runHealthCheckCron()` |
| `reply-classifier.ts` | Keyword-based classifier (no LLM), 9 types, `computeReplyQuality()` with 3-factor scoring |
| `campaign-diagnostician.ts` | Thresholds, pattern inferences LABELED as assumptions, recommendations as SUGGESTIONS only |
| `eod-reporter.ts` | Per-campaign summaries, cross-company aggregation, Telegram delivery |
| `write-validator.ts` | `validateWrite()`, `getSkillWriteScope()`, wildcard matching |
| `approval-manager.ts` | `submitForApproval()`, `resolveApproval()`, 24hr expiry |
| `skill-executor.ts` | Risk level check, L2+ → approval, trace logging, `dispatchSkill()` |
| `hce-scoring.ts` | Volume 20% + Engagement 35% + Health 25% + Quality 20% |
| `bandit-engine.ts` | Thompson Sampling, pessimistic priors, `updateArm()`, `applyDecay()` |
| `phase-manager.ts` | cold_start → discovery → signal_accumulation → optimization → scaling |
| `confidence-lifecycle.ts` | `recordLearning()`, Ebbinghaus decay (10%/30 days), auto-expire below 0.05 |
| `cold-start.ts` | Industry priors (LABELED as inferences), `initializeColdStart()`, graduation checks |

### Key Existing Lib Files

| File | Purpose |
|------|---------|
| `api-auth.ts` | `authenticateUser()`, `requireCompanyAccess()` |
| `company-credentials.ts` | Per-company credential resolution from DB (no env fallback) |
| `rate-limit.ts` | In-memory token bucket rate limiter |
| `openclaw-client.ts` | OpenClaw chat client (streaming SSE) |
| `supermemory-client.ts` | Supermemory v3 API client |
| `inboxing-client.ts` | Inboxing.com API client |
| `env.ts` | Centralized platform-level env var access |

---

**Legend:**
- ✅ Built & in codebase
- 🟡 Partially implemented / needs UI polish
- ⬜ Not started
- 🔴 Blocked / requires action

**Next Steps:** Apply migration → Set env vars → Create admin user → Test E2E scenarios above
