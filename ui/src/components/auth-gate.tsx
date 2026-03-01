"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Zap } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useCompany } from "@/contexts/company-context";

interface AuthGateProps {
  children: ReactNode;
}

const AUTH_ROUTES = ["/login", "/signup"];

export function AuthGate({ children }: AuthGateProps) {
  const pathname = usePathname();
  const { isLoading: authLoading } = useAuth();
  const { isLoading: companyLoading } = useCompany();

  const isAuthRoute = AUTH_ROUTES.some((route) => pathname.startsWith(route));
  const isOnboardingRoute = pathname.startsWith("/onboarding");

  if (isAuthRoute || isOnboardingRoute) {
    return <>{children}</>;
  }

  if (authLoading || companyLoading) {
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

  return <>{children}</>;
}
