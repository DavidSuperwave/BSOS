"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // Ensure account exists (self-healing for users whose signup account-setup
    // call failed, or who were created before account-setup was introduced)
    try {
      const { data: { user: loggedInUser } } = await supabase.auth.getUser();
      if (loggedInUser) {
        await fetch("/api/auth/account-setup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: loggedInUser.id,
            email: loggedInUser.email,
            name: loggedInUser.user_metadata?.name,
          }),
        });
      }
    } catch {
      // Non-blocking — companies route has safety net
    }

    router.push("/");
    router.refresh();
  };

  const handleGoogleLogin = async () => {
    setError(null);
    setGoogleLoading(true);
    const supabase = createClient();

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback?next=/`,
      },
    });

    if (error) {
      setError(error.message);
      setGoogleLoading(false);
      return;
    }

    if (data?.url) {
      window.location.assign(data.url);
      return;
    }

    setGoogleLoading(false);
  };

  return (
    <div className="w-full min-h-screen">
      <div className="grid min-h-screen bg-white md:grid-cols-2">
        <div className="relative hidden min-h-screen border-r border-[#e5e7eb] bg-white md:block">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,_rgba(255,0,0,0.5),_transparent_42%),radial-gradient(circle_at_85%_100%,_rgba(255,69,0,0.55),_transparent_50%),linear-gradient(145deg,_#ffffff_0%,_#ffffff_100%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(135deg,transparent_30%,rgba(0,0,0,0.03)_100%)]" />
          <div className="relative flex h-full flex-col justify-between p-12 text-[#111111]">
            <p className="text-xl font-semibold tracking-tight">Blitzscale OS</p>
            <div className="space-y-2">
              <p className="text-[34px] font-semibold leading-[1.1] tracking-[-0.02em]">
                Build your pipeline faster.
              </p>
              <p className="max-w-[300px] text-sm text-[#4b5563]">
                Bring campaigns, leads, and inboxing workflows into one focused workspace.
              </p>
            </div>
          </div>
        </div>

        <div className="relative flex min-h-screen items-center justify-center px-6 py-10 md:px-12">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_85%,_rgba(255,0,0,0.22),_transparent_42%),radial-gradient(circle_at_85%_0%,_rgba(255,69,0,0.25),_transparent_50%),linear-gradient(145deg,_#ffffff_0%,_#ffffff_100%)]" />
          <div className="relative w-full max-w-[500px] space-y-6 rounded-[28px] border border-white/35 bg-white/25 p-8 shadow-[0_12px_32px_rgba(0,0,0,0.08)] backdrop-blur-[18px]">
            <div className="space-y-2 text-center">
              <p className="text-sm font-medium text-[#6b7280]">Welcome back</p>
              <h1 className="text-[38px] font-semibold leading-[1.1] tracking-[-0.02em] text-[#111111]">
                Log in to Blitzscale OS
              </h1>
            </div>

            <Button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading || googleLoading}
              variant="outline"
              className="h-[50px] w-full rounded-xl border border-[#d4d4d8] bg-white/80 text-sm font-semibold text-[#111111] hover:bg-white"
            >
              {googleLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <span
                    aria-hidden
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white text-[13px] font-bold text-black"
                  >
                    G
                  </span>
                  Continue with Google
                </>
              )}
            </Button>

            <div className="flex items-center gap-4 text-xs font-semibold uppercase tracking-[0.16em] text-[#6b7280]">
              <div className="h-px flex-1 bg-[#d4d4d8]" />
              <span>or</span>
              <div className="h-px flex-1 bg-[#d4d4d8]" />
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <Input
                id="email"
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                disabled={googleLoading || loading}
                className="h-[50px] rounded-xl border-[#d4d4d8] bg-white/85 px-4 text-sm text-[#111111] placeholder:text-[#9ca3af] focus-visible:ring-2 focus-visible:ring-[#ff4500]/30 focus-visible:ring-offset-0"
              />

              <div className="space-y-2">
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={googleLoading || loading}
                    className="h-[50px] rounded-xl border-[#d4d4d8] bg-white/85 px-4 pr-12 text-sm text-[#111111] placeholder:text-[#9ca3af] focus-visible:ring-2 focus-visible:ring-[#ff4500]/30 focus-visible:ring-offset-0"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-[#6b7280] transition-colors hover:text-[#111111]"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <div className="flex justify-end">
                  <Link
                    href="/forgot-password"
                    className="text-xs text-[#6b7280] transition-colors hover:text-[#111111]"
                  >
                    Forgot password?
                  </Link>
                </div>
              </div>

              {error && <p className="text-sm text-red-400">{error}</p>}

              <Button
                type="submit"
                className="h-[48px] w-full rounded-xl bg-white text-sm font-bold text-black hover:bg-white/90"
                disabled={loading || googleLoading}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    Log in <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </form>

            <p className="text-center text-sm text-[#6b7280]">
              Don&apos;t have an account?{" "}
              <Link href="/signup" className="font-medium text-[#111111]">
                Sign up
              </Link>
            </p>

            <p className="text-center text-xs text-[#6b7280]">
              By continuing, you agree to our Terms and Privacy Policy
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
