/**
 * Lead Alerts
 *
 * Runs hourly
 * Alerts when lead count drops below threshold
 */

require('dotenv').config();
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

// Load .env from same directory
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
}

// Configuration
const PLUSVIBE_API_KEY = process.env.PLUSVIBE_API_KEY;
const PLUSVIBE_WORKSPACE_ID = process.env.PLUSVIBE_WORKSPACE_ID || '678eb62a071ff7544034bcde';
const LEAD_THRESHOLD = 500;
const STATE_FILE = path.join(__dirname, '.lead-alerts-state.json');

// Load state
function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
  } catch (e) { console.error('State load error:', e); }
  return {
    lastLeadCount: null,
    lastAlertDate: null,
    alertsSent: 0
  };
}

function saveState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) { console.error('State save error:', e); }
}

// Get lead counts from PlusVibe
async function getLeadCounts() {
  if (!PLUSVIBE_API_KEY) {
    console.log('   PlusVibe API key not configured');
    return null;
  }
  
  try {
    const response = await fetch(
      `https://api.plusvibe.ai/api/v1/lead/counts?workspace_id=${PLUSVIBE_WORKSPACE_ID}`,
      {
        headers: { 'x-api-key': PLUSVIBE_API_KEY }
      }
    );
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('   Error fetching lead counts:', error.message);
    return null;
  }
}

// Send Telegram alert
async function sendAlert(counts) {
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID || '1244663682';
  
  if (!telegramToken) return;
  
  const message = `📊 <b>Lead Alert</b>

<b>Current Status:</b>
• Interested: ${counts.interested || 'N/A'}
• Not Interested: ${counts.not_interested || 'N/A'}
• OOO: ${counts.ooo || 'N/A'}
• Total Processed: ${counts.total || 'N/A'}

⚠️ <b>Action Needed:</b>
Import fresh leads to maintain campaign momentum.

🔧 <a href="https://plusvibe.ai">Open PlusVibe</a>`;
  
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
  console.log('[Lead Alerts] Checking lead counts...');
  
  const counts = await getLeadCounts();
  
  if (!counts) {
    console.log('   Could not fetch lead counts');
    return;
  }
  
  const state = loadState();
  const today = new Date().toISOString().split('T')[0];
  
  // Check if we should alert (only once per day if below threshold)
  const total = counts.total || 0;
  const shouldAlert = total < LEAD_THRESHOLD && state.lastAlertDate !== today;
  
  console.log(`   Total Leads: ${total}`);
  console.log(`   Threshold: ${LEAD_THRESHOLD}`);
  console.log(`   Should Alert: ${shouldAlert}`);
  
  if (shouldAlert) {
    await sendAlert(counts);
    state.lastAlertDate = today;
    state.alertsSent++;
    saveState(state);
  }
  
  state.lastLeadCount = total;
  saveState(state);
  
  console.log('[Lead Alerts] Complete');
}

main().catch(console.error);
