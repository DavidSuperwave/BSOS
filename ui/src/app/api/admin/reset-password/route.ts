import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * POST /api/admin/reset-password
 * Reset password for admin@superwave.io
 * SECURITY: This should be removed or secured after use!
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, newPassword } = body;

    if (!email || !newPassword) {
      return NextResponse.json(
        { error: "email and newPassword are required" },
        { status: 400 }
      );
    }

    // Only allow resetting admin@superwave.io for security
    if (email !== "admin@superwave.io") {
      return NextResponse.json(
        { error: "Only admin@superwave.io can be reset via this endpoint" },
        { status: 403 }
      );
    }

    const admin = createClient(supabaseUrl, supabaseServiceKey);

    // Get user by email
    const { data: users, error: listError } = await admin.auth.admin.listUsers();
    if (listError) throw listError;

    const user = users?.users?.find((u) => u.email === email);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Update password using admin API
    const { data, error } = await admin.auth.admin.updateUserById(user.id, {
      password: newPassword,
    });

    if (error) {
      return NextResponse.json(
        { error: error.message || "Failed to reset password" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Password reset successfully for ${email}`,
      user_id: user.id,
    });
  } catch (error: any) {
    console.error("[Admin Reset Password] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to reset password" },
      { status: 500 }
    );
  }
}
