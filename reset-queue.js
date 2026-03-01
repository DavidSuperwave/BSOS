const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://your-project.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || 'your-service-key'
);

async function resetErrors() {
  const { data, error } = await supabase
    .from('agent_message_queue')
    .update({ status: 'pending' })
    .eq('status', 'error')
    .eq('queue', 'gtm:queue:dev')
    .select();

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`Reset ${data.length} messages to pending`);
}

resetErrors();
