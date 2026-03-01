/**
 * Recreate OpenClaw containers with host networking mode.
 *
 * Problem: OpenClaw gateway binds to 127.0.0.1:18789 inside the container.
 * Docker port mapping connects from the bridge network (172.18.0.1), which
 * the gateway rejects. Solution: use network_mode: "host" so the gateway's
 * 127.0.0.1 IS the host's 127.0.0.1.
 *
 * Each container gets a custom openclaw.json with its own port.
 */
require("dotenv").config({ path: ".env.local" });
const { Client } = require("ssh2");

const sshKey = process.env.PROVISIONER_SSH_KEY;
if (!sshKey) {
  console.error("No PROVISIONER_SSH_KEY");
  process.exit(1);
}
const cleanKey = sshKey.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

const containers = [
  {
    name: "openclaw-superwaveio",
    composePath: "/opt/openclaw/superwaveio",
    port: 18790,
    slug: "superwaveio",
  },
  {
    name: "openclaw-supersauce",
    composePath: "/opt/openclaw/supersauce",
    port: 18791,
    slug: "supersauce",
  },
];

function generateOpenclawJson(port) {
  return JSON.stringify(
    {
      gateway: {
        http: {
          host: "0.0.0.0",
          port: port,
          endpoints: {
            chatCompletions: { enabled: true },
          },
        },
        auth: {
          mode: "token",
          token: "${OPENCLAW_GATEWAY_TOKEN}",
        },
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
            systemPrompt:
              "You are Julian, a helpful GTM AI assistant.",
            skills: ["/data/skills/gtm-engine"],
          },
        },
        plugins: {
          supermemory: {
            enabled: true,
            apiKey: "${SUPERMEMORY_API_KEY}",
          },
        },
      },
    },
    null,
    2
  );
}

function generateDockerCompose(container, image) {
  // Read existing env vars from the current docker-compose
  // For now, generate a new one with host networking
  return `version: "3.8"

services:
  openclaw:
    image: "${image}"
    container_name: "${container.name}"
    restart: unless-stopped
    network_mode: "host"
    env_file:
      - .env
    environment:
      - NODE_OPTIONS=--max-old-space-size=2048
      - OPENCLAW_CONFIG=/app/openclaw.json
    volumes:
      - openclaw-data:/data
      - ./agents:/data/agents
      - ./openclaw.json:/app/openclaw.json:ro
    healthcheck:
      test: ["CMD", "nc", "-z", "127.0.0.1", "${container.port}"]
      interval: 30s
      timeout: 5s
      start_period: 30s
      retries: 3
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

volumes:
  openclaw-data:
`;
}

const sshConn = new Client();

sshConn.on("ready", () => {
  console.log("SSH connected");

  const image = process.env.GHCR_IMAGE || "ghcr.io/openclaw/openclaw:latest";
  const commands = [];

  for (const c of containers) {
    const ocJson = generateOpenclawJson(c.port);

    commands.push(
      `echo "=== Recreating ${c.name} (port ${c.port}) ==="`,

      // Extract env vars from existing container before stopping it
      `docker exec ${c.name} env | grep -E "^(OPENCLAW_|OPENROUTER_|SUPERMEMORY_|COMPANY_|PLUSVIBE_|TELEGRAM_|CLOSE_|PERPLEXITY_)" > ${c.composePath}/.env 2>/dev/null || true`,
      `cat ${c.composePath}/.env`,

      // Stop and remove existing container
      `cd ${c.composePath} && docker compose down -v 2>/dev/null || true`,
      `docker rm -f ${c.name} 2>/dev/null || true`,

      // Write new openclaw.json
      `cat > ${c.composePath}/openclaw.json << 'OCJSON_EOF'\n${ocJson}\nOCJSON_EOF`,

      // Write new docker-compose.yml
      `cat > ${c.composePath}/docker-compose.yml << 'DCEOF'\n${generateDockerCompose(c, image)}\nDCEOF`,

      // Start container
      `cd ${c.composePath} && docker compose up -d`,
      `echo "Started ${c.name}"`
    );
  }

  // Wait and verify
  commands.push(
    "sleep 10",
    'echo "=== Verifying ==="',
    "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'",
    'echo "=== Checking ports ==="',
    "ss -tlnp | grep -E '18790|18791'",
    'echo "=== Checking gateway bind ==="',
    "docker logs openclaw-supersauce --tail 5 2>&1 | grep -i listen",
    "docker logs openclaw-superwaveio --tail 5 2>&1 | grep -i listen",
    'echo "=== Testing WebSocket upgrade ==="',
    `python3 -c "
import socket, base64, os
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.settimeout(5)
try:
    s.connect(('127.0.0.1', 18791))
    key = base64.b64encode(os.urandom(16)).decode()
    upgrade = f'GET / HTTP/1.1\\r\\nHost: 127.0.0.1:18791\\r\\nUpgrade: websocket\\r\\nConnection: Upgrade\\r\\nSec-WebSocket-Version: 13\\r\\nSec-WebSocket-Key: {key}\\r\\n\\r\\n'
    s.sendall(upgrade.encode())
    data = s.recv(4096)
    print('Port 18791:', data.decode()[:200])
except Exception as e:
    print('Port 18791 error:', e)
finally:
    s.close()
" 2>&1`
  );

  const cmd = commands.join(" && ");

  sshConn.exec(cmd, (err, stream) => {
    if (err) {
      console.error(err);
      sshConn.end();
      return;
    }
    let out = "";
    stream.on("data", (d) => (out += d.toString()));
    stream.stderr.on("data", (d) => (out += d.toString()));
    stream.on("close", () => {
      console.log(out);
      sshConn.end();
    });
  });

  setTimeout(() => sshConn.end(), 120000);
});

sshConn.on("error", (err) => console.error("SSH error:", err.message));
sshConn.connect({
  host: "159.65.220.183",
  port: 22,
  username: "root",
  privateKey: cleanKey,
  readyTimeout: 15000,
});
