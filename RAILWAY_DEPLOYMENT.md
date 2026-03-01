# Railway Deployment Guide

## 🚂 Why Railway?

**Current Setup:**
- ✅ Local machine (your computer)
- ❌ Must keep computer on
- ❌ Cron stops when you sleep
- ❌ No monitoring/alerting
- ❌ Single point of failure

**Railway Deployment:**
- ✅ Runs 24/7 in cloud
- ✅ Auto-restart on crashes
- ✅ Built-in monitoring
- ✅ Environment variables secure
- ✅ Easy scaling
- ✅ Database included
- ✅ ~$5-20/month cost

---

## 📋 Pre-Deployment Checklist

Run the build verification:

```bash
cd automation/gtm-engine
node build-verify.js
```

All tests should pass before deploying.

---

## 🚀 Deployment Steps

### 1. Create Railway Account

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login
```

Or use web: https://railway.app

### 2. Initialize Project

```bash
cd automation/gtm-engine

# Create new project
railway init --name blitzscale-os

# Or link to existing
railway link
```

### 3. Set Environment Variables

```bash
# Add all your API keys
railway variables set PLUSVIBE_API_KEY=your_key
railway variables set CLOSE_API_KEY=your_key
railway variables set TELEGRAM_BOT_TOKEN=your_token
railway variables set TELEGRAM_CHAT_ID=1244663682
railway variables set PERPLEXITY_API_KEY=your_key
railway variables set SUPERMEMORY_API_KEY=your_key
railway variables set CALENDLY_API_KEY=your_key
railway variables set CALENDLY_EVENT_TYPE_UUID=your_uuid
```

Or use Railway dashboard:
1. Go to project → Variables
2. Add each key-value pair

### 4. Create Procfile

```bash
# Create file: automation/gtm-engine/Procfile
echo "worker: node cron-scheduler.js" > Procfile
echo "sync: node data-sync-monitor.js --continuous" >> Procfile
```

### 5. Deploy

```bash
# Deploy to Railway
railway up

# Check status
railway status

# View logs
railway logs
```

---

## 🏗️ Architecture on Railway

```
┌─────────────────────────────────────────────┐
│           Railway Project                   │
│                                             │
│  ┌─────────────────┐  ┌─────────────────┐  │
│  │  Cron Service   │  │  Sync Service   │  │
│  │  (Reply Monitor)│  │  (Data Sync)    │  │
│  │                 │  │                 │  │
│  │  Runs every 30s │  │  Runs every 5min│  │
│  │  for replies    │  │  for campaigns  │  │
│  └────────┬────────┘  └────────┬────────┘  │
│           │                    │           │
│           └────────┬───────────┘           │
│                    │                       │
│           ┌────────▼────────┐              │
│           │   Database      │              │
│           │   (PostgreSQL)  │              │
│           │                 │              │
│           │  • Campaigns    │              │
│           │  • Replies      │              │
│           │  • Metrics      │              │
│           │  • State        │              │
│           └─────────────────┘              │
│                                             │
└─────────────────────────────────────────────┘
```

---

## 📁 Required Files

### railway.json
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "node cron-scheduler.js",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

### nixpacks.toml
```toml
[phases.build]
cmds = ["npm install"]

[phases.setup]
nixPkgs = ["nodejs_20"]

[start]
cmd = "node cron-scheduler.js"
```

### .railwayignore
```
node_modules
.env
.env.example
*.log
build-results.json
integration-health.json
.cron-pid
.sync-state.json
```

---

## 🔧 Services Setup

### Service 1: Reply Monitor (Main)

```yaml
# railway.yml (in repo root)
services:
  reply-monitor:
    build:
      dockerfile: Dockerfile
    deploy:
      startCommand: node cron-scheduler.js
      numReplicas: 1
      healthcheck:
        path: /health
        port: 3001
```

### Service 2: Data Sync

```yaml
  data-sync:
    build:
      dockerfile: Dockerfile
    deploy:
      startCommand: node data-sync-monitor.js --continuous
      numReplicas: 1
```

### Service 3: UI Dashboard

```yaml
  ui:
    build:
      context: ./ui
    deploy:
      startCommand: npm start
      healthcheck:
        path: /
        port: 3000
```

---

## 📊 Monitoring

### Railway Dashboard
- CPU/Memory usage
- Request logs
- Error tracking
- Deployment history

### Telegram Alerts
Already configured - you'll get notifications for:
- New positive replies
- Campaign status changes
- System errors
- Daily reports

### Custom Health Endpoint

Add to `cron-scheduler.js`:
```javascript
const http = require('http');

http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200);
    res.end(JSON.stringify({
      status: 'healthy',
      uptime: process.uptime(),
      lastReplyCheck: lastReplyCheckTime,
      campaignsTracked: Object.keys(campaigns).length
    }));
  }
}).listen(3001);
```

---

## 💰 Cost Estimate

| Component | Cost/Month |
|-----------|-----------|
| Reply Monitor Service | ~$5 |
| Data Sync Service | ~$5 |
| PostgreSQL (1GB) | ~$3 |
| UI Dashboard | ~$5 |
| **Total** | **~$18-25/month** |

Free tier: $5 credit/month (enough for testing)

---

## 🔄 Migration Steps

### Step 1: Backup Local Data

```bash
cd automation/gtm-engine

# Backup state files
cp .campaign-detector-state.json data/backup-campaigns.json
cp .sync-state.json data/backup-sync.json

# Export company configs
cp -r companies data/backup-companies/
```

### Step 2: Deploy to Railway

```bash
# Initialize and deploy
railway init
railway up

# Verify deployment
railway logs
```

### Step 3: Update Telegram Webhook (if needed)

If using Telegram bot webhooks, update the URL to Railway domain.

### Step 4: Test Everything

```bash
# Check integrations on Railway
railway run node integration-health.js

# Verify data sync
railway run node test-plusvibe.js
```

### Step 5: Shutdown Local

Once Railway is confirmed working:
```bash
# Stop local cron
node stop-cron.js

# Archive local instance
mv automation/gtm-engine ~/backups/gtm-engine-local
```

---

## 🆘 Troubleshooting

### Service Won't Start

```bash
# Check logs
railway logs

# Restart
railway restart

# Check environment
railway variables
```

### Database Connection Issues

```bash
# Get connection string
railway variables get DATABASE_URL

# Test connection
railway run node -e "console.log(process.env.DATABASE_URL)"
```

### API Keys Not Working

1. Check Railway variables match local `.env`
2. Verify no extra quotes or spaces
3. Regenerate keys if needed

---

## ✅ Post-Deployment Verification

```bash
# 1. Check all services running
railway status

# 2. Verify integrations
railway run node integration-health.js

# 3. Test data sync
railway run node data-sync-monitor.js

# 4. Check logs for errors
railway logs --follow

# 5. Verify Telegram notifications
railway run node -e "
  const bot = require('./lib/telegram-bot');
  new bot().send('✅ Railway deployment successful!');
"
```

---

## 🎯 My Recommendation

**YES, migrate to Railway.** Here's why:

1. **Current pain:** Cron stops when you close laptop
2. **Railway benefit:** Runs 24/7, never misses a reply
3. **Cost:** ~$20/month for peace of mind
4. **Time saved:** No more "is the monitor running?" checks

**Migration priority:**
1. ✅ Get Calendly API key first (critical for booking intent)
2. ✅ Fix Supermemory API endpoint
3. ✅ Run build verification
4. 🚀 Deploy to Railway
5. ✅ Monitor for 48 hours
6. ✅ Shutdown local

Want me to start the deployment process?
