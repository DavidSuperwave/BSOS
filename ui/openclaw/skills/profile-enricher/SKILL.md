---
name: profile-enricher
description: Continuously updates the master company profile after each completed skill transaction by merging latest evidence across skill outputs and memory containers with confidence-aware versioned updates. Use for maintaining a current, explainable company context.
metadata:
  author: superwave
  version: "1.0.0"
  category: daily
  risk_level: L1
  core: true
  removable: false
---

# Profile Enricher

## Purpose
Maintain an always-current company master profile by applying evidence-weighted merges with traceable version history and confidence metadata.

This skill generates recommendations only. No external actions are taken without explicit operator approval.

## Use When
- Any skill transaction has completed and new evidence is available.
- Downstream planning requires updated company context.
- Historical profile drift must be controlled with version tracking.

## Don't Use When
- Upstream transaction failed and produced no trustworthy outputs.
- There is no company identity mapping for profile targets.
- You need manual profile editing without evidence lineage.

## Edge Cases
- Conflicting evidence with similar confidence: retain prior value and append conflict note.
- High-confidence new evidence contradicts old low-confidence value: supersede and version bump.
- Missing source provenance: do not merge; flag warning.
- Simultaneous transactions: serialize by company_id and transaction timestamp.

## Procedure
1. Trigger automatically after each completed skill transaction.
2. Read latest outputs across skill tables and Supermemory containers.
3. Extract candidate profile mutations with provenance and timestamps.
4. Apply evidence-weighted merge policy:
   - prioritize recency and confidence
   - preserve immutable identity anchors
   - append lineage for every changed field
5. Label non-deterministic field inferences as `INFERENCE` with confidence score.
6. Write updated profile to Supermemory `company_context` and Supabase `company_profiles`.
7. Increment profile version and include diff summary.
8. Persist partial updates with `coverage_pct < 100` when some sources are unavailable.
9. Retry transient failures up to 3 attempts (1s, 4s, 16s).
10. Enforce timeout: 10s per external API call, 5-minute max execution.

## Data Contract
### Input
```json
{
  "company_id": "uuid",
  "transaction_ref": "string",
  "latest_skill_outputs": ["array"],
  "memory_containers": ["array"],
  "source_ref": "string"
}
```

### Output
```json
{
  "company_id": "uuid",
  "skill": "profile-enricher",
  "skill_version": "1.0.0",
  "idempotency_key": "sha256(company_id+source_ref+window)",
  "coverage_pct": 0,
  "profile_update": {
    "profile_version": "string",
    "changed_fields": [
      {
        "field": "string",
        "old_value": "any",
        "new_value": "any",
        "type": "FACT|INFERENCE",
        "confidence": 0.0,
        "evidence_refs": []
      }
    ],
    "diff_summary": "string"
  },
  "targets": {
    "supermemory_company_context": "updated|partial|failed",
    "supabase_company_profiles": "updated|partial|failed"
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
- On write conflict, refetch latest profile version and re-apply merge once.
- On provenance gaps, skip affected fields and continue with valid subset.
- On target partial outage, persist to available target and queue reconciliation marker.
- Retry transient failures with backoff sequence 1s, 4s, 16s.

## Templates
### Field Mutation Template
```json
{
  "field": "primary_offer",
  "old_value": "Outbound SDR as a service",
  "new_value": "AI-assisted outbound system",
  "type": "INFERENCE",
  "confidence": 0.72,
  "evidence_refs": ["campaign-research:2026-03-03", "intelligence-report:2026-03-03"],
  "version_tag": "1.0.0"
}
```
