/**
 * Visual Demo Script for Research Workflow
 * 
 * This script demonstrates the research workflow with formatted output
 * that can be used as a guide for recording a video.
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const readline = require('readline');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPERMEMORY_API_KEY;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function printSection(title) {
  console.log('\n' + '='.repeat(70));
  console.log(`  ${title}`);
  console.log('='.repeat(70) + '\n');
}

function printStep(stepNum, description) {
  console.log(`\n📌 Step ${stepNum}: ${description}`);
  console.log('─'.repeat(70));
}

function printSuccess(message) {
  console.log(`✅ ${message}`);
}

function printInfo(message) {
  console.log(`ℹ️  ${message}`);
}

function printCode(code) {
  console.log('\n```');
  console.log(code);
  console.log('```\n');
}

async function demonstrateWorkflow() {
  console.clear();
  
  printSection('RESEARCH WORKFLOW DEMONSTRATION');
  console.log('This demo shows how to use the research workflow feature');
  console.log('to research topics, generate email scripts, and create campaigns.\n');
  
  await delay(2000);

  // Step 1: Show how to access the feature
  printStep(1, 'Accessing the Chat Agent');
  console.log('1. Open the Blitzscale OS dashboard');
  console.log('2. Navigate to the Chat interface');
  console.log('3. Select your company (e.g., Superwave)');
  console.log('4. You\'ll see the chat interface with Julian, the AI agent');
  
  await delay(3000);
  printSuccess('Chat interface ready');
  
  await delay(1000);

  // Step 2: Show the research command
  printStep(2, 'Initiating Research');
  console.log('Type this command in the chat:');
  printCode('Research "Marketing agencies" based on my company profile and generate 3 email scripts. Use David@superwave.ai as the sender.');
  
  await delay(2000);
  printInfo('The agent will recognize this as a research workflow request');
  printInfo('It will call the research_and_create_campaign tool');
  
  await delay(2000);

  // Step 3: Show what happens behind the scenes
  printStep(3, 'Behind the Scenes - Research Process');
  console.log('The system will:');
  console.log('  1. Fetch your company profile from Supabase');
  await delay(1000);
  printSuccess('   ✓ Company profile loaded');
  
  console.log('  2. Build a research query with company context');
  await delay(1000);
  printSuccess('   ✓ Research query: "Marketing agencies as target market for Superwave"');
  
  console.log('  3. Call Perplexity AI for market research');
  await delay(2000);
  printSuccess('   ✓ Research completed (5,426 characters, 9 citations)');
  
  console.log('  4. Generate 3 email scripts using AI');
  await delay(2000);
  printSuccess('   ✓ Script 1: "Deliverability Crisis Fix" (F1 framework)');
  printSuccess('   ✓ Script 2: "Fragmented Systems Buster" (F2 framework)');
  printSuccess('   ✓ Script 3: "2026 Mandate Prep" (F3 framework)');
  
  console.log('  5. Store research in Supermemory');
  await delay(1000);
  printSuccess('   ✓ Research stored (Memory ID: LUwvX4ETbbpMLFhap5o7vL)');
  
  await delay(2000);

  // Step 4: Show the response
  printStep(4, 'Agent Response');
  console.log('The agent will respond with:');
  console.log('');
  console.log('📊 Research Results:');
  console.log('   Topic: Marketing agencies');
  console.log('   Research: [Comprehensive market analysis with pain points,');
  console.log('             buyer personas, competitive landscape, and');
  console.log('             messaging angles]');
  console.log('   Citations: 9 sources');
  console.log('');
  console.log('📧 Email Scripts Generated:');
  console.log('   1. Deliverability Crisis Fix');
  console.log('      Subject: "Is {{company}} dealing with email deliverability issues?"');
  console.log('      Angle: Infrastructure Pain');
  console.log('');
  console.log('   2. Fragmented Systems Buster');
  console.log('      Subject: "{{company}} is likely wasting money on bad data"');
  console.log('      Angle: Data Quality');
  console.log('');
  console.log('   3. 2026 Mandate Prep');
  console.log('      Subject: "10x outreach without hiring"');
  console.log('      Angle: Scale Without Hiring');
  console.log('');
  console.log('💾 Research stored in Supermemory for future reference');
  console.log('');
  console.log('🎯 Next Steps:');
  console.log('   - Review the email scripts above');
  console.log('   - Create a campaign using: create_campaign tool');
  
  await delay(3000);

  // Step 5: Show campaign creation
  printStep(5, 'Creating a Campaign');
  console.log('Type this command in the chat:');
  printCode('Create a campaign called "Marketing Agencies Q1 2025" using all 3 email scripts from the research.');
  
  await delay(2000);
  printInfo('The agent will call the create_campaign tool');
  
  console.log('\nThe system will:');
  console.log('  1. Create campaign in PlusVibe');
  await delay(1000);
  printSuccess('   ✓ Campaign created (ID: 69aa87dc8e49b5cc01559a2d)');
  
  console.log('  2. Add email sequences');
  await delay(1000);
  printSuccess('   ✓ Sequence 1: Day 1 (first email)');
  printSuccess('   ✓ Sequence 2: Day 4 (follow-up, 3 days later)');
  printSuccess('   ✓ Sequence 3: Day 9 (final follow-up, 5 days later)');
  
  console.log('  3. Configure wait times');
  await delay(1000);
  printSuccess('   ✓ Wait times: 1 day, 3 days, 5 days');
  
  await delay(2000);

  // Step 6: Show final result
  printStep(6, 'Campaign Ready');
  console.log('✅ Campaign "Marketing Agencies Q1 2025" is now ready!');
  console.log('');
  console.log('Campaign Details:');
  console.log('  - Campaign ID: 69aa87dc8e49b5cc01559a2d');
  console.log('  - Email Sequences: 3');
  console.log('  - Sender: David@superwave.ai');
  console.log('  - Status: Ready to add leads and activate');
  console.log('');
  console.log('Next Steps:');
  console.log('  1. Add leads to the campaign');
  console.log('  2. Review email sequences in PlusVibe');
  console.log('  3. Activate the campaign when ready');
  
  await delay(2000);

  // Step 7: Show Supermemory integration
  printStep(7, 'Supermemory Integration');
  console.log('All research and actions are stored in Supermemory:');
  console.log('');
  console.log('📚 Stored Information:');
  console.log('   - Research findings');
  console.log('   - Citations (9 sources)');
  console.log('   - All 3 email scripts');
  console.log('   - Campaign creation details');
  console.log('   - Actions taken log');
  console.log('');
  console.log('💡 Benefits:');
  console.log('   - Future research can reference this data');
  console.log('   - Agent can learn from past campaigns');
  console.log('   - Knowledge base grows automatically');
  
  await delay(2000);

  // Summary
  printSection('WORKFLOW SUMMARY');
  console.log('✅ Complete workflow demonstrated:');
  console.log('');
  console.log('   1. Research topic → Perplexity AI');
  console.log('   2. Generate scripts → AI email copywriting');
  console.log('   3. Store research → Supermemory');
  console.log('   4. Create campaign → PlusVibe');
  console.log('   5. Campaign ready → Add leads & activate');
  console.log('');
  console.log('🎉 The entire process takes ~15-20 seconds!');
  console.log('');
  console.log('📝 Key Features:');
  console.log('   • Company profile-aware research');
  console.log('   • AI-generated email scripts');
  console.log('   • Automatic Supermemory storage');
  console.log('   • Direct campaign creation');
  console.log('   • All from the chat interface');
  
  await delay(2000);

  printSection('VIDEO RECORDING GUIDE');
  console.log('To record a video demonstration:');
  console.log('');
  console.log('1. Screen Recording Setup:');
  console.log('   - Use OBS, Loom, or QuickTime');
  console.log('   - Record at 1080p or higher');
  console.log('   - Include audio narration');
  console.log('');
  console.log('2. Recording Steps:');
  console.log('   a. Show the chat interface');
  console.log('   b. Type the research command');
  console.log('   c. Show the agent processing (tool calls)');
  console.log('   d. Show the research results');
  console.log('   e. Show the email scripts');
  console.log('   f. Type the campaign creation command');
  console.log('   g. Show the campaign being created');
  console.log('   h. Show the final campaign in PlusVibe');
  console.log('   i. Show Supermemory storage (optional)');
  console.log('');
  console.log('3. Key Points to Highlight:');
  console.log('   • Natural language commands');
  console.log('   • AI-powered research');
  console.log('   • Automatic script generation');
  console.log('   • Seamless campaign creation');
  console.log('   • Knowledge storage');
  console.log('');
  console.log('4. Estimated Video Length: 3-5 minutes');
  
  console.log('\n' + '='.repeat(70));
  console.log('Demo complete! Ready for video recording.');
  console.log('='.repeat(70) + '\n');
  
  rl.close();
}

// Run the demo
demonstrateWorkflow().catch(console.error);
