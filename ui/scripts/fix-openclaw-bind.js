/**
 * Fix OpenClaw gateway bind address from 127.0.0.1 to 0.0.0.0
 * so Docker port mapping works correctly.
 */
require("dotenv").config({ path: ".env.local" });
const { Client } = require("ssh2");

const sshKey = process.env.PROVISIONER_SSH_KEY;
if (!sshKey) {
  console.error("No PROVISIONER_SSH_KEY found");
  process.exit(1);
}
const cleanKey = sshKey.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

const containers = [
  { name: "openclaw-supersauce", composePath: "/opt/openclaw/supersauce" },
  { name: "openclaw-superwaveio", composePath: "/opt/openclaw/superwaveio" },
];

const sshConn = new Client();

sshConn.on("ready", () => {
  console.log("SSH connected");

  // Build command to fix both containers
  const commands = [];

  for (const c of containers) {
    commands.push(
      `echo "=== Fixing ${c.name} ==="`,
      `docker cp ${c.name}:/app/openclaw.json /tmp/${c.name}-config.json`,
      `sed -i 's/"port": 18789/"host": "0.0.0.0", "port": 18789/' /tmp/${c.name}-config.json`,
      `head -8 /tmp/${c.name}-config.json`,
      `docker cp /tmp/${c.name}-config.json ${c.name}:/app/openclaw.json`,
      `cd ${c.composePath} && docker compose restart`,
      `echo "Restarted ${c.name}"`
    );
  }

  // Wait then check
  commands.push(
    "sleep 10",
    "echo '=== Checking bind addresses ==='",
    "docker logs openclaw-supersauce --tail 5 2>&1 | grep -i listen",
    "docker logs openclaw-superwaveio --tail 5 2>&1 | grep -i listen",
    "echo '=== Testing connectivity ==='",
    `curl -s -o /dev/null -w "Port 18791: %{http_code}\\n" http://127.0.0.1:18791/ --max-time 5 2>&1 || echo "Port 18791: FAILED"`,
    `curl -s -o /dev/null -w "Port 18790: %{http_code}\\n" http://127.0.0.1:18790/ --max-time 5 2>&1 || echo "Port 18790: FAILED"`
  );

  const cmd = commands.join(" && ");

  sshConn.exec(cmd, (err, stream) => {
    if (err) {
      console.error("Exec error:", err);
      sshConn.end();
      return;
    }
    let out = "";
    stream.on("data", (d) => (out += d.toString()));
    stream.stderr.on("data", (d) => (out += d.toString()));
    stream.on("close", () => {
      console.log(out);
      sshConn.end();
    });
  });

  setTimeout(() => sshConn.end(), 60000);
});

sshConn.on("error", (err) => console.error("SSH error:", err.message));
sshConn.connect({
  host: "159.65.220.183",
  port: 22,
  username: "root",
  privateKey: cleanKey,
  readyTimeout: 15000,
});
