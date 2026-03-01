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

async function investigateDeep(container) {
  console.log(`\\n=== Deep Investigation: ${container} ===\\n`);

  // 1. Check OpenClaw version
  console.log("1. OpenClaw version:");
  const { stdout: version } = await sshExec(
    `docker exec ${container} cat /app/package.json 2>/dev/null | grep version || echo "No package.json"`
  );
  console.log(version);

  // 2. Check if there's a different config being read
  console.log("\\n2. Check all config files:");
  const { stdout: configs } = await sshExec(
    `docker exec ${container} find /app /home/node /data -name "*.json" 2>/dev/null | head -20`
  );
  console.log(configs || "No JSON files found");

  // 3. Check what the gateway process sees
  console.log("\\n3. Check process environment:");
  const { stdout: procEnv } = await sshExec(
    `docker exec ${container} cat /proc/14/environ 2>/dev/null | tr '\\0' '\\n' | grep -E "(OPENCLAW|MODEL)" || echo "Could not read process env"`
  );
  console.log(procEnv);

  // 4. Try to find where the hardcoded model is
  console.log("\\n4. Check for any model override files:");
  const { stdout: modelFiles } = await sshExec(
    `docker exec ${container} find /app -type f \( -name "*.js" -o -name "*.json" \) -exec grep -l "claude-opus-4-6" {} \\; 2>/dev/null | head -5`
  );
  console.log(modelFiles || "Model string not found in source files");

  // 5. Check if we can set env var for model
  console.log("\\n5. Current OpenClaw env vars:");
  const { stdout: envVars } = await sshExec(
    `docker exec ${container} env | sort`
  );
  console.log(envVars);

  // 6. Try restarting the gateway process to pick up new config
  console.log("\\n6. Attempting gateway restart...");
  
  // Find the gateway PID
  const { stdout: pid } = await sshExec(
    `docker exec ${container} pgrep -f "openclaw-gateway" || echo "PID not found"`
  );
  console.log(`Gateway PID: ${pid.trim()}`);
  
  if (pid.trim() && !pid.includes("not found")) {
    // Try graceful restart
    await sshExec(`docker exec ${container} kill -TERM ${pid.trim()} 2>/dev/null || true`);
    console.log("Sent TERM signal to gateway, waiting for restart...");
    
    // Wait a bit
    await new Promise(r => setTimeout(r, 3000));
    
    // Check new logs
    const { stdout: newLogs } = await sshExec(
      `docker logs --tail 10 ${container} 2>&1 | grep "agent model"`
    );
    console.log("New agent model log:");
    console.log(newLogs || "No model log found");
  }
}

async function main() {
  for (const container of ["openclaw-supersauce"]) {
    try {
      await investigateDeep(container);
    } catch (err) {
      console.error(`Error:`, err.message);
    }
  }
}

main().catch(console.error);
