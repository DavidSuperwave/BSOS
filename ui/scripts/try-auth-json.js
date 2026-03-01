require("dotenv").config({ path: ".env.local" });
const { Client } = require("ssh2");

const key = process.env.PROVISIONER_SSH_KEY;
if (!key) { console.error("No SSH key"); process.exit(1); }

const conn = new Client();
conn.on("ready", () => {
  // Get the actual API key
  conn.exec('docker exec openclaw-supersauce printenv OPENROUTER_API_KEY', (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    let apiKey = "";
    stream.on("data", (d) => (apiKey += d.toString().trim()));
    stream.on("close", () => {
      console.log("API key:", apiKey.slice(0, 20) + "...");

      // Try different auth file formats
      // Format 1: auth-profiles.json with "profiles" wrapper
      const format1 = JSON.stringify({
        profiles: {
          anthropic: {
            apiKey: apiKey,
            baseUrl: "https://openrouter.ai/api/v1"
          },
          openrouter: {
            apiKey: apiKey,
            baseUrl: "https://openrouter.ai/api/v1"
          }
        }
      }, null, 2);

      // Format 2: auth.json with provider keys
      const format2 = JSON.stringify({
        anthropic: { apiKey: apiKey, baseUrl: "https://openrouter.ai/api/v1" },
        openrouter: { apiKey: apiKey, baseUrl: "https://openrouter.ai/api/v1" }
      }, null, 2);

      // Format 3: just the API key directly in auth.json
      const format3 = JSON.stringify({
        apiKey: apiKey,
        baseUrl: "https://openrouter.ai/api/v1"
      }, null, 2);

      const f1B64 = Buffer.from(format1).toString("base64");
      const f2B64 = Buffer.from(format2).toString("base64");

      const cmds = [
        // Write both formats and restart
        `docker exec openclaw-supersauce sh -c "echo '${f1B64}' | base64 -d > /home/node/.openclaw/agents/main/agent/auth-profiles.json"`,
        `docker exec openclaw-supersauce sh -c "echo '${f2B64}' | base64 -d > /home/node/.openclaw/agents/main/agent/auth.json"`,
        'echo "Written both files"',
        'docker exec openclaw-supersauce cat /home/node/.openclaw/agents/main/agent/auth-profiles.json',
        'docker exec openclaw-supersauce cat /home/node/.openclaw/agents/main/agent/auth.json',
        'echo ""',
        // Don't restart - let's try a chat.send and see if it picks up the file without restart
        // Actually, the error happens at runtime so it should read the file each time
        'echo "=== Testing via node process inside container ==="',
        'docker exec openclaw-supersauce node -e "const fs = require(\'fs\'); const p = \'/home/node/.openclaw/agents/main/agent/auth-profiles.json\'; console.log(\'exists:\', fs.existsSync(p)); if(fs.existsSync(p)) console.log(\'content:\', fs.readFileSync(p, \'utf8\').slice(0,100))" 2>&1 || echo "node test failed"',
      ].join(" && ");

      conn.exec(cmds, (err2, stream2) => {
        if (err2) { console.error(err2); conn.end(); return; }
        let out = "";
        stream2.on("data", (d) => (out += d.toString()));
        stream2.stderr.on("data", (d) => (out += d.toString()));
        stream2.on("close", () => {
          console.log(out);
          conn.end();
        });
      });
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
