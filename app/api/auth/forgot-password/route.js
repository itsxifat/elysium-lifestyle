import { NextResponse } from "next/server";
import crypto from "crypto";
import { connectDB } from "@/lib/mongoose";
import User from "@/models/User";
import { sendEmail, forgotPasswordTemplate } from "@/lib/email";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request) {
  try {
    const limited = checkRateLimit(request, "forgot-password", { limit: 5, windowMs: 15 * 60 * 1000 });
    if (limited) return limited;

    const { email } = await request.json();
    if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 });

    await connectDB();
    const user = await User.findOne({ email: email.toLowerCase() });

    // Always return success to prevent email enumeration
    if (!user || !user.password) {
      return NextResponse.json({ success: true });
    }

    const token = crypto.randomBytes(32).toString("hex");
    await User.findByIdAndUpdate(user._id, {
      resetToken: token,
      resetTokenExpiry: new Date(Date.now() + 60 * 60 * 1000),
    });

    const resetUrl = `${process.env.NEXTAUTH_URL}/auth/reset-password?token=${token}`;
    await sendEmail({
      to: email,
      subject: "Reset your Elysium Lifestyle password",
      html: forgotPasswordTemplate(user.name, resetUrl),
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
