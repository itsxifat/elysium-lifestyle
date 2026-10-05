import "server-only";

import { headers as nextHeaders } from "next/headers";

// Who the shopper is, as this server saw them: their address and browser, sent
// to the ERP as `client` on account and checkout writes so its per-shopper
// limits count shoppers, not this website (D-534).
//
// Production runs behind nginx on 127.0.0.1 only, and nginx (with Cloudflare's
// real-IP include) overwrites X-Real-IP and X-Forwarded-For with the visitor's
// address, so the headers can be believed. A value that is not an IP address is
// left out rather than sent.

const IP = /^[0-9A-Fa-f:.]{2,64}$/;

function read(source, name) {
  if (!source) return null;
  const h = source.headers ?? source;
  if (typeof h?.get === "function") return h.get(name);
  if (h && typeof h === "object") return h[name] ?? h[name.toLowerCase()] ?? null;
  return null;
}

/** The shopper's IP from a Request, Headers, or a next-auth `req`. */
export function shopperIp(source) {
  const candidates = [
    read(source, "x-real-ip"),
    String(read(source, "x-forwarded-for") || "").split(",")[0],
  ];
  for (const raw of candidates) {
    const ip = String(raw || "").trim().replace(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/, "$1");
    if (ip && IP.test(ip)) return ip;
  }
  return null;
}

/** `{ ip, userAgent }` for the ERP, or undefined when the address is unknown. */
export function clientOf(source) {
  const ip = shopperIp(source);
  if (!ip) return undefined;
  const userAgent = String(read(source, "user-agent") || "").slice(0, 400);
  return userAgent ? { ip, userAgent } : { ip };
}

/** The same, from the current request inside a route handler or server component. */
export function currentClient() {
  try {
    return clientOf(nextHeaders());
  } catch {
    return undefined;
  }
}
