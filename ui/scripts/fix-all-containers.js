const { Client } = require("ssh2");
require("dotenv").config({ path: ".env.local" });

const DROPLET_IP = process.env.DROPLET_IP || "159.65.220.183";
const SSH_KEY = process.env.PROVISIONER_SSH_KEY;
const OPENROUTER_KEY = "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";

const CONTAINERS = [
  { name: "openclaw-supersauce", port: 18791, slug: "supersauce" },
  { name: "openclaw-superwaveio", port: 18790, slug: "superwaveio" }
];

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
      privateKey: SSH_KEY.replace(/\r\n/g, "\n").replace(/\r/g, "\n"),
    });
  });
}

async function fixContainer({ name, port, slug }) {
  console.log(`\n=== Fixing ${name} ===\n`);

  // 1. Check if container is running
  const { stdout: running } = await sshExec(
    `docker inspect --format='{{.State.Running}}' ${name} 2>/dev/null || echo "not_found"`
  );
  
  if (running.trim() !== "true") {
    console.log(`❌ Container ${name} is not running, skipping...`);
    return;
  }
  console.log(`✅ Container is running`);

  // 2. Create fixed auth-profiles.json with correct format
  console.log("\n2. Updating auth-profiles.json...");
  const authProfiles = {
    profiles: {
      "openrouter:default": {
        apiKey: OPENROUTER_KEY
      },
      "anthropic:default": {
        apiKey: OPENROUTER_KEY,
        baseUrl: "https://openrouter.ai/api/v1"
      }
    }
  };
  
  const authB64 = Buffer.from(JSON.stringify(authProfiles, null, 2)).toString("base64");
  
  await sshExec(
    `docker exec ${name} sh -c "mkdir -p /home/node/.openclaw && echo '${authB64}' | base64 -d > /home/node/.openclaw/auth-profiles.json && chown node:node /home/node/.openclaw/auth-profiles.json && chmod 600 /home/node/.openclaw/auth-profiles.json"`
  );
  console.log("✅ auth-profiles.json updated");

  // 3. Verify the file
  const { stdout: verifyAuth } = await sshExec(
    `docker exec ${name} cat /home/node/.openclaw/auth-profiles.json`
  );
  console.log("Verified auth-profiles.json:");
  console.log(verifyAuth);

  // 4. Check current openclaw.json
  console.log("\n3. Checking current openclaw.json...");
  const { stdout: currentConfig } = await sshExec(
    `cat /opt/openclaw/${slug}/openclaw.json`
  );
  
  let config;
  try {
    config = JSON.parse(currentConfig);
    console.log("✅ Current config parsed");
  } catch (e) {
    console.log("❌ Failed to parse current config, using default");
    config = {};
  }

  // 5. Update config with agents model (if not present)
  if (!config.agents || !config.agents.defaults || !config.agents.defaults.model) {
    console.log("\n4. Adding agents.defaults.model to openclaw.json...");
    
    config.agents = config.agents || {};
    config.agents.defaults = config.agents.defaults || {};
    config.agents.defaults.model = {
      primary: "openrouter/kimi-coding/k2p5",
      fallbacks: ["anthropic/claude-opus-4-5"]
    };

    const newConfigB64 = Buffer.from(JSON.stringify(config, null, 2)).toString("base64");
    
    await sshExec(
      `echo '${newConfigB64}' | base64 -d > /opt/openclaw/${slug}/openclaw.json`
    );
    console.log("✅ openclaw.json updated");
  } else {
    console.log("✅ agents.defaults.model already present");
  }

  // 6. Copy updated config into container
  console.log("\n5. Copying updated config into container...");
  await sshExec(
    `docker cp /opt/openclaw/${slug}/openclaw.json ${name}:/app/openclaw.json`
  );
  console.log("✅ Config copied to container");

  // 7. Restart the container to pick up new config
  console.log("\n6. Restarting container...");
  await sshExec(`docker restart ${name}`);
  
  // Wait for restart
  await new Promise(r => setTimeout(r, 5000));
  
  // Check if it's running
  const { stdout: restarted } = await sshExec(
    `docker inspect --format='{{.State.Running}}' ${name}`
  );
  
  if (restarted.trim() === "true") {
    console.log("✅ Container restarted successfully");
  } else {
    console.log("❌ Container failed to restart");
  }

  // 8. Check logs for agent model
  console.log("\n7. Checking logs for agent model...");
  await new Promise(r => setTimeout(r, 3000));
  
  const { stdout: logs } = await sshExec(
    `docker logs --tail 10 ${name} 2>&1 | grep "agent model" || echo "No model log yet"`
  );
  console.log(logs);

  console.log(`\n✅ ${name} fix complete\n`);
}

async function main() {
  console.log("🔧 OpenClaw Container Fix Script");
  console.log(`Droplet: ${DROPLET_IP}`);
  console.log(`OpenRouter Key: ${OPENROUTER_KEY.slice(0, 20)}...`);
  
  if (!SSH_KEY) {
    console.error("❌ PROVISIONER_SSH_KEY not set in .env.local");
    process.exit(1);
  }

  for (const container of CONTAINERS) {
    try {
      await fixContainer(container);
    } catch (err) {
      console.error(`\n❌ Error fixing ${container.name}:`, err.message);
    }
  }

  console.log("\n🎉 All fixes applied!");
  console.log("\nNext steps:");
  console.log("1. Test chat via the UI");
  console.log("2. Check if auth errors are resolved");
  console.log("3. If still using anthropic/claude-opus-4-6, the OpenClaw image needs updating to v2026.2.19+");
}

main().catch(console.error);
