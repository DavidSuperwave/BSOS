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

  const apiKey = (await sshExec(conn, "docker exec openclaw-supersauce printenv OPENROUTER_API_KEY")).trim();
  console.log("API key:", apiKey.slice(0, 15) + "...");

  // Fix 1: auth-profiles.json with "profiles" wrapper
  const authProfiles = JSON.stringify({
    profiles: {
      "anthropic:default": {
        apiKey: apiKey,
        baseUrl: "https://openrouter.ai/api/v1"
      },
      "openrouter:default": {
        apiKey: apiKey
      }
    }
  }, null, 2);
  const authB64 = Buffer.from(authProfiles).toString("base64");

  for (const container of ["openclaw-supersauce", "openclaw-superwaveio"]) {
    console.log(`\nFixing ${container}...`);
    await sshExec(conn, `docker exec ${container} sh -c "echo '${authB64}' | base64 -d > /home/node/.openclaw/agents/main/agent/auth-profiles.json"`);
    console.log("  Wrote auth-profiles.json with profiles wrapper");
  }

  // Verify
  console.log("\n=== Verify auth-profiles.json ===");
  console.log(await sshExec(conn, "docker exec openclaw-supersauce cat /home/node/.openclaw/agents/main/agent/auth-profiles.json"));

  // Fix 2: Also add ANTHROPIC_API_KEY to docker-compose env as a belt-and-suspenders fix
  // This is the env var fallback that resolveEnvApiKey checks
  for (const slug of ["supersauce", "superwaveio"]) {
    const composePath = `/opt/openclaw/${slug}/docker-compose.yml`;
    // Read current compose
    const compose = await sshExec(conn, `cat ${composePath}`);
    if (!compose.includes("ANTHROPIC_API_KEY")) {
      console.log(`\nAdding ANTHROPIC_API_KEY to ${slug} docker-compose.yml...`);
      // Add ANTHROPIC_API_KEY env var pointing to OpenRouter key
      const updated = compose.replace(
        /      - NODE_OPTIONS=--max-old-space-size=2048/,
        `      - NODE_OPTIONS=--max-old-space-size=2048\n      - ANTHROPIC_API_KEY=${apiKey}\n      - ANTHROPIC_BASE_URL=https://openrouter.ai/api/v1`
      );
      const updatedB64 = Buffer.from(updated).toString("base64");
      await sshExec(conn, `echo '${updatedB64}' | base64 -d > ${composePath}`);
      console.log("  Updated docker-compose.yml");
    }
  }

  // Restart containers to pick up new env vars
  console.log("\nRestarting containers...");
  await sshExec(conn, "cd /opt/openclaw/supersauce && docker compose up -d && cd /opt/openclaw/superwaveio && docker compose up -d");

  console.log("Waiting 12s...");
  await new Promise(r => setTimeout(r, 12000));

  // Restart socat
  await sshExec(conn, "systemctl restart socat-openclaw-supersauce.service && systemctl restart socat-openclaw-superwaveio.service");
  await new Promise(r => setTimeout(r, 3000));

  // Check status
  console.log(await sshExec(conn, 'docker ps --format "table {{.Names}}\t{{.Status}}"'));
  console.log(await sshExec(conn, "docker logs openclaw-supersauce --tail 10 2>&1"));

  // Check if ANTHROPIC_API_KEY is now set
  console.log("=== Env check ===");
  console.log(await sshExec(conn, 'docker exec openclaw-supersauce printenv ANTHROPIC_API_KEY 2>&1 | head -c 30'));

  conn.end();
}

main().catch(err => { console.error("Error:", err); process.exit(1); });
