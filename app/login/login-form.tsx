"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { ArrowRight, Eye, EyeOff, Key, Mail } from "lucide-react";

type LoginFormProps = {
  csrfToken:   string;
  callbackUrl: string;
  urlError:    string | null;
};

export default function LoginForm({ csrfToken, callbackUrl, urlError }: LoginFormProps) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="w-full max-w-[400px] flex flex-col items-center">
      <div className="w-full space-y-2 mb-10 text-left">
        <h1 className="text-4xl font-black text-[#0c1421] tracking-tight">Sign in</h1>
        <p className="text-sm font-medium text-slate-500 leading-relaxed max-w-[280px]">
          Enter your credentials to access the secure environment.
        </p>
      </div>

      <div className="w-full bg-white border border-slate-100 rounded-2xl p-8 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.08)]">
        <form method="post" action="/api/auth/callback/credentials" className="space-y-6">
          <input type="hidden" name="csrfToken" value={csrfToken} />
          <input type="hidden" name="callbackUrl" value={callbackUrl} />

          <div className="space-y-2.5">
            <Label htmlFor="email" className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Email Address</Label>
            <div className="relative group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors">
                <Mail className="size-4" strokeWidth={2.5} />
              </div>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="name@company.com"
                required
                className="h-12 pl-11 bg-slate-100 border-transparent rounded-xl focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-blue-500/10 focus-visible:border-slate-200 transition-all text-sm font-medium"
              />
            </div>
          </div>

          <div className="space-y-2.5">
            <Label htmlFor="password" className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Password</Label>
            <div className="relative group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors">
                <Key className="size-4" strokeWidth={2.5} />
              </div>
              <Input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="••••••••"
                required
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

          {urlError && (
            <p className="text-[11px] font-bold text-red-500 uppercase tracking-widest bg-red-50 p-3 rounded-lg border border-red-100" role="alert">
              {urlError}
            </p>
          )}

          <Button type="submit" className="w-full h-14 bg-[#0c1421] hover:bg-black text-white rounded-xl font-black uppercase tracking-widest text-[11px] flex items-center justify-center gap-2 shadow-lg shadow-blue-900/10 active:scale-[0.98] transition-all">
            Sign in
            <ArrowRight className="size-4" />
          </Button>
        </form>
      </div>

      <p className="mt-8 text-sm font-medium text-slate-400">
        Don&apos;t have an account?{" "}
        <Link href="/register" className="text-[#0c1421] font-black hover:underline underline-offset-4">
          Sign up
        </Link>
      </p>
    </div>
  );
}
