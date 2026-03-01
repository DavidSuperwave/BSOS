const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

console.log("🍴 OpenClaw Fork & Customization Script\n");

const GITHUB_USERNAME = process.env.GITHUB_USERNAME || "YOUR_USERNAME";
const FORK_REPO = `https://github.com/${GITHUB_USERNAME}/BSOS`;
const UPSTREAM_REPO = "https://github.com/DavidSuperwave/BSOS";

console.log(`This script will help you:\n`);
console.log(`1. Fork ${UPSTREAM_REPO} to your account`);
console.log(`2. Clone it locally`);
console.log(`3. Find and change the hardcoded model`);
console.log(`4. Build and push custom image\n`);

console.log("=".repeat(60));
console.log("STEP-BY-STEP INSTRUCTIONS");
console.log("=".repeat(60));

console.log(`

## STEP 1: Fork the Repository

1. Go to: ${UPSTREAM_REPO}
2. Click the "Fork" button (top right)
3. Select your GitHub account
4. Wait for the fork to be created

## STEP 2: Clone Your Fork Locally

Open a terminal (PowerShell/Git Bash) and run:

\`\`\`bash
cd C:\\Users\\Kecin\\Desktop
git clone https://github.com/${GITHUB_USERNAME}/BSOS.git
cd BSOS

# Add upstream remote
git remote add upstream ${UPSTREAM_REPO}
git fetch upstream
\`\`\`

## STEP 3: Find the Hardcoded Model

In the BSOS directory, search for the model:

\`\`\`bash
# Search for the hardcoded model
grep -r "claude-opus-4-6" packages/ src/ --include="*.ts" --include="*.js"

# Also search for default model patterns
grep -r "DEFAULT.*MODEL\|defaultModel\|default.*agent.*model" packages/ src/ -i
\`\`\`

**Likely locations:**
- \`packages/gateway/src/agent/agent-manager.ts\`
- \`packages/gateway/src/config/defaults.ts\`
- \`packages/core/src/model/model-resolver.ts\`

## STEP 4: Make the Change

Edit the file(s) found above. Change:

\`\`\`typescript
// FROM:
const DEFAULT_AGENT_MODEL = "anthropic/claude-opus-4-6";
// OR
this.defaultModel = "anthropic/claude-opus-4-6";

// TO:
const DEFAULT_AGENT_MODEL = "kimi-coding/k2p5";
// OR
this.defaultModel = "kimi-coding/k2p5";
\`\`\`

**Important:** There may be multiple occurrences. Change ALL of them.

## STEP 5: Build the Docker Image

\`\`\`bash
# Make sure Docker is running
# Build the image
docker build -t ghcr.io/${GITHUB_USERNAME}/openclaw:kimi-v2026.2.17 .

# Tag as latest
docker tag ghcr.io/${GITHUB_USERNAME}/openclaw:kimi-v2026.2.17 ghcr.io/${GITHUB_USERNAME}/openclaw:kimi-latest
\`\`\`

## STEP 6: Push to GitHub Container Registry

\`\`\`bash
# Login to GitHub Container Registry
# First, create a GitHub Personal Access Token with 'write:packages' scope
# at: https://github.com/settings/tokens

echo YOUR_GITHUB_TOKEN | docker login ghcr.io -u ${GITHUB_USERNAME} --password-stdin

# Push the images
docker push ghcr.io/${GITHUB_USERNAME}/openclaw:kimi-v2026.2.17
docker push ghcr.io/${GITHUB_USERNAME}/openclaw:kimi-latest
\`\`\`

## STEP 7: Update Your UI Provisioning

In \`C:\\Users\\Kecin\\Desktop\\gtm-engine\\ui\\src\\app\\api\\companies\\[id]\\provision\\route.ts\`:

Find this line:
\`\`\`typescript
const image = envConfig.provisioner.ghcrImage();
\`\`\`

Change to:
\`\`\`typescript
const image = "ghcr.io/${GITHUB_USERNAME}/openclaw:kimi-latest";
\`\`\`

Or update your \`.env.local\`:
\`\`\`
GHCR_IMAGE=ghcr.io/${GITHUB_USERNAME}/openclaw:kimi-latest
\`\`\`

## STEP 8: Redeploy Containers

\`\`\`bash
cd C:\\Users\\Kecin\\Desktop\\gtm-engine\\ui
node scripts/recreate-containers.js
\`\`\`

## STEP 9: Verify

Check the logs:
\`\`\`bash
ssh root@159.65.220.183 "docker logs openclaw-supersauce --tail 10 | grep 'agent model'"
\`\`\`

Should show: \`agent model: kimi-coding/k2p5\`

`);

console.log("=".repeat(60));
console.log("ONGOING MAINTENANCE");
console.log("=".repeat(60));

console.log(`

When David updates the upstream repo:

\`\`\`bash
cd C:\\Users\\Kecin\\Desktop\\BSOS

# Fetch upstream changes
git fetch upstream
git checkout main
git merge upstream/main

# Check if model line was affected
git diff HEAD

# If there are conflicts, resolve them (keep kimi-coding/k2p5)

# Rebuild and push
docker build -t ghcr.io/${GITHUB_USERNAME}/openclaw:kimi-v$(Get-Date -Format "yyyy.MM.dd") .
docker push ghcr.io/${GITHUB_USERNAME}/openclaw:kimi-v$(Get-Date -Format "yyyy.MM.dd")
docker tag ghcr.io/${GITHUB_USERNAME}/openclaw:kimi-v$(Get-Date -Format "yyyy.MM.dd") ghcr.io/${GITHUB_USERNAME}/openclaw:kimi-latest
docker push ghcr.io/${GITHUB_USERNAME}/openclaw:kimi-latest

# Update running containers
cd C:\\Users\\Kecin\\Desktop\\gtm-engine\\ui
node scripts/rolling-update.js
\`\`\`

`);

console.log("=".repeat(60));
console.log("QUICK COMMANDS REFERENCE");
console.log("=".repeat(60));

console.log(`

# One-time setup
git clone https://github.com/${GITHUB_USERNAME}/BSOS.git
cd BSOS
git remote add upstream https://github.com/DavidSuperwave/BSOS

# Find the model
grep -r "claude-opus-4-6" packages/ src/

# Build
docker build -t ghcr.io/${GITHUB_USERNAME}/openclaw:kimi-latest .

# Push
docker push ghcr.io/${GITHUB_USERNAME}/openclaw:kimi-latest

`);

console.log("✅ Guide saved!");
console.log("\nNext: Follow STEP 1 - Go fork the repo at:");
console.log(UPSTREAM_REPO);
