"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { Eye, EyeOff } from "lucide-react";

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908C16.658 14.013 17.64 11.706 17.64 9.2z"/>
    <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
    <path fill="#FBBC05" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.039l3.007-2.332z"/>
    <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z"/>
  </svg>
);

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";
  const verified = searchParams.get("verified");

  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm();

  const onSubmit = async (data) => {
    setLoading(true);
    try {
      const result = await signIn("credentials", {
        email: data.email,
        password: data.password,
        redirect: false,
      });
      if (result?.error) {
        toast.error("Invalid email or password");
      } else {
        router.push(callbackUrl);
        router.refresh();
      }
    } catch {
      toast.error("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = () => {
    setGoogleLoading(true);
    signIn("google", { callbackUrl });
  };

  return (
    <div className="min-h-screen flex">
      {/* ── Left panel ───────────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-[45%] xl:w-1/2 bg-brand-brown flex-col relative overflow-hidden">
        {/* subtle grid texture */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: "repeating-linear-gradient(0deg,#F5F0E8 0,#F5F0E8 1px,transparent 0,transparent 60px),repeating-linear-gradient(90deg,#F5F0E8 0,#F5F0E8 1px,transparent 0,transparent 60px)",
          }}
        />
        {/* terracotta accent line */}
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-brand-terracotta" />

        {/* Logo at top */}
        <div className="relative z-10 px-12 pt-12">
          <Link href="/">
            <Image
              src="/logo-white.png"
              alt="Elysium Lifestyle"
              width={160}
              height={48}
              className="h-10 w-auto object-contain"
            />
          </Link>
        </div>

        {/* Centred brand statement */}
        <div className="relative z-10 flex-1 flex flex-col items-start justify-center px-12 pb-16">
          <div className="w-8 h-[2px] bg-brand-terracotta mb-8" />
          <h2 className="font-display text-brand-cream text-4xl xl:text-5xl font-light leading-snug tracking-wide mb-6">
            Wear your<br />story.
          </h2>
          <p className="text-brand-cream/50 text-[13px] leading-relaxed max-w-[280px]">
            Premium fashion crafted for men, women, and kids — curated with intention, delivered with care.
          </p>
          <div className="mt-12 flex items-center gap-3">
            <span className="w-6 h-6 rounded-full bg-brand-terracotta flex items-center justify-center">
              <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </span>
            <span className="text-brand-cream/40 text-[12px] tracking-wide">Free shipping over ৳1500</span>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <span className="w-6 h-6 rounded-full bg-brand-terracotta flex items-center justify-center">
              <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </span>
            <span className="text-brand-cream/40 text-[12px] tracking-wide">Cash on delivery available</span>
          </div>
        </div>

        {/* Bottom copyright */}
        <div className="relative z-10 px-12 pb-8">
          <p className="text-brand-cream/20 text-[11px] tracking-widest uppercase">© 2025 Elysium Lifestyle</p>
        </div>
      </div>

      {/* ── Right panel ──────────────────────────────────────── */}
      <div className="w-full lg:w-[55%] xl:w-1/2 bg-brand-cream flex flex-col">
        {/* Mobile header */}
        <div className="flex items-center justify-between px-6 pt-6 lg:hidden">
          <Link href="/">
            <Image src="/logo-black.png" alt="Elysium" width={130} height={40} className="h-8 w-auto" />
          </Link>
          <Link href="/auth/register" className="text-[11px] uppercase tracking-widest text-brand-tan hover:text-brand-brown transition-colors">
            Register
          </Link>
        </div>

        <div className="flex-1 flex items-center justify-center px-6 py-12 lg:py-0">
          <div className="w-full max-w-[400px]">

            {verified && (
              <div className="mb-6 px-4 py-3 bg-green-50 border border-green-200 text-green-700 text-[12px]">
                Email verified! You can now sign in.
              </div>
            )}

            <div className="mb-8">
              <p className="text-[11px] uppercase tracking-[3px] text-brand-terracotta mb-2">Welcome back</p>
              <h1 className="font-display text-[2rem] font-medium text-brand-brown leading-tight">Sign in to your account</h1>
            </div>

            {/* Google */}
            <button
              onClick={handleGoogle}
              disabled={googleLoading}
              className="w-full flex items-center justify-center gap-3 border border-brand-tan/40 bg-white py-3 px-4 text-[13px] text-brand-brown hover:border-brand-brown hover:shadow-sm transition-all duration-200 mb-5 disabled:opacity-60"
            >
              <GoogleIcon />
              {googleLoading ? "Redirecting…" : "Continue with Google"}
            </button>

            <div className="flex items-center gap-4 mb-5">
              <div className="flex-1 h-px bg-brand-tan/20" />
              <span className="text-[10px] uppercase tracking-[3px] text-brand-tan">or</span>
              <div className="flex-1 h-px bg-brand-tan/20" />
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="block text-[10px] uppercase tracking-[2px] text-brand-tan mb-1.5">Email address</label>
                <input
                  type="email"
                  {...register("email", { required: "Email is required" })}
                  className="w-full bg-white border border-brand-tan/30 px-4 py-3 text-[13px] text-brand-brown placeholder-brand-tan/40 focus:outline-none focus:border-brand-brown transition-colors"
                  placeholder="your@email.com"
                  autoComplete="email"
                />
                {errors.email && <p className="text-red-500 text-[11px] mt-1">{errors.email.message}</p>}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[10px] uppercase tracking-[2px] text-brand-tan">Password</label>
                  <Link href="/auth/forgot-password" className="text-[11px] text-brand-tan hover:text-brand-terracotta transition-colors">
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <input
                    type={showPw ? "text" : "password"}
                    {...register("password", { required: "Password is required" })}
                    className="w-full bg-white border border-brand-tan/30 px-4 py-3 pr-11 text-[13px] text-brand-brown placeholder-brand-tan/40 focus:outline-none focus:border-brand-brown transition-colors"
                    placeholder="Your password"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-tan hover:text-brand-brown transition-colors"
                  >
                    {showPw ? <EyeOff size={15} strokeWidth={1.5} /> : <Eye size={15} strokeWidth={1.5} />}
                  </button>
                </div>
                {errors.password && <p className="text-red-500 text-[11px] mt-1">{errors.password.message}</p>}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-brand-brown text-brand-cream py-3.5 text-[11px] uppercase tracking-[3px] font-medium hover:bg-brand-terracotta transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed mt-2"
              >
                {loading ? "Signing in…" : "Sign In"}
              </button>
            </form>

            <p className="text-center text-[12px] text-brand-tan mt-7">
              New to Elysium?{" "}
              <Link href="/auth/register" className="text-brand-brown hover:text-brand-terracotta font-medium transition-colors">
                Create an account
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-brand-cream" />}>
      <LoginForm />
    </Suspense>
  );
}
