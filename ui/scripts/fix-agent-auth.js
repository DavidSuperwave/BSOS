require("dotenv").config({ path: ".env.local" });
const { Client } = require("ssh2");

const key = process.env.PROVISIONER_SSH_KEY;
if (!key) { console.error("No SSH key"); process.exit(1); }

const conn = new Client();
conn.on("ready", () => {
  // First, let's see what the existing auth.json contains and check the agent workspace
  const cmds = [
    'echo "=== auth.json ==="',
    'docker exec openclaw-supersauce cat /home/node/.openclaw/agents/main/agent/auth.json 2>&1',
    'echo ""',
    'echo "=== workspace contents ==="',
    'docker exec openclaw-supersauce ls -laR /home/node/.openclaw/workspace/ 2>&1 | head -40',
    'echo ""',
    'echo "=== full agents dir ==="',
    'docker exec openclaw-supersauce ls -laR /home/node/.openclaw/agents/ 2>&1',
    'echo ""',
    'echo "=== devices dir ==="',
    'docker exec openclaw-supersauce ls -la /home/node/.openclaw/devices/ 2>&1',
    'echo ""',
    'echo "=== openclaw help or config ==="',
    'docker exec openclaw-supersauce openclaw config show 2>&1 || docker exec openclaw-supersauce openclaw --help 2>&1 | head -30',
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
