const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://your-project.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || 'your-service-key'
);

async function checkQueue() {
  const { data, error } = await supabase
    .from('agent_message_queue')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`Found ${data.length} messages:\n`);
  
  for (const msg of data) {
    console.log(`ID: ${msg.id}`);
    console.log(`Queue: ${msg.queue}`);
    console.log(`Status: ${msg.status}`);
    console.log(`Content: ${msg.message?.content?.substring(0, 50)}...`);
    console.log(`Response: ${msg.message?.response ? msg.message.response.substring(0, 50) + '...' : 'None'}`);
    console.log(`Created: ${msg.created_at}`);
    console.log('---');
  }
}

checkQueue();
