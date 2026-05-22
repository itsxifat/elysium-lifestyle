import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import User from "@/models/User";

export async function POST(request) {
  try {
    const { email, otp } = await request.json();
    if (!email || !otp) return NextResponse.json({ error: "Email and OTP are required" }, { status: 400 });

    await connectDB();
    const user = await User.findOne({ email: email.toLowerCase() }).select("+verificationOTP +verificationOTPExpiry");

    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    if (user.emailVerified) return NextResponse.json({ message: "Already verified" });
    if (!user.verificationOTP || user.verificationOTP !== otp) {
      return NextResponse.json({ error: "Invalid OTP" }, { status: 400 });
    }
    if (user.verificationOTPExpiry < new Date()) {
      return NextResponse.json({ error: "OTP has expired. Request a new one." }, { status: 400 });
    }

    await User.findByIdAndUpdate(user._id, {
      emailVerified: true,
      verificationOTP: null,
      verificationOTPExpiry: null,
    });

    return NextResponse.json({ success: true, message: "Email verified successfully" });
  } catch (err) {
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
