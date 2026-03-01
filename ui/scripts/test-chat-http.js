const { Client } = require("ssh2");
require("dotenv").config({ path: ".env.local" });

const DROPLET_IP = process.env.DROPLET_IP || "159.65.220.183";
const SSH_KEY = process.env.PROVISIONER_SSH_KEY;

const TEST_MESSAGE = "Hello! This is a test. Please respond with a short greeting.";

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

async function testChatHTTP(container, port, companyId, companyName) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Testing: ${companyName} (${container})`);
  console.log("=".repeat(60));

  // Test via curl through SSH
  console.log("\n1. Testing HTTP hooks endpoint...");
  
  const curlCmd = `
    curl -s -X POST http://127.0.0.1:${port}/hooks/agent \\
      -H "Content-Type: application/json" \\
      -H "Authorization: Bearer ${companyId}" \\
      -d '{
        "message": "${TEST_MESSAGE}",
        "agentId": "main",
        "stream": false
      }' \\
      --max-time 30 2>&1
  `;
  
  const startTime = Date.now();
  const { stdout, stderr } = await sshExec(curlCmd);
  const duration = Date.now() - startTime;
  
  console.log(`\n2. Response received in ${duration}ms:`);
  
  if (stdout.trim()) {
    try {
      const response = JSON.parse(stdout);
      console.log("✅ Valid JSON response");
      
      if (response.response || response.content || response.choices?.[0]?.message?.content) {
        const text = response.response || response.content || response.choices[0].message.content;
        console.log("\n📝 Response text:");
        console.log(text.slice(0, 200));
        if (text.length > 200) console.log("... (truncated)");
        
        if (response.model) {
          console.log(`\n🤖 Model used: ${response.model}`);
        }
        
        return { success: true, response: text, model: response.model };
      } else if (response.error) {
        console.log(`\n❌ API Error: ${response.error}`);
        return { success: false, error: response.error };
      } else {
        console.log("\n⚠️ Unexpected response structure:");
        console.log(JSON.stringify(response, null, 2).slice(0, 500));
        return { success: false, error: "Unexpected structure" };
      }
    } catch (e) {
      console.log("⚠️ Not valid JSON, raw response:");
      console.log(stdout.slice(0, 300));
      return { success: false, error: "Invalid JSON", raw: stdout };
    }
  } else {
    console.log("❌ No response (timeout or error)");
    console.log("Stderr:", stderr || "none");
    return { success: false, error: "No response" };
  }
}

async function checkContainerStatus(name) {
  console.log(`\n📊 Container: ${name}`);
  
  const { stdout: running } = await sshExec(
    `docker inspect --format='{{.State.Running}}' ${name} 2>/dev/null || echo "not_found"`
  );
  
  if (running.trim() !== "true") {
    console.log("❌ Not running");
    return false;
  }
  console.log("✅ Running");
  
  // Check logs for model
  const { stdout: logs } = await sshExec(
    `docker logs --tail 5 ${name} 2>&1 | grep "agent model" || echo "No model info"`
  );
  console.log(`📝 ${logs.trim()}`);
  
  return true;
}

async function main() {
  console.log("🚀 CHAT TEST - HTTP Hooks API");
  console.log(`Time: ${new Date().toLocaleString()}`);
  
  if (!SSH_KEY) {
    console.error("❌ PROVISIONER_SSH_KEY not set");
    process.exit(1);
  }

  // Check containers first
  console.log("\n" + "=".repeat(60));
  console.log("CONTAINER STATUS");
  console.log("=".repeat(60));
  
  const supersauce = await checkContainerStatus("openclaw-supersauce");
  const superwaveio = await checkContainerStatus("openclaw-superwaveio");
  
  if (!supersauce || !superwaveio) {
    console.log("\n❌ Some containers are not running!");
    return;
  }

  // Test chat
  console.log("\n" + "=".repeat(60));
  console.log("CHAT TESTS");
  console.log("=".repeat(60));

  const results = [];
  
  // Test Superdunked
  try {
    const r1 = await testChatHTTP(
      "openclaw-supersauce",
      18791,
      "a29720a9-f0f7-40d7-ac74-5fc4b815b9a1",
      "Superdunked"
    );
    results.push({ company: "Superdunked", ...r1 });
  } catch (err) {
    results.push({ company: "Superdunked", success: false, error: err.message });
  }

  // Test Supersauce
  try {
    const r2 = await testChatHTTP(
      "openclaw-superwaveio",
      18790,
      "e11e1b5b-a5d5-46d5-9d93-7f527ab40b90",
      "Supersauce"
    );
    results.push({ company: "Supersauce", ...r2 });
  } catch (err) {
    results.push({ company: "Supersauce", success: false, error: err.message });
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("📊 FINAL RESULTS");
  console.log("=".repeat(60));
  
  for (const r of results) {
    console.log(`\n${r.company}:`);
    console.log(`  ${r.success ? "✅ PASSED" : "❌ FAILED"}`);
    if (r.model) console.log(`  Model: ${r.model}`);
    if (r.error) console.log(`  Error: ${r.error}`);
  }
  
  const passed = results.filter(r => r.success).length;
  console.log(`\n${passed}/${results.length} tests passed`);
  
  if (passed === results.length) {
    console.log("\n🎉 CHAT IS WORKING!");
    console.log("\nReady for: Fork & Build Custom Image for Kimi");
  }
}

main().catch(console.error);
