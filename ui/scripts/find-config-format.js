const { Client } = require("ssh2");
require("dotenv").config({ path: ".env.local" });

const DROPLET_IP = "159.65.220.183";
const SSH_KEY = process.env.PROVISIONER_SSH_KEY;

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
        stream.on("close", () => {
          conn.end();
          resolve({ stdout, stderr });
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

async function findConfigFormat(container) {
  console.log(`=== Finding config format for OpenClaw 2026.2.17 ===\\n`);

  // 1. Check if there's a default config in the source
  console.log("1. Check bundled config:");
  const { stdout: bundled } = await sshExec(
    `docker exec ${container} find /app -name "default-config*" -o -name "config.default*" 2>/dev/null`
  );
  console.log(bundled || "No bundled config found");

  // 2. Check the gateway source for config parsing
  console.log("\\n2. Check gateway source for model config:");
  const { stdout: gatewaySource } = await sshExec(
    `docker exec ${container} grep -r "agent.model\|defaultModel\|agentModel" /app/packages/gateway/src/ 2>/dev/null | head -10 || echo "Source not accessible"`
  );
  console.log(gatewaySource || "No source access");

  // 3. Check if there's an agents config section expected
  console.log("\\n3. Check what config sections are read:");
  const { stdout: configRead } = await sshExec(
    `docker exec ${container} cat /app/openclaw.json | grep -A5 -B5 "agents"`
  );
  console.log(configRead);

  // 4. Try adding AGENT_MODEL env var
  console.log("\\n4. Testing AGENT_MODEL env var...");
  console.log("Stopping container to add env var...");
  
  // Stop container
  await sshExec(`docker stop ${container}`);
  
  // Start with new env var
  await sshExec(`docker start ${container}`);
  
  // Wait for startup
  await new Promise(r => setTimeout(r, 5000));
  
  // Check logs
  const { stdout: logs } = await sshExec(
    `docker logs --tail 15 ${container} 2>&1 | grep "agent model"`
  );
  console.log("Agent model after restart:");
  console.log(logs);
}

async function main() {
  try {
    await findConfigFormat("openclaw-supersauce");
  } catch (err) {
    console.error("Error:", err.message);
  }
}

main().catch(console.error);
