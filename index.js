/**
 * GTM Engine Webhook Receiver
 *
 * Receives webhooks from PlusVibe, analyzes sentiment, and pushes updates to Close CRM.
 * Also integrates with Calendly for booking detection.
 */

const express = require('express');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');

// ============================================================
// Lazy Supabase client
// ============================================================
let _supabase = null;
function getSupabase() {
  if (_supabase) return _supabase;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.warn('[Supabase] Credentials not configured — OOO Supabase lookup unavailable');
    return null;
  }
  _supabase = createClient(url, key);
  return _supabase;
}

const CLOSE_API_KEY = process.env.CLOSE_API_KEY;
const PLUSVIBE_API_KEY = process.env.PLUSVIBE_API_KEY;
const PLUSVIBE_WORKSPACE_ID = process.env.PLUSVIBE_WORKSPACE_ID;

const app = express();
app.use(bodyParser.json());

// ============================================================
// Sentiment Classification
// ============================================================

const SENTIMENT_RULES = {
  INTERESTED: [
    /interested/i, /tell me more/i, /sounds good/i, /let's talk/i,
    /book a call/i, /schedule/i, /demo/i, /pricing/i
  ],
  BOOKING: [
    /book/i, /calendly/i, /schedule a (call|meeting|demo)/i,
    /what time/i, /available (monday|tuesday|wednesday|thursday|friday)/i
  ],
  OOO: [
    /out of office/i, /on vacation/i, /away until/i, /back on/i,
    /will return/i, /ooo/i, /on leave/i
  ],
  NEGATIVE: [
    /not interested/i, /remove me/i, /unsubscribe/i, /stop emailing/i,
    /do not contact/i, /don't contact/i, /wrong person/i, /opt.?out/i
  ],
  REFERRAL: [
    /you should talk to/i, /contact .+ instead/i, /reach out to/i,
    /the right person is/i, /forward this to/i
  ],
  QUESTION: [
    /\?\s*$/i, /can you (explain|tell|show)/i, /how does/i, /what is/i
  ],
  OBJECTION: [
    /too expensive/i, /not the right time/i, /already have/i,
    /use .+ instead/i, /competitor/i
  ]
};

function classifySentiment(body) {
  for (const [sentiment, patterns] of Object.entries(SENTIMENT_RULES)) {
    if (patterns.some(p => p.test(body))) return sentiment;
  }
  return 'NEUTRAL';
}

// ============================================================
// OOO Return Date Extraction
// ============================================================

function extractReturnDate(body) {
  const patterns = [
    /back on ([A-Za-z]+ \d{1,2},?\s*\d{0,4})/i,
    /return(?:ing)? on ([A-Za-z]+ \d{1,2},?\s*\d{0,4})/i,
    /away until ([A-Za-z]+ \d{1,2},?\s*\d{0,4})/i,
    /back ([A-Za-z]+ \d{1,2},?\s*\d{0,4})/i,
    /return(?:ing)? ([A-Za-z]+ \d{1,2},?\s*\d{0,4})/i,
  ];
  for (const p of patterns) {
    const m = body.match(p);
    if (m) return m[1].trim();
  }
  return null;
}

// ============================================================
// OOO Subsequence Resolution (3-tier)
// ============================================================

// Runtime cache for subsequence IDs
const _oooSubsequenceCache = new Map();

// Tier 0: env var static config
// OOO_SUBSEQUENCE_MAP format: "campaignId1:subId1,campaignId2:subId2"
function parseOOOSubsequenceMapEnv() {
  const raw = process.env.OOO_SUBSEQUENCE_MAP;
  if (!raw) return {};
  const map = {};
  for (const pair of raw.split(',')) {
    const [cId, sId] = pair.split(':');
    if (cId && sId) map[cId.trim()] = sId.trim();
  }
  return map;
}

async function getOOOSubsequenceId(campaignId) {
  // Fast path: runtime cache
  if (_oooSubsequenceCache.has(campaignId)) {
    return _oooSubsequenceCache.get(campaignId);
  }

  // Tier 0: env var
  const envMap = parseOOOSubsequenceMapEnv();
  if (envMap[campaignId]) {
    _oooSubsequenceCache.set(campaignId, envMap[campaignId]);
    return envMap[campaignId];
  }

  // Tier 1: Supabase lookup
  const supabase = getSupabase();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('campaign_config')
        .select('ooo_subsequence_id')
        .eq('campaign_id', campaignId)
        .single();
      if (!error && data?.ooo_subsequence_id) {
        _oooSubsequenceCache.set(campaignId, data.ooo_subsequence_id);
        return data.ooo_subsequence_id;
      }
    } catch (e) {
      console.warn('[OOO] Supabase lookup error:', e.message);
    }
  }

  // Tier 2: PlusVibe campaigns scan
  if (PLUSVIBE_API_KEY) {
    try {
      const resp = await fetch(
        `https://api.plusvibe.ai/api/v1/campaign/list?workspace_id=${PLUSVIBE_WORKSPACE_ID}&limit=100`,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json', 'x-api-key': PLUSVIBE_API_KEY }
        }
      );
      if (resp.ok) {
        const list = await resp.json();
        const campaigns = list.data || list.campaigns || [];
        // Find a campaign whose name contains "OOO" and is linked to our campaign
        const oooCampaign = campaigns.find(c =>
          (c.name || '').toUpperCase().includes('OOO') &&
          (c.parent_campaign_id === campaignId || c.name.includes(campaignId))
        );
        if (oooCampaign) {
          const subId = oooCampaign.id;
          _oooSubsequenceCache.set(campaignId, subId);
          return subId;
        }
      }
    } catch (e) {
      console.warn('[OOO] PlusVibe scan error:', e.message);
    }
  }

  // Tier 3: Not found
  console.warn(
    `[OOO] No subsequence found for campaign ${campaignId}. ` +
    `Configure via: (1) OOO_SUBSEQUENCE_MAP env var, ` +
    `(2) campaign_config Supabase table, or (3) name PlusVibe subsequence to include "OOO" + campaignId.`
  );
  return null;
}

// ============================================================
// OOO Handler
// ============================================================

async function handleOOOReply(leadId, campaignId, returnDate) {
  console.log(`[OOO] Lead ${leadId} is OOO, return date: ${returnDate || 'unknown'}`);

  const subsequenceId = await getOOOSubsequenceId(campaignId);

  if (!subsequenceId) {
    console.warn(`[OOO] Skipping subsequence enrollment for campaign ${campaignId} — not configured.`);
    return { enrolled: false, reason: 'no_subsequence_configured' };
  }

  // Enroll in OOO subsequence via PlusVibe
  try {
    const resp = await fetch('https://api.plusvibe.ai/api/v1/lead/subsequence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': PLUSVIBE_API_KEY },
      body: JSON.stringify({
        lead_id: leadId,
        subsequence_id: subsequenceId,
        metadata: { return_date: returnDate }
      })
    });

    if (!resp.ok) {
      const errorText = await resp.text();
      throw new Error(`PlusVibe API ${resp.status}: ${errorText}`);
    }

    console.log(`[OOO] ✅ Enrolled lead ${leadId} in OOO subsequence ${subsequenceId}`);
    return { enrolled: true, subsequenceId };
  } catch (err) {
    console.error('[OOO] Enrollment failed:', err.message);
    return { enrolled: false, reason: err.message };
  }
}

// ============================================================
// Close CRM Integration
// ============================================================

async function updateCloseContact(contactId, sentiment, returnDate) {
  const STATUS_MAP = {
    INTERESTED: 'Potential',
    BOOKING: 'Potential',
    NEGATIVE: 'Bad Fit',
    OOO: 'Potential',
    REFERRAL: 'Potential',
    QUESTION: 'Potential',
    OBJECTION: 'Potential',
    NEUTRAL: 'Potential'
  };

  const payload = {
    status: STATUS_MAP[sentiment] || 'Potential',
    custom: {
      reply_sentiment: sentiment,
      last_reply_date: new Date().toISOString()
    }
  };

  if (sentiment === 'OOO' && returnDate) {
    payload.custom.ooo_return_date = returnDate;
  }

  const resp = await fetch(`https://api.close.com/api/v1/contact/${contactId}/`, {
    method: 'PUT',
    headers: {
      'Authorization': `Basic ${Buffer.from(CLOSE_API_KEY + ':').toString('base64')}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!resp.ok) {
    const error = await resp.text();
    throw new Error(`Close API error: ${error}`);
  }

  return await resp.json();
}

// ============================================================
// Telegram Alerts
// ============================================================

async function sendTelegramAlert(message) {
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) return;

  await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: process.env.TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: 'Markdown'
    })
  });
}

// ============================================================
// Webhook Handler
// ============================================================

app.post('/webhook/plusvibe', async (req, res) => {
  try {
    const { lead_id, campaign_id, reply_body, from_email, from_name } = req.body;

    if (!lead_id || !reply_body) {
      return res.status(400).json({ error: 'Missing lead_id or reply_body' });
    }

    const sentiment = classifySentiment(reply_body);
    console.log(`[Webhook] Lead ${lead_id} replied — sentiment: ${sentiment}`);

    // OOO handling
    if (sentiment === 'OOO') {
      const returnDate = extractReturnDate(reply_body);
      await handleOOOReply(lead_id, campaign_id, returnDate);
    }

    // Update Close CRM
    if (CLOSE_API_KEY && req.body.close_contact_id) {
      await updateCloseContact(
        req.body.close_contact_id,
        sentiment,
        sentiment === 'OOO' ? extractReturnDate(reply_body) : null
      );
    }

    // Send Telegram alert for actionable replies
    if (['INTERESTED', 'BOOKING', 'NEGATIVE'].includes(sentiment)) {
      const emoji = sentiment === 'INTERESTED' ? '🟢' : sentiment === 'BOOKING' ? '📅' : '🔴';
      await sendTelegramAlert(
        `${emoji} *${sentiment} Reply*\n` +
        `From: ${from_name || from_email}\n` +
        `Campaign: ${campaign_id}\n` +
        `Preview: ${reply_body.substring(0, 150)}...`
      );
    }

    res.json({ success: true, sentiment });
  } catch (error) {
    console.error('[Webhook] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 GTM Engine webhook server running on port ${PORT}`);
});

module.exports = app;
