#!/usr/bin/env node
/**
 * GTM Queue Handler - Supabase Message Queue Processor
 * 
 * This script is designed to be called by OpenClaw's cron system.
 * It processes pending messages from the GTM web UI queue.
 * 
 * Usage:
 *   node gtm-queue-handler.js
 * 
 * The script:
 * 1. Checks Supabase for pending messages
 * 2. Returns a structured response for OpenClaw to process
 * 3. OpenClaw handles the AI processing and writes responses
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
const QUEUE_NAME = 'gtm:queue:dev';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.log('GTM_QUEUE_EMPTY');
  process.exit(0);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkQueue() {
  try {
    // Get pending messages
    const { data: messages, error } = await supabase
      .from('agent_message_queue')
      .select('*')
      .eq('queue', QUEUE_NAME)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1);

    if (error) {
      console.error('Queue check error:', error.message);
      console.log('GTM_QUEUE_ERROR');
      return;
    }

    if (!messages || messages.length === 0) {
      console.log('GTM_QUEUE_EMPTY');
      return;
    }

    const message = messages[0];
    const content = message.message?.content || '';
    const sessionId = message.session_id || 'unknown';
    const messageId = message.id;

    // Mark as processing
    await supabase
      .from('agent_message_queue')
      .update({ status: 'processing' })
      .eq('id', messageId);

    // Output structured data for OpenClaw to process
    console.log('GTM_QUEUE_MESSAGE');
    console.log(JSON.stringify({
      id: messageId,
      sessionId,
      content,
      queue: QUEUE_NAME,
      createdAt: message.created_at,
    }));

  } catch (err) {
    console.error('Queue handler error:', err.message);
    console.log('GTM_QUEUE_ERROR');
  }
}

checkQueue();
