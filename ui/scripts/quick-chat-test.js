const { Client } = require("ssh2");
require("dotenv").config({ path: ".env.local" });

const DROPLET_IP = process.env.DROPLET_IP || "159.65.220.183";
const SSH_KEY = process.env.PROVISIONER_SSH_KEY;

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

async function quickTest() {
  console.log("⚡ Quick Chat Test\n");

  // Test 1: Health endpoint
  console.log("1. Testing /health endpoint...");
  const { stdout: health18791 } = await sshExec('curl -s http://127.0.0.1:18791/health --max-time 5 2>&1');
  const { stdout: health18790 } = await sshExec('curl -s http://127.0.0.1:18790/health --max-time 5 2>&1');
  console.log(`Port 18791: ${health18791.trim() || "No response"}`);
  console.log(`Port 18790: ${health18790.trim() || "No response"}`);

  // Test 2: Available endpoints
  console.log("\n2. Checking available endpoints...");
  const { stdout: root18791 } = await sshExec('curl -s http://127.0.0.1:18791/ --max-time 3 2>&1 | head -c 100');
  console.log(`Port 18791 root: ${root18791.trim().slice(0, 80) || "No response"}...`);

  // Test 3: Hooks with proper auth
  console.log("\n3. Testing /hooks/agent with auth...");
  const testPayload = JSON.stringify({
    message: "Hello test",
    agentId: "main"
  });
  
  const { stdout: hook1 } = await sshExec(
    `curl -s -X POST http://127.0.0.1:18791/hooks/agent ` +
    `-H "Content-Type: application/json" ` +
    `-H "Authorization: Bearer a29720a9-f0f7-40d7-ac74-5fc4b815b9a1" ` +
    `-d '${testPayload}' --max-time 15 2>&1 | head -c 200`
  );
  console.log(`Response: ${hook1.trim() || "No response"}`);

  // Test 4: Check for errors in logs
  console.log("\n4. Recent errors in logs...");
  const { stdout: errors } = await sshExec(
    'docker logs openclaw-supersauce --tail 20 2>&1 | grep -iE "(error|fail|401|403)" | tail -5 || echo "No recent errors"'
  );
  console.log(errors.trim() || "No errors found");

  // Test 5: Direct exec test
  console.log("\n5. Testing with docker exec...");
  const { stdout: execTest } = await sshExec(
    'docker exec openclaw-supersauce curl -s http://127.0.0.1:18789/health --max-time 3 2>&1'
  );
  console.log(`From inside container: ${execTest.trim() || "No response"}`);
}

async function main() {
  if (!SSH_KEY) {
    console.error("❌ PROVISIONER_SSH_KEY not set");
    process.exit(1);
  }

  try {
    await quickTest();
    
    console.log("\n" + "=".repeat(50));
    console.log("Summary:");
    console.log("- If health endpoint works, infrastructure is good");
    console.log("- If hooks fail, may need WebSocket protocol instead");
    console.log("- Check UI integration for actual chat flow");
    console.log("=".repeat(50));
  } catch (err) {
    console.error("Error:", err.message);
  }
}

main().catch(console.error);
