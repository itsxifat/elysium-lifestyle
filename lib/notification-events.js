// Catalog of in-panel notification EVENTS and the role-routing rules for each.
//
// Every automated notification (new order, status change, return…) is fired for
// a named event key here. Which staff roles actually receive it is configurable
// per event from /admin/notifications/settings — the saved matrix lives in
// Settings.notifications.routing. If an event has no saved config, its
// `defaultRoles` apply.
//
// Pure data + helpers (imports only pure data from ./permissions) so it can be
// used from server routes AND the client settings page alike.
import { ROLES, STAFF_ROLES } from "./permissions";

const { SUPERADMIN, ADMIN, MODERATOR, STAFF } = ROLES;
const ELEVATED = [SUPERADMIN, ADMIN];
const EVERYONE = [...STAFF_ROLES]; // superadmin, admin, moderator, staff

export const NOTIFICATION_EVENTS = [
  {
    key: "order_new",
    group: "Orders",
    label: "New website order",
    desc: "A customer places an order on the storefront.",
    severity: "info",
    defaultRoles: EVERYONE,
  },
  {
    key: "order_new_pos",
    group: "Orders",
    label: "New manual / POS order",
    desc: "Staff create an offline, phone or social-channel order.",
    severity: "info",
    defaultRoles: EVERYONE,
  },
  {
    key: "order_new_landing",
    group: "Orders",
    label: "New landing-page order",
    desc: "A customer orders from a /lp campaign page.",
    severity: "info",
    defaultRoles: EVERYONE,
  },
  {
    key: "order_status",
    group: "Orders",
    label: "Order status changed",
    desc: "A staff member moves an order through the pipeline.",
    severity: "info",
    defaultRoles: ELEVATED,
  },
  {
    key: "order_payment",
    group: "Orders",
    label: "Payment status changed",
    desc: "An order is marked paid or its payment status updated.",
    severity: "info",
    defaultRoles: ELEVATED,
  },
  {
    key: "order_edit",
    group: "Orders",
    label: "Order edited",
    desc: "Items, address or totals on an order are edited.",
    severity: "info",
    defaultRoles: ELEVATED,
  },
  {
    key: "order_payment_method",
    group: "Orders",
    label: "Payment method changed",
    desc: "The payment method on an order is changed (fraud-sensitive).",
    severity: "warning",
    defaultRoles: ELEVATED,
  },
  {
    key: "order_cancelled",
    group: "Orders",
    label: "Order cancelled",
    desc: "An order is cancelled by staff or reported cancelled by the courier.",
    severity: "warning",
    defaultRoles: EVERYONE,
  },
  {
    key: "order_returned",
    group: "Orders",
    label: "Return / partial return",
    desc: "A return is recorded, or the courier reports a partial return.",
    severity: "warning",
    defaultRoles: [SUPERADMIN, ADMIN, MODERATOR],
  },
  {
    key: "order_delivered",
    group: "Orders",
    label: "Order delivered (courier)",
    desc: "The courier marks an order as delivered.",
    severity: "info",
    defaultRoles: ELEVATED,
  },
];

export const NOTIFICATION_EVENT_KEYS = NOTIFICATION_EVENTS.map((e) => e.key);
export const NOTIFICATION_EVENT_MAP = Object.fromEntries(
  NOTIFICATION_EVENTS.map((e) => [e.key, e])
);

// Only ever store/return valid panel roles.
function sanitizeRoles(roles) {
  if (!Array.isArray(roles)) return null;
  return STAFF_ROLES.filter((r) => roles.includes(r)); // keep canonical order, drop junk
}

// The roles subscribed to an event: the saved config if present & valid,
// otherwise the event's built-in defaults.
export function rolesForEvent(eventKey, routing) {
  const saved = sanitizeRoles(routing?.[eventKey]);
  if (saved) return saved;
  const ev = NOTIFICATION_EVENT_MAP[eventKey];
  return ev ? [...ev.defaultRoles] : [];
}

// The full matrix (defaults overlaid with saved config), for the settings UI and
// for persisting a normalized object back to the DB.
export function effectiveRouting(routing) {
  const out = {};
  for (const e of NOTIFICATION_EVENTS) {
    const saved = sanitizeRoles(routing?.[e.key]);
    out[e.key] = saved || [...e.defaultRoles];
  }
  return out;
}
