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
  console.log("SSH connected\n");

  // Show current state
  console.log("=== Current openclaw.json ===");
  console.log(await sshExec(conn, "docker exec openclaw-supersauce cat /app/openclaw.json 2>&1"));

  console.log("=== Current auth-profiles.json ===");
  console.log(await sshExec(conn, "docker exec openclaw-supersauce cat /home/node/.openclaw/agents/main/agent/auth-profiles.json 2>&1"));

  console.log("=== Current auth.json ===");
  console.log(await sshExec(conn, "docker exec openclaw-supersauce cat /home/node/.openclaw/agents/main/agent/auth.json 2>&1"));

  // Get the OpenRouter API key
  const apiKey = (await sshExec(conn, "docker exec openclaw-supersauce printenv OPENROUTER_API_KEY")).trim();
  console.log("OpenRouter API key:", apiKey.slice(0, 15) + "...\n");

  // FIX: Write auth-profiles.json with correct format (apiKey, not token/bearer)
  // Route anthropic provider through OpenRouter
  const authProfiles = JSON.stringify({
    "anthropic:default": {
      apiKey: apiKey,
      baseUrl: "https://openrouter.ai/api/v1"
    },
    "openrouter:default": {
      apiKey: apiKey
    }
  }, null, 2);

  const authB64 = Buffer.from(authProfiles).toString("base64");

  for (const container of ["openclaw-supersauce", "openclaw-superwaveio"]) {
    console.log(`Writing auth-profiles.json for ${container}...`);
    await sshExec(conn, `docker exec ${container} sh -c "echo '${authB64}' | base64 -d > /home/node/.openclaw/agents/main/agent/auth-profiles.json"`);
  }

  // Verify
  console.log("\n=== Updated auth-profiles.json ===");
  console.log(await sshExec(conn, "docker exec openclaw-supersauce cat /home/node/.openclaw/agents/main/agent/auth-profiles.json 2>&1"));

  // Now test immediately (no restart needed - it reads per-request)
  console.log("=== Testing chat.send ===");
  conn.end();
}

main().catch(err => { console.error("Error:", err); process.exit(1); });
