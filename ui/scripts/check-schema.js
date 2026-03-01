const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const admin = createClient(supabaseUrl, supabaseServiceKey);

async function checkTableSchema(tableName) {
  console.log(`\n=== Schema for ${tableName} ===\n`);
  
  const { data, error } = await admin
    .from('information_schema.columns')
    .select('column_name, data_type, is_nullable')
    .eq('table_name', tableName)
    .order('ordinal_position');

  if (error) {
    console.error("Error:", error.message);
    return;
  }

  data.forEach(col => {
    console.log(`${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? '(required)' : ''}`);
  });
}

async function main() {
  await checkTableSchema('inbox_messages');
}

main().catch(console.error);
