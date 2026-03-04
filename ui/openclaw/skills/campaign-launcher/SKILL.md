---
name: campaign-launcher
description: Launches a prepared PlusVibe campaign only after explicit operator command and guardrail checks (health, warmup, DNS, and volume limits), with remediation guidance when checks fail and full audit trace when launched.
metadata:
  author: superwave
  version: "1.0.0"
  category: lifecycle
  risk_level: L3
  core: true
  removable: false
---

# Campaign Launcher

## Purpose
Safely launch paused campaigns with strict pre-flight diagnostics and explicit multi-gate operator confirmation.

This skill generates recommendations only. No external actions are taken without explicit operator approval.

## Use When
- Operator issues an explicit launch command (e.g., "launch").
- Campaign is already built and reviewed in PAUSED state.
- Deliverability/account diagnostics are current and available.

## Don't Use When
- Campaign research and build approvals are incomplete.
- Diagnostics data is stale or missing.
- Campaign is already active/launched.

## Edge Cases
- Health score exactly 80: treat as pass threshold if all other checks pass.
- Warmup active but DNS degraded mid-check: fail launch and return remediation list.
- Volume limits breached for only one sender account: block full launch unless operator opts for reduced sender subset.
- Diagnostics timeout: do not launch; return retry recommendation.

## Procedure
1. Trigger only on explicit operator launch command.
2. Load campaign ID and latest diagnostics (deliverability health, warmup, DNS, volume).
3. Execute pre-launch checks:
   - health score > 80
   - warmup active
   - DNS checks pass
   - send volume within limits
4. If any check fails, return remediation list and stop (no external launch action).
5. **Approval workflow (L3 triple-confirmation):**
   - Gate C1: confirm research artifact was approved.
   - Gate C2: confirm build review was approved.
   - Gate C3: request and receive final explicit launch confirmation from operator.
6. After all gates pass, execute `POST /campaign/launch`.
7. Register launched campaign in campaign-monitor with full audit trail.
8. Persist version tags and runtime metadata; allow partial persistence if ancillary writes fail.
9. Apply retry policy for transient failures (1s, 4s, 16s; max 3 attempts).
10. Enforce timeout limits (10s per external API call, 5-minute total run cap).

## Data Contract
### Input
```json
{
  "company_id": "uuid",
  "campaign_id": "string",
  "operator_command": "launch",
  "diagnostics": {
    "health_score": 0,
    "warmup_active": true,
    "dns_pass": true,
    "volume_limits": {}
  },
  "source_ref": "string"
}
```

### Output
```json
{
  "company_id": "uuid",
  "skill": "campaign-launcher",
  "skill_version": "1.0.0",
  "idempotency_key": "sha256(company_id+source_ref+window)",
  "coverage_pct": 0,
  "launch_decision": {
    "status": "blocked|launched",
    "failed_checks": [],
    "remediation_steps": [],
    "campaign_id": "string"
  },
  "approval_trace": {
    "research_gate": "approved|missing",
    "build_gate": "approved|missing",
    "launch_gate": "approved|missing"
  },
  "campaign_monitor_registration": "written|partial|failed",
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
- Missing explicit launch command: reject with `operator_command_required`.
- Failed guardrails: return `status=blocked` with actionable remediation, no launch call executed.
- Launch API success but monitor registration failure: report `launched` with partial persistence warning.
- Retry transient API failures with exponential backoff (1s, 4s, 16s), max 3 attempts.

## Templates
### Remediation Response
```json
{
  "status": "blocked",
  "failed_checks": ["dns_pass", "volume_limits"],
  "remediation_steps": [
    "Fix SPF/DKIM/DMARC alignment and re-run diagnostics",
    "Reduce per-sender daily cap to approved threshold"
  ],
  "requires_operator_reconfirmation": true,
  "version_tag": "1.0.0"
}
```
