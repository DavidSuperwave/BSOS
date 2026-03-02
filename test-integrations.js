#!/usr/bin/env node
/**
 * Integration Tests for BSOS
 * Tests live connections to external services
 * 
 * Usage:
 *   node test-integrations.js           # Test all integrations
 *   node test-integrations.js plusvibe  # Test only PlusVibe
 *   node test-integrations.js close     # Test only Close CRM
 */

require('dotenv').config();
const fetch = require('node-fetch');

const TARGET = process.argv[2] || 'all';
const RESULTS = [];

function log(status, service, detail) {
  const icon = { PASS: '✅', FAIL: '❌', WARN: '⚠️', SKIP: '⏭️' }[status] || '•';
  const msg = `  ${icon} [${service}] ${detail}`;
  console.log(msg);
  RESULTS.push({ status, service, detail });
}

// ──────────────────────────────────────────────
// PlusVibe Integration
// ──────────────────────────────────────────────
async function testPlusVibe() {
  console.log('\n━━ PlusVibe ━━');
  
  const apiKey = process.env.PLUSVIBE_API_KEY;
  const wsId = process.env.PLUSVIBE_WORKSPACE_ID;
  
  if (!apiKey || !wsId) {
    log('SKIP', 'PlusVibe', 'Missing PLUSVIBE_API_KEY or PLUSVIBE_WORKSPACE_ID');
    return;
  }
  
  try {
    // Test campaign list
    const res = await fetch(
      `https://api.plusvibe.ai/api/v1/campaign/list?workspace_id=${wsId}`,
      { headers: { 'x-api-key': apiKey }, signal: AbortSignal.timeout(15000) }
    );
    
    if (!res.ok) {
      log('FAIL', 'PlusVibe', `Campaign list returned ${res.status}`);
      return;
    }
    
    const data = await res.json();
    const campaigns = Array.isArray(data) ? data : (data.value || []);
    log('PASS', 'PlusVibe', `Campaign list: ${campaigns.length} campaigns`);
    
    const active = campaigns.filter(c => c.status === 'ACTIVE').length;
    const draft = campaigns.filter(c => c.status === 'DRAFT').length;
    log('PASS', 'PlusVibe', `Active: ${active}, Draft: ${draft}`);
    
    // Test lead stats on first active campaign
    const activeCampaign = campaigns.find(c => c.status === 'ACTIVE');
    if (activeCampaign) {
      const statsRes = await fetch(
        `https://api.plusvibe.ai/api/v1/campaign/lead/count?workspace_id=${wsId}&campaign_id=${activeCampaign._id}`,
        { headers: { 'x-api-key': apiKey }, signal: AbortSignal.timeout(15000) }
      );
      if (statsRes.ok) {
        const stats = await statsRes.json();
        log('PASS', 'PlusVibe', `Lead stats for "${activeCampaign.name}": ${JSON.stringify(stats).substring(0, 100)}`);
      }
    }
    
  } catch (err) {
    log('FAIL', 'PlusVibe', err.message);
  }
}

// ──────────────────────────────────────────────
// Close CRM Integration
// ──────────────────────────────────────────────
async function testClose() {
  console.log('\n━━ Close CRM ━━');
  
  const apiKey = process.env.CLOSE_API_KEY;
  if (!apiKey) {
    log('SKIP', 'Close', 'Missing CLOSE_API_KEY');
    return;
  }
  
  const auth = Buffer.from(`${apiKey}:`).toString('base64');
  
  try {
    // Test lead access
    const res = await fetch('https://api.close.com/api/v1/lead/?_limit=3', {
      headers: { 'Authorization': `Basic ${auth}` },
      signal: AbortSignal.timeout(15000)
    });
    
    if (!res.ok) {
      log('FAIL', 'Close', `Lead list returned ${res.status}`);
      return;
    }
    
    const data = await res.json();
    log('PASS', 'Close', `Lead access: ${data.total_results} total leads`);
    
    // Test lead statuses
    const statusRes = await fetch('https://api.close.com/api/v1/status/lead/', {
      headers: { 'Authorization': `Basic ${auth}` },
      signal: AbortSignal.timeout(15000)
    });
    
    if (statusRes.ok) {
      const statuses = await statusRes.json();
      log('PASS', 'Close', `Lead statuses: ${statuses.data?.length || 0} statuses available`);
      
      // Verify our expected statuses exist
      const expectedIds = [
        'stat_YZPfE0rqYeUym9EF0twuDwZl6dYKUzpSG11PwLPYVTQ', // INTERESTED
        'stat_11Jd3OGv3Ot7nC2esu6OhRMj5EyJmUH2xSHfHGXtMgj', // DNC
      ];
      
      for (const id of expectedIds) {
        const found = statuses.data?.find(s => s.id === id);
        if (found) {
          log('PASS', 'Close', `Status "${found.label}" verified (${id.substring(0, 20)}...)`);
        } else {
          log('WARN', 'Close', `Status ${id.substring(0, 20)}... not found`);
        }
      }
    }
    
  } catch (err) {
    log('FAIL', 'Close', err.message);
  }
}

// ──────────────────────────────────────────────
// Supabase Integration
// ──────────────────────────────────────────────
async function testSupabase() {
  console.log('\n━━ Supabase ━━');
  
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!url || !key) {
    log('SKIP', 'Supabase', 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return;
  }
  
  try {
    const res = await fetch(`${url}/rest/v1/knowledge_documents?select=id,title&limit=3`, {
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
      },
      signal: AbortSignal.timeout(15000)
    });
    
    if (!res.ok) {
      log('FAIL', 'Supabase', `Knowledge docs returned ${res.status}`);
      return;
    }
    
    const docs = await res.json();
    log('PASS', 'Supabase', `Knowledge docs accessible: ${docs.length} returned`);
    
  } catch (err) {
    log('FAIL', 'Supabase', err.message);
  }
}

// ──────────────────────────────────────────────
// Telegram Integration
// ──────────────────────────────────────────────
async function testTelegram() {
  console.log('\n━━ Telegram ━━');
  
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  
  if (!token || !chatId) {
    log('SKIP', 'Telegram', 'Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID');
    return;
  }
  
  try {
    // Get bot info
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    if (!res.ok) {
      log('FAIL', 'Telegram', `getMe returned ${res.status}`);
      return;
    }
    
    const data = await res.json();
    log('PASS', 'Telegram', `Bot connected: @${data.result.username}`);
    
    // Test message sending (optional, won't send in test mode)
    log('INFO', 'Telegram', `Chat ID configured: ${chatId}`);
    log('INFO', 'Telegram', 'Skipping test message send (use --send flag to send)');
    
  } catch (err) {
    log('FAIL', 'Telegram', err.message);
  }
}

// ──────────────────────────────────────────────
// Supermemory Integration
// ──────────────────────────────────────────────
async function testSupermemory() {
  console.log('\n━━ Supermemory ━━');
  
  const apiKey = process.env.SUPERMEMORY_API_KEY;
  if (!apiKey) {
    log('SKIP', 'Supermemory', 'Missing SUPERMEMORY_API_KEY');
    return;
  }
  
  try {
    const res = await fetch('https://api.supermemory.ai/v3/memories?limit=1', {
      headers: { 'Authorization': `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15000)
    });
    
    if (res.ok) {
      const data = await res.json();
      log('PASS', 'Supermemory', `API accessible, memories: ${data.total || data.length || 'N/A'}`);
    } else {
      // Try search endpoint
      const searchRes = await fetch('https://api.supermemory.ai/v3/search', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ q: 'test', limit: 1 }),
        signal: AbortSignal.timeout(15000)
      });
      
      if (searchRes.ok) {
        log('PASS', 'Supermemory', 'Search API accessible');
      } else {
        log('WARN', 'Supermemory', `v3 API returned ${res.status}, search returned ${searchRes.status}`);
      }
    }
    
  } catch (err) {
    log('FAIL', 'Supermemory', err.message);
  }
}

// ──────────────────────────────────────────────
// OpenAI Integration
// ──────────────────────────────────────────────
async function testOpenAI() {
  console.log('\n━━ OpenAI ━━');
  
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    log('SKIP', 'OpenAI', 'Missing OPENAI_API_KEY');
    return;
  }
  
  try {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15000)
    });
    
    if (!res.ok) {
      log('FAIL', 'OpenAI', `Models list returned ${res.status}`);
      return;
    }
    
    const data = await res.json();
    const gptModels = data.data?.filter(m => m.id.startsWith('gpt')) || [];
    log('PASS', 'OpenAI', `API accessible, ${gptModels.length} GPT models available`);
    
  } catch (err) {
    log('FAIL', 'OpenAI', err.message);
  }
}

// ──────────────────────────────────────────────
// Perplexity Integration
// ──────────────────────────────────────────────
async function testPerplexity() {
  console.log('\n━━ Perplexity ━━');
  
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    log('SKIP', 'Perplexity', 'Missing PERPLEXITY_API_KEY');
    return;
  }
  
  try {
    const res = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [{ role: 'user', content: 'Say "API OK" and nothing else.' }],
        max_tokens: 10,
      }),
      signal: AbortSignal.timeout(30000)
    });
    
    if (!res.ok) {
      log('FAIL', 'Perplexity', `API returned ${res.status}`);
      return;
    }
    
    const data = await res.json();
    log('PASS', 'Perplexity', `API accessible: "${data.choices?.[0]?.message?.content || 'response OK'}"`);
    
  } catch (err) {
    log('FAIL', 'Perplexity', err.message);
  }
}

// ──────────────────────────────────────────────
// MAIN
// ──────────────────────────────────────────────
async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  BSOS Integration Tests');
  console.log(`  Target: ${TARGET}`);
  console.log(`  Time: ${new Date().toISOString()}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const runners = {
    plusvibe: testPlusVibe,
    close: testClose,
    supabase: testSupabase,
    telegram: testTelegram,
    supermemory: testSupermemory,
    openai: testOpenAI,
    perplexity: testPerplexity,
  };

  if (TARGET === 'all') {
    for (const fn of Object.values(runners)) await fn();
  } else if (runners[TARGET]) {
    await runners[TARGET]();
  } else {
    console.error(`Unknown target: ${TARGET}`);
    console.error(`Available: ${Object.keys(runners).join(', ')}`);
    process.exit(1);
  }

  // Summary
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const counts = { PASS: 0, FAIL: 0, WARN: 0, SKIP: 0 };
  RESULTS.forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; });
  
  console.log(`  ✅ PASS: ${counts.PASS}  ❌ FAIL: ${counts.FAIL}  ⚠️  WARN: ${counts.WARN}  ⏭️  SKIP: ${counts.SKIP}`);
  
  if (counts.FAIL > 0) {
    console.log('\n  Failed:');
    RESULTS.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`    • [${r.service}] ${r.detail}`);
    });
    process.exit(1);
  }
  
  console.log('');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
