#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { utils } = require("ssh2");

const ENV_SEARCH_PATHS = [
  ".env.local",
  ".env",
  path.join("..", ".env.local"),
  path.join("..", ".env"),
];

function indexOfUnescapedQuote(value, quote) {
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

function parseEnvFile(content) {
  const values = new Map();
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
      const fragments = [];
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

function readEnvFile(absolutePath) {
  if (!fs.existsSync(absolutePath)) return new Map();
  return parseEnvFile(fs.readFileSync(absolutePath, "utf8"));
}

function getEnvValueWithSource(key) {
  const fromProcess = process.env[key];
  if (typeof fromProcess === "string" && fromProcess.length > 0) {
    return { value: fromProcess, source: "process.env" };
  }

  for (const relativePath of ENV_SEARCH_PATHS) {
    const absolutePath = path.resolve(process.cwd(), relativePath);
    const fromFile = readEnvFile(absolutePath).get(key);
    if (typeof fromFile === "string" && fromFile.length > 0) {
      return { value: fromFile, source: absolutePath };
    }
  }

  return { value: null, source: null };
}

function normalizeSshPrivateKey(rawKey) {
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

function hasCompletePrivateKey(value) {
  return (
    value.includes("-----BEGIN") &&
    value.includes("PRIVATE KEY-----") &&
    value.includes("-----END") &&
    value.length > 200
  );
}

function decodeSshKeyFromBase64(rawValue) {
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

function parseKeyErrorMessage(parsed) {
  if (Array.isArray(parsed)) {
    const first = parsed[0];
    return first instanceof Error ? first.message : null;
  }
  return parsed instanceof Error ? parsed.message : null;
}

function main() {
  const droplet = getEnvValueWithSource("DROPLET_IP");
  const keyB64 = getEnvValueWithSource("PROVISIONER_SSH_KEY_B64");
  const keyRaw = getEnvValueWithSource("PROVISIONER_SSH_KEY");

  const decodedB64 = decodeSshKeyFromBase64(keyB64.value || "");
  const normalizedRaw = normalizeSshPrivateKey(keyRaw.value || "");
  const key = decodedB64 || (hasCompletePrivateKey(normalizedRaw) ? normalizedRaw : null);
  const keySource = decodedB64 ? keyB64.source : keyRaw.source;

  if (!droplet.value) {
    console.error("❌ DROPLET_IP is missing.");
    process.exit(1);
  }
  console.log(`✅ DROPLET_IP resolved from ${droplet.source}`);

  if (!key) {
    console.error("❌ Provisioner SSH key is missing or incomplete.");
    process.exit(1);
  }
  console.log(`✅ SSH key resolved from ${keySource}`);

  const parsed = utils.parseKey(key);
  const parseError = parseKeyErrorMessage(parsed);
  if (parseError) {
    console.error(`❌ SSH key parse failed: ${parseError}`);
    process.exit(1);
  }

  console.log("✅ SSH key parse validation passed.");
}

main();
