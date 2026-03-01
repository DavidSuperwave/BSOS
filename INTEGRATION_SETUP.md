# Blitzscale OS - Integration Setup Guide

## Current Status (as of 2026-02-09)

| Integration | Status | API Key | Notes |
|-------------|--------|---------|-------|
| **PlusVibe** | 🔴 Needs Fix | `7332bc56-e2769fd4-9f1a00b6-ebb7ce28` | Network error - check endpoint |
| **Close CRM** | 🟢 Working | `api_0HdbdhMSeluyXFS5vtZqoG...` | Connected as admin@superwave.io |
| **Supermemory** | 🔴 Needs Fix | `sm_NWuMr3D3Gu...` | HTTP 404 - check API version |
| **Perplexity** | 🟢 Working | `pplx-cotRQiy9jWN...` | Research API ready |
| **Calendly** | 🟡 Placeholder | `cal_xxx` | **NEEDS REAL API KEY** |
| **Telegram** | 🟢 Working | Configured | Chat ID: 1244663682 |
| **Cron Scheduler** | 🔴 Stopped | N/A | Needs restart |

---

## Quick Fix Commands

```bash
# 1. Check current status
cd automation/gtm-engine
node integration-health.js

# 2. Start the cron scheduler
node cron-scheduler.js

# 3. Run data sync manually
node data-sync-monitor.js

# 4. Start continuous monitoring
node data-sync-monitor.js --continuous
```

---

## Required API Keys

### 1. PlusVibe (Campaign Data)

**Current:** ✅ Working (key present)
**Issue:** Network fetch failed

**Fix:**
- Verify workspace ID: `678eb62a071ff7544034bcde`
- Check API endpoint in code
- Test with curl:
```bash
curl -H "Authorization: Bearer 7332bc56-e2769fd4-9f1a00b6-ebb7ce28" \
  https://api.plusvibe.com/v1/workspaces/678eb62a071ff7544034bcde/campaigns
```

### 2. Close CRM (Lead Management)

**Current:** ✅ Working
**Key:** `api_0HdbdhMSeluyXFS5vtZqoG.3rpXMwHXC84v547rzntLmD`

**Status:** Connected as admin@superwave.io

### 3. Supermemory (AI Memory)

**Current:** 🔴 HTTP 404 Error
**Key:** `sm_NWuMr3D3Gu63agXVhfPmtj_KzDhRZqEROGzEQOmgwqHxaOJZwstMeThTGkicnDiKlCqZsmueuTkICIYDNblhNgp`

**Fix:**
- Verify API endpoint: `https://api.supermemory.ai/v1/`
- Check if key is still valid
- Contact Supermemory support if needed

### 4. Perplexity (Research)

**Current:** ✅ Working
**Key:** `your_perplexity_key_here`

### 5. Calendly (Booking) ⚠️ CRITICAL

**Current:** 🔴 Placeholder Key
**Key:** `cal_xxx` (NOT REAL)

**Action Required:**
1. Go to https://calendly.com/integrations/api_webhooks
2. Generate personal access token
3. Get event type UUID from your booking link
4. Update `.env` file:

```bash
CALENDLY_API_KEY=cal_live_xxxxxxxxxxxx
CALENDLY_EVENT_TYPE_UUID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CALENDLY_WEBHOOK_SIGNING_KEY=xxxxxxxxxxxxxxxx
```

### 6. Telegram (Notifications)

**Current:** ✅ Working
**Bot Token:** Configured
**Chat ID:** 1244663682

---

## How Data Flows

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   PlusVibe  │────▶│   Campaign  │────▶│ Supermemory │
│  (Sending)  │     │   Detector  │     │  (Memory)   │
└─────────────┘     └─────────────┘     └─────────────┘
       │                                    │
       │              ┌─────────────┐       │
       └─────────────▶│  Reply      │◀──────┘
                      │  Monitor    │
                      └─────────────┘
                             │
                             ▼
                      ┌─────────────┐
                      │  Close CRM  │
                      │  (Leads)    │
                      └─────────────┘
                             │
                             ▼
                      ┌─────────────┐
                      │  Telegram   │
                      │ (Alerts)    │
                      └─────────────┘
```

---

## Setting Up Continuous Data Sync

### Option 1: Cron Scheduler (Recommended)

```bash
# Start the scheduler
node cron-scheduler.js

# It will auto-run every 30s (replies) and daily (reports)
```

### Option 2: Continuous Sync Mode

```bash
# Run sync every 5 minutes continuously
node data-sync-monitor.js --continuous
```

### Option 3: Manual Trigger

```bash
# Run once
node data-sync-monitor.js
```

---

## What Data Gets Captured

### Campaign Metrics (Every 5 min)
- Sent count
- Delivered count  
- Reply count
- Open count
- Bounce count
- Status changes

### Replies (Every 30 sec)
- New replies detected
- Sentiment analysis (positive/negative)
- Lead creation in Close CRM
- Telegram alerts

### Alerts Sent
- Reply rate drops below 2%
- Campaign paused/activated
- New positive reply
- Booking intent detected
- Lead count < 500

---

## Troubleshooting

### "fetch failed" for PlusVibe
```bash
# Test connectivity
curl -I https://api.plusvibe.com

# Check if API key is valid
curl -H "Authorization: Bearer YOUR_KEY" \
  https://api.plusvibe.com/v1/workspaces/YOUR_WORKSPACE/campaigns
```

### "HTTP 404" for Supermemory
```bash
# Check API endpoint
curl -H "Authorization: Bearer YOUR_KEY" \
  https://api.supermemory.ai/v1/documents

# If 404, endpoint may have changed - check docs
```

### Cron not running
```bash
# Check for PID file
ls .cron-pid

# Kill old process if stuck
taskkill /F /IM node.exe  # Windows
pkill -f cron-scheduler    # Mac/Linux

# Restart
node cron-scheduler.js
```

---

## Testing All Integrations

```bash
# 1. Health check
node integration-health.js

# 2. Test PlusVibe connection
node test-plusvibe.js

# 3. Test Supermemory
node test-supermemory-v2.js

# 4. Full data sync test
node data-sync-monitor.js
```

---

## Next Steps to Get Fully Operational

1. **Fix PlusVibe** - Verify API endpoint/workspace ID
2. **Fix Supermemory** - Check API endpoint/validate key
3. **Get Calendly API key** - Critical for booking detection
4. **Start Cron Scheduler** - Run `node cron-scheduler.js`
5. **Enable Continuous Sync** - Run `node data-sync-monitor.js --continuous`

Once all are green (✅), the system will:
- ✅ Auto-detect all campaign changes
- ✅ Capture every reply in real-time
- ✅ Create leads in Close CRM
- ✅ Store context in Supermemory
- ✅ Send you Telegram alerts
- ✅ Detect booking intent from replies
