#!/usr/bin/env node
/**
 * GTM Queue Respond - Write AI response back to Supabase queue
 * 
 * Usage:
 *   node gtm-queue-respond.js <messageId> <response>
 *   echo "<response>" | node gtm-queue-respond.js <messageId>
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment
dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config({ path: path.join(__dirname, 'ui/.env.local') });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function respond() {
  const messageId = process.argv[2];
  let response = process.argv[3];

  if (!messageId) {
    console.error('Usage: node gtm-queue-respond.js <messageId> [response]');
    process.exit(1);
  }

  // Read from stdin if no response provided
  if (!response) {
    const chunks = [];
    process.stdin.setEncoding('utf8');
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    response = chunks.join('');
  }

  try {
    // Get current message
    const { data: message, error: fetchError } = await supabase
      .from('agent_message_queue')
      .select('*')
      .eq('id', messageId)
      .single();

    if (fetchError || !message) {
      console.error('Message not found:', messageId);
      process.exit(1);
    }

    // Update with response
    const { error: updateError } = await supabase
      .from('agent_message_queue')
      .update({
        status: 'complete',
        message: {
          ...message.message,
          response: response.trim(),
          respondedAt: new Date().toISOString(),
        },
      })
      .eq('id', messageId);

    if (updateError) {
      console.error('Update failed:', updateError.message);
      process.exit(1);
    }

    console.log('Response saved:', messageId);

  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

respond();
