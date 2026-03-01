const { Client } = require("ssh2");
require("dotenv").config({ path: ".env.local" });

const DROPLET_IP = process.env.DROPLET_IP || "159.65.220.183";
const SSH_KEY = process.env.PROVISIONER_SSH_KEY;

const CONTAINERS = ["openclaw-supersauce", "openclaw-superwaveio"];

function sshExec(cmd) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on("ready", () => {
      conn.exec(cmd, (err, stream) => {
        if (err) return reject(err);
        let stdout = "";
        let stderr = "";
        stream.on("data", (data) => (stdout += data));
        stream.stderr.on("data", (data) => (stderr += data));
        stream.on("close", () => {
          conn.end();
          resolve({ stdout, stderr });
        });
      });
    });
    conn.on("error", reject);
    conn.connect({
      host: DROPLET_IP,
      username: "root",
      privateKey: SSH_KEY.replace(/\r\n/g, "\n").replace(/\r/g, "\n"),
    });
  });
}

async function findAndPatch(container) {
  console.log(`\n=== Patching ${container} ===\n`);

  // 1. Find files containing the hardcoded model
  console.log("1. Searching for hardcoded model...");
  const { stdout: files } = await sshExec(
    `docker exec ${container} find /app -name "*.js" -exec grep -l "claude-opus-4-6" {} \\; 2>/dev/null | head -5`
  );
  
  if (!files.trim()) {
    console.log("❌ No files found with claude-opus-4-6");
    
    // Try different search
    console.log("\n2. Trying broader search...");
    const { stdout: broad } = await sshExec(
      `docker exec ${container} grep -r "claude-opus" /app/dist/ 2>/dev/null | head -5 || echo "Not in dist"`
    );
    console.log(broad || "Not found in dist");
    
    // Check if it's in the binary
    console.log("\n3. Checking compiled binary...");
    const { stdout: binary } = await sshExec(
      `docker exec ${container} strings /app/node_modules/.bin/openclaw 2>/dev/null | grep -i claude | head -5 || echo "Not in binary"`
    );
    console.log(binary || "Not in binary");
    
    return false;
  }
  
  console.log(`Found files:\n${files}`);
  
  // 2. Patch each file
  for (const file of files.trim().split("\n")) {
    if (!file) continue;
    console.log(`\n4. Patching ${file}...`);
    
    // Use sed to replace the model
    const { stdout: patchResult } = await sshExec(
      `docker exec ${container} sh -c "sed -i 's/anthropic\\/claude-opus-4-6/kimi-coding\\/k2p5/g' ${file} && echo 'Patched' || echo 'Failed'"`
    );
    console.log(patchResult);
  }
  
  return true;
}

async function testAfterPatch(container) {
  console.log(`\n=== Testing ${container} after patch ===\n`);
  
  // Restart to pick up changes
  console.log("1. Restarting container...");
  await sshExec(`docker restart ${container}`);
  await new Promise(r => setTimeout(r, 5000));
  
  // Check logs
  console.log("\n2. Checking agent model in logs...");
  const { stdout: logs } = await sshExec(
    `docker logs --tail 10 ${container} 2>&1 | grep "agent model" || echo "No model log found"`
  );
  console.log(logs);
  
  if (logs.includes("kimi")) {
    console.log("🎅 SUCCESS! Kimi is now being used!");
    return true;
  } else {
    console.log("⚠️ Still using Claude — patch may not have worked or model is compiled in");
    return false;
  }
}

async function main() {
  console.log("🔧 Runtime Patch Test");
  console.log("Testing if we can patch the model without forking...\n");
  
  if (!SSH_KEY) {
    console.error("❌ PROVISIONER_SSH_KEY not set");
    process.exit(1);
  }

  for (const container of CONTAINERS) {
    try {
      const patched = await findAndPatch(container);
      if (patched) {
        await testAfterPatch(container);
      }
    } catch (err) {
      console.error(`Error with ${container}:`, err.message);
    }
  }
  
  console.log("\n" + "=".repeat(50));
  console.log("If runtime patching fails, fork+build is the next option.");
  console.log("=".repeat(50));
}

main().catch(console.error);
