/**
 * GTM Engine Reply Monitor
 * 
 * Polls PlusVibe Unibox for new replies and processes them
 * - Positive replies → Create Close CRM lead
 * - OOO replies → Log return date for follow-up
 * - Negative replies → Log for targeting analysis
 * 
 * Run: node reply-monitor.js
 */

const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

// Configuration
const PLUSVIBE_API_KEY = '7332bc56-e2769fd4-9f1a00b6-ebb7ce28';
const PLUSVIBE_WORKSPACE_ID = '678eb62a071ff7544034bcde';
const CLOSE_API_KEY = 'api_0HdbdhMSeluyXFS5vtZqoG.3rpXMwHXC84v547rzntLmD';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = '1244663682';
const SUPERMEMORY_API_KEY = process.env.SUPERMEMORY_API_KEY || 'sm_NWuMr3D3Gu63agXVhfPmtj_KzDhRZqEROGzEQOmgwqHxaOJZwstMeThTGkicnDiKlCqZsmueuTkICIYDNblhNgp';
const SUPERMEMORY_URL = 'https://api.supermemory.ai';

// Close CRM Status IDs
const CLOSE_STATUSES = {
  INTERESTED: 'stat_YZPfE0rqYeUym9EF0twuDwZl6dYKUzpSG11PwLPYVTQ',
  POTENTIAL: 'stat_vJnznN7N4fJTSxi9pn1M6hbs4RfeuCbu124DX8bIUz0',
  BAD_FIT: 'stat_v8gPNNVhTBlqy8fpsn8otCbrk0UNZwmjpSVdCGdWCFq',
  NURTURE: 'stat_4UtQuE9aIUZ1Y4Imr8UavuubTSlbWZo2LYgqfOsfFPO'
};

// State file
const STATE_FILE = path.join(__dirname, '.reply-monitor-state.json');

// OOO patterns
const OOO_PATTERNS = [
  /out of (the )?office/i, /away from (the )?office/i,
  /on (annual |paid )?leave/i, /on vacation/i, /on holiday/i,
  /currently (away|unavailable|traveling)/i,
  /will (be )?(back|return)/i, /auto(-| )?reply/i,
  /automatic reply/i, /i('m| am) (away|out|traveling)/i,
  /limited access to email/i, /respond when i return/i,
  /back in the office/i, /maternity leave/i, /paternity leave/i, /sabbatical/i
];

// ============================================
// STATE MANAGEMENT
// ============================================

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
  } catch (e) { console.error('State load error:', e); }
  return { processedEmails: [], lastCheck: null };
}

function saveState(state) {
  try {
    if (state.processedEmails.length > 1000) {
      state.processedEmails = state.processedEmails.slice(-1000);
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) { console.error('State save error:', e); }
}

// ============================================
// OOO DETECTION
// ============================================

function detectOOO(text) {
  if (!text) return { isOOO: false };
  for (const pattern of OOO_PATTERNS) {
    if (pattern.test(text)) {
      const dateMatch = text.match(/(?:back|return|available)\s+(?:on\s+)?(\w+\s+\d{1,2}(?:st|nd|rd|th)?)/i);
      return { isOOO: true, returnDate: dateMatch ? dateMatch[1] : null };
    }
  }
  return { isOOO: false };
}

// ============================================
// API FUNCTIONS
// ============================================

async function getUniboxReplies() {
  try {
    const res = await fetch(
      `https://api.plusvibe.ai/api/v1/unibox/emails?workspace_id=${PLUSVIBE_WORKSPACE_ID}&limit=50`,
      { headers: { 'x-api-key': PLUSVIBE_API_KEY } }
    );
    const data = await res.json();
    return data.emails || [];
  } catch (e) {
    console.error('PlusVibe API error:', e);
    return [];
  }
}

async function closeApi(endpoint, method = 'GET', body = null) {
  const auth = Buffer.from(`${CLOSE_API_KEY}:`).toString('base64');
  const opts = {
    method,
    headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' }
  };
  if (body) opts.body = JSON.stringify(body);
  try {
    const r = await fetch(`https://api.close.com/api/v1${endpoint}`, opts);
    return await r.json();
  } catch (e) {
    console.error('Close API error:', e);
    return null;
  }
}

async function createCloseLead(email) {
  const { from_email, first_name, last_name, company_name, job_title, campaign_name, text_body, sentiment, label } = email;
  
  let statusId = CLOSE_STATUSES.POTENTIAL;
  let priority = 'warm';
  if (label === 'INTERESTED' || sentiment === 'POSITIVE') {
    statusId = CLOSE_STATUSES.INTERESTED;
    priority = 'hot';
  } else if (label === 'NOT_INTERESTED' || sentiment === 'NEGATIVE') {
    statusId = CLOSE_STATUSES.BAD_FIT;
    priority = 'none';
  } else if (sentiment === 'NEUTRAL') {
    statusId = CLOSE_STATUSES.NURTURE;
    priority = 'nurture';
  }

  const lead = await closeApi('/lead/', 'POST', {
    name: company_name || `${first_name || ''} ${last_name || ''}`.trim() || from_email,
    status_id: statusId,
    contacts: [{
      name: `${first_name || ''} ${last_name || ''}`.trim() || 'Unknown',
      title: job_title || '',
      emails: [{ email: from_email, type: 'office' }]
    }]
  });

  if (lead && lead.id) {
    await closeApi('/activity/note/', 'POST', {
      lead_id: lead.id,
      note: `🎯 GTM ENGINE\n\nCAMPAIGN: ${campaign_name || '?'}\nSENTIMENT: ${sentiment || '?'}\nLABEL: ${label || '?'}\n\n${text_body || 'No content'}\n\nPriority: ${priority.toUpperCase()}`
    });
    return { lead, priority };
  }
  return null;
}

async function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: 'Markdown' })
    });
  } catch (e) { console.error('Telegram error:', e); }
}

// ============================================
// SUPERMEMORY INTEGRATION
// ============================================

async function storeInSupermemory(type, data) {
  try {
    const content = generateSupermemoryContent(type, data);
    const metadata = generateSupermemoryMetadata(type, data);
    
    const response = await fetch(`${SUPERMEMORY_URL}/memory.add`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPERMEMORY_API_KEY}`
      },
      body: JSON.stringify({ content, metadata })
    });
    
    const result = await response.json();
    console.log(`  🧠 Stored ${type} in Supermemory`);
    return result;
  } catch (e) {
    console.error('  ⚠️ Supermemory storage failed:', e.message);
    return null;
  }
}

function generateSupermemoryContent(type, data) {
  switch (type) {
    case 'reply_pattern':
      return `Objection: "${data.text?.substring(0, 100)}...". Sentiment: ${data.sentiment}.`;
    case 'targeting_learning':
      return `Reply from ${data.email} in campaign "${data.campaign_name}". Company: ${data.company_name}.`;
    case 'deliverability':
      return `Positive reply from ${data.email} - ${data.sentiment}. Campaign: ${data.campaign_name}.`;
    default:
      return JSON.stringify(data);
  }
}

function generateSupermemoryMetadata(type, data) {
  return {
    type,
    source: 'gtm-engine-reply-monitor',
    timestamp: new Date().toISOString(),
    email: data.email,
    sentiment: data.sentiment,
    campaign: data.campaign_name,
    industry: data.industry || null,
    role: data.job_title || null,
    company: data.company_name || null
  };
}

async function storeReplyPatterns(replies) {
  for (const reply of replies) {
    if (reply.sentiment && reply.sentiment !== 'NEUTRAL') {
      await storeInSupermemory('reply_pattern', {
        text: reply.text_body || reply.snippet,
        sentiment: reply.sentiment,
        email: reply.from_email,
        campaign_name: reply.campaign_name
      });
    }
  }
}

async function querySupermemory(industry, role) {
  try {
    const response = await fetch(`${SUPERMEMORY_URL}/memory.search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPERMEMORY_API_KEY}`
      },
      body: JSON.stringify({
        query: `Best campaigns for ${industry} ${role}`,
        filters: { type: 'campaign_learning', industry, role },
        limit: 5
      })
    });
    const result = await response.json();
    return result.results || [];
  } catch (e) {
    console.error('Supermemory query error:', e);
    return [];
  }
}

// ============================================
// MAIN
// ============================================

async function main() {
  console.log(`[${new Date().toISOString()}] Checking replies...`);
  
  const state = loadState();
  const replies = await getUniboxReplies();
  
  if (!replies.length) {
    console.log('REPLY_MONITOR_OK');
    return;
  }
  
  console.log(`Found ${replies.length} replies`);
  
  const results = { positive: [], ooo: [], negative: [], neutral: [] };
  let processed = 0;
  
  for (const email of replies) {
    const id = email._id || email.id;
    if (state.processedEmails.includes(id) || email.direction === 'OUT') continue;
    
    const text = email.text_body || email.snippet || '';
    const ooo = detectOOO(text);
    
    if (ooo.isOOO) {
      console.log(`  📅 OOO: ${email.from_email}`);
      results.ooo.push({ email: email.from_email, returnDate: ooo.returnDate, campaign: email.campaign_name });
      
      // Store OOO pattern
      await storeInSupermemory('ooo_detection', {
        email: email.from_email,
        campaign_name: email.campaign_name,
        returnDate: ooo.returnDate
      });
    } else if (email.sentiment === 'POSITIVE' || email.label === 'INTERESTED') {
      console.log(`  🔥 HOT: ${email.from_email}`);
      const result = await createCloseLead(email);
      if (result) {
        results.positive.push({ email: email.from_email, leadId: result.lead.id, campaign: email.campaign_name });
        
        // Store positive reply pattern
        await storeInSupermemory('reply_pattern', {
          text: text,
          sentiment: 'POSITIVE',
          email: email.from_email,
          campaign_name: email.campaign_name,
          job_title: email.job_title,
          company_name: email.company_name
        });
      }
    } else if (email.sentiment === 'NEGATIVE' || email.label === 'NOT_INTERESTED') {
      console.log(`  ❌ NEGATIVE: ${email.from_email}`);
      results.negative.push({ email: email.from_email, campaign: email.campaign_name });
      
      // Store negative pattern for learning
      await storeInSupermemory('reply_pattern', {
        text: text,
        sentiment: 'NEGATIVE',
        email: email.from_email,
        campaign_name: email.campaign_name
      });
    } else {
      console.log(`  😐 NEUTRAL: ${email.from_email}`);
      results.neutral.push({ email: email.from_email, campaign: email.campaign_name });
    }
    
    state.processedEmails.push(id);
    processed++;
  }
  
  saveState({ ...state, lastCheck: new Date().toISOString() });
  
  // Telegram report
  if (processed > 0) {
    let report = `📬 **REPLY MONITOR**\n\n`;
    if (results.positive.length) {
      report += `🔥 **HOT LEADS:**\n${results.positive.map(r => `• ${r.email}`).join('\n')}\n\n`;
    }
    if (results.ooo.length) {
      report += `📅 **OOO REPLIES:**\n${results.ooo.map(r => `• ${r.email}${r.returnDate ? ` (${r.returnDate})` : ''}`).join('\n')}\n\n`;
    }
    if (results.negative.length) {
      report += `❌ **NEGATIVE:** ${results.negative.length}\n`;
    }
    report += `\n🧠 Stored in Supermemory for learning`;
    await sendTelegram(report);
  }
  
  console.log(`\n---RESULTS---\n${JSON.stringify({ processed, ...results }, null, 2)}`);
}

main().catch(e => { console.error(e); process.exit(1); });
