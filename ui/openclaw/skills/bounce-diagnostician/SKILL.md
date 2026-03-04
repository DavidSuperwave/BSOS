---
name: bounce-diagnostician
description: Diagnose bounced lead records by parsing SMTP/provider messages into root-cause categories for deliverability recommendations. Use when bounced leads are detected or hourly watchdog runs. Don't use when no bounce payload detail is present.
metadata:
  author: superwave
  version: "1.0.0"
  category: onboarding
  risk_level: L1
  core: true
  removable: false
---

# Bounce Root-Cause Analyzer

## Purpose
Classify bounce events into actionable root-cause taxonomy so Julian can recommend list hygiene, infrastructure, and policy fixes.

This skill generates recommendations only. No external actions are taken without explicit operator approval.

## Use When
- Leads with `status=BOUNCED` are detected in PlusVibe.
- Hourly watchdog runs for near-real-time bounce diagnosis.
- Teams require category-level bounce trend visibility.

## Don't Use When
- Bounce payload is missing SMTP/provider diagnostic text.
- Operator asks for autonomous remediation actions (e.g., auto-removal, auto-config changes).

## Edge Cases
- Multiple SMTP codes in one payload: select most specific terminal code and keep alternates in notes.
- Provider-specific free text without code: classify by phrase patterns with lower confidence.
- Transient vs permanent ambiguity: default to `unknown` with assumption label.
- Malformed payload JSON: persist raw excerpt and processing warning.

## Procedure
1. Initialize run context, window, and audit metadata.
2. Resolve company credentials from Supabase `companies`.
3. Fetch bounced leads via `GET /lead/workspace-leads?status=BOUNCED`.
4. Parse SMTP codes/provider messages and map to taxonomy:
   - `bad_data (5.1.1)`
   - `content_filter (5.7.350)`
   - `auth_failure (5.7.368)`
   - `gateway_timeout`
   - `dns_failure`
   - `policy_rejection`
   - `unknown`
5. Attach certainty fields:
   - `confidence_score`
   - `label_type=INFERENCE` or `ASSUMPTION` where ambiguous
6. Persist to Supabase `bounce_analysis` with version tags and idempotent key.
7. Write pattern summaries to Supermemory `{company}-bounce-patterns`.
8. Persist partial batches when coverage is incomplete.
9. Finalize audit metadata and recommendation output.

## Data Contract
### Input
- `company_id`
- `window_start`, `window_end`
- payload from `GET /lead/workspace-leads?status=BOUNCED`
  - SMTP code/message
  - provider message
  - lead/account/campaign refs

### Output
- Supabase table: `bounce_analysis`
  - `company_id`, `lead_id`, `campaign_id`, `account_id`
  - `bounce_category`
  - `smtp_code` (nullable)
  - `provider_reason_excerpt`
  - `confidence_score`, `label_type`
  - `source_ref`, `window_start`, `window_end`
  - `coverage_pct`, `version_tag`, `idempotency_key`, `created_at`
- Supermemory: `{company}-bounce-patterns`
- Audit envelope.

## Error Handling
- Retry external endpoints 3 times with backoff 1s/4s/16s.
- 10s timeout per API call; 5-minute cap per run.
- If parsing fails for record, store `bounce_category=unknown`, include warning, continue.
- If persistence partially fails, checkpoint and retry remaining records idempotently.
- Always persist whatever subset is valid with coverage percentage.

## Templates
### Template A — Deterministic SMTP Mapping
```json
{
  "lead_id": "ld_2001",
  "smtp_code": "5.1.1",
  "bounce_category": "bad_data",
  "confidence_score": 0.99,
  "label_type": "DETERMINISTIC",
  "coverage_pct": 100,
  "version_tag": "1.0.0"
}
```

### Template B — Ambiguous Provider Text
```json
{
  "lead_id": "ld_2002",
  "smtp_code": null,
  "bounce_category": "policy_rejection",
  "confidence_score": 0.57,
  "label_type": "ASSUMPTION",
  "provider_reason_excerpt": "message blocked by policy engine",
  "coverage_pct": 100,
  "version_tag": "1.0.0"
}
```
