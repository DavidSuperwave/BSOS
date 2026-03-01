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

  // Find resolveEnvApiKey to see what env var it checks for "anthropic"
  console.log("=== resolveEnvApiKey ===");
  const result = await sshExec(conn, `docker exec openclaw-supersauce sh -c "grep -A 40 'function resolveEnvApiKey' /app/dist/auth-profiles-Cn5oo5Dj.js | head -50"`);
  console.log(result);

  // Find how the auth store is loaded (the profiles wrapper)
  console.log("=== loadAuthStore / readAuthProfiles ===");
  const load = await sshExec(conn, `docker exec openclaw-supersauce sh -c "grep -B 3 -A 20 'readFileSync.*auth-profiles' /app/dist/auth-profiles-Cn5oo5Dj.js | head -40"`);
  console.log(load);

  // Also check if there's a "profiles" property in the parsing
  console.log("=== profiles property ===");
  const profiles = await sshExec(conn, `docker exec openclaw-supersauce sh -c "grep -n 'profiles' /app/dist/auth-profiles-Cn5oo5Dj.js | head -20"`);
  console.log(profiles);

  conn.end();
}

main().catch(err => { console.error("Error:", err); process.exit(1); });
