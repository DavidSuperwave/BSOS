"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { buildAuthCallbackUrl } from "@/lib/auth-url";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { data: signupData, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: buildAuthCallbackUrl("/onboarding"),
        data: { name },
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // Auto-create account for the new user — must complete before redirect
    // so middleware can detect the account_members row and route to /onboarding
    if (signupData.user) {
      try {
        let setupRes = await fetch("/api/auth/account-setup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: signupData.user.id,
            email,
            name,
          }),
        });

        if (!setupRes.ok) {
          setupRes = await fetch("/api/auth/account-setup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId: signupData.user.id,
              email,
              name,
            }),
          });

          if (!setupRes.ok) {
            console.error("[Signup] account-setup failed after retry", {
              status: setupRes.status,
            });
          }
        }
      } catch (err) {
        console.error("[Signup] account-setup request failed", err);
      }
    }

    // Redirect to onboarding directly since we know the user has no companies yet
    router.push("/onboarding");
    router.refresh();
  };

  const handleGoogleSignup = async () => {
    setError(null);
    setGoogleLoading(true);

    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: buildAuthCallbackUrl("/onboarding"),
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
      <div className="grid min-h-screen bg-[#080808] md:grid-cols-2">
        <div className="relative hidden min-h-screen border-r border-[#171717] bg-[#050505] md:block">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,_rgba(99,102,241,0.22),_transparent_40%),radial-gradient(circle_at_85%_100%,_rgba(59,130,246,0.12),_transparent_50%),linear-gradient(145deg,_#0b0b0d_0%,_#050505_100%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(135deg,transparent_32%,rgba(255,255,255,0.03)_100%)]" />
          <div className="relative flex h-full flex-col justify-between p-12 text-white">
            <p className="text-xl font-semibold tracking-tight">Blitzscale OS</p>
            <div className="space-y-2">
              <p className="text-[34px] font-semibold leading-[1.1] tracking-[-0.02em]">
                Build your pipeline faster.
              </p>
              <p className="max-w-[300px] text-sm text-[#9ca3af]">
                Bring campaigns, leads, and inboxing workflows into one focused workspace.
              </p>
            </div>
          </div>
        </div>

        <div className="relative flex min-h-screen items-center justify-center px-6 py-10 md:px-12">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.06),_transparent_55%)]" />
          <div className="relative w-full max-w-[500px] space-y-6">
            <div className="space-y-2 text-center">
              <p className="text-sm font-medium text-[#6b7280]">Sign up for free</p>
              <h1 className="text-[38px] font-semibold leading-[1.1] tracking-[-0.02em] text-white">
                Join Blitzscale OS
              </h1>
            </div>

            <Button
              type="button"
              onClick={handleGoogleSignup}
              disabled={loading || googleLoading}
              variant="outline"
              className="h-[50px] w-full rounded-xl border border-[#262626] bg-[#111] text-sm font-semibold text-[#e5e7eb] hover:bg-[#171717]"
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
                  Sign up with Google
                </>
              )}
            </Button>

            <div className="flex items-center gap-4 text-xs font-semibold uppercase tracking-[0.16em] text-[#404040]">
              <div className="h-px flex-1 bg-[#262626]" />
              <span>or</span>
              <div className="h-px flex-1 bg-[#262626]" />
            </div>

            <form onSubmit={handleSignup} className="space-y-4">
              <Input
                id="name"
                type="text"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={googleLoading || loading}
                className="h-[50px] rounded-xl border-[#262626] bg-[#111] px-4 text-sm text-white placeholder:text-[#9ca3af] focus-visible:ring-2 focus-visible:ring-white/25 focus-visible:ring-offset-0"
              />

              <Input
                id="email"
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={googleLoading || loading}
                className="h-[50px] rounded-xl border-[#262626] bg-[#111] px-4 text-sm text-white placeholder:text-[#9ca3af] focus-visible:ring-2 focus-visible:ring-white/25 focus-visible:ring-offset-0"
              />

              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Password (min 6 characters)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  disabled={googleLoading || loading}
                  className="h-[50px] rounded-xl border-[#262626] bg-[#111] px-4 pr-12 text-sm text-white placeholder:text-[#9ca3af] focus-visible:ring-2 focus-visible:ring-white/25 focus-visible:ring-offset-0"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[#6b7280] transition-colors hover:text-[#d4d4d8]"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
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
                    Start Building <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </form>

            <p className="text-center text-sm text-[#6b7280]">
              Already have an account?{" "}
              <Link href="/login" className="font-medium text-white">
                Log in
              </Link>
            </p>

            <p className="text-center text-xs text-[#404040]">
              By continuing, you agree to our Terms and Privacy Policy
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
