import { Client } from "ssh2";
import {
  normalizeSshPrivateKey,
  resolveProvisionerDropletIp,
  resolveProvisionerSshKey,
} from "@/lib/provisioner-env";

/**
 * Execute SSH command(s) on the provisioner droplet using the ssh2 library.
 * Passes the private key directly in memory — no temp files, no Windows permission issues.
 */
export async function sshExec(
  commands: string[]
): Promise<{ stdout: string; stderr: string; code: number }> {
  const dropletIp = resolveProvisionerDropletIp();
  const sshKey = resolveProvisionerSshKey();

  if (!dropletIp) {
    throw new Error("DROPLET_IP not configured");
  }
  if (!sshKey) {
    throw new Error("PROVISIONER_SSH_KEY not configured");
  }

  const cleanKey = normalizeSshPrivateKey(sshKey);
  const combined = commands.join(" && ");

  return new Promise((resolve, reject) => {
    const conn = new Client();
    let stdout = "";
    let stderr = "";

    conn
      .on("ready", () => {
        conn.exec(combined, (err, stream) => {
          if (err) {
            conn.end();
            return reject(err);
          }

          stream.on("data", (data: Buffer) => {
            stdout += data.toString();
          });

          stream.stderr.on("data", (data: Buffer) => {
            stderr += data.toString();
          });

          stream.on("close", (code: number) => {
            conn.end();
            resolve({ stdout, stderr, code: code || 0 });
          });
        });
      })
      .on("error", (err) => {
        reject(err);
      })
      .connect({
        host: dropletIp,
        port: 22,
        username: "root",
        privateKey: cleanKey,
        readyTimeout: 15000,
      });
  });
}
