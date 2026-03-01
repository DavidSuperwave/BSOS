require("dotenv").config({ path: ".env.local" });
const { Client } = require("ssh2");

const key = process.env.PROVISIONER_SSH_KEY;
if (!key) { console.error("No SSH key"); process.exit(1); }

const conn = new Client();
conn.on("ready", () => {
  const cmds = [
    'echo "=== Restarting socat services ==="',
    'systemctl restart socat-openclaw-supersauce.service',
    'systemctl restart socat-openclaw-superwaveio.service',
    'sleep 3',
    'echo "=== Status ==="',
    'systemctl is-active socat-openclaw-supersauce.service',
    'systemctl is-active socat-openclaw-superwaveio.service',
    'ss -tlnp | grep -E "18790|18791"',
    'echo ""',
    'echo "=== WS Test ==="',
    "python3 -c \"import socket; s=socket.socket(); s.settimeout(5); s.connect(('127.0.0.1',18791)); s.sendall(b'GET / HTTP/1.1\\r\\nUpgrade: websocket\\r\\nConnection: Upgrade\\r\\nSec-WebSocket-Version: 13\\r\\nSec-WebSocket-Key: dGVzdGtleQ==\\r\\nHost: 127.0.0.1\\r\\n\\r\\n'); print(s.recv(512)); s.close()\" 2>&1",
  ].join(" && ");
  conn.exec(cmds, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    let out = "";
    stream.on("data", (d) => (out += d.toString()));
    stream.stderr.on("data", (d) => (out += d.toString()));
    stream.on("close", () => { console.log(out); conn.end(); });
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
