// Repair: attach every order that has no customer record to one.
//
// WHY THIS EXISTS
// ---------------
// Two separate faults left orders with `user: null`:
//
//   1. Until the linking fix, only landing-page orders ran through
//      findOrCreateCustomer at all — storefront guest checkouts and manual/POS
//      orders simply saved `user: null`.
//   2. Worse and longer-lived: the users collection carried a NON-sparse unique
//      index on `email`, under which the *second* email-less guest collides with
//      the first. Since a phone is the only contact most Bangladeshi COD orders
//      carry, nearly every guest creation threw E11000, was swallowed by the
//      routes' try/catch, and the order saved unattached. Run
//      scripts/migrate-guest-users.mjs first — this script refuses to run until
//      that index is sparse.
//
// HOW IT IDENTIFIES PEOPLE
// ------------------------
// A customer is not "a phone" or "an email" — it is the connected component of
// both. Order A is (phone P, email E); order B is (phone P, no email); order C
// is (phone Q, email E). All three are one person: A links P to E, C links E to
// Q. Matching orders one at a time, in arrival order, cannot see that and would
// create up to three records.
//
// So this runs union-find over every contact key first, resolves each component
// to a single customer, and only then writes. That is what makes it safe to
// promise no duplicates.
//
// Within a component:
//   • an existing REAL (sign-in-capable) account wins as the target, then the
//     oldest guest stub, then a newly created stub;
//   • the name is the best one seen across the orders, never "Guest" if a real
//     name exists anywhere;
//   • a created customer is dated from their FIRST order, not from today, so
//     "new customers this month" and "customer since" stay truthful;
//   • the phone and email kept are the ones the customer used most often.
//
// A component holding TWO existing accounts means two records that are really
// one person. Those are reported, and merged onto the winner only with
// --merge-duplicates (orders move, the emptied stub is deleted).
//
//   node scripts/backfill-order-customers.mjs --dry-run
//   node scripts/backfill-order-customers.mjs
//   node scripts/backfill-order-customers.mjs --merge-duplicates
//
// Idempotent: orders that already have a user are left alone, and a second run
// finds nothing to do.
import mongoose from "mongoose";
import { normalizeBdPhone } from "../lib/utils.js";

try {
  const dotenv = await import("dotenv");
  (dotenv.default ?? dotenv).config({ path: process.env.ENV_FILE || ".env.local" });
} catch { /* dotenv not installed — using process.env directly */ }

const { MONGODB_URI } = process.env;
const DRY_RUN = process.argv.includes("--dry-run");
const MERGE_DUPES = process.argv.includes("--merge-duplicates");

if (!MONGODB_URI) {
  console.error("MONGODB_URI is not set.");
  process.exit(1);
}

const lower = (v) => String(v || "").toLowerCase().trim();
const usablePhone = (p) => /^01[3-9]\d{8}$/.test(String(p || ""));

const PLACEHOLDER_NAMES = new Set([
  "", "guest", "guest customer", "customer", "n/a", "na", "-", "--",
  "unknown", "no name", "test", "walk-in", "walk in",
]);
const isPlaceholder = (n) => PLACEHOLDER_NAMES.has(lower(n));

// Prefer a real, complete-looking name. Longer wins among equals because
// "Mohammad Samir" beats "Samir" as a record to search and ship against.
function betterName(a, b) {
  if (isPlaceholder(a)) return isPlaceholder(b) ? (a || "Guest") : b;
  if (isPlaceholder(b)) return a;
  return String(b).trim().length > String(a).trim().length ? String(b).trim() : String(a).trim();
}

// ── union-find over contact keys ──────────────────────────────────────────────
const parent = new Map();
function find(x) {
  if (!parent.has(x)) { parent.set(x, x); return x; }
  let root = x;
  while (parent.get(root) !== root) root = parent.get(root);
  while (parent.get(x) !== root) { const nxt = parent.get(x); parent.set(x, root); x = nxt; }
  return root;
}
function union(a, b) {
  const ra = find(a), rb = find(b);
  if (ra !== rb) parent.set(ra, rb);
  return find(a);
}

await mongoose.connect(MONGODB_URI);
const db = mongoose.connection.db;
const ordersCol = db.collection("orders");
const usersCol = db.collection("users");

// Guard: creating email-less guests needs the sparse index (see note above).
const emailIdx = (await usersCol.indexes()).find((i) => i.key?.email === 1);
if (emailIdx && emailIdx.unique && !emailIdx.sparse) {
  console.error(
    `\nusers.email is a NON-sparse unique index (${emailIdx.name}).\n` +
    `Run: node scripts/migrate-guest-users.mjs   — then re-run this script.\n`
  );
  await mongoose.disconnect();
  process.exit(1);
}

console.log(`\n${DRY_RUN ? "DRY RUN — nothing will be written\n" : ""}`);

// ── 1. index every existing user by their contact keys ────────────────────────
const users = await usersCol
  .find({}, { projection: { name: 1, email: 1, phone: 1, isGuest: 1, role: 1, password: 1, createdAt: 1 } })
  .toArray();

const keyToUser = new Map(); // contact key → user _id (string)
const userById = new Map();
let unnormalizedPhones = [];

for (const u of users) {
  userById.set(String(u._id), u);
  const rawPhone = String(u.phone || "");
  const p = normalizeBdPhone(rawPhone);
  const e = lower(u.email);
  if (rawPhone && rawPhone !== p) unnormalizedPhones.push({ _id: u._id, from: rawPhone, to: p });
  if (p) { const k = "p:" + p; if (!keyToUser.has(k)) keyToUser.set(k, String(u._id)); union(k, k); }
  if (e) { const k = "e:" + e; if (!keyToUser.has(k)) keyToUser.set(k, String(u._id)); union(k, k); }
  // A user's own phone and email are, by definition, the same person.
  if (p && e) union("p:" + p, "e:" + e);
}

console.log(`users indexed            : ${users.length}`);

// ── 2. collect orphan orders and union their contact keys ─────────────────────
const orphans = await ordersCol
  .find({ $or: [{ user: null }, { user: { $exists: false } }] })
  .project({ orderNumber: 1, shippingAddress: 1, guestEmail: 1, source: 1, createdAt: 1 })
  .sort({ createdAt: 1 })
  .toArray();

console.log(`orders with no customer  : ${orphans.length}`);

const noContact = [];
const orderKeys = new Map(); // order _id (string) → representative key

for (const o of orphans) {
  const a = o.shippingAddress || {};
  const p = normalizeBdPhone(a.phone || "");
  const e = lower(o.guestEmail || a.email);
  const keys = [];
  if (p) keys.push("p:" + p);
  if (e) keys.push("e:" + e);

  if (!keys.length) { noContact.push(o); continue; }
  let root = find(keys[0]);
  for (let i = 1; i < keys.length; i++) root = union(keys[i], root);
  orderKeys.set(String(o._id), keys[0]);
}

// ── 3. group orders + facts per component ─────────────────────────────────────
const components = new Map(); // root → { orders, name, phones, emails, firstAt, source, users:Set }

function bump(map, k) { if (k) map.set(k, (map.get(k) || 0) + 1); }

for (const o of orphans) {
  const key = orderKeys.get(String(o._id));
  if (!key) continue;
  const root = find(key);
  if (!components.has(root)) {
    components.set(root, {
      orders: [], name: "", phones: new Map(), emails: new Map(),
      firstAt: null, source: "", users: new Set(),
    });
  }
  const c = components.get(root);
  const a = o.shippingAddress || {};
  c.orders.push(o);
  c.name = betterName(c.name, a.name);
  bump(c.phones, normalizeBdPhone(a.phone || ""));
  bump(c.emails, lower(o.guestEmail || a.email));
  if (!c.firstAt || (o.createdAt && o.createdAt < c.firstAt)) c.firstAt = o.createdAt;
  if (!c.source) c.source = o.source || "website";
}

// Which existing users fall inside each component?
for (const [key, uid] of keyToUser) {
  const root = find(key);
  if (components.has(root)) components.get(root).users.add(uid);
}

// The contact detail the customer used most often is the one worth storing.
const topOf = (m) => {
  let best = "", n = -1;
  for (const [k, v] of m) if (k && v > n) { best = k; n = v; }
  return best;
};

// ── 4. resolve each component to one customer ─────────────────────────────────
const stats = { linked: 0, created: 0, attachedExisting: 0, skipped: noContact.length, failed: 0, merged: 0 };
const dupeComponents = [];
const now = new Date();

for (const [root, c] of components) {
  const existingIds = [...c.users];

  // Pick the target: a sign-in-capable account first, then the oldest record.
  let targetId = null;
  if (existingIds.length) {
    const cands = existingIds.map((id) => userById.get(id)).filter(Boolean);
    cands.sort((x, y) => {
      const xr = (x.password || (x.role && x.role !== "customer")) ? 0 : 1;
      const yr = (y.password || (y.role && y.role !== "customer")) ? 0 : 1;
      if (xr !== yr) return xr - yr;
      return new Date(x.createdAt || 0) - new Date(y.createdAt || 0);
    });
    targetId = String(cands[0]._id);
    if (cands.length > 1) dupeComponents.push({ target: cands[0], others: cands.slice(1), orders: c.orders.length });
  }

  const phone = topOf(c.phones);
  const email = topOf(c.emails);

  if (!targetId) {
    // Nothing on file — mint the guest stub the app would have made at the time.
    const doc = {
      name: isPlaceholder(c.name) ? "Guest" : c.name,
      role: "customer",
      isGuest: true,
      guestSource: c.source || "",
      emailVerified: false,
      permissions: [],
      // Dated from their first order so customer-since and "new this month" are true.
      createdAt: c.firstAt || now,
      updatedAt: now,
    };
    if (phone) doc.phone = phone;
    if (email) doc.email = email;

    if (DRY_RUN) {
      targetId = String(new mongoose.Types.ObjectId());
    } else {
      try {
        const res = await usersCol.insertOne(doc);
        targetId = String(res.insertedId);
      } catch (err) {
        stats.failed += c.orders.length;
        console.error(`  ! could not create customer for ${phone || email}: ${err.message}`);
        continue;
      }
    }
    stats.created++;
  } else {
    stats.attachedExisting++;
    // Fill gaps on the existing record from what the orders taught us.
    const u = userById.get(targetId);
    if (u && !DRY_RUN) {
      const patch = {};
      if (phone && !normalizeBdPhone(u.phone || "")) patch.phone = phone;
      if (email && !lower(u.email) && u.isGuest) patch.email = email;
      if (u.isGuest && isPlaceholder(u.name) && !isPlaceholder(c.name)) patch.name = c.name;
      if (u.isGuest && c.firstAt && u.createdAt && c.firstAt < u.createdAt) patch.createdAt = c.firstAt;
      if (Object.keys(patch).length) {
        try { await usersCol.updateOne({ _id: u._id }, { $set: { ...patch, updatedAt: now } }); }
        catch (err) { console.error(`  ! enrich failed for ${u._id}: ${err.message}`); }
      }
    }
  }

  if (!DRY_RUN) {
    const ids = c.orders.map((o) => o._id);
    const res = await ordersCol.updateMany({ _id: { $in: ids } }, { $set: { user: new mongoose.Types.ObjectId(targetId) } });
    stats.linked += res.modifiedCount || 0;
  } else {
    stats.linked += c.orders.length;
  }
}

// ── 5. legacy user phones that were never normalised ──────────────────────────
if (unnormalizedPhones.length) {
  console.log(`\nusers with an unnormalised phone: ${unnormalizedPhones.length}`);
  for (const u of unnormalizedPhones) {
    console.log(`  ${u.from}  →  ${u.to}`);
    if (DRY_RUN) continue;
    // Only rewrite when it doesn't collide with another record's phone.
    const clash = await usersCol.findOne({ _id: { $ne: u._id }, phone: u.to }, { projection: { _id: 1 } });
    if (clash) { console.log(`    (skipped — ${u.to} already belongs to ${clash._id})`); continue; }
    await usersCol.updateOne({ _id: u._id }, { $set: { phone: u.to, updatedAt: now } });
  }
}

// ── 6. duplicate accounts that turned out to be one person ────────────────────
if (dupeComponents.length) {
  console.log(`\n${dupeComponents.length} identity group(s) hold more than one account:`);
  for (const d of dupeComponents) {
    console.log(`  keep ${d.target.name} <${d.target.email || d.target.phone}>  +  ` +
      d.others.map((o) => `${o.name} <${o.email || o.phone}>`).join(", "));
  }
  if (MERGE_DUPES && !DRY_RUN) {
    for (const d of dupeComponents) {
      for (const other of d.others) {
        if (other.password || (other.role && other.role !== "customer")) {
          console.log(`  – ${other.name}: has sign-in access, not merged`);
          continue;
        }
        const moved = await ordersCol.updateMany({ user: other._id }, { $set: { user: d.target._id } });
        await usersCol.deleteOne({ _id: other._id });
        stats.merged++;
        console.log(`  merged ${other.name} into ${d.target.name} (${moved.modifiedCount} orders moved)`);
      }
    }
  } else if (!MERGE_DUPES) {
    console.log(`  (re-run with --merge-duplicates to fold these together)`);
  }
}

if (noContact.length) {
  console.log(`\n${noContact.length} order(s) carry neither phone nor email and cannot be attributed:`);
  for (const o of noContact.slice(0, 20)) console.log(`  ${o.orderNumber || o._id}`);
  if (noContact.length > 20) console.log(`  … and ${noContact.length - 20} more`);
}

const after = DRY_RUN ? users.length + stats.created : await usersCol.countDocuments({});
console.log(
  `\n${DRY_RUN ? "Would apply" : "Done"}:\n` +
  `  orders linked            : ${stats.linked}\n` +
  `  customers created        : ${stats.created}\n` +
  `  matched to existing      : ${stats.attachedExisting}\n` +
  `  duplicates merged        : ${stats.merged}\n` +
  `  unattributable orders    : ${stats.skipped}\n` +
  `  failed                   : ${stats.failed}\n` +
  `  customers now            : ${after}\n`
);

await mongoose.disconnect();
