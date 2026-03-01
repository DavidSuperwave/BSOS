const { Client } = require("ssh2");
require("dotenv").config({ path: ".env.local" });

const DROPLET_IP = process.env.DROPLET_IP || "159.65.220.183";
const SSH_KEY = process.env.PROVISIONER_SSH_KEY;

const CONTAINERS = [
  { name: "openclaw-supersauce", slug: "supersauce" },
  { name: "openclaw-superwaveio", slug: "superwaveio" }
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

async function diagnoseContainer({ name, slug }) {
  console.log(`\n=== Diagnosing ${name} ===\n`);

  // 1. Check if container exists
  console.log("1. Container status:");
  const { stdout: status } = await sshExec(`docker ps -a --filter "name=${name}" --format "{{.Status}}"`);
  console.log(status || "Container not found");

  // 2. Get container logs
  console.log("\n2. Container logs (last 30 lines):");
  const { stdout: logs } = await sshExec(`docker logs ${name} 2>&1 | tail -30 || echo "No logs available"`);
  console.log(logs || "No logs");

  // 3. Check docker-compose config
  console.log("\n3. Docker compose config validation:");
  const { stdout: config } = await sshExec(`cd /opt/openclaw/${slug} && docker compose config 2>&1 || echo "Config error"`);
  console.log(config.slice(-500) || "No config output");

  // 4. Check for port conflicts
  console.log("\n4. Port usage:");
  const { stdout: ports } = await sshExec(`netstat -tlnp | grep -E "1879[0-9]" || ss -tlnp | grep -E "1879[0-9]" || echo "No ports in use"`);
  console.log(ports || "No port info");

  // 5. Try to start manually and capture error
  console.log("\n5. Attempting manual start...");
  const { stdout: start, stderr: startErr } = await sshExec(`cd /opt/openclaw/${slug} && docker compose up 2>&1 & sleep 5 && docker compose logs --tail 20`);
  console.log(startErr || start || "No output");
}

async function rollbackToOldImage({ name, slug, companyId }) {
  console.log(`\n=== Rolling back ${name} to v2026.2.17 ===\n`);
  
  const OLD_IMAGE = "ghcr.io/davidsuperwave/bsos/openclaw:latest";
  const OPENROUTER_KEY = "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";
  const remotePath = `/opt/openclaw/${slug}`;

  // Stop any existing container
  await sshExec(`docker stop ${name} 2>/dev/null || true`);
  await sshExec(`docker rm ${name} 2>/dev/null || true`);

  // Update docker-compose.yml with old image
  const dockerCompose = `services:
  openclaw:
    image: "${OLD_IMAGE}"
    container_name: "${name}"
    restart: unless-stopped
    environment:
      - OPENCLAW_GATEWAY_TOKEN=${companyId}
      - OPENROUTER_API_KEY=${OPENROUTER_KEY}
      - ANTHROPIC_API_KEY=${OPENROUTER_KEY}
      - ANTHROPIC_BASE_URL=https://openrouter.ai/api/v1
      - NODE_OPTIONS=--max-old-space-size=2048
    volumes:
      - openclaw-data:/data
      - ./agents:/data/agents
      - ./openclaw.json:/app/openclaw.json:ro
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

volumes:
  openclaw-data:
`;
  
  const dcB64 = Buffer.from(dockerCompose).toString("base64");
  await sshExec(`echo '${dcB64}' | base64 -d > ${remotePath}/docker-compose.yml`);

  // Start container
  await sshExec(`cd ${remotePath} && docker compose up -d`);
  
  // Wait and check
  await new Promise(r => setTimeout(r, 5000));
  
  const { stdout: running } = await sshExec(`docker inspect --format='{{.State.Running}}' ${name}`);
  if (running.trim() === "true") {
    console.log("✅ Container rolled back and running");
    
    // Write auth-profiles
    const authProfiles = {
      profiles: {
        "openrouter:default": { apiKey: OPENROUTER_KEY },
        "anthropic:default": { apiKey: OPENROUTER_KEY, baseUrl: "https://openrouter.ai/api/v1" }
      }
    };
    const authB64 = Buffer.from(JSON.stringify(authProfiles, null, 2)).toString("base64");
    await sshExec(`docker exec ${name} sh -c "mkdir -p /home/node/.openclaw && echo '${authB64}' | base64 -d > /home/node/.openclaw/auth-profiles.json && chown node:node /home/node/.openclaw/auth-profiles.json && chmod 600 /home/node/.openclaw/auth-profiles.json"`);
    
    return true;
  } else {
    console.log("❌ Rollback failed");
    return false;
  }
}

async function main() {
  console.log("🔍 Diagnosing container failures...");
  
  if (!SSH_KEY) {
    console.error("❌ PROVISIONER_SSH_KEY not set");
    process.exit(1);
  }

  // First diagnose
  for (const container of CONTAINERS) {
    try {
      await diagnoseContainer(container);
    } catch (err) {
      console.error(`Error diagnosing ${container.name}:`, err.message);
    }
  }

  // Ask if user wants to rollback
  console.log("\n" + "=".repeat(50));
  console.log("❌ v2026.2.19-2 failed to start");
  console.log("Rolling back to v2026.2.17 (latest stable)...");
  console.log("=".repeat(50));

  const rollbacks = [
    { name: "openclaw-supersauce", slug: "supersauce", companyId: "a29720a9-f0f7-40d7-ac74-5fc4b815b9a1" },
    { name: "openclaw-superwaveio", slug: "superwaveio", companyId: "e11e1b5b-a5d5-46d5-9d93-7f527ab40b90" }
  ];

  for (const container of rollbacks) {
    try {
      await rollbackToOldImage(container);
    } catch (err) {
      console.error(`Error rolling back ${container.name}:`, err.message);
    }
  }

  console.log("\n✅ Rollback complete");
  console.log("\nNote: v2026.2.19-2 appears to have breaking changes.");
  console.log("Staying on v2026.2.17 until the issue is resolved.");
}

main().catch(console.error);
