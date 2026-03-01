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

  // First, let's find what resolveEnvApiKey checks for "anthropic"
  console.log("=== Finding resolveEnvApiKey ===");
  const envResolve = await sshExec(conn, `docker exec openclaw-supersauce sh -c "grep -A 30 'function resolveEnvApiKey' /app/dist/auth-profiles-Cn5oo5Dj.js | head -40"`);
  console.log(envResolve);

  // Also find listProfilesForProvider to understand the store format
  console.log("=== Finding listProfilesForProvider ===");
  const listProfiles = await sshExec(conn, `docker exec openclaw-supersauce sh -c "grep -A 15 'function listProfilesForProvider' /app/dist/auth-profiles-Cn5oo5Dj.js | head -20"`);
  console.log(listProfiles);

  // Find the store loading code
  console.log("=== Finding store loading ===");
  const storeLoad = await sshExec(conn, `docker exec openclaw-supersauce sh -c "grep -B 5 -A 15 'auth-profiles.json' /app/dist/auth-profiles-Cn5oo5Dj.js | head -50"`);
  console.log(storeLoad);

  conn.end();
}

main().catch(err => { console.error("Error:", err); process.exit(1); });
