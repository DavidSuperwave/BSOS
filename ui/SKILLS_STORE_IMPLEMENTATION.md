# Skills Store Implementation (Company-Local)

This document describes how the Skills Store feature is implemented in this repo, how it works with main/sub-agents, and how runtime install/sync behaves in Docker-backed company containers.

## Why this exists

We implemented a company-local Skills Store that mirrors the Ironclaw skills management model and UX intent, adapted to Blitzscale's multi-tenant architecture and OpenClaw gateway topology.

## Scope implemented

- Company-local skill registry (per company, not global marketplace).
- Per-agent assignment (`main`, `campaigns`, `crm`, `inbox`).
- Skill status model with eligibility checks and install metadata.
- Runtime install executor for Docker-hosted company containers.
- Workspace file sync to OpenClaw agents for both modern and legacy skill file layouts.
- UI route for Skills Store with assignment/install/enable-disable/env-edit flows.
- Smoke script for end-to-end API validation.

---

## 1) Data model

Migration: `supabase/migrations/20260220_company_skills_store.sql`

### `company_skill_registry`
- Per-company skill catalog record.
- Stores:
  - `slug`, `name`, `description`, `version`
  - `skill_md` (full SKILL.md content)
  - `metadata` (JSON, usually parsed OpenClaw metadata)
  - `created_by`, timestamps
- Unique: `(company_id, slug)`

### `company_agent_skill_assignments`
- Assignment rows per skill + agent type.
- Stores:
  - `enabled`
  - install lifecycle fields (`install_status`, `install_message`, `stdout/stderr`, `warnings`, `installed_at`, `last_error`)
  - `installer_id`
- Unique: `(company_id, skill_slug, agent_type)`

### `company_agent_skill_env`
- Per-assignment secret/config override surface.
- Stores:
  - `api_key`
  - `env` JSON object
- Tied to assignment via `assignment_id`.

All tables include RLS service-role policies and `updated_at` triggers.

---

## 2) Backend API surface

### Base route
`src/app/api/companies/[id]/agent/skills/route.ts`

- `GET`  
  Returns full skills status report for a company (skills + agents + per-assignment status).
- `POST`  
  Upserts a company-local skill from `skillMd` (or `content`) with optional `slug`, `name`, `description`, `version`.
- `DELETE ?slug=...`  
  Deletes catalog skill and attempts unsync from all currently assigned agents first.

### Action routes

`src/app/api/companies/[id]/agent/skills/install/route.ts`
- Assigns skill to one/many agent types.
- Optionally runs installer from metadata (`installId` selector).
- Syncs SKILL content into target agent workspaces.
- Updates assignment install status fields.

`src/app/api/companies/[id]/agent/skills/update/route.ts`
- Updates assignment state:
  - `enabled` toggle
  - `apiKey` update
  - `env` patch
- If enabled, re-syncs skill file to target agents.
- If disabled, removes skill files from target agents.

`src/app/api/companies/[id]/agent/skills/uninstall/route.ts`
- Removes assignment(s) from selected agents.
- Removes skill files from selected agent workspaces.
- Deletes assignment rows for those agent types.

All routes use:
- `requireCompanyAccess` (tenant authorization)
- rate limiting via `createRateLimiter`

---

## 3) Core services and logic

### Types and helpers
- `src/lib/skills/types.ts`
- `src/lib/skills/common.ts`
- `src/lib/skills/frontmatter.ts`

Responsibilities:
- agent type constants/typing
- slug normalization and workspace path derivation
- lightweight SKILL frontmatter parse (including metadata JSON)

### Agent workspace sync
`src/lib/skills/skill-sync.ts`

For each target agent:
- Resolves agent IDs from `company_agents`.
- Backward-compat fallback for main agent via `companies.agent_config.agent_id`.
- Writes skill to both:
  - `skills/{slug}/SKILL.md` (preferred)
  - `SKILL_{SLUG}.md` (legacy compatibility)
- Remove path uses empty-content writes for both file forms.

### Status computation
`src/lib/skills/skill-status.ts`

Builds a report by joining:
- `company_skill_registry`
- `company_agent_skill_assignments`
- `company_agent_skill_env`
- company settings and agent records

Eligibility checks include:
- required bins
- anyBins group condition
- required env vars (including `api_key` for `primaryEnv`)
- required config paths from company `settings`
- OS gating

Also includes:
- `synced` (checks file existence on target agent workspace)
- normalized install options per platform

### Runtime installer
`src/lib/skills/skill-installer.ts`

Supported install kinds:
- `node` -> `npm install -g --ignore-scripts <package>`
- `download` -> `curl` to `/data/skills/downloads` (default), optional extract (`tar.gz`, `tar.bz2`, `zip`)

Execution model:
- Uses `sshExec` to run host-level `docker exec <container> sh -lc '<command>'`
- Returns structured result:
  - `ok`, `message`, `stdout`, `stderr`, `code`, optional `warnings`

---

## 4) Docker integration model

This repo provisions one OpenClaw container per company (`/api/companies/[id]/provision` flow).

### Relevant infra assumptions
- `companies.container_name` identifies target container.
- container has persistent `/data` volume (`openclaw-data:/data`).
- skill download installs default under `/data/skills/downloads`.

### Install execution path
1. User triggers install from UI.
2. API route resolves selected installer from SKILL metadata.
3. `skill-installer` builds safe shell command and validates basic constraints.
4. Host executes `docker exec` in company container over SSH.
5. Assignment row is updated with install result fields.

### Skill runtime availability path
Install does not directly load into prompt by itself.
Prompt/runtime availability is achieved by syncing SKILL files into target agent workspace files via OpenClaw RPC (`agents.files.set`), then starting a fresh turn/session as needed.

---

## 5) Main agent + sub-agent behavior

Agent types supported:
- `main`
- `campaigns`
- `crm`
- `inbox`

Assignment model:
- Skill can be installed/enabled independently per agent type.
- Status is reported per agent type.
- Sync/uninstall can target one or multiple agent types.

This mirrors embedded sub-agent architecture already used in the chat/session system.

---

## 6) UI implementation

### Route
- `src/app/skills/page.tsx`

### Main component
- `src/components/skills/skills-settings.tsx`

### UX behavior implemented
- Header with refresh and add-skill actions.
- Skill list filter chips:
  - `All`, `Ready`, `Needs Setup`, `Disabled`
- Per-skill card:
  - metadata display (emoji/version/status badges)
  - installer selection dropdown when options exist
  - delete action
- Per-agent panel:
  - assignment status
  - missing requirements display
  - actions: enable/disable, install, uninstall, API key, env
- Modal editor for API key / env updates.

### Nav integration
- Added `Skills Store` nav item in `src/components/app-shell.tsx`.

### Data hooks
- `src/lib/hooks.ts`:
  - `useSkillsStatus`
  - `upsertCompanySkill`
  - `deleteCompanySkill`
  - `installCompanySkill`
  - `updateCompanySkillSettings`
  - `uninstallCompanySkill`

---

## 7) Security and validation notes

Implemented:
- slug normalization before persistence/use
- basic install spec validation:
  - node package pattern check
  - download URL scheme check
- assignment API auth through company access checks

Current hardening gap (known):
- We do not yet run deep archive traversal/security scanning like Ironclaw's stricter install pipeline.
- Download extraction is currently command-based and should be hardened further for untrusted archives.

---

## 8) Testing and verification

### Smoke script
`scripts/skills-store-smoke.js`

Flow:
1. Create skill in registry
2. Install to `main` + `campaigns`
3. Read status and assert assignment/sync
4. Uninstall from one agent
5. Delete skill

Env required for live run:
- `SKILLS_SMOKE_BASE_URL` (optional, defaults to `http://localhost:3000`)
- `SKILLS_SMOKE_COMPANY_ID`
- `SKILLS_SMOKE_COOKIE`

### Notes from implementation session
- `npm run lint` is currently blocked by missing initial ESLint setup in this repo (interactive Next.js prompt).
- `next build --no-lint` exposed an unrelated pre-existing type error in dashboard metrics typing; not caused by Skills Store.

---

## 9) Operational runbook (quick)

1. Run DB migration.
2. Ensure company container is provisioned/running.
3. Open `/skills`.
4. Create or import SKILL.md content.
5. Install/assign to target agent types.
6. Start a new chat turn/session for clean pickup.
7. Use status view to confirm:
   - install state
   - missing requirements
   - workspace sync state

---

## 10) Relationship to Ironclaw

This implementation follows the same broad model used in Ironclaw/OpenClaw skills workflows (SKILL.md metadata, install options, eligibility/status surfaces, and per-agent skill management), adapted to Blitzscale's company-scoped container architecture and Supabase-backed tenancy model.

---

## 11) Skill Action Event contract (dashboard reminders)

Skill-related reminders now publish to the existing `events` table with canonical fields:

- `event_type`: `action_item` (or `alert` for high-severity external cases)
- `priority`: `low` | `medium` | `high` | `urgent`
- `actions`: JSON array containing:
  - one `skill_issue` payload (structured issue/report metadata)
  - one or more `navigate` CTAs (deep-links to resolve)

`skill_issue` payload shape:

```json
{
  "type": "skill_issue",
  "issueKey": "missing_requirements:deliverability-skill:campaigns",
  "issueCode": "missing_requirements",
  "skillSlug": "deliverability-skill",
  "skillName": "Deliverability Monitor",
  "agentType": "campaigns",
  "summary": "Skill setup is incomplete for campaigns agent.",
  "details": "Missing env: INBOXING_API_KEY | bins: curl",
  "severity": "medium"
}
```

`navigate` payload shape:

```json
{
  "type": "navigate",
  "label": "Open Skill Report",
  "href": "/skills?skill=deliverability-skill&agent=campaigns"
}
```

Notes:
- The dashboard Action Items card opens a modal for `skill_issue` events and uses `navigate` actions as CTA buttons.
- This same contract can be published by future detectors (deliverability drift, inbox meeting-intent alerts, campaign health monitors) via `POST /api/tools/data/events`.
