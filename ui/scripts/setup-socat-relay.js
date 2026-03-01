/**
 * Set up socat TCP relay on the droplet to bridge external access to
 * container-internal WebSocket ports.
 *
 * This creates socat processes that listen on 0.0.0.0:PORT and relay
 * to the container via `docker exec ... socat`.
 *
 * Actually, the simpler approach: use `socat` on the HOST to relay to
 * the docker-proxy port, which forwards into the container. But since
 * the container binds to 127.0.0.1, docker-proxy forwards to the
 * container's 127.0.0.1 which works IF accessed through docker networking.
 *
 * Wait - the docker-proxy port 18791 on 0.0.0.0 SHOULD work. Let me
 * actually re-test the raw TCP connection from the host to the docker-proxy.
 */
require("dotenv").config({ path: ".env.local" });
const { Client } = require("ssh2");

const sshKey = process.env.PROVISIONER_SSH_KEY;
const cleanKey = sshKey.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

const sshConn = new Client();

sshConn.on("ready", () => {
  console.log("SSH connected");

  const cmd = [
    // Detailed test of docker-proxy
    'echo "=== RAW TCP TEST TO DOCKER-PROXY ==="',
    // Use python3 to do a WebSocket upgrade handshake
    `python3 -c "
import socket, json, base64, os
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.settimeout(10)
s.connect(('127.0.0.1', 18791))
print('TCP connected to 127.0.0.1:18791')

# Send WebSocket upgrade
key = base64.b64encode(os.urandom(16)).decode()
upgrade = (
    'GET / HTTP/1.1\\r\\n'
    'Host: 127.0.0.1:18791\\r\\n'
    'Upgrade: websocket\\r\\n'
    'Connection: Upgrade\\r\\n'
    'Sec-WebSocket-Version: 13\\r\\n'
    f'Sec-WebSocket-Key: {key}\\r\\n'
    '\\r\\n'
)
s.sendall(upgrade.encode())
print('Sent WS upgrade request')

# Read response
data = s.recv(4096)
print('Response:', data.decode('utf-8', errors='replace')[:500])
s.close()
" 2>&1`,
    'echo',
    'echo "=== ALSO TEST INSIDE CONTAINER ==="',
    // From inside the container, the same test should work
    `docker exec openclaw-supersauce python3 -c "
import socket, json, base64, os
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.settimeout(10)
s.connect(('127.0.0.1', 18789))
print('TCP connected to 127.0.0.1:18789')
key = base64.b64encode(os.urandom(16)).decode()
upgrade = (
    'GET / HTTP/1.1\\r\\n'
    'Host: 127.0.0.1:18789\\r\\n'
    'Upgrade: websocket\\r\\n'
    'Connection: Upgrade\\r\\n'
    'Sec-WebSocket-Version: 13\\r\\n'
    f'Sec-WebSocket-Key: {key}\\r\\n'
    '\\r\\n'
)
s.sendall(upgrade.encode())
print('Sent WS upgrade request')
data = s.recv(4096)
print('Response:', data.decode('utf-8', errors='replace')[:500])
s.close()
" 2>&1 || echo "Python3 not available in container"`,
  ].join(" && ");

  sshConn.exec(cmd, (err, stream) => {
    if (err) {
      console.error(err);
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

  setTimeout(() => sshConn.end(), 30000);
});

sshConn.on("error", (err) => console.error("SSH error:", err.message));
sshConn.connect({
  host: "159.65.220.183",
  port: 22,
  username: "root",
  privateKey: cleanKey,
  readyTimeout: 15000,
});
