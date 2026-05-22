"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { Eye, EyeOff } from "lucide-react";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const { register, handleSubmit, watch, formState: { errors } } = useForm();

  const onSubmit = async (data) => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password: data.password }),
      });
      const result = await res.json();
      if (!res.ok) { toast.error(result.error || "Failed to reset password"); return; }
      toast.success("Password reset! Please sign in.");
      router.push("/auth/login");
    } catch { toast.error("Something went wrong"); }
    finally { setLoading(false); }
  };

  if (!token) return (
    <div className="min-h-screen bg-brand-cream flex items-center justify-center p-6">
      <div className="text-center">
        <p className="text-brand-tan mb-4">Invalid reset link.</p>
        <Link href="/auth/forgot-password" className="btn-primary text-[11px]">Request New Link</Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-brand-cream flex items-center justify-center py-16 px-6">
      <div className="w-full max-w-[400px]">
        <div className="mb-10">
          <h1 className="font-display text-3xl font-medium text-brand-brown mb-2">New Password</h1>
          <p className="text-[13px] text-brand-tan">Choose a strong new password</p>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div>
            <label className="block text-[11px] uppercase tracking-widest text-brand-tan mb-2">New Password</label>
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                {...register("password", { required: "Password is required", minLength: { value: 6, message: "Min 6 characters" } })}
                className="w-full border border-brand-tan/30 bg-transparent px-4 py-3 pr-10 text-[13px] text-brand-brown placeholder-brand-tan/40 focus:outline-none focus:border-brand-brown transition-colors"
                placeholder="At least 6 characters"
              />
              <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-tan hover:text-brand-brown">
                {showPw ? <EyeOff size={16} strokeWidth={1.5} /> : <Eye size={16} strokeWidth={1.5} />}
              </button>
            </div>
            {errors.password && <p className="text-red-500 text-[11px] mt-1">{errors.password.message}</p>}
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-widest text-brand-tan mb-2">Confirm Password</label>
            <input
              type="password"
              {...register("confirmPassword", { required: true, validate: (v) => v === watch("password") || "Passwords do not match" })}
              className="w-full border border-brand-tan/30 bg-transparent px-4 py-3 text-[13px] text-brand-brown placeholder-brand-tan/40 focus:outline-none focus:border-brand-brown transition-colors"
              placeholder="Repeat password"
            />
            {errors.confirmPassword && <p className="text-red-500 text-[11px] mt-1">{errors.confirmPassword.message}</p>}
          </div>
          <button type="submit" disabled={loading} className="w-full bg-brand-brown text-brand-cream py-3.5 text-[11px] uppercase tracking-[3px] font-medium hover:bg-brand-terracotta transition-colors disabled:opacity-50">
            {loading ? "Resetting…" : "Set New Password"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return <Suspense fallback={<div className="min-h-screen bg-brand-cream" />}><ResetPasswordForm /></Suspense>;
}
