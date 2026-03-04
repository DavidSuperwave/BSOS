---
name: icp-validator
description: Performs a weekly or on-demand ICP reality check by comparing declared ICP assumptions against observed historical conversion and response behavior across BSOS signals. Use when refining targeting strategy with read-only evidence-backed insights.
metadata:
  author: superwave
  version: "1.0.0"
  category: daily
  risk_level: L1
  core: true
  removable: false
---

# ICP Validator

## Purpose
Evaluate whether the declared Ideal Customer Profile (ICP) matches actual market behavior using unified historical GTM signals.

This skill generates recommendations only. No external actions are taken without explicit operator approval.

## Use When
- Running weekly strategic reviews of ICP quality.
- Investigating weak response, low conversion, or inconsistent deal quality.
- Operator requests on-demand ICP recalibration analysis.

## Don't Use When
- Signal tables are materially incomplete for the analysis window.
- The company lacks a declared ICP baseline to compare against.
- You need direct list-building or outbound execution.

## Edge Cases
- Sparse data segments: report as low-confidence INFERENCE.
- Conflicting indicators across channels: surface both and mark unresolved.
- Sudden seasonal shifts: label as ASSUMPTION unless corroborated by repeated windows.
- Missing attribution lineage: exclude from deterministic comparisons and disclose coverage impact.

## Procedure
1. Trigger weekly on schedule or via explicit operator request.
2. Load declared ICP definition and historical unified signals from all skill output tables (read-only).
3. Compute observed behavior profiles (response rates, conversion rates, stage velocity, win outcomes).
4. Compare declared ICP dimensions vs observed outcomes by segment.
5. Classify findings:
   - Deterministic metric deltas (facts)
   - Pattern-derived interpretations labeled `INFERENCE`
   - Contextual extrapolations labeled `ASSUMPTION`
6. Attach confidence scores to all non-deterministic findings.
7. Generate `ICPInsightMetadata` and write report to Supermemory.
8. Persist partial report if coverage is incomplete (`coverage_pct < 100`).
9. Apply retry policy: 3 attempts with exponential backoff (1s, 4s, 16s).
10. Enforce timeout: 10s per external call, 5-minute total cap.

## Data Contract
### Input
```json
{
  "company_id": "uuid",
  "run_mode": "scheduled|operator_on_demand",
  "analysis_window": {
    "start": "ISO-8601",
    "end": "ISO-8601"
  },
  "declared_icp": {
    "firmographics": {},
    "technographics": {},
    "buying_signals": {}
  },
  "unified_signal_tables": ["campaign_events", "deliverability_metrics", "pipeline_events", "reply_analytics"],
  "source_ref": "string"
}
```

### Output
```json
{
  "company_id": "uuid",
  "skill": "icp-validator",
  "skill_version": "1.0.0",
  "idempotency_key": "sha256(company_id+source_ref+window)",
  "coverage_pct": 0,
  "icp_report": {
    "summary": "string",
    "findings": [
      {
        "type": "FACT|INFERENCE|ASSUMPTION",
        "statement": "string",
        "confidence": 0.0,
        "evidence_refs": []
      }
    ],
    "recommended_icp_adjustments": []
  },
  "icpinsight_metadata": {
    "segment_count": 0,
    "metrics_used": [],
    "low_coverage_segments": []
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
- Read-only enforcement: abort any write-intent operations against production source systems.
- On missing baseline ICP, return structured error with remediation request.
- On partial table access, continue with available tables and set `coverage_pct`.
- On transient failures, retry with backoff 1s/4s/16s.

## Templates
### Finding Template
```json
{
  "type": "INFERENCE",
  "statement": "Mid-market fintech firms show faster stage progression than declared enterprise ICP.",
  "confidence": 0.74,
  "evidence_refs": ["campaign_events:2026-W09", "pipeline_events:2026-W09"],
  "version_tag": "1.0.0"
}
```
