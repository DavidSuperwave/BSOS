#!/usr/bin/env node
/**
 * Test Supermemory Connection
 */

require('dotenv').config();

const API_KEY = process.env.SUPERMEMORY_API_KEY;

async function testSupermemory() {
  console.log('🧠 Testing Supermemory Connection\n');
  
  if (!API_KEY) {
    console.error('❌ SUPERMEMORY_API_KEY not set');
    process.exit(1);
  }
  
  console.log(`API Key: ${API_KEY.substring(0, 20)}...`);
  
  // Try different endpoints
  const endpoints = [
    'https://api.supermemory.ai/v3/documents',
    'https://api.supermemory.ai/v1/documents',
    'https://api.supermemory.ai/v2/documents'
  ];
  
  for (const url of endpoints) {
    console.log(`\nTesting: ${url}`);
    try {
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${API_KEY}` }
      });
      
      console.log(`   Status: ${response.status}`);
      
      if (response.ok) {
        const data = await response.json();
        console.log('   ✅ SUCCESS!');
        console.log(`   Documents: ${Array.isArray(data) ? data.length : 'N/A'}`);
        return;
      } else {
        const error = await response.text();
        console.log(`   Error: ${error.substring(0, 100)}`);
      }
    } catch (error) {
      console.log(`   ❌ ${error.message}`);
    }
  }
  
  console.log('\n❌ All endpoints failed');
}

testSupermemory();
