# OpenClaw Custom Image Build - ACTION CHECKLIST

## Prerequisites
- [ ] GitHub account
- [ ] Docker installed locally
- [ ] GitHub Personal Access Token with `write:packages` scope

---

## Step 1: Fork (2 minutes)

**Go to:** https://github.com/DavidSuperwave/BSOS

1. Click **"Fork"** (top right)
2. Select your account
3. Wait for fork to complete

---

## Step 2: Clone & Setup (3 minutes)

```bash
cd C:\Users\Kecin\Desktop
git clone https://github.com/YOUR_USERNAME/BSOS.git
cd BSOS
git remote add upstream https://github.com/DavidSuperwave/BSOS
```

---

## Step 3: Find the Model (5 minutes)

```bash
# Search for hardcoded model
grep -r "claude-opus-4-6" packages/ src/ --include="*.ts" --include="*.js"

# Alternative patterns
grep -r "DEFAULT.*MODEL\|defaultModel" packages/ -i
grep -r "agent.*model.*=" packages/gateway/ -i
```

**Expected locations:**
- `packages/gateway/src/config/defaults.ts`
- `packages/gateway/src/agent/agent-manager.ts`
- `packages/core/src/model/model-resolver.ts`

---

## Step 4: Make the Change (2 minutes)

Edit the file(s) found above:

```typescript
// BEFORE:
const DEFAULT_AGENT_MODEL = "anthropic/claude-opus-4-6";

// AFTER:
const DEFAULT_AGENT_MODEL = "kimi-coding/k2p5";
```

**Change ALL occurrences.**

---

## Step 5: Build (10-15 minutes)

```bash
# Build the Docker image
docker build -t ghcr.io/YOUR_USERNAME/openclaw:kimi-v2026.2.17 .

# Tag as latest
docker tag ghcr.io/YOUR_USERNAME/openclaw:kimi-v2026.2.17 ghcr.io/YOUR_USERNAME/openclaw:kimi-latest
```

---

## Step 6: Push (5 minutes)

```bash
# Login to GitHub Container Registry
echo YOUR_GITHUB_TOKEN | docker login ghcr.io -u YOUR_USERNAME --password-stdin

# Push
docker push ghcr.io/YOUR_USERNAME/openclaw:kimi-v2026.2.17
docker push ghcr.io/YOUR_USERNAME/openclaw:kimi-latest
```

---

## Step 7: Update Provisioning (2 minutes)

Edit: `src/app/api/companies/[id]/provision/route.ts`

Change:
```typescript
// Line ~45
const image = "ghcr.io/YOUR_USERNAME/openclaw:kimi-latest";
```

Or update `.env.local`:
```bash
GHCR_IMAGE=ghcr.io/YOUR_USERNAME/openclaw:kimi-latest
```

---

## Step 8: Deploy (5 minutes)

```bash
cd C:\Users\Kecin\Desktop\gtm-engine\ui
node scripts/recreate-containers.js
```

---

## Verification

Check logs show Kimi:
```bash
ssh root@159.65.220.183 "docker logs openclaw-supersauce --tail 5 | grep 'agent model'"
```

Should output: `agent model: kimi-coding/k2p5`

---

## Maintenance (Monthly ~15 min)

When David updates BSOS:

```bash
cd C:\Users\Kecin\Desktop\BSOS

git fetch upstream
git checkout main
git merge upstream/main

# If conflicts, resolve (keep kimi-coding/k2p5)
# Rebuild
docker build -t ghcr.io/YOUR_USERNAME/openclaw:kimi-v$(date +%Y.%m.%d) .
docker push ghcr.io/YOUR_USERNAME/openclaw:kimi-v$(date +%Y.%m.%d)
docker tag ghcr.io/YOUR_USERNAME/openclaw:kimi-v$(date +%Y.%m.%d) ghcr.io/YOUR_USERNAME/openclaw:kimi-latest
docker push ghcr.io/YOUR_USERNAME/openclaw:kimi-latest

# Update containers
cd C:\Users\Kecin\Desktop\gtm-engine\ui
node scripts/rolling-update.js
```

---

## Time Estimate

| Step | Time |
|------|------|
| Fork | 2 min |
| Clone & setup | 3 min |
| Find model | 5 min |
| Make change | 2 min |
| Build | 15 min |
| Push | 5 min |
| Update provisioning | 2 min |
| Deploy | 5 min |
| **Total** | **~40 min** |

---

## Troubleshooting

**Build fails?**
- Check Docker is running
- Check Node/pnpm versions in Dockerfile
- Try `docker build --no-cache`

**Push fails?**
- Verify GitHub token has `write:packages`
- Check token not expired
- Verify repo name matches

**Container fails to start?**
- Check logs: `docker logs container-name`
- Compare config format with original

---

**Ready to start?** Go to https://github.com/DavidSuperwave/BSOS and click Fork!
