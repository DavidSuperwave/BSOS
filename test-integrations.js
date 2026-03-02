#!/usr/bin/env node
/**
 * BSOS Integration Test Suite
 * 
 * Tests connectivity to all external APIs and validates data flow.
 * Run with: node test-integrations.js
 * 
 * Requires .env with valid credentials.
 */

require('dotenv').config();
const fetch = require('node-fetch');

const RESULTS = [];
const start = Date.now();

function log(status, test, detail = '') {
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
  console.log(`${icon} ${test}${detail ? ': ' + detail : ''}`);
  RESULTS.push({ status, test, detail });
}

// ============================================
// 1. SUPABASE
// ============================================
async function testSupabase() {
  console.log('\n── Supabase ──');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    log('SKIP', 'Supabase', 'NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set');
    return;
  }

  try {
    // Test REST API health
    const res = await fetch(`${url}/rest/v1/`, {
      headers: { 'apikey': key, 'Authorization': `Bearer ${key}` },
      signal: AbortSignal.timeout(10000)
    });
    if (res.ok) {
      log('PASS', 'Supabase REST API', `Status ${res.status}`);
    } else {
      log('FAIL', 'Supabase REST API', `Status ${res.status}`);
    }

    // Test key tables exist
    const tables = ['companies', 'campaigns', 'pipeline_entries', 'agent_sessions'];
    for (const table of tables) {
      const tRes = await fetch(`${url}/rest/v1/${table}?select=count&limit=0`, {
        headers: { 
          'apikey': key, 
          'Authorization': `Bearer ${key}`,
          'Prefer': 'count=exact'
        },
        signal: AbortSignal.timeout(5000)
      });
      if (tRes.ok) {
        const count = tRes.headers.get('content-range');
        log('PASS', `Table: ${table}`, `exists (${count || 'ok'})`);
      } else if (tRes.status === 404) {
        log('WARN', `Table: ${table}`, 'not found — may need migration');
      } else {
        log('FAIL', `Table: ${table}`, `Status ${tRes.status}`);
      }
    }
  } catch (err) {
    log('FAIL', 'Supabase connectivity', err.message);
  }
}

// ============================================
// 2. PLUSVIBE
// ============================================
async function testPlusVibe() {
  console.log('\n── PlusVibe ──');
  const apiKey = process.env.PLUSVIBE_API_KEY;
  const workspaceId = process.env.PLUSVIBE_WORKSPACE_ID || '678eb62a071ff7544034bcde';

  if (!apiKey) {
    log('SKIP', 'PlusVibe', 'PLUSVIBE_API_KEY not set');
    return;
  }

  try {
    // Test campaign list
    const res = await fetch(`https://api.plusvibe.ai/api/v1/campaign/list?workspace_id=${workspaceId}`, {
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10000)
    });
    if (res.ok) {
      const data = await res.json();
      const count = Array.isArray(data.data) ? data.data.length : '?';
      log('PASS', 'PlusVibe Campaigns API', `${count} campaigns found`);
    } else {
      log('FAIL', 'PlusVibe Campaigns API', `Status ${res.status}`);
    }

    // Test unibox (reply inbox)
    const uniRes = await fetch(`https://api.plusvibe.ai/api/v1/unibox/emails?workspace_id=${workspaceId}&limit=1`, {
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10000)
    });
    if (uniRes.ok) {
      log('PASS', 'PlusVibe Unibox API', `Status ${uniRes.status}`);
    } else {
      log('FAIL', 'PlusVibe Unibox API', `Status ${uniRes.status}`);
    }
  } catch (err) {
    log('FAIL', 'PlusVibe connectivity', err.message);
  }
}

// ============================================
// 3. CLOSE CRM
// ============================================
async function testClose() {
  console.log('\n── Close CRM ──');
  const apiKey = process.env.CLOSE_API_KEY;

  if (!apiKey || apiKey.startsWith('api_YOUR')) {
    log('SKIP', 'Close CRM', 'CLOSE_API_KEY not set or is placeholder');
    return;
  }

  try {
    const auth = Buffer.from(`${apiKey}:`).toString('base64');
    const res = await fetch('https://api.close.com/api/v1/me/', {
      headers: { 'Authorization': `Basic ${auth}` },
      signal: AbortSignal.timeout(10000)
    });
    if (res.ok) {
      const data = await res.json();
      log('PASS', 'Close CRM Auth', `Logged in as ${data.first_name || 'user'}`);
    } else if (res.status === 401) {
      log('FAIL', 'Close CRM Auth', 'Invalid API key');
    } else {
      log('FAIL', 'Close CRM Auth', `Status ${res.status}`);
    }

    // Test lead search
    const leadRes = await fetch('https://api.close.com/api/v1/lead/?_limit=1', {
      headers: { 'Authorization': `Basic ${auth}` },
      signal: AbortSignal.timeout(10000)
    });
    if (leadRes.ok) {
      const leadData = await leadRes.json();
      log('PASS', 'Close CRM Leads', `${leadData.total_results || 0} total leads`);
    } else {
      log('FAIL', 'Close CRM Leads', `Status ${leadRes.status}`);
    }
  } catch (err) {
    log('FAIL', 'Close CRM connectivity', err.message);
  }
}

// ============================================
// 4. SUPERMEMORY
// ============================================
async function testSupermemory() {
  console.log('\n── Supermemory ──');
  const apiKey = process.env.SUPERMEMORY_API_KEY;

  if (!apiKey) {
    log('SKIP', 'Supermemory', 'SUPERMEMORY_API_KEY not set');
    return;
  }

  try {
    const res = await fetch('https://api.supermemory.ai/v3/memories', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'x-company': 'superwave'
      },
      body: JSON.stringify({ query: 'test', limit: 1 }),
      signal: AbortSignal.timeout(10000)
    });
    if (res.ok || res.status === 200) {
      log('PASS', 'Supermemory API', 'Connected');
    } else {
      log('FAIL', 'Supermemory API', `Status ${res.status}`);
    }
  } catch (err) {
    log('FAIL', 'Supermemory connectivity', err.message);
  }
}

// ============================================
// 5. INBOXING
// ============================================
async function testInboxing() {
  console.log('\n── Inboxing.com ──');
  const apiKey = process.env.INBOXING_API_KEY;

  if (!apiKey) {
    log('SKIP', 'Inboxing', 'INBOXING_API_KEY not set');
    return;
  }

  try {
    const res = await fetch('https://v2.inboxing.com/api/v2/domains', {
      headers: { 'Authorization': `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10000)
    });
    if (res.ok) {
      const data = await res.json();
      log('PASS', 'Inboxing Domains API', `Connected`);
    } else {
      log('FAIL', 'Inboxing Domains API', `Status ${res.status}`);
    }
  } catch (err) {
    log('FAIL', 'Inboxing connectivity', err.message);
  }
}

// ============================================
// 6. CALENDLY
// ============================================
async function testCalendly() {
  console.log('\n── Calendly ──');
  const apiKey = process.env.CALENDLY_API_KEY;

  if (!apiKey || apiKey === 'your_calendly_api_key') {
    log('SKIP', 'Calendly', 'CALENDLY_API_KEY not set');
    return;
  }

  try {
    const res = await fetch('https://api.calendly.com/users/me', {
      headers: { 'Authorization': `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10000)
    });
    if (res.ok) {
      const data = await res.json();
      log('PASS', 'Calendly API', `Connected as ${data.resource?.name || 'user'}`);
    } else {
      log('FAIL', 'Calendly API', `Status ${res.status}`);
    }
  } catch (err) {
    log('FAIL', 'Calendly connectivity', err.message);
  }
}

// ============================================
// 7. TELEGRAM
// ============================================
async function testTelegram() {
  console.log('\n── Telegram ──');
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token || token === 'your_bot_token') {
    log('SKIP', 'Telegram', 'TELEGRAM_BOT_TOKEN not set');
    return;
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
      signal: AbortSignal.timeout(10000)
    });
    if (res.ok) {
      const data = await res.json();
      log('PASS', 'Telegram Bot', `Bot: @${data.result?.username || 'unknown'}`);
    } else {
      log('FAIL', 'Telegram Bot', `Status ${res.status}`);
    }
  } catch (err) {
    log('FAIL', 'Telegram connectivity', err.message);
  }
}

// ============================================
// RUN ALL
// ============================================
async function main() {
  console.log('🔍 BSOS Integration Test Suite');
  console.log(`   Running at: ${new Date().toISOString()}`);
  console.log('━'.repeat(50));

  await testSupabase();
  await testPlusVibe();
  await testClose();
  await testSupermemory();
  await testInboxing();
  await testCalendly();
  await testTelegram();

  // Summary
  const passed = RESULTS.filter(r => r.status === 'PASS').length;
  const failed = RESULTS.filter(r => r.status === 'FAIL').length;
  const skipped = RESULTS.filter(r => r.status === 'SKIP').length;
  const warned = RESULTS.filter(r => r.status === 'WARN').length;

  console.log('\n' + '━'.repeat(50));
  console.log(`📊 Results: ${passed} passed, ${failed} failed, ${warned} warnings, ${skipped} skipped`);
  console.log(`   Duration: ${((Date.now() - start) / 1000).toFixed(1)}s`);

  if (failed > 0) {
    console.log('\n⚠️  Failed tests:');
    RESULTS.filter(r => r.status === 'FAIL').forEach(r => console.log(`   - ${r.test}: ${r.detail}`));
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Test suite crashed:', err);
  process.exit(2);
});
