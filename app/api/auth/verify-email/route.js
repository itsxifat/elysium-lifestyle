import { NextResponse } from "next/server";
import crypto from "crypto";
import { connectDB } from "@/lib/mongoose";
import User from "@/models/User";
import { checkRateLimit } from "@/lib/rate-limit";
import { completeGuestClaim } from "@/lib/customer-link";

const MAX_OTP_ATTEMPTS = 5;

// Constant-time string compare so a wrong OTP can't be inferred from timing.
function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export async function POST(request) {
  try {
    const limited = checkRateLimit(request, "verify-email", { limit: 10, windowMs: 10 * 60 * 1000 });
    if (limited) return limited;

    const { email, otp } = await request.json();
    if (!email || !otp) return NextResponse.json({ error: "Email and OTP are required" }, { status: 400 });

    await connectDB();
    const user = await User.findOne({ email: email.toLowerCase() }).select(
      "+verificationOTP +verificationOTPExpiry +verificationOTPAttempts"
    );

    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    if (user.emailVerified) return NextResponse.json({ message: "Already verified" });

    if (!user.verificationOTP || user.verificationOTPExpiry < new Date()) {
      return NextResponse.json({ error: "OTP has expired. Request a new one." }, { status: 400 });
    }

    // Too many wrong guesses — burn the code so it can't be brute-forced; force a resend.
    if ((user.verificationOTPAttempts || 0) >= MAX_OTP_ATTEMPTS) {
      await User.findByIdAndUpdate(user._id, {
        verificationOTP: null,
        verificationOTPExpiry: null,
        verificationOTPAttempts: 0,
      });
      return NextResponse.json(
        { error: "Too many incorrect attempts. Please request a new code." },
        { status: 429 }
      );
    }

    if (!safeEqual(user.verificationOTP, otp)) {
      await User.findByIdAndUpdate(user._id, { $inc: { verificationOTPAttempts: 1 } });
      const remaining = MAX_OTP_ATTEMPTS - (user.verificationOTPAttempts || 0) - 1;
      return NextResponse.json(
        { error: remaining > 0 ? `Invalid OTP. ${remaining} attempt(s) left.` : "Invalid OTP." },
        { status: 400 }
      );
    }

    await User.findByIdAndUpdate(user._id, {
      emailVerified: true,
      verificationOTP: null,
      verificationOTPExpiry: null,
      verificationOTPAttempts: 0,
    });

    // If this account started life as a guest stub (a landing-page order placed
    // before they ever signed up), promote it now and fold in any other stub
    // sharing their phone, so every past order lands in this one account.
    await completeGuestClaim(user._id).catch((e) => console.error("[verify] guest claim:", e.message));

    return NextResponse.json({ success: true, message: "Email verified successfully" });
  } catch (err) {
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
