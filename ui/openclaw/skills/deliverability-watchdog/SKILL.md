---
name: deliverability-watchdog
description: Monitor domain/account deliverability drift against baseline and emit severity alerts for warmup, placement, DNS, and account-activity degradation. Use on 2-hour send-window cadence plus daily full sweep. Don't use for baseline creation or autonomous infrastructure changes.
metadata:
  author: superwave
  version: "1.0.0"
  category: daily
  risk_level: L1
  core: true
  removable: false
---

# Domain & Account Health

## Purpose
Continuously compare current deliverability indicators against onboarding baseline to identify infrastructure drift and recommend corrective actions.

This skill generates recommendations only. No external actions are taken without explicit operator approval.

## Use When
- Every 2 hours during active sending windows.
- Daily after-hours full sweep is scheduled.
- Domain/account health drift detection is required.

## Don't Use When
- Baseline snapshot does not yet exist (run deliverability-assessor first).
- Operator requests automatic DNS/mailbox edits.

## Edge Cases
- Temporary provider outage causing broad failures: classify as systemic incident with lower confidence.
- Newly added account without baseline: create provisional baseline event.
- Inactive account with no recent sends: separate inactivity alert from deliverability degradation.
- Conflicting vitals and warmup signals: prioritize latest successful timestamped signal.

## Procedure
1. Initialize scheduled watchdog run and audit metadata.
2. Resolve company API keys from Supabase `companies`.
3. Fetch current state:
   - `GET /account/list`
   - `POST /account/test/vitals`
   - `GET /account/warmup-stats`
4. Load baseline from `deliverability_snapshots` (`snapshot_type=baseline`).
5. Compare baseline vs current for:
   - warmup decline
   - inbox placement degradation
   - DNS/auth failures
   - inactive or unstable accounts
6. Produce severity alerts and drift metrics with confidence fields and `INFERENCE/ASSUMPTION` labels where non-deterministic.
7. Persist updated `deliverability_snapshots` (`snapshot_type=watchdog`) and severity alerts using idempotent keys.
8. Persist partial outputs if some accounts fail checks.
9. Finalize audit metadata and recommendation package.

## Data Contract
### Input
- `company_id`
- `run_mode` (`two_hour_send_window | daily_full_sweep`)
- account/vitals/warmup endpoint payloads
- baseline snapshot rows

### Output
- `deliverability_snapshots` updates
  - `company_id`, `account_id`, `domain`, `snapshot_type=watchdog`
  - `baseline_health_score`, `current_health_score`, `drift_delta`
  - `warmup_change`, `dns_change`, `placement_change`, `activity_state`
  - `severity`
  - `confidence_score`, `label_type`
  - `source_ref`, `window_start`, `window_end`
  - `coverage_pct`, `version_tag`, `idempotency_key`, `created_at`
- severity alerts stream
- Audit envelope.

## Error Handling
- Retry external calls with 3 attempts (1s/4s/16s).
- Per-call timeout: 10s. Total execution cap: 5 minutes.
- If baseline missing for account, emit `baseline_missing` warning and continue.
- If vitals unavailable, compute partial drift from remaining signals and mark coverage.
- Ensure idempotent upserts by stable key.

## Templates
### Template A — Critical Drift Alert
```json
{
  "account_id": "acc_6001",
  "domain": "example.com",
  "snapshot_type": "watchdog",
  "baseline_health_score": 0.9,
  "current_health_score": 0.52,
  "drift_delta": -0.38,
  "severity": "CRITICAL",
  "confidence_score": 0.9,
  "label_type": "INFERENCE",
  "coverage_pct": 100,
  "version_tag": "1.0.0"
}
```

### Template B — Partial Drift with Baseline Gap
```json
{
  "account_id": "acc_6002",
  "domain": "newdomain.io",
  "snapshot_type": "watchdog",
  "baseline_health_score": null,
  "current_health_score": 0.71,
  "drift_delta": null,
  "severity": "WARNING",
  "confidence_score": 0.46,
  "label_type": "ASSUMPTION",
  "coverage_pct": 74,
  "warnings": ["baseline_missing_for_account"],
  "version_tag": "1.0.0"
}
```
