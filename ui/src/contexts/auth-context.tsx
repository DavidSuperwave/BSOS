"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
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

const isAbortError = (error: unknown): error is Error =>
  error instanceof Error && error.name === "AbortError";

const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    account: null,
    isLoading: true,
  });
  const lastAccountLoadRef = useRef<{
    userId: string | null;
    promise: Promise<void> | null;
  }>({ userId: null, promise: null });

  useEffect(() => {
    const supabase = createClient();
    let isMounted = true;

    const applyUser = (user: User | null) => {
      if (!isMounted) return;

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

    const getSessionWithRetry = async () => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          return await supabase.auth.getSession();
        } catch (error) {
          if (!isAbortError(error) || attempt === 1) {
            throw error;
          }

          devLog("Initial getSession aborted; retrying", { attempt: attempt + 1 });
          await delay(75);
        }
      }

      return await supabase.auth.getSession();
    };

    const hydrateFromSession = async () => {
      try {
        const {
          data: { session },
        } = await getSessionWithRetry();

        const user = session?.user ?? null;
        devLog("Initial getSession result", { userId: user?.id ?? null });
        applyUser(user);
      } catch (error) {
        if (!isMounted) return;
        setState((current) => ({ ...current, isLoading: false }));
        devLog("Initial getSession failed", {
          message: error instanceof Error ? error.message : "unknown-error",
          isAbortError: isAbortError(error),
        });
        return;
      }
    };

    void hydrateFromSession();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      devLog("Auth state changed", { event: _event, userId: user?.id ?? null });
      applyUser(user);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const loadAccount = async (userId: string, supabase = createClient()) => {
    const lastLoad = lastAccountLoadRef.current;
    if (lastLoad.userId === userId && lastLoad.promise) {
      await lastLoad.promise;
      return;
    }

    const loadPromise = (async () => {
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
    })();

    lastAccountLoadRef.current = {
      userId,
      promise: loadPromise,
    };

    try {
      await loadPromise;
    } finally {
      if (lastAccountLoadRef.current.promise === loadPromise) {
        lastAccountLoadRef.current = { userId: null, promise: null };
      }
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
