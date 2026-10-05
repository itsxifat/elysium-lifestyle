import "server-only";

import { cookies } from "next/headers";

// A guest's order view token (D-524), kept for the shopper in an HttpOnly
// cookie per order, so the confirmation page still opens after the SSLCommerz
// round trip (the gateway's return carries no token) and after a reload. The
// ERP stores only the token's hash and cannot show it again; the emails carry
// their own fresh tokens.

const MAX_AGE = 7 * 24 * 60 * 60;
const ORDER_NO = /^[A-Z0-9-]{3,40}$/;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

function name(orderNo) {
  return `ely_ot_${orderNo}`;
}

/** Remember a view token on a response (NextResponse). */
export function rememberOrderToken(response, orderNo, token) {
  if (!ORDER_NO.test(orderNo) || !TOKEN.test(token)) return;
  response.cookies.set(name(orderNo), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

/** The remembered view token for an order, if this browser placed it. */
export function rememberedOrderToken(orderNo) {
  if (!ORDER_NO.test(String(orderNo))) return null;
  try {
    const value = cookies().get(name(orderNo))?.value || null;
    return value && TOKEN.test(value) ? value : null;
  } catch {
    return null;
  }
}

export function isViewToken(value) {
  return typeof value === "string" && TOKEN.test(value);
}

export function isOrderNo(value) {
  return typeof value === "string" && ORDER_NO.test(value);
}
