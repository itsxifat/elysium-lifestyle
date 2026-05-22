import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import Settings from "@/models/Settings";
import { requireAdmin } from "@/lib/auth";

function redact(settings) {
  const s = JSON.parse(JSON.stringify(settings));
  if (s.paymentGateways?.sslcommerz?.storePassword) {
    s.paymentGateways.sslcommerz.storePassword = "••••••••";
  }
  if (s.emailSettings?.smtpPass) {
    s.emailSettings.smtpPass = "••••••••";
  }
  return s;
}

export async function GET() {
  try {
    await connectDB();
    let settings = await Settings.findOne({}).lean();
    if (!settings) {
      const doc = await Settings.create({});
      settings = doc.toObject();
    }
    return NextResponse.json(redact(settings));
  } catch {
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
  }
}

export async function PUT(request) {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    await connectDB();
    const data = await request.json();
    const update = { ...data };

    if (["••••••••", ""].includes(update.paymentGateways?.sslcommerz?.storePassword)) {
      delete update.paymentGateways.sslcommerz.storePassword;
    }
    if (["••••••••", ""].includes(update.emailSettings?.smtpPass)) {
      delete update.emailSettings.smtpPass;
    }

    const settings = await Settings.findOneAndUpdate({}, { $set: update }, { upsert: true, new: true }).lean();
    return NextResponse.json(redact(settings));
  } catch {
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}
