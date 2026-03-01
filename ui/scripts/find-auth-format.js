require("dotenv").config({ path: ".env.local" });
const { Client } = require("ssh2");

const key = process.env.PROVISIONER_SSH_KEY;
if (!key) { console.error("No SSH key"); process.exit(1); }

const conn = new Client();
conn.on("ready", () => {
  const cmds = [
    // Search for "auth-profiles" in the node_modules to find the expected format
    'docker exec openclaw-supersauce grep -r "auth-profiles" /app/node_modules/.pnpm/@mariozechner* --include="*.js" -l 2>&1 | head -10',
    'echo "---"',
    // Search for the actual error message to find the code that produces it
    'docker exec openclaw-supersauce grep -r "No API key found for provider" /app/node_modules/.pnpm/@mariozechner* --include="*.js" -l 2>&1 | head -5',
  ].join(" && ");
  conn.exec(cmds, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    let out = "";
    stream.on("data", (d) => (out += d.toString()));
    stream.stderr.on("data", (d) => (out += d.toString()));
    stream.on("close", () => {
      console.log(out);
      // Now grep the actual source for the format
      if (out.includes("/app/")) {
        const files = out.split("\n").filter(l => l.startsWith("/app/") && l.includes(".js"));
        if (files.length > 0) {
          // Read the first matching file that has the error message
          const errorFile = files.find(f => !f.includes("---")) || files[0];
          conn.exec(`docker exec openclaw-supersauce grep -A 20 -B 5 "No API key found" ${errorFile.trim()} 2>&1 | head -60`, (err2, stream2) => {
            if (err2) { console.error(err2); conn.end(); return; }
            let out2 = "";
            stream2.on("data", (d) => (out2 += d.toString()));
            stream2.stderr.on("data", (d) => (out2 += d.toString()));
            stream2.on("close", () => { console.log("\n=== Error source ===\n" + out2); conn.end(); });
          });
        } else {
          conn.end();
        }
      } else {
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
