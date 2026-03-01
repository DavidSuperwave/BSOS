const { Client } = require("ssh2");
require("dotenv").config({ path: ".env.local" });

const DROPLET_IP = process.env.DROPLET_IP || "159.65.220.183";
const SSH_KEY = process.env.PROVISIONER_SSH_KEY;

function sshExec(cmd) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on("ready", () => {
      conn.exec(cmd, (err, stream) => {
        if (err) return reject(err);
        let stdout = "";
        let stderr = "";
        stream.on("data", (data) => (stdout += data));
        stream.stderr.on("data", (data) => (stderr += data));
        stream.on("close", () => {
          conn.end();
          resolve({ stdout, stderr });
        });
      });
    });
    conn.on("error", reject);
    conn.connect({
      host: DROPLET_IP,
      username: "root",
      privateKey: SSH_KEY.replace(/\r\n/g, "\n").replace(/\r/g, "\n"),
    });
  });
}

async function diagnose() {
  console.log("🔍 Diagnosing Socat + Gateway Connectivity\n");

  // 1. Check socat services
  console.log("1. Socat service status:");
  const { stdout: socatStatus } = await sshExec(
    'systemctl status socat-openclaw-* --no-pager 2>&1 | grep -E "(Active|PID)"'
  );
  console.log(socatStatus || "No socat services found");

  // 2. Check socat processes
  console.log("\n2. Socat processes:");
  const { stdout: socatPs } = await sshExec('ps aux | grep socat | grep -v grep');
  console.log(socatPs || "No socat processes running");

  // 3. Check if socat can reach container
  console.log("\n3. Testing socat connectivity...");
  const { stdout: containerPid } = await sshExec(
    'docker inspect -f "{{.State.Pid}}" openclaw-supersauce 2>/dev/null'
  );
  console.log(`Container PID: ${containerPid.trim()}`);
  
  if (containerPid.trim()) {
    const { stdout: nsenterTest } = await sshExec(
      `nsenter --net=/proc/${containerPid.trim()}/ns/net curl -s http://127.0.0.1:18789/health --max-time 3 2>&1 | head -c 50`
    );
    console.log(`Direct nsenter test: ${nsenterTest.trim() || "Failed"}`);
  }

  // 4. Test port 18791 locally on droplet
  console.log("\n4. Testing local port 18791:");
  const { stdout: localTest } = await sshExec(
    'curl -s http://127.0.0.1:18791/ --max-time 3 2>&1 | head -c 100'
  );
  console.log(`Result: ${localTest.trim() || "No response"}`);

  // 5. Check netstat
  console.log("\n5. Port bindings:");
  const { stdout: ports } = await sshExec('ss -tlnp | grep -E "1879[0-9]"');
  console.log(ports || "No ports found");

  // 6. Restart socat services
  console.log("\n6. Restarting socat services...");
  await sshExec('systemctl restart socat-openclaw-supersauce.service socat-openclaw-superwaveio.service');
  await new Promise(r => setTimeout(r, 2000));
  
  const { stdout: afterRestart } = await sshExec('systemctl is-active socat-openclaw-*');
  console.log(`Status after restart: ${afterRestart.trim()}`);

  // 7. Test again
  console.log("\n7. Testing after restart:");
  await new Promise(r => setTimeout(r, 3000));
  const { stdout: testAfter } = await sshExec(
    'curl -s http://127.0.0.1:18791/ --max-time 5 2>&1 | head -c 100'
  );
  console.log(`Result: ${testAfter.trim() || "Still no response"}`);
}

async function main() {
  if (!SSH_KEY) {
    console.error("❌ PROVISIONER_SSH_KEY not set");
    process.exit(1);
  }

  try {
    await diagnose();
  } catch (err) {
    console.error("Error:", err.message);
  }
}

main().catch(console.error);
