require("dotenv").config({ path: ".env.local" });
const { Client } = require("ssh2");

const key = process.env.PROVISIONER_SSH_KEY;
if (!key) { console.error("No SSH key"); process.exit(1); }

function sshExec(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let out = "";
      stream.on("data", (d) => (out += d.toString()));
      stream.stderr.on("data", (d) => (out += d.toString()));
      stream.on("close", () => resolve(out));
    });
  });
}

async function main() {
  const conn = new Client();
  await new Promise((resolve, reject) => {
    conn.on("ready", resolve);
    conn.on("error", reject);
    conn.connect({
      host: "159.65.220.183", port: 22, username: "root",
      privateKey: key.replace(/\r\n/g, "\n").replace(/\r/g, "\n"),
      readyTimeout: 15000,
    });
  });
  console.log("SSH connected");

  // Get the OpenRouter API key — try host compose file first, then container env
  let apiKey = "";
  const composeContent = await sshExec(conn, "cat /opt/openclaw/supersauce/docker-compose.yml 2>/dev/null");
  const match = composeContent.match(/OPENROUTER_API_KEY=(sk-or-v1-[a-f0-9]+)/);
  if (match) {
    apiKey = match[1];
  } else {
    apiKey = (await sshExec(conn, "docker exec openclaw-supersauce printenv OPENROUTER_API_KEY 2>/dev/null")).trim();
  }
  if (!apiKey || !apiKey.startsWith("sk-or-")) {
    console.error("Could not get valid API key. Got:", apiKey.slice(0, 30));
    conn.end();
    process.exit(1);
  }
  console.log("OpenRouter key:", apiKey.slice(0, 15) + "...\n");

  const containers = [
    { name: "openclaw-supersauce", slug: "supersauce", path: "/opt/openclaw/supersauce", companyId: "a29720a9-f0f7-40d7-ac74-5fc4b815b9a1" },
    { name: "openclaw-superwaveio", slug: "superwaveio", path: "/opt/openclaw/superwaveio", companyId: "e11e1b5b-a5d5-46d5-9d93-7f527ab40b90" },
  ];

  // 1. auth-profiles.json — correct internal format
  //    Each profile needs: provider, type, key (not apiKey)
  //    anthropic:default routes through OpenRouter via baseUrl
  const authProfiles = JSON.stringify({
    profiles: {
      "openrouter:default": {
        provider: "openrouter",
        type: "api_key",
        key: apiKey,
      },
      "anthropic:default": {
        provider: "anthropic",
        type: "api_key",
        key: apiKey,
        baseUrl: "https://openrouter.ai/api/v1",
      },
    },
  }, null, 2);
  const authB64 = Buffer.from(authProfiles).toString("base64");

  // 2. openclaw.json — validated against OpenClaw schema
  //    - models.providers is Record<string, { baseUrl, models[] }>
  //    - auth.profiles entries need { provider, mode }
  //    - No unrecognized keys
  const openclawConfig = JSON.stringify({
    models: {
      providers: {
        openrouter: {
          baseUrl: "https://openrouter.ai/api/v1",
          models: [],
        },
      },
    },
    auth: {
      profiles: {
        "openrouter:default": {
          provider: "openrouter",
          mode: "api_key",
        },
        "anthropic:default": {
          provider: "anthropic",
          mode: "api_key",
        },
      },
    },
    agents: {
      defaults: {
        model: {
          primary: "openrouter/kimi-coding/k2p5",
          fallbacks: ["anthropic/claude-opus-4-5"]
        }
      }
    }
  }, null, 2);
  const configB64 = Buffer.from(openclawConfig).toString("base64");

  for (const c of containers) {
    console.log(`=== Deploying to ${c.name} ===`);

    // Write openclaw.json to host (will be mounted as /home/node/.openclaw/openclaw.json)
    await sshExec(conn, `echo '${configB64}' | base64 -d > ${c.path}/openclaw.json`);
    console.log("  Wrote openclaw.json");

    // Read current docker-compose to get existing env vars
    const currentCompose = await sshExec(conn, `cat ${c.path}/docker-compose.yml`);

    // Get company-specific env vars from current compose
    const envLines = currentCompose.split("\n")
      .filter(l => l.trim().startsWith("- ") && l.includes("="))
      .map(l => l.trim().replace(/^- /, ""));

    // Build new env vars, adding ANTHROPIC_API_KEY fallback trick
    const envSet = new Map();
    for (const line of envLines) {
      const [k] = line.split("=", 1);
      envSet.set(k, line);
    }
    // Add/override these
    envSet.set("OPENCLAW_GATEWAY_TOKEN", `OPENCLAW_GATEWAY_TOKEN=${c.companyId}`);
    envSet.set("OPENROUTER_API_KEY", `OPENROUTER_API_KEY=${apiKey}`);
    envSet.set("ANTHROPIC_BASE_URL", "ANTHROPIC_BASE_URL=https://openrouter.ai/api/v1");
    envSet.set("NODE_OPTIONS", "NODE_OPTIONS=--max-old-space-size=2048");
    envSet.delete("ANTHROPIC_API_KEY");

    const envVars = Array.from(envSet.values())
      .map(v => `      - ${v}`)
      .join("\n");

    // Build fresh docker-compose.yml with bridge networking + openclaw.json mount
    const image = (await sshExec(conn, `docker inspect ${c.name} --format '{{.Config.Image}}'`)).trim();
    const dockerCompose = `services:
  openclaw:
    image: "${image}"
    container_name: "${c.name}"
    restart: unless-stopped
    environment:
${envVars}
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
    const composeB64 = Buffer.from(dockerCompose).toString("base64");
    await sshExec(conn, `echo '${composeB64}' | base64 -d > ${c.path}/docker-compose.yml`);
    console.log("  Wrote docker-compose.yml");
  }

  // Recreate containers with new config
  console.log("\nRecreating containers...");
  for (const c of containers) {
    const result = await sshExec(conn, `cd ${c.path} && docker compose up -d`);
    console.log(`  ${c.name}: ${result.trim()}`);
  }

  console.log("Waiting 12s for containers to initialize...");
  await new Promise(r => setTimeout(r, 12000));

  // Write auth-profiles.json AFTER containers are running (ephemeral path)
  console.log("\nWriting auth-profiles.json into running containers...");
  for (const c of containers) {
    await sshExec(conn, `docker exec ${c.name} sh -c "mkdir -p /home/node/.openclaw"`);
    await sshExec(conn, `docker exec ${c.name} sh -c "echo '${authB64}' | base64 -d > /home/node/.openclaw/auth-profiles.json"`);
    await sshExec(conn, `docker exec ${c.name} sh -c "chmod 600 /home/node/.openclaw/auth-profiles.json"`);
    console.log(`  ${c.name}: wrote auth-profiles.json`);
  }

  // Restart socat (PIDs change on container recreate)
  console.log("Restarting socat...");
  await sshExec(conn, "systemctl restart socat-openclaw-supersauce.service && systemctl restart socat-openclaw-superwaveio.service");
  await new Promise(r => setTimeout(r, 3000));

  // Verify
  console.log("\n=== Status ===");
  console.log(await sshExec(conn, 'docker ps --format "table {{.Names}}\t{{.Status}}"'));

  console.log("=== Env check (supersauce) ===");
  const env = await sshExec(conn, 'docker exec openclaw-supersauce env | grep -E "^(ANTHROPIC_|OPENROUTER_|OPENCLAW_GATEWAY)" | head -10');
  console.log(env);

  console.log("=== openclaw.json ===");
  console.log(await sshExec(conn, "docker exec openclaw-supersauce cat /app/openclaw.json"));

  console.log("=== auth-profiles.json ===");
  console.log(await sshExec(conn, "docker exec openclaw-supersauce cat /home/node/.openclaw/agents/main/agent/auth-profiles.json"));

  console.log("=== Gateway logs ===");
  console.log(await sshExec(conn, "docker logs openclaw-supersauce --tail 10 2>&1"));

  console.log("=== Ports ===");
  console.log(await sshExec(conn, "ss -tlnp | grep -E '18790|18791'"));

  conn.end();
}

main().catch(err => { console.error("Error:", err); process.exit(1); });
