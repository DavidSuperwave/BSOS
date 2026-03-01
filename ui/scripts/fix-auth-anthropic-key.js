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

  // The runtime model is anthropic/claude-opus-4-6 (hardcoded default).
  // OpenClaw parses "anthropic" as the provider and looks for "anthropic:default" in auth-profiles.
  // Point "anthropic:default" at OpenRouter so it proxies through there.

  const apiKey = (await sshExec(conn, "docker exec openclaw-supersauce printenv OPENROUTER_API_KEY")).trim();
  console.log("API key:", apiKey.slice(0, 20) + "...");

  // auth-profiles.json with BOTH anthropic:default and openrouter:default
  // anthropic:default points to OpenRouter's base URL so anthropic/ model IDs route through OpenRouter
  const authProfiles = JSON.stringify({
    "anthropic:default": {
      type: "bearer",
      token: apiKey,
      baseUrl: "https://openrouter.ai/api/v1"
    },
    "openrouter:default": {
      type: "bearer",
      token: apiKey
    }
  }, null, 2);

  const b64 = Buffer.from(authProfiles).toString("base64");

  for (const container of ["openclaw-supersauce", "openclaw-superwaveio"]) {
    console.log(`\nWriting auth for ${container}...`);
    await sshExec(conn, `docker exec ${container} sh -c "echo '${b64}' | base64 -d > /home/node/.openclaw/agents/main/agent/auth-profiles.json"`);
    const verify = await sshExec(conn, `docker exec ${container} cat /home/node/.openclaw/agents/main/agent/auth-profiles.json`);
    console.log(verify.trim());
  }

  // No restart needed - OpenClaw reads auth-profiles at runtime per request
  // Let's test directly
  console.log("\n=== Testing chat.send ===");

  conn.end();
}

main().catch(err => { console.error("Error:", err); process.exit(1); });
