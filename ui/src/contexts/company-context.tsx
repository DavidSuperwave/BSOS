"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { AUTH_SIGN_OUT_EVENT, useAuth } from "./auth-context";

export interface Company {
  id: string;
  name: string;
  slug: string;
  domain?: string;
  industry?: string;
  status: string;
  agent_status?: string;
  settings?: Record<string, any>;
  created_at?: string;
}

interface CompanyContextValue {
  companies: Company[];
  selectedCompany: Company | null;
  setSelectedCompany: (company: Company) => void;
  isLoading: boolean;
  hasResolvedCompanyFetch: boolean;
  refresh: () => Promise<void>;
}

const STORAGE_KEY = "blitzscale:selected_company_id";
const isReadyCompanyStatus = (status?: string | null) =>
  status === "active" || status === "onboarded";

const devLog = (...args: unknown[]) => {
  if (process.env.NODE_ENV === "development") {
    console.debug("[CompanyContext]", ...args);
  }
};

const CompanyContext = createContext<CompanyContextValue | null>(null);

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const userId = user?.id ?? null;
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompany, setSelectedCompanyState] = useState<Company | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(true);
  const [hasResolvedCompanyFetch, setHasResolvedCompanyFetch] = useState(false);
  const selectedCompanyRef = useRef<Company | null>(null);
  const signOutClearRef = useRef(false);

  const fetchCompanies = useCallback(async () => {
    if (!userId) {
      // Preserve current selection during transient auth flickers.
      if (signOutClearRef.current) {
        setCompanies([]);
        setSelectedCompanyState(null);
      }
      setHasResolvedCompanyFetch(false);
      setIsLoading(false);
      devLog("Skipping company fetch because user is null", {
        clearedBySignOut: signOutClearRef.current,
      });
      return;
    }

    setHasResolvedCompanyFetch(false);

    try {
      // Prevent stale cached responses during auth/session transitions.
      const res = await fetch("/api/companies", {
        cache: "no-store",
        credentials: "include",
      });
      if (!res.ok) {
        devLog("Company fetch returned non-ok response", { status: res.status });
        return;
      }
      signOutClearRef.current = false;
      const data = await res.json();
      const list: Company[] = data.companies || [];
      setHasResolvedCompanyFetch(true);
      setCompanies(list);

      const previousSelection = selectedCompanyRef.current;
      const savedId =
        typeof window !== "undefined"
          ? localStorage.getItem(STORAGE_KEY)
          : null;
      const saved = savedId ? list.find((c) => c.id === savedId) : null;
      const fromCurrentSelection = previousSelection
        ? list.find((c) => c.id === previousSelection.id)
        : null;
      const firstReadyCompany =
        list.find((c) => isReadyCompanyStatus(c.status)) || null;
      const savedPreferred =
        saved &&
        (isReadyCompanyStatus(saved.status) || !firstReadyCompany)
          ? saved
          : null;
      const fromCurrentPreferred =
        fromCurrentSelection &&
        (isReadyCompanyStatus(fromCurrentSelection.status) || !firstReadyCompany)
          ? fromCurrentSelection
          : null;
      const resolvedSelection =
        savedPreferred ||
        fromCurrentPreferred ||
        firstReadyCompany ||
        list[0] ||
        previousSelection ||
        null;

      // Only clear selection if a successful fetch confirms zero companies.
      if (list.length === 0) {
        setSelectedCompanyState(null);
        if (typeof window !== "undefined") {
          localStorage.removeItem(STORAGE_KEY);
        }
        devLog("Fetched zero companies, clearing selection");
      } else {
        setSelectedCompanyState(resolvedSelection);
        if (typeof window !== "undefined" && resolvedSelection?.id) {
          localStorage.setItem(STORAGE_KEY, resolvedSelection.id);
        }
        devLog("Resolved selection after fetch", {
          companies: list.length,
          savedId,
          resolvedId: resolvedSelection?.id ?? null,
        });
      }
    } catch {
      // Keep previous selection/companies if API fails.
      devLog("Company fetch threw an error; preserving previous selection");
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    void fetchCompanies();
  }, [fetchCompanies, userId]);

  useEffect(() => {
    const isAuthRoute =
      pathname.startsWith("/login") ||
      pathname.startsWith("/signup") ||
      pathname.startsWith("/admin-login") ||
      pathname.startsWith("/forgot-password") ||
      pathname.startsWith("/reset-password");
    const isOnboardingRoute = pathname.startsWith("/onboarding");
    const isAdminRoute = pathname.startsWith("/admin");

    if (authLoading || isLoading) return;
    if (!userId || !hasResolvedCompanyFetch) return;
    // Admin routes should never be blocked by company onboarding redirects.
    if (isAuthRoute || isOnboardingRoute || isAdminRoute) return;

    // No companies at all \u2192 send to fresh onboarding
    if (companies.length === 0) {
      if (selectedCompany && isReadyCompanyStatus(selectedCompany.status)) {
        devLog("Skipping onboarding redirect with retained ready selection", {
          selectedCompanyId: selectedCompany.id,
          selectedStatus: selectedCompany.status,
        });
        return;
      }
      router.replace("/onboarding");
      devLog("Redirecting user without companies to onboarding", { userId });
      return;
    }

    // Has companies but none are fully onboarded \u2192 resume onboarding
    const hasReadyCompany = companies.some((c) => isReadyCompanyStatus(c.status));
    if (hasReadyCompany) {
      const firstReadyCompany = companies.find((c) => isReadyCompanyStatus(c.status));
      if (
        firstReadyCompany &&
        selectedCompany &&
        !isReadyCompanyStatus(selectedCompany.status)
      ) {
        setSelectedCompanyState(firstReadyCompany);
        selectedCompanyRef.current = firstReadyCompany;
        if (typeof window !== "undefined") {
          localStorage.setItem(STORAGE_KEY, firstReadyCompany.id);
        }
        devLog("Auto-switched selection to active company", {
          previousSelectedId: selectedCompany.id,
          nextSelectedId: firstReadyCompany.id,
        });
      }
      return;
    }

    if (!hasReadyCompany) {
      const partial = companies[0];
      router.replace(`/onboarding?companyId=${partial.id}`);
      devLog("Redirecting user with incomplete onboarding", {
        userId,
        companyId: partial.id,
        status: partial.status,
      });
    }
  }, [
    authLoading,
    companies,
    hasResolvedCompanyFetch,
    isLoading,
    pathname,
    router,
    selectedCompany,
    userId,
  ]);

  useEffect(() => {
    selectedCompanyRef.current = selectedCompany;
  }, [selectedCompany]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleSignOut = () => {
      signOutClearRef.current = true;
      setCompanies([]);
      setSelectedCompanyState(null);
      setHasResolvedCompanyFetch(false);
      setIsLoading(false);
      localStorage.removeItem(STORAGE_KEY);
      devLog("Received explicit sign-out signal; cleared company state");
    };
    window.addEventListener(AUTH_SIGN_OUT_EVENT, handleSignOut);
    return () => {
      window.removeEventListener(AUTH_SIGN_OUT_EVENT, handleSignOut);
    };
  }, []);

  const setSelectedCompany = useCallback((company: Company) => {
    setSelectedCompanyState(company);
    selectedCompanyRef.current = company;
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, company.id);
    }
    devLog("User selected company", { companyId: company.id });
  }, []);

  const contextValue = useMemo(
    () => ({
      companies,
      selectedCompany,
      setSelectedCompany,
      isLoading: isLoading || authLoading || (Boolean(userId) && !hasResolvedCompanyFetch),
      hasResolvedCompanyFetch,
      refresh: fetchCompanies,
    }),
    [
      companies,
      selectedCompany,
      setSelectedCompany,
      isLoading,
      authLoading,
      userId,
      hasResolvedCompanyFetch,
      fetchCompanies,
    ]
  );

  return (
    <CompanyContext.Provider value={contextValue}>
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  const ctx = useContext(CompanyContext);
  if (!ctx) throw new Error("useCompany must be used within CompanyProvider");
  return ctx;
}
