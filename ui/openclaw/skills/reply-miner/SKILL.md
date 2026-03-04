---
name: reply-miner
description: Classify PlusVibe reply threads into actionable GTM categories, extract objections, and segment persona signals for recommendation workflows. Use when reply data is available during onboarding or hourly send-window sync. Don't use when autonomous outbound actions are requested.
metadata:
  author: superwave
  version: "1.0.0"
  category: onboarding
  risk_level: L1
  core: true
  removable: false
---

# Reply Classifier

## Purpose
Convert raw reply-thread data from PlusVibe into structured intent categories, objection intelligence, and persona segmentation signals that Julian uses for strategy recommendations.

This skill generates recommendations only. No external actions are taken without explicit operator approval.

## Use When
- Reply threads are present in PlusVibe unibox data.
- Hourly incremental classification is needed during send windows.
- Teams need positive/negative response memory for strategy adaptation.

## Don't Use When
- Reply text is unavailable or only metadata exists without analyzable content.
- Operator asks the agent to auto-send responses or update sequences directly.
- Confidence calibration models are unavailable and output quality would be unsafe.

## Edge Cases
- Very short replies ("yes", "stop"): classify with low confidence and queue for review if < 0.6.
- Multi-intent replies (e.g., objection + referral): allow primary + secondary labels.
- Non-English replies: language-detect, classify with locale model or mark degraded confidence.
- Forwarded chains with mixed sentiment: isolate latest lead-authored segment when possible.

## Procedure
1. Start run and initialize audit metadata.
2. Pull company API credentials from Supabase `companies` table.
3. Fetch incremental reply data from `GET /unibox/campaign-emails` within target window.
4. Build normalized reply records (`thread_id`, `lead_id`, `campaign_id`, `text_body`, sentiment, labels, lead fields).
5. Classify each reply into one primary class (plus optional secondary):
   - `interested`, `not-now`, `objection`, `OOO`, `unsubscribe`, `wrong-person`, `competitor-mention`, `referral`
6. Extract structured objection payload when relevant (type, evidence phrase, urgency cue).
7. Tag persona segments from lead fields + response language.
8. Attach required uncertainty fields for non-deterministic output:
   - `confidence_score`
   - `label_type=INFERENCE` (or `ASSUMPTION` on weak evidence)
9. Route low-confidence replies (`confidence_score < 0.6`) to manual review queue.
10. Persist outputs to Supabase `reply_classifications` using idempotent key hash(company_id + source_ref + window).
11. Write memory summaries:
    - `{company}-replies-positive`
    - `{company}-replies-negative`
12. Persist partial batches with `coverage_pct < 100` if needed and finalize audit metadata.

## Data Contract
### Input
- `company_id`
- `run_mode` (`onboarding | hourly_incremental`)
- `window_start`, `window_end`
- PlusVibe unibox payload with:
  - `text_body`, `sentiment`, `labels`, `lead fields`, thread metadata

### Output
- Supabase table: `reply_classifications`
  - `company_id`, `thread_id`, `reply_id`, `lead_id`, `campaign_id`
  - `primary_category`, `secondary_category`
  - `objection_payload` (nullable)
  - `persona_segment_tags` (array)
  - `confidence_score`, `label_type`
  - `manual_review_required` (bool)
  - `source_ref`, `window_start`, `window_end`
  - `coverage_pct`, `version_tag`, `idempotency_key`, `created_at`
- Supermemory:
  - `{company}-replies-positive`
  - `{company}-replies-negative`
- Audit envelope with required metadata.

## Error Handling
- External fetch retries: 3 attempts with 1s/4s/16s backoff.
- Timeout: 10s per API call, 5-minute execution cap.
- If classification model service is degraded, persist deterministic extracts (labels/sentiment) and mark inference fields as assumptions.
- If write failure occurs mid-batch, checkpoint progress and resume idempotently.
- Always emit warnings and partial coverage metrics.

## Templates
### Template A — Interested Reply
```json
{
  "thread_id": "th_991",
  "primary_category": "interested",
  "secondary_category": null,
  "persona_segment_tags": ["vp_sales", "saas_midmarket"],
  "confidence_score": 0.93,
  "label_type": "INFERENCE",
  "manual_review_required": false,
  "coverage_pct": 100,
  "version_tag": "1.0.0"
}
```

### Template B — Low-Confidence Multi-Intent
```json
{
  "thread_id": "th_992",
  "primary_category": "objection",
  "secondary_category": "referral",
  "objection_payload": {
    "type": "timing_budget",
    "evidence": "not in this quarter's budget"
  },
  "confidence_score": 0.54,
  "label_type": "ASSUMPTION",
  "manual_review_required": true,
  "coverage_pct": 100,
  "version_tag": "1.0.0"
}
```
