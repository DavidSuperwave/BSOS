/**
 * GTM Engine Webhook Receiver
 *
 * Receives webhooks from PlusVibe, analyzes sentiment, and pushes to Close CRM
 *
 * Endpoints:
 * - POST /webhook/gtm-engine-replies  → Main GTM Engine webhook
 * - POST /webhook/plusvibe-interested-lead → Legacy interested lead webhook
 * - GET /health → Health check
 */

require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

// Load .env from same directory
const envPath = path.join(__dirname, '.env');
if (require('fs').existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
}

const app = express();
app.use(express.json());

// Environment variables
const PORT = process.env.PORT || 3000;
const CLOSE_API_KEY = process.env.CLOSE_API_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '1244663682';
const PLUSVIBE_API_KEY = process.env.PLUSVIBE_API_KEY;
const PLUSVIBE_WORKSPACE_ID = process.env.PLUSVIBE_WORKSPACE_ID || '678eb62a071ff7544034bcde';

// Close CRM Status IDs
const CLOSE_STATUSES = {
  INTERESTED: 'stat_YZPfE0rqYeUym9EF0twuDwZl6dYKUzpSG11PwLPYVTQ',
  POTENTIAL: 'stat_vJnznN7N4fJTSxi9pn1M6hbs4RfeuCbu124DX8bIUz0',
  BAD_FIT: 'stat_v8gPNNVhTBlqy8fpsn8otCbrk0UNZwmjpSVdCGdWCFq',
  DNC: 'stat_11Jd3OGv3Ot7nC2esu6OhRMj5EyJmUH2xSHfHGXtMgj',
  NURTURE: 'stat_4UtQuE9aIUZ1Y4Imr8UavuubTSlbWZo2LYgqfOsfFPO'
};

// ============================================
// OOO DETECTION & SUBSEQUENCE
// ============================================

const OOO_PATTERNS = [
  /out of (the )?office/i,
  /away from (the )?office/i,
  /on (annual |paid )?leave/i,
  /on vacation/i,
  /on holiday/i,
  /currently (away|unavailable|traveling)/i,
  /will (be )?(back|return)/i,
  /auto(-| )?reply/i,
  /automatic reply/i,
  /i('m| am) (away|out|traveling)/i,
  /limited access to email/i,
  /checking email (infrequently|periodically)/i,
  /respond when i return/i,
  /back in the office/i,
  /maternity leave/i,
  /paternity leave/i,
  /sabbatical/i
];

function detectOOO(text) {
  if (!text) return { isOOO: false };
  
  const lowerText = text.toLowerCase();
  
  for (const pattern of OOO_PATTERNS) {
    if (pattern.test(text)) {
      // Try to extract return date
      const returnDate = extractReturnDate(text);
      return { 
        isOOO: true, 
        returnDate,
        matched: pattern.toString()
      };
    }
  }
  
  return { isOOO: false };
}

function extractReturnDate(text) {
  // Common date patterns
  const datePatterns = [
    // "back on January 15" or "return on Jan 15th"
    /(?:back|return|available)(?:\s+on)?\s+(\w+\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?)/i,
    // "back 1/15" or "return 01/15/2026"
    /(?:back|return|available)(?:\s+on)?\s+(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/i,
    // "back Monday" or "return next week"
    /(?:back|return|available)\s+(monday|tuesday|wednesday|thursday|friday|next week|next monday)/i,
    // "until January 15"
    /until\s+(\w+\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?)/i
  ];
  
  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1];
    }
  }
  
  return null;
}

// ============================================
// PLUSVIBE API - SUBSEQUENCE MANAGEMENT
// ============================================

async function plusvibeApiRequest(endpoint, method = 'GET', body = null) {
  if (!PLUSVIBE_API_KEY) {
    console.error('PLUSVIBE_API_KEY not configured');
    return null;
  }

  const options = {
    method,
    headers: {
      'x-api-key': PLUSVIBE_API_KEY,
      'Content-Type': 'application/json'
    }
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const url = endpoint.includes('?') 
      ? `https://api.plusvibe.ai/api/v1${endpoint}`
      : `https://api.plusvibe.ai/api/v1${endpoint}`;
    const response = await fetch(url, options);
    return await response.json();
  } catch (error) {
    console.error('PlusVibe API error:', error);
    return null;
  }
}

async function addLeadToSubsequence(leadId, parentCampaignId, subsequenceCampaignId) {
  // Add lead to OOO follow-up subsequence
  const result = await plusvibeApiRequest('/lead/add-to-subsequence', 'POST', {
    workspace_id: PLUSVIBE_WORKSPACE_ID,
    parent_campaign_id: parentCampaignId,
    subsequence_campaign_id: subsequenceCampaignId,
    lead_ids: [leadId]
  });
  
  return result;
}

// Store OOO subsequence IDs per campaign (runtime cache)
const OOO_SUBSEQUENCES = {};

// Load OOO mappings from env var if configured
// Format: "parentId1:subId1,parentId2:subId2"
if (process.env.OOO_SUBSEQUENCE_MAP) {
  process.env.OOO_SUBSEQUENCE_MAP.split(',').forEach(pair => {
    const [parent, sub] = pair.trim().split(':');
    if (parent && sub) OOO_SUBSEQUENCES[parent] = sub;
  });
  console.log(`[OOO] Loaded ${Object.keys(OOO_SUBSEQUENCES).length} subsequence mappings from env`);
}

async function getOrCreateOOOSubsequence(parentCampaignId, campaignName) {
  // 1. Check runtime cache
  if (OOO_SUBSEQUENCES[parentCampaignId]) {
    return OOO_SUBSEQUENCES[parentCampaignId];
  }

  // 2. Try Supabase config table
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (supabaseUrl && supabaseKey) {
    try {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/campaign_config?parent_campaign_id=eq.${encodeURIComponent(parentCampaignId)}&select=ooo_subsequence_id`,
        {
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json'
          },
          signal: AbortSignal.timeout(5000)
        }
      );
      if (res.ok) {
        const rows = await res.json();
        if (rows.length > 0 && rows[0].ooo_subsequence_id) {
          OOO_SUBSEQUENCES[parentCampaignId] = rows[0].ooo_subsequence_id;
          console.log(`[OOO] Found subsequence ${rows[0].ooo_subsequence_id} for campaign ${campaignName} from Supabase`);
          return rows[0].ooo_subsequence_id;
        }
      }
    } catch (err) {
      console.warn(`[OOO] Supabase config lookup failed: ${err.message}`);
    }
  }

  // 3. Try finding an existing OOO subsequence via PlusVibe campaigns list
  if (PLUSVIBE_API_KEY) {
    try {
      const campaigns = await plusvibeApiRequest(`/campaign/list?workspace_id=${PLUSVIBE_WORKSPACE_ID}`);
      if (campaigns && Array.isArray(campaigns.data)) {
        const oooSub = campaigns.data.find(c =>
          c.parent_campaign_id === parentCampaignId &&
          (c.name || '').toLowerCase().includes('ooo')
        );
        if (oooSub) {
          OOO_SUBSEQUENCES[parentCampaignId] = oooSub.id;
          console.log(`[OOO] Found existing OOO subsequence ${oooSub.id} ("${oooSub.name}") via PlusVibe`);
          return oooSub.id;
        }
      }
    } catch (err) {
      console.warn(`[OOO] PlusVibe campaign lookup failed: ${err.message}`);
    }
  }

  // 4. No subsequence found — log for manual configuration
  console.warn(`[OOO] No OOO subsequence configured for campaign: ${campaignName} (${parentCampaignId}). ` +
    `Set OOO_SUBSEQUENCE_MAP env var or create a campaign_config row in Supabase.`);
  return null;
}

// ============================================
// CLOSE CRM INTEGRATION
// ============================================

async function closeApiRequest(endpoint, method = 'GET', body = null) {
  if (!CLOSE_API_KEY) {
    console.error('CLOSE_API_KEY not configured');
    return null;
  }

  const auth = Buffer.from(`${CLOSE_API_KEY}:`).toString('base64');
  
  const options = {
    method,
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json'
    }
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(`https://api.close.com/api/v1${endpoint}`, options);
    return await response.json();
  } catch (error) {
    console.error('Close API error:', error);
    return null;
  }
}

async function createCloseLead(payload) {
  const { 
    email, first_name, last_name, company_name, job_title,
    campaign_name, text_body, sentiment, webhook_event
  } = payload;

  // Determine status based on sentiment/event
  let statusId = CLOSE_STATUSES.POTENTIAL;
  let priority = 'warm';
  
  if (webhook_event === 'LEAD_MARKED_AS_INTERESTED' || sentiment === 'POSITIVE') {
    statusId = CLOSE_STATUSES.INTERESTED;
    priority = 'hot';
  } else if (webhook_event === 'LEAD_MARKED_AS_NOT_INTERESTED') {
    statusId = CLOSE_STATUSES.BAD_FIT;
    priority = 'none';
  } else if (sentiment === 'NEGATIVE') {
    statusId = CLOSE_STATUSES.BAD_FIT;
    priority = 'none';
  } else if (sentiment === 'NEUTRAL') {
    statusId = CLOSE_STATUSES.NURTURE;
    priority = 'nurture';
  }

  // Create lead
  const leadData = {
    name: company_name || `${first_name} ${last_name}`,
    status_id: statusId,
    contacts: [{
      name: `${first_name || ''} ${last_name || ''}`.trim() || 'Unknown',
      title: job_title || '',
      emails: [{ email: email, type: 'office' }]
    }]
  };

  const lead = await closeApiRequest('/lead/', 'POST', leadData);
  
  if (lead && lead.id) {
    // Add note with follow-up instructions
    const note = generateFollowUpNote(payload, priority);
    await closeApiRequest('/activity/note/', 'POST', {
      lead_id: lead.id,
      note: note
    });
    
    return { lead, priority };
  }
  
  return null;
}

function generateFollowUpNote(payload, priority) {
  const { 
    campaign_name, text_body, sentiment, webhook_event, 
    step, variation, email_account_name 
  } = payload;

  const priorityEmoji = {
    hot: '🔥',
    warm: '🟡',
    nurture: '🌱',
    none: '⚫'
  };

  let instructions = '';
  if (priority === 'hot') {
    instructions = `
FOLLOW-UP INSTRUCTIONS:
1. Respond within 2 hours
2. Offer free deliverability audit
3. Book 15-min discovery call
4. Mention specific pain from their reply`;
  } else if (priority === 'warm') {
    instructions = `
FOLLOW-UP INSTRUCTIONS:
1. Respond within 24 hours
2. Ask clarifying questions
3. Send relevant case study`;
  } else if (priority === 'nurture') {
    instructions = `
FOLLOW-UP INSTRUCTIONS:
1. Add to nurture sequence
2. Send value content weekly
3. Re-engage in 30 days`;
  }

  return `${priorityEmoji[priority] || ''} GTM ENGINE - ${webhook_event}

CAMPAIGN: ${campaign_name || 'Unknown'}
SENTIMENT: ${sentiment || 'Unknown'}
STEP: ${step || 1} | VARIANT: ${variation || 'A'}
SENDER: ${email_account_name || 'Unknown'}

REPLY CONTENT:
${text_body || 'No text content'}

${instructions}

---
Priority: ${priority.toUpperCase()}
Source: PlusVibe Webhook
Processed: ${new Date().toISOString()}`;
}

// ============================================
// TELEGRAM NOTIFICATIONS
// ============================================

async function sendTelegramNotification(message) {
  if (!TELEGRAM_BOT_TOKEN) return;
  
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'HTML'
      })
    });
  } catch (error) {
    console.error('Telegram notification error:', error);
  }
}

// ============================================
// WEBHOOK HANDLERS
// ============================================

// Main GTM Engine webhook
app.post('/webhook/gtm-engine-replies', async (req, res) => {
  const payload = req.body;
  
  console.log(`[GTM Engine] Received: ${payload.webhook_event} from ${payload.email}`);
  
  try {
    const { 
      webhook_event, sentiment, email, first_name, last_name, 
      campaign_name, campaign_id, text_body, lead_id 
    } = payload;
    
    // STEP 1: Check for OOO auto-reply
    const oooCheck = detectOOO(text_body);
    
    if (oooCheck.isOOO) {
      console.log(`[GTM Engine] OOO detected from ${email}, return date: ${oooCheck.returnDate || 'unknown'}`);
      
      // Add to OOO follow-up subsequence
      const subsequenceId = await getOrCreateOOOSubsequence(campaign_id, campaign_name);
      
      if (subsequenceId && lead_id) {
        await addLeadToSubsequence(lead_id, campaign_id, subsequenceId);
        console.log(`[GTM Engine] Added ${email} to OOO subsequence`);
      }
      
      // Send notification
      const message = `📅 <b>OOO REPLY DETECTED</b>

<b>From:</b> ${first_name} ${last_name}
<b>Email:</b> ${email}
<b>Campaign:</b> ${campaign_name}
<b>Return Date:</b> ${oooCheck.returnDate || 'Not specified'}

<b>Reply:</b>
<i>${(text_body || '').substring(0, 200)}...</i>

🔄 ${subsequenceId ? 'Added to OOO follow-up sequence' : 'No subsequence configured - manual follow-up needed'}`;

      await sendTelegramNotification(message);
      
      return res.json({ 
        status: 'success', 
        action: 'ooo_detected',
        returnDate: oooCheck.returnDate,
        addedToSubsequence: !!subsequenceId
      });
    }
    
    // STEP 2: Route based on event type (non-OOO replies)
    if (webhook_event === 'LEAD_MARKED_AS_INTERESTED' || 
        webhook_event === 'ALL_POSITIVE_REPLIES' ||
        sentiment === 'POSITIVE') {
      
      // Create Close lead
      const result = await createCloseLead(payload);
      
      if (result) {
        // Send Telegram notification
        const message = `🎯 <b>NEW INTERESTED LEAD</b>

<b>From:</b> ${first_name} ${last_name}
<b>Email:</b> ${email}
<b>Campaign:</b> ${campaign_name}
<b>Sentiment:</b> ${sentiment}

<b>Reply:</b>
<i>${(text_body || '').substring(0, 200)}...</i>

✅ Created in Close CRM
🔥 Priority: ${result.priority.toUpperCase()}`;

        await sendTelegramNotification(message);
      }
      
      res.json({ status: 'success', action: 'created_lead', priority: result?.priority });
      
    } else if (webhook_event === 'LEAD_MARKED_AS_NOT_INTERESTED' || sentiment === 'NEGATIVE') {
      
      // Log for targeting analysis (don't create lead)
      console.log(`[GTM Engine] Negative reply from ${email} - logging for analysis`);
      
      // Could add domain to blocklist or log for targeting review
      const message = `❌ <b>NEGATIVE REPLY</b>

<b>From:</b> ${first_name} ${last_name}
<b>Email:</b> ${email}
<b>Campaign:</b> ${campaign_name}

<b>Reply:</b>
<i>${(text_body || '').substring(0, 200)}...</i>

⚠️ Review targeting for this segment`;

      await sendTelegramNotification(message);
      
      res.json({ status: 'success', action: 'logged_negative' });
      
    } else {
      // Neutral - just log
      console.log(`[GTM Engine] Neutral reply from ${email}`);
      res.json({ status: 'success', action: 'logged_neutral' });
    }
    
  } catch (error) {
    console.error('[GTM Engine] Error processing webhook:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Legacy webhook (backwards compatibility)
app.post('/webhook/plusvibe-interested-lead', async (req, res) => {
  const payload = req.body;
  console.log(`[Legacy] Received interested lead: ${payload.email}`);
  
  // Forward to main handler
  req.body.webhook_event = 'LEAD_MARKED_AS_INTERESTED';
  return app._router.handle(req, res, () => {});
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'gtm-engine-webhooks',
    timestamp: new Date().toISOString(),
    close_configured: !!CLOSE_API_KEY,
    telegram_configured: !!TELEGRAM_BOT_TOKEN
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'GTM Engine Webhook Receiver',
    version: '1.0.0',
    endpoints: [
      'POST /webhook/gtm-engine-replies',
      'POST /webhook/plusvibe-interested-lead',
      'GET /health'
    ]
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`GTM Engine Webhook Receiver running on port ${PORT}`);
  console.log(`Close CRM: ${CLOSE_API_KEY ? 'Configured' : 'NOT CONFIGURED'}`);
  console.log(`Telegram: ${TELEGRAM_BOT_TOKEN ? 'Configured' : 'NOT CONFIGURED'}`);
});
