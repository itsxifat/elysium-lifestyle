"use client";

import { useState, useEffect } from "react";

// Resolve a ?cu=<code> suffix to its campaign config. Module-level cache so the
// global banner/modal and the shop highlight strip share a single fetch per code.
const cache = new Map(); // code -> { data, ts }
const TTL = 60_000;

export function useCustomCampaign(code) {
  const [data, setData] = useState(() => {
    if (!code) return null;
    const c = cache.get(code);
    return c && Date.now() - c.ts < TTL ? c.data : null;
  });

  useEffect(() => {
    if (!code) { setData(null); return; }
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
