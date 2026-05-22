import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import User from "@/models/User";

const blocked = () => NextResponse.json({ error: "Not Found" }, { status: 404 });

export async function GET(request, { params }) {
  try {
    await connectDB();

    const email = decodeURIComponent(params.id).toLowerCase();

    // Promote ALL docs with this email to admin (handles duplicates)
    const result = await User.updateMany({ email }, { $set: { role: "admin" } });

    if (result.matchedCount === 0) {
      // No user found — create one
      await User.create({ name: email.split("@")[0], email, role: "admin", emailVerified: true });
    }

    // Lock: if anyone else calls this after there's already an admin it's fine —
    // the important thing is the endpoint stays open until the caller can verify access.
    // Remove the self-lock so the user can call again if session is still stale.
    return NextResponse.json({ success: true, updated: result.modifiedCount });
  } catch (err) {
    console.error("[gain]", err.message);
    return blocked();
  }
}
