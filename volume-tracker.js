/**
 * Volume Tracker
 *
 * Runs daily at 8:00 AM
 * Reports on email account capacity and usage
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
const STATE_FILE = path.join(__dirname, '.volume-tracker-state.json');

// Load state
function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
  } catch (e) { console.error('State load error:', e); }
  return { lastReportDate: null, accounts: [] };
}

function saveState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) { console.error('State save error:', e); }
}

// Get accounts from PlusVibe
async function getAccounts() {
  if (!PLUSVIBE_API_KEY) {
    console.log('   PlusVibe API key not configured');
    return [];
  }
  
  try {
    const response = await fetch(
      `https://api.plusvibe.ai/api/v1/account/list?workspace_id=${PLUSVIBE_WORKSPACE_ID}`,
      {
        headers: { 'x-api-key': PLUSVIBE_API_KEY }
      }
    );
    
    const data = await response.json();
    return data.accounts || [];
  } catch (error) {
    console.error('   Error fetching accounts:', error.message);
    return [];
  }
}

// Analyze capacity
function analyzeCapacity(accounts) {
  return accounts.map(account => {
    const isActive = account.status === 'ACTIVE';
    const warmupActive = account.warmup_status === 'ACTIVE';
    
    return {
      email: account.email,
      status: account.status,
      warmupStatus: account.warmup_status,
      provider: account.provider,
      needsAttention: !isActive || !warmupActive
    };
  });
}

// Generate report
function generateReport(accounts, analysis) {
  const activeAccounts = analysis.filter(a => a.status === 'ACTIVE').length;
  const warmingAccounts = analysis.filter(a => a.warmupStatus === 'ACTIVE').length;
  const needsAttention = analysis.filter(a => a.needsAttention).length;
  
  let report = `📊 <b>Email Volume Report</b>

<b>Date:</b> ${new Date().toLocaleDateString()}

<b>Account Summary:</b>
• Total Accounts: ${accounts.length}
• Active: ${activeAccounts}
• In Warmup: ${warmingAccounts}
• Needs Attention: ${needsAttention}

<b>Account Details:</b>
`;
  
  analysis.forEach(account => {
    const statusEmoji = account.needsAttention ? '⚠️' : '✅';
    report += `${statusEmoji} ${account.email} (${account.provider})\n`;
    report += `   Status: ${account.status} | Warmup: ${account.warmupStatus}\n\n`;
  });
  
  // Capacity recommendations
  report += `<b>Capacity Status:</b>\n`;
  if (activeAccounts >= 3) {
    report += `✅ Good capacity for scaling\n`;
  } else if (activeAccounts === 1) {
    report += `⚠️ Limited capacity - consider adding accounts\n`;
  } else {
    report += `🔴 Critical - need more accounts\n`;
  }
  
  return report;
}

// Send report to Telegram
async function sendReport(report) {
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID || '1244663682';
  
  if (!telegramToken) {
    console.log('   Telegram not configured');
    return;
  }
  
  try {
    await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: report, parse_mode: 'HTML' })
    });
    console.log('   ✅ Report sent');
  } catch (error) {
    console.error('   ❌ Report failed:', error.message);
  }
}

// Main
async function main() {
  console.log('[Volume Tracker] Generating daily report...');
  
  const accounts = await getAccounts();
  const analysis = analyzeCapacity(accounts);
  
  console.log(`   Accounts: ${accounts.length}`);
  console.log(`   Active: ${analysis.filter(a => a.status === 'ACTIVE').length}`);
  
  const report = generateReport(accounts, analysis);
  
  // Only send on weekdays
  const today = new Date();
  const dayOfWeek = today.getDay();
  
  if (dayOfWeek >= 1 && dayOfWeek <= 5) { // Mon-Fri
    await sendReport(report);
  } else {
    console.log('   Weekend - report not sent');
  }
  
  // Save state
  const state = loadState();
  state.lastReportDate = today.toISOString();
  state.accounts = analysis;
  saveState(state);
  
  console.log('[Volume Tracker] Complete');
}

main().catch(console.error);
