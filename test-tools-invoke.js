#!/usr/bin/env node
/**
 * Test OpenClaw /tools/invoke endpoint
 */

const OPENCLAW_URL = 'http://localhost:18789';
const OPENCLAW_TOKEN = '13d297efc87551a6ba4a47c9fca243dfe68f50d85818fae0';

async function testToolsInvoke() {
  console.log('Testing /tools/invoke endpoint...\n');

  // Test 1: List sessions
  console.log('1. Testing sessions_list:');
  try {
    const res = await fetch(`${OPENCLAW_URL}/tools/invoke`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENCLAW_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tool: 'sessions_list',
        args: { limit: 5 },
      }),
    });
    const data = await res.json();
    console.log('Status:', res.status);
    console.log('Response:', JSON.stringify(data, null, 2).substring(0, 500));
  } catch (err) {
    console.log('Error:', err.message);
  }

  console.log('\n2. Testing sessions_spawn:');
  try {
    const res = await fetch(`${OPENCLAW_URL}/tools/invoke`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENCLAW_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tool: 'sessions_spawn',
        args: {
          task: 'Say hello and confirm you are working',
          label: 'gtm-test',
          timeoutSeconds: 30,
        },
      }),
    });
    const data = await res.json();
    console.log('Status:', res.status);
    console.log('Response:', JSON.stringify(data, null, 2).substring(0, 1000));
  } catch (err) {
    console.log('Error:', err.message);
  }

  console.log('\n3. Testing sessions_send:');
  try {
    const res = await fetch(`${OPENCLAW_URL}/tools/invoke`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENCLAW_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tool: 'sessions_send',
        args: {
          message: 'Hello from GTM Bridge test',
          label: 'gtm-bridge',
        },
      }),
    });
    const data = await res.json();
    console.log('Status:', res.status);
    console.log('Response:', JSON.stringify(data, null, 2).substring(0, 1000));
  } catch (err) {
    console.log('Error:', err.message);
  }
}

testToolsInvoke();
