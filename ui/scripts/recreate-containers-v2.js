/**
 * Recreate OpenClaw containers with host networking.
 * Runs each command separately via SSH to avoid heredoc issues.
 */
require("dotenv").config({ path: ".env.local" });
const { Client } = require("ssh2");

const sshKey = process.env.PROVISIONER_SSH_KEY;
if (!sshKey) {
  console.error("No PROVISIONER_SSH_KEY");
  process.exit(1);
}
const cleanKey = sshKey.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

function sshExec(commands) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    const combined = Array.isArray(commands) ? commands.join(" && ") : commands;
    let stdout = "";
    let stderr = "";

    conn.on("ready", () => {
      conn.exec(combined, (err, stream) => {
        if (err) {
          conn.end();
          return reject(err);
        }
        stream.on("data", (d) => (stdout += d.toString()));
        stream.stderr.on("data", (d) => (stderr += d.toString()));
        stream.on("close", (code) => {
          conn.end();
          resolve({ stdout, stderr, code: code || 0 });
        });
      });
    });
    conn.on("error", reject);
    conn.connect({
      host: "159.65.220.183",
      port: 22,
      username: "root",
      privateKey: cleanKey,
      readyTimeout: 15000,
    });
  });
}

function generateOpenclawJson(port) {
  return JSON.stringify(
    {
      gateway: {
        http: {
          host: "0.0.0.0",
          port: port,
          endpoints: { chatCompletions: { enabled: true } },
        },
        auth: { mode: "token", token: "${OPENCLAW_GATEWAY_TOKEN}" },
        models: {
          providers: [
            {
              id: "openrouter",
              name: "OpenRouter",
              baseUrl: "https://openrouter.ai/api/v1",
              apiKey: "${OPENROUTER_API_KEY}",
              models: [
                {
                  id: "anthropic/claude-sonnet-4-20250514",
                  name: "Claude Sonnet 4",
                },
                { id: "minimax/MiniMax-M2.1", name: "MiniMax M2.1" },
              ],
            },
          ],
        },
        agents: {
          main: {
            model: "anthropic/claude-sonnet-4-20250514",
            systemPrompt: "You are Julian, a helpful GTM AI assistant.",
            skills: ["/data/skills/gtm-engine"],
          },
        },
        plugins: {
          supermemory: { enabled: true, apiKey: "${SUPERMEMORY_API_KEY}" },
        },
      },
    },
    null,
    2
  );
}

function generateDockerCompose(name, image) {
  return `version: "3.8"

services:
  openclaw:
    image: "${image}"
    container_name: "${name}"
    restart: unless-stopped
    network_mode: "host"
    env_file:
      - .env
    environment:
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
}

const containers = [
  {
    name: "openclaw-superwaveio",
    path: "/opt/openclaw/superwaveio",
    port: 18790,
  },
  {
    name: "openclaw-supersauce",
    path: "/opt/openclaw/supersauce",
    port: 18791,
  },
];

const image =
  process.env.GHCR_IMAGE || "ghcr.io/davidsuperwave/bsos/openclaw:latest";

async function main() {
  for (const c of containers) {
    console.log(`\n=== Processing ${c.name} (port ${c.port}) ===`);

    // 1. Extract env vars from running container
    console.log("Extracting env vars...");
    const envResult = await sshExec([
      `docker exec ${c.name} env | grep -E "^(OPENCLAW_|OPENROUTER_|SUPERMEMORY_|COMPANY_|PLUSVIBE_|TELEGRAM_|CLOSE_|PERPLEXITY_)" > ${c.path}/.env 2>/dev/null || true`,
      `cat ${c.path}/.env`,
    ]);
    console.log("Env vars:", envResult.stdout.trim().split("\n").length, "lines");

    // 2. Stop existing container
    console.log("Stopping container...");
    const stopResult = await sshExec([
      `cd ${c.path} && docker compose down -v 2>/dev/null || true`,
      `docker rm -f ${c.name} 2>/dev/null || true`,
    ]);
    console.log("Stopped:", stopResult.stdout.trim() || "done");

    // 3. Write openclaw.json using python3 to avoid heredoc escaping
    console.log("Writing openclaw.json...");
    const ocJson = generateOpenclawJson(c.port);
    // Base64 encode to avoid shell escaping issues
    const b64 = Buffer.from(ocJson).toString("base64");
    await sshExec([
      `echo '${b64}' | base64 -d > ${c.path}/openclaw.json`,
    ]);

    // 4. Write docker-compose.yml
    console.log("Writing docker-compose.yml...");
    const dcYml = generateDockerCompose(c.name, image);
    const dcB64 = Buffer.from(dcYml).toString("base64");
    await sshExec([
      `echo '${dcB64}' | base64 -d > ${c.path}/docker-compose.yml`,
    ]);

    // 5. Start container
    console.log("Starting container...");
    const startResult = await sshExec([
      `cd ${c.path} && docker compose up -d`,
    ]);
    console.log(startResult.stdout.trim());
    if (startResult.stderr.trim()) console.log(startResult.stderr.trim());
  }

  // 6. Wait and verify
  console.log("\nWaiting 10s for containers to start...");
  await new Promise((r) => setTimeout(r, 10000));

  console.log("\n=== Verification ===");

  const psResult = await sshExec(["docker ps --format 'table {{.Names}}\t{{.Status}}'"]);
  console.log(psResult.stdout);

  const portResult = await sshExec(["ss -tlnp | grep -E '18790|18791'"]);
  console.log("Port bindings:");
  console.log(portResult.stdout || "None found");

  const logsResult = await sshExec([
    "docker logs openclaw-supersauce --tail 5 2>&1 | grep -i listen",
    "docker logs openclaw-superwaveio --tail 5 2>&1 | grep -i listen",
  ]);
  console.log("Gateway listen:");
  console.log(logsResult.stdout);

  // Test WebSocket upgrade
  const wsTest = await sshExec([
    `python3 -c "
import socket, base64, os
for port in [18790, 18791]:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(5)
    try:
        s.connect(('127.0.0.1', port))
        key = base64.b64encode(os.urandom(16)).decode()
        upgrade = f'GET / HTTP/1.1\\r\\nHost: 127.0.0.1:{port}\\r\\nUpgrade: websocket\\r\\nConnection: Upgrade\\r\\nSec-WebSocket-Version: 13\\r\\nSec-WebSocket-Key: {key}\\r\\n\\r\\n'
        s.sendall(upgrade.encode())
        data = s.recv(4096)
        print(f'Port {port}: {data.decode()[:100]}')
    except Exception as e:
        print(f'Port {port} error: {e}')
    finally:
        s.close()
"`,
  ]);
  console.log("WebSocket upgrade test:");
  console.log(wsTest.stdout);

  console.log("Done!");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
