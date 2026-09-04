"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn, signOut, useSession } from "next-auth/react";
import Image from "next/image";
import { Eye, EyeOff, Lock, AlertTriangle } from "lucide-react";
import { isStaff } from "@/lib/permissions";
import { DemoCredentials } from "@enfinito/demo-kit/ui";

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908C16.658 14.013 17.64 11.706 17.64 9.2z"/>
    <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
    <path fill="#FBBC05" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.039l3.007-2.332z"/>
    <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z"/>
  </svg>
);

function AdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState(searchParams.get("error") === "access_denied" ? "Access denied — admin accounts only." : "");

  // If already signed in as admin, go straight to dashboard
  useEffect(() => {
    if (status === "authenticated") {
      if (isStaff(session.user.role)) {
        router.replace("/admin");
      } else {
        setError("This account does not have admin access.");
      }
    }
  }, [session, status, router]);

  const handleCredentials = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      if (result?.error) {
        setError("Invalid email or password.");
      }
      // role check handled by the useEffect above
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = () => {
    setError("");
    setGoogleLoading(true);
    signIn("google", { callbackUrl: "/admin/login" });
  };

  const handleSignOutAndRetry = async () => {
    await signOut({ redirect: false });
    setError("");
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-[#0D0D0D] flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-brand-terracotta border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0D0D0D] flex items-stretch">
      {/* Left decorative panel */}
      <div className="hidden lg:flex w-[420px] xl:w-[480px] flex-shrink-0 flex-col bg-[#0A0A0A] border-r border-white/[0.04] relative overflow-hidden">
        {/* Grid texture */}
        <div className="absolute inset-0"
          style={{backgroundImage:"linear-gradient(rgba(255,255,255,0.015) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.015) 1px,transparent 1px)", backgroundSize:"48px 48px"}}
        />
        {/* Terracotta glow */}
        <div className="absolute bottom-0 left-0 w-[300px] h-[300px] rounded-full bg-brand-terracotta/10 blur-[80px] pointer-events-none" />

        <div className="relative z-10 p-10 flex-1 flex flex-col">
          <div className="mb-auto">
            <Image src="/logo-white.png" alt="Elysium" width={140} height={42} className="h-9 w-auto object-contain mb-16" />
          </div>

          <div>
            <div className="w-8 h-[2px] bg-brand-terracotta mb-6" />
            <h2 className="text-white/90 text-3xl xl:text-4xl font-display font-light leading-tight tracking-wide mb-4">
              Admin<br />Control Centre
            </h2>
            <p className="text-white/30 text-[13px] leading-relaxed max-w-[260px]">
              Manage products, orders, customers and site settings from one place.
            </p>
          </div>

          <div className="mt-auto pt-16">
            {[
              "Full product & inventory management",
              "Real-time order processing",
              "Customer & analytics overview",
            ].map((item) => (
              <div key={item} className="flex items-center gap-3 mb-3">
                <span className="w-1 h-1 rounded-full bg-brand-terracotta flex-shrink-0" />
                <span className="text-white/25 text-[12px]">{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 px-10 pb-8">
          <p className="text-white/15 text-[11px] tracking-widest uppercase">© 2025 Elysium Lifestyle</p>
        </div>
      </div>

      {/* Right — login form */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        {/* Mobile logo */}
        <div className="lg:hidden mb-10">
          <Image src="/logo-white.png" alt="Elysium" width={130} height={40} className="h-8 w-auto object-contain" />
        </div>

        <div className="w-full max-w-[380px]">
          <div className="flex items-center gap-2.5 mb-8">
            <div className="w-8 h-8 bg-brand-terracotta/20 border border-brand-terracotta/30 flex items-center justify-center">
              <Lock size={14} className="text-brand-terracotta" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-[10px] text-white/30 uppercase tracking-[3px]">Restricted Access</p>
              <p className="text-white/80 text-sm font-medium leading-tight">Admin Sign In</p>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/20 px-4 py-3 mb-6">
              <AlertTriangle size={15} className="text-red-400 flex-shrink-0 mt-0.5" strokeWidth={1.5} />
              <div className="flex-1">
                <p className="text-red-400 text-[12px] leading-relaxed">{error}</p>
                {status === "authenticated" && !isStaff(session?.user?.role) && (
                  <button onClick={handleSignOutAndRetry} className="text-white/50 hover:text-white text-[11px] mt-1.5 underline underline-offset-2 transition-colors">
                    Sign out and try a different account
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Renders only in demo mode; null in production. Admin account only —
              offering the customer account here would just fail the role check. */}
          <DemoCredentials
            only={["Admin"]}
            onFill={({ email: e, password: pw }) => { setEmail(e); setPassword(pw); }}
          />

          {/* Google */}
          <button
            onClick={handleGoogle}
            disabled={googleLoading || status === "authenticated"}
            className="w-full flex items-center justify-center gap-3 bg-white/[0.06] border border-white/10 hover:bg-white/10 hover:border-white/20 py-3 px-4 text-[13px] text-white/80 transition-all duration-200 mb-4 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <GoogleIcon />
            {googleLoading ? "Redirecting…" : "Continue with Google"}
          </button>

          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-white/[0.06]" />
            <span className="text-[10px] uppercase tracking-[3px] text-white/20">or</span>
            <div className="flex-1 h-px bg-white/[0.06]" />
          </div>

          <form onSubmit={handleCredentials} className="space-y-4">
            <div>
              <label className="block text-[10px] uppercase tracking-[2px] text-white/30 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full bg-white/[0.05] border border-white/10 px-4 py-3 text-[13px] text-white/80 placeholder-white/20 focus:outline-none focus:border-brand-terracotta/60 focus:bg-white/[0.07] transition-all"
                placeholder="admin@email.com"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-[2px] text-white/30 mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="w-full bg-white/[0.05] border border-white/10 px-4 py-3 pr-11 text-[13px] text-white/80 placeholder-white/20 focus:outline-none focus:border-brand-terracotta/60 focus:bg-white/[0.07] transition-all"
                  placeholder="Your password"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                >
                  {showPw ? <EyeOff size={15} strokeWidth={1.5} /> : <Eye size={15} strokeWidth={1.5} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || status === "authenticated"}
              className="w-full bg-brand-terracotta hover:bg-brand-terracotta-dark text-white py-3.5 text-[11px] uppercase tracking-[3px] font-medium transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed mt-1"
            >
              {loading ? "Signing in…" : "Sign In to Admin"}
            </button>
          </form>

          <div className="mt-8 pt-8 border-t border-white/[0.06] text-center">
            <a href="/" className="text-[11px] text-white/20 hover:text-white/40 transition-colors">
              ← Back to store
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0D0D0D]" />}>
      <AdminLoginForm />
    </Suspense>
  );
}
