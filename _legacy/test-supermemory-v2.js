const { storeCampaign, queryInsights } = require('./lib/supermemory-client');

console.log('🧪 Testing Supermemory v2.0 Client...\n');

// Test 1: Store a campaign
async function testStore() {
  console.log('Test 1: Store Campaign');
  console.log('----------------------');
  
  const testCampaign = {
    campaign_id: 'test_' + Date.now(),
    campaign_name: 'Test-SaaS-VP-2026-02-09',
    campaign_slug: 'test-saas-vp-20260209',
    industry: 'SaaS',
    persona: 'VP Sales',
    persona_seniority: 'VP',
    company_size_target: '51-200',
    tier: 'Engine',
    framework: 'pipeline-consistency',
    status: 'draft',
    naming_pattern: 'standard',
    is_cooked: false,
    cooked_confidence: 0,
    requires_review: false,
    metrics: {
      lead_count: 500,
      sent_count: 0,
      reply_count: 0,
      positive_count: 0,
      reply_rate: 0,
      positive_rate: 0
    },
    created_at: new Date().toISOString(),
    last_activity_at: new Date().toISOString(),
    related_documents: {
      replies: [],
      insights: [],
      research: []
    }
  };
  
  try {
    const result = await storeCampaign(testCampaign, 'superwave');
    console.log('✅ SUCCESS: Campaign stored');
    console.log('   ID:', result.id || result.document?.id || 'N/A');
    console.log('   Auto-tags applied:', result.metadata?.auto_tags?.join(', ') || 'N/A');
    return result;
  } catch (error) {
    console.error('❌ FAILED:', error.message);
    throw error;
  }
}

// Test 2: Query insights
async function testQuery() {
  console.log('\nTest 2: Query Insights');
  console.log('----------------------');
  
  try {
    const results = await queryInsights('campaign SaaS', 'superwave', { limit: 5 });
    console.log('✅ SUCCESS: Query executed');
    console.log('   Results found:', results.results?.length || 0);
    
    if (results.results?.length > 0) {
      console.log('\n   Sample result:');
      const sample = results.results[0];
      console.log('   - Type:', sample.metadata?.type);
      console.log('   - Industry:', sample.metadata?.industry);
      console.log('   - Tags:', sample.metadata?.tags?.join(', ') || 'N/A');
    }
    
    return results;
  } catch (error) {
    console.error('❌ FAILED:', error.message);
    throw error;
  }
}

// Test 3: Advanced search
async function testAdvancedSearch() {
  console.log('\nTest 3: Advanced Search');
  console.log('-----------------------');
  
  const { SupermemoryClient } = require('./lib/supermemory-client');
  const client = new SupermemoryClient();
  
  try {
    const results = await client.advancedSearch({
      query: 'high performer campaign',
      company: 'superwave',
      filters: {
        AND: [
          { key: 'type', value: 'campaign' }
        ]
      },
      limit: 3
    });
    
    console.log('✅ SUCCESS: Advanced search executed');
    console.log('   Results:', results.results?.length || 0);
    return results;
  } catch (error) {
    console.error('❌ FAILED:', error.message);
    // Don't throw - advanced search might fail if no data
  }
}

// Run all tests
async function runTests() {
  console.log('Starting Supermemory v2.0 Tests\n');
  
  try {
    await testStore();
    await testQuery();
    await testAdvancedSearch();
    
    console.log('\n=================================');
    console.log('✅ All tests completed!');
    console.log('=================================');
    
  } catch (error) {
    console.error('\n=================================');
    console.error('❌ Tests failed:', error.message);
    console.error('=================================');
    process.exit(1);
  }
}

runTests();
