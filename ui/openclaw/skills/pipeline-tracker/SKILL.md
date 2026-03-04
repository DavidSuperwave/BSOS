---
name: pipeline-tracker
description: Tracks deal movement every 6 hours by reading Close opportunities/activities and Calendly events, detecting stage and meeting transitions, and attributing revenue-linked campaign events by lead email matching. Use for automated pipeline signal updates and campaign impact visibility.
metadata:
  author: superwave
  version: "1.0.0"
  category: daily
  risk_level: L1
  core: true
  removable: false
---

# Pipeline Tracker

## Purpose
Detect and record deal movement signals (meeting creation, stage progression, won/lost/no-show transitions) and map those movements to campaign influence using email-based attribution.

This skill generates recommendations only. No external actions are taken without explicit operator approval.

## Use When
- Running the BSOS daily operating loop with 6-hour refresh cycles.
- You need near-real-time campaign-to-revenue movement visibility.
- Teams need normalized pipeline event logs for downstream analytics and reporting.

## Don't Use When
- Close or Calendly data access is unavailable for the required time window.
- The company has not configured lead-email identity matching rules.
- You need one-off manual opportunity edits (this skill is not an editing tool).

## Edge Cases
- Multiple opportunities share the same lead email: pick most-recently-updated open opportunity and flag `warnings[]`.
- Meeting appears in Calendly but not yet in Close activity: persist partial event with `coverage_pct < 100`.
- Stage regresses (e.g., SQL -> MQL): classify as `stage_regression` and do not infer loss automatically.
- No-show followed by reschedule in same window: emit both events with shared correlation key.
- Duplicate source records across retries: enforce idempotency key to avoid double writes.

## Procedure
1. Trigger every 6 hours using scheduler window boundaries (`window_start`, `window_end`).
2. Read opportunities and activities from Close CRM and event stream data from Calendly.
3. Normalize entities (email casing, timestamp timezone, stage vocabulary).
4. Detect movement events:
   - `meeting_created`
   - `stage_progressed`
   - `deal_won`
   - `deal_lost`
   - `meeting_no_show`
5. Attribute events to campaign context using deterministic lead email matching.
6. Compute `reward_value` for revenue-linked transitions (won/lost and configured milestone mappings).
7. Persist `campaign_events` rows with audit metadata and skill version tags.
8. If any source is incomplete, persist partial results with `coverage_pct` and warning annotations.
9. Apply retry policy for external reads/writes: 3 attempts with exponential backoff (1s, 4s, 16s).
10. Enforce timeout limits: 10s per external API call, 5-minute total run cap.

## Data Contract
### Input
```json
{
  "company_id": "uuid",
  "window_start": "ISO-8601",
  "window_end": "ISO-8601",
  "close": {
    "opportunities": "array",
    "activities": "array"
  },
  "calendly": {
    "events": "array"
  },
  "source_ref": "string"
}
```

### Output
```json
{
  "company_id": "uuid",
  "skill": "pipeline-tracker",
  "skill_version": "1.0.0",
  "idempotency_key": "sha256(company_id+source_ref+window)",
  "coverage_pct": 0,
  "campaign_events": [
    {
      "event_type": "meeting_created|stage_progressed|deal_won|deal_lost|meeting_no_show|stage_regression",
      "opportunity_id": "string",
      "lead_email": "string",
      "campaign_id": "string|null",
      "occurred_at": "ISO-8601",
      "reward_value": 0,
      "inference_label": "DETERMINISTIC",
      "confidence": 1.0,
      "version_tag": "1.0.0"
    }
  ],
  "audit": {
    "start_ts": "ISO-8601",
    "end_ts": "ISO-8601",
    "records_read": 0,
    "records_written": 0,
    "warnings": [],
    "error_count": 0,
    "skill_version": "1.0.0"
  }
}
```

## Error Handling
- On transient API failures, retry up to 3 times (1s, 4s, 16s).
- On timeout breach (per-call 10s or run >5 min), stop processing, persist partial output, and log warning.
- On schema mismatch, quarantine invalid records, continue processing valid subset, increment `error_count`.
- On attribution ambiguity, write event with null campaign and warning.

## Templates
### Event Summary Row
```json
{
  "company_id": "{{company_id}}",
  "event_type": "{{event_type}}",
  "lead_email": "{{lead_email}}",
  "campaign_id": "{{campaign_id}}",
  "reward_value": {{reward_value}},
  "occurred_at": "{{occurred_at}}",
  "version_tag": "1.0.0"
}
```
