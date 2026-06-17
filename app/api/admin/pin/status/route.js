import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import User from "@/models/User";

// Does the current panel member have a PIN yet, and are they locked out?
// Drives the force-create gate (components/admin/PinGate.js).
export async function GET() {
  const { error, session } = await requireStaff();
  if (error) return error;

  await connectDB();
  const user = await User.findById(session.user.id).select("pinSetAt pinLockedUntil").lean();
  const lockedUntil =
    user?.pinLockedUntil && user.pinLockedUntil.getTime() > Date.now() ? user.pinLockedUntil : null;

  return NextResponse.json({ hasPin: !!user?.pinSetAt, lockedUntil });
}
