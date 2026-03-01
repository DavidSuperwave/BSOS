require("dotenv").config({ path: ".env.local" });
const { Client } = require("ssh2");

const key = process.env.PROVISIONER_SSH_KEY;
if (!key) { console.error("No SSH key"); process.exit(1); }

// First, let's check if the container resolves ${OPENROUTER_API_KEY} or if we need the literal value.
// Let's read the actual env var value from inside the container and use that.
const conn = new Client();
conn.on("ready", () => {
  // Step 1: Get the actual API key from the container's env
  conn.exec('docker exec openclaw-supersauce printenv OPENROUTER_API_KEY', (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    let apiKey = "";
    stream.on("data", (d) => (apiKey += d.toString().trim()));
    stream.on("close", () => {
      console.log("OpenRouter API key:", apiKey.slice(0, 20) + "...");

      // Step 2: Write auth-profiles.json with the actual key value
      const authProfiles = JSON.stringify({
        openrouter: {
          apiKey: apiKey,
          baseUrl: "https://openrouter.ai/api/v1"
        },
        anthropic: {
          apiKey: apiKey,
          baseUrl: "https://openrouter.ai/api/v1"
        }
      }, null, 2);

      const b64 = Buffer.from(authProfiles).toString("base64");

      const cmds = [
        `docker exec openclaw-supersauce sh -c "echo '${b64}' | base64 -d > /home/node/.openclaw/agents/main/agent/auth-profiles.json"`,
        `docker exec openclaw-superwaveio sh -c "echo '${b64}' | base64 -d > /home/node/.openclaw/agents/main/agent/auth-profiles.json"`,
        'echo "Written. Restarting..."',
        'docker restart openclaw-supersauce openclaw-superwaveio',
        'sleep 12',
        'docker ps --format "table {{.Names}}\t{{.Status}}"',
        'echo ""',
        'docker logs openclaw-supersauce --tail 10 2>&1',
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
