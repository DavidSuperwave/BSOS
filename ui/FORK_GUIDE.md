# OpenClaw Custom Image - Fork & Build Guide

## Step 1: Fork the Repository

The OpenClaw source is based on `@mariozechner/pi-coding-agent`. 

### Option A: Fork from upstream (if public)
```bash
# Go to https://github.com/mariozechner/pi-coding-agent
# Click "Fork" → Create fork under your account
```

### Option B: Fork from David's version (if different)
If David has a custom fork, fork that instead:
```bash
# Go to https://github.com/davidsuperwave/pi-coding-agent
# Click "Fork" → Create fork
```

## Step 2: Clone Your Fork Locally

```bash
git clone https://github.com/YOUR_USERNAME/pi-coding-agent.git
cd pi-coding-agent
git remote add upstream https://github.com/ORIGINAL_OWNER/pi-coding-agent.git
```

## Step 3: Find & Change the Model

Based on our investigation, the hardcoded model is in:

```
packages/gateway/src/agent/agent-manager.ts
packages/gateway/src/config/defaults.ts
packages/core/src/model/model-resolver.ts
```

### Search for the model:
```bash
grep -r "claude-opus-4-6" packages/
grep -r "anthropic/claude-opus" packages/
grep -r "DEFAULT_AGENT_MODEL" packages/
grep -r "defaultModel" packages/gateway/
```

### Likely location and change:
```typescript
// File: packages/gateway/src/agent/agent-manager.ts (or similar)

// BEFORE:
const DEFAULT_AGENT_MODEL = "anthropic/claude-opus-4-6";
// or
this.defaultModel = "anthropic/claude-opus-4-6";

// AFTER:
const DEFAULT_AGENT_MODEL = "kimi-coding/k2p5";
// or
this.defaultModel = "kimi-coding/k2p5";
```

## Step 4: Build Docker Image

### Build locally:
```bash
docker build -t ghcr.io/YOUR_USERNAME/openclaw:kimi-v2026.2.17 .
```

### Push to GitHub Container Registry:
```bash
# Login to GHCR
echo $GITHUB_TOKEN | docker login ghcr.io -u YOUR_USERNAME --password-stdin

# Push
docker push ghcr.io/YOUR_USERNAME/openclaw:kimi-v2026.2.17
docker push ghcr.io/YOUR_USERNAME/openclaw:kimi-latest
```

## Step 5: Update Provisioning

In `src/app/api/companies/[id]/provision/route.ts`:

```typescript
// Change this:
const IMAGE = envConfig.provisioner.ghcrImage(); // uses env var

// To this:
const IMAGE = "ghcr.io/YOUR_USERNAME/openclaw:kimi-latest";
```

Or update your `.env.local`:
```bash
GHCR_IMAGE=ghcr.io/YOUR_USERNAME/openclaw:kimi-latest
```

## Step 6: Redeploy Containers

```bash
cd C:\Users\Kecin\Desktop\gtm-engine\ui
node scripts/recreate-containers.js
```

## Maintenance Workflow (Ongoing)

When OpenClaw releases updates:

```bash
# 1. Fetch upstream changes
cd pi-coding-agent
git fetch upstream
git checkout main
git merge upstream/main

# 2. Resolve conflicts if any
# If the model line changed, ensure it stays as "kimi-coding/k2p5"

# 3. Rebuild and push
docker build -t ghcr.io/YOUR_USERNAME/openclaw:kimi-v$(date +%Y.%m.%d) .
docker push ghcr.io/YOUR_USERNAME/openclaw:kimi-v$(date +%Y.%m.%d)
docker tag ghcr.io/YOUR_USERNAME/openclaw:kimi-v$(date +%Y.%m.%d) ghcr.io/YOUR_USERNAME/openclaw:kimi-latest
docker push ghcr.io/YOUR_USERNAME/openclaw:kimi-latest

# 4. Update running containers
node scripts/rolling-update.js
```

## Files to Modify

1. **Model configuration** (find exact file):
   - `packages/gateway/src/agent/agent-manager.ts`
   - `packages/gateway/src/config/defaults.ts`
   - `packages/core/src/model/model-resolver.ts`

2. **Dockerfile** (if needed):
   - Ensure it builds correctly

3. **Provisioning** (in your UI repo):
   - `src/app/api/companies/[id]/provision/route.ts`
   - Update image reference

## Testing Checklist

- [ ] Fork created
- [ ] Model changed to `kimi-coding/k2p5`
- [ ] Docker image builds successfully
- [ ] Image pushed to GHCR
- [ ] Provisioning updated
- [ ] Container redeployed
- [ ] Chat tested with Kimi
- [ ] Logs show `agent model: kimi-coding/k2p5`

## Troubleshooting

**Image fails to build?**
- Check Node version in Dockerfile
- Check pnpm/npm version
- Look for missing dependencies

**Container fails to start?**
- Check logs: `docker logs container-name`
- Verify config format matches image expectations

**Model not changing?**
- Double-check you found ALL occurrences
- Some may be in compiled/bundled code
- May need to rebuild from scratch

## Next Steps

1. **Identify the exact repo URL** (is it davidsuperwave's fork or upstream?)
2. **Create the fork**
3. **Find the exact file with hardcoded model**
4. **Make the change**
5. **Build and push**
6. **Test**
