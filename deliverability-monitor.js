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
    const resp = await fetch(`https://api.plusvibe.ai/api/v1/campaign/list?workspace_id=${PLUSVIBE_WORKSPACE_ID}&limit=50`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', 'x-api-key': PLUSVIBE_API_KEY }
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
  let bounceRate = 0;
  let spamRate = 0;
  let totalSent = 0;
  let totalBounced = 0;
  let totalSpam = 0;
  
  if (campaigns && campaigns.length > 0) {
    const activeCampaigns = campaigns.filter(c => 
      c.status === 'active' || c.status === 'completed'
    );
    for (const c of activeCampaigns) {
      const sent = c.sent_count || c.total_sent || 0;
      const bounced = c.bounce_count || c.bounced || 0;
      const spam = c.spam_count || c.spam || 0;
      totalSent += sent;
      totalBounced += bounced;
      totalSpam += spam;
    }
    if (totalSent > 0) {
      bounceRate = ((totalBounced / totalSent) * 100);
      // Use campaign-level spam_count if available, otherwise derive from Inboxing
      spamRate = totalSpam > 0 ? ((totalSpam / totalSent) * 100) : 0;
      inboxRate = 100 - bounceRate - spamRate;
    }
  }

  // Enrich spam rate from Inboxing domain health if PlusVibe didn't provide spam_count
  if (totalSpam === 0 && domains && domains.length > 0) {
    let domainSpamScore = 0;
    let domainCount = 0;
    for (const d of domains) {
      const sr = d.spam_rate || d.spamRate;
      if (sr !== undefined) {
        domainSpamScore += sr;
        domainCount++;
      }
    }
    if (domainCount > 0) {
      spamRate = domainSpamScore / domainCount;
      inboxRate = Math.max(0, 100 - bounceRate - spamRate);
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
    bounceRate: Math.round(bounceRate * 100) / 100,
    spamRate: Math.round(spamRate * 100) / 100,
    totalSent,
    totalBounced,
    totalSpam,
    activeDomains: domains ? domains.length : 0,
    issues: [],
    recommendations: [],
    source: campaigns ? 'live' : 'unavailable'
  };
  
  if (testResult.inboxRate < 70 && totalSent > 0) {
    testResult.issues.push(`Inbox rate ${testResult.inboxRate}% (below 70% threshold)`);
    testResult.recommendations.push('Review email list quality and warmup status');
  }
  
  if (testResult.bounceRate > 3 && totalSent > 0) {
    testResult.issues.push(`Bounce rate ${testResult.bounceRate}% (above 3% threshold)`);
    testResult.recommendations.push('Clean email lists — remove invalid addresses');
  }

  if (testResult.spamRate > 1 && totalSent > 0) {
    testResult.issues.push(`Spam rate ${testResult.spamRate}% (above 1% threshold)`);
    testResult.recommendations.push('Check subject lines, sender reputation, and domain health');
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
  state.lastTestDate = today;
  state.inboxRate = testResult.inboxRate;
  state.bounceRate = testResult.bounceRate;
  state.spamRate = testResult.spamRate;
  saveState(state);
  
  // Store to Supabase if configured
  if (SUPABASE_URL && SUPABASE_KEY) {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/deliverability_results`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(testResult)
      });
      console.log('   ✅ Stored to Supabase');
    } catch (err) {
      console.error('   Supabase store error:', err.message);
    }
  }
  
  return testResult;
}

async function generateReport(result) {
  if (!result) {
    console.log('[Deliverability Monitor] No result to report');
    return;
  }
  
  const status = (result.inboxRate || 0) >= 80 ? '✅ GOOD' : 
                 (result.inboxRate || 0) >= 70 ? '⚠️ WARNING' : '❌ CRITICAL';
  
  console.log('\n=== DELIVERABILITY REPORT ===');
  console.log(`Status: ${status}`);
  console.log(`Date: ${result.date}`);
  console.log(`Source: ${result.source || 'unknown'}`);
  if (result.totalSent > 0) {
    console.log(`\nEmail Stats (from ${result.totalSent.toLocaleString()} sent):`);
    console.log(`  Inbox Rate:  ${result.inboxRate}%`);
    console.log(`  Bounce Rate: ${result.bounceRate}%`);
    console.log(`  Spam Rate:   ${result.spamRate}%`);
  } else {
    console.log('\nNo campaign data available yet');
  }
  
  if (result.activeDomains > 0) {
    console.log(`\nDomains Monitored: ${result.activeDomains}`);
  }
  
  if (result.issues && result.issues.length > 0) {
    console.log('\nIssues:');
    result.issues.forEach(issue => console.log(`  - ${issue}`));
  }
  
  if (result.recommendations && result.recommendations.length > 0) {
    console.log('\nRecommendations:');
    result.recommendations.forEach(rec => console.log(`  - ${rec}`));
  }
  
  // Send to Telegram if configured
  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
    const lines = [
      `📧 *Deliverability Report* - ${result.date}`,
      `Status: ${status}`,
      result.totalSent > 0 ? `\nFrom ${result.totalSent.toLocaleString()} emails sent:` : '\nNo campaign data yet',
      result.totalSent > 0 ? `📥 Inbox: ${result.inboxRate}%` : '',
      result.totalSent > 0 ? `⛔ Bounce: ${result.bounceRate}%` : '',
      result.totalSent > 0 ? `🚫 Spam: ${result.spamRate}%` : '',
    ];
    if (result.issues && result.issues.length > 0) {
      lines.push('\n⚠️ Issues:');
      result.issues.slice(0, 3).forEach(issue => lines.push(`  - ${issue}`));
    }
    const message = lines.filter(Boolean).join('\n');
    
    try {
      await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: process.env.TELEGRAM_CHAT_ID,
          text: message,
          parse_mode: 'Markdown'
        })
      });
      console.log('✅ Telegram notification sent');
    } catch (err) {
      console.error('Telegram send error:', err.message);
    }
  }
}

// Main execution
(async () => {
  try {
    const result = await checkDeliverability();
    await generateReport(result);
  } catch (error) {
    console.error('❌ Deliverability monitor failed:', error.message);
    process.exit(1);
  }
})();

module.exports = { checkDeliverability, generateReport };
