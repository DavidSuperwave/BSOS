const { Client } = require("ssh2");
require("dotenv").config({ path: ".env.local" });

const DROPLET_IP = process.env.DROPLET_IP || "159.65.220.183";
const SSH_KEY = process.env.PROVISIONER_SSH_KEY;
const OPENROUTER_KEY = "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";
const NEW_IMAGE = "ghcr.io/davidsuperwave/bsos/openclaw:v2026.2.19-2";

const CONTAINERS = [
  { name: "openclaw-supersauce", port: 18791, slug: "supersauce", companyId: "a29720a9-f0f7-40d7-ac74-5fc4b815b9a1" },
  { name: "openclaw-superwaveio", port: 18790, slug: "superwaveio", companyId: "e11e1b5b-a5d5-46d5-9d93-7f527ab40b90" }
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

async function upgradeContainer({ name, port, slug, companyId }) {
  console.log(`\n=== Upgrading ${name} to ${NEW_IMAGE} ===\n`);

  const remotePath = `/opt/openclaw/${slug}`;

  // 1. Stop and remove existing container
  console.log("1. Stopping existing container...");
  await sshExec(`docker stop ${name} 2>/dev/null || true`);
  await sshExec(`docker rm ${name} 2>/dev/null || true`);
  console.log("✅ Container stopped and removed");

  // 2. Pull new image
  console.log("\n2. Pulling new image...");
  const { stdout: pullOutput } = await sshExec(`docker pull ${NEW_IMAGE}`);
  console.log(pullOutput.slice(-200)); // Show last 200 chars
  console.log("✅ Image pulled");

  // 3. Update docker-compose.yml with new image
  console.log("\n3. Updating docker-compose.yml...");
  const dockerCompose = `services:
  openclaw:
    image: "${NEW_IMAGE}"
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
  console.log("✅ docker-compose.yml updated");

  // 4. Generate updated openclaw.json with agents config
  console.log("\n4. Updating openclaw.json...");
  const openclawJson = {
    models: {
      primary: "kimi-coding/k2p5",
      providers: [
        {
          key: "openrouter",
          baseUrl: "https://openrouter.ai/api/v1"
        }
      ]
    },
    auth: {
      profiles: {
        "openrouter:default": "openrouter:default",
        "anthropic:default": "anthropic:default"
      }
    },
    agents: {
      defaults: {
        model: {
          primary: "kimi-coding/k2p5",
          fallbacks: ["anthropic/claude-opus-4-5"]
        }
      }
    }
  };
  
  const ocB64 = Buffer.from(JSON.stringify(openclawJson, null, 2)).toString("base64");
  await sshExec(`echo '${ocB64}' | base64 -d > ${remotePath}/openclaw.json`);
  console.log("✅ openclaw.json updated");

  // 5. Start new container
  console.log("\n5. Starting new container...");
  await sshExec(`cd ${remotePath} && docker compose up -d`);
  
  // Wait for startup
  await new Promise(r => setTimeout(r, 8000));
  
  // Check if running
  const { stdout: running } = await sshExec(`docker inspect --format='{{.State.Running}}' ${name}`);
  if (running.trim() === "true") {
    console.log("✅ Container started successfully");
  } else {
    console.log("❌ Container failed to start");
    return false;
  }

  // 6. Write auth-profiles.json inside container
  console.log("\n6. Writing auth-profiles.json...");
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
  await sshExec(`docker exec ${name} sh -c "mkdir -p /home/node/.openclaw && echo '${authB64}' | base64 -d > /home/node/.openclaw/auth-profiles.json && chown node:node /home/node/.openclaw/auth-profiles.json && chmod 600 /home/node/.openclaw/auth-profiles.json"`);
  console.log("✅ auth-profiles.json written");

  // 7. Check logs for agent model
  console.log("\n7. Checking agent model in logs...");
  await new Promise(r => setTimeout(r, 3000));
  
  const { stdout: logs } = await sshExec(`docker logs --tail 15 ${name} 2>&1 | grep "agent model" || echo "No model log found"`);
  console.log(logs);
  
  if (logs.includes("kimi")) {
    console.log("🎅 SUCCESS! Kimi model is being used!");
  } else if (logs.includes("claude-opus")) {
    console.log("⚠️ Still using Claude - checking if this is expected for this version");
  }

  return true;
}

async function testChat({ name, port }) {
  console.log(`\n=== Testing Chat on ${name} (port ${port}) ===\n`);

  // Wait a bit more for full startup
  await new Promise(r => setTimeout(r, 5000));

  // Test via SSH tunnel to container
  console.log("1. Testing WebSocket handshake...");
  
  // Create a simple WebSocket test via SSH
  const testScript = `
    const WebSocket = require('ws');
    const ws = new WebSocket('ws://127.0.0.1:${port}');
    
    ws.on('open', () => {
      console.log('WS_CONNECTED');
      ws.close();
    });
    
    ws.on('error', (err) => {
      console.log('WS_ERROR:', err.message);
    });
    
    setTimeout(() => {
      console.log('WS_TIMEOUT');
      process.exit(0);
    }, 5000);
  `;
  
  const scriptB64 = Buffer.from(testScript).toString("base64");
  const { stdout: wsTest } = await sshExec(`echo '${scriptB64}' | base64 -d > /tmp/ws-test.js && node /tmp/ws-test.js`);
  console.log(wsTest || "No WebSocket test output");

  // Check for recent errors
  console.log("\n2. Checking for auth errors in logs...");
  const { stdout: errors } = await sshExec(`docker logs --tail 30 ${name} 2>&1 | grep -i "error\\|auth\\|401" | tail -5 || echo "No errors found"`);
  console.log(errors || "✅ No auth errors detected");

  // Check gateway is listening
  console.log("\n3. Checking gateway status...");
  const { stdout: gateway } = await sshExec(`docker logs --tail 5 ${name} 2>&1 | grep "listening" || echo "Gateway status unknown"`);
  console.log(gateway);
}

async function main() {
  console.log("🚀 OpenClaw Image Upgrade Script");
  console.log(`Upgrading to: ${NEW_IMAGE}`);
  console.log(`Droplet: ${DROPLET_IP}`);
  
  if (!SSH_KEY) {
    console.error("❌ PROVISIONER_SSH_KEY not set");
    process.exit(1);
  }

  for (const container of CONTAINERS) {
    try {
      const success = await upgradeContainer(container);
      if (success) {
        await testChat(container);
      }
    } catch (err) {
      console.error(`\n❌ Error with ${container.name}:`, err.message);
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log("🎉 UPGRADE COMPLETE!");
  console.log("=".repeat(50));
  console.log("\nNext steps:");
  console.log("1. Test chat in the UI");
  console.log("2. Verify responses are from Kimi K2.5");
  console.log("3. Check for any auth errors in logs");
}

main().catch(console.error);
