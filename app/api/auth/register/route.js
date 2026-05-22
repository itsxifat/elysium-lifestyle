import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/mongoose";
import User from "@/models/User";
import { sendEmail, otpTemplate } from "@/lib/email";

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function POST(request) {
  try {
    const { name, email, password } = await request.json();

    if (!name || !email || !password) {
      return NextResponse.json({ error: "Name, email, and password are required" }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }

    await connectDB();

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      if (!existingUser.emailVerified) {
        // Resend OTP for unverified users
        const otp = generateOTP();
        await User.findByIdAndUpdate(existingUser._id, {
          verificationOTP: otp,
          verificationOTPExpiry: new Date(Date.now() + 15 * 60 * 1000),
        });
        await sendEmail({
          to: email,
          subject: "Verify your Elysium Lifestyle account",
          html: otpTemplate(existingUser.name, otp),
        });
        return NextResponse.json({ requiresVerification: true, email }, { status: 200 });
      }
      return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const otp = generateOTP();

    const user = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      role: "customer",
      emailVerified: false,
      verificationOTP: otp,
      verificationOTPExpiry: new Date(Date.now() + 15 * 60 * 1000),
    });

    await sendEmail({
      to: email,
      subject: "Verify your Elysium Lifestyle account",
      html: otpTemplate(user.name, otp),
    });

    return NextResponse.json(
      { requiresVerification: true, email, message: "Account created. Please verify your email." },
      { status: 201 }
    );
  } catch (error) {
    console.error("Register error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
