const { Client } = require("ssh2");
require("dotenv").config({ path: ".env.local" });

const DROPLET_IP = process.env.DROPLET_IP || "159.65.220.183";
const SSH_KEY = process.env.PROVISIONER_SSH_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const CONTAINERS = ["openclaw-supersauce", "openclaw-superwaveio"];

function sshExec(command) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on("ready", () => {
      conn.exec(command, (err, stream) => {
        if (err) return reject(err);
        let stdout = "";
        let stderr = "";
        stream.on("data", (d) => (stdout += d.toString()));
        stream.stderr.on("data", (d) => (stderr += d.toString()));
        stream.on("close", (code) => {
          conn.end();
          resolve({ stdout, stderr, code });
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

async function updateContainer(containerName) {
  const authProfiles = {
    profiles: {
      "anthropic:default": {
        apiKey: ANTHROPIC_API_KEY,
      },
    },
  };

  const authB64 = Buffer.from(JSON.stringify(authProfiles, null, 2)).toString(
    "base64"
  );

  const cmd = `docker exec ${containerName} sh -c "mkdir -p /home/node/.openclaw && echo '${authB64}' | base64 -d > /home/node/.openclaw/auth-profiles.json && chown node:node /home/node/.openclaw/auth-profiles.json && chmod 600 /home/node/.openclaw/auth-profiles.json"`;
  const res = await sshExec(cmd);
  if (res.code !== 0) {
    throw new Error(
      `Failed to write auth-profiles for ${containerName}: ${res.stderr || res.stdout}`
    );
  }

  const verify = await sshExec(
    `docker exec ${containerName} sh -c "test -f /home/node/.openclaw/auth-profiles.json && echo OK || echo MISSING"`
  );
  if (!verify.stdout.includes("OK")) {
    throw new Error(`Verification failed for ${containerName}`);
  }
}

async function main() {
  if (!SSH_KEY) {
    throw new Error("PROVISIONER_SSH_KEY is missing in .env.local");
  }
  if (!ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is missing in .env.local");
  }

  console.log(`Updating auth profiles on ${DROPLET_IP}...`);
  for (const name of CONTAINERS) {
    await updateContainer(name);
    console.log(`Updated: ${name}`);
  }
  console.log("Anthropic auth profile injection complete.");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
