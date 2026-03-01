const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = "https://wmncawwcgnotizhowzii.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const NEW_SUPERMEMORY_KEY = "sm_vQ16J416bwGLEhhU1puizH_DVgvosexjQtIzuXgkyLjqkJyIrtUbtbESnCxYQcNDShlaPeQlkfFtCRudLPdAwMH";

async function main() {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Find Superdunked company (slug is 'supersauce')
  const { data: company, error: findError } = await supabase
    .from("companies")
    .select("id, name, slug, integration_credentials")
    .ilike("slug", "supersauce")
    .single();

  if (findError || !company) {
    console.error("Superdunked company not found:", findError);
    process.exit(1);
  }

  console.log("Found company:", company.name, "(", company.slug, ")");
  console.log("ID:", company.id);
  console.log("Current integration_credentials:", company.integration_credentials);

  // Update with new Supermemory key
  const currentIC = company.integration_credentials || {};
  const updatedIC = {
    ...currentIC,
    supermemory_api_key: NEW_SUPERMEMORY_KEY,
  };

  const { error: updateError } = await supabase
    .from("companies")
    .update({ integration_credentials: updatedIC })
    .eq("id", company.id);

  if (updateError) {
    console.error("Failed to update:", updateError);
    process.exit(1);
  }

  console.log("✅ Supermemory API key added to Superdunked");
  console.log("Key (masked):", NEW_SUPERMEMORY_KEY.substring(0, 10) + "...");
}

main();
