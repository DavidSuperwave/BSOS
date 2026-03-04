# BSOS v3 Build Manifest

**Generated**: 2026-03-04  
**Build Status**: COMPLETE — Ready for Testing  
**Commit Base**: 51c607eb (DavidSuperwave/BSOS)

---

## Build Summary

| Component | Count | Status |
|---|---|---|
| Agent Skills (SKILL.md) | 15 | ✓ All verified |
| TypeScript Build Modules | 7 | ✓ All verified |
| SQL Migration | 1 (16 tables) | ✓ Cross-checked |
| Category Alignment | 15/15 | ✓ All matched |
| Table Reference Alignment | 16/16 | ✓ All resolved |
| RLS Policies | 16 | ✓ All applied |

---

## 1. Agent Skills (15 Core, Non-Removable)

All skills follow the Agent Skills open standard (agentskills.io/specification).  
Each has YAML frontmatter with `core: true` and `removable: false`.

### Onboarding Phase (6 skills)
| Skill | Risk Level | Description |
|---|---|---|
| `copy-analyzer` | L1 (read-only) | Campaign copy quality diagnostics |
| `reply-miner` | L1 (read-only) | Reply sentiment/objection classification |
| `lead-profiler` | L1 (read-only) | ICP-fit scoring for lead records |
| `bounce-diagnostician` | L1 (read-only) | SMTP bounce root-cause analysis |
| `deal-miner` | L1 (read-only) | Win/loss signal extraction from CRM |
| `deliverability-assessor` | L1 (read-only) | Mailbox/domain setup audit |

### Daily Operations (6 skills)
| Skill | Risk Level | Description |
|---|---|---|
| `campaign-monitor` | L1 (read-only) | Hourly campaign anomaly detection |
| `deliverability-watchdog` | L1 (read-only) | Ongoing inbox/sender health checks |
| `pipeline-tracker` | L1 (read-only) | CRM stage movement summaries |
| `icp-validator` | L1 (read-only) | Weekly ICP assumption validation |
| `intelligence-reporter` | L1 (read-only) | End-of-day GTM intelligence brief |
| `profile-enricher` | L1 (read-only) | Continuous company profile updates |

### Campaign Lifecycle (3 skills) — Triple Confirmation Required
| Skill | Risk Level | Description |
|---|---|---|
| `campaign-researcher` | L2 (strategic) | Market research + campaign angle prep |
| `campaign-builder` | L3 (writes) | Multi-step campaign draft assembly |
| `campaign-launcher` | L3 (writes) | Pre-flight checks + launch execution |

**Lifecycle Guard Rails**:  
- Research → Build → Launch requires 3 separate operator approvals  
- L3 skills route through approval-manager.ts before any external writes  
- Agent suggests; operator decides (no autonomous day-to-day actions)

---

## 2. TypeScript Build Modules (7 files)

### Chess Engine
| File | Lines | Purpose |
|---|---|---|
| `evaluator.ts` | 313 | HCE Layer 1 — campaign + company health scoring |
| `bandit-engine.ts` | 341 | Layer 2 — Thompson Sampling for A/B optimization |
| `learning-system.ts` | 412 | Feedback loop — learning entries, outcome tracking, decay |

### Infrastructure
| File | Lines | Purpose |
|---|---|---|
| `skill-catalog-v2.ts` | 256 | 15-skill catalog, blueprint management, company provisioning |
| `supermemory-containers.ts` | 192 | Tenant-isolated memory namespaces (9 domains) |
| `cron-runner.ts` | 215 | Scheduled skill execution with cadence guards |
| `preliminary-report.ts` | 220 | Day 1 diagnostic report generator |

---

## 3. Supabase Migration (`supabase-migration-v3.sql` — 509 lines)

### New Tables (16)
| # | Table | Purpose | Skill Source |
|---|---|---|---|
| 1 | `campaign_copy_analysis` | Copy quality metrics | copy-analyzer |
| 2 | `reply_classifications` | Reply categorization | reply-miner |
| 3 | `lead_profiles` | ICP-fit profiles | lead-profiler |
| 4 | `bounce_analysis` | Bounce root causes | bounce-diagnostician |
| 5 | `deal_patterns` | Win/loss signals | deal-miner |
| 6 | `deliverability_snapshots` | Domain/mailbox health | deliverability-assessor/watchdog |
| 7 | `campaign_events` | Campaign anomalies | campaign-monitor/pipeline-tracker |
| 8 | `campaign_daily_metrics` | Daily performance metrics | evaluator (tempo calc) |
| 9 | `feature_snapshots` | Periodic campaign state | campaign-monitor |
| 10 | `intelligence_reports` | Daily GTM briefs | intelligence-reporter |
| 11 | `company_profiles` | Enriched company data | profile-enricher |
| 12 | `learning_entries` | Feedback loop learnings | learning-system |
| 13 | `bandit_states` | Thompson Sampling state | bandit-engine |
| 14 | `campaign_optimization_states` | Per-campaign optimization mode | learning-system |
| 15 | `action_outcome_pairs` | Predicted vs actual tracking | learning-system |
| 16 | `agent_trace_logs` | Full execution observability | all modules |

### ALTER TABLE: companies
```sql
ADD COLUMN close_api_key text
ADD COLUMN calendly_api_key text
ADD COLUMN calendly_user_uri text
ADD COLUMN telegram_chat_id text
ADD COLUMN perplexity_api_key text
ADD COLUMN supermemory_api_key text
ADD COLUMN onboarding_status text DEFAULT 'pending'
ADD COLUMN onboarding_completed_at timestamptz
```

### Security
- All 16 tables have RLS enabled  
- SELECT policies scoped via `chat_sessions.user_id = auth.uid()`  
- Service role bypasses RLS (for agent writes)  
- Per-company API keys stored in `companies` table (NOT env vars)  
- Only platform keys in Vercel env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `ADMIN_EMAILS`

---

## 4. Verification Results

### Cross-Reference Check (all passed)
- ✓ All TS table references resolve to either migration tables or known existing tables  
- ✓ All 15 SKILL.md slugs match catalog slugs exactly  
- ✓ All 15 SKILL.md categories match catalog categories  
- ✓ All SKILL.md frontmatter has `core: true`, `removable: false`  
- ✓ Migration is idempotent (CREATE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS)  
- ✓ Wrapped in BEGIN/COMMIT transaction  

### Issues Found & Fixed
1. `campaign-launcher` SKILL.md category was "daily" → fixed to "lifecycle"  
2. `bounce-diagnostician` SKILL.md category was "daily" → fixed to "onboarding"  
3. `reply-miner` SKILL.md category was "daily" → fixed to "onboarding"  
4. `icp-validator` SKILL.md category was "lifecycle" → fixed to "daily"  
5. `profile-enricher` SKILL.md category was "lifecycle" → fixed to "daily"  
6. `campaign_daily_metrics` table was missing from migration → added with indexes + RLS  

---

## 5. Testing Plan

### Phase 1: Individual Skill Testing (unit-level)
For each skill, validate:
- Frontmatter parses correctly via existing `frontmatter.ts`
- `skill-router.ts` scoring selects correct skill for matching intents
- Data contract input/output matches Supabase schema
- Error handling returns graceful fallback (not crashes)

### Phase 2: Integration Testing
- Run migration against Supabase (staging or SQL editor)
- Call `ensureDefaultBlueprints()` and verify 15 rows in `company_skill_blueprints`
- Call `applyDefaultSkillPackToCompany(testCompanyId)` and verify sync
- Execute evaluator against test company data
- Run cron-runner for each job type in test mode

### Phase 3: End-to-End with Cloud Agents
- Spin up agent container on DigitalOcean
- Run onboarding sweep for a test company
- Verify Day 1 preliminary report generates
- Run daily cycle (signal_ingest → deliverability_check → daily_closeout)
- Verify intelligence report persists + Telegram push
- Test campaign lifecycle: researcher → builder → launcher with approval gates

---

## 6. Deployment Sequence

1. **Run migration** in Supabase SQL Editor (single transaction)
2. **Deploy skill-catalog-v2.ts** — replaces old 5-stub catalog  
3. **Deploy remaining TS modules** to Vercel  
4. **Copy SKILL.md files** to `openclaw/skills/{slug}/SKILL.md` in repo  
5. **Call `ensureDefaultBlueprints()`** once after deploy  
6. **Verify cron jobs** pick up new skill mappings  
7. **Run Phase 3 end-to-end test** with cloud agents  

---

## Files Inventory

```
bsos_skills/
├── bounce-diagnostician/SKILL.md    (109 lines)
├── campaign-builder/SKILL.md        (120 lines)
├── campaign-launcher/SKILL.md       (123 lines)
├── campaign-monitor/SKILL.md        (119 lines)
├── campaign-researcher/SKILL.md     (122 lines)
├── copy-analyzer/SKILL.md           (133 lines)
├── deal-miner/SKILL.md              (115 lines)
├── deliverability-assessor/SKILL.md (120 lines)
├── deliverability-watchdog/SKILL.md (113 lines)
├── icp-validator/SKILL.md           (124 lines)
├── intelligence-reporter/SKILL.md   (117 lines)
├── lead-profiler/SKILL.md           (117 lines)
├── pipeline-tracker/SKILL.md        (123 lines)
├── profile-enricher/SKILL.md        (119 lines)
└── reply-miner/SKILL.md             (117 lines)

bsos_build/
├── evaluator.ts                     (313 lines)
├── bandit-engine.ts                 (341 lines)
├── learning-system.ts               (412 lines)
├── skill-catalog-v2.ts              (256 lines)
├── supermemory-containers.ts        (192 lines)
├── cron-runner.ts                   (215 lines)
├── preliminary-report.ts            (220 lines)
└── supabase-migration-v3.sql        (509 lines)
```

**Total**: 23 files, ~3,600 lines of new code + configuration
