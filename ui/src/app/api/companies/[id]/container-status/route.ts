import { NextRequest, NextResponse } from "next/server";
import { requireCompanyAccess } from "@/lib/api-auth";
import { createClient } from "@supabase/supabase-js";
import { sshExec } from "@/lib/ssh";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let adminClient: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!adminClient) adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

/**
 * Check if a container is running by SSHing to the droplet.
 * Returns true if container exists and is running.
 */
async function checkContainerHealth(
  containerName: string
): Promise<boolean> {
  try {
    const result = await sshExec([
      `docker inspect --format='{{.State.Running}}' ${containerName}`,
    ]);
    return result.stdout.trim() === "true";
  } catch {
    return false;
  }
}

/**
 * GET /api/companies/[id]/container-status
 * Returns the current container status for a company.
 * Used for polling during provisioning and health monitoring.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: companyId } = await params;

  const result = await requireCompanyAccess(companyId);
  if (result.error) return result.error;

  const admin = getAdmin();

  const { data: company, error } = await admin
    .from("companies")
    .select(
      "container_name, container_port, container_status, container_url, provisioned_at, last_health_check"
    )
    .eq("id", companyId)
    .single();

  if (error || !company) {
    return NextResponse.json(
      { error: "Company not found" },
      { status: 404 }
    );
  }

  // If container is running, do a live health check via SSH
  let healthy: boolean | null = null;
  if (company.container_status === "running" && company.container_name) {
    healthy = await checkContainerHealth(company.container_name);

    // Update last_health_check
    await admin
      .from("companies")
      .update({ last_health_check: new Date().toISOString() })
      .eq("id", companyId);

    // If health check fails, mark as error
    if (!healthy) {
      await admin
        .from("companies")
        .update({ container_status: "error" })
        .eq("id", companyId);
    }
  }

  return NextResponse.json({
    status: healthy === false ? "error" : company.container_status,
    container_name: company.container_name,
    container_port: company.container_port,
    container_url: company.container_url,
    provisioned_at: company.provisioned_at,
    last_health_check: company.last_health_check,
    healthy,
  });
}
