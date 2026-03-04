---
name: campaign-builder
description: Assembles a PlusVibe campaign from an operator-approved research artifact by creating the campaign, configuring sequence settings, and uploading leads while enforcing Superwave defaults. Use only after explicit operator approval of strategy.
metadata:
  author: superwave
  version: "1.0.0"
  category: lifecycle
  risk_level: L3
  core: true
  removable: false
---

# Campaign Builder

## Purpose
Translate approved strategy into a fully configured PlusVibe campaign in PAUSED state for operator review.

This skill generates recommendations only. No external actions are taken without explicit operator approval.

## Use When
- Operator has approved the campaign-research artifact.
- Campaign build parameters are complete and validated.
- Team is ready to prepare (not launch) outbound assets in PlusVibe.

## Don't Use When
- Research artifact approval is missing.
- Required API credentials are unavailable in Supabase `companies` table.
- Operator intends immediate launch without build review.

## Edge Cases
- Partial lead upload success: keep campaign paused and return failed lead subset.
- Sequence patch fails after campaign creation: preserve created campaign and return remediation steps.
- Duplicate build request for same window: idempotency key returns existing campaign record.
- Invalid personalization tokens in sequence drafts: block patch and report validation errors.

## Procedure
1. Trigger only after operator approves research artifact (Gate A complete).
2. Retrieve per-company API credentials from Supabase `companies` table (never from env vars).
3. Validate required build payload and Superwave send defaults.
4. **Approval workflow (L3):**
   - Gate B1: present build plan preview (campaign name, sequence summary, lead counts).
   - Gate B2: require explicit operator confirmation to execute external write operations.
5. Execute PlusVibe API writes after Gate B2 confirmation:
   - `POST /campaign/add/campaign`
   - `PATCH /campaign/update/campaign`
   - `POST /lead/add`
6. Force resulting campaign state to `PAUSED`.
7. Generate build summary (created IDs, counts, warnings, unresolved issues).
8. Persist run metadata, version tags, and audit trail.
9. Store partial outputs when completion is below full coverage (`coverage_pct < 100`).
10. Apply retry policy (3 attempts: 1s, 4s, 16s) and timeout limits (10s/call, 5-minute cap).

## Data Contract
### Input
```json
{
  "company_id": "uuid",
  "approved_research_payload": "object",
  "campaign_build_params": {
    "campaign_name": "string",
    "sender_accounts": [],
    "daily_limits": {},
    "lead_batch": []
  },
  "source_ref": "string"
}
```

### Output
```json
{
  "company_id": "uuid",
  "skill": "campaign-builder",
  "skill_version": "1.0.0",
  "idempotency_key": "sha256(company_id+source_ref+window)",
  "coverage_pct": 0,
  "campaign_build_result": {
    "campaign_id": "string",
    "state": "PAUSED",
    "sequence_configured": true,
    "leads_uploaded": 0,
    "failed_leads": [],
    "warnings": []
  },
  "approval_trace": {
    "research_gate": "approved",
    "build_plan_gate": "approved",
    "external_write_gate": "approved"
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
- Missing approvals: hard-stop with `operator_approval_required`.
- API credential lookup failure in Supabase `companies`: abort without external writes.
- If campaign create succeeds but patch/upload fail, return partial build summary and remediation checklist.
- Retry transient errors up to 3 attempts with exponential backoff (1s, 4s, 16s).

## Templates
### Build Review Summary
```json
{
  "campaign_id": "{{campaign_id}}",
  "state": "PAUSED",
  "sequence_steps": {{sequence_steps}},
  "leads_uploaded": {{leads_uploaded}},
  "failed_leads": {{failed_count}},
  "next_required_action": "Operator reviews and approves launch decision",
  "version_tag": "1.0.0"
}
```
