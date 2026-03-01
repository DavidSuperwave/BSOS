require("dotenv").config({ path: ".env.local" });
const { Client } = require("ssh2");
const WebSocket = require("ws");
const net = require("net");
const crypto = require("crypto");

const sshKey = process.env.PROVISIONER_SSH_KEY;
if (!sshKey) {
  console.error("No PROVISIONER_SSH_KEY");
  process.exit(1);
}
const cleanKey = sshKey.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

const TARGETS = [
  {
    name: "Superdunked",
    port: 18791,
    token: "a29720a9-f0f7-40d7-ac74-5fc4b815b9a1",
  },
  {
    name: "Supersauce",
    port: 18790,
    token: "e11e1b5b-a5d5-46d5-9d93-7f527ab40b90",
  },
];

function b64url(buf) {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function testTarget(target) {
  const sshConn = new Client();
  let ws;
  let server;

  try {
    await new Promise((resolve, reject) => {
      sshConn.on("ready", resolve);
      sshConn.on("error", reject);
      sshConn.connect({
        host: process.env.DROPLET_IP || "159.65.220.183",
        port: 22,
        username: "root",
        privateKey: cleanKey,
        readyTimeout: 15000,
      });
    });

    server = net.createServer((localSocket) => {
      sshConn.forwardOut("127.0.0.1", 0, "127.0.0.1", target.port, (err, remoteStream) => {
        if (err) {
          localSocket.destroy();
          return;
        }
        localSocket.pipe(remoteStream).pipe(localSocket);
      });
    });

    const localPort = await new Promise((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve(server.address().port));
    });

    const result = await new Promise((resolve, reject) => {
      let finalText = "";
      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          reject(new Error("timeout waiting for final response"));
        }
      }, 35000);

      const done = (value, isError = false) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeout);
        if (isError) reject(value);
        else resolve(value);
      };

      ws = new WebSocket(`ws://127.0.0.1:${localPort}`);

      ws.on("error", (err) => done(err, true));
      ws.on("message", (raw) => {
        try {
          const msg = JSON.parse(raw.toString());

          if (msg.type === "event" && msg.event === "connect.challenge") {
            const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
            const pubRaw = publicKey.export({ type: "spki", format: "der" }).slice(-32);
            const deviceId = crypto.createHash("sha256").update(pubRaw).digest("hex");
            const pubB64 = b64url(pubRaw);
            const nonce = msg.payload.nonce;
            const signedAt = Date.now();
            const payload = [
              "v2",
              deviceId,
              "cli",
              "backend",
              "operator",
              "operator.read,operator.write",
              signedAt,
              target.token,
              nonce,
            ].join("|");
            const sig = crypto.sign(null, Buffer.from(payload), privateKey);

            ws.send(
              JSON.stringify({
                type: "req",
                id: "connect-1",
                method: "connect",
                params: {
                  minProtocol: 3,
                  maxProtocol: 3,
                  client: {
                    id: "cli",
                    version: "1.0.0",
                    platform: "win32",
                    mode: "backend",
                  },
                  role: "operator",
                  scopes: ["operator.read", "operator.write"],
                  caps: ["tool-events"],
                  commands: [],
                  permissions: {},
                  auth: { token: target.token },
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
              })
            );
            return;
          }

          if (msg.type === "res" && msg.id === "connect-1" && msg.ok) {
            ws.send(
              JSON.stringify({
                type: "req",
                id: "chat-1",
                method: "chat.send",
                params: {
                  message: "Hello, respond with one short greeting.",
                  sessionKey: `test-session-${Date.now()}`,
                  idempotencyKey: `test-${Date.now()}`,
                },
              })
            );
            return;
          }

          if (msg.type === "event" && msg.event === "chat") {
            const payload = msg.payload || {};
            if (payload.state === "delta") {
              const text = payload.message?.content?.[0]?.text || "";
              if (text) finalText = text;
            }
            if (payload.state === "final") {
              const text = payload.message?.content?.[0]?.text || finalText;
              return done({ success: true, response: text || "(empty final text)" });
            }
            if (payload.state === "error") {
              return done(new Error(payload.errorMessage || "chat error"), true);
            }
          }
        } catch {
          // ignore malformed frames
        }
      });
    });

    return result;
  } finally {
    try {
      if (ws) ws.close();
    } catch {}
    try {
      if (server) server.close();
    } catch {}
    try {
      sshConn.end();
    } catch {}
  }
}

async function main() {
  const results = [];

  for (const target of TARGETS) {
    process.stdout.write(`Testing ${target.name}... `);
    try {
      const res = await testTarget(target);
      console.log("PASS");
      console.log(`  Response: ${res.response}`);
      results.push({ target: target.name, ok: true });
    } catch (err) {
      console.log("FAIL");
      console.log(`  Error: ${err.message}`);
      results.push({ target: target.name, ok: false, error: err.message });
    }
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} containers passed`);
  if (passed !== results.length) process.exit(1);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
