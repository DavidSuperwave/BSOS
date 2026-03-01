/**
 * Enhanced Reply Monitor with 8-Sentiment Classification
 *
 * Replaces basic reply-monitor.js with full sentiment analysis
 *
 * Sentiment Categories:
 * - positive_interested: Wants to learn more
 * - positive_meeting: Asks to book meeting
 * - neutral_question: Has questions, not ready
 * - neutral_not_now: Not interested right now
 * - negative_not_fit: Not a fit
 * - negative_unsubscribe: Explicit unsubscribe
 * - negative_hostile: Hostile response
 * - auto_ooo: Out of office
 * - auto_bounce: Email bounce
 */

require('dotenv').config();
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

// Load .env
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
}

// Configuration
const PLUSVIBE_API_KEY = process.env.PLUSVIBE_API_KEY;
const PLUSVIBE_WORKSPACE_ID = process.env.PLUSVIBE_WORKSPACE_ID || '678eb62a071ff7544034bcde';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '1244663682';

// Sentiment Patterns
const PATTERNS = {
  positive_interested: [
    /tell me more/i,
    /interested/i,
    /sounds good/i,
    /let's talk/i,
    /book a call/i,
    /schedule/i,
    /would love to/i,
    /could you send/i,
    /more info/i,
    /learn more/i
  ],
  positive_meeting: [
    /book a meeting/i,
    /set up a call/i,
    /when are you free/i,
    /let's schedule/i,
    /can we meet/i,
    /demo/i,
    /show me/i
  ],
  negative_unsubscribe: [
    /unsubscribe/i,
    /take me off/i,
    /remove me/i,
    /stop emailing/i,
    /don't contact/i,
    /no more/i
  ],
  negative_hostile: [
    /go away/i,
    /never contact/i,
    /harassment/i,
    /spam/i,
    /leave me alone/i,
    /f\*\*k off/i,
    /asshole/i
  ],
  auto_ooo: [
    /out of (the )?office/i,
    /away from (the )?office/i,
    /on (annual |paid )?leave/i,
    /on vacation/i,
    /will (be )?(back|return)/i,
    /auto(-| )?reply/i,
    /automatic reply/i,
    /limited access to email/i,
    /maternity leave/i,
    /paternity leave/i,
    /sabbatical/i
  ]
};

// Classify sentiment
function classifySentiment(text) {
  if (!text) return 'unknown';
  
  const lowerText = text.toLowerCase();
  
  // Check auto-replies first
  for (const pattern of PATTERNS.auto_ooo) {
    if (pattern.test(lowerText)) return 'auto_ooo';
  }
  
  // Check positive
  for (const pattern of PATTERNS.positive_meeting) {
    if (pattern.test(lowerText)) return 'positive_meeting';
  }
  for (const pattern of PATTERNS.positive_interested) {
    if (pattern.test(lowerText)) return 'positive_interested';
  }
  
  // Check negative
  for (const pattern of PATTERNS.negative_hostile) {
    if (pattern.test(lowerText)) return 'negative_hostile';
  }
  for (const pattern of PATTERNS.negative_unsubscribe) {
    if (pattern.test(lowerText)) return 'negative_unsubscribe';
  }
  
  // Check neutral
  if (/not (now|interested|ready|looking)/i.test(lowerText)) {
    return 'neutral_not_now';
  }
  if (/question/i.test(lowerText) || /\?$/.test(lowerText.trim())) {
    return 'neutral_question';
  }
  if (/not (a )?fit/i.test(lowerText) || /wrong/i.test(lowerText)) {
    return 'negative_not_fit';
  }
  
  // Default
  return 'neutral_not_now';
}

// Get replies from PlusVibe
async function getReplies() {
  if (!PLUSVIBE_API_KEY) {
    console.log('PlusVibe API key not configured');
    return [];
  }
  
  try {
    const response = await fetch(
      `https://api.plusvibe.ai/api/v1/unibox/emails?workspace_id=${PLUSVIBE_WORKSPACE_ID}&limit=50`,
      {
        headers: { 'x-api-key': PLUSVIBE_API_KEY }
      }
    );
    
    const data = await response.json();
    return data.data || [];
  } catch (error) {
    console.error('Error fetching replies:', error.message);
    return [];
  }
}

// Send Telegram alert
async function sendAlert(reply, sentiment) {
  if (!TELEGRAM_BOT_TOKEN) return;
  
  const emoji = {
    positive_interested: '🎯',
    positive_meeting: '📅',
    neutral_question: '❓',
    neutral_not_now: '⏳',
    negative_not_fit: '❌',
    negative_unsubscribe: '🛑',
    negative_hostile: '😠',
    auto_ooo: '📅',
    auto_bounce: '📧'
  };
  
  const priority = {
    positive_meeting: 'hot',
    positive_interested: 'warm',
    neutral_question: 'warm',
    neutral_not_now: 'nurture',
    negative_not_fit: 'none',
    negative_unsubscribe: 'none',
    negative_hostile: 'none',
    auto_ooo: 'nurture',
    auto_bounce: 'none'
  };
  
  const message = `${emoji[sentiment] || '📧'} <b>${sentiment.toUpperCase().replace(/_/g, ' ')}</b>

<b>From:</b> ${reply.from_email || reply.email}
<b>Campaign:</b> ${reply.campaign_name || reply.campaign_id}
<b>Priority:</b> ${priority[sentiment] || 'unknown'}

${(reply.body_text || reply.body || '').substring(0, 300)}

---
Processed: ${new Date().toISOString()}`;
  
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
    console.error('Telegram error:', error.message);
  }
}

// Store in Supermemory
async function storeLearning(reply, sentiment) {
  // This will integrate with supermemory.js
  console.log(`   📦 Storing learning: ${sentiment}`);
  // TODO: Call supermemory.storeLearning()
}

// Main
async function main() {
  console.log('[Enhanced Reply Monitor] Checking replies...');
  
  const replies = await getReplies();
  
  if (replies.length === 0) {
    console.log('REPLY_MONITOR_OK');
    return;
  }
  
  console.log(`Found ${replies.length} replies`);
  
  let processed = 0;
  let bySentiment = {};
  
  for (const reply of replies) {
    const text = reply.body_text || reply.body || '';
    const sentiment = classifySentiment(text);
    
    bySentiment[sentiment] = (bySentiment[sentiment] || 0) + 1;
    
    // Alert on important sentiments
    if (['positive_meeting', 'positive_interested', 'negative_hostile', 'negative_unsubscribe'].includes(sentiment)) {
      await sendAlert(reply, sentiment);
    }
    
    // Store learning
    await storeLearning(reply, sentiment);
    
    processed++;
  }
  
  console.log('\n📊 Sentiment Breakdown:');
  for (const [sentiment, count] of Object.entries(bySentiment)) {
    console.log(`   ${sentiment}: ${count}`);
  }
  
  console.log(`\n✅ Processed ${processed} replies`);
}

main().catch(console.error);
