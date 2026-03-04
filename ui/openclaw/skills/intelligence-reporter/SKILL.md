---
name: intelligence-reporter
description: Produces a daily GTM intelligence brief after sending hours using campaign, deliverability, and pipeline deltas, including anomalies, recommendations, unresolved questions, and trend summaries. Use for daily operator decision support and visibility.
metadata:
  author: superwave
  version: "1.0.0"
  category: daily
  risk_level: L1
  core: true
  removable: false
---

# Intelligence Reporter

## Purpose
Compile a structured daily brief for operators that summarizes GTM performance changes and high-priority actions.

This skill generates recommendations only. No external actions are taken without explicit operator approval.

## Use When
- End-of-day operational review after sending window closes.
- Operators need condensed signals before next-day planning.
- Leadership requires a daily pulse on anomalies and trend direction.

## Don't Use When
- Current-day data is not yet ingested from primary systems.
- Team requires intra-day live alerting (use monitoring skills instead).
- Immediate incident response is required (this is summary-focused).

## Edge Cases
- Fewer than 3 sections complete: do not publish full brief; persist draft state.
- Exactly 3 sections complete: publish partial report and mark missing sections.
- Contradictory signals (e.g., improved replies but worse meetings): include as unresolved question.
- Missing deliverability feed: publish with reduced coverage and explicit warnings.

## Procedure
1. Trigger once daily after configured sending hours end.
2. Read current-day deltas for campaigns, deliverability, and pipeline movement.
3. Build four required sections:
   - anomalies
   - recommendations
   - unresolved questions
   - trend summaries
4. Label non-deterministic conclusions as `INFERENCE` and include confidence scores.
5. If at least 3 sections are complete, publish partial/full report.
6. Persist to `intelligence_reports` table.
7. Push report payload to Telegram channel and update dashboard module.
8. Include audit metadata and version tags on persisted rows.
9. Retry transient operations with backoff schedule (1s, 4s, 16s), max 3 attempts.
10. Enforce timeout limits: 10s per external API call, 5-minute run cap.

## Data Contract
### Input
```json
{
  "company_id": "uuid",
  "report_date": "YYYY-MM-DD",
  "deltas": {
    "campaign": "object",
    "deliverability": "object",
    "pipeline": "object"
  },
  "source_ref": "string"
}
```

### Output
```json
{
  "company_id": "uuid",
  "skill": "intelligence-reporter",
  "skill_version": "1.0.0",
  "idempotency_key": "sha256(company_id+source_ref+window)",
  "coverage_pct": 0,
  "report": {
    "status": "draft|partial|published",
    "sections_completed": 0,
    "anomalies": [],
    "recommendations": [],
    "unresolved_questions": [],
    "trend_summaries": []
  },
  "distribution": {
    "intelligence_reports_table": true,
    "telegram_push": "queued|sent|failed",
    "dashboard_module": "updated|failed"
  },
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
- If Telegram push fails, keep table write and dashboard update, then log warning.
- If dashboard update fails, still publish report and queue retry marker.
- If <3 sections complete, persist draft and return `status=draft`.
- Retry transient failures up to 3 attempts with exponential backoff.

## Templates
### Recommendation Item
```json
{
  "type": "INFERENCE",
  "statement": "Shift 15% of sends to Segment B due to stronger reply-to-meeting conversion.",
  "confidence": 0.81,
  "priority": "high",
  "owner": "operator",
  "version_tag": "1.0.0"
}
```
