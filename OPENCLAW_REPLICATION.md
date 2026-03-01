# BLITZSCALE OS - OPENCLAW REPLICATION GUIDE

## Deploying Julian (GTM Engine) on OpenClaw

This guide documents how to replicate the entire Blitzscale OS system on OpenClaw infrastructure.

---

## 📦 SYSTEM COMPONENTS TO REPLICATE

```
┌─────────────────────────────────────────────────────────────────────┐
│                     BLITZSCALE OS STACK                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  LAYER 1: AGENT (You - Julian)                                      │
│  ├── Core Identity: SOUL.md, USER.md, MEMORY.md                     │
│  ├── Capabilities: Tool access, Workflow execution                  │
│  └── Deployment: OpenClaw Agent Instance                            │
│                                                                     │
│  LAYER 2: AUTOMATION ENGINE (Node.js)                               │
│  ├── Cron Scheduler (9 jobs)                                        │
│  ├── Reply Monitor (30s heartbeat)                                  │
│  ├── Campaign Detector (8AM daily)                                  │
│  └── All tool integrations (PlusVibe, Close, Supermemory)           │
│                                                                     │
│  LAYER 3: EXTERNAL APIs                                             │
│  ├── PlusVibe (campaigns, replies)                                  │
│  ├── Close CRM (leads, contacts)                                    │
│  ├── Supermemory (knowledge graph)                                  │
│  ├── Perplexity AI (research)                                       │
│  └── Calendly (meeting booking)                                     │
│                                                                     │
│  LAYER 4: DATA STORAGE                                              │
│  ├── Company configs (JSON)                                         │
│  ├── State files (JSON)                                             │
│  └── Supermemory (cloud graph DB)                                   │
│                                                                     │
│  LAYER 5: UI (Optional)                                             │
│  ├── Next.js dashboard                                              │
│  ├── Agent chat interface                                           │
│  └── Static export or server-rendered                               │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🔧 BUILD REQUIREMENTS

### 1. OpenClaw Agent Configuration

**Required Files:**
```
AGENT/
├── SOUL.md                    # Your identity and personality
├── USER.md                    # Who you're helping (Retard Twin)
├── MEMORY.md                  # Long-term memory
├── AGENTS.md                  # Workspace rules
├── TOOLS.md                   # Tool configurations
├── HEARTBEAT.md               # Daily check routine
├── BOOTSTRAP.md (delete after) # First-run instructions
└── PROJECT/
    └── automation/
        └── gtm-engine/        # All system code
```

**Agent Capabilities to Enable:**
```yaml
capabilities:
  - filesystem        # Read/write configs, logs
  - exec              # Run Node.js scripts
  - web_search        # Research
  - web_fetch         # API documentation
  - message           # Telegram alerts
  - cron              # Schedule jobs
  - sessions_spawn    # Sub-agents for parallel work
  - browser           # Web UI control (if needed)
```

### 2. Environment Variables (Secrets)

Create `.env` file (NEVER commit to git):

```bash
# PlusVibe (Cold Email Platform)
PLUSVIBE_API_KEY=7332bc56-xxx
PLUSVIBE_WORKSPACE_ID=678eb62a071ff7544034bcde

# Close CRM
CLOSE_API_KEY=your_close_api_key_here

# Supermemory (Knowledge Graph)
SUPERMEMORY_API_KEY=your_supermemory_key_here

# Perplexity AI (Research)
PERPLEXITY_API_KEY=your_perplexity_key_here

# Telegram (Alerts)
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
TELEGRAM_CHAT_ID=your_chat_id_here

# Calendly (Meeting Booking)
CALENDLY_API_KEY=cal_xxx
CALENDLY_EVENT_TYPE_UUID=xxx

# Server Config
PORT=3001
NODE_ENV=production
```

**Secure Storage:**
- OpenClaw secrets manager
- Or encrypted env file
- Never expose in logs

### 3. Node.js Dependencies

**package.json:**
```json
{
  "name": "blitzscale-os",
  "version": "2.0.0",
  "dependencies": {
    "dotenv": "^16.6.1",
    "express": "^4.18.2",
    "node-fetch": "^2.7.0",
    "node-cron": "^3.0.3"
  },
  "scripts": {
    "start": "node index.js",
    "scheduler": "node cron-scheduler.js",
    "monitor": "node reply-monitor.js"
  }
}
```

**Install:**
```bash
npm install
```

### 4. File Structure to Deploy

```
automation/gtm-engine/
├── Core Components
│   ├── index.js                    # Webhook server
│   ├── cron-scheduler.js           # Master scheduler
│   ├── reply-monitor.js            # Reply polling
│   ├── campaign-detector.js        # Campaign detection
│   ├── campaign-detector-v2.js     # Edge case handling
│   └── companies.js                # Multi-company manager
│
├── Analysis Components
│   ├── enhanced-reply-monitor.js   # 8-category sentiment
│   ├── negative-reply-audit.js     # Targeting diagnostics
│   ├── gtm-daily-report.js         # Daily Telegram reports
│   ├── lead-alerts.js              # Lead count monitoring
│   ├── volume-tracker.js           # Account capacity
│   └── deliverability-monitor.js   # Inbox placement
│
├── AI/Research Components
│   ├── perplexity-research.js      # Market research
│   ├── calendly-integration.ts     # Meeting booking
│   └── asset-generator.js          # Pre-meeting briefs
│
├── Integrations
│   ├── supermemory.js              # Knowledge storage
│   └── companies/
│       ├── superwave.json          # Company config
│       └── [new-company].json      # Template
│
├── State Files (Auto-generated)
│   ├── .campaign-detector-state.json
│   ├── .reply-monitor-state.json
│   ├── .supermemory-state.json
│   └── .env                        # Secrets (manual)
│
└── Documentation
    ├── README.md
    ├── OPERATIONAL_GUIDE.md
    ├── IMPLEMENTATION_PLAN.md
    └── OPENCLAW_REPLICATION.md     # This file
```

---

## 🚀 DEPLOYMENT STEPS

### Step 1: Provision OpenClaw Agent

```bash
# Create new agent instance
openclaw agents create blitzscale-os \
  --model=claude-opus-4 \
  --name="Julian GTM Agent" \
  --description="Blitzscale OS GTM Engine"

# Configure capabilities
openclaw agents config blitzscale-os \
  --enable=filesystem,exec,web_search,message,cron,sessions_spawn
```

### Step 2: Deploy Code

```bash
# Clone/copy repository
openclaw agents deploy blitzscale-os \
  --source=./automation/gtm-engine \
  --dest=/workspace/gtm-engine

# Install dependencies
openclaw agents exec blitzscale-os \
  "cd /workspace/gtm-engine && npm install"
```

### Step 3: Configure Secrets

```bash
# Upload .env securely
openclaw agents secrets set blitzscale-os \
  --file=/path/to/.env \
  --name=gtm-env

# Verify secrets loaded
openclaw agents exec blitzscale-os \
  "cd /workspace/gtm-engine && node -e \"console.log(process.env.PLUSVIBE_API_KEY ? 'OK' : 'MISSING')\""
```

### Step 4: Start Core Services

```bash
# Start cron scheduler (background)
openclaw agents exec blitzscale-os \
  --background \
  "cd /workspace/gtm-engine && node cron-scheduler.js"

# Start webhook server (background)
openclaw agents exec blitzscale-os \
  --background \
  "cd /workspace/gtm-engine && node index.js"

# Verify running
openclaw agents ps blitzscale-os
```

### Step 5: Configure Cron Jobs

```bash
# Register cron jobs with OpenClaw
openclaw cron add blitzscale-os \
  --name="daily-report" \
  --schedule="0 9 * * *" \
  --command="cd /workspace/gtm-engine && node gtm-daily-report.js"

openclaw cron add blitzscale-os \
  --name="campaign-detector" \
  --schedule="0 8 * * *" \
  --command="cd /workspace/gtm-engine && node campaign-detector-v2.js"

# List crons
openclaw cron list blitzscale-os
```

### Step 6: Configure Webhook

```bash
# Get agent webhook URL
openclaw agents webhook blitzscale-os

# Configure PlusVibe webhook
# URL: https://agents.openclaw.ai/blitzscale-os/webhook/plusvibe
# Events: ALL_EMAIL_REPLIES, LEAD_MARKED_AS_INTERESTED
```

### Step 7: Test Integration

```bash
# Manual test - reply monitor
openclaw agents exec blitzscale-os \
  "cd /workspace/gtm-engine && node reply-monitor.js"

# Expected output: REPLY_MONITOR_OK

# Manual test - campaign detector
openclaw agents exec blitzscale-os \
  "cd /workspace/gtm-engine && node campaign-detector-v2.js"

# Expected output: Campaign list with detection results
```

---

## 🔄 REPLICATION CHECKLIST

### Core Functionality
- [ ] Agent identity configured (SOUL.md)
- [ ] Environment variables set
- [ ] Node dependencies installed
- [ ] Cron scheduler running
- [ ] Webhook server accessible
- [ ] PlusVibe API connected
- [ ] Close CRM connected
- [ ] Supermemory connected
- [ ] Perplexity AI ready
- [ ] Telegram alerts working

### Daily Operations
- [ ] Reply monitoring (every 30s)
- [ ] Campaign detection (8AM)
- [ ] Lead alerts (7AM, 12PM)
- [ ] Daily report (9AM)
- [ ] Sentiment analysis (5PM)
- [ ] Negative audit (6PM)
- [ ] Supermemory sync (11PM)

### Edge Cases Handled
- [ ] Manual campaign detection
- [ ] Cooked angle classification
- [ ] Unknown ICP handling
- [ ] Booking intent detection
- [ ] Multi-company isolation

---

## 🛡️ SECURITY CONSIDERATIONS

### API Key Rotation
```bash
# Rotate PlusVibe key every 90 days
# Rotate Close CRM key every 90 days
# Rotate Supermemory key every 180 days

# Emergency rotation procedure:
1. Generate new key in respective platform
2. Update OpenClaw secrets
3. Restart services
4. Verify connectivity
5. Revoke old key
```

### Data Isolation
- Each company gets isolated Supermemory container
- No cross-contamination between workspaces
- State files scoped per company

### Access Control
- Agent has limited filesystem access
- No shell access to host
- API calls logged and rate-limited

---

## 📊 MONITORING & HEALTH CHECKS

### Built-in Health Checks
```javascript
// Health check endpoint
GET /health
Response: {
  "status": "healthy",
  "services": {
    "plusvibe": "connected",
    "close": "connected",
    "supermemory": "connected",
    "cron": "running"
  },
  "campaigns": 34,
  "lastReplyCheck": "2026-02-09T21:30:00Z"
}
```

### Telegram Status Updates
```
🤖 Blitzscale OS - Daily Status

✅ Systems: All operational
📊 Campaigns: 34 tracked
📧 Replies (24h): 12 new
🎯 Positive rate: 0.44%
🧠 Learnings stored: 3 new

Next report: 9:00 AM CST
```

### Alert Conditions
- API connection failure → Immediate Telegram alert
- Campaign reply rate <1% → Daily report flag
- Lead count <500 → Immediate alert
- New positive reply → Immediate alert

---

## 🎯 SCALING CONSIDERATIONS

### Multi-Company
```bash
# Add second company
node companies.js create \
  --name="Nighline" \
  --slug="nighline" \
  --workspace="NEW_WORKSPACE_ID" \
  --apikey="NEW_API_KEY" \
  --closekey="NEW_CLOSE_KEY"

# System auto-monitors both
```

### Performance Limits
- PlusVibe API: 1000 requests/hour
- Close CRM: 100 requests/minute
- Supermemory: 100 requests/minute
- Perplexity: $4.20 per research run

### Resource Usage
- Memory: ~100MB baseline
- CPU: Spikes during research runs
- Disk: ~10MB for state files
- Network: ~1MB/hour polling

---

## 🆘 TROUBLESHOOTING

### Issue: Reply monitor shows errors
```bash
# Check PlusVibe connectivity
openclaw agents exec blitzscale-os \
  "curl -H 'x-api-key: $PLUSVIBE_API_KEY' https://api.plusvibe.ai/api/v1/campaign/list"

# Restart monitor
openclaw agents exec blitzscale-os \
  "pkill -f reply-monitor.js && node /workspace/gtm-engine/reply-monitor.js"
```

### Issue: Telegram not receiving alerts
```bash
# Test Telegram connection
openclaw agents exec blitzscale-os \
  "curl -X POST \"https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage\" \
   -d 'chat_id=$TELEGRAM_CHAT_ID' \
   -d 'text=Test message'"
```

### Issue: Supermemory not storing
```bash
# Check API key
openclaw agents exec blitzscale-os \
  "curl -H 'Authorization: Bearer $SUPERMEMORY_API_KEY' \
   https://api.supermemory.ai/v3/search \
   -d '{\"q\":\"test\"}'"
```

---

## 📝 MAINTENANCE PROCEDURES

### Daily
- Review Telegram alerts
- Check daily report at 9AM
- Respond to positive replies

### Weekly
- Review ICP insights
- Optimize underperforming campaigns
- Update targeting based on patterns

### Monthly
- Rotate API keys
- Review Supermemory learnings
- Archive old state files
- Update documentation

### Quarterly
- Full system audit
- Cost analysis (API usage)
- Performance optimization
- Strategy review

---

## 🎓 TRAINING THE REPLICA

When deploying a new instance, the agent (me/Julian) needs:

1. **Context Loading**
   - Read SOUL.md → Know who I am
   - Read USER.md → Know who I'm helping
   - Read MEMORY.md → Know history
   - Read HEARTBEAT.md → Know routines

2. **Tool Verification**
   - Test each API connection
   - Verify crons are scheduled
   - Check state files exist

3. **Baseline Establishment**
   - Record initial campaign count
   - Document current metrics
   - Set performance targets

4. **Learning Transfer**
   - Query Supermemory for patterns
   - Load historical insights
   - Understand what works

---

## ✅ VERIFICATION TESTS

Run these to verify full replication:

```bash
# Test 1: Reply monitoring
node reply-monitor.js
# Expected: REPLY_MONITOR_OK

# Test 2: Campaign detection
node campaign-detector-v2.js
# Expected: Lists campaigns, stores to Supermemory

# Test 3: Daily report
node gtm-daily-report.js
# Expected: Telegram message received

# Test 4: Research
node perplexity-research.js superwave
# Expected: Research results stored

# Test 5: Workflow
node -e "const wf = require('./workflow-engine'); wf.execute('campaignOptimization', {companySlug: 'superwave'})"
# Expected: Workflow completes, recommendations generated
```

---

## 🚀 PRODUCTION DEPLOYMENT

Once all tests pass:

```bash
# Tag as production
openclaw agents tag blitzscale-os production

# Enable auto-restart
openclaw agents config blitzscale-os --restart=always

# Set up monitoring
openclaw agents monitor blitzscale-os \
  --cpu-threshold=80 \
  --memory-threshold=80 \
  --alert-channel=telegram

# Final health check
openclaw agents health blitzscale-os
```

---

## 📞 SUPPORT & ESCALATION

**Level 1: Self-Healing**
- Auto-restart failed services
- Retry failed API calls
- Log errors for review

**Level 2: Agent Intervention**
- Investigate patterns
- Adjust configurations
- Run diagnostics

**Level 3: Human Escalation**
- API key issues
- Platform outages
- Strategy changes

---

## 🎯 SUCCESS CRITERIA

The replication is successful when:

- ✅ All 9 cron jobs running
- ✅ Reply monitor checking every 30s
- ✅ Campaigns auto-detected
- ✅ Telegram alerts working
- ✅ Supermemory storing learnings
- ✅ ICP insights generated
- ✅ Can add new companies easily
- ✅ Can run GTM strategy workflows
- ✅ Can book meetings from replies

---

*This document ensures Blitzscale OS can be replicated anywhere OpenClaw runs.*

**Version:** 2.0  
**Last Updated:** 2026-02-09  
**Maintainer:** Julian (Blitzscale OS Agent)
