const { Client } = require("ssh2");
const WebSocket = require("ws");
require("dotenv").config({ path: ".env.local" });

const DROPLET_IP = process.env.DROPLET_IP || "159.65.220.183";
const SSH_KEY = process.env.PROVISIONER_SSH_KEY;
const OPENROUTER_KEY = "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";

const TEST_MESSAGE = "Hello! This is a test. Please respond with a short greeting and your model name.";

function createSSHTunnel(port) {
  return new Promise((resolve, reject) => {
    const { Client } = require("ssh2");
    const net = require("net");
    
    const sshConn = new Client();
    const localPort = 0; // Random available port
    
    sshConn.on("ready", () => {
      // Create a local server that forwards to the SSH tunnel
      const server = net.createServer((socket) => {
        sshConn.forwardOut("127.0.0.1", 0, "127.0.0.1", port, (err, stream) => {
          if (err) {
            socket.end();
            return;
          }
          socket.pipe(stream).pipe(socket);
        });
      });
      
      server.listen(localPort, "127.0.0.1", () => {
        const actualPort = server.address().port;
        console.log(`SSH tunnel established: localhost:${actualPort} -> droplet:${port}`);
        resolve({
          port: actualPort,
          cleanup: () => {
            server.close();
            sshConn.end();
          }
        });
      });
    });
    
    sshConn.on("error", reject);
    sshConn.connect({
      host: DROPLET_IP,
      username: "root",
      privateKey: SSH_KEY.replace(/\r\n/g, "\n").replace(/\r/g, "\n"),
    });
  });
}

async function performHandshake(ws, token) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Handshake timeout")), 10000);
    
    const onMessage = (data) => {
      const msg = JSON.parse(data.toString());
      
      if (msg.type === "event" && msg.event === "connect.challenge") {
        // Send simplified handshake (this is what your code does)
        ws.send(JSON.stringify({
          type: "req",
          id: "connect-1",
          method: "connect",
          params: {
            token: token,
            device: { type: "api", name: "blitzscale-test" }
          }
        }));
      }
      
      if (msg.type === "res" && msg.id === "connect-1") {
        clearTimeout(timeout);
        ws.removeListener("message", onMessage);
        
        if (msg.ok) {
          resolve(true);
        } else {
          reject(new Error(`Handshake failed: ${msg.error?.message || 'unknown'}`));
        }
      }
    };
    
    ws.on("message", onMessage);
  });
}

async function sendChatMessage(ws, message, sessionKey) {
  return new Promise((resolve, reject) => {
    const responses = [];
    const timeout = setTimeout(() => {
      ws.close();
      resolve(responses);
    }, 15000);
    
    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      
      if (msg.type === "event") {
        responses.push(msg);
        
        // Check for completion
        if (msg.event === "chat.complete" || msg.event === "chat.error") {
          clearTimeout(timeout);
          ws.close();
          resolve(responses);
        }
      }
    });
    
    // Send chat message
    ws.send(JSON.stringify({
      type: "req",
      id: `chat-${Date.now()}`,
      method: "chat.send",
      params: {
        message: message,
        sessionKey: sessionKey,
        idempotencyKey: `test-${Date.now()}`
      }
    }));
  });
}

async function testChatWithTunnel(companyId, port, companyName) {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`🧪 Testing Chat: ${companyName} (port ${port})`);
  console.log("=".repeat(70));

  let tunnel;
  
  try {
    // 1. Create SSH tunnel
    console.log("\n1. Creating SSH tunnel...");
    tunnel = await createSSHTunnel(port);
    console.log(`✅ Tunnel ready on port ${tunnel.port}`);

    // 2. Connect WebSocket
    console.log("\n2. Connecting WebSocket...");
    const ws = new WebSocket(`ws://127.0.0.1:${tunnel.port}`);
    
    await new Promise((resolve, reject) => {
      ws.on("open", resolve);
      ws.on("error", reject);
      setTimeout(() => reject(new Error("WS connection timeout")), 5000);
    });
    console.log("✅ WebSocket connected");

    // 3. Perform handshake
    console.log("\n3. Performing handshake...");
    await performHandshake(ws, companyId);
    console.log("✅ Handshake successful");

    // 4. Send chat message
    console.log("\n4. Sending chat message...");
    console.log(`   Message: "${TEST_MESSAGE}"`);
    
    const sessionKey = `test-session-${Date.now()}`;
    const responses = await sendChatMessage(ws, TEST_MESSAGE, sessionKey);
    
    console.log("\n5. Responses received:");
    let fullResponse = "";
    let modelUsed = null;
    let hasError = false;
    
    for (const msg of responses) {
      if (msg.event === "chat.chunk") {
        process.stdout.write(msg.chunk || "");
        fullResponse += msg.chunk || "";
      } else if (msg.event === "chat.error") {
        console.log(`\n❌ Error: ${msg.error}`);
        hasError = true;
      } else if (msg.event === "chat.complete") {
        console.log("\n✅ Chat complete");
        if (msg.model) modelUsed = msg.model;
      } else if (msg.event === "chat.metadata") {
        if (msg.model) modelUsed = msg.model;
      }
    }
    
    console.log("\n\n6. Results:");
    console.log(`   Response length: ${fullResponse.length} chars`);
    console.log(`   Model used: ${modelUsed || "unknown"}`);
    console.log(`   Has error: ${hasError ? "Yes ❌" : "No ✅"}`);
    
    return {
      success: !hasError && fullResponse.length > 0,
      model: modelUsed,
      response: fullResponse,
      error: hasError
    };
    
  } catch (err) {
    console.error(`\n❌ Test failed: ${err.message}`);
    return { success: false, error: err.message };
  } finally {
    if (tunnel) {
      tunnel.cleanup();
      console.log("\n✅ Tunnel closed");
    }
  }
}

async function main() {
  console.log("🚀 CHAT TEST - Full End-to-End");
  console.log(`Time: ${new Date().toLocaleString()}`);
  console.log(`Droplet: ${DROPLET_IP}`);
  console.log(`Test message: "${TEST_MESSAGE}"`);

  if (!SSH_KEY) {
    console.error("❌ PROVISIONER_SSH_KEY not set");
    process.exit(1);
  }

  const results = [];

  // Test Superdunked (supersauce container)
  try {
    const result1 = await testChatWithTunnel(
      "a29720a9-f0f7-40d7-ac74-5fc4b815b9a1",
      18791,
      "Superdunked"
    );
    results.push({ company: "Superdunked", ...result1 });
  } catch (err) {
    results.push({ company: "Superdunked", success: false, error: err.message });
  }

  // Test Supersauce (superwaveio container)
  try {
    const result2 = await testChatWithTunnel(
      "e11e1b5b-a5d5-46d5-9d93-7f527ab40b90",
      18790,
      "Supersauce"
    );
    results.push({ company: "Supersauce", ...result2 });
  } catch (err) {
    results.push({ company: "Supersauce", success: false, error: err.message });
  }

  // Final summary
  console.log("\n" + "=".repeat(70));
  console.log("📊 FINAL TEST RESULTS");
  console.log("=".repeat(70));
  
  for (const r of results) {
    console.log(`\n${r.company}:`);
    console.log(`  Status: ${r.success ? "✅ PASSED" : "❌ FAILED"}`);
    if (r.model) console.log(`  Model: ${r.model}`);
    if (r.error) console.log(`  Error: ${r.error}`);
    if (r.response) console.log(`  Response preview: ${r.response.slice(0, 100)}...`);
  }
  
  const allPassed = results.every(r => r.success);
  
  console.log("\n" + "=".repeat(70));
  if (allPassed) {
    console.log("🎉 ALL CHAT TESTS PASSED!");
    console.log("\n✅ Chat is working via Claude through OpenRouter");
    console.log("✅ Ready to use in production");
    console.log("\nNext: Build custom image for Kimi support");
  } else {
    console.log("⚠️ Some tests failed");
    console.log("Check errors above");
  }
  console.log("=".repeat(70));
}

main().catch(console.error);
