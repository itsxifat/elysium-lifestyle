import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/mongoose";
import User from "@/models/User";
import { sendEmail, otpTemplate } from "@/lib/email";
import { checkRateLimit } from "@/lib/rate-limit";
import { normalizeBdPhone } from "@/lib/utils";
import { findClaimableGuest, claimGuestAccount } from "@/lib/customer-link";

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

const otpFields = (otp) => ({
  verificationOTP: otp,
  verificationOTPExpiry: new Date(Date.now() + 15 * 60 * 1000),
  verificationOTPAttempts: 0,
});

export async function POST(request) {
  try {
    const limited = checkRateLimit(request, "register", { limit: 5, windowMs: 15 * 60 * 1000 });
    if (limited) return limited;

    const { name, email, password, phone } = await request.json();

    if (!name || !email || !password) {
      return NextResponse.json({ error: "Name, email, and password are required" }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }

    await connectDB();

    const cleanEmail = email.toLowerCase().trim();
    // Optional at sign-up, but it's how we find the guest stub holding any orders
    // this person placed from a landing page without ever giving an email.
    const cleanPhone = phone ? normalizeBdPhone(phone) : "";

    const existingUser = await User.findOne({ email: cleanEmail }).select("+password");

    // A real account already owns this address.
    if (existingUser && (existingUser.password || !existingUser.isGuest)) {
      if (!existingUser.emailVerified) {
        // Unverified sign-up — resend the code rather than leak that it exists.
        const otp = generateOTP();
        await User.findByIdAndUpdate(existingUser._id, otpFields(otp));
        await sendEmail({
          to: cleanEmail,
          subject: "Verify your Elysium Lifestyle account",
          html: otpTemplate(existingUser.name, otp),
        });
        return NextResponse.json({ requiresVerification: true, email: cleanEmail }, { status: 200 });
      }
      return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const otp = generateOTP();

    // Is there a guest stub to take over — matched by this email, or by a phone
    // they've ordered with before? Claiming it rather than creating a new user is
    // what makes their past landing-page orders appear in the new account.
    const guest = await findClaimableGuest({ email: cleanEmail, phone: cleanPhone });

    let user;
    if (guest) {
      user = await claimGuestAccount(guest, { name, email: cleanEmail, phone: cleanPhone, hashedPassword });
      await User.findByIdAndUpdate(user._id, otpFields(otp));
    } else {
      user = await User.create({
        name: name.trim(),
        email: cleanEmail,
        password: hashedPassword,
        ...(cleanPhone ? { phone: cleanPhone } : {}),
        role: "customer",
        emailVerified: false,
        ...otpFields(otp),
      });
    }

    await sendEmail({
      to: cleanEmail,
      subject: "Verify your Elysium Lifestyle account",
      html: otpTemplate(user.name, otp),
    });

    return NextResponse.json(
      { requiresVerification: true, email: cleanEmail, message: "Account created. Please verify your email." },
      { status: 201 }
    );
  } catch (error) {
    console.error("Register error:", error);
    if (error?.code === 11000) {
      return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
