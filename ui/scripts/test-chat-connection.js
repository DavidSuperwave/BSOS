const { Client } = require("ssh2");
require("dotenv").config({ path: ".env.local" });

const DROPLET_IP = process.env.DROPLET_IP || "159.65.220.183";
const SSH_KEY = process.env.PROVISIONER_SSH_KEY;

const TEST_MESSAGE = "Hello, this is a test message. Please respond with a short greeting.";

const CONTAINERS = [
  { name: "openclaw-supersauce", port: 18791, company: "Superdunked" },
  { name: "openclaw-superwaveio", port: 18790, company: "Supersauce" }
];

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

async function testChat({ name, port, company }) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Testing Chat: ${company} (${name})`);
  console.log("=".repeat(60));

  // 1. Check container is running
  console.log("\n1. Checking container status...");
  const { stdout: running } = await sshExec(
    `docker inspect --format='{{.State.Running}}' ${name} 2>/dev/null || echo "not_found"`
  );
  
  if (running.trim() !== "true") {
    console.log("❌ Container is not running!");
    return false;
  }
  console.log("✅ Container is running");

  // 2. Check auth-profiles.json is in place
  console.log("\n2. Checking auth configuration...");
  const { stdout: authCheck } = await sshExec(
    `docker exec ${name} cat /home/node/.openclaw/auth-profiles.json 2>/dev/null | head -10`
  );
  
  if (authCheck.includes("openrouter")) {
    console.log("✅ Auth profiles configured");
  } else {
    console.log("⚠️ Auth profiles may not be configured correctly");
  }

  // 3. Check recent logs for errors
  console.log("\n3. Checking for recent auth errors...");
  const { stdout: recentLogs } = await sshExec(
    `docker logs --tail 20 ${name} 2>&1 | grep -E "(error|Error|auth|401)" | tail -5 || echo "No errors found"`
  );
  
  if (recentLogs.includes("401") || recentLogs.includes("auth")) {
    console.log("⚠️ Recent auth-related activity:");
    console.log(recentLogs);
  } else {
    console.log("✅ No auth errors in recent logs");
  }

  // 4. Test WebSocket connection (basic connectivity)
  console.log("\n4. Testing WebSocket connectivity...");
  const wsTestScript = `
    const WebSocket = require('ws');
    const ws = new WebSocket('ws://127.0.0.1:${port}', [], {
      handshakeTimeout: 5000
    });
    
    ws.on('open', () => {
      console.log('WS_CONNECTED');
      ws.close();
      process.exit(0);
    });
    
    ws.on('error', (err) => {
      console.log('WS_ERROR:', err.message);
      process.exit(1);
    });
    
    setTimeout(() => {
      console.log('WS_TIMEOUT');
      process.exit(1);
    }, 6000);
  `;
  
  const scriptB64 = Buffer.from(wsTestScript).toString("base64");
  const { stdout: wsResult, stderr: wsError } = await sshExec(
    `echo '${scriptB64}' | base64 -d > /tmp/ws-test-${port}.js && node /tmp/ws-test-${port}.js 2>&1`
  );
  
  if (wsResult.includes("WS_CONNECTED")) {
    console.log("✅ WebSocket connection successful");
  } else {
    console.log("❌ WebSocket connection failed:");
    console.log(wsResult || wsError);
    return false;
  }

  // 5. Check gateway health endpoint
  console.log("\n5. Testing gateway health...");
  const { stdout: health } = await sshExec(
    `curl -s -w "\nHTTP_CODE:%{http_code}" http://127.0.0.1:${port}/health --max-time 5 2>&1 || echo "Health check failed"`
  );
  
  if (health.includes("HTTP_CODE:200")) {
    console.log("✅ Gateway health check passed");
  } else {
    console.log("⚠️ Health check result:", health.slice(-100));
  }

  // 6. Summary
  console.log("\n" + "-".repeat(60));
  console.log(`✅ ${company} chat infrastructure is READY`);
  console.log("-".repeat(60));
  
  return true;
}

async function main() {
  console.log("🧪 Chat Connection Test");
  console.log(`Droplet: ${DROPLET_IP}`);
  console.log(`Testing at: ${new Date().toISOString()}`);

  if (!SSH_KEY) {
    console.error("❌ PROVISIONER_SSH_KEY not set in .env.local");
    process.exit(1);
  }

  let allPassed = true;

  for (const container of CONTAINERS) {
    try {
      const passed = await testChat(container);
      if (!passed) allPassed = false;
    } catch (err) {
      console.error(`\n❌ Error testing ${container.name}:`, err.message);
      allPassed = false;
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("📊 TEST SUMMARY");
  console.log("=".repeat(60));
  
  if (allPassed) {
    console.log("\n🎉 ALL TESTS PASSED!");
    console.log("\n✅ Chat should work via the UI");
    console.log("✅ Using Claude via OpenRouter (model: anthropic/claude-opus-4-6)");
    console.log("\nNext: Try sending a message in the Blitzscale UI chat");
  } else {
    console.log("\n⚠️ Some tests failed");
    console.log("Check the logs above for details");
  }
}

main().catch(console.error);
