import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let adminClient: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!adminClient) adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

/**
 * POST /api/auth/account-setup
 * Called after signup. Creates account + account_members row.
 * Idempotent: skips if account already exists for this user.
 */
export async function POST(req: NextRequest) {
  try {
    const { userId, email, name } = await req.json();

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 }
      );
    }

    const admin = getAdmin();

    // Check if user already has an account
    const { data: existing } = await admin
      .from("account_members")
      .select("id")
      .eq("user_id", userId)
      .limit(1)
      .single();

    if (existing) {
      return NextResponse.json({ message: "Account already exists" });
    }

    // Create account
    const accountName = name
      ? `${name}'s Account`
      : email
        ? `${email.split("@")[0]}'s Account`
        : "My Account";

    const { data: account, error: accountError } = await admin
      .from("accounts")
      .insert({
        name: accountName,
        owner_user_id: userId,
      })
      .select()
      .single();

    if (accountError) {
      console.error("[Account Setup] Failed to create account:", accountError);
      return NextResponse.json(
        { error: "Failed to create account" },
        { status: 500 }
      );
    }

    // Create account membership (owner)
    const { error: memberError } = await admin
      .from("account_members")
      .insert({
        account_id: account.id,
        user_id: userId,
        role: "owner",
        accepted_at: new Date().toISOString(),
      });

    if (memberError) {
      console.error("[Account Setup] Failed to create membership:", memberError);
      // Attempt cleanup
      await admin.from("accounts").delete().eq("id", account.id);
      return NextResponse.json(
        { error: "Failed to create account membership" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { account: { id: account.id, name: account.name } },
      { status: 201 }
    );
  } catch (err: any) {
    console.error("[Account Setup] Error:", err);
    return NextResponse.json(
      { error: err.message || "Internal error" },
      { status: 500 }
    );
  }
}
