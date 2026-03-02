#!/usr/bin/env node
/**
 * Test Tools API
 */

const API_BASE = 'http://localhost:3000/api/tools';

async function testTool(name, params = {}) {
  console.log(`\n📌 Testing: ${name}`);
  console.log(`   Params: ${JSON.stringify(params)}`);
  
  try {
    const res = await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: name, params }),
    });
    
    const data = await res.json();
    
    if (data.success) {
      console.log(`   ✅ Success`);
      console.log(`   Result: ${JSON.stringify(data.result).substring(0, 200)}...`);
    } else {
      console.log(`   ❌ Error: ${data.error}`);
    }
  } catch (e) {
    console.log(`   ❌ Fetch error: ${e.message}`);
  }
}

async function main() {
  console.log('🧪 Testing Tools API\n');
  
  await testTool('list_campaigns', { limit: 3 });
  await testTool('list_knowledge_docs', { limit: 3 });
  await testTool('search_knowledge', { query: 'cold email best practices' });
  await testTool('create_knowledge_doc', { 
    title: 'API Test Document',
    content: '# Test\n\nThis was created via the tools API.',
    category: 'research'
  });
  await testTool('research_topic', { query: 'What is the average cold email open rate in 2026?' });
  
  console.log('\n✅ Tests complete');
}

main();
