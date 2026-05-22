"use client";

import { useState } from "react";
import { ArrowRight, CheckCircle } from "lucide-react";
import toast from "react-hot-toast";

const BENEFITS = [
  "Exclusive early access to new arrivals",
  "Members-only discount codes",
  "Style tips and seasonal lookbooks",
];

export default function NewsletterSection() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [subscribed, setSubscribed] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        setSubscribed(true);
        setEmail("");
        toast.success("Welcome to the Elysium family!");
      } else {
        toast.error("Something went wrong. Please try again.");
      }
    } catch {
      toast.error("Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="bg-[#1E0E08] relative overflow-hidden">
      {/* Decorative background text */}
      <div className="absolute inset-0 flex items-center justify-center select-none pointer-events-none opacity-[0.025]">
        <span className="text-[140px] md:text-[180px] font-display font-bold text-white leading-none whitespace-nowrap">
          ELYSIUM
        </span>
      </div>

      <div className="container-custom py-20 md:py-24 relative">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-16 items-center">

          {/* Left: text */}
          <div>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-6 h-px bg-brand-terracotta" />
              <p className="text-brand-terracotta text-[10px] uppercase tracking-[4px]">Stay Connected</p>
            </div>
            <h2 className="font-display text-4xl md:text-5xl font-semibold text-white leading-tight mb-5">
              Join the
              <br />
              <span className="text-brand-cream/60">Elysium Circle</span>
            </h2>
            <p className="text-white/40 text-[14px] leading-relaxed mb-7">
              Be the first to know about new collections, exclusive drops, and members-only deals.
            </p>
            <ul className="space-y-3">
              {BENEFITS.map((b) => (
                <li key={b} className="flex items-center gap-3">
                  <CheckCircle size={14} className="text-brand-terracotta flex-shrink-0" strokeWidth={1.5} />
                  <span className="text-white/50 text-[13px]">{b}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Right: form */}
          <div>
            {subscribed ? (
              <div className="text-center py-10">
                <CheckCircle size={40} className="text-brand-terracotta mx-auto mb-4" strokeWidth={1.5} />
                <p className="text-white text-xl font-display font-semibold mb-2">You&apos;re in!</p>
                <p className="text-white/40 text-sm">Welcome to the Elysium family. Expect great things.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-[10px] uppercase tracking-[2px] text-white/40 mb-2">
                    Your Email Address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    className="w-full bg-white/5 border border-white/10 px-4 py-4 text-white placeholder-white/20 focus:outline-none focus:border-brand-terracotta transition-colors text-[14px]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-brand-terracotta text-white py-4 uppercase text-[11px] font-bold tracking-[3px] hover:bg-brand-terracotta-dark transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    "Subscribing…"
                  ) : (
                    <>
                      Subscribe Now
                      <ArrowRight size={14} strokeWidth={2} />
                    </>
                  )}
                </button>
                <p className="text-[11px] text-white/20 text-center">
                  No spam. Unsubscribe anytime. We respect your privacy.
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
