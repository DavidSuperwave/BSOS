/**
 * Deliverability Monitor
 * 
 * Runs daily at 6:00 AM
 * Tests inbox placement and sends report
 */

const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

// Configuration
const GMASS_API_KEY = process.env.GMASS_API_KEY || 'spamtest@gmass.co';
const GMASS_TEST_EMAIL = 'spamtest@gmass.co';
const STATE_FILE = path.join(__dirname, '.deliverability-state.json');

// Load state
function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
  } catch (e) { console.error('State load error:', e); }
  return {
    lastTestDate: null,
    inboxRate: null,
    spamRate: null,
    history: []
  };
}

function saveState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) { console.error('State save error:', e); }
}

// ============================================
// LIVE DELIVERABILITY CHECK
// Pulls real campaign stats from PlusVibe API
// and domain health from Inboxing API
// ============================================

const PLUSVIBE_API_KEY = process.env.PLUSVIBE_API_KEY;
const PLUSVIBE_WORKSPACE_ID = process.env.PLUSVIBE_WORKSPACE_ID;
const INBOXING_API_KEY = process.env.INBOXING_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function fetchPlusVibeCampaignStats() {
  if (!PLUSVIBE_API_KEY) {
    console.log('   ⚠️ PlusVibe API key not configured, skipping campaign stats');
    return null;
  }
  try {
    const resp = await fetch('https://api.plusvibe.ai/api/v1/campaign/list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': PLUSVIBE_API_KEY },
      body: JSON.stringify({ workspace_id: PLUSVIBE_WORKSPACE_ID, limit: 50 })
    });
    if (!resp.ok) throw new Error(`PlusVibe ${resp.status}`);
    const data = await resp.json();
    return data.data || data.campaigns || [];
  } catch (err) {
    console.error('   PlusVibe fetch error:', err.message);
    return null;
  }
}

async function fetchInboxingDomainHealth() {
  if (!INBOXING_API_KEY) {
    console.log('   ⚠️ Inboxing API key not configured, skipping domain health');
    return null;
  }
  try {
    const resp = await fetch('https://v2.inboxing.com/api/v2/domains', {
      headers: { 'Authorization': `Bearer ${INBOXING_API_KEY}` }
    });
    if (!resp.ok) throw new Error(`Inboxing ${resp.status}`);
    const data = await resp.json();
    return data.domains || data.data || [];
  } catch (err) {
    console.error('   Inboxing fetch error:', err.message);
    return null;
  }
}

async function checkDeliverability() {
  console.log('[Deliverability Monitor] Checking inbox placement...');
  
  const state = loadState();
  const today = new Date().toISOString().split('T')[0];
  
  if (state.lastTestDate === today) {
    console.log('   Already tested today');
    return state;
  }
  
  // Pull live data from APIs
  const [campaigns, domains] = await Promise.all([
    fetchPlusVibeCampaignStats(),
    fetchInboxingDomainHealth()
  ]);

  // Calculate real deliverability metrics from campaign data
  let inboxRate = 0;
  let spamRate = 0;
  let totalSent = 0;
  let totalBounced = 0;
  
  if (campaigns && campaigns.length > 0) {
    const activeCampaigns = campaigns.filter(c => 
      c.status === 'active' || c.status === 'completed'
    );
    for (const c of activeCampaigns) {
      const sent = c.sent_count || c.total_sent || 0;
      const bounced = c.bounce_count || c.bounced || 0;
      totalSent += sent;
      totalBounced += bounced;
    }
    if (totalSent > 0) {
      spamRate = ((totalBounced / totalSent) * 100);
      inboxRate = 100 - spamRate;
    }
  }

  // Check domain health
  let domainIssues = [];
  if (domains && domains.length > 0) {
    for (const d of domains) {
      const hs = d.health_score || d.healthScore;
      if (hs !== undefined && hs < 70) {
        domainIssues.push(`${d.domain || d.name}: health score ${hs}`);
      }
      if (d.dns_spf === false) domainIssues.push(`${d.domain || d.name}: SPF missing`);
      if (d.dns_dkim === false) domainIssues.push(`${d.domain || d.name}: DKIM missing`);
      if (d.dns_dmarc === false) domainIssues.push(`${d.domain || d.name}: DMARC missing`);
    }
  }

  const testResult = {
    date: today,
    inboxRate: Math.round(inboxRate * 100) / 100,
    spamRate: Math.round(spamRate * 100) / 100,
    totalSent,
    totalBounced,
    activeDomains: domains ? domains.length : 0,
    issues: [],
    recommendations: [],
    source: campaigns ? 'live' : 'unavailable'
  };
  
  if (testResult.inboxRate < 70 && totalSent > 0) {
    testResult.issues.push(`Inbox rate ${testResult.inboxRate}% (below 70% threshold)`);
    testResult.recommendations.push('Review email list quality and warmup status');
  }
  
  if (testResult.spamRate > 3 && totalSent > 0) {
    testResult.issues.push(`Bounce/spam rate ${testResult.spamRate}% (above 3% threshold)`);
    testResult.recommendations.push('Check subject lines and sender reputation');
  }

  if (domainIssues.length > 0) {
    testResult.issues.push(...domainIssues);
    testResult.recommendations.push('Fix DNS records on flagged domains');
  }

  if (!campaigns && !domains) {
    testResult.issues.push('Could not reach PlusVibe or Inboxing APIs');
    testResult.recommendations.push('Check API keys in environment variables');
  }
  
  // Update history
  if (!state.history) state.history = [];
  state.history.push(testResult);
  state.history = state.history.slice(-30);
  state.lastTestDate = today;
  state.inboxRate = testResult.inboxRate;
  state.spamRate = testResult.spamRate;
  
  saveState(state);
  
  return testResult;
}

// Send Telegram alert if issues detected
async function sendAlert(result) {
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID || '1244663682';
  
  if (!telegramToken || result.issues.length === 0) return;
  
  const message = `⚠️ <b>Deliverability Alert</b>

📅 Date: ${result.date}
📬 Inbox Rate: ${result.inboxRate}%
📛 Spam Rate: ${result.spamRate}%

<b>Issues Detected:</b>
${result.issues.map(i => `• ${i}`).join('\n')}

<b>Recommendations:</b>
${result.recommendations.map(r => `• ${r}`).join('\n')}

🔧 <a href="https://plusvibe.ai">Check PlusVibe</a>`;
  
  try {
    await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' })
    });
    console.log('   ✅ Alert sent');
  } catch (error) {
    console.error('   ❌ Alert failed:', error.message);
  }
}

// Main
async function main() {
  console.log('[Deliverability Monitor] Starting...');
  
  const result = await checkDeliverability();
  
  console.log(`   Inbox Rate: ${result.inboxRate || 0}%`);
  console.log(`   Spam Rate: ${result.spamRate || 0}%`);
  
  const issues = result.issues || [];
  console.log(`   Issues: ${issues.length}`);
  
  if (issues.length > 0) {
    await sendAlert(result);
  }
  
  console.log('[Deliverability Monitor] Complete');
}

main().catch(console.error);
