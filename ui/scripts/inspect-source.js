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

async function inspectImage() {
  console.log("🔍 Inspecting OpenClaw Docker image...\n");

  // Get image labels and source info
  const { stdout: inspect } = await sshExec(
    `docker inspect ghcr.io/davidsuperwave/bsos/openclaw:latest --format='{{json .Config.Labels}}' 2>/dev/null || echo "{}"`
  );
  console.log("Image Labels:");
  console.log(inspect || "No labels found");

  // Check for any source references
  console.log("\n📦 Checking for source repo info...");
  const { stdout: env } = await sshExec(
    `docker inspect ghcr.io/davidsuperwave/bsos/openclaw:latest --format='{{range .Config.Env}}{{.}}\\n{{end}}' 2>/dev/null | grep -iE "(repo|source|github)" || echo "No source env vars"`
  );
  console.log(env || "No source info in env");

  // Look at the image history
  console.log("\n📜 Image History:");
  const { stdout: history } = await sshExec(
    `docker history ghcr.io/davidsuperwave/bsos/openclaw:latest --format "{{.CreatedBy}}" 2>/dev/null | head -10`
  );
  console.log(history || "No history");

  // Check if there's a package.json with repo info
  console.log("\n📄 Checking package.json for repo URL...");
  const { stdout: pkg } = await sshExec(
    `docker run --rm ghcr.io/davidsuperwave/bsos/openclaw:latest cat /app/package.json 2>/dev/null | grep -E "(repository|homepage|url)" | head -5 || echo "No repo info"`
  );
  console.log(pkg || "No package.json info");
}

async function findModelInSource() {
  console.log("\n\n🔎 Searching for hardcoded model in running container...");

  const container = "openclaw-supersauce";

  // Search in node_modules (compiled code)
  console.log("\n1. Searching in /app/dist or /app/build...");
  const { stdout: distSearch } = await sshExec(
    `docker exec ${container} find /app -name "*.js" -path "*/dist/*" -exec grep -l "claude-opus-4-6" {} \\; 2>/dev/null | head -5`
  );
  console.log(distSearch || "Not found in dist");

  // Search in gateway package specifically
  console.log("\n2. Searching in gateway package...");
  const { stdout: gatewaySearch } = await sshExec(
    `docker exec ${container} grep -r "claude-opus-4-6" /app/packages/gateway/dist/ 2>/dev/null | head -3 || echo "Not in gateway/dist"`
  );
  console.log(gatewaySearch || "Not found");

  // Check if it's in a bundled/compiled file
  console.log("\n3. Searching in entire /app (this may take a moment)...");
  const { stdout: fullSearch } = await sshExec(
    `docker exec ${container} grep -r "DEFAULT.*MODEL\|defaultModel\|claude-opus-4-6" /app/packages/ 2>/dev/null | grep -v node_modules | head -10`
  );
  console.log(fullSearch || "Pattern not found in source");
}

async function main() {
  if (!SSH_KEY) {
    console.error("❌ PROVISIONER_SSH_KEY not set");
    process.exit(1);
  }

  try {
    await inspectImage();
    await findModelInSource();

    console.log("\n\n" + "=".repeat(60));
    console.log("📋 SUMMARY");
    console.log("=".repeat(60));
    console.log("\nThe OpenClaw image is: ghcr.io/davidsuperwave/bsos/openclaw:latest");
    console.log("\nTo fork and customize:");
    console.log("1. Find the source repo (likely davidsuperwave/pi-coding-agent)");
    console.log("2. Fork it to your GitHub account");
    console.log("3. Search for 'claude-opus-4-6' in packages/gateway/src/");
    console.log("4. Change to 'kimi-coding/k2p5'");
    console.log("5. Build and push to GHCR");
    console.log("6. Update provisioning to use your image");
    
  } catch (err) {
    console.error("Error:", err.message);
  }
}

main().catch(console.error);
