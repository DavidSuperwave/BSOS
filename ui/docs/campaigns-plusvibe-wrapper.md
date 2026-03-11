# Campaigns PlusVibe Wrapper

This document describes the current PlusVibe v3 wrapper behavior used by the campaigns UI.

## Source Of Truth

- Base URL: `https://api.plusvibe.ai/api/v1`
- Auth: `x-api-key`
- Workspace scoping: `workspace_id` is injected by `plusvibeFetch` in `ui/src/lib/plusvibe-client.ts`

## Wrapper Files

- `ui/src/lib/plusvibe-client.ts`
  - Shared request wrapper for auth, workspace scoping, timeout, and normalized errors.
- `ui/src/app/api/plusvibe/campaigns/route.ts`
  - Campaign list + create.
- `ui/src/app/api/plusvibe/campaigns/[id]/route.ts`
  - Campaign update, activate/pause, delete/archive.
- `ui/src/app/api/plusvibe/campaigns/[id]/leads/route.ts`
  - Leads list (filters/pagination) + add leads.
- `ui/src/app/api/plusvibe/campaigns/[id]/analytics/route.ts`
  - Campaign aggregate analytics.

## Endpoint Mapping

- `GET /api/plusvibe/campaigns`
  - Upstream: `GET /campaign/list-all`
  - Enrichment: merges stats from `GET /analytics/campaign/stats`
  - Normalizes campaign `status` into `active | paused | draft | complete`.
- `POST /api/plusvibe/campaigns`
  - Upstream: `POST /campaign/add/campaign`
  - Requires campaign name (`camp_name`).
- `PATCH /api/plusvibe/campaigns/[id]`
  - If status maps to active: `POST /campaign/launch`
  - If status maps to paused: `POST /campaign/pause`
  - Otherwise: `PATCH /campaign/update/campaign`
- `DELETE /api/plusvibe/campaigns/[id]`
  - Upstream: `DELETE /campaign/delete`
  - Supports both archive and hard-delete semantics via:
    - `is_archive`: `"yes"` or `"no"`
    - `is_save_lead_data`: `"yes"` or `"no"`
- `GET /api/plusvibe/campaigns/[id]/leads`
  - Upstream: `GET /lead/workspace-leads`
  - Supports pass-through filters/pagination (`page`, `limit`, `status`, `tag`, `search`, `step`, `sort`, `direction`)
  - Returns normalized shape: `{ leads, total, page, limit }`
- `POST /api/plusvibe/campaigns/[id]/leads`
  - Upstream: `POST /lead/add`
  - Supports single-lead body or `leads[]` batch payload.
- `GET /api/plusvibe/campaigns/[id]/analytics`
  - Upstream: `GET /analytics/campaign/stats`
  - Returns aggregate totals + step data if available.

## UI Contracts

- `Campaigns.tsx`
  - Toggle sends `ACTIVE`/`PAUSED` to wrapper.
  - List consumes normalized campaign statuses and merged stats.
- `campaign-wizard.tsx`
  - Leads tab uses server-side filtering + pagination through `useCampaignLeads(...)`.

## Error Contract

All wrapper routes return:

- `code: "MISSING_KEY"` when credentials are not configured.
- `code: "PLUSVIBE_ERROR"` for upstream API failures.
- `error` with concise diagnostics.

## Known Constraints

- PlusVibe webhook payload fields are not perfectly consistent between accounts/events; wrapper code is defensive and field-tolerant.
- Campaign stats endpoint is treated as best-effort during list aggregation. Campaign rows still render if stats fetch fails.
- Lead normalization maps multiple possible PlusVibe field names into one UI shape.

## Extension Checklist

When adding new campaign workflows:

1. Add endpoint mapping in this document first.
2. Prefer extending `plusvibeFetch` options before adding ad-hoc fetch logic.
3. Keep `workspace_id` injection centralized (do not duplicate credential logic in route handlers).
4. Normalize upstream response fields before returning to UI components.
5. Preserve route-level error contract (`MISSING_KEY`, `PLUSVIBE_ERROR`).
6. If behavior changes, update this document and the consuming hook/component in the same PR.
