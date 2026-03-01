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

const REMOTE_PORT = 18791;
const TOKEN = "a29720a9-f0f7-40d7-ac74-5fc4b815b9a1";
const AGENT_ID = "company-a29720a9-main";

function b64url(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function main() {
  const sshConn = new Client();
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

  const server = net.createServer((localSocket) => {
    sshConn.forwardOut("127.0.0.1", 0, "127.0.0.1", REMOTE_PORT, (err, remoteStream) => {
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

  const ws = new WebSocket(`ws://127.0.0.1:${localPort}`);

  ws.on("message", (raw) => {
    const text = raw.toString();
    const msg = JSON.parse(text);
    console.log("MSG:", msg.type, msg.event || msg.id, JSON.stringify(msg.payload || msg.error || "").slice(0, 240));

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
        TOKEN,
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
            message: "test prompt",
            agentId: AGENT_ID,
            sessionKey: `agent-test-${Date.now()}`,
            idempotencyKey: `agent-test-${Date.now()}`,
          },
        })
      );
      return;
    }
  });

  setTimeout(() => {
    try {
      ws.close();
      server.close();
      sshConn.end();
    } catch {}
    process.exit(0);
  }, 25000);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
