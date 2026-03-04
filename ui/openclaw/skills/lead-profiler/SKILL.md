---
name: lead-profiler
description: Score incoming PlusVibe leads against ICP criteria and refine fit assumptions using observed response behavior for GTM recommendations. Use when new leads arrive or scheduled rescoring runs. Don't use when no lead identity/company data is available.
metadata:
  author: superwave
  version: "1.0.0"
  category: onboarding
  risk_level: L1
  core: true
  removable: false
---

# Lead/ICP Scorer

## Purpose
Generate consistent ICP-fit scoring for leads using profile attributes and behavior feedback loops so Julian can recommend targeting changes with explicit confidence.

This skill generates recommendations only. No external actions are taken without explicit operator approval.

## Use When
- New leads are ingested from PlusVibe workspace.
- Weekly full re-score is due.
- Response behavior signals are available to calibrate ICP assumptions.

## Don't Use When
- Lead/company/title fields are missing for most records.
- The task is to auto-enroll, auto-contact, or auto-update lead records in external tools.

## Edge Cases
- Conflicting title fields across sources: pick highest-trust source and record conflict warning.
- Unknown company size/vertical: score with partial evidence and mark assumption.
- Sparse response history: keep behavior-weight low and annotate low confidence.
- Duplicate leads across workspaces: merge by normalized identity before scoring.

## Procedure
1. Start run, collect audit metadata, determine run type (`incremental` or `weekly_full`).
2. Pull company API keys from Supabase `companies` table.
3. Fetch leads via `GET /lead/workspace-leads` using window filters.
4. Normalize identity and firmographic fields (title, vertical, company size, linkedin data).
5. Compute base ICP fit score across weighted dimensions:
   - title fit
   - vertical fit
   - company size fit
6. Validate/refine score using observed response behavior where available.
7. Produce final fields:
   - `icp_score`, `icp_tier`, `fit_rationale`
   - `confidence_score`
   - `label_type=INFERENCE` or `ASSUMPTION` when data is sparse
8. Persist to Supabase `lead_profiles` with `idempotency_key = hash(company_id + source_ref + window)` and `version_tag`.
9. Write refinement insights to Supermemory `{company}-icp-refinements`.
10. Persist partial outputs with `coverage_pct < 100` on degraded runs.
11. Finalize audit metadata and recommendation summary.

## Data Contract
### Input
- `company_id`
- `run_mode` (`incremental_new_leads | weekly_full_rescore`)
- `window_start`, `window_end`
- PlusVibe leads payload from `GET /lead/workspace-leads`
  - identity fields
  - company fields
  - linkedin fields
  - optional response metrics

### Output
- Supabase table: `lead_profiles`
  - `company_id`, `lead_id`
  - `title_fit`, `vertical_fit`, `size_fit`
  - `icp_score`, `icp_tier`
  - `behavior_adjustment` (nullable)
  - `confidence_score`, `label_type`
  - `fit_rationale`
  - `source_ref`, `window_start`, `window_end`
  - `coverage_pct`, `version_tag`, `idempotency_key`, `created_at`
- Supermemory: `{company}-icp-refinements`
- Audit envelope fields.

## Error Handling
- Retry external calls 3 times (1s, 4s, 16s).
- Enforce 10s per external API call and 5-minute total cap.
- If behavior data unavailable, continue with profile-only scoring and warning flag.
- If normalization fails for subset, quarantine bad records and persist valid subset.
- Upsert idempotently to avoid duplicate scoring rows.

## Templates
### Template A — High-Fit Lead
```json
{
  "lead_id": "ld_1001",
  "title_fit": 0.95,
  "vertical_fit": 0.9,
  "size_fit": 0.85,
  "icp_score": 0.9,
  "icp_tier": "A",
  "confidence_score": 0.88,
  "label_type": "INFERENCE",
  "coverage_pct": 100,
  "version_tag": "1.0.0"
}
```

### Template B — Sparse Data Lead
```json
{
  "lead_id": "ld_1002",
  "title_fit": 0.6,
  "vertical_fit": null,
  "size_fit": null,
  "icp_score": 0.52,
  "icp_tier": "C",
  "confidence_score": 0.43,
  "label_type": "ASSUMPTION",
  "coverage_pct": 67,
  "warnings": ["missing_vertical", "missing_company_size"],
  "version_tag": "1.0.0"
}
```
