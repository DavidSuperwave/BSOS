require("dotenv").config({ path: ".env.local" });
const { Client } = require("ssh2");

const key = process.env.PROVISIONER_SSH_KEY;
if (!key) { console.error("No SSH key"); process.exit(1); }

const conn = new Client();
conn.on("ready", () => {
  const cmds = [
    'echo "=== Agent dir contents ==="',
    'docker exec openclaw-supersauce ls -la /home/node/.openclaw/agents/main/agent/ 2>&1 || echo "no agent dir"',
    'echo ""',
    'echo "=== Auth profiles ==="',
    'docker exec openclaw-supersauce cat /home/node/.openclaw/agents/main/agent/auth-profiles.json 2>&1 || echo "no auth-profiles.json"',
    'echo ""',
    'echo "=== OpenClaw config ==="',
    'docker exec openclaw-supersauce cat /app/openclaw.json 2>&1 || echo "no openclaw.json"',
    'echo ""',
    'echo "=== Env vars (filtered) ==="',
    'docker exec openclaw-supersauce env | grep -E "^(OPENCLAW_|OPENROUTER_|SUPERMEMORY_|COMPANY_)" 2>&1',
    'echo ""',
    'echo "=== Default openclaw config location ==="',
    'docker exec openclaw-supersauce ls -la /home/node/.openclaw/ 2>&1 || echo "no .openclaw dir"',
    'echo ""',
    'echo "=== Main agent config ==="',
    'docker exec openclaw-supersauce cat /home/node/.openclaw/agents/main/agent.json 2>&1 || echo "no agent.json"',
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
