"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

const pad = (n) => String(n).padStart(2, "0");

// Live countdown to `target`. Returns null until mounted (avoids an SSR/client
// hydration mismatch) and when there is no target. `onDone` fires once, when
// the countdown reaches zero while the page is open.
export function useCountdown(target, onDone) {
  const t = target ? new Date(target).getTime() : null;
  const [now, setNow] = useState(null);
  const done = useRef(onDone);
  done.current = onDone;
  const fired = useRef(false);

  useEffect(() => {
    if (!t) return;
    fired.current = false;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [t]);

  const diff = t && now != null ? Math.max(0, t - now) : null;
  useEffect(() => {
    if (diff === 0 && !fired.current) {
      fired.current = true;
      done.current?.();
    }
  }, [diff]);

  if (diff == null) return null;
  const s = Math.floor(diff / 1000);
  return {
    done: diff <= 0,
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
  };
}

const TONES = {
  // On light backgrounds.
  dark: { box: "bg-brand-brown text-brand-cream", label: "text-brand-tan" },
  // On photos / dark bands.
  light: { box: "bg-white/95 text-brand-brown", label: "text-white/75" },
  accent: { box: "bg-brand-terracotta text-white", label: "text-brand-tan" },
};

/** Day/hour/minute/second boxes. Renders nothing until mounted or once done. */
export function CountdownBoxes({ target, tone = "dark", size = "md", onDone, className }) {
  const cd = useCountdown(target, onDone);
  if (!cd || cd.done) return null;
  const t = TONES[tone] || TONES.dark;
  // Height comes from padding + text size; the colons share them so they sit
  // on the digits' centre line.
  const height = size === "sm" ? "py-1 text-sm" : size === "lg" ? "py-2 text-xl sm:text-2xl" : "py-1.5 text-base sm:text-lg";
  const box = `${size === "sm" ? "w-9" : size === "lg" ? "w-12 sm:w-14" : "w-10 sm:w-12"} ${height}`;
  const parts = [
    ...(cd.days > 0 ? [[cd.days, "Days"]] : []),
    [cd.hours, "Hrs"],
    [cd.minutes, "Min"],
    [cd.seconds, "Sec"],
  ];

  return (
    <div className={cn("flex items-start gap-1.5", className)} role="timer" aria-live="off">
      {parts.map(([value, label], i) => (
        <div key={label} className="flex items-start gap-1.5">
          {i > 0 && <span className={cn("font-bold", height, t.label)}>:</span>}
          <div className="flex flex-col items-center">
            <span className={cn("font-bold tabular-nums rounded-md text-center shadow-sm", box, t.box)}>{pad(value)}</span>
            <span className={cn("text-[9px] uppercase tracking-wider mt-1", t.label)}>{label}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/** "2d 04:12:09" / "04:12:09" — for chips and tight spots. */
export function CountdownText({ target, onDone, className }) {
  const cd = useCountdown(target, onDone);
  if (!cd || cd.done) return null;
  return (
    <span className={cn("tabular-nums", className)} suppressHydrationWarning>
      {cd.days > 0 ? `${cd.days}d ` : ""}
      {pad(cd.hours)}:{pad(cd.minutes)}:{pad(cd.seconds)}
    </span>
  );
}
