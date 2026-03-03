import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authenticateUser } from "@/lib/api-auth";
import {
  addSupermemoryPoolKey,
  listSupermemoryPoolKeys,
  setSupermemoryPoolKeyActive,
} from "@/lib/supermemory-key-pool";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let admin: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!admin) admin = createClient(supabaseUrl, supabaseServiceKey);
  return admin;
}

async function assertPlatformOwner() {
  const auth = await authenticateUser();
  if (!auth) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const db = getAdmin();
  const { data: membership } = await db
    .from("account_members")
    .select("role")
    .eq("user_id", auth.userId)
    .eq("role", "owner")
    .limit(1)
    .maybeSingle();

  if (!membership) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { ok: true as const, auth };
}

/**
 * GET /api/admin/supermemory-keys
 * Lists key pool entries with masked key display + availability stats.
 */
export async function GET() {
  const guard = await assertPlatformOwner();
  if (!guard.ok) return guard.response;

  try {
    const data = await listSupermemoryPoolKeys();
    return NextResponse.json(data);
  } catch (err: any) {
    console.error("[Admin Supermemory Keys] GET error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to list key pool" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/supermemory-keys
 * Adds a key to the pool.
 */
export async function POST(req: NextRequest) {
  const guard = await assertPlatformOwner();
  if (!guard.ok) return guard.response;

  try {
    const body = await req.json();
    const apiKey = typeof body.apiKey === "string" ? body.apiKey : "";
    const label = typeof body.label === "string" ? body.label : null;
    if (!apiKey.trim()) {
      return NextResponse.json(
        { error: "apiKey is required" },
        { status: 400 }
      );
    }

    const key = await addSupermemoryPoolKey({ apiKey, label });
    return NextResponse.json({ key }, { status: 201 });
  } catch (err: any) {
    console.error("[Admin Supermemory Keys] POST error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to add key" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/supermemory-keys
 * Updates active state (activate/deactivate) for a pool key.
 */
export async function PATCH(req: NextRequest) {
  const guard = await assertPlatformOwner();
  if (!guard.ok) return guard.response;

  try {
    const body = await req.json();
    const keyId = typeof body.keyId === "string" ? body.keyId : "";
    const isActive = body.isActive;
    if (!keyId || typeof isActive !== "boolean") {
      return NextResponse.json(
        { error: "keyId and isActive are required" },
        { status: 400 }
      );
    }

    await setSupermemoryPoolKeyActive({ keyId, isActive });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[Admin Supermemory Keys] PATCH error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to update key state" },
      { status: 500 }
    );
  }
}
