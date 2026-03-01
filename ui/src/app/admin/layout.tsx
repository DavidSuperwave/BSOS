"use client";

import { useAuth } from "@/contexts/auth-context";
import { useApiData } from "@/lib/hooks";
import { Shield, AlertTriangle } from "lucide-react";

interface AdminLayoutProps {
  children: React.ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const { user } = useAuth();
  const { data, isLoading } = useApiData<{ authorized: boolean }>(
    user ? "/api/admin/metrics" : null
  );

  // While loading, show a minimal loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // If user gets 403 or no data, show access denied
  if (!data && !isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <AlertTriangle className="h-10 w-10 text-destructive mx-auto" />
          <h1 className="text-lg font-semibold text-foreground">Access Denied</h1>
          <p className="text-sm text-muted-foreground">
            This page is restricted to platform owners.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Admin header bar */}
      <div className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-3">
          <Shield className="h-5 w-5 text-primary" />
          <span className="text-sm font-semibold text-foreground">Platform Admin</span>
          <span className="text-xs text-muted-foreground ml-auto">
            Direct-URL access only
          </span>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-6 py-6">
        {children}
      </div>
    </div>
  );
}
