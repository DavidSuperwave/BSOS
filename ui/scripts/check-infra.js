require("dotenv").config({ path: ".env.local" });
const { Client } = require("ssh2");

const key = process.env.PROVISIONER_SSH_KEY;
if (!key) { console.error("No SSH key"); process.exit(1); }

function sshExec(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let out = "";
      stream.on("data", (d) => (out += d.toString()));
      stream.stderr.on("data", (d) => (out += d.toString()));
      stream.on("close", () => resolve(out));
    });
  });
}

async function main() {
  const conn = new Client();
  await new Promise((resolve, reject) => {
    conn.on("ready", resolve);
    conn.on("error", reject);
    conn.connect({
      host: "159.65.220.183", port: 22, username: "root",
      privateKey: key.replace(/\r\n/g, "\n").replace(/\r/g, "\n"),
      readyTimeout: 15000,
    });
  });
  console.log("SSH connected\n");

  console.log("=== Container Status ===");
  console.log(await sshExec(conn, 'docker ps --format "table {{.Names}}\t{{.Status}}"'));

  console.log("=== Env check (supersauce) ===");
  console.log(await sshExec(conn, 'docker exec openclaw-supersauce env 2>&1 | grep -E "^(ANTHROPIC_|OPENROUTER_|OPENCLAW_GATEWAY)" | head -10'));

  console.log("=== auth-profiles.json (correct path) ===");
  console.log(await sshExec(conn, "docker exec openclaw-supersauce cat /home/node/.openclaw/auth-profiles.json 2>&1"));

  console.log("=== auth-profiles.json (old wrong path) ===");
  console.log(await sshExec(conn, "docker exec openclaw-supersauce cat /home/node/.openclaw/agents/main/agent/auth-profiles.json 2>&1"));

  console.log("=== openclaw.json ===");
  console.log(await sshExec(conn, "docker exec openclaw-supersauce cat /app/openclaw.json 2>&1"));

  console.log("=== docker-compose.yml (supersauce) ===");
  console.log(await sshExec(conn, "cat /opt/openclaw/supersauce/docker-compose.yml 2>&1"));

  console.log("=== Gateway logs (last 30) ===");
  console.log(await sshExec(conn, "docker logs openclaw-supersauce --tail 30 2>&1"));

  console.log("=== Restart socat ===");
  console.log(await sshExec(conn, "systemctl restart socat-openclaw-supersauce.service && systemctl restart socat-openclaw-superwaveio.service && echo 'restarted'"));

  console.log("=== Socat ===");
  console.log(await sshExec(conn, "systemctl is-active socat-openclaw-supersauce.service 2>&1 || true"));

  console.log("=== Ports ===");
  console.log(await sshExec(conn, "ss -tlnp | grep -E '18790|18791'"));

  conn.end();
}
main().catch(err => { console.error("Error:", err); process.exit(1); });
