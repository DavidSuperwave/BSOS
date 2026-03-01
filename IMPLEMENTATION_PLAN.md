# JULIAN'S GTM ENGINE IMPLEMENTATION PLAN
## Based on Blitzscale OS Master Spec + Current Build State

**Date:** 2026-02-09  
**Current Status:** GTM Engine 2.0 Built, Needs Integration + Cron Setup  
**Goal:** Fully operational self-learning system with Perplexity AI research

---

## PHASE 0: SECURITY & CONFIGURATION (P0 - Today)

### 0.1 API Key Rotation
| Key | Location | Action |
|-----|----------|--------|
| Close CRM | `.env.example` (exposed) | Rotate immediately |
| PlusVibe | `companies/superwave.json` | Move to env |
| Supermemory | `supermemory.js` (hardcoded) | Move to env |

### 0.2 Environment Setup
```bash
# Create proper .env
cp .env.example .env

# Add missing vars:
PERPLEXITY_API_KEY=pplx-xxxxx
KIMI_API_KEY=sk-xxxxx
SUPERMEMORY_API_KEY=sm_xxxxx
TELEGRAM_BOT_TOKEN=xxxxx
TELEGRAM_CHAT_ID=1244663682
```

### 0.3 Git Cleanup
```bash
# Remove exposed keys from history
# Add to .gitignore: .env, *.state.json
```

---

## PHASE 1: CRON INFRASTRUCTURE (P0 - Today)

### 1.1 Cron Job Specifications

| Time (CST) | Task | Component | Status |
|------------|------|-----------|--------|
| 6:00 AM | Deliverability Test | `deliverability-monitor.js` | 🟡 Upgrade needed |
| 7:00 AM | Lead Count Check | `lead-alerts.js` | 🟢 Working |
| 8:00 AM | Campaign Detection | `campaign-detector.js` | 🟢 Working |
| 8:00 AM | Volume Report | `volume-tracker.js` | 🟢 Working |
| 9:00 AM | **Daily GTM Report** | `gtm-daily-report.js` | 🟢 Ready to schedule |
| 12:00 PM | Midday Lead Check | `lead-alerts.js` | 🟢 Working |
| 5:00 PM | Reply Sentiment Summary | `enhanced-reply-monitor.js` | 🟡 Needs cron |
| 6:00 PM | **Negative Reply Analysis** | `negative-reply-audit.js` | 🟡 Needs cron |
| 11:00 PM | Supermemory Sync | `supermemory.js` | 🟢 Working |

### 1.2 Implementation

```javascript
// cron-schedule.js - Add to automation/gtm-engine/
const cron = require('node-cron');

// 6:00 AM - Deliverability Test
cron.schedule('0 6 * * *', () => {
  console.log('🔍 Running deliverability test...');
  require('./deliverability-monitor').runDailyTest();
});

// 9:00 AM - Daily GTM Report
cron.schedule('0 9 * * *', () => {
  console.log('📊 Generating daily GTM report...');
  require('./gtm-daily-report').generateReport();
});

// 5:00 PM - Reply Sentiment Summary
cron.schedule('0 17 * * *', () => {
  console.log('💬 Analyzing reply sentiment...');
  require('./enhanced-reply-monitor').dailySummary();
});

// 6:00 PM - Negative Reply Analysis
cron.schedule('0 18 * * *', () => {
  console.log('🔍 Auditing negative replies...');
  require('./negative-reply-audit').analyzeToday();
});
```

---

## PHASE 2: COMPONENT UPGRADES (P1 - This Week)

### 2.1 Reply Monitor → Enhanced Version

**Current:** `reply-monitor.js` (basic)  
**Target:** Use `enhanced-reply-monitor.js` (8 categories)

```javascript
// Migration path:
// 1. Backup old: mv reply-monitor.js reply-monitor-basic.js
// 2. Promote new: cp enhanced-reply-monitor.js reply-monitor.js
// 3. Update imports in index.js
```

**8-Category Sentiment Classification:**
| Category | Action | Close Status |
|----------|--------|--------------|
| `positive_interested` | Alert + Create lead | Interested |
| `positive_meeting` | Alert + Create lead + Book | Hot Lead |
| `neutral_question` | Draft reply, queue for review | Nurture |
| `neutral_not_now` | Queue follow-up | Nurture |
| `negative_not_fit` | Log + Exclude pattern | Bad Fit |
| `negative_unsubscribe` | Unsubscribe | Do Not Contact |
| `negative_hostile` | Flag domain | Bad Fit |
| `auto_ooo` | Queue for follow-up | Nurture |
| `auto_bounce` | Verify + Update lead | Bad Fit |

### 2.2 Deliverability Monitor Upgrade

**Current:** Placeholder/basic  
**Target:** Real inbox placement testing

```javascript
// Integrate with Mail-Tester or GMass API
// Test: Gmail, Outlook, Yahoo placement
// Alert if < 80% inbox rate
```

### 2.3 Asset Generator Integration

**Trigger Points:**
- Meeting booked via Calendly webhook
- `positive_interested` reply detected

**Outputs:**
- Pre-meeting brief (company research, pain points)
- Nurture sequence (3-email follow-up)

---

## PHASE 3: PERPLEXITY AI RESEARCH LAYER (P1 - This Week)

### 3.1 Research Pipeline

```
Onboarding Form → Perplexity (3 prompts) → Synthesis → Campaign Generation
```

**Prompt 1: Market Research (~$1.40)**
```javascript
const prompt1 = `
Research ${companyName} (${website}) and their market:

1. Company positioning and key differentiators
2. Top 5 competitors with messaging analysis
3. Market gaps and opportunities
4. Typical GTM challenges in their space
5. Suggested offer angles based on market position

Output as structured JSON.
`;
```

**Prompt 2: TAM Mapping (~$1.40)**
```javascript
const prompt2 = `
For ${companyName} targeting ${targetIndustries.join(', ')}:

1. Map all qualified industries and sub-segments
2. Prioritize into Tier 1 (highest fit), Tier 2, Tier 3
3. List decision-maker titles by segment
4. Identify trigger events for each segment
5. Suggested budget allocation across tiers

Output as prioritized list with rationale.
`;
```

**Prompt 3: ICP Validation (~$1.40)**
```javascript
const prompt3 = `
Validate ICP hypotheses for ${companyName}:

Hypotheses to validate:
${icpHypotheses.map(h => `- ${h}`).join('\n')}

For each:
1. Is this persona actually the decision maker?
2. What pain points do they prioritize?
3. What messaging resonates?
4. What's the best channel to reach them?
5. Common objections and counters

Output validation score (0-100) per hypothesis.
`;
```

### 3.2 Implementation

```javascript
// perplexity-research.js
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;

async function runResearchPipeline(companyProfile) {
  const results = {
    market: await queryPerplexity(buildMarketPrompt(companyProfile)),
    tam: await queryPerplexity(buildTAMPrompt(companyProfile)),
    icp: await queryPerplexity(buildICPPrompt(companyProfile))
  };
  
  // Store in Supermemory
  await supermemory.addDocument({
    content: JSON.stringify(results),
    metadata: {
      type: 'research',
      company: companyProfile.slug,
      timestamp: new Date().toISOString()
    }
  });
  
  return results;
}
```

---

## PHASE 4: MULTI-COMPANY SCALING (P2 - Next Week)

### 4.1 Add Second Company

Test multi-tenant architecture with real second workspace:

```json
// companies/revgrowth.json (example)
{
  "name": "RevGrowth",
  "slug": "revgrowth",
  "website": "revgrowth.io",
  "plusvibe": {
    "workspaceId": "NEW_WORKSPACE_ID",
    "apiKey": "${REVGROWTH_PLUSVIBE_KEY}"
  },
  "close": {
    "apiKey": "${REVGROWTH_CLOSE_KEY}",
    "statuses": { ... }
  },
  "supermemory": {
    "containerTag": "company:revgrowth"
  },
  "icp": { ... },
  "campaigns": { ... }
}
```

### 4.2 Container Isolation Verification

```javascript
// Test that data stays isolated
const superwaveMemories = await supermemory.search('ICP insights', {
  filter: { containerTag: 'company:superwave' }
});

const revgrowthMemories = await supermemory.search('ICP insights', {
  filter: { containerTag: 'company:revgrowth' }
});

// Verify: superwaveMemories ∩ revgrowthMemories = ∅
```

---

## PHASE 5: AUTONOMOUS OPTIMIZATION LOOP (P2 - Next Week)

### 5.1 Pattern Detection → Action

```
Signal Pattern → Threshold Hit → Auto-Action
```

| Pattern | Threshold | Auto-Action |
|---------|-----------|-------------|
| Same objection | 3 in 24h | Generate counter-angle |
| Sentiment drop | < -50 for 12h | Auto-pause campaign |
| High intent | 2+ demo requests | Insert Calendly immediately |
| OOO spike | > 40% in a day | Delay sends by 1 week |

### 5.2 Learning Storage

```javascript
// After each campaign:
await supermemory.addDocument({
  content: `Campaign ${campaignId} results: ${JSON.stringify(metrics)}`,
  metadata: {
    type: 'campaign_result',
    company: companySlug,
    industry: campaign.industry,
    targetRole: campaign.targetRole,
    replyRate: metrics.replyRate,
    positiveRate: metrics.positiveRate,
    topAngle: metrics.topPerformingAngle
  }
});
```

### 5.3 Predictive ICP Scoring

```javascript
// Before creating new campaign:
const similarCampaigns = await supermemory.search(
  `industry:"${industry}" role:"${targetRole}" results`,
  { limit: 10 }
);

const predictedReplyRate = calculateAverage(similarCampaigns, 'replyRate');
const predictedPositiveRate = calculateAverage(similarCampaigns, 'positiveRate');

// Auto-adjust budget/expectations
if (predictedReplyRate < 1.5) {
  return { warning: 'Low expected performance', recommendation: 'Adjust targeting' };
}
```

---

## PHASE 6: WEBHOOK RECEIVER DEPLOYMENT (P0 - This Week)

### 6.1 Railway Deployment

```yaml
# railway.yaml
services:
  gtm-engine:
    buildCommand: npm install
    startCommand: node index.js
    env:
      - PORT=3000
      - NODE_ENV=production
```

### 6.2 Webhook Configuration

**PlusVibe Webhook URL:**
```
https://gtm-engine.up.railway.app/webhook/gtm-engine-replies
```

**Events to Subscribe:**
- ALL_EMAIL_REPLIES
- ALL_POSITIVE_REPLIES
- LEAD_MARKED_AS_INTERESTED
- LEAD_MARKED_AS_NOT_INTERESTED

### 6.3 Webhook Handler Flow

```
PlusVibe Webhook
    │
    ▼
Parse Reply
    │
    ├──▶ Enhanced Sentiment Analysis (8 categories)
    │
    ├──▶ Close CRM Sync (if positive)
    │
    ├──▶ Telegram Alert (all categories)
    │
    └──▶ Supermemory Store (pattern learning)
```

---

## IMPLEMENTATION PRIORITY MATRIX

| Priority | Task | Impact | Effort | Owner |
|----------|------|--------|--------|-------|
| P0 | Rotate exposed API keys | Critical | 30min | User |
| P0 | Deploy webhook to Railway | System live | 1hr | Julian |
| P0 | Add cron schedule | Automation | 1hr | Julian |
| P1 | Integrate Perplexity research | AI value | 4hr | Julian |
| P1 | Upgrade deliverability monitor | Data quality | 2hr | Julian |
| P2 | Add second company | Multi-tenant test | 2hr | Julian |
| P2 | Pattern detection → auto-actions | True autonomy | 4hr | Julian |

---

## DAILY OPERATIONS CHECKLIST (Post-Deployment)

### Morning (9 AM)
- [ ] Review Daily GTM Report (Telegram)
- [ ] Check campaign health scores
- [ ] Review overnight reply alerts

### Midday (12 PM)
- [ ] Check lead counts (< 500 alert)
- [ ] Review volume capacity

### Evening (6 PM)
- [ ] Review negative reply audit
- [ ] Approve any auto-generated angles
- [ ] Check tomorrow's campaign queue

---

## SUCCESS METRICS (30-Day Targets)

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| Reply rate | 1.97% | 2.5% | PlusVibe analytics |
| Positive rate | 0.44% | 0.75% | Enhanced sentiment |
| Lead alert response time | Manual | < 2 hours | Cron automation |
| Campaign-to-insight lag | Days | Hours | Supermemory auto-store |
| Multi-company isolation | N/A | 100% | Data verification |

---

*Plan created: 2026-02-09*  
*Next review: After webhook deployment*
