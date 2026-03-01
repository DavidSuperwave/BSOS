require("dotenv").config({ path: ".env.local" });
const { Client } = require("ssh2");

const key = process.env.PROVISIONER_SSH_KEY;
if (!key) { console.error("No SSH key"); process.exit(1); }

// Kimi K2.5 on OpenRouter
const MODEL = "moonshotai/kimi-k2";

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

  for (const container of ["openclaw-supersauce", "openclaw-superwaveio"]) {
    console.log(`\n=== Fixing ${container} ===`);

    // Get the actual OpenRouter API key from env
    const apiKey = (await sshExec(conn, `docker exec ${container} printenv OPENROUTER_API_KEY`)).trim();
    console.log("OpenRouter key:", apiKey.slice(0, 20) + "...");

    // 1. Write auth-profiles.json with correct format: "provider:profile" key + bearer/token
    const authProfiles = JSON.stringify({
      "openrouter:default": {
        type: "bearer",
        token: apiKey
      }
    }, null, 2);
    const authB64 = Buffer.from(authProfiles).toString("base64");
    await sshExec(conn, `docker exec ${container} sh -c "echo '${authB64}' | base64 -d > /home/node/.openclaw/agents/main/agent/auth-profiles.json"`);
    console.log("Wrote auth-profiles.json");

    // Verify
    const authCheck = await sshExec(conn, `docker exec ${container} cat /home/node/.openclaw/agents/main/agent/auth-profiles.json`);
    console.log("auth-profiles.json:", authCheck.trim());

    // 2. Update openclaw.json with correct model and provider config
    const openclawConfig = JSON.stringify({
      gateway: {
        http: {
          port: 18789,
          endpoints: { chatCompletions: { enabled: true } },
        },
        auth: {
          mode: "token",
          token: "${OPENCLAW_GATEWAY_TOKEN}",
        },
        models: {
          primary: MODEL,
          providers: [
            {
              key: "openrouter",
              baseUrl: "https://openrouter.ai/api/v1",
            },
          ],
        },
        agents: {
          main: {
            model: MODEL,
            systemPrompt: "You are Julian, a helpful GTM AI assistant.",
            skills: ["/data/skills/gtm-engine"],
          },
        },
        auth_profiles: {
          "openrouter:default": {
            type: "bearer",
            token: "${OPENROUTER_API_KEY}",
          },
        },
        plugins: {
          supermemory: {
            enabled: true,
            apiKey: "${SUPERMEMORY_API_KEY}",
          },
        },
      },
    }, null, 2);
    const configB64 = Buffer.from(openclawConfig).toString("base64");
    await sshExec(conn, `docker exec ${container} sh -c "echo '${configB64}' | base64 -d > /app/openclaw.json"`);
    console.log("Wrote openclaw.json");
  }

  // Restart both containers
  console.log("\nRestarting containers...");
  await sshExec(conn, "docker restart openclaw-supersauce openclaw-superwaveio");

  console.log("Waiting 12s...");
  await new Promise(r => setTimeout(r, 12000));

  // Restart socat (new PIDs after restart)
  console.log("Restarting socat...");
  await sshExec(conn, "systemctl restart socat-openclaw-supersauce.service && systemctl restart socat-openclaw-superwaveio.service");
  await new Promise(r => setTimeout(r, 3000));

  // Verify
  const status = await sshExec(conn, 'docker ps --format "table {{.Names}}\t{{.Status}}"');
  console.log("\n" + status);

  const logs = await sshExec(conn, "docker logs openclaw-supersauce --tail 15 2>&1");
  console.log("=== supersauce logs ===\n" + logs);

  const ports = await sshExec(conn, "ss -tlnp | grep -E '18790|18791'");
  console.log("Ports:\n" + ports);

  conn.end();
}

main().catch(err => { console.error("Error:", err); process.exit(1); });
