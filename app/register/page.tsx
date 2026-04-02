"use client";

import Link from "next/link";
import { useState } from "react";
import { signIn } from "next-auth/react";

import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import { Label }    from "@/components/ui/label";

import { registerAction } from "@/app/actions/auth";

import { getSafeInternalCallbackUrl } from "@/lib/auth-callback-url";
import { Eye, EyeOff } from "lucide-react";

export default function RegisterPage() {
  const [showPassword, setShowPassword]           = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    const email = ((fd.get("email") as string) ?? "").trim().toLowerCase();
    const password = (fd.get("password") as string) ?? "";

    setIsPending(true);
    try {
      const created = await registerAction(null, fd);
      if (!created.success) {
        setError(created.error);
        return;
      }

      const afterLogin = getSafeInternalCallbackUrl("/");
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
        callbackUrl: afterLogin,
      });

      if (result?.error) {
        setError("Account created but sign-in failed. Please sign in manually.");
        return;
      }

      if (result?.ok) {
        if (result.url) {
          try {
            const u = new URL(result.url, window.location.origin);
            if (u.origin === window.location.origin) {
              window.location.assign(`${u.pathname}${u.search}${u.hash}`);
              return;
            }
          } catch {
            /* fall through */
          }
        }
        window.location.assign(afterLogin);
        return;
      }

      setError("Something went wrong. Please try signing in.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950 px-4">
      <div className="w-full max-w-[400px] flex flex-col items-center">
        <div className="w-full space-y-2 mb-10 text-left">
          <h1 className="text-4xl font-black text-[#0c1421] tracking-tight">Create account</h1>
          <p className="text-sm font-medium text-slate-500 leading-relaxed max-w-[280px]">
            Fill in the details below to join the vault.
          </p>
        </div>

        <div className="w-full bg-white border border-slate-100 rounded-2xl p-8 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.08)]">
          <form onSubmit={handleSubmit} className="space-y-6">

            {/* Full name */}
            <div className="space-y-2.5">
              <Label htmlFor="name" className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Full Name</Label>
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors">
                  <svg className="size-4" viewBox="0 0 16 16" fill="none" aria-hidden strokeWidth="2.5" stroke="currentColor">
                    <circle cx="8" cy="5" r="3" />
                    <path d="M2 14c0-3.314 2.686-5 6-5s6 1.686 6 5" strokeLinecap="round" />
                  </svg>
                </div>
                <Input
                  id="name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  placeholder="Jane Smith"
                  required
                  disabled={isPending}
                  className="h-12 pl-11 bg-slate-100 border-transparent rounded-xl focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-blue-500/10 focus-visible:border-slate-200 transition-all text-sm font-medium"
                />
              </div>
            </div>

            {/* Email */}
            <div className="space-y-2.5">
              <Label htmlFor="email" className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Email Address</Label>
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors">
                  <svg className="size-4" viewBox="0 0 16 16" fill="none" aria-hidden strokeWidth="2.5" stroke="currentColor">
                    <rect x="1" y="3" width="14" height="10" rx="2" />
                    <path d="M1 5l7 5 7-5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  required
                  disabled={isPending}
                  className="h-12 pl-11 bg-slate-100 border-transparent rounded-xl focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-blue-500/10 focus-visible:border-slate-200 transition-all text-sm font-medium"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-2.5">
              <Label htmlFor="password" className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Password</Label>
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors">
                  <svg className="size-4" viewBox="0 0 16 16" fill="none" aria-hidden strokeWidth="2.5" stroke="currentColor">
                    <rect x="3" y="7" width="10" height="8" rx="1.5" />
                    <path d="M5 7V5a3 3 0 0 1 6 0v2" strokeLinecap="round" />
                  </svg>
                </div>
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Min. 8 characters"
                  required
                  disabled={isPending}
                  className="h-12 pl-11 pr-11 bg-slate-100 border-transparent rounded-xl focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-blue-500/10 focus-visible:border-slate-200 transition-all text-sm font-medium"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-200/80 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOff className="size-4" strokeWidth={2} /> : <Eye className="size-4" strokeWidth={2} />}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div className="space-y-2.5">
              <Label htmlFor="confirmPassword" className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Confirm Password</Label>
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors">
                  <svg className="size-4" viewBox="0 0 16 16" fill="none" aria-hidden strokeWidth="2.5" stroke="currentColor">
                    <rect x="3" y="7" width="10" height="8" rx="1.5" />
                    <path d="M5 7V5a3 3 0 0 1 6 0v2" strokeLinecap="round" />
                    <path d="M6 11l1.5 1.5L10 9.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  required
                  disabled={isPending}
                  className="h-12 pl-11 pr-11 bg-slate-100 border-transparent rounded-xl focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-blue-500/10 focus-visible:border-slate-200 transition-all text-sm font-medium"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-200/80 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30"
                  aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                  aria-pressed={showConfirmPassword}
                >
                  {showConfirmPassword ? <EyeOff className="size-4" strokeWidth={2} /> : <Eye className="size-4" strokeWidth={2} />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-[11px] font-bold text-red-500 uppercase tracking-widest bg-red-50 p-3 rounded-lg border border-red-100" role="alert">
                {error}
              </p>
            )}

            <Button
              type="submit"
              disabled={isPending}
              className="w-full h-14 bg-[#0c1421] hover:bg-black text-white rounded-xl font-black uppercase tracking-widest text-[11px] flex items-center justify-center gap-2 shadow-lg shadow-blue-900/10 active:scale-[0.98] transition-all"
            >
              {isPending ? "Creating account…" : "Create account"}
              {!isPending && (
                <svg className="size-4" viewBox="0 0 16 16" fill="none" aria-hidden stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 8h10M9 4l4 4-4 4" />
                </svg>
              )}
            </Button>
          </form>
        </div>

        <p className="mt-8 text-sm font-medium text-slate-400">
          Already have an account?{" "}
          <Link href="/login" className="text-[#0c1421] font-black hover:underline underline-offset-4">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
