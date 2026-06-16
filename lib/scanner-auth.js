import { NextResponse } from "next/server";
import { connectDB } from "./mongoose";
import User from "@/models/User";
import { isStaff, isElevated, hasPermission } from "./permissions";
import { verifyToken } from "./scanner-token";

// Auth + CORS for the native scanner app's API. Unlike the admin panel (which
// uses NextAuth cookies via requireAdmin), the app sends a bearer token issued
// by /api/admin/scanner/login. We always re-read the user from the DB so a
// role/permission change applies on the very next request — never trust the
// token's snapshot for authorization.

// The native app's WebView origin (Capacitor android/iOS) — plus a wildcard
// fallback. Auth is by bearer token, not cookies, so echoing the origin is safe.
export function corsHeaders(request) {
  const origin = request?.headers?.get("origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

// Reply to a CORS preflight.
export function preflight(request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

// JSON response with CORS headers attached.
export function corsJson(request, body, init = {}) {
  return NextResponse.json(body, { ...init, headers: { ...corsHeaders(request), ...(init.headers || {}) } });
}

// Guard a scanner-app endpoint. Returns { error } (a ready 401/403 response) or
// { error: null, user }. `perm` works like requireAdmin: elevated roles always
// pass; staff/moderator pass only if they hold the permission.
export async function requireScannerAuth(request, perm) {
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const payload = token && verifyToken(token);
  if (!payload?.uid) {
    return { error: corsJson(request, { error: "Unauthorized" }, { status: 401 }), user: null };
  }

  await connectDB();
  const user = await User.findById(payload.uid).select("name email role permissions").lean();
  if (!user || !isStaff(user.role)) {
    return { error: corsJson(request, { error: "Forbidden" }, { status: 403 }), user: null };
  }
  if (!isElevated(user.role) && !(typeof perm === "string" && hasPermission(user, perm))) {
    return { error: corsJson(request, { error: "Forbidden" }, { status: 403 }), user: null };
  }
  return { error: null, user };
}
