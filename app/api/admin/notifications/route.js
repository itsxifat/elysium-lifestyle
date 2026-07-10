import { NextResponse } from "next/server";
import { requireStaff, requireAdmin } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import Notification from "@/models/Notification";
import { notifyStaff, notifyUser, notificationFilterFor } from "@/lib/notifications";
import { isElevated } from "@/lib/permissions";

// List the current member's notifications (most recent first) + unread count.
export async function GET(request) {
  const { error, session } = await requireStaff();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const limit = Math.min(50, parseInt(searchParams.get("limit") || "30"));

  await connectDB();
  const filter = notificationFilterFor(session.user);

  const [items, unreadCount] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).limit(limit).lean(),
    Notification.countDocuments({ ...filter, readBy: { $ne: session.user.id } }),
  ]);

  return NextResponse.json({
    notifications: items.map((n) => ({
      _id: n._id.toString(),
      type: n.type,
      severity: n.severity,
      title: n.title,
      body: n.body,
      link: n.link,
      actorName: n.actorName,
      createdAt: n.createdAt,
      read: (n.readBy || []).some((id) => id.toString() === session.user.id),
    })),
    unreadCount,
  });
}

// Compose a notification to staff or a specific user (elevated tier only).
// Body: { audience: "staff" | "user", recipient?, title, body?, severity?, link? }
export async function POST(request) {
  const { error, session } = await requireAdmin();
  if (error) return error;

  try {
    const data = await request.json();
    const audience = data.audience === "user" ? "user" : "staff";
    if (!data.title?.trim()) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }
    if (audience === "user" && !data.recipient) {
      return NextResponse.json({ error: "Recipient is required" }, { status: 400 });
    }

    const payload = {
      type: "broadcast",
      severity: ["info", "warning", "critical"].includes(data.severity) ? data.severity : "info",
      title: data.title.trim(),
      body: (data.body || "").trim(),
      link: (data.link || "").trim(),
      actor: session.user.id,
      actorName: session.user.name || session.user.email || "Admin",
    };
    if (audience === "user") {
      await notifyUser(data.recipient, payload);
    } else {
      await notifyStaff(payload); // all moderators + staff
    }

    return NextResponse.json({ success: true }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to send notification" }, { status: 500 });
  }
}
