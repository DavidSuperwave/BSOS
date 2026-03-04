---
name: copy-analyzer
description: Analyze imported PlusVibe campaign sequence copy to detect hook/CTA patterns, personalization depth, readability, and quality signals for GTM recommendations. Use when campaign content is imported or changed. Don't use when no sequence copy is available or when execution actions are requested.
metadata:
  author: superwave
  version: "1.0.0"
  category: onboarding
  risk_level: L1
  core: true
  removable: false
---

# Campaign Copy Analyzer

## Purpose
Transform PlusVibe sequence-step-variant email copy into structured campaign intelligence for Julian (BSOS GTM strategist), including hook classes, CTA style, personalization depth, readability, and messaging pattern signals.

This skill generates recommendations only. No external actions are taken without explicit operator approval.

## Use When
- PlusVibe campaigns are imported during onboarding and sequence content is available.
- New campaigns, new sequence steps, or new A/B variants appear in daily sync.
- GTM strategy requires evidence-backed messaging analysis before suggesting changes.

## Don't Use When
- Campaign content endpoints return empty or inaccessible payloads.
- The request is to send, pause, edit, or launch campaigns directly.
- Operator asks for autonomous external execution without approval gates.

## Edge Cases
- Missing subject/body for one variant: persist partial row with `coverage_pct < 100` and warning.
- Multilingual copy: run language-aware readability where possible; fallback to generic readability with warning.
- HTML-heavy body: normalize to text before analysis and record normalization ratio.
- Duplicate imports across sync windows: enforce idempotent upsert using stable key.

## Procedure
1. Initialize run context and audit metadata (`start_ts`, `skill_version`, company scope, run window).
2. Resolve company credentials from Supabase `companies` table (per-company API keys, never env vars).
3. Fetch campaign structures via:
   - `GET /campaign/list-all`
   - `GET /unibox/campaign-emails`
   Use timeout 10s per call, max 3 retries with exponential backoff (1s, 4s, 16s).
4. Normalize sequence objects into atomic units: `campaign_id + sequence_step + variation_id`.
5. Extract features per unit:
   - Hook class: `timeline | numbers | social_proof | problem | custom`
   - CTA class: `soft_ask | hard_ask | curiosity | value_offer`
   - Personalization depth (none/basic/contextual/deep)
   - Word count, sentence length, readability score/grade
6. For any pattern-derived or probabilistic outputs, attach:
   - `confidence_score` (0.0–1.0)
   - `label_type` = `INFERENCE` (or `ASSUMPTION` when evidence is insufficient)
7. Persist results to Supabase `campaign_copy_analysis` with version-tagged rows and idempotent key:
   - `idempotency_key = hash(company_id + source_ref + window)`
8. Update Supermemory namespace `{company}-campaigns-copy` with compact strategy-relevant summaries.
9. Persist partial results even on degraded runs, including `coverage_pct < 100`.
10. Finalize audit metadata (`end_ts`, `records_read`, `records_written`, `warnings[]`, `error_count`) and emit recommendation package for Julian.

## Data Contract
### Input
- `company_id` (uuid)
- `run_mode` (`onboarding_import | daily_incremental`)
- `window_start`, `window_end`
- PlusVibe endpoints payloads:
  - campaigns list (`GET /campaign/list-all`)
  - campaign emails/thread context (`GET /unibox/campaign-emails`)

### Output
- Supabase table: `campaign_copy_analysis`
  - Required fields:
    - `company_id`
    - `campaign_id`
    - `sequence_step`
    - `variation_id`
    - `hook_class`
    - `cta_class`
    - `personalization_depth`
    - `word_count`
    - `readability_grade`
    - `confidence_score`
    - `label_type` (`INFERENCE|ASSUMPTION|DETERMINISTIC`)
    - `source_ref`
    - `window_start`, `window_end`
    - `coverage_pct`
    - `version_tag`
    - `idempotency_key`
    - `created_at`
- Supermemory collection: `{company}-campaigns-copy`
- Skill audit envelope with required metadata fields.

## Error Handling
- Retry policy for external calls: 3 attempts (1s, 4s, 16s).
- Per-call timeout: 10s. Total skill execution cap: 5 minutes.
- On endpoint failure, continue with available campaigns and mark degraded coverage.
- On schema drift, map known fields, store unknown fields in `warnings[]`, continue.
- On persistence conflict, upsert by `idempotency_key` to ensure idempotence.
- If confidence < configured threshold for inferred class, set `label_type=ASSUMPTION` and surface manual review recommendation.

## Templates
### Template A — Full-Coverage Row
```json
{
  "company_id": "co_123",
  "campaign_id": "cmp_77",
  "sequence_step": 2,
  "variation_id": "B",
  "hook_class": "social_proof",
  "cta_class": "soft_ask",
  "personalization_depth": "contextual",
  "word_count": 118,
  "readability_grade": 8.4,
  "confidence_score": 0.91,
  "label_type": "INFERENCE",
  "coverage_pct": 100,
  "version_tag": "1.0.0"
}
```

### Template B — Partial Coverage (Missing Body)
```json
{
  "company_id": "co_123",
  "campaign_id": "cmp_77",
  "sequence_step": 3,
  "variation_id": "A",
  "hook_class": "custom",
  "cta_class": "curiosity",
  "confidence_score": 0.58,
  "label_type": "ASSUMPTION",
  "coverage_pct": 62,
  "warnings": ["email_body_missing"],
  "version_tag": "1.0.0"
}
```
