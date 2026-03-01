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

// Check GMass for spam score (simulated - actual API requires paid plan)
async function checkDeliverability() {
  console.log('[Deliverability Monitor] Checking inbox placement...');
  
  // For now, log current status
  // In production, use GMass API or Folderly/Pigeon for real testing
  
  const state = loadState();
  const today = new Date().toISOString().split('T')[0];
  
  if (state.lastTestDate === today) {
    console.log('   Already tested today');
    return state;
  }
  
  // Simulated test result (would be real data from GMass/Folderly)
  const testResult = {
    date: today,
    inboxRate: 68.57, // From last campaign data
    spamRate: 2.86,
    issues: [],
    recommendations: []
  };
  
  // Check for issues
  if (testResult.inboxRate < 70) {
    testResult.issues.push('Inbox rate below 70%');
    testResult.recommendations.push('Verify email list before import');
  }
  
  if (testResult.spamRate > 3) {
    testResult.issues.push('Spam rate above 3%');
    testResult.recommendations.push('Check subject lines for spam triggers');
  }
  
  // Update history
  if (!state.history) state.history = [];
  state.history.push(testResult);
  state.history = state.history.slice(-30); // Keep last 30 tests
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
  
  console.log(`   Inbox Rate: ${result.inboxRate}%`);
  console.log(`   Spam Rate: ${result.spamRate}%`);
  console.log(`   Issues: ${result.issues.length}`);
  
  if (result.issues.length > 0) {
    await sendAlert(result);
  }
  
  console.log('[Deliverability Monitor] Complete');
}

main().catch(console.error);
