import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { connectDB } from "./mongoose";
import User from "@/models/User";
import { rateLimit, getClientIp } from "./rate-limit";

// ── Admin security PIN ───────────────────────────────────────────────────────
// Every panel member must create a 6-digit PIN. It's required as a second factor
// for critical actions and is brute-force protected on two axes:
//   1. Per-account: lock the account for LOCK_MS after MAX_ATTEMPTS wrong tries.
//   2. Per-IP: a coarse rate limit on the verify path (lib/rate-limit.js).
// The PIN is stored as a bcrypt hash on User.adminPin (select:false).

export const PIN_REGEX = /^\d{6}$/;
export const MAX_ATTEMPTS = 5;
export const LOCK_MS = 15 * 60 * 1000; // 15 minutes

export function isValidPinFormat(pin) {
  return typeof pin === "string" && PIN_REGEX.test(pin);
}

// Create / change the PIN. `currentPin` is required only when one already exists.
export async function setPin(userId, pin, currentPin) {
  if (!isValidPinFormat(pin)) {
    return { ok: false, error: "PIN must be exactly 6 digits" };
  }
  await connectDB();
  const user = await User.findById(userId).select("+adminPin");
  if (!user) return { ok: false, error: "User not found" };

  if (user.adminPin) {
    // Changing an existing PIN → must prove knowledge of the current one.
    if (!currentPin || !(await bcrypt.compare(String(currentPin), user.adminPin))) {
      return { ok: false, error: "Current PIN is incorrect" };
    }
  }

  user.adminPin = await bcrypt.hash(pin, 12);
  user.pinSetAt = new Date();
  user.pinFailedAttempts = 0;
  user.pinLockedUntil = null;
  await user.save();
  return { ok: true };
}

export async function hasPin(userId) {
  await connectDB();
  const user = await User.findById(userId).select("pinSetAt").lean();
  return !!user?.pinSetAt;
}

// Verify a PIN with brute-force protection. Returns { ok, error, code, remaining,
// lockedUntil }. `code` is one of: ok | no_pin | locked | invalid | bad_format.
export async function verifyPin(userId, pin) {
  if (!isValidPinFormat(pin)) {
    return { ok: false, code: "bad_format", error: "Enter your 6-digit PIN" };
  }
  await connectDB();
  const user = await User.findById(userId).select("+adminPin +pinFailedAttempts pinLockedUntil");
  if (!user) return { ok: false, code: "no_pin", error: "User not found" };
  if (!user.adminPin) {
    return { ok: false, code: "no_pin", error: "No PIN set. Please create one first." };
  }

  const now = Date.now();
  if (user.pinLockedUntil && user.pinLockedUntil.getTime() > now) {
    const retryAfter = Math.ceil((user.pinLockedUntil.getTime() - now) / 1000);
    return { ok: false, code: "locked", error: "Too many wrong attempts. Try again later.", retryAfter, lockedUntil: user.pinLockedUntil };
  }

  const match = await bcrypt.compare(pin, user.adminPin);
  if (!match) {
    user.pinFailedAttempts = (user.pinFailedAttempts || 0) + 1;
    let lockedUntil = null;
    if (user.pinFailedAttempts >= MAX_ATTEMPTS) {
      lockedUntil = new Date(now + LOCK_MS);
      user.pinLockedUntil = lockedUntil;
      user.pinFailedAttempts = 0; // reset the counter for the next window
    }
    await user.save();
    const remaining = lockedUntil ? 0 : Math.max(0, MAX_ATTEMPTS - user.pinFailedAttempts);
    return {
      ok: false,
      code: lockedUntil ? "locked" : "invalid",
      error: lockedUntil
        ? "Too many wrong attempts. Locked for 15 minutes."
        : `Incorrect PIN. ${remaining} attempt${remaining === 1 ? "" : "s"} left.`,
      remaining,
      lockedUntil,
    };
  }

  // Success → clear any accumulated failures.
  if (user.pinFailedAttempts || user.pinLockedUntil) {
    user.pinFailedAttempts = 0;
    user.pinLockedUntil = null;
    await user.save();
  }
  return { ok: true, code: "ok" };
}

// Clear a user's PIN (superadmin reset). Forces re-creation on next entry.
export async function resetPin(userId) {
  await connectDB();
  await User.findByIdAndUpdate(userId, {
    $set: { adminPin: null, pinSetAt: null, pinFailedAttempts: 0, pinLockedUntil: null },
  });
  return { ok: true };
}

// API guard: verify the PIN for the current session, with a per-IP rate limit on
// top of the per-account lockout. Returns a ready-to-send NextResponse on
// failure, or null when the PIN is valid (caller may proceed).
export async function requirePin(session, pin, request) {
  const ip = getClientIp(request);
  const rl = rateLimit(`pin:${ip}`, { limit: 10, windowMs: 10 * 60 * 1000 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many PIN attempts. Please try again later.", code: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  const result = await verifyPin(session.user.id, pin);
  if (result.ok) return null;

  const status = result.code === "locked" ? 423 : result.code === "no_pin" ? 428 : 403;
  const headers = result.retryAfter ? { "Retry-After": String(result.retryAfter) } : undefined;
  return NextResponse.json({ error: result.error, code: result.code, lockedUntil: result.lockedUntil }, { status, headers });
}
