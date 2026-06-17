import { connectDB } from "./mongoose";
import Notification from "@/models/Notification";
import { isElevated } from "./permissions";

// Fire-and-forget notification creation. Callers should NOT await this in a hot
// path — wrap with .catch(() => {}) — so a notification failure never breaks the
// underlying action (order edit, status change, etc.).
export async function createNotification(opts = {}) {
  try {
    await connectDB();
    return await Notification.create({
      audience: opts.audience,
      recipient: opts.recipient || null,
      type: opts.type || "system",
      severity: opts.severity || "info",
      title: opts.title,
      body: opts.body || "",
      link: opts.link || "",
      actor: opts.actor || null,
      actorName: opts.actorName || "",
      order: opts.order || null,
    });
  } catch (err) {
    console.error("[notifications] create failed:", err?.message);
    return null;
  }
}

// To every superadmin + admin.
export function notifyAdmins(opts) {
  return createNotification({ ...opts, audience: "admins" });
}

// To every moderator + staff (broadcast an admin sends down).
export function notifyStaff(opts) {
  return createNotification({ ...opts, audience: "staff" });
}

// To one specific person.
export function notifyUser(recipientId, opts) {
  return createNotification({ ...opts, audience: "user", recipient: recipientId });
}

// Mongo filter for the notifications a given panel user should see:
//  - elevated (superadmin/admin) → the "admins" feed
//  - moderator/staff             → the "staff" feed
//  - anyone                      → notifications addressed directly to them
export function notificationFilterFor(user) {
  const ors = [{ audience: "user", recipient: user.id }];
  if (isElevated(user.role)) ors.push({ audience: "admins" });
  else ors.push({ audience: "staff" });
  return { $or: ors };
}
