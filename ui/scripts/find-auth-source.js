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

  // Find the actual JS source that reads auth-profiles.json
  console.log("=== Searching for auth-profiles reader ===");
  const files = await sshExec(conn, `docker exec openclaw-supersauce sh -c "grep -rl 'auth-profiles.json' /app/ --include='*.js' 2>/dev/null | head -10"`);
  console.log("Files:", files);

  // Also search for "No API key found"
  const errorFiles = await sshExec(conn, `docker exec openclaw-supersauce sh -c "grep -rl 'No API key found' /app/ --include='*.js' 2>/dev/null | head -10"`);
  console.log("Error source:", errorFiles);

  // Read the context around the error
  for (const f of errorFiles.trim().split("\n").filter(Boolean)) {
    console.log(`\n=== ${f} ===`);
    const ctx = await sshExec(conn, `docker exec openclaw-supersauce sh -c "grep -B 30 -A 5 'No API key found' ${f} | head -80"`);
    console.log(ctx);
  }

  conn.end();
}

main().catch(err => { console.error("Error:", err); process.exit(1); });
