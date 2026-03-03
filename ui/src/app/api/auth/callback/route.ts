import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * Auth callback route — handles Supabase token exchange for:
 * - Password reset links (type=recovery)
 * - Email confirmation links (type=signup)
 * - Magic links
 *
 * Supabase sends the user here with a `code` query param.
 * We exchange it for a session, then redirect to `next` (or `/`).
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Redirect to the intended destination (e.g. /reset-password)
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // If code exchange failed or no code, redirect to an error indication
  // on the forgot-password page
  return NextResponse.redirect(
    `${origin}/forgot-password?error=invalid_link`
  );
}
