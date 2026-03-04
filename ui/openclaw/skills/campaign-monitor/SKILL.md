---
name: campaign-monitor
description: Monitor campaign pulse on scheduled cadence, compute metric deltas, and flag severity-tagged anomalies for GTM recommendations. Use for hourly and off-window campaign health checks. Don't use for onboarding deep analysis or autonomous campaign actions.
metadata:
  author: superwave
  version: "1.0.0"
  category: daily
  risk_level: L1
  core: true
  removable: false
---

# Hourly Campaign Pulse

## Purpose
Track campaign-level health by comparing current snapshots versus prior windows, then raise severity-tiered events for Julian's recommendations.

This skill generates recommendations only. No external actions are taken without explicit operator approval.

## Use When
- Scheduled cron runs occur (hourly in sending windows; every 4 hours outside).
- Teams need anomaly detection for bounce, reply rate, and send volume changes.
- Feature snapshots require continuous refresh.

## Don't Use When
- Historical baseline/snapshot store is unavailable.
- Request is to auto-pause, resume, or edit campaigns directly.

## Edge Cases
- First run with no prior snapshot: emit baseline-only event, no anomaly severity.
- Campaign archived mid-window: mark as inactive and exclude from rate comparisons.
- Partial endpoint failures: compute with available dimensions and reduced coverage.
- Timezone boundary issues: normalize all window boundaries to UTC with company-local annotation.

## Procedure
1. Start run context per cron schedule and initialize audit metadata.
2. Pull credentials from Supabase `companies`.
3. Fetch inputs:
   - `GET /campaign/list-all`
   - `GET /analytics/campaign/stats`
   - `GET /lead/count/lead-status`
   - `GET /account/list`
4. Build current snapshot and load prior snapshot for delta computation.
5. Compute deltas and detect signals:
   - bounce spikes
   - reply-rate compression
   - auto-pause risk indicators
   - volume anomalies
6. Assign severity tiers (bounce-centric baseline):
   - `CRITICAL` > 10%
   - `HIGH` 3–10%
   - `WARNING` 2–3%
   - `HEALTHY` < 2%
7. For inferred anomalies, attach `confidence_score` and `label_type=INFERENCE` (or `ASSUMPTION` if weak evidence).
8. Persist:
   - `campaign_events` (severity-tagged)
   - `feature_snapshots` refresh
   - anomaly flags
   with idempotent keys and version tags.
9. Persist partial outputs on incomplete data (`coverage_pct < 100`).
10. Finalize audit envelope and recommendation summary.

## Data Contract
### Input
- `company_id`
- `run_schedule` (`hourly_sending | four_hour_off_window`)
- endpoint payloads listed above
- prior snapshot reference

### Output
- `campaign_events`
  - `company_id`, `campaign_id`, `event_type`, `severity`
  - `metric_current`, `metric_prior`, `delta_pct`
  - `confidence_score`, `label_type`
  - `source_ref`, `window_start`, `window_end`
  - `coverage_pct`, `version_tag`, `idempotency_key`, `created_at`
- `feature_snapshots` updated rows
- anomaly flags dataset
- Audit envelope.

## Error Handling
- Retries: 3 attempts with 1s/4s/16s backoff.
- Enforce 10s per external call and 5-minute cap.
- If prior snapshot missing/corrupt, create baseline snapshot and warning.
- If one metric family unavailable, continue with remaining metrics and lower coverage.
- Upsert idempotently per campaign/window.

## Templates
### Template A — High Bounce Event
```json
{
  "campaign_id": "cmp_5001",
  "event_type": "bounce_spike",
  "severity": "HIGH",
  "metric_current": 0.062,
  "metric_prior": 0.021,
  "delta_pct": 195.2,
  "confidence_score": 0.94,
  "label_type": "INFERENCE",
  "coverage_pct": 100,
  "version_tag": "1.0.0"
}
```

### Template B — First Snapshot Baseline Event
```json
{
  "campaign_id": "cmp_5002",
  "event_type": "baseline_initialized",
  "severity": "HEALTHY",
  "metric_current": 0.018,
  "metric_prior": null,
  "delta_pct": null,
  "confidence_score": 1.0,
  "label_type": "DETERMINISTIC",
  "coverage_pct": 100,
  "version_tag": "1.0.0"
}
```
