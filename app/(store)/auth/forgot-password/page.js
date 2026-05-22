"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";

export default function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm();

  const onSubmit = async (data) => {
    setLoading(true);
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.email }),
      });
      setSent(true);
    } catch { toast.error("Something went wrong"); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-brand-cream flex items-center justify-center py-16 px-6">
      <div className="w-full max-w-[400px]">
        {sent ? (
          <div className="text-center">
            <div className="w-14 h-14 border border-brand-tan/30 flex items-center justify-center mx-auto mb-8">
              <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-brand-brown"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <h1 className="font-display text-3xl font-medium text-brand-brown mb-2">Check your email</h1>
            <p className="text-[13px] text-brand-tan mb-8">If an account exists, we&apos;ve sent a password reset link.</p>
            <Link href="/auth/login" className="btn-primary text-[11px] tracking-[3px]">Back to Sign In</Link>
          </div>
        ) : (
          <>
            <div className="mb-10">
              <h1 className="font-display text-3xl font-medium text-brand-brown mb-2">Forgot Password</h1>
              <p className="text-[13px] text-brand-tan">Enter your email and we&apos;ll send a reset link</p>
            </div>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              <div>
                <label className="block text-[11px] uppercase tracking-widest text-brand-tan mb-2">Email</label>
                <input
                  type="email"
                  {...register("email", { required: "Email is required" })}
                  className="w-full border border-brand-tan/30 bg-transparent px-4 py-3 text-[13px] text-brand-brown placeholder-brand-tan/40 focus:outline-none focus:border-brand-brown transition-colors"
                  placeholder="your@email.com"
                />
                {errors.email && <p className="text-red-500 text-[11px] mt-1">{errors.email.message}</p>}
              </div>
              <button type="submit" disabled={loading} className="w-full bg-brand-brown text-brand-cream py-3.5 text-[11px] uppercase tracking-[3px] font-medium hover:bg-brand-terracotta transition-colors disabled:opacity-50">
                {loading ? "Sending…" : "Send Reset Link"}
              </button>
            </form>
            <Link href="/auth/login" className="block text-center mt-6 text-[11px] uppercase tracking-widest text-brand-tan hover:text-brand-brown transition-colors">
              Back to Sign In
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
