"use client";

import { forwardRef, useImperativeHandle, useRef, useState, useEffect } from "react";
import { ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/admin/ui";

// Imperative PIN modal for gating critical actions.
//
// Usage:
//   const pinRef = useRef(null);
//   <PinPrompt ref={pinRef} />
//   const result = await pinRef.current.run(async (pin) => {
//     const res = await fetch(url, { ..., body: JSON.stringify({ ...payload, pin }) });
//     const d = await res.json().catch(() => ({}));
//     if ([403, 423, 428, 429].includes(res.status)) return { pinError: d.error };
//     if (!res.ok) throw new Error(d.error || "Failed");
//     return d; // success → run() resolves with this
//   });
//   if (!result) return;       // user cancelled
//
// PIN errors are shown inline (no flash); other errors reject run() so the
// caller can toast them.
const PinPrompt = forwardRef(function PinPrompt({ title = "Confirm with your PIN", description }, ref) {
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const actionRef = useRef(null);
  const resolveRef = useRef(null);
  const rejectRef = useRef(null);
  const inputRef = useRef(null);

  useImperativeHandle(ref, () => ({
    run(action) {
      actionRef.current = action;
      setPin("");
      setError("");
      setBusy(false);
      setOpen(true);
      return new Promise((resolve, reject) => { resolveRef.current = resolve; rejectRef.current = reject; });
    },
  }));

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  const settle = (fn, value) => {
    setOpen(false);
    const cb = fn === "resolve" ? resolveRef.current : rejectRef.current;
    resolveRef.current = null;
    rejectRef.current = null;
    actionRef.current = null;
    cb?.(value);
  };

  const cancel = () => { if (!busy) settle("resolve", undefined); };

  const submit = async () => {
    if (!/^\d{6}$/.test(pin)) { setError("Enter your 6-digit PIN"); return; }
    if (!actionRef.current) return;
    setBusy(true);
    setError("");
    try {
      const out = await actionRef.current(pin);
      if (out && out.pinError) { setError(out.pinError); setPin(""); setBusy(false); inputRef.current?.focus(); return; }
      settle("resolve", out ?? true);
    } catch (err) {
      // Non-PIN error → close and let the caller's catch handle it.
      settle("reject", err);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={cancel} />
      <div className="relative bg-white w-full max-w-sm rounded-xl shadow-2xl p-6">
        <button onClick={cancel} disabled={busy} className="absolute right-4 top-4 text-brand-tan hover:text-brand-brown disabled:opacity-40">
          <X size={18} />
        </button>
        <div className="w-11 h-11 rounded-full bg-brand-terracotta/10 text-brand-terracotta flex items-center justify-center mb-3">
          <ShieldCheck size={20} />
        </div>
        <h2 className="font-semibold text-brand-brown">{title}</h2>
        <p className="text-[12px] text-brand-tan mt-1">
          {description || "This is a protected action. Enter your 6-digit security PIN to continue."}
        </p>

        <input
          ref={inputRef}
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={6}
          value={pin}
          onChange={(e) => { setPin(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          placeholder="••••••"
          className="mt-4 w-full text-center tracking-[0.5em] text-lg font-mono px-3 py-2.5 rounded-lg border border-brand-tan/30 bg-white text-brand-brown focus:outline-none focus:border-brand-brown focus:ring-2 focus:ring-brand-terracotta/15"
        />
        {error && <p className="text-[12px] text-red-600 mt-2">{error}</p>}

        <div className="flex gap-3 mt-5">
          <Button onClick={submit} disabled={busy || pin.length !== 6} className="flex-1">
            {busy ? "Verifying…" : "Confirm"}
          </Button>
          <Button variant="outline" onClick={cancel} disabled={busy}>Cancel</Button>
        </div>
      </div>
    </div>
  );
});

export default PinPrompt;
