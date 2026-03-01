/**
 * Supermemory Migration Script
 * 
 * Upgrades existing documents to v2.0 schema with:
 * - Rich metadata
 * - Auto-tagging
 * - Entity contexts
 * - Relationships
 */

const { SupermemoryClient, ContainerTags, EntityContexts } = require('./lib/supermemory-client');
const fs = require('fs');
const path = require('path');

const MIGRATION_STATE_FILE = path.join(__dirname, '.supermemory-migration-state.json');

// Load migration state
function loadMigrationState() {
  try {
    if (fs.existsSync(MIGRATION_STATE_FILE)) {
      return JSON.parse(fs.readFileSync(MIGRATION_STATE_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error loading migration state:', e.message);
  }
  return { completed: [], failed: [], lastRun: null };
}

function saveMigrationState(state) {
  try {
    fs.writeFileSync(MIGRATION_STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    console.error('Error saving migration state:', e.message);
  }
}

// Parse legacy document content
function parseLegacyCampaign(content) {
  const lines = content.split('\n');
  const data = {};
  
  lines.forEach(line => {
    if (line.includes('Campaign:')) {
      data.campaign_name = line.split(':')[1]?.trim();
    }
    if (line.includes('Status:')) {
      data.status = line.split(':')[1]?.trim();
    }
    if (line.includes('Industry:')) {
      data.industry = line.split(':')[1]?.trim();
    }
    if (line.includes('Target Role:')) {
      data.persona = line.split(':')[1]?.trim();
    }
  });
  
  return data;
}

// Migrate single campaign document
async function migrateCampaign(client, doc, company) {
  console.log(`  Migrating campaign: ${doc.metadata?.campaignName || 'Unknown'}`);
  
  try {
    // Parse existing data
    const legacy = parseLegacyCampaign(doc.content);
    
    // Build enriched metadata
    const enrichedMetadata = {
      type: 'campaign',
      schema_version: '2.0',
      company: company,
      
      // From existing
      campaign_id: doc.metadata?.campaignId || doc.metadata?.campaign_id || 'unknown',
      campaign_name: doc.metadata?.campaignName || legacy.campaign_name || 'Unknown',
      industry: doc.metadata?.industry || legacy.industry || 'Unknown',
      persona: doc.metadata?.targetRole || legacy.persona || 'Unknown',
      
      // Defaults for missing fields
      tier: 'Fuel', // Default
      framework: doc.metadata?.framework || 'custom',
      status: doc.metadata?.status || legacy.status || 'draft',
      naming_pattern: doc.metadata?.namingPattern || 'unknown',
      is_cooked: doc.metadata?.isCooked || doc.metadata?.namingPattern === 'manual_user_created' || false,
      cooked_confidence: doc.metadata?.cookedConfidence || 0,
      requires_review: doc.metadata?.requiresReview || false,
      
      // Metrics (will be updated by campaign detector)
      metrics: {
        lead_count: doc.metadata?.leadCount || 0,
        sent_count: 0,
        reply_count: 0,
        positive_count: 0,
        reply_rate: 0,
        positive_rate: 0
      },
      
      // Temporal
      created_at: doc.createdAt || new Date().toISOString(),
      last_activity_at: doc.updatedAt || new Date().toISOString(),
      
      // Relationships (empty initially)
      related_documents: {
        replies: [],
        insights: [],
        research: []
      },
      
      // Tagging
      tags: doc.metadata?.tags || [],
      auto_tags: []
    };
    
    // Delete old document
    if (doc.id) {
      try {
        await client.request(`/documents/${doc.id}`, { method: 'DELETE' });
      } catch (e) {
        console.log(`    Could not delete old doc (may not exist): ${e.message}`);
      }
    }
    
    // Create new document with enriched metadata
    const result = await client.addDocument(doc.content, enrichedMetadata, {
      containerTag: ContainerTags.company(company),
      entityContext: EntityContexts[company] || EntityContexts.superwave
    });
    
    console.log(`    ✅ Migrated: ${result.id || 'success'}`);
    return { success: true, id: result.id };
    
  } catch (error) {
    console.error(`    ❌ Failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// Set up container contexts
async function setupContainerContexts(client, company = 'superwave') {
  console.log('\n📦 Setting up container contexts...');
  
  const contexts = [
    { tag: ContainerTags.company(company), context: EntityContexts[company] || EntityContexts.superwave },
    { tag: 'shared:gtm:frameworks', context: EntityContexts.gtmFrameworks },
    { tag: 'shared:industry:staffing', context: EntityContexts.staffingIndustry }
  ];
  
  for (const { tag, context } of contexts) {
    try {
      await client.setContainerContext(tag, context);
      console.log(`  ✅ Context set: ${tag}`);
    } catch (error) {
      console.error(`  ❌ Failed to set context for ${tag}: ${error.message}`);
    }
  }
}

// Main migration
async function migrate() {
  console.log('🚀 Supermemory Migration v1.0 → v2.0');
  console.log('=====================================\n');
  
  const client = new SupermemoryClient();
  const state = loadMigrationState();
  const company = 'superwave';
  
  // Step 1: Set up container contexts
  await setupContainerContexts(client, company);
  
  // Step 2: Search for existing documents
  console.log('\n🔍 Searching for existing documents...');
  
  try {
    const searchResult = await client.search('campaign', {
      containerTags: [ContainerTags.company(company)],
      limit: 100
    });
    
    const documents = searchResult.results || [];
    console.log(`  Found ${documents.length} documents to migrate\n`);
    
    if (documents.length === 0) {
      console.log('  No documents found. Migration complete (nothing to do).');
      return;
    }
    
    // Step 3: Migrate each document
    console.log('📝 Migrating documents...\n');
    
    let successCount = 0;
    let failCount = 0;
    
    for (const doc of documents) {
      // Skip if already migrated
      if (state.completed.includes(doc.id)) {
        console.log(`  ⏭️  Skipping (already migrated): ${doc.id}`);
        continue;
      }
      
      // Check if it's a campaign document
      const isCampaign = doc.metadata?.type === 'campaign' || 
                         doc.content?.includes('Campaign:');
      
      if (!isCampaign) {
        console.log(`  ⏭️  Skipping (not a campaign): ${doc.id}`);
        continue;
      }
      
      const result = await migrateCampaign(client, doc, company);
      
      if (result.success) {
        state.completed.push(doc.id);
        successCount++;
      } else {
        state.failed.push({ id: doc.id, error: result.error });
        failCount++;
      }
      
      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Save state
    state.lastRun = new Date().toISOString();
    saveMigrationState(state);
    
    // Summary
    console.log('\n=====================================');
    console.log('✅ Migration Complete');
    console.log(`   Success: ${successCount}`);
    console.log(`   Failed: ${failCount}`);
    console.log(`   Total processed: ${successCount + failCount}`);
    
    if (failCount > 0) {
      console.log('\n⚠️  Some documents failed to migrate.');
      console.log('   Run this script again to retry failed items.');
    }
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  migrate().catch(console.error);
}

module.exports = { migrate };
