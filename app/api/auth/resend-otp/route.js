import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import User from "@/models/User";
import { sendEmail, otpTemplate } from "@/lib/email";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request) {
  try {
    const limited = checkRateLimit(request, "resend-otp", { limit: 4, windowMs: 15 * 60 * 1000 });
    if (limited) return limited;

    const { email } = await request.json();
    if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 });

    await connectDB();
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    if (user.emailVerified) return NextResponse.json({ message: "Already verified" });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await User.findByIdAndUpdate(user._id, {
      verificationOTP: otp,
      verificationOTPExpiry: new Date(Date.now() + 15 * 60 * 1000),
      verificationOTPAttempts: 0,
    });

    await sendEmail({
      to: email,
      subject: "Your new verification code — Elysium Lifestyle",
      html: otpTemplate(user.name, otp),
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
