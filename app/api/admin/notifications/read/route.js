import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import Notification from "@/models/Notification";
import { notificationFilterFor } from "@/lib/notifications";

// Mark notifications read for the current member. Body: { id } for one, or
// { all: true } for everything in their feed.
export async function POST(request) {
  const { error, session } = await requireStaff();
  if (error) return error;

  try {
    const { id, all } = await request.json();
    await connectDB();

    const base = all ? notificationFilterFor(session.user) : { _id: id, ...notificationFilterFor(session.user) };
    await Notification.updateMany(base, { $addToSet: { readBy: session.user.id } });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to update notifications" }, { status: 500 });
  }
}
