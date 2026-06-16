"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

// Renders the result of /scanner-connect: on success it auto-bounces into the
// app via the elyscanner:// deep link and also shows a copy-paste code as a
// fallback (in case the app didn't open). All brand-styled, no app chrome.
export default function ConnectClient({ token, name, role, error }) {
  const [copied, setCopied] = useState(false);
  const deepUrl = token ? `elyscanner://auth?token=${encodeURIComponent(token)}&name=${encodeURIComponent(name || "")}&role=${encodeURIComponent(role || "")}` : "";

  // Try to open the app automatically once.
  useEffect(() => {
    if (!deepUrl) return;
    const t = setTimeout(() => { window.location.href = deepUrl; }, 500);
    return () => clearTimeout(t);
  }, [deepUrl]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-cream flex items-center justify-center p-5">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-brand-tan/15 p-6 text-center">
        <div className="relative w-40 h-24 mx-auto mb-3">
          <Image src="/logo-black.png" alt="Elysium Lifestyle" fill className="object-contain" />
        </div>

        {error ? (
          <>
            <p className="text-red-600 font-semibold">Can’t connect the scanner</p>
            <p className="text-sm text-brand-tan mt-2">{error}</p>
          </>
        ) : (
          <>
            <p className="text-brand-brown font-semibold">Signed in{name ? ` as ${name}` : ""}</p>
            <p className="text-sm text-brand-tan mt-1">Opening the Elysium Scanner app…</p>

            <a
              href={deepUrl}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 bg-brand-terracotta text-white font-bold rounded-xl py-3.5"
            >
              Open the app
            </a>

            <div className="mt-6 pt-5 border-t border-brand-tan/15 text-left">
              <p className="text-[12px] text-brand-tan mb-2">App didn’t open? Copy this code and paste it in the app’s <b>“Paste a sign-in code”</b> box:</p>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={token}
                  onFocus={(e) => e.target.select()}
                  className="flex-1 min-w-0 font-mono text-[11px] px-2 py-2 rounded-lg border border-brand-tan/30 bg-brand-cream/40 text-brand-brown"
                />
                <button onClick={copy} className="bg-brand-brown text-white text-sm font-semibold px-3 rounded-lg shrink-0">
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="text-[11px] text-brand-tan mt-2">This code is valid for 30 days. Keep it private.</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
