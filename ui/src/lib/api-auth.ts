/**
 * API Route Authentication Helpers
 *
 * Provides user authentication and company ownership verification
 * for API routes. Uses Supabase SSR cookies for user identity
 * and service-role client for ownership checks.
 *
 * Usage:
 *   const auth = await authenticateUser();
 *   if (!auth) return unauthorized();
 *
 *   const access = await verifyCompanyAccess(auth.userId, companyId);
 *   if (!access) return forbidden();
 */

import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { headers } from "next/headers";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let adminClient: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!adminClient) adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

export interface AuthResult {
  userId: string;
  email: string | undefined;
}

export interface CompanyAccessResult {
  companyId: string;
  accountId: string;
  role: string;
}

/**
 * Authenticate the current user from Supabase SSR cookies.
 * Returns null if not authenticated.
 */
export async function authenticateUser(): Promise<AuthResult | null> {
  const reqHeaders = headers();
  const authHeader = reqHeaders?.get("authorization") || "";
  const hasBearer = /^Bearer\s+/i.test(authHeader);
  const bearerToken = hasBearer ? authHeader.replace(/^Bearer\s+/i, "").trim() : "";

  const tryBearerAuth = async (): Promise<AuthResult | null> => {
    if (!bearerToken) return null;
    const { data, error } = await getAdmin().auth.getUser(bearerToken);
    if (!data?.user || error) return null;
    return {
      userId: data.user.id,
      email: data.user.email,
    };
  };

  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return await tryBearerAuth();
    }

    return {
      userId: user.id,
      email: user.email,
    };
  } catch {
    return await tryBearerAuth();
  }
}

/**
 * Verify that a user has access to a specific company.
 * Checks the account_members → companies ownership chain.
 * Falls back to legacy user_id ownership for migration support.
 */
export async function verifyCompanyAccess(
  userId: string,
  companyId: string
): Promise<CompanyAccessResult | null> {
  const admin = getAdmin();

  // Get user's account memberships
  const { data: memberships } = await admin
    .from("account_members")
    .select("account_id, role")
    .eq("user_id", userId);

  if (memberships && memberships.length > 0) {
    const accountIds = memberships.map((m: any) => m.account_id);

    // Check if the company belongs to any of the user's accounts
    const { data: company } = await admin
      .from("companies")
      .select("id, account_id")
      .eq("id", companyId)
      .in("account_id", accountIds)
      .single();

    if (company) {
      const membership = memberships.find(
        (m: any) => m.account_id === company.account_id
      );
      return {
        companyId: company.id,
        accountId: company.account_id,
        role: membership?.role || "member",
      };
    }
  }

  // Fallback: check legacy user_id-based ownership
  const { data: legacyCompany } = await admin
    .from("companies")
    .select("id")
    .eq("id", companyId)
    .eq("user_id", userId)
    .single();

  if (legacyCompany) {
    return {
      companyId: legacyCompany.id,
      accountId: "",
      role: "owner",
    };
  }

  return null;
}

/**
 * Combined auth check: authenticate user + verify company access.
 * Returns auth + access info, or an error response to return immediately.
 */
export async function requireCompanyAccess(
  companyId: string
): Promise<
  | { auth: AuthResult; access: CompanyAccessResult; error?: never }
  | { error: NextResponse; auth?: never; access?: never }
> {
  const auth = await authenticateUser();
  if (!auth) {
    return {
      error: NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      ),
    };
  }

  const access = await verifyCompanyAccess(auth.userId, companyId);
  if (!access) {
    return {
      error: NextResponse.json(
        { error: "You do not have access to this company" },
        { status: 403 }
      ),
    };
  }

  return { auth, access };
}
