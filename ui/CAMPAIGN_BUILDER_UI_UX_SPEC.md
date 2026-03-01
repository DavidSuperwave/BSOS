# Campaign Builder UI/UX Spec

This document describes the PlusVibe-style campaign builder now implemented in the UI wrapper so Product/Engineering can align on behavior and payload contracts.

## Scope

- Builder surface: `Leads`, `Sequences`, `Schedule`, `Settings`, `Subsequences`.
- Goal: visual and interaction parity with PlusVibe campaign editing flow, with demo-populated data for review.
- Primary implementation file: `src/components/campaigns/campaign-wizard.tsx`.

## Entry and Navigation

- Entry point: click `Edit Campaign` from `src/components/Campaigns.tsx`.
- Header:
  - Back action returns to campaigns list.
  - Campaign title + status badge.
- Top summary cards:
  - Total leads, emails sent, reply rate, positive rate.
- Tab navigation:
  - Leads
  - Sequences
  - Schedule
  - Settings
  - Subsequences

## Leads Tab

- Toolbar:
  - Status filter dropdown
  - Tag filter dropdown
  - Search input
  - Import / Add buttons
- Data table (populated demo rows):
  - Lead, Email, Company, Status, Tag, Step, Last Activity
- Footer count:
  - Displays current filtered count against total.

## Sequences Tab

- Header controls:
  - `Analytics, Steps & Variations` (parity placeholder action)
  - `Add Step`
- Sequence step cards (populated demo data):
  - Step title
  - Subject input
  - Body textarea
  - Wait days input (follow-up steps)
  - Metrics tiles (Open, Reply, Positive)
- Save action:
  - Persists sequence data via campaign PATCH route.

## Schedule Tab

- Controls:
  - Timezone
  - Start/end send time
  - Sending days chips (Mon-Sun toggle)
  - Daily sending limit
  - Minimum delay between sends
- Save action:
  - Persists schedule fields via campaign PATCH route.

## Settings Tab

- Controls:
  - Campaign name
  - Sender pool selection
  - Tracking toggles (opens/clicks)
  - Stop-on-reply toggle
  - Unsubscribe footer toggle
- Save action:
  - Persists settings fields via campaign PATCH route.

## Subsequences Tab

- List of populated subsequences with status badges.
- `Add Subsequence` flow:
  - Step 1: Name
  - Step 2: Condition + day threshold
  - Save creates local draft row and sends action payload to PATCH route.

## API Contract Notes

Current wrapper endpoints:

- `POST /api/plusvibe/campaigns?companyId=...`
  - Name normalization accepts `camp_name`, `campaignName`, or `name`.
- `PATCH /api/plusvibe/campaigns/:id?companyId=...`
  - Name normalization accepts `camp_name`, `campaignName`, `name`, `newName`.
  - Used for sequences, schedule, settings, subsequence actions.
- `DELETE /api/plusvibe/campaigns/:id?companyId=...`
  - Supports optional flags:
    - `archive_campaign`
    - `save_leads_to_list`

## Review Checklist

- Visual parity review against PlusVibe for each tab.
- Interaction parity for:
  - required fields
  - disabled/loading states
  - save/close transitions
- Payload validation for each save action in browser network logs.
