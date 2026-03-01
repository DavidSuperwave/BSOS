import WebSocket from "ws";
import crypto from "crypto";

const token = process.env.OPENCLAW_GATEWAY_TOKEN || "a29720a9-f0f7-40d7-ac74-5fc4b815b9a1";

const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
const publicKeyDer = publicKey.export({ type: "spki", format: "der" });
const rawPubKey = publicKeyDer.subarray(12);
const publicKeyB64Url = rawPubKey.toString("base64").replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
const deviceId = crypto.createHash("sha256").update(rawPubKey).digest("hex");
const privatePem = privateKey.export({ type: "pkcs8", format: "pem" });
console.log("Device ID:", deviceId);
console.log("PubKey B64Url:", publicKeyB64Url);

function base64UrlEncode(buf) {
  return buf.toString("base64").replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function signDevicePayload(privateKeyPem, payload) {
  const key = crypto.createPrivateKey(privateKeyPem);
  return base64UrlEncode(crypto.sign(null, Buffer.from(payload, "utf8"), key));
}

function buildDeviceAuthPayload(params) {
  const version = params.nonce ? "v2" : "v1";
  const scopes = params.scopes.join(",");
  const tk = params.token || "";
  const base = [version, params.deviceId, params.clientId, params.clientMode, params.role, scopes, String(params.signedAtMs), tk];
  if (version === "v2") base.push(params.nonce || "");
  return base.join("|");
}

function fullChat(uri) {
  return new Promise((resolve) => {
    console.log("Connecting to " + uri);
    const ws = new WebSocket(uri);
    let mc = 0, done = false;
    function finish() { if (!done) { done = true; try { ws.close(); } catch(e) {} resolve(); } }
    ws.on("open", () => console.log("WS OPEN"));
    ws.on("message", (data) => {
      mc++;
      const msg = JSON.parse(data.toString());
      if (msg.type === "event" && msg.event === "connect.challenge") {
        const nonce = msg.payload.nonce;
        console.log("Challenge nonce=" + nonce);
        const signedAtMs = Date.now();
        const role = "operator";
        const scopes = ["operator.read", "operator.write"];
        const payload = buildDeviceAuthPayload({ deviceId, clientId: "gateway-client", clientMode: "backend", role, scopes, signedAtMs, token, nonce });
        console.log("Payload:", payload);
        const signature = signDevicePayload(privatePem, payload);
        ws.send(JSON.stringify({
          type: "req", id: crypto.randomUUID(), method: "connect",
          params: {
            minProtocol: 3, maxProtocol: 3,
            client: { id: "gateway-client", version: "2026.2.17", platform: "linux", mode: "backend" },
            role, scopes, caps: ["tool-events"], commands: [], permissions: {},
            auth: { token }, locale: "en-US", userAgent: "blitzscale-ui/1.0.0",
            device: { id: deviceId, publicKey: publicKeyB64Url, signature, signedAt: signedAtMs, nonce }
          }
        }));
        console.log("Sent connect with signed device identity");
        return;
      }
      if (msg.type === "res" && msg.ok === true && msg.payload?.type === "hello-ok") {
        console.log("");
        console.log("=== CONNECTED ===");
        console.log("Auth:", JSON.stringify(msg.payload.auth || "none"));
        console.log("Protocol:", msg.payload.protocol);
        setTimeout(() => {
          ws.send(JSON.stringify({ type: "req", id: crypto.randomUUID(), method: "health", params: {} }));
          console.log("--- SENT health ---");
        }, 500);
        setTimeout(() => {
          ws.send(JSON.stringify({ type: "req", id: crypto.randomUUID(), method: "sessions.list", params: {} }));
          console.log("--- SENT sessions.list ---");
        }, 800);
        setTimeout(() => {
          ws.send(JSON.stringify({ type: "req", id: crypto.randomUUID(), method: "chat.send", params: { text: "Hello! Briefly list the tools you can use.", sessionKey: "blitzscale-test-" + Date.now() } }));
          console.log("--- SENT chat.send ---");
        }, 1500);
        return;
      }
      if (msg.type === "res" && msg.ok === false) { console.log(""); console.log("ERROR: " + JSON.stringify(msg.error).substring(0, 500)); }
      if (msg.type === "event") {
        if (msg.event === "chat" || msg.event === "agent") { console.log(""); console.log("--- EVENT: " + msg.event + " ---"); console.log(JSON.stringify(msg.payload).substring(0, 2000)); }
        else if (msg.event !== "tick" && msg.event !== "health" && msg.event !== "connect.challenge" && msg.event !== "presence") { console.log(""); console.log("--- EVENT: " + msg.event + " ---"); console.log(JSON.stringify(msg.payload).substring(0, 500)); }
      }
      if (msg.type === "res" && msg.ok === true && msg.payload?.type !== "hello-ok") { console.log(""); console.log("--- RESPONSE OK ---"); console.log(JSON.stringify(msg.payload).substring(0, 2000)); }
    });
    ws.on("error", (err) => { console.log("WS ERROR: " + err.message); finish(); });
    ws.on("close", (code, reason) => { console.log(""); console.log("WS CLOSED: code=" + code + " reason=" + reason.toString().substring(0, 200)); finish(); });
    setTimeout(() => { console.log(""); console.log("=== DONE: " + mc + " messages ==="); finish(); }, 60000);
  });
}
fullChat("ws://127.0.0.1:18789").catch(console.error);