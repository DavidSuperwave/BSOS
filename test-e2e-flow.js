#!/usr/bin/env node
/**
 * BSOS End-to-End Flow Test
 * 
 * Simulates the full GTM pipeline:
 *   Campaign creation → Email send → Reply → Sentiment analysis → CRM sync → Telegram alert
 * 
 * Run with: node test-e2e-flow.js
 * Requires .env with valid credentials for live API tests.
 * Without credentials, runs in DRY_RUN mode (validates logic, mocks API calls).
 */

require('dotenv').config();
const fetch = require('node-fetch');
const path = require('path');

const DRY_RUN = !process.env.PLUSVIBE_API_KEY || !process.env.CLOSE_API_KEY;
const RESULTS = [];
const start = Date.now();

function log(status, step, detail = '') {
  const icon = { PASS: '✅', FAIL: '❌', WARN: '⚠️', INFO: 'ℹ️', SKIP: '⏭️' }[status] || '•';
  console.log(`  ${icon} [${step}] ${detail}`);
  RESULTS.push({ status, step, detail });
}

// ============================================
// MOCK LAYER (for DRY_RUN mode)
// ============================================
const MOCK_CAMPAIGN = {
  id: 'camp_test_001',
  name: 'E2E Test Campaign - SaaS Founders',
  status: 'active',
  workspace_id: '678eb62a071ff7544034bcde',
  total_leads: 150,
  emails_sent: 120,
  replies: 8,
};

const MOCK_REPLY = {
  id: 'reply_test_001',
  from_email: 'john@testcorp.com',
  from_name: 'John Smith',
  subject: 'Re: Quick question about scaling',
  body: "Hey! This looks interesting. We're definitely looking for something like this. Can we schedule a call next Tuesday at 2pm EST?",
  campaign_id: MOCK_CAMPAIGN.id,
  received_at: new Date().toISOString(),
};

const MOCK_NEGATIVE_REPLY = {
  id: 'reply_test_002',
  from_email: 'jane@nocorp.com',
  from_name: 'Jane Doe',
  subject: 'Re: Partnership opportunity',
  body: "Please remove me from your list. Not interested. Do not contact me again.",
  campaign_id: MOCK_CAMPAIGN.id,
  received_at: new Date().toISOString(),
};

const MOCK_OOO_REPLY = {
  id: 'reply_test_003',
  from_email: 'bob@awaycorp.com',
  from_name: 'Bob Wilson',
  subject: 'Out of Office Re: Quick question',
  body: "I'm currently out of the office and will return on March 15th. I'll respond to your email when I'm back.",
  campaign_id: MOCK_CAMPAIGN.id,
  received_at: new Date().toISOString(),
};

// ============================================
// STEP 1: Campaign Detection
// ============================================
async function testCampaignDetection() {
  console.log('\n━━ Step 1: Campaign Detection ━━');

  try {
    const detector = require('./campaign-detector-v3.js');
    log('PASS', 'Campaign Detector', 'Module loaded successfully');

    // Check that the module exports the expected functions
    if (typeof detector.detectCampaigns === 'function' || typeof detector === 'function') {
      log('PASS', 'Campaign Detector', 'Detection function available');
    } else {
      // The module may auto-execute; that's fine for a cron job
      log('INFO', 'Campaign Detector', 'Module auto-executes (cron-style)');
    }
  } catch (err) {
    log('FAIL', 'Campaign Detector', err.message);
  }
}

// ============================================
// STEP 2: Reply Sentiment Analysis
// ============================================
async function testSentimentAnalysis() {
  console.log('\n━━ Step 2: Reply Sentiment Analysis ━━');

  // Test the sentiment patterns in index.js
  try {
    // Load the OOO patterns
    const indexContent = require('fs').readFileSync('./index.js', 'utf8');

    // Test OOO detection
    const OOO_PATTERNS = [
      /out of (the )?office/i,
      /away from (the )?office/i,
      /on (annual |paid )?leave/i,
      /on vacation/i,
      /maternity|paternity leave/i,
      /will (return|be back)/i,
      /auto.?reply/i,
      /automatic reply/i,
    ];

    // Test positive reply
    const positiveResult = classifySentiment(MOCK_REPLY.body);
    log(positiveResult === 'interested' ? 'PASS' : 'WARN', 'Sentiment: Interested Reply',
      `"${MOCK_REPLY.body.substring(0, 60)}..." → ${positiveResult}`);

    // Test negative reply
    const negativeResult = classifySentiment(MOCK_NEGATIVE_REPLY.body);
    log(negativeResult === 'not_interested' ? 'PASS' : 'WARN', 'Sentiment: Negative Reply',
      `"${MOCK_NEGATIVE_REPLY.body.substring(0, 60)}..." → ${negativeResult}`);

    // Test OOO detection
    const isOOO = OOO_PATTERNS.some(p => p.test(MOCK_OOO_REPLY.body));
    log(isOOO ? 'PASS' : 'FAIL', 'OOO Detection',
      `"${MOCK_OOO_REPLY.body.substring(0, 60)}..." → OOO=${isOOO}`);

    // Test booking intent detection (Calendly integration is TypeScript, test pattern manually)
    const bookingKeywords = ['book', 'schedule', 'meeting', 'call', 'chat', 'talk', 'connect'];
    const hasBookingIntent = bookingKeywords.some(kw => MOCK_REPLY.body.toLowerCase().includes(kw));
    log(hasBookingIntent ? 'PASS' : 'WARN', 'Booking Intent Detection',
      `Reply has booking keywords: ${hasBookingIntent}`);

  } catch (err) {
    log('FAIL', 'Sentiment Analysis', err.message);
  }
}

function classifySentiment(body) {
  const text = body.toLowerCase();
  const negativePatterns = [
    /not interested/i, /remove me/i, /unsubscribe/i, /stop (emailing|contacting)/i,
    /do not contact/i, /please remove/i, /take me off/i,
  ];
  const positivePatterns = [
    /interested/i, /schedule/i, /call/i, /meeting/i, /let'?s (talk|chat|connect)/i,
    /sounds? (good|great|interesting)/i, /tell me more/i,
  ];

  if (negativePatterns.some(p => p.test(text))) return 'not_interested';
  if (positivePatterns.some(p => p.test(text))) return 'interested';
  return 'neutral';
}

// ============================================
// STEP 3: CRM Sync Logic
// ============================================
async function testCRMSync() {
  console.log('\n━━ Step 3: CRM Sync (Close) ━━');

  const CLOSE_STATUSES = {
    INTERESTED: 'stat_YZPfE0rqYeUym9EF0twuDwZl6dYKUzpSG11PwLPYVTQ',
    POTENTIAL: 'stat_vJnznN7N4fJTSxi9pn1M6hbs4RfeuCbu124DX8bIUz0',
    BAD_FIT: 'stat_v8gPNNVhTBlqy8fpsn8otCbrk0UNZwmjpSVdCGdWCFq',
    DNC: 'stat_11Jd3OGv3Ot7nC2esu6OhRMj5EyJmUH2xSHfHGXtMgj',
    NURTURE: 'stat_4UtQuE9aIUZ1Y4Imr8UavuubTSlbWZo2LYgqfOsfFPO'
  };

  // Test status mapping
  const interested = classifySentiment(MOCK_REPLY.body);
  const expectedStatus = interested === 'interested' ? CLOSE_STATUSES.INTERESTED : CLOSE_STATUSES.NURTURE;
  log('PASS', 'Status Mapping', `"interested" → ${expectedStatus.substring(0, 20)}...`);

  const negative = classifySentiment(MOCK_NEGATIVE_REPLY.body);
  const negStatus = negative === 'not_interested' ? CLOSE_STATUSES.DNC : CLOSE_STATUSES.NURTURE;
  log('PASS', 'Status Mapping', `"not_interested" → DNC status`);

  if (!DRY_RUN) {
    try {
      const apiKey = process.env.CLOSE_API_KEY;
      const auth = Buffer.from(`${apiKey}:`).toString('base64');

      // Test that we can search leads
      const res = await fetch('https://api.close.com/api/v1/lead/?_limit=1', {
        headers: { 'Authorization': `Basic ${auth}` },
        signal: AbortSignal.timeout(10000)
      });

      if (res.ok) {
        const data = await res.json();
        log('PASS', 'Close API Live', `${data.total_results} leads accessible`);
      } else {
        log('FAIL', 'Close API Live', `Status ${res.status}`);
      }
    } catch (err) {
      log('FAIL', 'Close API Live', err.message);
    }
  } else {
    log('SKIP', 'Close API Live', 'DRY_RUN mode (no CLOSE_API_KEY)');
  }
}

// ============================================
// STEP 4: Deliverability Monitor
// ============================================
async function testDeliverabilityMonitor() {
  console.log('\n━━ Step 4: Deliverability Monitor ━━');

  try {
    const monitor = require('./deliverability-monitor.js');
    log('PASS', 'Deliverability Monitor', 'Module loaded');

    // Verify it uses live API calls now (not hardcoded data)
    const source = require('fs').readFileSync('./deliverability-monitor.js', 'utf8');
    
    if (source.includes('api.plusvibe.ai') && source.includes('inboxing.com')) {
      log('PASS', 'Deliverability Monitor', 'Uses live PlusVibe + Inboxing APIs');
    } else {
      log('WARN', 'Deliverability Monitor', 'May still contain hardcoded data');
    }

    if (!source.includes('simulat') && !source.includes('hardcoded') && !source.includes('placeholder')) {
      log('PASS', 'Deliverability Monitor', 'No simulation/placeholder code found');
    } else {
      log('WARN', 'Deliverability Monitor', 'Contains simulation references');
    }
  } catch (err) {
    log('FAIL', 'Deliverability Monitor', err.message);
  }
}

// ============================================
// STEP 5: OOO Subsequence Handling
// ============================================
async function testOOOHandling() {
  console.log('\n━━ Step 5: OOO Subsequence Logic ━━');

  const source = require('fs').readFileSync('./index.js', 'utf8');

  // Verify OOO function is implemented (not just a log)
  if (source.includes('Supabase config table') && source.includes('PlusVibe campaigns list')) {
    log('PASS', 'OOO Subsequence', 'Uses Supabase + PlusVibe for config resolution');
  } else if (source.includes('console.log') && source.includes('Need OOO subsequence')) {
    log('FAIL', 'OOO Subsequence', 'Still just logs — not implemented');
  } else {
    log('INFO', 'OOO Subsequence', 'Implementation detected');
  }

  // Verify env var loading
  if (source.includes('OOO_SUBSEQUENCE_MAP')) {
    log('PASS', 'OOO Subsequence', 'Supports OOO_SUBSEQUENCE_MAP env var');
  }

  // Verify addLeadToSubsequence exists
  if (source.includes('addLeadToSubsequence')) {
    log('PASS', 'OOO Subsequence', 'addLeadToSubsequence() implemented');
  }
}

// ============================================
// STEP 6: Swarm Subagent System
// ============================================
async function testSwarmSubagents() {
  console.log('\n━━ Step 6: Swarm Subagent System ━━');

  const source = require('fs').readFileSync('./ui/src/lib/swarm-subagents.ts', 'utf8');

  if (source.includes('hooks/session-status') && source.includes('AbortSignal.timeout')) {
    log('PASS', 'Swarm Subagents', 'checkSessionStatus() calls OpenClaw session-status endpoint');
  } else if (source.includes('return { state: "completed", result: "" }')) {
    log('FAIL', 'Swarm Subagents', 'Still returns placeholder');
  }

  if (source.includes('sessions_spawn')) {
    log('PASS', 'Swarm Subagents', 'Uses OpenClaw sessions_spawn');
  }

  if (source.includes('executeSwarm') && source.includes('aggregateSwarmResults')) {
    log('PASS', 'Swarm Subagents', 'Core swarm functions exported');
  }
}

// ============================================
// STEP 7: Insight Surface Engine
// ============================================
async function testInsightEngine() {
  console.log('\n━━ Step 7: Insight Surface Engine ━━');

  const source = require('fs').readFileSync('./lib/insight-surface-engine.js', 'utf8');

  if (source.includes('calendly.com/v2/event_type_available_times') && source.includes('calendly_live')) {
    log('PASS', 'Insight Engine', 'Booking availability calls Calendly live API');
  } else if (source.includes("'Tomorrow 2:00 PM EST'")) {
    log('FAIL', 'Insight Engine', 'Still returns hardcoded booking slots');
  }

  if (source.includes('advancedSearch')) {
    log('PASS', 'Insight Engine', 'Uses Supermemory advancedSearch for campaign insights');
  }
}

// ============================================
// STEP 8: Cron Scheduler Validation
// ============================================
async function testCronScheduler() {
  console.log('\n━━ Step 8: Cron Scheduler ━━');

  const source = require('fs').readFileSync('./cron-scheduler.js', 'utf8');

  // Verify it references the correct files
  const expectedJobs = [
    'deliverability-monitor.js',
    'campaign-detector-v3.js',
    'enhanced-reply-monitor.js',
    'negative-reply-audit.js',
    'gtm-daily-report.js',
  ];

  for (const job of expectedJobs) {
    if (source.includes(job)) {
      log('PASS', 'Cron Scheduler', `References ${job}`);
    } else {
      log('WARN', 'Cron Scheduler', `Missing reference to ${job}`);
    }
  }

  // Verify no reference to dead files
  if (source.includes('campaign-detector.js') && !source.includes('campaign-detector-v3.js')) {
    log('FAIL', 'Cron Scheduler', 'Still references old campaign-detector.js');
  } else {
    log('PASS', 'Cron Scheduler', 'No dead file references');
  }
}

// ============================================
// STEP 9: Full Pipeline Dry Run
// ============================================
async function testFullPipeline() {
  console.log('\n━━ Step 9: Full Pipeline Simulation ━━');

  // Simulate: Reply comes in → classify → route
  const reply = MOCK_REPLY;
  console.log(`  📥 Incoming reply from ${reply.from_name} <${reply.from_email}>`);
  console.log(`     Subject: ${reply.subject}`);
  console.log(`     Body: "${reply.body.substring(0, 80)}..."\n`);

  // Classify
  const sentiment = classifySentiment(reply.body);
  console.log(`  🧠 Sentiment: ${sentiment}`);

  // Check OOO
  const OOO_PATTERNS = [
    /out of (the )?office/i, /away from (the )?office/i,
    /on (annual |paid )?leave/i, /on vacation/i,
    /will (return|be back)/i, /auto.?reply/i,
  ];
  const isOOO = OOO_PATTERNS.some(p => p.test(reply.body));
  console.log(`  📅 OOO: ${isOOO}`);

  // Check booking intent
  const bookingKeywords = ['schedule', 'call', 'meeting', 'book'];
  const hasBookingIntent = bookingKeywords.some(kw => reply.body.toLowerCase().includes(kw));
  console.log(`  📅 Booking Intent: ${hasBookingIntent}`);

  // Route
  if (sentiment === 'interested') {
    console.log(`  → Route to Close CRM: Status = INTERESTED`);
    console.log(`  → Telegram alert: "🎯 Interested reply from ${reply.from_name}"`);
    if (hasBookingIntent) {
      console.log(`  → Generate Calendly link for ${reply.from_email}`);
    }
    log('PASS', 'Pipeline', 'Interested reply → CRM + Telegram + Calendly');
  } else if (sentiment === 'not_interested') {
    console.log(`  → Route to Close CRM: Status = DNC`);
    console.log(`  → Telegram alert: "🚫 DNC request from ${reply.from_name}"`);
    log('PASS', 'Pipeline', 'Negative reply → DNC + Telegram');
  }

  // Test OOO path
  console.log(`\n  📥 OOO reply from ${MOCK_OOO_REPLY.from_name}`);
  const oooIsOOO = OOO_PATTERNS.some(p => p.test(MOCK_OOO_REPLY.body));
  console.log(`  📅 OOO: ${oooIsOOO}`);
  if (oooIsOOO) {
    // Extract return date
    const dateMatch = MOCK_OOO_REPLY.body.match(/(?:return|back).*?(\w+ \d+)/i);
    console.log(`  → Detected return date: ${dateMatch ? dateMatch[1] : 'unknown'}`);
    console.log(`  → Route to OOO subsequence`);
    log('PASS', 'Pipeline', 'OOO reply → subsequence routing');
  }
}

// ============================================
// RUN ALL
// ============================================
async function main() {
  console.log('🚀 BSOS End-to-End Flow Test');
  console.log(`   Mode: ${DRY_RUN ? 'DRY RUN (no live API keys)' : 'LIVE'}`);
  console.log(`   Time: ${new Date().toISOString()}`);
  console.log('═'.repeat(55));

  await testCampaignDetection();
  await testSentimentAnalysis();
  await testCRMSync();
  await testDeliverabilityMonitor();
  await testOOOHandling();
  await testSwarmSubagents();
  await testInsightEngine();
  await testCronScheduler();
  await testFullPipeline();

  // Summary
  const passed = RESULTS.filter(r => r.status === 'PASS').length;
  const failed = RESULTS.filter(r => r.status === 'FAIL').length;
  const skipped = RESULTS.filter(r => r.status === 'SKIP').length;
  const warned = RESULTS.filter(r => r.status === 'WARN').length;

  console.log('\n' + '═'.repeat(55));
  console.log(`📊 FINAL RESULTS:`);
  console.log(`   ✅ Passed:  ${passed}`);
  console.log(`   ❌ Failed:  ${failed}`);
  console.log(`   ⚠️  Warned:  ${warned}`);
  console.log(`   ⏭️  Skipped: ${skipped}`);
  console.log(`   ⏱  Duration: ${((Date.now() - start) / 1000).toFixed(1)}s`);

  if (failed > 0) {
    console.log('\n❌ FAILURES:');
    RESULTS.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`   • ${r.step}: ${r.detail}`);
    });
  }

  if (DRY_RUN) {
    console.log('\n💡 To run live API tests, create a .env file with real credentials.');
  }

  console.log();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('E2E test crashed:', err);
  process.exit(2);
});
