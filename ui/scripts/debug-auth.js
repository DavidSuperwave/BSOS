require("dotenv").config({ path: ".env.local" });
const { Client } = require("ssh2");

const key = process.env.PROVISIONER_SSH_KEY;
if (!key) { console.error("No SSH key"); process.exit(1); }

const conn = new Client();
conn.on("ready", () => {
  const cmds = [
    'echo "=== auth-profiles.json exists? ==="',
    'docker exec openclaw-supersauce ls -la /home/node/.openclaw/agents/main/agent/ 2>&1',
    'echo ""',
    'echo "=== auth-profiles.json content ==="',
    'docker exec openclaw-supersauce cat /home/node/.openclaw/agents/main/agent/auth-profiles.json 2>&1 || echo "FILE MISSING"',
    'echo ""',
    'echo "=== auth.json content ==="',
    'docker exec openclaw-supersauce cat /home/node/.openclaw/agents/main/agent/auth.json 2>&1',
    'echo ""',
    // The volume mount might be resetting on restart. Check if the agent dir is on a volume.
    'echo "=== docker volumes ==="',
    'docker inspect openclaw-supersauce --format "{{json .Mounts}}" 2>&1',
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
