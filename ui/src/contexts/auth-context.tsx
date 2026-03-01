"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

interface Account {
  id: string;
  name: string;
  plan: string;
}

interface AuthState {
  user: User | null;
  account: Account | null;
  isLoading: boolean;
}

interface AuthContextValue extends AuthState {
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
export const AUTH_SIGN_OUT_EVENT = "blitzscale:auth:signout";

const devLog = (...args: unknown[]) => {
  if (process.env.NODE_ENV === "development") {
    console.debug("[AuthContext]", ...args);
  }
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    account: null,
    isLoading: true,
  });

  useEffect(() => {
    const supabase = createClient();
    let isMounted = true;

    const hydrateFromSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!isMounted) return;

      const user = session?.user ?? null;
      devLog("Initial getSession result", { userId: user?.id ?? null });
      if (user) {
        setState((s) => ({
          user,
          account: s.user?.id === user.id ? s.account : null,
          isLoading: false,
        }));
        void loadAccount(user.id, supabase);
      } else {
        setState({ user: null, account: null, isLoading: false });
      }
    };

    const validateUserInBackground = async () => {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (!isMounted) return;

      if (error || !user) {
        setState({ user: null, account: null, isLoading: false });
        devLog("Background getUser invalid/expired", {
          hasError: Boolean(error),
        });
        return;
      }

      setState((s) => ({
        user,
        account: s.user?.id === user.id ? s.account : null,
        isLoading: false,
      }));
      void loadAccount(user.id, supabase);
      devLog("Background getUser validated", { userId: user.id });
    };

    void hydrateFromSession().finally(() => {
      void validateUserInBackground();
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      devLog("Auth state changed", { event: _event, userId: user?.id ?? null });
      if (user) {
        setState((s) => ({
          user,
          account: s.user?.id === user.id ? s.account : null,
          isLoading: false,
        }));
        void loadAccount(user.id, supabase);
      } else {
        setState({ user: null, account: null, isLoading: false });
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const loadAccount = async (userId: string, supabase = createClient()) => {
    try {
      const { data: membership } = await supabase
        .from("account_members")
        .select("account_id, accounts(id, name, plan)")
        .eq("user_id", userId)
        .limit(1)
        .single();

      if (membership?.accounts) {
        const acct = membership.accounts as unknown as Account;
        setState((s) => {
          if (s.user?.id !== userId) return s;
          return {
            ...s,
            account: { id: acct.id, name: acct.name, plan: acct.plan },
            isLoading: false,
          };
        });
        devLog("Account loaded", { userId, accountId: acct.id });
      } else {
        // User has no account yet (new signup, pre-provisioning)
        setState((s) => {
          if (s.user?.id !== userId) return s;
          return { ...s, account: null, isLoading: false };
        });
        devLog("No account membership found", { userId });
      }
    } catch {
      setState((s) => {
        if (s.user?.id !== userId) return s;
        return { ...s, account: null, isLoading: false };
      });
      devLog("Account load failed", { userId });
    }
  };

  const signOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setState({ user: null, account: null, isLoading: false });
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(AUTH_SIGN_OUT_EVENT));
    }
    devLog("Explicit sign out completed");
  };

  return (
    <AuthContext.Provider value={{ ...state, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
