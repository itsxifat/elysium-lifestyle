// Central role + permission model for the admin panel.
//
// Pure data + helpers (no imports) so it can be used from server routes, the
// edge-free auth layer, and client components alike.
//
// Design:
//  - Every staff member has a single ROLE (superadmin > admin > moderator > staff).
//  - Each role grants a DEFAULT set of permission keys.
//  - A superadmin can additionally grant individual permission keys to a user via
//    `user.permissions[]` (additive overrides) — so "permission control" is real,
//    not just fixed roles.
//  - Effective permissions = role defaults ∪ user.permissions. superadmin/admin
//    implicitly hold every permission.

// ── Roles ──────────────────────────────────────────────────────────────────────
export const ROLES = {
  SUPERADMIN: "superadmin",
  ADMIN: "admin",
  MODERATOR: "moderator",
  STAFF: "staff",
  CUSTOMER: "customer",
};

// Anyone who may enter the admin panel (everything except plain customers).
export const STAFF_ROLES = [ROLES.SUPERADMIN, ROLES.ADMIN, ROLES.MODERATOR, ROLES.STAFF];

// The elevated tier — implicitly holds ALL permissions.
export const ELEVATED_ROLES = [ROLES.SUPERADMIN, ROLES.ADMIN];

// Higher rank = more authority. Used to prevent privilege escalation (a user can
// never create/assign a role at or above their own, except superadmins).
export const ROLE_RANK = {
  [ROLES.SUPERADMIN]: 100,
  [ROLES.ADMIN]: 80,
  [ROLES.MODERATOR]: 50,
  [ROLES.STAFF]: 30,
  [ROLES.CUSTOMER]: 0,
};

export const ROLE_LABELS = {
  [ROLES.SUPERADMIN]: "Super Admin",
  [ROLES.ADMIN]: "Admin",
  [ROLES.MODERATOR]: "Moderator",
  [ROLES.STAFF]: "Staff",
  [ROLES.CUSTOMER]: "Customer",
};

export const ROLE_DESCRIPTIONS = {
  [ROLES.SUPERADMIN]: "Full control, incl. managing staff & roles.",
  [ROLES.ADMIN]: "Full store management.",
  [ROLES.MODERATOR]: "Manage orders & catalog.",
  [ROLES.STAFF]: "Create & process orders (POS).",
  [ROLES.CUSTOMER]: "Shop only — no panel access.",
};

// ── Permission keys ──────────────────────────────────────────────────────────────
// Grouped for the permission editor UI. Keys are the source of truth used by API
// guards (requireAdmin("orders.manage")) and sidebar/nav filtering.
export const PERMISSIONS = {
  "orders.view": "View orders",
  "orders.create": "Create orders (POS / manual sale)",
  "orders.manage": "Update order & payment status",
  "products.manage": "Create, edit & delete products",
  "categories.manage": "Manage categories",
  "discounts.manage": "Manage discounts & coupons",
  "customers.view": "View customers",
  "content.manage": "Manage hero & navbar",
  "tracking.manage": "Manage tracking & analytics",
  "settings.manage": "Manage store settings & shipping",
  "users.manage": "Manage staff accounts & roles",
};

export const PERMISSION_GROUPS = [
  { label: "Orders", keys: ["orders.view", "orders.create", "orders.manage"] },
  { label: "Catalog", keys: ["products.manage", "categories.manage", "discounts.manage"] },
  { label: "Customers", keys: ["customers.view"] },
  { label: "Site", keys: ["content.manage", "tracking.manage", "settings.manage"] },
  { label: "Administration", keys: ["users.manage"] },
];

const ALL_PERMISSIONS = Object.keys(PERMISSIONS);

// ── Role → default permissions ───────────────────────────────────────────────────
export const ROLE_PERMISSIONS = {
  [ROLES.SUPERADMIN]: [...ALL_PERMISSIONS],
  [ROLES.ADMIN]: [...ALL_PERMISSIONS],
  [ROLES.MODERATOR]: [
    "orders.view",
    "orders.create",
    "orders.manage",
    "products.manage",
    "categories.manage",
    "discounts.manage",
    "customers.view",
  ],
  [ROLES.STAFF]: ["orders.view", "orders.create", "orders.manage"],
  [ROLES.CUSTOMER]: [],
};

// ── Helpers ──────────────────────────────────────────────────────────────────────
export function isStaff(role) {
  return STAFF_ROLES.includes(role);
}

export function isElevated(role) {
  return ELEVATED_ROLES.includes(role);
}

// Role defaults ∪ explicit overrides. superadmin/admin → all permissions.
export function getEffectivePermissions(user) {
  if (!user) return [];
  if (isElevated(user.role)) return [...ALL_PERMISSIONS];
  const base = ROLE_PERMISSIONS[user.role] || [];
  const overrides = Array.isArray(user.permissions) ? user.permissions : [];
  return Array.from(new Set([...base, ...overrides]));
}

export function hasPermission(user, key) {
  if (!user || !isStaff(user.role)) return false;
  if (isElevated(user.role)) return true;
  return getEffectivePermissions(user).includes(key);
}

// Can `actor` assign `targetRole` / manage a user of `targetRole`?
// Only superadmins may touch the elevated tier; everyone else may manage roles
// strictly below their own rank.
export function canManageRole(actorRole, targetRole) {
  if (actorRole === ROLES.SUPERADMIN) return true;
  if (!ELEVATED_ROLES.includes(actorRole)) return false; // moderator/staff can't manage roles
  // admin: can manage anything below admin, never admin/superadmin
  return (ROLE_RANK[targetRole] ?? 0) < ROLE_RANK[ROLES.ADMIN];
}

// Roles an actor is allowed to assign (for building <select> options safely).
export function assignableRoles(actorRole) {
  return Object.keys(ROLE_RANK).filter((r) => canManageRole(actorRole, r));
}
