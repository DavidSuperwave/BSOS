import { utils as ssh2Utils } from "ssh2";
import { envConfig } from "@/lib/env";

const PRIVATE_KEY_MARKER = "PRIVATE KEY-----";

export interface ProvisionerSshResolution {
  dropletIp: string | null;
  privateKey: string | null;
  source: "PROVISIONER_SSH_KEY_B64" | "PROVISIONER_SSH_KEY" | null;
}

function normalizeSshPrivateKey(rawKey: string): string {
  let key = String(rawKey || "").trim();
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1);
  }

  key = key
    .replace(/\\n/g, "\n")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

  const beginMatch = key.match(/-----BEGIN [A-Z ]+PRIVATE KEY-----/);
  const endMatch = key.match(/-----END [A-Z ]+PRIVATE KEY-----/);
  if (!beginMatch || !endMatch) {
    return key;
  }

  const begin = beginMatch[0];
  const end = endMatch[0];
  const bodyStart = key.indexOf(begin) + begin.length;
  const bodyEnd = key.lastIndexOf(end);
  if (bodyStart < begin.length || bodyEnd <= bodyStart) {
    return key;
  }

  const body = key
    .slice(bodyStart, bodyEnd)
    .split("\n")
    .map((line) => line.trim().replace(/\s+/g, ""))
    .filter(Boolean)
    .join("\n");

  return `${begin}\n${body}\n${end}`;
}

function decodeProvisionerSshKeyB64(rawValue: string): string | null {
  let value = String(rawValue || "").trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  value = value.replace(/^base64:/i, "").replace(/\s+/g, "");
  if (!value) return null;

  try {
    return normalizeSshPrivateKey(Buffer.from(value, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function hasPrivateKeyEnvelope(value: string): boolean {
  return value.includes("-----BEGIN ") && value.includes(PRIVATE_KEY_MARKER);
}

function validateWithSsh2ParseKey(privateKey: string): Error | null {
  const parsed = ssh2Utils.parseKey(privateKey);
  if (parsed instanceof Error) return parsed;
  return null;
}

export function resolveProvisionerSshConfig(): ProvisionerSshResolution {
  const dropletIp = envConfig.provisioner.dropletIp();

  const decodedB64 = decodeProvisionerSshKeyB64(
    envConfig.provisioner.sshKeyB64() || ""
  );
  if (decodedB64 && hasPrivateKeyEnvelope(decodedB64)) {
    return {
      dropletIp,
      privateKey: decodedB64,
      source: "PROVISIONER_SSH_KEY_B64",
    };
  }

  const legacyKey = normalizeSshPrivateKey(envConfig.provisioner.sshKey() || "");
  if (legacyKey && hasPrivateKeyEnvelope(legacyKey)) {
    return {
      dropletIp,
      privateKey: legacyKey,
      source: "PROVISIONER_SSH_KEY",
    };
  }

  return {
    dropletIp,
    privateKey: null,
    source: null,
  };
}

function cloudSecretCatalog(): string[] {
  return String(process.env.CLOUD_AGENT_ALL_SECRET_NAMES || "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
}

export function runProvisionerStartupPreflight(): void {
  const isCloudAgent =
    process.env.CURSOR_AGENT === "1" || !!process.env.CLOUD_AGENT_ALL_SECRET_NAMES;
  if (!isCloudAgent) return;

  const catalog = cloudSecretCatalog();
  const missingCatalogSecrets = ["PROVISIONER_SSH_KEY_B64", "DROPLET_IP"].filter(
    (name) => catalog.length > 0 && !catalog.includes(name)
  );
  if (missingCatalogSecrets.length > 0) {
    throw new Error(
      `[Provisioner preflight] Missing required cloud secrets in environment-level catalog: ${missingCatalogSecrets.join(
        ", "
      )}. Add them as cloud agent environment secrets (not tracked files).`
    );
  }

  const dropletIp = (envConfig.provisioner.dropletIp() || "").trim();
  if (!dropletIp) {
    throw new Error(
      "[Provisioner preflight] DROPLET_IP is required for SSH tunneling but is not set."
    );
  }

  const canonical = (envConfig.provisioner.sshKeyB64() || "").trim();
  if (!canonical) {
    throw new Error(
      "[Provisioner preflight] PROVISIONER_SSH_KEY_B64 is required and canonical. Set a single-line base64 OpenSSH private key in environment-level secrets."
    );
  }

  const decoded = decodeProvisionerSshKeyB64(canonical);
  if (!decoded || !hasPrivateKeyEnvelope(decoded)) {
    throw new Error(
      "[Provisioner preflight] PROVISIONER_SSH_KEY_B64 is invalid. Expected single-line base64 for a full OpenSSH private key."
    );
  }

  const parseError = validateWithSsh2ParseKey(decoded);
  if (parseError) {
    throw new Error(
      `[Provisioner preflight] PROVISIONER_SSH_KEY_B64 failed ssh2 parseKey validation: ${parseError.message}`
    );
  }
}

export function getProvisionerSshKeyOrThrow(): {
  dropletIp: string;
  privateKey: string;
  source: "PROVISIONER_SSH_KEY_B64" | "PROVISIONER_SSH_KEY";
} {
  const resolved = resolveProvisionerSshConfig();
  if (!resolved.dropletIp) {
    throw new Error("DROPLET_IP not configured");
  }
  if (!resolved.privateKey || !resolved.source) {
    throw new Error(
      "Provisioner SSH key missing. Set canonical PROVISIONER_SSH_KEY_B64 (preferred) or PROVISIONER_SSH_KEY."
    );
  }

  const parseError = validateWithSsh2ParseKey(resolved.privateKey);
  if (parseError) {
    throw new Error(
      `${resolved.source} failed ssh2 parseKey validation: ${parseError.message}`
    );
  }

  return {
    dropletIp: resolved.dropletIp,
    privateKey: resolved.privateKey,
    source: resolved.source,
  };
}
