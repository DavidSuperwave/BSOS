/**
 * GTM Engine - Supermemory Integration
 * 
 * Stores and retrieves campaign learnings for continuous optimization
 * 
 * Usage: node supermemory.js --action=store|query
 * 
 * Environment: 
 *   SUPERMEMORY_API_KEY=sm_xxx
 */

const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

// Configuration
const API_KEY = process.env.SUPERMEMORY_API_KEY || 'sm_NWuMr3D3Gu63agXVhfPmtj_KzDhRZqEROGzEQOmgwqHxaOJZwstMeThTGkicnDiKlCqZsmueuTkICIYDNblhNgp';
const API_BASE = 'https://api.supermemory.ai';

// State file for local caching
const STATE_FILE = path.join(__dirname, '.supermemory-state.json');

// ============================================
// SUPERMEMORY API
// ============================================

class Supermemory {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }

  async addDocument(content, metadata = {}) {
    try {
      const response = await fetch(`${API_BASE}/v3/documents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          content,
          metadata: {
            ...metadata,
            source: 'gtm-engine',
            timestamp: new Date().toISOString()
          }
        })
      });
      const result = await response.json();
      console.log(`   ✅ Added document: ${result.id || result || 'success'}`);
      return result;
    } catch (error) {
      console.error('   ❌ Add error:', error.message);
      return null;
    }
  }

  async searchMemory(query, options = {}) {
    try {
      const response = await fetch(`${API_BASE}/v3/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          q: query,
          limit: options.limit || 10
        })
      });
      const result = await response.json();
      console.log(`   ✅ Search returned ${result.results?.length || 0} results`);
      return result.results || [];
    } catch (error) {
      console.error('   ❌ Search error:', error.message);
      return [];
    }
  }
}

// ============================================
// STATE MANAGEMENT
// ============================================

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
  } catch (e) { console.error('State load error:', e); }
  return {
    lastCampaignCheck: null,
    lastReplyCheck: null,
    storedDocuments: []
  };
}

function saveState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) { console.error('State save error:', e); }
}

// ============================================
// ACTIONS
// ============================================

async function storeLearning(type, data) {
  const memory = new Supermemory(API_KEY);
  
  const content = generateContent(type, data);
  const metadata = generateMetadata(type, data);
  
  const result = await memory.addDocument(content, metadata);
  
  if (result) {
    const state = loadState();
    state.storedDocuments.push({ type, timestamp: new Date().toISOString() });
    saveState(state);
  }
  
  return result;
}

async function queryLearnings(query, options = {}) {
  const memory = new Supermemory(API_KEY);
  const results = await memory.searchMemory(query, options);
  return results;
}

async function getCampaignLearnings(industry, role) {
  const memory = new Supermemory(API_KEY);
  
  const results = await memory.searchMemory(
    `Best performing campaigns for ${industry} ${role}`,
    { limit: 5 }
  );
  
  return {
    bestFramework: extractBestFramework(results),
    bestSubjectLines: extractBestSubjectLines(results),
    painPoints: extractPainPoints(results),
    avoidList: extractAvoidList(results),
    insights: extractInsights(results)
  };
}

async function getTargetingRules(industry) {
  const memory = new Supermemory(API_KEY);
  
  const inclusions = await memory.searchMemory(
    `Who to target for ${industry}`,
    { limit: 3 }
  );
  
  const exclusions = await memory.searchMemory(
    `Who to exclude for ${industry}`,
    { limit: 5 }
  );
  
  return {
    inclusionCriteria: extractInclusions(inclusions),
    exclusionList: extractExclusions(exclusions)
  };
}

// ============================================
// HELPERS
// ============================================

function generateContent(type, data) {
  switch (type) {
    case 'campaign':
      return `Campaign "${data.name}" targeting ${data.industry} ${data.role} achieved ${data.replyRate}% reply rate with ${data.positiveRate}% positive. Best framework: ${data.bestFramework}.`;
    case 'icp':
      return `${data.industry} ${data.persona}: Best pain points are ${data.painPoints?.join(', ')}. Best offers: ${data.offers?.join(', ')}. Avoid: ${data.avoid?.join(', ')}.`;
    case 'targeting':
      return `${data.industry}: Include ${data.include?.join(', ')}. Exclude ${data.exclude?.map(e => e.domain || e.company || e).join(', ')}.`;
    case 'deliverability':
      return `${data.account}: Inbox rate ${data.inboxRate}%, spam ${data.spamRate}%. Issues: ${data.issues?.join(', ')}. Applied fixes: ${data.fixes?.join(', ')}.`;
    case 'reply_pattern':
      return `Objection: "${data.objection}". Best response: "${data.bestResponse}". Conversion: ${data.conversionRate}%.`;
    default:
      return JSON.stringify(data);
  }
}

function generateMetadata(type, data) {
  switch (type) {
    case 'campaign':
      return {
        type: 'campaign_learning',
        industry: data.industry,
        role: data.role,
        replyRate: data.replyRate,
        positiveRate: data.positiveRate,
        framework: data.bestFramework,
        campaignId: data.id,
        campaignName: data.name
      };
    case 'icp':
      return {
        type: 'icp_insight',
        industry: data.industry,
        persona: data.persona,
        painPoints: data.painPoints,
        offers: data.offers,
        avoid: data.avoid
      };
    case 'targeting':
      return {
        type: 'targeting_learning',
        industry: data.industry,
        inclusionCriteria: data.include,
        exclusionList: data.exclude
      };
    case 'deliverability':
      return {
        type: 'deliverability_record',
        account: data.account,
        inboxRate: data.inboxRate,
        spamRate: data.spamRate,
        issues: data.issues,
        fixes: data.fixes,
        trend: data.trend
      };
    case 'reply_pattern':
      return {
        type: 'reply_pattern',
        objection: data.objection,
        bestResponse: data.bestResponse,
        conversionRate: data.conversionRate
      };
    default:
      return { type };
  }
}

function extractBestFramework(results) {
  const frameworks = results.map(r => r.document?.metadata?.framework || r.metadata?.framework).filter(Boolean);
  return frameworks[0] || null;
}

function extractBestSubjectLines(results) {
  return results.map(r => r.document?.metadata?.bestSubjectLine || r.metadata?.bestSubjectLine).filter(Boolean).slice(0, 3);
}

function extractPainPoints(results) {
  return results.flatMap(r => r.document?.metadata?.painPoints || r.metadata?.painPoints || []).slice(0, 5);
}

function extractAvoidList(results) {
  return results.flatMap(r => r.document?.metadata?.avoid || r.metadata?.avoid || []).slice(0, 10);
}

function extractInsights(results) {
  return results.flatMap(r => r.document?.metadata?.insights || r.metadata?.insights || []).slice(0, 5);
}

function extractInclusions(results) {
  return results.flatMap(r => r.document?.metadata?.inclusionCriteria || r.metadata?.inclusionCriteria || []).slice(0, 10);
}

function extractExclusions(results) {
  return results.flatMap(r => r.document?.metadata?.exclusionList || r.metadata?.exclusionList || []).slice(0, 20);
}

// ============================================
// CLI
// ============================================

async function main() {
  const args = process.argv.slice(2);
  const action = args.find(a => a.startsWith('--action='))?.split('=')[1] || 'status';
  
  console.log(`[Supermemory] Action: ${action}`);
  console.log('');
  
  switch (action) {
    case 'store': {
      const type = args.find(a => a.startsWith('--type='))?.split('=')[1];
      const data = JSON.parse(args.find(a => a.startsWith('--data='))?.split('=')[1] || '{}');
      await storeLearning(type, data);
      break;
    }
    
    case 'query': {
      const query = args.find(a => a.startsWith('--query='))?.split('=')[1];
      const results = await queryLearnings(query || 'campaign learnings');
      console.log(JSON.stringify(results, null, 2));
      break;
    }
    
    case 'campaign-learnings': {
      const industry = args.find(a => a.startsWith('--industry='))?.split('=')[1];
      const role = args.find(a => a.startsWith('--role='))?.split('=')[1];
      const learnings = await getCampaignLearnings(industry || 'General', role || 'General');
      console.log(JSON.stringify(learnings, null, 2));
      break;
    }
    
    case 'targeting-rules': {
      const industry = args.find(a => a.startsWith('--industry='))?.split('=')[1];
      const rules = await getTargetingRules(industry || 'General');
      console.log(JSON.stringify(rules, null, 2));
      break;
    }
    
    case 'status': {
      const state = loadState();
      console.log('Supermemory Status:');
      console.log(`- Stored documents: ${state.storedDocuments?.length || 0}`);
      console.log(`- API configured: ${API_KEY ? 'Yes' : 'No'}`);
      console.log('');
      console.log('Quick Test:');
      await storeLearning('campaign', {
        name: 'Test Campaign',
        industry: 'Test',
        role: 'Test',
        replyRate: 1.0,
        positiveRate: 0.5,
        bestFramework: 'f1'
      });
      const results = await queryLearnings('Test campaign');
      console.log(`- Search test: ${results.length} results found`);
      break;
    }
    
    default:
      console.log('Usage: node supermemory.js --action=<action> [options]');
      console.log('');
      console.log('Actions:');
      console.log('  --action=status                              Check status + quick test');
      console.log('  --action=store --type=campaign --data={}     Store learning');
      console.log('  --action=query --query=xxx                   Query learnings');
      console.log('  --action=campaign-learnings --industry=X --role=Y');
      console.log('  --action=targeting-rules --industry=X');
  }
}

main().catch(console.error);

// Module exports for programmatic use
module.exports = {
  storeLearning,
  queryLearnings,
  getCampaignLearnings,
  getTargetingRules
};
