# GTM Engine - Production Deployment Checklist

## Pre-Deployment

### 1. Security Review ⏳ URGENT

- [ ] **Rotate ALL exposed API keys** (see .env.local)
  - [ ] PlusVibe API key
  - [ ] Close CRM API key  
  - [ ] Perplexity API key
  - [ ] Supermemory API key
  - [ ] Inboxing API key
  - [ ] Telegram bot token
  - [ ] Supabase service role key

- [ ] **Add .env.local to .gitignore**
```bash
echo ".env.local" >> .gitignore
git rm --cached .env.local 2>/dev/null || true
```

- [ ] **Verify no keys in git history**
```bash
git log --all --full-history -- .env.local
git log -p | grep -i "api_key\|token\|secret" | head -20
```

### 2. Database Setup

- [ ] **Run migration**
```bash
# Option 1: Supabase CLI
supabase db push

# Option 2: Direct SQL
psql $DATABASE_URL -f supabase/migrations/20250217_multi_tenant_agents.sql
```

- [ ] **Verify tables created**
```sql
\dt
-- Should see: company_agents, chat_sessions, chat_messages, company_integrations, etc.
```

- [ ] **Enable RLS policies**
```sql
-- Should already be in migration, but verify:
SELECT * FROM pg_policies WHERE schemaname = 'public';
```

### 3. OpenClaw Configuration

- [ ] **Create openclaw.json**
```bash
mkdir -p openclaw
cat > openclaw/openclaw.json << 'EOF'
{
  "gateway": {
    "http": {
      "endpoints": {
        "chatCompletions": { "enabled": true }
      }
    },
    "auth": {
      "mode": "token",
      "token": "${OPENCLAW_GATEWAY_TOKEN}"
    }
  }
}
EOF
```

- [ ] **Generate secure gateway token**
```bash
openssl rand -hex 32
# Save this as OPENCLAW_GATEWAY_TOKEN in .env
```

### 4. Environment Variables

Copy this to Railway / production:

```bash
# REQUIRED - App won't start without these
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENCLAW_URL=http://openclaw:18789  # Or Railway internal URL
OPENCLAW_GATEWAY_TOKEN=
SUPERMEMORY_API_KEY=

# REQUIRED FOR FEATURES
PLUSVIBE_API_KEY=          # Campaigns won't work
PLUSVIBE_WORKSPACE_ID=
CLOSE_API_KEY=             # CRM import won't work
CALENDLY_API_KEY=          # Scheduling won't work
PERPLEXITY_API_KEY=        # Research won't work
INBOXING_API_KEY=          # Domain mgmt won't work

# OPTIONAL
NEXT_PUBLIC_SENTRY_DSN=    # Error tracking
SENTRY_ORG=
SENTRY_PROJECT=
SENTRY_AUTH_TOKEN=
```

## Deployment Steps

### Option A: Railway (Recommended)

1. **Install Railway CLI**
```bash
npm i -g @railway/cli
railway login
```

2. **Initialize project**
```bash
cd C:\Users\Kecin\Desktop\gtm-engine\ui
railway init
# Select "Empty Project"
```

3. **Add environment variables**
```bash
# Set all required vars
railway variables set NEXT_PUBLIC_SUPABASE_URL="..."
railway variables set NEXT_PUBLIC_SUPABASE_ANON_KEY="..."
# ... etc for all vars
```

4. **Deploy**
```bash
railway up
```

5. **Add OpenClaw service**
```bash
# In Railway dashboard:
# 1. Click "New"
# 2. Select "Add Redis" (skip, we don't need)
# 3. Click "New" → "Add Service" → "Docker Image"
# 4. Image: ghcr.io/openclaw/gateway:latest
# 5. Add env vars:
#    - OPENCLAW_GATEWAY_TOKEN
#    - SUPERMEMORY_API_KEY
# 6. Volume: openclaw-data:/data
```

6. **Update OPENCLAW_URL**
```bash
# Get internal URL from Railway dashboard
# It will be something like: http://openclaw.railway.internal:18789
railway variables set OPENCLAW_URL="..."
```

### Option B: Docker Compose

1. **Prepare environment**
```bash
cp .env.example .env
# Edit .env with real values
```

2. **Build and run**
```bash
docker-compose up -d --build
```

3. **Verify**
```bash
docker-compose ps
docker-compose logs -f nextjs
curl http://localhost:3000/api/health
```

## Post-Deployment Verification

### 1. Health Checks

```bash
# Check API health
curl https://your-app.railway.app/api/health

# Should return:
# { "status": "ok", "openclaw": "...", "supabase": "..." }
```

### 2. Test Agent Provisioning

```bash
# Create a test company first, then:
curl -X POST https://your-app.railway.app/api/companies/{company-id}/agents/provision \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {user-token}" \
  -d '{
    "agentTypes": ["main", "campaigns"],
    "companyData": { "name": "Test Corp", "industry": "SaaS" }
  }'
```

### 3. Test Chat Streaming

```bash
# Test SSE endpoint
curl -N https://your-app.railway.app/api/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {token}" \
  -d '{
    "message": "Hello",
    "companyId": "{company-id}",
    "sessionType": "main",
    "stream": true
  }'

# Should stream: data: {...} lines
```

### 4. Test Component Chat

1. Open campaigns page
2. Click "Chat about these campaigns"
3. Ask: "Which campaign has the best reply rate?"
4. Verify:
   - Response is streaming
   - Agent only sees campaign data
   - Can suggest table actions

## Monitoring

### Logs

```bash
# Railway
railway logs

# Docker
docker-compose logs -f
```

### Health Dashboard

Visit `/api/settings/status` to check:
- ✅ Supabase connection
- ✅ OpenClaw connection
- ✅ PlusVibe connection
- ✅ Close CRM connection
- ✅ Supermemory connection

### Sentry (Optional)

If configured, errors automatically tracked at:
https://sentry.io/organizations/{your-org}/projects/{project}/

## Rollback Plan

If deployment fails:

1. **Check logs**
```bash
railway logs --tail 100
```

2. **Revert to previous deployment**
```bash
# In Railway dashboard, click previous deployment → "Redeploy"
```

3. **Emergency: local dev**
```bash
npm run dev
```

## Cost Estimation

| Service | Monthly Cost |
|---------|-------------|
| Railway (Next.js + OpenClaw) | $5-10 |
| Supabase (Free tier) | $0 |
| Supermemory (Free tier) | $0 |
| Domain (optional) | $10-15/year |
| **Total** | **~$5-10/month** |

## Support Contacts

- **Railway:** https://railway.app/help
- **Supabase:** https://supabase.com/support
- **OpenClaw:** https://docs.openclaw.ai

---

## Post-Launch Checklist

Day 1:
- [ ] Monitor error rates
- [ ] Test all integrations
- [ ] Verify agent provisioning works

Week 1:
- [ ] Import existing PlusVibe data
- [ ] Sync Close CRM contacts
- [ ] Train users on new chat system

Month 1:
- [ ] Review Supermemory usage
- [ ] Optimize slow queries
- [ ] Add monitoring alerts

---

**Deploy Date:** ___________  
**Deployed By:** ___________  
**Status:** ☐ Not Started / ☐ In Progress / ☐ Complete
