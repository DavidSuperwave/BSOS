---
name: deliverability-assessor
description: Establish onboarding deliverability baseline by auditing account infrastructure, DNS/authentication integrity, warmup state, and policy compliance for GTM recommendations. Use after account connections are complete. Don't use for high-frequency monitoring loops.
metadata:
  author: superwave
  version: "1.0.0"
  category: onboarding
  risk_level: L1
  core: true
  removable: false
---

# Infrastructure Health Baseline

## Purpose
Create a baseline snapshot of sending infrastructure health for each connected account/domain and compare it against Superwave operational defaults.

This skill generates recommendations only. No external actions are taken without explicit operator approval.

## Use When
- Account connection phase is completed.
- Baseline deliverability health must be established during onboarding.
- Daily watchdog needs an initial reference snapshot.

## Don't Use When
- No connected sending accounts are available.
- Operator requests direct DNS/mailbox configuration changes.

## Edge Cases
- SPF/DKIM pass but DMARC missing: classify as partial-auth integrity.
- Warmup stats endpoint delayed: persist baseline with reduced coverage.
- Shared domain across multiple accounts: compute per-account and aggregate domain view.
- Conflicting vitals tests in same run: keep latest successful test and log warning.

## Procedure
1. Start run and initialize audit metadata.
2. Load company-specific credentials from Supabase `companies` table.
3. Fetch source data:
   - `GET /account/list`
   - `POST /account/test/vitals`
   - `GET /account/warmup-stats`
4. Evaluate infrastructure dimensions:
   - SMTP/IMAP health
   - SPF/DKIM/DMARC integrity
   - warmup status and trend
   - compliance against Superwave defaults:
     - `reply_rate_9_pct`
     - `15min_between_emails`
     - ramp limits
5. Generate per-account and per-domain health scores with confidence labels for inferred checks.
6. Persist baseline rows to Supabase `deliverability_snapshots` with `snapshot_type=baseline`.
7. Store summary memory in `{company}-infrastructure-health`.
8. Persist partial results when some tests fail (`coverage_pct < 100`).
9. Finalize audit envelope and recommendation package.

## Data Contract
### Input
- `company_id`
- `run_mode` (`onboarding_baseline | daily_drift_check`)
- account/vitals/warmup payloads from listed endpoints

### Output
- Supabase `deliverability_snapshots`
  - `company_id`, `account_id`, `domain`
  - `snapshot_type` (`baseline|watchdog`)
  - `smtp_health`, `imap_health`
  - `spf_status`, `dkim_status`, `dmarc_status`
  - `warmup_status`, `warmup_score`
  - `defaults_compliance` (json)
  - `health_score`
  - `confidence_score`, `label_type`
  - `source_ref`, `window_start`, `window_end`
  - `coverage_pct`, `version_tag`, `idempotency_key`, `created_at`
- Supermemory: `{company}-infrastructure-health`
- Audit envelope.

## Error Handling
- Retry policy: 3 attempts, exponential backoff 1s/4s/16s.
- Timeouts: 10s per call, total run cap 5 minutes.
- On vitals timeout, keep account row with `health_score=null` and warning.
- On DNS parse issues, mark status unknown and continue.
- Use idempotent upsert by stable key.

## Templates
### Template A — Healthy Baseline
```json
{
  "account_id": "acc_4001",
  "domain": "example.com",
  "snapshot_type": "baseline",
  "spf_status": "pass",
  "dkim_status": "pass",
  "dmarc_status": "pass",
  "warmup_status": "active",
  "health_score": 0.92,
  "confidence_score": 0.95,
  "label_type": "INFERENCE",
  "coverage_pct": 100,
  "version_tag": "1.0.0"
}
```

### Template B — Partial Baseline with Missing Warmup
```json
{
  "account_id": "acc_4002",
  "domain": "example.org",
  "snapshot_type": "baseline",
  "spf_status": "pass",
  "dkim_status": "pass",
  "dmarc_status": "missing",
  "warmup_status": "unknown",
  "health_score": 0.61,
  "confidence_score": 0.64,
  "label_type": "ASSUMPTION",
  "coverage_pct": 78,
  "warnings": ["warmup_stats_unavailable"],
  "version_tag": "1.0.0"
}
```
