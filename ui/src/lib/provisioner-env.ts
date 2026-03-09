import { existsSync, readFileSync } from "fs";
import path from "path";
import { envConfig } from "./env";

const PROVISIONER_ENV_SEARCH_PATHS = [
  ".env.local",
  ".env",
  path.join("..", ".env.local"),
  path.join("..", ".env"),
];

const parsedEnvFileCache = new Map<string, Map<string, string>>();

function indexOfUnescapedQuote(value: string, quote: '"' | "'"): number {
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== quote) continue;
    let backslashes = 0;
    for (let cursor = index - 1; cursor >= 0 && value[cursor] === "\\"; cursor -= 1) {
      backslashes += 1;
    }
    if (backslashes % 2 === 0) return index;
  }
  return -1;
}

function parseEnvFile(content: string): Map<string, string> {
  const values = new Map<string, string>();
  const normalized = content
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  const lines = normalized.split("\n");

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    let line = lines[lineIndex].trimStart();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("export ")) {
      line = line.slice("export ".length).trimStart();
    }

    const equalsIndex = line.indexOf("=");
    if (equalsIndex <= 0) continue;

    const key = line.slice(0, equalsIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    let rawValue = line.slice(equalsIndex + 1);
    if (!rawValue) {
      values.set(key, "");
      continue;
    }

    const quote = rawValue[0];
    if (quote === '"' || quote === "'") {
      let chunk = rawValue.slice(1);
      const fragments: string[] = [];
      while (true) {
        const quoteIndex = indexOfUnescapedQuote(chunk, quote);
        if (quoteIndex >= 0) {
          fragments.push(chunk.slice(0, quoteIndex));
          break;
        }
        fragments.push(chunk);
        lineIndex += 1;
        if (lineIndex >= lines.length) break;
        chunk = lines[lineIndex];
      }
      values.set(key, fragments.join("\n"));
      continue;
    }

    const inlineCommentIndex = rawValue.indexOf(" #");
    if (inlineCommentIndex >= 0) {
      rawValue = rawValue.slice(0, inlineCommentIndex);
    }
    values.set(key, rawValue.trim());
  }

  return values;
}

function readEnvFile(absolutePath: string): Map<string, string> {
  if (parsedEnvFileCache.has(absolutePath)) {
    return parsedEnvFileCache.get(absolutePath)!;
  }

  if (!existsSync(absolutePath)) {
    const empty = new Map<string, string>();
    parsedEnvFileCache.set(absolutePath, empty);
    return empty;
  }

  const parsed = parseEnvFile(readFileSync(absolutePath, "utf8"));
  parsedEnvFileCache.set(absolutePath, parsed);
  return parsed;
}

export function getProvisionerEnvValue(key: string): string | null {
  const fromProcess = process.env[key];
  if (typeof fromProcess === "string" && fromProcess.length > 0) {
    return fromProcess;
  }

  for (const relativePath of PROVISIONER_ENV_SEARCH_PATHS) {
    const absolutePath = path.resolve(process.cwd(), relativePath);
    const fromFile = readEnvFile(absolutePath).get(key);
    if (typeof fromFile === "string" && fromFile.length > 0) {
      return fromFile;
    }
  }

  return null;
}

export function normalizeSshPrivateKey(rawKey: string): string {
  let key = String(rawKey || "").trim();
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1);
  }

  key = key.replace(/\\n/g, "\n").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const beginMatch = key.match(/-----BEGIN [A-Z ]+PRIVATE KEY-----/);
  const endMatch = key.match(/-----END [A-Z ]+PRIVATE KEY-----/);
  if (!beginMatch || !endMatch) return key;

  const begin = beginMatch[0];
  const end = endMatch[0];
  const bodyStart = key.indexOf(begin) + begin.length;
  const bodyEnd = key.lastIndexOf(end);
  if (bodyStart < begin.length || bodyEnd <= bodyStart) return key;

  const body = key
    .slice(bodyStart, bodyEnd)
    .split("\n")
    .map((line) => line.trim().replace(/\s+/g, ""))
    .filter(Boolean)
    .join("\n");

  return `${begin}\n${body}\n${end}`;
}

function hasCompletePrivateKey(value: string): boolean {
  return (
    value.includes("-----BEGIN") &&
    value.includes("PRIVATE KEY-----") &&
    value.includes("-----END") &&
    value.length > 200
  );
}

function decodeSshKeyFromBase64(rawValue: string): string | null {
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
    const decoded = Buffer.from(value, "base64").toString("utf8");
    const normalized = normalizeSshPrivateKey(decoded);
    return hasCompletePrivateKey(normalized) ? normalized : null;
  } catch {
    return null;
  }
}

let cachedProvisionerSshKey: string | null | undefined;

export function resolveProvisionerSshKey(): string | null {
  if (cachedProvisionerSshKey !== undefined) {
    return cachedProvisionerSshKey;
  }

  const fromB64 = decodeSshKeyFromBase64(
    envConfig.provisioner.sshKeyB64() ||
      getProvisionerEnvValue("PROVISIONER_SSH_KEY_B64") ||
      ""
  );
  if (fromB64) {
    cachedProvisionerSshKey = fromB64;
    return cachedProvisionerSshKey;
  }

  const fromRaw = normalizeSshPrivateKey(
    envConfig.provisioner.sshKey() ||
      getProvisionerEnvValue("PROVISIONER_SSH_KEY") ||
      ""
  );
  cachedProvisionerSshKey = hasCompletePrivateKey(fromRaw) ? fromRaw : null;
  return cachedProvisionerSshKey;
}

export function resolveProvisionerDropletIp(): string | null {
  return envConfig.provisioner.dropletIp() || getProvisionerEnvValue("DROPLET_IP");
}
