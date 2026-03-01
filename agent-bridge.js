#!/usr/bin/env node
/**
 * Agent Bridge v2 - Desktop <-> Web Communication via Supabase
 * 
 * Run this on your desktop: node agent-bridge.js
 * 
 * This bridge:
 * 1. Polls Supabase for pending messages from the web UI
 * 2. Spawns OpenClaw sub-agents via /tools/invoke
 * 3. Polls for completion and returns responses to Supabase
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

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ovymybiibcxunnqoaoub.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENCLAW_URL = process.env.OPENCLAW_URL || 'http://localhost:18789';
const OPENCLAW_TOKEN = process.env.OPENCLAW_TOKEN || '13d297efc87551a6ba4a47c9fca243dfe68f50d85818fae0';
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || '3000');
const QUEUE_NAME = 'gtm:queue:dev';

if (!SUPABASE_KEY) {
  console.error('❌ SUPABASE_SERVICE_KEY not found');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ============================================
// OPENCLAW CLIENT
// ============================================

class OpenClawClient {
  constructor(url, token) {
    this.url = url;
    this.token = token;
  }

  async invoke(tool, args = {}) {
    const res = await fetch(`${this.url}/tools/invoke`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tool, args }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenClaw invoke failed: ${res.status} - ${text}`);
    }

    const data = await res.json();
    if (!data.ok) {
      throw new Error(data.error?.message || 'Tool invocation failed');
    }

    return data.result?.details || data.result;
  }

  async spawn(task, options = {}) {
    return this.invoke('sessions_spawn', {
      task,
      label: options.label || 'gtm-bridge',
      cleanup: 'keep',
      timeoutSeconds: options.timeoutSeconds || 120,
      ...options,
    });
  }

  async getSessionHistory(sessionKey, limit = 10) {
    return this.invoke('sessions_history', {
      sessionKey,
      limit,
      includeTools: false,
    });
  }

  async listSessions(options = {}) {
    return this.invoke('sessions_list', options);
  }

  async waitForCompletion(childSessionKey, timeoutMs = 120000) {
    const startTime = Date.now();
    const pollInterval = 2000;

    while (Date.now() - startTime < timeoutMs) {
      await sleep(pollInterval);

      try {
        // Check session history for the child session
        const history = await this.getSessionHistory(childSessionKey, 5);
        
        // Parse the history - it might be in result.content[0].text
        let messages = [];
        if (history?.content?.[0]?.text) {
          const parsed = JSON.parse(history.content[0].text);
          messages = parsed.messages || [];
        } else if (Array.isArray(history?.messages)) {
          messages = history.messages;
        }

        // Look for assistant messages (the response)
        const assistantMessages = messages.filter(m => m.role === 'assistant');
        if (assistantMessages.length > 0) {
          // Get the last assistant message
          const lastMessage = assistantMessages[assistantMessages.length - 1];
          return lastMessage.content || lastMessage.text || JSON.stringify(lastMessage);
        }
      } catch (err) {
        // Session might not exist yet or other transient error
        console.log(`   Waiting for session... (${Math.round((Date.now() - startTime) / 1000)}s)`);
      }
    }

    throw new Error('Timeout waiting for agent response');
  }
}

// ============================================
// AGENT BRIDGE
// ============================================

class AgentBridge {
  constructor() {
    this.isRunning = false;
    this.processingMessages = new Set();
    this.openclaw = new OpenClawClient(OPENCLAW_URL, OPENCLAW_TOKEN);
  }

  async start() {
    console.log('🚀 Agent Bridge v2 starting...');
    console.log(`   Supabase: ${SUPABASE_URL}`);
    console.log(`   OpenClaw: ${OPENCLAW_URL}`);
    console.log(`   Queue: ${QUEUE_NAME}`);
    console.log(`   Poll interval: ${POLL_INTERVAL}ms`);
    console.log('');

    // Test Supabase connection
    try {
      const { error } = await supabase.from('agent_message_queue').select('id').limit(1);
      if (error) throw error;
      console.log('✅ Connected to Supabase');
    } catch (err) {
      console.error('❌ Failed to connect to Supabase:', err.message);
      process.exit(1);
    }

    // Test OpenClaw connection
    try {
      await this.openclaw.listSessions({ limit: 1 });
      console.log('✅ Connected to OpenClaw');
    } catch (err) {
      console.error('❌ Failed to connect to OpenClaw:', err.message);
      console.log('   Make sure OpenClaw Gateway is running on', OPENCLAW_URL);
      process.exit(1);
    }

    console.log('');
    console.log('📝 Ready to process messages');
    console.log('');

    this.isRunning = true;
    this.poll();
  }

  stop() {
    this.isRunning = false;
    console.log('👋 Agent Bridge stopped');
  }

  async poll() {
    while (this.isRunning) {
      try {
        await this.checkQueue();
      } catch (error) {
        console.error('❌ Poll error:', error.message);
      }
      await sleep(POLL_INTERVAL);
    }
  }

  async checkQueue() {
    const { data: messages, error } = await supabase
      .from('agent_message_queue')
      .select('*')
      .eq('queue', QUEUE_NAME)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1);

    if (error) {
      console.error('❌ Queue check error:', error.message);
      return;
    }

    if (!messages || messages.length === 0) return;

    const message = messages[0];
    
    if (this.processingMessages.has(message.id)) return;
    this.processingMessages.add(message.id);

    console.log(`📨 Processing: ${message.id}`);
    console.log(`   Content: ${(message.message?.content || '').substring(0, 60)}...`);

    try {
      await supabase
        .from('agent_message_queue')
        .update({ status: 'processing' })
        .eq('id', message.id);

      await this.processMessage(message);
    } catch (error) {
      console.error('❌ Processing failed:', error.message);
      
      await supabase
        .from('agent_message_queue')
        .update({
          status: 'error',
          message: {
            ...message.message,
            error: error.message,
          },
        })
        .eq('id', message.id);
    }
    
    this.processingMessages.delete(message.id);
  }

  async processMessage(message) {
    const startTime = Date.now();
    const content = message.message?.content || 'No content';
    const sessionId = message.session_id || 'unknown';

    // Create a GTM-specific prompt
    const gtmPrompt = `You are Julian, the Blitzscale OS AI Agent. You're responding to a request from the GTM Engine web interface.

Context:
- User is working with campaigns, ICPs, and sales outreach
- You have access to Supermemory for knowledge retrieval
- You can help with campaign creation, ICP research, and GTM strategy

User Request:
${content}

Provide a helpful, actionable response. Be concise but thorough.`;

    console.log('   🤖 Spawning sub-agent...');

    // Spawn a sub-agent
    const spawnResult = await this.openclaw.spawn(gtmPrompt, {
      label: `gtm-web-${sessionId.slice(0, 8)}`,
      timeoutSeconds: 90,
    });

    const childSessionKey = spawnResult.childSessionKey;
    console.log(`   📍 Child session: ${childSessionKey}`);

    // Wait for completion
    console.log('   ⏳ Waiting for response...');
    const response = await this.openclaw.waitForCompletion(childSessionKey, 90000);

    // Update Supabase with response
    const { error } = await supabase
      .from('agent_message_queue')
      .update({
        status: 'complete',
        message: {
          ...message.message,
          response,
          processingTime: Date.now() - startTime,
          childSessionKey,
        },
      })
      .eq('id', message.id);

    if (error) {
      throw new Error(`Failed to save response: ${error.message}`);
    }

    console.log(`   ✅ Done in ${Math.round((Date.now() - startTime) / 1000)}s`);
    console.log(`   Response: ${response.substring(0, 100)}...`);
    console.log('');
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// STARTUP
// ============================================

async function main() {
  const bridge = new AgentBridge();

  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down...');
    bridge.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    bridge.stop();
    process.exit(0);
  });

  await bridge.start();
}

main();
