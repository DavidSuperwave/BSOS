require("dotenv").config({ path: ".env.local" });
const { Client } = require("ssh2");
const WebSocket = require("ws");
const net = require("net");
const crypto = require("crypto");

const sshKey = process.env.PROVISIONER_SSH_KEY;
if (!sshKey) { console.error("No SSH key"); process.exit(1); }
const cleanKey = sshKey.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

// Test against supersauce container (port 18791)
const REMOTE_PORT = 18791;
const TOKEN = "a29720a9-f0f7-40d7-ac74-5fc4b815b9a1"; // supersauce company UUID

function b64url(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function main() {
  console.log("1. Creating SSH connection...");
  const sshConn = new Client();

  await new Promise((resolve, reject) => {
    sshConn.on("ready", resolve);
    sshConn.on("error", reject);
    sshConn.connect({
      host: "159.65.220.183",
      port: 22,
      username: "root",
      privateKey: cleanKey,
      readyTimeout: 15000,
    });
  });
  console.log("   SSH connected");

  console.log("2. Creating local TCP bridge...");
  const server = net.createServer((localSocket) => {
    console.log("   Bridge: new connection");
    sshConn.forwardOut("127.0.0.1", 0, "127.0.0.1", REMOTE_PORT, (err, remoteStream) => {
      if (err) {
        console.error("   Bridge: forwardOut error:", err.message);
        localSocket.destroy();
        return;
      }
      console.log("   Bridge: tunnel established");
      localSocket.pipe(remoteStream).pipe(localSocket);
    });
  });

  const localPort = await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve(server.address().port);
    });
  });
  console.log(`   Bridge listening on 127.0.0.1:${localPort}`);

  console.log("3. Creating WebSocket...");
  const ws = new WebSocket(`ws://127.0.0.1:${localPort}`);

  ws.on("open", () => console.log("   WS open"));
  ws.on("error", (err) => console.error("   WS error:", err.message));
  ws.on("close", (code, reason) => console.log(`   WS closed: ${code} ${reason}`));

  // Listen for all messages and log them
  ws.on("message", (raw) => {
    const text = raw.toString();
    console.log("   WS message:", text.slice(0, 200));

    try {
      const msg = JSON.parse(text);

      if (msg.type === "event" && msg.event === "connect.challenge") {
        console.log("4. Got challenge, nonce:", msg.payload?.nonce?.slice(0, 20) + "...");

        const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
        const pubRaw = publicKey.export({ type: "spki", format: "der" }).slice(-32);
        const deviceId = crypto.createHash("sha256").update(pubRaw).digest("hex");
        const pubB64 = b64url(pubRaw);
        const nonce = msg.payload.nonce;
        const signedAt = Date.now();
        const payload = ["v2", deviceId, "cli", "backend", "operator", "operator.read,operator.write", signedAt, TOKEN, nonce].join("|");
        const sig = crypto.sign(null, Buffer.from(payload), privateKey);

        const connectReq = {
          type: "req",
          id: "connect-1",
          method: "connect",
          params: {
            minProtocol: 3,
            maxProtocol: 3,
            client: { id: "cli", version: "1.0.0", platform: "win32", mode: "backend" },
            role: "operator",
            scopes: ["operator.read", "operator.write"],
            caps: ["tool-events"],
            commands: [],
            permissions: {},
            auth: { token: TOKEN },
            locale: "en-US",
            userAgent: "blitzscale-ui/1.0.0",
            device: {
              id: deviceId,
              publicKey: pubB64,
              signature: b64url(sig),
              signedAt,
              nonce,
            },
          },
        };

        console.log("5. Sending connect request...");
        ws.send(JSON.stringify(connectReq));
      }

      if (msg.type === "res" && msg.id === "connect-1") {
        console.log("6. Connect result:", msg.ok ? "SUCCESS" : "FAILED");
        if (!msg.ok) console.log("   Error:", JSON.stringify(msg.error));

        // Try chat.send
        if (msg.ok) {
          console.log("7. Sending chat.send...");
          ws.send(JSON.stringify({
            type: "req",
            id: "chat-1",
            method: "chat.send",
            params: {
              message: "Hello, just testing. Reply with one word.",
              sessionKey: "test-session-1",
              idempotencyKey: `test-${Date.now()}`,
            },
          }));
        } else {
          cleanup();
        }
      }

      if (msg.type === "res" && msg.id === "chat-1") {
        console.log("8. Chat result:", msg.ok ? "SUCCESS" : "FAILED");
        if (msg.ok) console.log("   Payload:", JSON.stringify(msg.payload).slice(0, 300));
        if (!msg.ok) { console.log("   Error:", JSON.stringify(msg.error)); cleanup(); }
        // Don't cleanup yet — wait for streaming events
      }

      // Log streaming events
      if (msg.type === "event" && msg.event === "chat") {
        console.log("   Chat event:", JSON.stringify(msg.payload).slice(0, 200));
      }
    } catch {
      // not JSON
    }
  });

  function cleanup() {
    console.log("\nCleaning up...");
    try { ws.close(); } catch {}
    try { server.close(); } catch {}
    try { sshConn.end(); } catch {}
    setTimeout(() => process.exit(0), 1000);
  }

  // Timeout after 30s
  setTimeout(() => {
    console.log("\n=== TIMEOUT after 30s ===");
    cleanup();
  }, 30000);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
