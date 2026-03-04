---
name: deal-miner
description: Extract win/loss deal patterns from Close CRM onboarding sync to identify buyer signatures, loss taxonomy, and campaign influence recommendations. Use during onboarding CRM backfill analysis. Don't use for daily monitoring or autonomous CRM updates.
metadata:
  author: superwave
  version: "1.0.0"
  category: onboarding
  risk_level: L1
  core: true
  removable: false
---

# Deal Pattern Extractor

## Purpose
Analyze 90-day Close CRM opportunity/activity history to surface repeatable patterns behind won/lost deals and probable campaign influence links for strategic guidance.

This skill generates recommendations only. No external actions are taken without explicit operator approval.

## Use When
- Close CRM onboarding sync is completed.
- 90-day won/lost opportunity analysis is required.
- GTM strategy needs historical conversion and loss intelligence.

## Don't Use When
- Close data sync is incomplete or outside trusted date ranges.
- Request concerns real-time daily pipeline monitoring (handled by other skills).
- Operator requests automatic deal-stage edits or outbound actions.

## Edge Cases
- Missing loss reason: map to `unknown_loss_reason` and flag assumption.
- Multi-contact opportunities: build composite buyer signature with confidence weighting.
- Email identity not directly matched: infer campaign influence probabilistically with clear inference label.
- Duplicate opportunities from sync artifacts: dedupe before aggregation.

## Procedure
1. Initialize onboarding analysis run and audit envelope.
2. Retrieve company credentials from Supabase `companies`.
3. Fetch Close opportunities and activities for prior 90 days.
4. Segment opportunities into `won` and `lost` cohorts.
5. Extract buyer profile signatures for wins (role mix, company traits, sales cycle traits).
6. Map loss reasons into standardized taxonomy.
7. Attribute campaign influence through email identity linking between Close contacts and PlusVibe identities.
8. For inferred influence or inferred taxonomy mappings, attach:
   - `confidence_score`
   - `label_type=INFERENCE` (or `ASSUMPTION`)
9. Persist to Supabase `deal_patterns` with idempotent key and `version_tag`.
10. Update Supermemory:
    - `{company}-deals-won`
    - `{company}-deals-lost`
11. Persist partial results if any sub-stream fails and finalize audit metadata.

## Data Contract
### Input
- `company_id`
- `run_mode=onboarding_sync`
- `lookback_days=90`
- Close API datasets:
  - opportunities (won/lost)
  - activities (calls, emails, notes)
  - contacts/accounts

### Output
- Supabase table: `deal_patterns`
  - `company_id`, `opportunity_id`
  - `outcome` (`won|lost`)
  - `buyer_signature` (json)
  - `loss_taxonomy_code` (nullable)
  - `campaign_influence_score` (nullable)
  - `confidence_score`, `label_type`
  - `source_ref`, `window_start`, `window_end`
  - `coverage_pct`, `version_tag`, `idempotency_key`, `created_at`
- Supermemory collections:
  - `{company}-deals-won`
  - `{company}-deals-lost`
- Audit envelope.

## Error Handling
- API retries: 3 attempts with 1s/4s/16s backoff.
- Timeouts: 10s per external call, 5-minute execution cap.
- If one dataset (e.g., activities) fails, continue with opportunities and mark limited attribution.
- If mapping table missing for loss taxonomy, use fallback taxonomy and warning.
- Upsert outputs idempotently to avoid duplicate pattern rows.

## Templates
### Template A — Won Deal Pattern
```json
{
  "opportunity_id": "opp_3001",
  "outcome": "won",
  "buyer_signature": {
    "primary_titles": ["VP Sales", "Head of RevOps"],
    "company_size_band": "51-200"
  },
  "campaign_influence_score": 0.74,
  "confidence_score": 0.81,
  "label_type": "INFERENCE",
  "coverage_pct": 100,
  "version_tag": "1.0.0"
}
```

### Template B — Lost Deal with Unknown Reason
```json
{
  "opportunity_id": "opp_3002",
  "outcome": "lost",
  "loss_taxonomy_code": "unknown_loss_reason",
  "confidence_score": 0.49,
  "label_type": "ASSUMPTION",
  "coverage_pct": 88,
  "warnings": ["missing_close_loss_reason"],
  "version_tag": "1.0.0"
}
```
