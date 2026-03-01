#!/usr/bin/env node
/**
 * Sync Supermemory documents to Supabase knowledge_documents table
 */

import Supermemory from 'supermemory';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, 'ui/.env.local') });

const COMPANY_ID = '83c41a09-a165-4924-983b-3d5b8d3127be'; // Superwave

const supermemory = new Supermemory({
  apiKey: process.env.SUPERMEMORY_API_KEY,
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function sync() {
  console.log('🔄 Syncing Supermemory → Supabase...\n');

  // Search for our seeded documents
  const results = await supermemory.search.documents({
    q: 'Superwave company ICP email campaign',
    containerTags: ['blitzscale:company:superwave'],
    limit: 20,
  });

  console.log(`Found ${results.results?.length || 0} documents in Supermemory\n`);

  let synced = 0;
  for (const doc of results.results || []) {
    const title = doc.metadata?.title || doc.title || 'Untitled';
    const category = doc.metadata?.category || 'general';
    const content = doc.chunks?.[0]?.content || '';

    // Skip if no content
    if (!content) continue;

    // Check if already exists
    const { data: existing } = await supabase
      .from('knowledge_documents')
      .select('id')
      .eq('title', title)
      .eq('company_id', COMPANY_ID)
      .single();

    if (existing) {
      console.log(`⏭️  Skipping (exists): ${title}`);
      continue;
    }

    // Insert into Supabase
    const { error } = await supabase
      .from('knowledge_documents')
      .insert({
        company_id: COMPANY_ID,
        title,
        content,
        category,
        metadata: {
          source: 'supermemory',
          supermemoryId: doc.documentId,
          syncedAt: new Date().toISOString(),
        },
      });

    if (error) {
      console.log(`❌ Failed: ${title} - ${error.message}`);
    } else {
      console.log(`✅ Synced: ${title}`);
      synced++;
    }
  }

  console.log(`\n📊 Synced ${synced} documents to Supabase`);
}

sync().catch(console.error);
