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

async function fixContainer(name) {
  console.log(`\\n=== Fixing ${name} ===\\n`);

  // 1. Check current config
  console.log("1. Checking current openclaw.json...");
  const { stdout: currentConfig } = await sshExec(
    `docker exec ${name} cat /app/openclaw.json`
  );
  console.log(currentConfig);

  // 2. Check what OpenClaw binary is being used
  console.log("\\n2. Checking OpenClaw process...");
  const { stdout: ps } = await sshExec(
    `docker exec ${name} ps aux | grep -i openclaw | head -2`
  );
  console.log(ps);

  // 3. Check if there's a config in the workspace directory
  console.log("\\n3. Checking workspace config...");
  const { stdout: wsConfig } = await sshExec(
    `docker exec ${name} find /data -name "openclaw.json" 2>/dev/null`
  );
  console.log(wsConfig || "No config in /data");

  // 4. Check the actual agent config
  console.log("\\n4. Checking agent-specific config...");
  const { stdout: agentConfig } = await sshExec(
    `docker exec ${name} cat /home/node/.openclaw/agents/main/agent/config.json 2>/dev/null || echo "No agent config"`
  );
  console.log(agentConfig);

  // 5. Try to set model via environment variable
  console.log("\\n5. Current env vars for model...");
  const { stdout: modelEnv } = await sshExec(
    `docker exec ${name} env | grep -i model || echo "No model env vars"`
  );
  console.log(modelEnv);

  // 6. Create fixed auth-profiles.json with simpler format
  console.log("\\n6. Creating fixed auth-profiles.json...");
  const fixedAuth = {
    profiles: {
      "openrouter:default": {
        apiKey: "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"
      },
      "anthropic:default": {
        apiKey: "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",
        baseUrl: "https://openrouter.ai/api/v1"
      }
    }
  };
  
  const authB64 = Buffer.from(JSON.stringify(fixedAuth, null, 2)).toString("base64");
  
  await sshExec(
    `docker exec ${name} sh -c "echo '${authB64}' | base64 -d > /home/node/.openclaw/auth-profiles.json"`
  );
  await sshExec(
    `docker exec ${name} sh -c "chown node:node /home/node/.openclaw/auth-profiles.json && chmod 600 /home/node/.openclaw/auth-profiles.json"`
  );
  
  console.log("Fixed auth-profiles.json written.");

  // 7. Try restarting just the gateway (not the whole container)
  console.log("\\n7. Attempting to reload config...");
  
  // Check if there's a way to signal config reload
  const { stdout: reload } = await sshExec(
    `docker exec ${name} sh -c "killall -HUP node 2>/dev/null || echo 'No HUP signal sent'"`
  );
  console.log(reload);
}

async function main() {
  for (const container of ["openclaw-supersauce", "openclaw-superwaveio"]) {
    try {
      await fixContainer(container);
    } catch (err) {
      console.error(`Error with ${container}:`, err.message);
    }
  }
  
  console.log("\\n\\n=== FIXES APPLIED ===");
  console.log("\\nNext steps:");
  console.log("1. Test chat to see if auth works now");
  console.log("2. If still failing, we may need to restart containers or check OpenClaw version");
}

main().catch(console.error);
