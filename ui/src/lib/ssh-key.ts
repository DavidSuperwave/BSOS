const KEY_HEADER_RE = /-----BEGIN ([A-Z0-9 ]+PRIVATE KEY)-----/;
const KEY_FOOTER_RE = /-----END ([A-Z0-9 ]+PRIVATE KEY)-----/;
const BASE64_PAYLOAD_RE = /^[A-Za-z0-9+/=\s]+$/;

function normalizeLineEndings(value: string): string {
  return value
    .replace(/\\u000d/gi, "\n")
    .replace(/\\u000a/gi, "\n")
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

function unwrapStringValue(value: string): string {
  let current = value.trim();
  for (let i = 0; i < 3; i++) {
    const before = current;
    const first = current[0];
    const last = current[current.length - 1];

    if (first === '"' && last === '"') {
      try {
        const parsed = JSON.parse(current);
        current = typeof parsed === "string" ? parsed : current.slice(1, -1);
      } catch {
        current = current.slice(1, -1);
      }
    } else if (first === "'" && last === "'") {
      current = current.slice(1, -1);
    }

    current = current.trim();
    if (current === before) break;
  }
  return current;
}

function chunkBy64(value: string): string {
  const chunks = value.match(/.{1,64}/g);
  return chunks ? chunks.join("\n") : value;
}

function wrapOpenSshBody(base64Body: string): string {
  const begin = ["-----BEGIN", "OPENSSH", "PRIVATE", "KEY-----"].join(" ");
  const end = ["-----END", "OPENSSH", "PRIVATE", "KEY-----"].join(" ");
  return [
    begin,
    chunkBy64(base64Body),
    end,
  ].join("\n");
}

function decodeBase64IfNeeded(value: string): string {
  const compact = value.replace(/\s+/g, "");
  if (
    compact.length < 64 ||
    compact.length % 4 !== 0 ||
    !BASE64_PAYLOAD_RE.test(compact)
  ) {
    return value;
  }

  try {
    const decoded = Buffer.from(compact, "base64");
    if (decoded.length === 0) return value;

    const decodedText = decoded.toString("utf8").trim();
    if (KEY_HEADER_RE.test(decodedText) && KEY_FOOTER_RE.test(decodedText)) {
      return decodedText;
    }

    // OpenSSH private key body without BEGIN/END markers.
    if (decoded.subarray(0, 14).toString("utf8") === "openssh-key-v1") {
      return wrapOpenSshBody(compact);
    }
  } catch {
    // Keep original; validation step will provide a descriptive error.
  }

  return value;
}

function shapeSummary(value: string): string {
  const trimmed = value.trim();
  return [
    `length=${trimmed.length}`,
    `startsWithQuote=${/^\s*["']/.test(trimmed)}`,
    `hasBeginMarker=${/BEGIN [A-Z0-9 ]*PRIVATE KEY/.test(trimmed)}`,
    `hasEndMarker=${/END [A-Z0-9 ]*PRIVATE KEY/.test(trimmed)}`,
    `hasEscapedNewlines=${trimmed.includes("\\n")}`,
    `hasActualNewlines=${trimmed.includes("\n")}`,
  ].join(", ");
}

function invalidProvisionerKey(reason: string, rawValue: string): Error {
  return new Error(
    `Invalid PROVISIONER_SSH_KEY: ${reason}. Expected a complete private key with matching BEGIN/END markers. ` +
      `Supported input formats: raw multiline PEM/OpenSSH key, quoted value, JSON-string escaped newlines, or base64-encoded full PEM key. ` +
      `Detected value shape: ${shapeSummary(rawValue)}.`
  );
}

export function normalizeProvisionerSshKey(rawValue: string | null | undefined): string {
  if (!rawValue || rawValue.trim().length === 0) {
    throw new Error(
      "PROVISIONER_SSH_KEY is not configured. Provide the full private key (including BEGIN/END markers)."
    );
  }

  const original = rawValue;
  let normalized = unwrapStringValue(rawValue);
  normalized = normalizeLineEndings(normalized).trim();
  normalized = decodeBase64IfNeeded(normalized);
  normalized = normalizeLineEndings(unwrapStringValue(normalized)).trim();

  const headerMatch = normalized.match(KEY_HEADER_RE);
  const footerMatch = normalized.match(KEY_FOOTER_RE);

  if (!headerMatch && !footerMatch) {
    throw invalidProvisionerKey("missing BEGIN/END private key markers", original);
  }
  if (headerMatch && !footerMatch) {
    throw invalidProvisionerKey(
      "BEGIN marker found but END marker is missing (value appears truncated)",
      original
    );
  }
  if (!headerMatch && footerMatch) {
    throw invalidProvisionerKey("END marker found without BEGIN marker", original);
  }
  if (!headerMatch || !footerMatch) {
    throw invalidProvisionerKey("key markers are incomplete", original);
  }

  const keyTypeStart = headerMatch[1];
  const keyTypeEnd = footerMatch[1];
  if (keyTypeStart !== keyTypeEnd) {
    throw invalidProvisionerKey(
      `mismatched key markers (BEGIN ${keyTypeStart}, END ${keyTypeEnd})`,
      original
    );
  }

  const beginLine = `-----BEGIN ${keyTypeStart}-----`;
  const endLine = `-----END ${keyTypeEnd}-----`;
  const beginIndex = normalized.indexOf(beginLine);
  const endIndex = normalized.indexOf(endLine);

  if (beginIndex < 0 || endIndex < 0 || endIndex <= beginIndex) {
    throw invalidProvisionerKey("unable to parse key boundaries", original);
  }

  const body = normalized
    .slice(beginIndex + beginLine.length, endIndex)
    .replace(/\s+/g, "");

  if (body.length < 64) {
    throw invalidProvisionerKey("private key body is too short (value appears truncated)", original);
  }

  return `${beginLine}\n${chunkBy64(body)}\n${endLine}\n`;
}
