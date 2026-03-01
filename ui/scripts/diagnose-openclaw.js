const { Client } = require("ssh2");
require("dotenv").config({ path: ".env.local" });

const DROPLET_IP = "159.65.220.183";
const SSH_KEY = process.env.PROVISIONER_SSH_KEY;

if (!SSH_KEY) {
  console.error("PROVISIONER_SSH_KEY not set in .env.local");
  process.exit(1);
}

const CONTAINERS = ["openclaw-supersauce", "openclaw-superwaveio"];

function sshExec(cmd) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on("ready", () => {
      conn.exec(cmd, (err, stream) => {
        if (err) return reject(err);
        let stdout = "";
        let stderr = "";
        stream.on("data", (data) => (stdout += data));
        stream.stderr.on("data", (data) => (stderr += data));
        stream.on("close", (code) => {
          conn.end();
          resolve({ stdout, stderr, code });
        });
      });
    });
    conn.on("error", reject);
    conn.connect({
      host: DROPLET_IP,
      username: "root",
      privateKey: SSH_KEY.replace(/\\r\\n/g, "\\n").replace(/\\r/g, "\\n"),
    });
  });
}

async function diagnoseContainer(name) {
  console.log(`\\n=== ${name} ===\\n`);

  // Check if running
  const { stdout: running } = await sshExec(
    `docker inspect --format='{{.State.Running}}' ${name} 2>/dev/null || echo "not_found"`
  );
  console.log(`Running: ${running.trim()}`);

  if (running.trim() !== "true") {
    console.log("Container not running, skipping...");
    return;
  }

  // Check openclaw.json
  console.log("\\n--- /app/openclaw.json ---");
  const { stdout: ocJson } = await sshExec(
    `docker exec ${name} cat /app/openclaw.json 2>/dev/null || echo "NOT FOUND"`
  );
  console.log(ocJson);

  // Check auth-profiles.json location
  console.log("\\n--- auth-profiles.json locations ---");
  const { stdout: authLocations } = await sshExec(
    `docker exec ${name} find /home/node /root -name "auth-profiles.json" 2>/dev/null || echo "Not found in common locations"`
  );
  console.log(authLocations || "Not found");

  // Check auth-profiles content
  console.log("\\n--- /home/node/.openclaw/auth-profiles.json ---");
  const { stdout: authContent } = await sshExec(
    `docker exec ${name} cat /home/node/.openclaw/auth-profiles.json 2>/dev/null || echo "NOT FOUND"`
  );
  console.log(authContent);

  // Check node user home
  console.log("\\n--- Node user home directory ---");
  const { stdout: nodeHome } = await sshExec(
    `docker exec ${name} getent passwd node | cut -d: -f6`
  );
  console.log(`Home: ${nodeHome.trim()}`);

  // Check .openclaw directory
  console.log("\\n--- .openclaw directory ---");
  const { stdout: ocDir } = await sshExec(
    `docker exec ${name} ls -la /home/node/.openclaw/ 2>/dev/null || echo "Directory not found"`
  );
  console.log(ocDir);

  // Check recent logs
  console.log("\\n--- Recent OpenClaw logs ---");
  const { stdout: logs } = await sshExec(
    `docker logs --tail 30 ${name} 2>&1 | grep -E "(agent model|auth|provider|error|Error)" | tail -10`
  );
  console.log(logs || "No relevant logs found");

  // Check env vars
  console.log("\\n--- Environment variables ---");
  const { stdout: envVars } = await sshExec(
    `docker exec ${name} env | grep -E "(ANTHROPIC|OPENROUTER|OPENCLAW)" || echo "No matching env vars"`
  );
  console.log(envVars || "None found");
}

async function main() {
  console.log("Diagnosing OpenClaw containers...");
  console.log(`Droplet: ${DROPLET_IP}`);

  for (const container of CONTAINERS) {
    try {
      await diagnoseContainer(container);
    } catch (err) {
      console.error(`\\nERROR diagnosing ${container}: ${err.message}`);
    }
  }

  console.log("\\n\\n=== DIAGNOSIS COMPLETE ===");
  console.log("\\nCommon issues:");
  console.log("1. auth-profiles.json not at /home/node/.openclaw/auth-profiles.json");
  console.log("2. Missing 'agents.defaults.model' in openclaw.json");
  console.log("3. Wrong auth-profiles.json format (should be {profiles: {}})");
  console.log("4. File permissions (should be 600, node:node)");
}

main().catch(console.error);
