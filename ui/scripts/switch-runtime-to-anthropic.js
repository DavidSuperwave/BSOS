const { Client } = require("ssh2");
require("dotenv").config({ path: ".env.local" });

const DROPLET_IP = process.env.DROPLET_IP || "159.65.220.183";
const SSH_KEY = process.env.PROVISIONER_SSH_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const TARGETS = [
  { slug: "supersauce", container: "openclaw-supersauce" },
  { slug: "superwaveio", container: "openclaw-superwaveio" },
];

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

function setOrInsertEnvLine(composeContent, key, value) {
  const lineRegex = new RegExp(`^\\s*-\\s+${key}=.*$`, "m");
  const newLine = `      - ${key}=${value}`;

  if (lineRegex.test(composeContent)) {
    return composeContent.replace(lineRegex, newLine);
  }

  const marker = /^(\s*-\s+OPENROUTER_API_KEY=.*)$/m;
  if (marker.test(composeContent)) {
    return composeContent.replace(marker, `$1\n${newLine}`);
  }

  return composeContent;
}

async function updateTarget(target) {
  const composePath = `/opt/openclaw/${target.slug}/docker-compose.yml`;
  const read = await sshExec(`cat ${composePath}`);
  if (read.code !== 0 || !read.stdout.includes("services:")) {
    throw new Error(`Failed reading compose for ${target.slug}: ${read.stderr || read.stdout}`);
  }

  let updated = read.stdout;
  updated = setOrInsertEnvLine(updated, "ANTHROPIC_API_KEY", ANTHROPIC_API_KEY);
  updated = setOrInsertEnvLine(updated, "ANTHROPIC_BASE_URL", "https://api.anthropic.com");

  const b64 = Buffer.from(updated, "utf8").toString("base64");
  const write = await sshExec(`echo '${b64}' | base64 -d > ${composePath}`);
  if (write.code !== 0) {
    throw new Error(`Failed writing compose for ${target.slug}: ${write.stderr || write.stdout}`);
  }

  const recreate = await sshExec(
    `cd /opt/openclaw/${target.slug} && docker compose up -d --force-recreate`
  );
  if (recreate.code !== 0) {
    throw new Error(`Failed recreating ${target.container}: ${recreate.stderr || recreate.stdout}`);
  }

  const verify = await sshExec(
    `docker exec ${target.container} sh -c "echo ANTHROPIC_BASE_URL=$ANTHROPIC_BASE_URL && if [ -n \\"$ANTHROPIC_API_KEY\\" ]; then echo ANTHROPIC_API_KEY_SET=yes; else echo ANTHROPIC_API_KEY_SET=no; fi"`
  );
  if (verify.code !== 0) {
    throw new Error(`Failed verifying ${target.container}: ${verify.stderr || verify.stdout}`);
  }

  return verify.stdout;
}

async function main() {
  if (!SSH_KEY) throw new Error("PROVISIONER_SSH_KEY missing in .env.local");
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY missing in .env.local");

  console.log(`Switching runtime auth to Anthropic on ${DROPLET_IP}...`);
  for (const target of TARGETS) {
    const result = await updateTarget(target);
    console.log(`Updated ${target.container}`);
    console.log(result.trim());
  }
  console.log("Runtime switch complete.");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
