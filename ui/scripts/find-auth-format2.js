require("dotenv").config({ path: ".env.local" });
const { Client } = require("ssh2");

const key = process.env.PROVISIONER_SSH_KEY;
if (!key) { console.error("No SSH key"); process.exit(1); }

const conn = new Client();
conn.on("ready", () => {
  const cmds = [
    // Find JS files containing "auth-profiles" and "No API key"
    'docker exec openclaw-supersauce sh -c "grep -rl \'auth-profiles\' /app/node_modules/ --include=\'*.js\' 2>/dev/null | head -5"',
    'echo "=== separator ==="',
    'docker exec openclaw-supersauce sh -c "grep -rl \'No API key found for provider\' /app/node_modules/ --include=\'*.js\' 2>/dev/null | head -5"',
  ].join(" && ");
  conn.exec(cmds, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    let out = "";
    stream.on("data", (d) => (out += d.toString()));
    stream.stderr.on("data", (d) => (out += d.toString()));
    stream.on("close", () => {
      console.log(out);

      // Find the file with the error and read the relevant section
      const lines = out.split("\n").filter(l => l.startsWith("/app/"));
      const errorFile = lines.find(l => l.includes(".js"));
      if (errorFile) {
        conn.exec(`docker exec openclaw-supersauce sh -c "grep -B 10 -A 20 'No API key found for provider' ${errorFile.trim()} | head -80"`, (err2, stream2) => {
          if (err2) { console.error(err2); conn.end(); return; }
          let out2 = "";
          stream2.on("data", (d) => (out2 += d.toString()));
          stream2.stderr.on("data", (d) => (out2 += d.toString()));
          stream2.on("close", () => {
            console.log("\n=== Error context ===\n" + out2);
            conn.end();
          });
        });
      } else {
        console.log("No files found");
        conn.end();
      }
    });
  });
});
conn.on("error", (e) => console.error("SSH error:", e.message));
conn.connect({
  host: "159.65.220.183",
  port: 22,
  username: "root",
  privateKey: key.replace(/\r\n/g, "\n").replace(/\r/g, "\n"),
  readyTimeout: 15000,
});
