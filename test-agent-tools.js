#!/usr/bin/env node
/**
 * Test Agent Tools End-to-End
 */

import { createClient } from '@supabase/supabase-js';
import Supermemory from 'supermemory';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, 'ui/.env.local') });

const PLUSVIBE_BASE = 'https://api.plusvibe.ai/api/v1';
const PLUSVIBE_API_KEY = process.env.PLUSVIBE_API_KEY;
const PLUSVIBE_WORKSPACE_ID = process.env.PLUSVIBE_WORKSPACE_ID;
const COMPANY_ID = '83c41a09-a165-4924-983b-3d5b8d3127be';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const supermemory = new Supermemory({
  apiKey: process.env.SUPERMEMORY_API_KEY,
});

async function testPlusVibe() {
  console.log('\n📊 Testing PlusVibe Tools...\n');
  
  // 1. List campaigns
  console.log('1. list_campaigns:');
  const listRes = await fetch(
    `${PLUSVIBE_BASE}/campaign/list?workspace_id=${PLUSVIBE_WORKSPACE_ID}`,
    { headers: { 'x-api-key': PLUSVIBE_API_KEY } }
  );
  const listData = await listRes.json();
  const campaigns = Array.isArray(listData) ? listData : (listData.value || []);
  console.log(`   ✅ Found ${campaigns.length} campaigns`);
  console.log(`   Active: ${campaigns.filter(c => c.status === 'ACTIVE').length}`);
  console.log(`   Draft: ${campaigns.filter(c => c.status === 'DRAFT').length}`);
  
  // 2. Get campaign details (first active)
  const activeCampaign = campaigns.find(c => c.status === 'ACTIVE');
  if (activeCampaign) {
    console.log('\n2. get_campaign_details:');
    console.log(`   ✅ Campaign: ${activeCampaign.name}`);
    console.log(`   ID: ${activeCampaign._id}`);
    console.log(`   Last sent: ${activeCampaign.last_lead_sent || 'Never'}`);
  }
  
  // 3. Test campaign creation (will fail if endpoint doesn't exist)
  console.log('\n3. create_campaign:');
  try {
    const createRes = await fetch(
      `${PLUSVIBE_BASE}/campaign/create?workspace_id=${PLUSVIBE_WORKSPACE_ID}`,
      {
        method: 'POST',
        headers: {
          'x-api-key': PLUSVIBE_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: `Julian Test - ${new Date().toISOString().slice(0, 10)}`,
          status: 'DRAFT',
        }),
      }
    );
    if (createRes.ok) {
      const created = await createRes.json();
      console.log(`   ✅ Created campaign: ${created.name || created._id || JSON.stringify(created)}`);
    } else {
      console.log(`   ⚠️  Create endpoint returned ${createRes.status} - may need different API`);
    }
  } catch (e) {
    console.log(`   ⚠️  Create failed: ${e.message}`);
  }
}

async function testKnowledgeBase() {
  console.log('\n📚 Testing Knowledge Base Tools...\n');
  
  // 1. List documents
  console.log('1. list_knowledge_docs:');
  const { data: docs, error: listError } = await supabase
    .from('knowledge_documents')
    .select('id, title, category')
    .eq('company_id', COMPANY_ID)
    .limit(10);
  
  if (listError) {
    console.log(`   ❌ Error: ${listError.message}`);
  } else {
    console.log(`   ✅ Found ${docs.length} documents`);
    docs.slice(0, 3).forEach(d => console.log(`      - ${d.title} (${d.category})`));
  }
  
  // 2. Create document
  console.log('\n2. create_knowledge_doc:');
  const testTitle = `Julian Test Doc - ${Date.now()}`;
  const { data: created, error: createError } = await supabase
    .from('knowledge_documents')
    .insert({
      company_id: COMPANY_ID,
      title: testTitle,
      content: '# Test Document\n\nThis is a test created by Julian agent.',
      category: 'research',
      metadata: { source: 'test-script' },
    })
    .select()
    .single();
  
  if (createError) {
    console.log(`   ❌ Error: ${createError.message}`);
  } else {
    console.log(`   ✅ Created: ${created.title} (ID: ${created.id})`);
    
    // 3. Update document
    console.log('\n3. update_knowledge_doc:');
    const { data: updated, error: updateError } = await supabase
      .from('knowledge_documents')
      .update({ 
        content: '# Updated Test Document\n\nThis document was updated by Julian.',
        updated_at: new Date().toISOString(),
      })
      .eq('id', created.id)
      .select()
      .single();
    
    if (updateError) {
      console.log(`   ❌ Error: ${updateError.message}`);
    } else {
      console.log(`   ✅ Updated: ${updated.title}`);
    }
    
    // 4. Delete document
    console.log('\n4. delete_knowledge_doc:');
    const { error: deleteError } = await supabase
      .from('knowledge_documents')
      .delete()
      .eq('id', created.id);
    
    if (deleteError) {
      console.log(`   ❌ Error: ${deleteError.message}`);
    } else {
      console.log(`   ✅ Deleted test document`);
    }
  }
}

async function testSupermemory() {
  console.log('\n🧠 Testing Supermemory Tools...\n');
  
  console.log('1. search_knowledge:');
  try {
    const results = await supermemory.search.documents({
      q: 'cold email best practices',
      containerTags: ['blitzscale:company:superwave'],
      limit: 3,
    });
    
    console.log(`   ✅ Found ${results.results?.length || 0} results`);
    results.results?.slice(0, 2).forEach((r, i) => {
      console.log(`      ${i + 1}. ${r.metadata?.title || r.title} (score: ${r.score?.toFixed(2)})`);
    });
  } catch (e) {
    console.log(`   ❌ Error: ${e.message}`);
  }
}

async function testPerplexity() {
  console.log('\n🔍 Testing Perplexity Research...\n');
  
  console.log('1. research_topic:');
  try {
    const res = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-sonar-small-128k-online',
        messages: [
          { role: 'user', content: 'What are the top 3 cold email trends in 2026?' },
        ],
        max_tokens: 500,
      }),
    });
    
    if (!res.ok) {
      console.log(`   ❌ Error: ${res.status}`);
    } else {
      const data = await res.json();
      const answer = data.choices?.[0]?.message?.content || 'No answer';
      console.log(`   ✅ Research complete`);
      console.log(`   Answer preview: ${answer.substring(0, 200)}...`);
    }
  } catch (e) {
    console.log(`   ❌ Error: ${e.message}`);
  }
}

async function main() {
  console.log('🧪 Agent Tools End-to-End Test\n');
  console.log('================================');
  
  await testPlusVibe();
  await testKnowledgeBase();
  await testSupermemory();
  await testPerplexity();
  
  console.log('\n================================');
  console.log('✅ All tests complete!\n');
}

main().catch(console.error);
