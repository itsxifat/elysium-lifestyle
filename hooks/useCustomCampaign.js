"use client";

import { useState, useEffect } from "react";

// Resolve a ?cu=<code> suffix to its campaign config (the brand ERP's campaign
// link, read through /api/custom-url/<code>). Module-level cache so the global
// banner/modal and the shop highlight strip share a single fetch per code.
// Only the ERP's five-digit codes are looked up.
const cache = new Map(); // code -> { data, ts }
const TTL = 60_000;

export function useCustomCampaign(code) {
  const [data, setData] = useState(() => {
    if (!code || !/^[1-9]\d{4}$/.test(code)) return null;
    const c = cache.get(code);
    return c && Date.now() - c.ts < TTL ? c.data : null;
  });

  useEffect(() => {
    if (!code || !/^[1-9]\d{4}$/.test(code)) { setData(null); return; }
    const c = cache.get(code);
    if (c && Date.now() - c.ts < TTL) { setData(c.data); return; }

    let active = true;
    fetch(`/api/custom-url/${encodeURIComponent(code)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!active) return;
        cache.set(code, { data: d, ts: Date.now() });
        setData(d);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [code]);

  return data;
}
