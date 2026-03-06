"use client";

import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { Zap } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useCompany } from "@/contexts/company-context";

interface AuthGateProps {
  children: ReactNode;
}

/** Routes that should bypass all loading / onboarding gates. */
const AUTH_ROUTES = ["/login", "/signup", "/forgot-password", "/reset-password", "/admin-login"];

export function AuthGate({ children }: AuthGateProps) {
  const pathname = usePathname();
  const { user, isLoading: authLoading } = useAuth();
  const {
    companies,
    selectedCompany,
    isLoading: companyLoading,
    hasResolvedCompanyFetch,
    refresh,
  } = useCompany();
  const emptyRetryRef = useRef(false);

  const isAuthRoute = AUTH_ROUTES.some((route) => pathname.startsWith(route));
  const isOnboardingRoute = pathname.startsWith("/onboarding");
  const isAdminRoute = pathname.startsWith("/admin") && !pathname.startsWith("/admin-login");

  // Auth routes, onboarding, and admin routes skip all guards
  if (isAuthRoute || isOnboardingRoute || isAdminRoute) {
    return <>{children}</>;
  }

  // While auth or company data is resolving, show a loading spinner
  if (authLoading || companyLoading || (user && !hasResolvedCompanyFetch)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-info">
            <Zap className="h-8 w-8 text-primary-foreground" />
          </div>
          <div className="h-2 w-32 overflow-hidden rounded-full bg-muted">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-primary/70" />
          </div>
          <p className="text-sm text-muted-foreground">Loading workspace...</p>
        </div>
      </div>
    );
  }

  // If a logged-in user has no companies OR all their companies are still
  // mid-onboarding (onboarding_step < 5 and status is not "active"),
  // block rendering and redirect to /onboarding.
  // This prevents any dashboard flash for users who haven't finished setup.
  if (user && !companyLoading && hasResolvedCompanyFetch) {
    const hasReadySelectedCompany =
      selectedCompany?.status === "active" || selectedCompany?.status === "onboarded";

    if (companies.length === 0 && !emptyRetryRef.current) {
      emptyRetryRef.current = true;
      void refresh();
      return (
        <div className="flex min-h-screen items-center justify-center bg-background">
          <div className="flex flex-col items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-info">
              <Zap className="h-8 w-8 text-primary-foreground" />
            </div>
            <div className="h-2 w-32 overflow-hidden rounded-full bg-muted">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-primary/70" />
            </div>
            <p className="text-sm text-muted-foreground">Loading workspace...</p>
          </div>
        </div>
      );
    }

    if (companies.length > 0) {
      emptyRetryRef.current = false;
    }

    const hasReadyCompany = hasReadySelectedCompany || companies.some(
      (c) => c.status === "active" || c.status === "onboarded"
    );

    if ((companies.length === 0 && !hasReadySelectedCompany) || !hasReadyCompany) {
      // Find a partially-created company to resume, or go fresh
      const partial = companies.find(
        (c) => c.status !== "active" && c.status !== "onboarded"
      );
      const target = partial
        ? `/onboarding?companyId=${partial.id}`
        : "/onboarding";

      // Return the loading spinner while the redirect happens to avoid a flash
      return (
        <OnboardingRedirect target={target} />
      );
    }
  }

  return <>{children}</>;
}

/** Small helper that fires a redirect once and shows the spinner while navigating. */
function OnboardingRedirect({ target }: { target: string }) {
  const router = useRouter();
  const fired = useRef(false);

  useEffect(() => {
    if (!fired.current) {
      fired.current = true;
      router.replace(target);
    }
  }, [router, target]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-info">
          <Zap className="h-8 w-8 text-primary-foreground" />
        </div>
        <div className="h-2 w-32 overflow-hidden rounded-full bg-muted">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-primary/70" />
        </div>
        <p className="text-sm text-muted-foreground">
          Setting up your workspace...
        </p>
      </div>
    </div>
  );
}
