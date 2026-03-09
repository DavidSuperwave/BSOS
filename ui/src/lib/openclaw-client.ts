import { envConfig } from "./env";
import crypto from "crypto";
import { existsSync, readFileSync } from "fs";
import path from "path";

const GATEWAY_TOKEN = () => process.env.OPENCLAW_GATEWAY_TOKEN || "";
const PROTOCOL_VERSION = 3;
const CLIENT_ID = "gateway-client";
const CLIENT_VERSION = "1.0.0";
const CLIENT_MODE = "backend";
const CLIENT_CAPS = ["tool-events"];
const OPERATOR_ROLE = "operator";
const OPERATOR_SCOPES = ["operator.admin"];

// ============================================
// ED25519 DEVICE AUTH FOR PROTOCOL V3
// ============================================

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
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

function hasCompletePrivateKey(value: string): boolean {
  return (
    value.includes("-----BEGIN") &&
    value.includes("PRIVATE KEY-----") &&
    value.includes("-----END") &&
    value.length > 200
  );
}

function readMultilineEnvValue(
  dotenvPath: string,
  key: string
): string | null {
  if (!existsSync(dotenvPath)) return null;
  const content = readFileSync(dotenvPath, "utf8");
  const marker = `${key}=`;
  const startIndex = content.indexOf(marker);
  if (startIndex < 0) return null;

  let cursor = startIndex + marker.length;
  const quote = content[cursor];
  if (quote !== '"' && quote !== "'") {
    const lineEnd = content.indexOf("\n", cursor);
    return content
      .slice(cursor, lineEnd === -1 ? content.length : lineEnd)
      .trim();
  }

  cursor += 1;
  let value = "";
  while (cursor < content.length) {
    const char = content[cursor];
    if (char === quote) return value;
    value += char;
    cursor += 1;
  }

  return value || null;
}

let cachedProvisionerSshKey: string | null | undefined;

function resolveProvisionerSshKey(): string | null {
  if (cachedProvisionerSshKey !== undefined) {
    return cachedProvisionerSshKey;
  }

  const fromEnv = normalizeSshPrivateKey(envConfig.provisioner.sshKey() || "");
  if (hasCompletePrivateKey(fromEnv)) {
    cachedProvisionerSshKey = fromEnv;
    return cachedProvisionerSshKey;
  }

  // Next.js dotenv parsing truncates multiline quoted values in some local setups.
  // Fall back to parsing `.env.local` manually so local SSH tunnel auth remains reliable.
  const dotenvPath = path.join(process.cwd(), ".env.local");
  const fallback = normalizeSshPrivateKey(
    readMultilineEnvValue(dotenvPath, "PROVISIONER_SSH_KEY") || ""
  );
  cachedProvisionerSshKey = hasCompletePrivateKey(fallback) ? fallback : null;
  return cachedProvisionerSshKey;
}

/**
 * Generate Ed25519 device credentials for OpenClaw protocol v3.
 * Returns a fresh keypair + derived deviceId + publicKey in base64url.
 */
function generateDeviceCredentials() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
  // Extract raw 32-byte public key from SPKI DER encoding (last 32 bytes)
  const pubRaw = publicKey.export({ type: "spki", format: "der" }).slice(-32);
  const deviceId = crypto.createHash("sha256").update(pubRaw).digest("hex");
  const pubB64 = b64url(pubRaw);
  return { privateKey, deviceId, pubB64 };
}

/**
 * Build the OpenClaw protocol v3 device-auth payload.
 */
function buildDeviceAuthPayloadV3(params: {
  deviceId: string;
  token: string;
  nonce: string;
  signedAt: number;
  clientId?: string;
  clientMode?: string;
  role?: string;
  scopes?: string[];
  platform?: string;
  deviceFamily?: string;
}): string {
  return [
    "v3",
    params.deviceId,
    params.clientId || CLIENT_ID,
    params.clientMode || CLIENT_MODE,
    params.role || OPERATOR_ROLE,
    (params.scopes || OPERATOR_SCOPES).join(","),
    String(params.signedAt),
    params.token || "",
    params.nonce,
    params.platform || process.platform,
    params.deviceFamily || "",
  ].join("|");
}

/**
 * Sign the OpenClaw connect challenge with Ed25519.
 */
function signChallenge(
  privateKey: crypto.KeyObject,
  params: {
    deviceId: string;
    token: string;
    nonce: string;
    clientId?: string;
    clientMode?: string;
    role?: string;
    scopes?: string[];
    platform?: string;
    deviceFamily?: string;
  }
): { signature: string; signedAt: number } {
  const signedAt = Date.now();
  const payload = buildDeviceAuthPayloadV3({
    ...params,
    signedAt,
  });
  const sig = crypto.sign(null, Buffer.from(payload), privateKey);
  return { signature: b64url(sig), signedAt };
}

function buildConnectRequest(params: {
  id: string;
  token: string;
  device: {
    id: string;
    publicKey: string;
    signature: string;
    signedAt: number;
    nonce: string;
  };
}): string {
  return JSON.stringify({
    type: "req",
    id: params.id,
    method: "connect",
    params: {
      minProtocol: PROTOCOL_VERSION,
      maxProtocol: PROTOCOL_VERSION,
      client: {
        id: CLIENT_ID,
        displayName: "Blitzscale UI",
        version: CLIENT_VERSION,
        platform: process.platform,
        mode: CLIENT_MODE,
      },
      role: OPERATOR_ROLE,
      scopes: OPERATOR_SCOPES,
      caps: CLIENT_CAPS,
      commands: [],
      permissions: {},
      auth: params.token ? { token: params.token } : undefined,
      device: params.device,
    },
  });
}

// ============================================
// HTTP HOOKS API (existing — for message sending)
// ============================================

/**
 * Send a message to an OpenClaw agent via HTTP hooks.
 * Returns the response text, or null if OpenClaw is unreachable.
 */
export async function sendMessage(
  agentId: string,
  message: string,
  session?: string
): Promise<{
  response: string;
  toolCalls?: any[];
  tokensUsed?: number;
  model?: string;
} | null> {
  const baseUrl = envConfig.openclaw.url();
  const token = envConfig.openclaw.hookToken() || GATEWAY_TOKEN();

  try {
    const res = await fetch(`${baseUrl}/hooks/agent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        message,
        agentId,
        ...(session ? { session } : {}),
      }),
      signal: AbortSignal.timeout(120000),
    });

    if (!res.ok) {
      console.error(`[OpenClaw] Agent ${agentId} returned ${res.status}`);
      return null;
    }

    const data = await res.json();
    return {
      response:
        data.response ||
        data.content ||
        data.choices?.[0]?.message?.content ||
        "",
      toolCalls: data.tool_calls || data.toolCalls,
      tokensUsed: data.usage?.total_tokens,
      model: data.model,
    };
  } catch (err) {
    console.error("[OpenClaw] Failed to reach agent:", err);
    return null;
  }
}

/**
 * Wake an agent with an event (fire-and-forget).
 */
export async function wakeAgent(
  text: string,
  agentId?: string
): Promise<boolean> {
  const baseUrl = envConfig.openclaw.url();
  const token = envConfig.openclaw.hookToken() || GATEWAY_TOKEN();

  try {
    const res = await fetch(`${baseUrl}/hooks/wake`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        text,
        mode: "now",
        ...(agentId ? { agentId } : {}),
      }),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Check if the gateway is healthy.
 */
export async function getAgentStatus(
  agentId: string
): Promise<{ healthy: boolean; error?: string }> {
  const baseUrl = envConfig.openclaw.url();

  try {
    const res = await fetch(`${baseUrl}/healthz`, {
      signal: AbortSignal.timeout(5000),
    });
    return { healthy: res.ok };
  } catch (err: any) {
    return { healthy: false, error: err.message };
  }
}

// ============================================
// WEBSOCKET RPC API (for agent management)
// ============================================

interface RpcRequest {
  type: "req";
  id: string;
  method: string;
  params: Record<string, any>;
}

interface RpcResponse {
  type: "res";
  id: string;
  ok: boolean;
  payload?: any;
  error?: { code: string; message: string };
}

let rpcCounter = 0;

function nextReqId(): string {
  return `req-${++rpcCounter}-${Date.now()}`;
}

/**
 * Execute a single RPC call over a temporary WebSocket connection.
 * Opens a connection, performs the handshake, sends the request,
 * waits for the response, then closes.
 *
 * For server-side use only (API routes, not browser).
 */
async function rpcCall(
  method: string,
  params: Record<string, any>,
  timeoutMs = 30000
): Promise<any> {
  // Dynamic import for server-side WebSocket
  const { default: WebSocket } = await import("ws");

  const baseUrl = envConfig.openclaw.url();
  const token = GATEWAY_TOKEN();
  const wsUrl = baseUrl.replace(/^http/, "ws");

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const reqId = nextReqId();
    const { privateKey, deviceId, pubB64 } = generateDeviceCredentials();
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        ws.close();
        reject(new Error(`RPC timeout for ${method}`));
      }
    }, timeoutMs);

    ws.on("error", (err: Error) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(err);
      }
    });

    ws.on("message", (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString());

        // Handle connect challenge
        if (msg.type === "event" && msg.event === "connect.challenge") {
          const nonce = msg.payload?.nonce;
          if (!nonce) return;
          const { signature, signedAt } = signChallenge(privateKey, {
            deviceId,
            token,
            nonce,
          });
          ws.send(
            buildConnectRequest({
              id: "connect-1",
              token,
              device: {
                id: deviceId,
                publicKey: pubB64,
                signature,
                signedAt,
                nonce,
              },
            })
          );
          return;
        }

        // Handle connect response — now send the actual RPC
        if (
          msg.type === "res" &&
          msg.id === "connect-1" &&
          msg.ok
        ) {
          const request: RpcRequest = {
            type: "req",
            id: reqId,
            method,
            params,
          };
          ws.send(JSON.stringify(request));
          return;
        }

        // Handle our RPC response
        if (msg.type === "res" && msg.id === reqId) {
          settled = true;
          clearTimeout(timer);
          ws.close();

          if (msg.ok) {
            resolve(msg.payload);
          } else {
            reject(
              new Error(
                msg.error?.message || `RPC ${method} failed: ${msg.error?.code}`
              )
            );
          }
        }
      } catch {
        // Ignore parse errors for non-JSON frames
      }
    });

    ws.on("close", () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error("WebSocket closed before response"));
      }
    });
  });
}

// ============================================
// AGENT MANAGEMENT RPC METHODS
// ============================================

export interface CreateAgentParams {
  name: string;
  workspace?: string;
  model?: string;
  emoji?: string;
}

export interface UpdateAgentParams {
  agentId: string;
  name?: string;
  workspace?: string;
  model?: string;
  emoji?: string;
}

/**
 * Create a new agent via WebSocket RPC.
 * Requires operator.admin scope on the gateway.
 */
export async function createAgent(
  params: CreateAgentParams
): Promise<any> {
  return rpcCall("agents.create", params);
}

/**
 * Update an existing agent's configuration.
 */
export async function updateAgent(
  params: UpdateAgentParams
): Promise<any> {
  return rpcCall("agents.update", params);
}

/**
 * Delete an agent and optionally trash its workspace files.
 */
export async function deleteAgent(
  agentId: string,
  deleteFiles = true
): Promise<any> {
  return rpcCall("agents.delete", { agentId, deleteFiles });
}

/**
 * List all configured agents.
 */
export async function listAgents(): Promise<any> {
  return rpcCall("agents.list", {});
}

/**
 * Write a file to an agent's workspace.
 */
export async function setAgentFile(
  agentId: string,
  fileName: string,
  content: string
): Promise<any> {
  return rpcCall("agents.files.set", { agentId, fileName, content });
}

/**
 * Read a file from an agent's workspace.
 */
export async function getAgentFile(
  agentId: string,
  fileName: string
): Promise<any> {
  return rpcCall("agents.files.get", { agentId, fileName });
}

// ============================================
// SSH-TUNNELED WEBSOCKET (for remote containers)
// ============================================

/**
 * Create an SSH-tunneled WebSocket connection to an OpenClaw container.
 *
 * Uses ssh2's forwardOut to create a TCP tunnel from the local machine
 * to 127.0.0.1:PORT on the droplet, then creates a local TCP server
 * that bridges the tunnel, and connects WebSocket through it.
 *
 * Returns { ws, cleanup } — caller is responsible for cleanup.
 */
async function createTunneledWs(
  containerUrl: string
): Promise<{
  ws: InstanceType<typeof import("ws").default>;
  cleanup: () => void;
  localPort: number;
}> {
  const { default: WebSocket } = await import("ws");
  const { Client } = await import("ssh2");
  const net = await import("net");

  const urlObj = new URL(containerUrl);
  const remotePort = parseInt(urlObj.port, 10);
  if (!remotePort) throw new Error(`Invalid container URL: ${containerUrl}`);

  const dropletIp = envConfig.provisioner.dropletIp();
  const sshKey = resolveProvisionerSshKey();
  if (!sshKey) throw new Error("PROVISIONER_SSH_KEY not configured");
  const cleanKey = normalizeSshPrivateKey(sshKey);

  return new Promise((resolve, reject) => {
    const sshConn = new Client();

    sshConn.on("error", (err: Error) => {
      reject(new Error(`SSH error: ${err.message}`));
    });

    sshConn.on("ready", () => {
      // Create a local TCP server that bridges to the SSH tunnel
      const server = net.createServer((localSocket) => {
        sshConn.forwardOut(
          "127.0.0.1",
          0,
          "127.0.0.1",
          remotePort,
          (err, remoteStream) => {
            if (err) {
              localSocket.destroy();
              return;
            }
            localSocket.pipe(remoteStream).pipe(localSocket);
          }
        );
      });

      server.listen(0, "127.0.0.1", () => {
        const localPort = (server.address() as any).port;

        const ws = new WebSocket(`ws://127.0.0.1:${localPort}`);
        // Buffer early frames that may arrive before handshake listeners attach.
        const earlyMessages: Buffer[] = [];
        const earlyMessageHandler = (raw: Buffer | string) => {
          const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw));
          earlyMessages.push(buf);
          if (earlyMessages.length > 32) earlyMessages.shift();
        };
        ws.on("message", earlyMessageHandler);
        (ws as any).__earlyMessages = earlyMessages;
        (ws as any).__removeEarlyMessageHandler = () => {
          try {
            ws.removeListener("message", earlyMessageHandler);
          } catch {
            // Best-effort cleanup
          }
        };

        const cleanup = () => {
          try { ws.close(); } catch {}
          try { server.close(); } catch {}
          try { sshConn.end(); } catch {}
        };

        ws.on("open", () => {
          resolve({ ws, cleanup, localPort });
        });

        ws.on("error", (err: Error) => {
          cleanup();
          reject(new Error(`WebSocket error: ${err.message}`));
        });
      });

      server.on("error", (err: Error) => {
        sshConn.end();
        reject(new Error(`Local bridge error: ${err.message}`));
      });
    });

    sshConn.connect({
      host: dropletIp,
      port: 22,
      username: "root",
      privateKey: cleanKey,
      readyTimeout: 15000,
    });
  });
}

/**
 * Perform OpenClaw WebSocket handshake with Ed25519 protocol v3.
 * Generates a fresh Ed25519 device keypair per connection,
 * signs the challenge nonce, and authenticates.
 */
function performHandshake(
  ws: any,
  token: string
): Promise<void> {
  const { privateKey, deviceId, pubB64 } = generateDeviceCredentials();

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Handshake timeout")), 15000);

    const handler = (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString());

        if (msg.type === "event" && msg.event === "connect.challenge") {
          const nonce = msg.payload?.nonce;
          if (!nonce) {
            clearTimeout(timer);
            ws.removeListener("message", handler);
            return reject(new Error("No nonce in connect.challenge"));
          }

          const { signature, signedAt } = signChallenge(privateKey, {
            deviceId,
            token,
            nonce,
          });

          ws.send(
            buildConnectRequest({
              id: "connect-1",
              token,
              device: {
                id: deviceId,
                publicKey: pubB64,
                signature,
                signedAt,
                nonce,
              },
            })
          );
          return;
        }

        if (msg.type === "res" && msg.id === "connect-1") {
          clearTimeout(timer);
          ws.removeListener("message", handler);
          if (msg.ok) {
            resolve();
          } else {
            reject(new Error(msg.error?.message || "Connect rejected"));
          }
        }
      } catch {
        // Ignore parse errors
      }
    };

    ws.on("message", handler);
    // Drain any frames received between socket open and listener attachment.
    const buffered = (ws as any).__earlyMessages as Buffer[] | undefined;
    if (buffered && buffered.length > 0) {
      for (const raw of buffered) {
        handler(raw);
      }
    }
    (ws as any).__removeEarlyMessageHandler?.();
  });
}

// ============================================
// CHAT VIA RPC
// ============================================

export interface ChatSendParams {
  containerUrl: string;
  token: string;
  message: string;
  agentId?: string;
  sessionKey: string;
  history?: Array<{ role: string; content: string }>;
  systemPrompt?: string;
}

export interface ChatSendResult {
  response: string;
  toolCalls?: any[];
  tokensUsed?: number;
  model?: string;
  sessionId?: string;
}

function formatHistory(
  history: Array<{ role: string; content: string }> | undefined,
  limit = 12
): string {
  if (!Array.isArray(history) || history.length === 0) return "";
  return history
    .slice(-limit)
    .map((entry) => `${String(entry.role || "user").toUpperCase()}: ${String(entry.content || "").slice(0, 1000)}`)
    .join("\n");
}

function buildContextualMessage(params: ChatSendParams): string {
  const baseMessage = String(params.message || "");
  const inlineMode =
    String(process.env.OPENCLAW_CHAT_CONTEXT_MODE || "inline").toLowerCase() !== "native";
  if (!inlineMode) return baseMessage;

  const blocks: string[] = [];
  if (params.agentId) {
    blocks.push(`Agent Target: ${params.agentId}`);
  }
  if (params.systemPrompt) {
    blocks.push(`System Instructions:\n${params.systemPrompt.slice(0, 6000)}`);
  }
  const historyBlock = formatHistory(params.history);
  if (historyBlock) {
    blocks.push(`Conversation History:\n${historyBlock}`);
  }

  if (blocks.length === 0) return baseMessage;

  return [
    "You are receiving contextual routing instructions. Follow them strictly.",
    ...blocks,
    `User Message:\n${baseMessage}`,
  ].join("\n\n");
}

/**
 * Send a chat message to an OpenClaw container via SSH-tunneled WebSocket RPC.
 * Uses the `chat.send` method. Non-streaming — waits for full response.
 */
export async function chatSend(params: ChatSendParams): Promise<ChatSendResult> {
  const { containerUrl, token, sessionKey } = params;
  const contextualMessage = buildContextualMessage(params);

  const { ws, cleanup } = await createTunneledWs(containerUrl);

  try {
    await performHandshake(ws, token);

    const reqId = nextReqId();
    const rpcParams: Record<string, any> = {
      message: contextualMessage,
      sessionKey,
      idempotencyKey: `chat-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    };

    return await new Promise<ChatSendResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("chat.send timeout"));
      }, 120000);

      ws.on("message", (raw: Buffer) => {
        try {
          const msg = JSON.parse(raw.toString());

          if (msg.type === "res" && msg.id === reqId) {
            clearTimeout(timer);
            cleanup();

            if (msg.ok) {
              const p = msg.payload;
              resolve({
                response: p?.content || p?.response || p?.text || "",
                toolCalls: p?.toolCalls || p?.tool_calls,
                tokensUsed: p?.usage?.total_tokens || p?.tokensUsed,
                model: p?.model,
                sessionId: p?.sessionId || p?.sessionKey,
              });
            } else {
              reject(new Error(msg.error?.message || "chat.send failed"));
            }
          }
        } catch {
          // Ignore
        }
      });

      ws.send(
        JSON.stringify({
          type: "req",
          id: reqId,
          method: "chat.send",
          params: rpcParams,
        })
      );
    });
  } catch (err) {
    cleanup();
    throw err;
  }
}

/**
 * Send a chat message and stream responses via SSE.
 * Opens SSH tunnel → WS → handshake → chat.send → stream events.
 */
export async function chatSendStream(params: ChatSendParams): Promise<ReadableStream> {
  const { containerUrl, token, sessionKey } = params;
  const contextualMessage = buildContextualMessage(params);
  const encoder = new TextEncoder();

  // Create tunnel and perform handshake before returning the stream
  const { ws, cleanup } = await createTunneledWs(containerUrl);
  await performHandshake(ws, token);

  const reqId = nextReqId();
  const rpcParams: Record<string, any> = {
    message: contextualMessage,
    sessionKey,
    idempotencyKey: `chat-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  };

  return new ReadableStream({
    start(controller) {
      let settled = false;
      let fullContent = "";
      let lastChatText = "";
      let lastAgentText = "";
      let lastReasoningText = "";
      let sawChatEvent = false;
      let reasoningOpen = false;
      let contentSource: "chat" | "agent" | null = null;

      const shouldEmitContentFrom = (source: "chat" | "agent") => {
        // If chat events are present, do not also append assistant deltas from agent events.
        if (
          source === "agent" &&
          contentSource === null &&
          sawChatEvent
        ) {
          return false;
        }
        if (!contentSource) {
          contentSource = source;
          return true;
        }
        return contentSource === source;
      };

      const emitEvent = (event: Record<string, any>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      const emitContentDelta = (delta: string, source: "chat" | "agent") => {
        if (!delta) return;
        if (!shouldEmitContentFrom(source)) return;
        fullContent += delta;
        emitEvent({ type: "content", delta });
      };

      const emitReasoningStart = () => {
        if (reasoningOpen) return;
        reasoningOpen = true;
        emitEvent({ type: "reasoning-start" });
      };

      const emitReasoningDelta = (delta: string) => {
        if (!delta) return;
        emitReasoningStart();
        emitEvent({ type: "reasoning-delta", delta });
      };

      const emitReasoningEnd = () => {
        if (!reasoningOpen) return;
        reasoningOpen = false;
        emitEvent({ type: "reasoning-end" });
      };

      const timer = setTimeout(() => {
        if (!settled) {
          emitError("Timeout");
        }
      }, 120000);

      const finish = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          cleanup();
        }
      };

      const emitDone = (sessionId: string | null = null) => {
        if (settled) return;
        emitReasoningEnd();
        emitEvent({ type: "done", sessionId });
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        finish();
        controller.close();
      };

      const emitError = (error: string) => {
        if (settled) return;
        emitReasoningEnd();
        emitEvent({ type: "error", error });
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        finish();
        controller.close();
      };

      ws.on("message", (raw: Buffer) => {
        if (settled) return;
        try {
          const msg = JSON.parse(raw.toString());

          // Handle streaming chat events
          if (msg.type === "event" && msg.event === "chat") {
            sawChatEvent = true;
            const p = msg.payload;

            if (p?.type === "reasoning-start") {
              emitReasoningStart();
            }
            if (p?.type === "reasoning-delta" && typeof p?.delta === "string") {
              emitReasoningDelta(p.delta);
            }
            if (p?.type === "reasoning-end") {
              const tail =
                typeof p?.delta === "string"
                  ? p.delta
                  : typeof p?.content === "string"
                    ? p.content
                    : "";
              if (tail) emitReasoningDelta(tail);
              emitReasoningEnd();
            }

            if (p?.type === "text-delta" && typeof p?.delta === "string") {
              emitContentDelta(p.delta, "chat");
            }

            if (p?.type === "tool-input-start") {
              emitEvent({
                type: "tool-input-start",
                toolCallId: p?.toolCallId || p?.tool_call_id || p?.id || undefined,
                toolName: p?.toolName || p?.tool || p?.name || "Tool",
              });
            }
            if (p?.type === "tool-input-available") {
              emitEvent({
                type: "tool-input-available",
                toolCallId: p?.toolCallId || p?.tool_call_id || p?.id || undefined,
                toolName: p?.toolName || p?.tool || p?.name || "Tool",
                input: p?.input,
              });
            }
            if (p?.type === "tool-output-available") {
              emitEvent({
                type: "tool-output-available",
                toolCallId: p?.toolCallId || p?.tool_call_id || p?.id || undefined,
                toolName: p?.toolName || p?.tool || p?.name || "Tool",
                output: p?.output,
              });
            }
            if (p?.type === "tool-output-error") {
              emitEvent({
                type: "tool-output-error",
                toolCallId: p?.toolCallId || p?.tool_call_id || p?.id || undefined,
                toolName: p?.toolName || p?.tool || p?.name || "Tool",
                errorText: p?.errorText || p?.error || "Tool failed",
              });
            }

            if (p?.type === "tool_call" || p?.type === "tool") {
              emitEvent({ type: "tool", tool: [p] });
            }

            // Keep content emission mutually exclusive so one payload cannot append twice.
            // Order preserved for compatibility: legacy type delta -> state delta -> state final.
            if (p?.type === "delta" && p?.delta) {
              emitContentDelta(p.delta, "chat");
              lastChatText = fullContent;
            } else if (p?.state === "delta") {
              // Newer OpenClaw payload shape:
              // { state: "delta" | "final" | "error", message: { content: [{ type: "text", text }] } }
              const chunkText =
                p?.message?.content?.find?.((c: any) => c?.type === "text")?.text ||
                "";
              let delta = chunkText;
              if (chunkText && lastChatText && chunkText.startsWith(lastChatText)) {
                delta = chunkText.slice(lastChatText.length);
              }
              if (delta) {
                emitContentDelta(delta, "chat");
              }
              if (chunkText) lastChatText = chunkText;
            } else if (p?.state === "final") {
              const finalText =
                p?.message?.content?.find?.((c: any) => c?.type === "text")?.text ||
                "";
              if (finalText) {
                let delta = finalText;
                if (lastChatText && finalText.startsWith(lastChatText)) {
                  delta = finalText.slice(lastChatText.length);
                }
                if (delta) {
                  emitContentDelta(delta, "chat");
                }
                lastChatText = finalText;
              }
              emitDone(p?.sessionId || p?.sessionKey || null);
              return;
            }

            if (p?.state === "error") {
              emitError(p?.errorMessage || "chat.send failed");
              return;
            }

            if (p?.type === "done" || p?.type === "complete") {
              emitDone(p.sessionId || p.sessionKey || null);
              return;
            }
          }

          // Some OpenClaw versions primarily stream through "agent" events.
          if (msg.type === "event" && msg.event === "agent") {
            const p = msg.payload;
            if (p?.stream === "assistant") {
              const deltaFromPayload = p?.data?.delta || "";
              const textFromPayload = p?.data?.text || "";
              let delta = deltaFromPayload;

              if (!delta && textFromPayload) {
                delta =
                  lastAgentText && textFromPayload.startsWith(lastAgentText)
                    ? textFromPayload.slice(lastAgentText.length)
                    : textFromPayload;
              }

              if (delta) {
                emitContentDelta(delta, "agent");
              }

              if (textFromPayload) {
                lastAgentText = textFromPayload;
              }
            }

            if (p?.stream === "thinking" || p?.stream === "reasoning") {
              const phase = p?.data?.phase;
              const deltaFromPayload =
                typeof p?.data?.delta === "string" ? p.data.delta : "";
              const textFromPayload =
                typeof p?.data?.text === "string"
                  ? p.data.text
                  : typeof p?.data?.content === "string"
                    ? p.data.content
                    : "";
              let delta = deltaFromPayload;

              if (!delta && textFromPayload) {
                delta =
                  lastReasoningText && textFromPayload.startsWith(lastReasoningText)
                    ? textFromPayload.slice(lastReasoningText.length)
                    : textFromPayload;
              }
              if (delta) {
                emitReasoningDelta(delta);
              }
              if (textFromPayload) {
                lastReasoningText = textFromPayload;
              }
              if (phase === "end" || phase === "final") {
                emitReasoningEnd();
              }
            }

            if (p?.stream === "tool") {
              const phase = p?.data?.phase;
              const toolCallId =
                p?.data?.toolCallId || p?.data?.tool_call_id || p?.data?.id || undefined;
              const toolName = p?.data?.name || p?.data?.tool || "Tool";
              if (phase === "start") {
                emitEvent({
                  type: "tool-input-start",
                  toolCallId,
                  toolName,
                });
              } else if (phase === "update") {
                emitEvent({
                  type: "tool-input-available",
                  toolCallId,
                  toolName,
                  input: p?.data?.args || p?.data?.input || {},
                });
                emitEvent({
                  type: "tool.started",
                  toolCallId,
                  tool: toolName,
                });
              } else if (phase === "result") {
                const isError = Boolean(p?.data?.isError);
                if (isError) {
                  emitEvent({
                    type: "tool-output-error",
                    toolCallId,
                    toolName,
                    errorText:
                      p?.data?.error ||
                      p?.data?.errorText ||
                      "Tool execution failed",
                  });
                } else {
                  emitEvent({
                    type: "tool-output-available",
                    toolCallId,
                    toolName,
                    output: p?.data?.result || p?.data?.output || {},
                  });
                }
              }
            }

            if (p?.stream === "lifecycle") {
              const phase = p?.data?.phase;
              if (phase === "error") {
                emitError(p?.data?.error || "agent lifecycle error");
                return;
              }
              // When no chat events are emitted, lifecycle end is our completion signal.
              if (phase === "end" && !sawChatEvent) {
                emitDone(p?.sessionKey || null);
                return;
              }
            }
          }

          // Handle RPC response. In newer protocol versions, this often returns
          // { runId, status: "started" } immediately and real content follows as events.
          if (msg.type === "res" && msg.id === reqId) {
            if (!msg.ok) {
              emitError(msg.error?.message || "chat.send failed");
              return;
            }

            const p = msg.payload || {};
            const content = p?.content || p?.response || p?.text || "";
            const startedOnly = p?.status === "started" || (p?.runId && !content);
            if (startedOnly) {
              return;
            }

            if (content && !fullContent) {
              emitContentDelta(content, "chat");
            }
            emitDone(p?.sessionId || p?.sessionKey || null);
          }
        } catch {
          // Ignore parse errors
        }
      });

      ws.on("close", () => {
        if (!settled) {
          emitDone(null);
        }
      });

      ws.on("error", (err: Error) => {
        if (!settled) {
          emitError(err.message);
        }
      });

      // Send chat.send only after stream listeners are attached so we don't
      // miss early "started"/delta/final frames from fast responses.
      ws.send(
        JSON.stringify({
          type: "req",
          id: reqId,
          method: "chat.send",
          params: rpcParams,
        })
      );
    },
  });
}
