/**
 * Negative Reply Audit
 *
 * Runs on negative reply detection
 * - Researches the domain/company
 * - Diagnoses targeting issue
 * - Updates exclusion list
 * - Stores learnings in Supermemory
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
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '1244663682';
const EXCLUSION_FILE = path.join(__dirname, '.exclusion-list.json');

// Load exclusion list
function loadExclusions() {
  try {
    if (fs.existsSync(EXCLUSION_FILE)) {
      return JSON.parse(fs.readFileSync(EXCLUSION_FILE, 'utf8'));
    }
  } catch (e) { console.error('Load exclusions error:', e); }
  return { domains: [], roles: [], companies: [] };
}

function saveExclusions(data) {
  try {
    fs.writeFileSync(EXCLUSION_FILE, JSON.stringify(data, null, 2));
  } catch (e) { console.error('Save exclusions error:', e); }
}

// Research company/domain
async function researchCompany(domain, email) {
  console.log(`   🔍 Researching ${domain}...`);
  
  // Extract company info from email domain
  const companyName = email.split('@')[1].split('.')[0];
  
  // In production, use LinkedIn/HyperBrowser API
  // For now, log for manual review
  
  return {
    domain,
    companyName,
    issue: 'negative_reply',
    timestamp: new Date().toISOString()
  };
}

// Diagnose targeting issue
function diagnoseIssue(reply, companyData) {
  const issues = [];
  
  const text = (reply.body_text || reply.body || '').toLowerCase();
  
  // Wrong role
  if (/wrong person/i.test(text) || /not (me|my role|i don't)/i.test(text)) {
    issues.push({
      type: 'wrong_role',
      recommendation: 'Filter by job title before targeting',
      severity: 'high'
    });
  }
  
  // Wrong industry
  if (/not (in|relevant|our market)/i.test(text) || /different (industry|sector)/i.test(text)) {
    issues.push({
      type: 'wrong_industry',
      recommendation: 'Add industry filter to targeting',
      severity: 'high'
    });
  }
  
  // Wrong company size
  if (/too (small|large)/i.test(text) || /not our (size|客户)/i.test(text)) {
    issues.push({
      type: 'wrong_size',
      recommendation: 'Add employee count filter',
      severity: 'medium'
    });
  }
  
  // Geographic
  if (/not (in|here|location)/i.test(text) || /different (country|region)/i.test(text)) {
    issues.push({
      type: 'wrong_geo',
      recommendation: 'Add geographic filter',
      severity: 'medium'
    });
  }
  
  // Generic negative
  if (/not interested/i.test(text) || /not looking/i.test(text)) {
    issues.push({
      type: 'generic_negative',
      recommendation: 'Review messaging angle',
      severity: 'low'
    });
  }
  
  return issues;
}

// Add to exclusion list
function addToExclusion(domain, company, reason) {
  const exclusions = loadExclusions();
  
  if (!exclusions.domains.includes(domain)) {
    exclusions.domains.push({
      domain,
      reason,
      addedAt: new Date().toISOString()
    });
  }
  
  saveExclusions(exclusions);
  console.log(`   🚫 Added ${domain} to exclusion list`);
}

// Send Telegram alert
async function sendAlert(reply, diagnosis) {
  if (!TELEGRAM_BOT_TOKEN) return;
  
  const message = `🔴 <b>NEGATIVE REPLY AUDIT</b>

<b>Domain:</b> ${reply.from_email?.split('@')[1]}
<b>Company:</b> ${reply.from_email}
<b>Campaign:</b> ${reply.campaign_name}

<b>Reply:</b>
<i>${(reply.body_text || reply.body || '').substring(0, 200)}...</i>

<b>Diagnosis:</b>
${diagnosis.issues.map(i => `• ${i.type}: ${i.recommendation}`).join('\n') || '• Generic negative - no specific issue'}

<b>Action Taken:</b>
${diagnosis.excluded ? '🚫 Added to exclusion list' : '• Under review'}

---
<a href="https://plusvibe.ai">View in PlusVibe</a>`;
  
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
async function storeLearning(reply, diagnosis) {
  // TODO: Integrate with supermemory.js
  console.log(`   📦 Storing negative reply learning`);
}

// Main - Process a negative reply
async function processNegativeReply(reply) {
  console.log(`\n[Negative Reply Audit] Processing negative reply...`);
  console.log(`   From: ${reply.from_email}`);
  console.log(`   Campaign: ${reply.campaign_name}`);
  
  // Research company
  const domain = reply.from_email?.split('@')[1];
  const companyData = await researchCompany(domain, reply.from_email);
  
  // Diagnose issue
  const diagnosis = {
    reply,
    companyData,
    issues: diagnoseIssue(reply, companyData),
    excluded: false
  };
  
  // If clear targeting error, add to exclusion
  const highSeverityIssues = diagnosis.issues.filter(i => i.severity === 'high');
  if (highSeverityIssues.length > 0) {
    addToExclusion(domain, companyData.companyName, highSeverityIssues[0].type);
    diagnosis.excluded = true;
  }
  
  // Send alert
  await sendAlert(reply, diagnosis);
  
  // Store learning
  await storeLearning(reply, diagnosis);
  
  console.log('   ✅ Audit complete');
  return diagnosis;
}

// Run standalone
async function main() {
  const args = process.argv.slice(2);
  const email = args.find(a => a.startsWith('--email='))?.split('=')[1];
  
  if (!email) {
    console.log('Usage: node negative-reply-audit.js --email=john@company.com');
    return;
  }
  
  // Mock reply for testing
  const mockReply = {
    from_email: email,
    campaign_name: 'Test Campaign',
    body_text: 'Wrong person - not interested in this'
  };
  
  await processNegativeReply(mockReply);
}

module.exports = { processNegativeReply };

if (require.main === module) {
  main().catch(console.error);
}
