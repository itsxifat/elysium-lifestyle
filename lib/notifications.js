import { connectDB } from "./mongoose";
import Notification from "@/models/Notification";
import Settings from "@/models/Settings";
import { isElevated, ROLES } from "./permissions";
import { rolesForEvent } from "./notification-events";

// Fire-and-forget notification creation. Callers should NOT await this in a hot
// path — wrap with .catch(() => {}) — so a notification failure never breaks the
// underlying action (order edit, status change, etc.).
export async function createNotification(opts = {}) {
  try {
    await connectDB();
    return await Notification.create({
      roles: Array.isArray(opts.roles) ? opts.roles : [],
      audience: opts.audience || null,
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

// Fire a notification for a named EVENT (see lib/notification-events.js). The
// target roles are resolved from the admin-configurable routing matrix in
// Settings — so admins control which roles get which notifications. If no role
// is subscribed, nothing is written. Defaults the row `type` to the event key.
export async function notifyEvent(eventKey, opts = {}) {
  try {
    await connectDB();
    const settings = await Settings.findOne({}, { notifications: 1 }).lean();
    const roles = rolesForEvent(eventKey, settings?.notifications?.routing);
    if (!roles.length) return null;
    return await createNotification({ ...opts, roles, type: opts.type || eventKey });
  } catch (err) {
    console.error("[notifications] notifyEvent failed:", err?.message);
    return null;
  }
}

// Broadcast to an explicit set of roles (used by the admin compose form).
export function notifyRoles(roles, opts) {
  return createNotification({ ...opts, roles });
}

// Broadcast down to moderators + staff (admin "send to all staff" compose).
export function notifyStaff(opts) {
  return notifyRoles([ROLES.MODERATOR, ROLES.STAFF], opts);
}

// To one specific person.
export function notifyUser(recipientId, opts) {
  return createNotification({ ...opts, recipient: recipientId });
}

// Mongo filter for the notifications a given panel user should see:
//  - any row whose `roles` includes the user's role
//  - anything addressed directly to them (`recipient`)
//  - LEGACY audience buckets (rows created before role-routing): elevated →
//    "admins", everyone else → "staff".
export function notificationFilterFor(user) {
  const ors = [
    { roles: user.role },
    { recipient: user.id },
    { audience: isElevated(user.role) ? "admins" : "staff" },
  ];
  return { $or: ors };
}
