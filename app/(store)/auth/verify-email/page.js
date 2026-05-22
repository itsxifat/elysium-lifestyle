"use client";

import { useState, useRef, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import toast from "react-hot-toast";

function VerifyEmailForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email") || "";
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const inputs = useRef([]);

  const handleChange = (i, val) => {
    if (!/^\d?$/.test(val)) return;
    const next = [...otp];
    next[i] = val;
    setOtp(next);
    if (val && i < 5) inputs.current[i + 1]?.focus();
  };

  const handleKeyDown = (i, e) => {
    if (e.key === "Backspace" && !otp[i] && i > 0) inputs.current[i - 1]?.focus();
  };

  const handlePaste = (e) => {
    const paste = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (paste.length === 6) {
      setOtp(paste.split(""));
      inputs.current[5]?.focus();
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const code = otp.join("");
    if (code.length !== 6) { toast.error("Enter all 6 digits"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp: code }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Invalid code"); return; }
      toast.success("Email verified!");
      router.push("/auth/login?verified=1");
    } catch { toast.error("Something went wrong"); }
    finally { setLoading(false); }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      await fetch("/api/auth/resend-otp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      toast.success("New code sent!");
    } catch { toast.error("Could not resend"); }
    finally { setResending(false); }
  };

  return (
    <div className="min-h-screen bg-brand-cream flex items-center justify-center py-16 px-6">
      <div className="w-full max-w-[400px] text-center">
        <div className="w-14 h-14 border border-brand-tan/30 flex items-center justify-center mx-auto mb-8">
          <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-brand-brown"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>
        </div>
        <h1 className="font-display text-3xl font-medium text-brand-brown mb-2">Verify Email</h1>
        <p className="text-[13px] text-brand-tan mb-2">We sent a 6-digit code to</p>
        <p className="text-[13px] font-medium text-brand-brown mb-10">{email}</p>

        <form onSubmit={handleSubmit}>
          <div className="flex justify-center gap-3 mb-8" onPaste={handlePaste}>
            {otp.map((digit, i) => (
              <input
                key={i}
                ref={(el) => (inputs.current[i] = el)}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                className="w-12 h-14 border border-brand-tan/30 text-center text-xl font-medium text-brand-brown bg-white focus:outline-none focus:border-brand-brown transition-colors"
              />
            ))}
          </div>

          <button type="submit" disabled={loading} className="w-full bg-brand-brown text-brand-cream py-3.5 text-[11px] uppercase tracking-[3px] font-medium hover:bg-brand-terracotta transition-colors disabled:opacity-50">
            {loading ? "Verifying…" : "Verify Email"}
          </button>
        </form>

        <p className="text-[12px] text-brand-tan mt-6">
          Didn&apos;t receive a code?{" "}
          <button onClick={handleResend} disabled={resending} className="text-brand-brown hover:text-brand-terracotta font-medium transition-colors disabled:opacity-50">
            {resending ? "Sending…" : "Resend"}
          </button>
        </p>
        <Link href="/auth/login" className="inline-block mt-4 text-[11px] uppercase tracking-widest text-brand-tan hover:text-brand-brown transition-colors">
          Back to Sign In
        </Link>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return <Suspense fallback={<div className="min-h-screen bg-brand-cream" />}><VerifyEmailForm /></Suspense>;
}
