"use client";

import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/admin/ui";

// Force every panel member (incl. superadmin) to create a 6-digit security PIN.
// Renders a non-dismissible overlay until a PIN exists. Mounted once in the
// admin layout. Self-checks via /api/admin/pin/status.
export default function PinGate() {
  const [needsPin, setNeedsPin] = useState(false);
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/admin/pin/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (active && d && !d.hasPin) setNeedsPin(true); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const submit = async () => {
    if (!/^\d{6}$/.test(pin)) { setError("PIN must be exactly 6 digits"); return; }
    if (pin !== confirm) { setError("PINs do not match"); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/pin/set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error || "Failed to set PIN"); setSaving(false); return; }
      toast.success("Security PIN created");
      setNeedsPin(false);
    } catch {
      setError("Something went wrong");
      setSaving(false);
    }
  };

  if (!needsPin) return null;

  const digits = (v) => v.replace(/\D/g, "").slice(0, 6);
  const inputCls =
    "w-full text-center tracking-[0.5em] text-lg font-mono px-3 py-2.5 rounded-lg border border-brand-tan/30 bg-white text-brand-brown focus:outline-none focus:border-brand-brown focus:ring-2 focus:ring-brand-terracotta/15";

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="relative bg-white w-full max-w-sm rounded-xl shadow-2xl p-6">
        <div className="w-12 h-12 rounded-full bg-brand-terracotta/10 text-brand-terracotta flex items-center justify-center mb-3">
          <ShieldCheck size={22} />
        </div>
        <h2 className="text-lg font-bold text-brand-brown">Create your security PIN</h2>
        <p className="text-[12px] text-brand-tan mt-1">
          Every team member must set a 6-digit PIN. You&apos;ll enter it to confirm critical
          actions like editing orders, changing payments, and recording returns.
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <label className="block text-[11px] uppercase tracking-widest text-brand-tan mb-1.5">New PIN</label>
            <input type="password" inputMode="numeric" autoComplete="off" maxLength={6}
              value={pin} onChange={(e) => { setPin(digits(e.target.value)); setError(""); }}
              placeholder="••••••" className={inputCls} />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-widest text-brand-tan mb-1.5">Confirm PIN</label>
            <input type="password" inputMode="numeric" autoComplete="off" maxLength={6}
              value={confirm} onChange={(e) => { setConfirm(digits(e.target.value)); setError(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
              placeholder="••••••" className={inputCls} />
          </div>
          {error && <p className="text-[12px] text-red-600">{error}</p>}
        </div>

        <Button onClick={submit} disabled={saving || pin.length !== 6 || confirm.length !== 6} className="w-full mt-5">
          {saving ? "Saving…" : "Create PIN"}
        </Button>
        <p className="text-[10px] text-brand-tan/70 text-center mt-3">
          Keep it private. A superadmin can reset it if you forget.
        </p>
      </div>
    </div>
  );
}
