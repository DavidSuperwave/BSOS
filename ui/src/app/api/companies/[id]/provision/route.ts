import { NextRequest, NextResponse } from "next/server";
import { requireCompanyAccess } from "@/lib/api-auth";
import { envConfig } from "@/lib/env";
import { createClient } from "@supabase/supabase-js";
import { generateWorkspace } from "@/lib/agent-provisioning";
import { sshExec } from "@/lib/ssh";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let adminClient: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!adminClient) adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

/**
 * Allocate the next available port by scanning existing companies.
 * Range: 18790-18850 (61 ports max).
 */
async function allocatePort(): Promise<number | null> {
  const admin = getAdmin();
  const start = envConfig.provisioner.portRangeStart();
  const end = envConfig.provisioner.portRangeEnd();

  const { data: companies } = await admin
    .from("companies")
    .select("container_port")
    .not("container_port", "is", null)
    .order("container_port", { ascending: true });

  const usedPorts = new Set(
    (companies || []).map((c: any) => c.container_port)
  );

  for (let port = start; port <= end; port++) {
    if (!usedPorts.has(port)) return port;
  }

  return null;
}

/**
 * Generate docker-compose.yml content for a company container.
 * Uses bridge networking (default). External access is handled by
 * a socat+nsenter relay that bridges from host port to the container's
 * loopback 127.0.0.1:18789 (where OpenClaw gateway binds).
 */
function generateDockerCompose(
  company: any,
  port: number,
  image: string
): string {
  const openrouterKey = envConfig.openrouter.apiKey() || "";
  const directAnthropicKey = envConfig.anthropic.apiKey() || "";
  const anthropicKey = directAnthropicKey || openrouterKey;
  const anthropicBaseUrl = directAnthropicKey
    ? envConfig.anthropic.baseUrl() || ""
    : "https://openrouter.ai/api/v1";

  const envVars = [
    `OPENCLAW_GATEWAY_TOKEN=${company.id}`,
    openrouterKey ? `OPENROUTER_API_KEY=${openrouterKey}` : null,
    anthropicKey ? `ANTHROPIC_API_KEY=${anthropicKey}` : null,
    anthropicBaseUrl ? `ANTHROPIC_BASE_URL=${anthropicBaseUrl}` : null,
    `SUPERMEMORY_API_KEY=${envConfig.supermemory.apiKey() || ""}`,
    `SUPERMEMORY_NAMESPACE=blitzscale:company:${company.slug}`,
    `COMPANY_NAME=${company.name}`,
    `COMPANY_SLUG=${company.slug}`,
    company.plusvibe_api_key
      ? `PLUSVIBE_API_KEY=${company.plusvibe_api_key}`
      : null,
    company.plusvibe_workspace_id
      ? `PLUSVIBE_WORKSPACE_ID=${company.plusvibe_workspace_id}`
      : null,
    company.telegram_bot_token
      ? `TELEGRAM_BOT_TOKEN=${company.telegram_bot_token}`
      : null,
    company.telegram_chat_id
      ? `TELEGRAM_CHAT_ID=${company.telegram_chat_id}`
      : null,
    envConfig.close.apiKey()
      ? `CLOSE_API_KEY=${envConfig.close.apiKey()}`
      : null,
    envConfig.perplexity.apiKey()
      ? `PERPLEXITY_API_KEY=${envConfig.perplexity.apiKey()}`
      : null,
    `NODE_OPTIONS=--max-old-space-size=2048`,
  ]
    .filter(Boolean)
    .map((v) => `      - ${v}`)
    .join("\n");

  return `services:
  openclaw:
    image: "${image}"
    container_name: "openclaw-${company.slug}"
    restart: unless-stopped
    environment:
${envVars}
    volumes:
      - openclaw-data:/data
      - ./agents:/data/agents
      - ./openclaw.json:/app/openclaw.json:ro
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

volumes:
  openclaw-data:
`;
}

/**
 * Generate a systemd service unit for socat relay.
 * Uses nsenter to reach into the container's network namespace and
 * relay TCP from host 0.0.0.0:PORT to container 127.0.0.1:18789.
 */
function generateSocatService(containerName: string, hostPort: number): string {
  return `[Unit]
Description=socat relay for ${containerName} (port ${hostPort} -> container 127.0.0.1:18789)
After=docker.service
Requires=docker.service

[Service]
Type=simple
ExecStart=/bin/bash -c 'while true; do PID=$$(docker inspect -f "{{.State.Pid}}" ${containerName} 2>/dev/null); if [ -n "$$PID" ] && [ "$$PID" != "0" ]; then socat TCP-LISTEN:${hostPort},fork,reuseaddr SYSTEM:"nsenter --net=/proc/$$PID/ns/net socat STDIO TCP\\\\\\\\:127.0.0.1\\\\\\\\:18789"; fi; sleep 2; done'
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
`;
}

/**
 * Generate openclaw.json — routes model requests through OpenRouter.
 * Uses Kimi K2.5 as default model via OpenRouter provider.
 */
function generateOpenclawJson(): string {
  return JSON.stringify(
    {
      models: {
        providers: {
          openrouter: {
            baseUrl: "https://openrouter.ai/api/v1",
            models: [],
          },
        },
      },
      auth: {
        profiles: {
          "openrouter:default": {
            provider: "openrouter",
            mode: "api_key",
          },
          "anthropic:default": {
            provider: "anthropic",
            mode: "api_key",
          },
        },
      },
      agents: {
        defaults: {
          model: {
            primary: "openrouter/kimi-coding/k2p5",
            fallbacks: ["anthropic/claude-opus-4-5"]
          }
        }
      }
    },
    null,
    2
  );
}

/**
 * Generate auth-profiles.json — OpenRouter API key for the "openrouter:default" profile.
 * Written via docker exec AFTER container starts (ephemeral path inside container).
 */
function generateAuthProfiles(): string {
  const openrouterKey = envConfig.openrouter.apiKey() || "";
  const directAnthropicKey = envConfig.anthropic.apiKey() || "";
  const anthropicBaseUrl = envConfig.anthropic.baseUrl() || "";

  const profiles: Record<string, Record<string, string>> = {};

  if (openrouterKey) {
    profiles["openrouter:default"] = { apiKey: openrouterKey };
  }

  if (directAnthropicKey) {
    profiles["anthropic:default"] = anthropicBaseUrl
      ? { apiKey: directAnthropicKey, baseUrl: anthropicBaseUrl }
      : { apiKey: directAnthropicKey };
  } else if (openrouterKey) {
    profiles["anthropic:default"] = {
      apiKey: openrouterKey,
      baseUrl: "https://openrouter.ai/api/v1",
    };
  }

  return JSON.stringify(
    {
      profiles,
    },
    null,
    2
  );
}

/**
 * Generate AGENTS.md file content for the company.
 */
function generateAgentsMd(company: any): string {
  const workspace = generateWorkspace(company);
  return workspace.agentsMd;
}

/**
 * POST /api/companies/[id]/provision
 * Provisions a Docker container on the droplet for the given company.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: companyId } = await params;

  // Auth check
  const result = await requireCompanyAccess(companyId);
  if (result.error) return result.error;

  const admin = getAdmin();

  // Fetch company
  const { data: company, error: companyErr } = await admin
    .from("companies")
    .select("*")
    .eq("id", companyId)
    .single();

  if (companyErr || !company) {
    return NextResponse.json(
      { error: "Company not found" },
      { status: 404 }
    );
  }

  // Check if already provisioned or in progress
  if (company.container_status === "running") {
    return NextResponse.json(
      { error: "Container already running", container_url: company.container_url },
      { status: 409 }
    );
  }

  if (company.container_status === "provisioning") {
    return NextResponse.json(
      { error: "Provisioning already in progress" },
      { status: 409 }
    );
  }

  // Allocate port
  const port = await allocatePort();
  if (!port) {
    return NextResponse.json(
      { error: "No available ports. Maximum container capacity reached." },
      { status: 507 }
    );
  }

  const dropletIp = envConfig.provisioner.dropletIp();
  const image = envConfig.provisioner.ghcrImage();
  const containerName = `openclaw-${company.slug}`;
  const containerUrl = `http://${dropletIp}:${port}`;
  const remotePath = `/opt/openclaw/${company.slug}`;

  // Mark as provisioning
  await admin
    .from("companies")
    .update({
      container_status: "provisioning",
      container_name: containerName,
      container_port: port,
      container_url: containerUrl,
    })
    .eq("id", companyId);

  try {
    // Generate files
    const dockerCompose = generateDockerCompose(company, port, image);
    const agentsMd = generateAgentsMd(company);
    const openclawJson = generateOpenclawJson();
    const authProfiles = generateAuthProfiles();
    const socatService = generateSocatService(containerName, port);

    // Base64-encode files to avoid heredoc shell escaping issues
    const dcB64 = Buffer.from(dockerCompose).toString("base64");
    const agentsB64 = Buffer.from(agentsMd).toString("base64");
    const openclawB64 = Buffer.from(openclawJson).toString("base64");
    const authProfilesB64 = Buffer.from(authProfiles).toString("base64");
    const socatB64 = Buffer.from(socatService).toString("base64");
    const socatSvcName = `socat-${containerName}`;

    // Create directory structure on droplet
    await sshExec([
      `mkdir -p ${remotePath}/agents`,
    ]);

    // Write docker-compose.yml (base64 to avoid escaping issues)
    await sshExec([
      `echo '${dcB64}' | base64 -d > ${remotePath}/docker-compose.yml`,
    ]);

    // Write AGENTS.md
    await sshExec([
      `echo '${agentsB64}' | base64 -d > ${remotePath}/agents/AGENTS.md`,
    ]);

    // Write openclaw.json to host (bind-mounted into container as /app/openclaw.json:ro)
    await sshExec([
      `echo '${openclawB64}' | base64 -d > ${remotePath}/openclaw.json`,
    ]);

    // Pull image and start container
    await sshExec([
      `cd ${remotePath}`,
      `docker compose pull`,
      `docker compose up -d`,
    ]);

    // Write auth-profiles.json inside the running container via docker exec.
    // This file lives at /home/node/.openclaw/auth-profiles.json
    // It must be written post-start since the container creates the node user.
    await new Promise((r) => setTimeout(r, 3000)); // Wait for container to initialize
    await sshExec([
      `docker exec ${containerName} sh -c "mkdir -p /home/node/.openclaw"`,
      `docker exec ${containerName} sh -c "echo '${authProfilesB64}' | base64 -d > /home/node/.openclaw/auth-profiles.json"`,
      `docker exec ${containerName} sh -c "chmod 600 /home/node/.openclaw/auth-profiles.json"`,
    ]);

    // Set up socat relay as a systemd service
    // This bridges host 0.0.0.0:PORT → container's 127.0.0.1:18789
    // using nsenter to enter the container's network namespace
    await sshExec([
      `echo '${socatB64}' | base64 -d > /etc/systemd/system/${socatSvcName}.service`,
      `systemctl daemon-reload`,
      `systemctl enable ${socatSvcName}.service`,
      `systemctl restart ${socatSvcName}.service`,
    ]);

    // Health check loop (5 retries, 5s delay)
    // Check via SSH if container is running
    let healthy = false;
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 5000));

      try {
        const result = await sshExec([
          `docker inspect --format='{{.State.Running}}' ${containerName}`,
        ]);
        if (result.stdout.trim() === "true") {
          healthy = true;
          break;
        }
      } catch {
        // Retry
      }
    }

    if (healthy) {
      await admin
        .from("companies")
        .update({
          container_status: "running",
          provisioned_at: new Date().toISOString(),
          last_health_check: new Date().toISOString(),
        })
        .eq("id", companyId);

      return NextResponse.json({
        status: "running",
        container_name: containerName,
        container_port: port,
        container_url: containerUrl,
      });
    } else {
      // Container started but health check failed
      await admin
        .from("companies")
        .update({ container_status: "error" })
        .eq("id", companyId);

      return NextResponse.json(
        {
          status: "error",
          error: "Container started but health check failed after 25 seconds",
          container_name: containerName,
          container_port: port,
        },
        { status: 503 }
      );
    }
  } catch (err: any) {
    // Provisioning failed
    await admin
      .from("companies")
      .update({
        container_status: "error",
      })
      .eq("id", companyId);

    console.error("[Provision] Failed:", err);

    return NextResponse.json(
      {
        status: "error",
        error: err.message || "Provisioning failed",
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/companies/[id]/provision
 * Tears down the container for the given company.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: companyId } = await params;

  const result = await requireCompanyAccess(companyId);
  if (result.error) return result.error;

  const admin = getAdmin();

  const { data: company } = await admin
    .from("companies")
    .select("slug, container_status")
    .eq("id", companyId)
    .single();

  if (!company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  if (company.container_status === "none") {
    return NextResponse.json({ error: "No container to tear down" }, { status: 400 });
  }

  const remotePath = `/opt/openclaw/${company.slug}`;
  const containerName = `openclaw-${company.slug}`;
  const socatSvcName = `socat-${containerName}`;

  try {
    // Stop and remove socat relay service
    await sshExec([
      `systemctl stop ${socatSvcName}.service 2>/dev/null || true`,
      `systemctl disable ${socatSvcName}.service 2>/dev/null || true`,
      `rm -f /etc/systemd/system/${socatSvcName}.service`,
      `systemctl daemon-reload`,
    ]);

    // Stop and remove container
    await sshExec([
      `cd ${remotePath}`,
      `docker compose down -v`,
      `rm -rf ${remotePath}`,
    ]);
  } catch (err: any) {
    console.error("[Provision] Teardown SSH error:", err.message);
    // Continue to update DB even if SSH fails
  }

  await admin
    .from("companies")
    .update({
      container_status: "none",
      container_name: null,
      container_port: null,
      container_url: null,
      provisioned_at: null,
    })
    .eq("id", companyId);

  return NextResponse.json({ status: "removed" });
}
