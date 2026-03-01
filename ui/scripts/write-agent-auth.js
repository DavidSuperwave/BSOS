require("dotenv").config({ path: ".env.local" });
const { Client } = require("ssh2");

const key = process.env.PROVISIONER_SSH_KEY;
if (!key) { console.error("No SSH key"); process.exit(1); }

// The auth-profiles.json maps provider names to API keys and base URLs.
// OpenClaw resolves the provider from the model ID prefix (e.g. "anthropic/claude-..." → provider "anthropic").
// We point the "anthropic" provider at OpenRouter so all model calls go through it.
const authProfiles = JSON.stringify({
  openrouter: {
    apiKey: "${OPENROUTER_API_KEY}",
    baseUrl: "https://openrouter.ai/api/v1"
  },
  anthropic: {
    apiKey: "${OPENROUTER_API_KEY}",
    baseUrl: "https://openrouter.ai/api/v1"
  }
}, null, 2);

const authProfilesB64 = Buffer.from(authProfiles).toString("base64");

const conn = new Client();
conn.on("ready", () => {
  const cmds = [
    // Write auth-profiles.json for both containers
    'echo "=== Writing auth-profiles.json for supersauce ==="',
    `docker exec openclaw-supersauce sh -c "echo '${authProfilesB64}' | base64 -d > /home/node/.openclaw/agents/main/agent/auth-profiles.json"`,
    'docker exec openclaw-supersauce cat /home/node/.openclaw/agents/main/agent/auth-profiles.json',
    'echo ""',
    'echo "=== Writing auth-profiles.json for superwaveio ==="',
    `docker exec openclaw-superwaveio sh -c "echo '${authProfilesB64}' | base64 -d > /home/node/.openclaw/agents/main/agent/auth-profiles.json"`,
    'docker exec openclaw-superwaveio cat /home/node/.openclaw/agents/main/agent/auth-profiles.json',
    'echo ""',
    'echo "=== Restarting containers ==="',
    'docker restart openclaw-supersauce',
    'docker restart openclaw-superwaveio',
    'sleep 10',
    'echo "=== Container status ==="',
    'docker ps --format "table {{.Names}}\t{{.Status}}"',
    'echo ""',
    'echo "=== Gateway logs after restart ==="',
    'docker logs openclaw-supersauce --tail 5 2>&1',
  ].join(" && ");
  conn.exec(cmds, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    let out = "";
    stream.on("data", (d) => (out += d.toString()));
    stream.stderr.on("data", (d) => (out += d.toString()));
    stream.on("close", () => { console.log(out); conn.end(); });
  });
});
conn.on("error", (e) => console.error("SSH error:", e.message));
conn.connect({
  host: "159.65.220.183",
  port: 22,
  username: "root",
  privateKey: key.replace(/\r\n/g, "\n").replace(/\r/g, "\n"),
  readyTimeout: 15000,
});
