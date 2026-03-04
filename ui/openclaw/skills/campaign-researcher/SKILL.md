---
name: campaign-researcher
description: Produces evidence-backed ICP targeting, offer hypotheses, and sequence draft options when an operator submits an explicit research request. Use before campaign creation to generate strategic direction with confidence-labeled findings and source attribution.
metadata:
  author: superwave
  version: "1.0.0"
  category: lifecycle
  risk_level: L2
  core: true
  removable: false
---

# Campaign Researcher

## Purpose
Generate strategic campaign recommendations (targeting, offer, and sequence options) using company context and historical GTM evidence.

This skill generates recommendations only. No external actions are taken without explicit operator approval.

## Use When
- Operator explicitly requests campaign strategy research.
- Team needs updated ICP and offer direction before campaign assembly.
- Prior campaign outcomes suggest targeting or messaging recalibration.

## Don't Use When
- Operator has not provided explicit research intent.
- Required context data (profile, history, copy analyses) is unavailable.
- You intend to create or modify live campaigns (use campaign-builder after approval).

## Edge Cases
- Sparse historical evidence: produce hypotheses as ASSUMPTION with low confidence.
- Contradictory historical outcomes: provide multiple strategy branches.
- Missing copy analysis: generate constrained recommendations and mark coverage gap.
- Request scope too broad: return segmented recommendation packets.

## Procedure
1. Trigger only after explicit operator research request.
2. Gather inputs: company profile context, ICP learnings, copy analyses, deal patterns.
3. Build evidence map linking each recommendation to source artifacts.
4. Produce outputs:
   - targeting recommendations
   - offer hypotheses
   - sequence draft options
5. Label all non-deterministic statements as `INFERENCE` (or `ASSUMPTION` where extrapolative) and attach confidence scores.
6. Write research document to Supermemory as `{company}-campaign-research`.
7. Present approval summary for operator review.
8. **Approval workflow (L2):**
   - Gate A: operator approves or requests revision of research artifact.
   - Without Gate A approval, no downstream build initiation occurs.
9. Persist partial artifacts with `coverage_pct < 100` if some analyses are missing.
10. Retry policy: 3 attempts with exponential backoff (1s, 4s, 16s); timeout 10s per call, 5-minute cap.

## Data Contract
### Input
```json
{
  "company_id": "uuid",
  "operator_request": {
    "request_id": "string",
    "objective": "string",
    "constraints": {}
  },
  "company_profile_context": "object",
  "historical_icp_learnings": "array",
  "copy_analyses": "array",
  "deal_patterns": "array",
  "source_ref": "string"
}
```

### Output
```json
{
  "company_id": "uuid",
  "skill": "campaign-researcher",
  "skill_version": "1.0.0",
  "idempotency_key": "sha256(company_id+source_ref+window)",
  "coverage_pct": 0,
  "campaign_research_document": {
    "doc_key": "{company}-campaign-research",
    "targeting_recommendations": [],
    "offer_hypotheses": [],
    "sequence_draft_options": [],
    "findings": [
      {
        "label": "FACT|INFERENCE|ASSUMPTION",
        "statement": "string",
        "confidence": 0.0,
        "sources": []
      }
    ]
  },
  "approval_state": "pending_operator_review|approved|revision_requested",
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
- If operator request is missing/implicit, reject with `approval_required` status.
- If required evidence sources are unavailable, return constrained report with coverage markers.
- On Supermemory write failure, store local fallback artifact and emit warning.
- Retry transient failures with 1s, 4s, 16s backoff.

## Templates
### Offer Hypothesis Template
```json
{
  "label": "INFERENCE",
  "hypothesis": "Operational efficiency angle outperforms cost-savings angle for Series B SaaS ops leaders.",
  "confidence": 0.77,
  "sources": ["deal-patterns:Q1", "copy-analysis:thread-12"],
  "version_tag": "1.0.0"
}
```
