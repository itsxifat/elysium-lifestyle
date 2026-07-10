export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import Settings from "@/models/Settings";
import { STAFF_ROLES } from "@/lib/permissions";
import {
  NOTIFICATION_EVENT_KEYS,
  effectiveRouting,
} from "@/lib/notification-events";

// Read the current notification routing matrix (defaults overlaid with any saved
// config). Elevated / settings.manage only — it exposes team structure.
export async function GET() {
  const { error } = await requireAdmin("settings.manage");
  if (error) return error;

  await connectDB();
  const settings = await Settings.findOne({}, { notifications: 1 }).lean();
  return NextResponse.json({ routing: effectiveRouting(settings?.notifications?.routing) });
}

// Save the routing matrix. Body: { routing: { <eventKey>: [role, …], … } }.
// Unknown event keys and unknown roles are dropped; every known event is stored
// so a saved-but-empty event genuinely means "nobody".
export async function PUT(request) {
  const { error } = await requireAdmin("settings.manage");
  if (error) return error;

  try {
    const data = await request.json();
    const input = data?.routing && typeof data.routing === "object" ? data.routing : {};

    const clean = {};
    for (const key of NOTIFICATION_EVENT_KEYS) {
      const roles = Array.isArray(input[key]) ? input[key] : [];
      // Keep canonical role order, drop anything that isn't a real panel role.
      clean[key] = STAFF_ROLES.filter((r) => roles.includes(r));
    }

    await connectDB();
    await Settings.findOneAndUpdate(
      {},
      { $set: { "notifications.routing": clean } },
      { upsert: true, new: true }
    );

    return NextResponse.json({ routing: effectiveRouting(clean) });
  } catch (err) {
    console.error("PUT /api/admin/notifications/settings error:", err?.message);
    return NextResponse.json({ error: "Failed to save notification rules" }, { status: 500 });
  }
}
