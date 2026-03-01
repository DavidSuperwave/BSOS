require("dotenv").config({ path: ".env.local" });
const { Client } = require("ssh2");

const key = process.env.PROVISIONER_SSH_KEY;
if (!key) { console.error("No SSH key"); process.exit(1); }

const conn = new Client();
conn.on("ready", () => {
  const cmds = [
    // Check current openclaw.json to understand model config
    'echo "=== Current openclaw.json ==="',
    'docker exec openclaw-supersauce cat /app/openclaw.json 2>&1',
    'echo ""',
    // Check if there's some other config file that sets the model to anthropic/claude-opus-4-6
    'echo "=== Looking for model references ==="',
    'docker exec openclaw-supersauce grep -r "claude-opus" /home/node/.openclaw/ 2>&1 | head -20 || echo "none found"',
    'echo ""',
    'docker exec openclaw-supersauce grep -r "claude-opus" /app/ 2>&1 | head -20 || echo "none found in /app"',
    'echo ""',
    // Check the openclaw binary entrypoint
    'echo "=== Process list ==="',
    'docker exec openclaw-supersauce ps aux 2>&1',
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
