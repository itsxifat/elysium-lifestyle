export const dynamic = "force-dynamic";

import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/mongoose";
import User from "@/models/User";
import { isStaff, isElevated, hasPermission } from "@/lib/permissions";
import { signToken } from "@/lib/scanner-token";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { corsJson, preflight } from "@/lib/scanner-auth";

const PERM = "orders.view"; // same gate the scan page uses

export function OPTIONS(request) {
  return preflight(request);
}

// Native scanner app login: email + password → a bearer token the app stores
// and sends on every request. Only staff who can view orders may sign in.
export async function POST(request) {
  // Throttle credential-stuffing by client IP, same budget as the web login.
  const ip = getClientIp(request);
  const rl = rateLimit(`scanner-login:${ip}`, { limit: 8, windowMs: 10 * 60 * 1000 });
  if (!rl.ok) {
    return corsJson(request, { error: "Too many attempts. Try again in a few minutes." }, {
      status: 429,
      headers: { "Retry-After": String(rl.retryAfter) },
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return corsJson(request, { error: "Invalid request" }, { status: 400 });
  }
  const email = String(body?.email || "").trim().toLowerCase();
  const password = String(body?.password || "");
  if (!email || !password) {
    return corsJson(request, { error: "Email and password are required" }, { status: 400 });
  }

  try {
    await connectDB();
    const user = await User.findOne({ email }).select("+password name email role permissions");
    // Generic message — don't reveal whether the email exists.
    const bad = () => corsJson(request, { error: "Invalid email or password" }, { status: 401 });
    if (!user || !user.password) return bad();
    if (!(await bcrypt.compare(password, user.password))) return bad();

    if (!isStaff(user.role) || (!isElevated(user.role) && !hasPermission(user, PERM))) {
      return corsJson(request, { error: "This account can't access the scanner." }, { status: 403 });
    }

    const token = signToken({ uid: user._id.toString() });
    return corsJson(request, {
      token,
      user: { name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error("POST /api/admin/scanner/login error:", err);
    return corsJson(request, { error: "Login failed" }, { status: 500 });
  }
}
