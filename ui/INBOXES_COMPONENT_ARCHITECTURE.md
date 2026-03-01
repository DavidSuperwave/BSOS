# Inboxes Component Architecture

## Purpose

This document explains what is built for the `/inboxes` experience, how it is structured, how data flows through the system, and how it fits into the wider GTM Engine UI application.

The implemented scope focuses on recreating Inboxing-style **Domains** and **Platform Upload** workflows (plus platform connections management) inside the existing app shell and multi-tenant model.

Design target reference: [v2.inboxing.com/domains](https://v2.inboxing.com/domains).

---

## What Was Built

### Route-level surface

- Main page: `src/app/inboxes/page.tsx`
- Subsections rendered as tabs:
  - Domains
  - Platform Upload
  - Platform Connections

### New component module

All new UI modules live under `src/components/inboxing/`:

- `domains-panel.tsx`
- `domain-actions-menu.tsx`
- `add-domain-modal.tsx`
- `upload-modal.tsx`
- `platform-upload-panel.tsx`
- `platform-connections-panel.tsx`
- `types.ts`

### Backend routes added/extended for wiring

Under `src/app/api/inboxing/`:

- Domains:
  - `domains/route.ts`
  - `domains/[id]/route.ts`
  - `domains/[id]/status/route.ts`
  - `domains/[id]/csv/route.ts`
  - `domains/[id]/nameservers/route.ts`
  - `domains/check/route.ts`
  - `domains/generate/route.ts`
- Upload:
  - `upload/route.ts`
  - `upload/status/route.ts`
  - `upload/[id]/route.ts`
  - `upload/[id]/retry/route.ts`
  - `upload/clear/route.ts`
- Connections:
  - `platforms/route.ts`
  - `platforms/[id]/route.ts`
  - `registrars/route.ts`
  - `registrars/[id]/route.ts`
- Health:
  - `health/route.ts`

### Data hooks added/extended

In `src/lib/hooks.ts`:

- `useInboxingDomainsQuery(...)`
- `useInboxingUploadJobs(...)`
- Extended `InboxingDomain` typing to include fields used by the new UI/flow.

---

## How It Fits Into The App

## Application-level composition

`/inboxes` is a client route mounted inside the standard `AppShell`, so it inherits:

- Global navigation/sidebar/header layout
- Auth and company context from root provider tree
- Existing visual tokens and shared UI primitives (`button`, `input`, `dialog`, `tabs`, `badge`, `stats-card`)

At runtime, `src/app/inboxes/page.tsx` pulls `selectedCompany` from `useCompany()` and uses that `companyId` as the required tenant key for all inboxing queries and actions.

## Multi-tenant boundary

Every data request from this page is company-scoped:

- Client side always sends `companyId`/`company_id`
- API routes call `requireCompanyAccess(companyId)` to enforce:
  - user is authenticated
  - user belongs to the target company
  - cross-company access is denied

If no company is selected, the page renders a non-destructive prompt instead of attempting data operations.

---

## UI Architecture And Layout

## Top-level page layout (`/inboxes`)

`src/app/inboxes/page.tsx` renders:

1. Header actions in `AppShell`
2. KPI stat cards (`StatsGrid`):
   - total domains
   - healthy domains
   - at risk domains
   - failed upload jobs
3. Internal section tabs:
   - Domains
   - Platform Upload
   - Platform Connections
4. Active panel content

The page holds only orchestration concerns:

- Current tab state
- Data loading hooks
- A shared `onChanged()` callback that revalidates all relevant SWR sources

## Domains panel

`src/components/inboxing/domains-panel.tsx` contains:

- Toolbar:
  - `Export` button (presentational currently)
  - `Add Domain` opens quick/bulk modal
- Filter row:
  - search input
  - status filter select
  - reset button for status
  - sort button label ("Newest First", presentational currently)
- Table columns:
  - selection checkbox (currently not wired to bulk actions)
  - domain
  - status badge
  - progress bar
  - tags summary
  - created date
  - actions
- Footer:
  - page summary text
  - previous/next pagination controls (currently disabled placeholders)

### Domain row actions

Row-level action controls include:

- Copy domain
- Upload modal shortcut
- Dropdown menu (`domain-actions-menu.tsx`) with:
  - Download CSV
  - Upload to Platform
  - View Nameservers
  - Edit Tags
  - Update Redirect
  - Change Names & Emails
  - Copy Domain
  - Delete Domain

Important: a subset of actions uses browser prompts/alerts for now (tags, redirect, sender names, nameservers display) instead of dedicated forms.

## Add Domain modal

`src/components/inboxing/add-domain-modal.tsx` supports two modes:

- **Quick Setup**
  - domain input (single or multiple entries, comma/newline split)
  - account count selector (25/49/99)
  - sender name list builder
  - redirect URL/type
  - tags
  - optional auto-upload platform connection
- **Bulk Setup**
  - downloadable CSV template
  - CSV import into editable rows
  - row-level inline editor for domain setup fields
  - add/remove rows

Submission strategy:

- Quick mode submits one request with all domains
- Bulk mode iterates rows and sends one request per non-empty row

## Upload modal

`src/components/inboxing/upload-modal.tsx` supports:

- **By Domain**: multiselect domain list with search
- **By Email**: paste emails (line or comma separated), server maps domains from email suffix
- shared options:
  - platform connection
  - warmup toggle
  - sync tags toggle
  - skip verified toggle

This modal is reused in:

- Domains panel (upload selected row domain)
- Platform Upload panel (open general upload flow)

## Platform Upload panel

`src/components/inboxing/platform-upload-panel.tsx` renders:

- Summary line (total/completed/failed)
- Controls:
  - Add Platform
  - Upload Domain (opens modal)
  - search
  - status filter
  - platform filter
  - refresh
  - clear history
- Jobs table:
  - domain
  - platform
  - status/stage
  - retries
  - action buttons (retry/delete)

## Platform Connections panel

`src/components/inboxing/platform-connections-panel.tsx` provides:

- Existing connection cards with delete action
- Add Connection dialog with fields for:
  - platform type
  - connection name
  - login email
  - password
  - API key
  - workspace ID

---

## Data Layer And Runtime Flow

## Hooks used by `/inboxes`

From `src/lib/hooks.ts`:

- `useInboxingDomainsQuery(companyId, options?)`
  - fetches `/api/inboxing/domains`
- `useInboxingHealth(companyId)`
  - fetches `/api/inboxing/health`
- `usePlatformConnections(companyId)`
  - fetches `/api/inboxing/platforms`
- `useInboxingUploadJobs(companyId, options?)`
  - fetches `/api/inboxing/upload/status`

The page-level `onChanged()` calls all relevant SWR `mutate()` functions to synchronize UI after mutations.

## Local state boundaries

- `page.tsx`: active tab + shared refresh orchestration
- panel components: filtering/sorting/display state
- modal components: form state, mode state, submit loading state

---

## API Contract Behavior (As Implemented)

## Domain management

### `GET /api/inboxing/domains`

- Requires `companyId`
- Verifies access with `requireCompanyAccess`
- Returns company-scoped domain list + pagination object

### `POST /api/inboxing/domains`

- Requires `company_id`, `domains[]`, `names[]`
- Verifies tenant access
- Optional validation that `platform_connection_id` belongs to the same company
- For each domain:
  - attempts remote domain create via `inboxing-client.createDomain(...)`
  - stores mirror row in `inboxing_domains`
  - creates `domain_create` tracking job in `inboxing_jobs`

### `PATCH /api/inboxing/domains/[id]`

- Loads domain by id, verifies ownership from row `company_id`
- Updates tags/redirect fields directly on `inboxing_domains`
- If sender names are provided, writes a pending `inbox_provision` job (does not directly reprovision in this route)

### `DELETE /api/inboxing/domains/[id]`

- Loads domain and verifies ownership
- Attempts remote delete if `inboxing_id` exists
- Creates `domain_delete` job
- Deletes local domain row

### `GET /api/inboxing/domains/[id]/status`

- Verifies ownership
- Optionally syncs remote status from Inboxing API
- Writes back status/mailbox_count/nameservers/csv availability if changed
- Returns recent jobs for this domain

### `GET /api/inboxing/domains/[id]/csv`

- Verifies ownership
- Requires local status `active`
- Enforces warmup window via `csv_available_at`
- Streams CSV response from Inboxing API endpoint

### `GET /api/inboxing/domains/[id]/nameservers`

- Verifies ownership
- Returns local nameservers and attempts remote refresh if `inboxing_id` is present

## Upload management

### `POST /api/inboxing/upload`

- Verifies company access
- Verifies selected platform connection belongs to same company
- Accepts:
  - single `domain_id`, or
  - `domain_ids[]`, or
  - `emails[]` (maps domains from email suffix)
- Filters to company-owned, active, linked (`inboxing_id`) domains
- Performs upload call per valid domain
- Creates one `upload` job row per domain in `inboxing_jobs`

### `GET /api/inboxing/upload/status`

- Verifies company access
- Reads upload jobs from local `inboxing_jobs` (not direct passthrough)
- Joins domain and platform metadata
- Supports filtering by status/domain/email/platform connection
- Returns `jobs[]` plus summary counts

### `POST /api/inboxing/upload/[id]/retry`

- Verifies job ownership
- Revalidates domain upload readiness
- Replays upload with original payload options
- Increments retry counter and updates status/error/result fields

### `DELETE /api/inboxing/upload/[id]`

- Verifies job ownership
- Deletes single upload job row

### `POST /api/inboxing/upload/clear`

- Verifies company access
- Deletes all upload-type jobs for that company

## Platform/registrar connection routes

- `platforms` and `registrars` routes are company-scoped and access-checked
- Add/delete operations are wired from the new UI

---

## Supabase Integration (Current Data Model)

This implementation uses existing tables:

- `inboxing_domains`
- `inboxing_jobs`
- `platform_connections`
- `registrar_credentials`

Key point: this is an integration over the current schema, not yet the full greenfield schema (`company_inboxing_settings`, `company_inboxing_credentials`, etc.).

---

## Security Model

## Route-level controls

Most inboxing routes now enforce:

1. Required company identifier in request
2. `requireCompanyAccess(companyId)` before read/write
3. Resource ownership validation when resource id is used

This ensures one company cannot read or mutate another company’s domain/job/connection rows through these handlers.

## Secret handling

- Inboxing API calls are performed server-side in API routes.
- API key is read from server environment via `src/lib/inboxing-client.ts`.
- Client never receives the master Inboxing key.

---

## Known Gaps / Current Limitations

The following are important implementation realities:

1. `Export`, sort, and pagination controls in Domains panel are currently presentational placeholders.
2. Row selection checkboxes are not yet connected to bulk actions.
3. Domain action forms use browser prompts/alerts for speed; not yet full modal forms.
4. Platform credentials are currently stored directly in `platform_connections` fields (no dedicated encrypted credential vault model yet).
5. Slot quota APIs/logic are not implemented in this phase.
6. Full spec tables (`company_inboxing_*`, `inboxing_audit_log`) are not introduced yet.
7. Bulk CSV parser in `add-domain-modal` is a simple comma splitter, not a robust CSV parser with escaped commas.

---

## How To Extend Safely

Recommended next increments:

1. Add slot quota subsystem:
   - tables + `GET /slots` + `POST /slots/check`
   - enforce pre-create in `POST /api/inboxing/domains`
2. Migrate credentials to encrypted per-company store.
3. Replace prompt-based row actions with typed edit dialogs.
4. Implement real table sort/pagination/bulk action backend + frontend state.
5. Add upload polling UX and richer job stage visualizations.
6. Add audit logging for all mutating actions.

---

## End-to-End Interaction Summary

At a high level:

- User selects company in the app shell
- `/inboxes` loads domains/health/uploads/connections via SWR hooks scoped by company
- Mutations call local API routes
- API routes validate tenant access, perform Supabase writes, and proxy to Inboxing API where needed
- UI revalidates data through shared `onChanged()` to keep sections synchronized

This architecture keeps inboxing operations embedded in GTM Engine’s multi-tenant model while preserving server-side control over external service access.
