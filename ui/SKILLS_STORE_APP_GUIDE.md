# Skills Store Application Guide

This document explains how the Skills Store works in this application, how agents use it, and how teams should operate it across companies.

## 1) Purpose

The Skills Store enables:

- Company-local skill creation and management
- Assignment to agent types (`main`, `campaigns`, `crm`, `inbox`)
- Agent-driven skill operations (create, learn, install, share, import)
- Reusable skill portability across companies (share links/import)
- Default baseline skill pack installation for new/onboarded companies

The design and workflow mirror Ironclaw/OpenClaw skill patterns while preserving Blitzscale multi-tenant boundaries.

Reference inspiration: [DenchHQ/ironclaw](https://github.com/DenchHQ/ironclaw)

## 2) Core Architecture

High-level flow:

1. Skills are stored per company in `company_skill_registry`
2. Agent assignments are tracked in `company_agent_skill_assignments`
3. Agent-specific secrets/env are tracked in `company_agent_skill_env`
4. Skill content is synced into agent workspaces via OpenClaw RPC (`agents.files.set`)
5. Optional install routines run in the company container
6. Skills can be shared/imported via tokenized links

Primary implementation files:

- Skills UI:
  - `src/app/skills/page.tsx`
  - `src/components/skills/skills-settings.tsx`
  - `src/components/skills/learn-skill-modal.tsx`
  - `src/app/skills/[slug]/page.tsx`
- Skills API:
  - `src/app/api/companies/[id]/agent/skills/route.ts`
  - `src/app/api/companies/[id]/agent/skills/install/route.ts`
  - `src/app/api/companies/[id]/agent/skills/update/route.ts`
  - `src/app/api/companies/[id]/agent/skills/uninstall/route.ts`
  - `src/app/api/companies/[id]/agent/skills/learn/route.ts`
  - `src/app/api/companies/[id]/agent/skills/import/route.ts`
  - `src/app/api/companies/[id]/agent/skills/share/route.ts`
  - `src/app/api/companies/[id]/agent/skills/catalog/route.ts`
  - `src/app/api/skills/share/[token]/route.ts`
- Skills services:
  - `src/lib/skills/skill-status.ts`
  - `src/lib/skills/skill-sync.ts`
  - `src/lib/skills/skill-installer.ts`
  - `src/lib/skills/skill-validator.ts`
  - `src/lib/skills/skill-learner.ts`
  - `src/lib/skills/skill-sharing.ts`
  - `src/lib/skills/skill-catalog.ts`
- Agent tool access:
  - `src/app/api/tools/data/skills/route.ts`
  - `src/lib/agent-auth.ts`

## 3) Data Model

Existing base migration:

- `supabase/migrations/20260220_company_skills_store.sql`
  - `company_skill_registry`
  - `company_agent_skill_assignments`
  - `company_agent_skill_env`

Learning/portability extension:

- `supabase/migrations/20260223_skill_learning_and_sharing.sql`
  - `company_skill_learning_sessions` (learn progress/status)
  - `company_skill_blueprints` (reusable/default templates)
  - `skill_share_links` (tokenized share/import links)
  - `company_skill_imports` (import provenance/audit)

## 4) UI Workflow

### A. Skills page (`/skills`)

The page includes:

- **Skills to learn**: catalog-style skills that can be imported
- **Your skills**: company-installed skills with per-agent controls
- **Learn New Skill** modal:
  - Tabs: `Research`, `From URL`, `Paste Docs`
  - Modes: `Quick Learn`, `Interactive`
  - Progress log for research/draft/validation state
- Import/export controls:
  - Import by share token/link
  - Revoke share links

### B. Skill detail page (`/skills/[slug]`)

Includes:

- Overview + usage cards
- Documentation (`SKILL.md`) view/edit
- `Try This Skill` action (jumps into chat context)
- Share action
- Recent thread context

## 5) Skill Learning Modes

Implemented in `POST /api/companies/[id]/agent/skills/learn`.

### Quick Learn

- Generates/validates skill content
- Saves directly into company skill registry
- Returns saved skill payload

### Interactive

- Generates draft skill
- Returns draft content for human review/edit
- User saves manually via upsert

Source types supported:

- `research`
- `url`
- `paste_docs`

Progress + outcome are persisted in `company_skill_learning_sessions`.

## 6) Agent-Driven Usage Across App

Agent route:

- `POST /api/tools/data/skills` (authenticated via `X-Agent-Token`)

Supported operations:

- `create_skill`
- `learn_skill`
- `install_skill`
- `update_skill_env`
- `share_skill`
- `import_skill`

This lets agents create and activate skills directly from app conversations and automations.

## 7) Default Skill Pack Seeding

A baseline skill pack is auto-applied and synced idempotently through:

- Company creation:
  - `src/app/api/companies/route.ts`
- Agent deploy:
  - `src/app/api/companies/[id]/deploy-agent/route.ts`
- Agent provisioning:
  - `src/app/api/companies/[id]/agents/provision/route.ts`

Default source is loaded from:

- `openclaw/skills/gtm-engine/SKILL.md`

## 8) Portability (Share/Import)

### Share

- `POST /api/companies/[id]/agent/skills/share`
- Produces a tokenized link (with optional expiry/import limits)

### Resolve/Download

- `GET /api/skills/share/[token]`
- Supports viewing metadata and download package mode

### Import

- `POST /api/companies/[id]/agent/skills/import`
- Supports:
  - `share_link`
  - `blueprint`
  - `company_copy`

Every import writes provenance to `company_skill_imports` and metadata import fields.

## 9) Security and Tenancy

- User APIs enforce company access through `requireCompanyAccess`
- Agent APIs enforce company scope through `validateAgentRequest`
- Skill installs/assignments are always scoped by `company_id`
- URL learn flow validates safe public HTTP(S) URLs
- Install metadata is validated before runtime execution
- Share links can expire and be revoked

## 10) Operational Runbook

1. Select company
2. Open `/skills`
3. Create skill:
   - Learn modal (`Research`/`From URL`/`Paste Docs`)
   - or manual SKILL editor
4. Assign/install to agent types
5. Verify status:
   - eligibility
   - sync state
   - install status/warnings
6. Use `Try This Skill` from detail page to validate in chat
7. Share/import as needed across companies

## 11) Troubleshooting

- Skill not available in agent:
  - confirm assignment is enabled
  - check `synced` state in skills status
  - start a fresh chat turn/session
- Install failed:
  - check assignment install message/stderr
  - verify required bins/env/config
  - verify container is running
- Import failure:
  - verify link not expired/revoked
  - check import limit
  - check target slug collision rules

## 12) Verification Coverage

Smoke script:

- `scripts/skills-store-smoke.js`

Coverage includes:

- create + install + status + uninstall + delete
- learn flow (paste docs)
- share-link generation/resolution
- optional cross-company import (when target env vars are set)
- default pack presence check

