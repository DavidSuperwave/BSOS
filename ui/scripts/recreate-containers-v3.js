/**
 * Recreate OpenClaw containers with bridge networking + socat relay.
 *
 * Strategy:
 * - Keep bridge networking (each container has its own 127.0.0.1:18789)
 * - Use socat + nsenter on the host to relay from host port to container's loopback
 * - This allows the WS gateway to work through port mapping
 */
require("dotenv").config({ path: ".env.local" });
const { Client } = require("ssh2");

const sshKey = process.env.PROVISIONER_SSH_KEY;
if (!sshKey) { console.error("No SSH key"); process.exit(1); }
const cleanKey = sshKey.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

function sshExec(commands) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    const combined = Array.isArray(commands) ? commands.join(" && ") : commands;
    let stdout = "", stderr = "";
    conn.on("ready", () => {
      conn.exec(combined, (err, stream) => {
        if (err) { conn.end(); return reject(err); }
        stream.on("data", (d) => (stdout += d.toString()));
        stream.stderr.on("data", (d) => (stderr += d.toString()));
        stream.on("close", (code) => { conn.end(); resolve({ stdout, stderr, code: code || 0 }); });
      });
    });
    conn.on("error", reject);
    conn.connect({ host: "159.65.220.183", port: 22, username: "root", privateKey: cleanKey, readyTimeout: 15000 });
  });
}

function generateDockerCompose(name, image) {
  // Back to bridge networking with port mapping
  // The port mapping won't work for WS directly (gateway binds 127.0.0.1),
  // but we need it for Docker to allocate the container
  return `services:
  openclaw:
    image: "${image}"
    container_name: "${name}"
    restart: unless-stopped
    env_file:
      - .env
    environment:
      - NODE_OPTIONS=--max-old-space-size=2048
    volumes:
      - openclaw-data:/data
      - ./agents:/data/agents
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

volumes:
  openclaw-data:
`;
}

// systemd service template for socat relay
function generateSocatService(name, hostPort) {
  return `[Unit]
Description=socat relay for ${name} (port ${hostPort} -> container 127.0.0.1:18789)
After=docker.service
Requires=docker.service

[Service]
Type=simple
ExecStart=/bin/bash -c 'while true; do PID=$$(docker inspect -f "{{.State.Pid}}" ${name} 2>/dev/null); if [ -n "$$PID" ] && [ "$$PID" != "0" ]; then socat TCP-LISTEN:${hostPort},fork,reuseaddr SYSTEM:"nsenter --net=/proc/$$PID/ns/net socat STDIO TCP\\\\:127.0.0.1\\\\:18789"; fi; sleep 2; done'
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
`;
}

const containers = [
  { name: "openclaw-superwaveio", path: "/opt/openclaw/superwaveio", port: 18790 },
  { name: "openclaw-supersauce", path: "/opt/openclaw/supersauce", port: 18791 },
];

const image = process.env.GHCR_IMAGE || "ghcr.io/davidsuperwave/bsos/openclaw:latest";

async function main() {
  // Kill any socat processes from previous attempts
  console.log("Cleaning up...");
  await sshExec(["pkill -f 'socat TCP-LISTEN:1879' || true", "systemctl stop socat-openclaw-supersauce.service 2>/dev/null || true", "systemctl stop socat-openclaw-superwaveio.service 2>/dev/null || true"]);

  for (const c of containers) {
    console.log(`\n=== Setting up ${c.name} (port ${c.port}) ===`);

    // Write docker-compose.yml (bridge networking, no port mapping)
    const dcYml = generateDockerCompose(c.name, image);
    const dcB64 = Buffer.from(dcYml).toString("base64");
    await sshExec([`echo '${dcB64}' | base64 -d > ${c.path}/docker-compose.yml`]);

    // Start container
    console.log("Starting container...");
    const startResult = await sshExec([`cd ${c.path} && docker compose up -d`]);
    console.log(startResult.stdout.trim() || startResult.stderr.trim());

    // Set up socat relay as systemd service
    console.log("Setting up socat relay...");
    const svcContent = generateSocatService(c.name, c.port);
    const svcB64 = Buffer.from(svcContent).toString("base64");
    await sshExec([
      `echo '${svcB64}' | base64 -d > /etc/systemd/system/socat-${c.name}.service`,
      "systemctl daemon-reload",
      `systemctl enable socat-${c.name}.service`,
      `systemctl restart socat-${c.name}.service`,
    ]);
    console.log(`socat relay started for ${c.name} on port ${c.port}`);
  }

  // Wait for containers and socat to be ready
  console.log("\nWaiting 15s for containers to start...");
  await new Promise((r) => setTimeout(r, 15000));

  console.log("\n=== Verification ===");

  const psResult = await sshExec(["docker ps --format 'table {{.Names}}\t{{.Status}}'"]);
  console.log(psResult.stdout);

  const logsResult = await sshExec([
    "docker logs openclaw-supersauce --tail 5 2>&1 | grep -i listen || echo 'No listen log yet'",
    "docker logs openclaw-superwaveio --tail 5 2>&1 | grep -i listen || echo 'No listen log yet'",
  ]);
  console.log("Gateway listen:\n" + logsResult.stdout);

  const socatResult = await sshExec(["systemctl status socat-openclaw-supersauce.service --no-pager | head -10", "systemctl status socat-openclaw-superwaveio.service --no-pager | head -10"]);
  console.log("Socat services:\n" + socatResult.stdout);

  const portResult = await sshExec(["ss -tlnp | grep -E '18790|18791'"]);
  console.log("Port bindings:\n" + (portResult.stdout || "None yet"));

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
  console.log("WebSocket upgrade test:\n" + wsTest.stdout);

  console.log("Done!");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
