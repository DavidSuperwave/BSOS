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

async function testChat(container) {
  console.log(`\\n=== Testing ${container} ===\\n`);

  // Check the updated auth-profiles.json
  console.log("1. Verifying fixed auth-profiles.json:");
  const { stdout: authContent } = await sshExec(
    `docker exec ${container} cat /home/node/.openclaw/auth-profiles.json`
  );
  console.log(authContent);

  // Check recent logs for auth errors
  console.log("\\n2. Recent logs (looking for auth errors):");
  const { stdout: logs } = await sshExec(
    `docker logs --tail 20 ${container} 2>&1`
  );
  
  // Filter for relevant lines
  const relevantLines = logs
    .split("\\n")
    .filter(line => 
      line.includes("error") || 
      line.includes("Error") || 
      line.includes("auth") || 
      line.includes("model") ||
      line.includes("gateway")
    )
    .slice(-10);
  
  console.log(relevantLines.join("\\n") || "No relevant errors found");

  // Test if chat works by checking gateway health
  console.log("\\n3. Gateway health check:");
  const { stdout: health } = await sshExec(
    `curl -s http://localhost:${container === "openclaw-supersauce" ? "18791" : "18790"}/health 2>/dev/null || echo "Health check failed"`
  );
  console.log(health || "No health endpoint response");
}

async function main() {
  for (const container of ["openclaw-supersauce", "openclaw-superwaveio"]) {
    try {
      await testChat(container);
    } catch (err) {
      console.error(`Error with ${container}:`, err.message);
    }
  }
}

main().catch(console.error);
