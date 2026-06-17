import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import User from "@/models/User";
import { resetPin } from "@/lib/pin";
import { canManageRole } from "@/lib/permissions";
import { notifyUser } from "@/lib/notifications";

// Superadmin/admin clears a staff member's PIN, forcing them to create a new one
// on their next panel entry. Subject to the same authority rules as editing the
// account (you can't reset someone of equal/greater rank unless superadmin).
export async function POST(request) {
  const { error, session } = await requireAdmin();
  if (error) return error;

  try {
    const { userId } = await request.json();
    if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

    await connectDB();
    const target = await User.findById(userId).select("role name").lean();
    if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

    if (!canManageRole(session.user.role, target.role)) {
      return NextResponse.json({ error: "You cannot reset this account's PIN" }, { status: 403 });
    }

    await resetPin(userId);

    notifyUser(userId, {
      type: "pin_reset",
      severity: "warning",
      title: "Your security PIN was reset",
      body: `${session.user.name || "An administrator"} reset your PIN. Please create a new one.`,
      actor: session.user.id,
      actorName: session.user.name || session.user.email || "Admin",
    }).catch(() => {});

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to reset PIN" }, { status: 500 });
  }
}
