import User from "@/models/User";
import Order from "@/models/Order";
import { normalizeBdPhone } from "@/lib/utils";
import { isStaff } from "@/lib/permissions";

// Attaching guest orders to a customer account.
//
// The contract, in two halves:
//
//  1. AT ORDER TIME (findOrCreateCustomer) — match the phone or email against
//     existing users. A hit means the order lands in that person's account and
//     shows up in their order history like any other. A miss creates a GUEST
//     stub: a real User document that holds the order but cannot sign in.
//
//  2. AT REGISTRATION (claimGuestAccount) — when someone signs up with an email
//     and verifies it, we don't create a fresh user; we CLAIM the guest stub
//     that already carries their orders. So the day they finally make an
//     account, their past purchases are simply there.
//
// Guests never authenticate: they have no password, `isGuest` is true, and
// emailVerified is false. Only email verification clears `isGuest`.
//
// EVERY order-creating route must run through findOrCreateCustomer — storefront,
// landing page, ncom, and manual/POS alike. An order that ends up with
// `user: null` is a customer we have lost track of, not a minor blemish: they
// vanish from the customer list, from lifetime-value totals, and from repeat
// purchase matching. See scripts/backfill-order-customers.mjs for the repair.

const lower = (v) => String(v || "").toLowerCase().trim();

// Names we should never keep once a real one turns up. Checkout forms and
// importers fill these in when a field was left blank.
const PLACEHOLDER_NAMES = new Set([
  "", "guest", "guest customer", "customer", "n/a", "na", "-", "--",
  "unknown", "no name", "test", "walk-in", "walk in",
]);

const isPlaceholderName = (n) => PLACEHOLDER_NAMES.has(lower(n));

// A phone is only a usable identity if it is a plausible BD mobile number.
// Anything else (a landline, a truncated entry, junk) would create a stub that
// no future order can ever match, so we fall back to email instead.
export function isUsablePhone(p) {
  return /^01[3-9]\d{8}$/.test(String(p || ""));
}

// Reduce whatever the caller has to the canonical pair we match on. Exported so
// the admin APIs and the backfill script derive identities exactly as the
// checkout routes do — one definition, no drift.
export function contactIdentity({ phone, email } = {}) {
  const p = normalizeBdPhone(phone || "");
  return { phone: p, email: lower(email), phoneUsable: isUsablePhone(p) };
}

// Find the account this order belongs to, by email first (the stronger
// identifier — a phone can be a shared family number) then by phone.
//
// Staff accounts are matched too: if an admin orders with their own phone it is
// still their order. We never *create* anything but a customer, though.
export async function findCustomerByContact({ phone, email }) {
  const { phone: p, email: e } = contactIdentity({ phone, email });

  if (e) {
    const byEmail = await User.findOne({ email: e });
    if (byEmail) return byEmail;
  }
  if (p) {
    // Prefer a real account over a guest stub when both carry the same phone.
    const byPhone = await User.find({ phone: p }).sort({ isGuest: 1, createdAt: 1 }).limit(1);
    if (byPhone[0]) return byPhone[0];
  }
  return null;
}

// Fold newly-learned contact details into an account we just matched, without
// ever overwriting something a real (non-guest) account already has.
async function enrichExisting(existing, { name, phone, email }) {
  const { phone: p, email: e } = contactIdentity({ phone, email });
  const patch = {};

  if (p && !existing.phone) patch.phone = p;
  // A guest stub may upgrade from phone-only to having an email; a real account
  // owns its address and we never touch it.
  if (e && !existing.email && existing.isGuest) patch.email = e;
  // "Guest" is a placeholder we were forced into when the order carried no name.
  // The moment a real one arrives, take it — but only on a stub.
  if (existing.isGuest && isPlaceholderName(existing.name) && name && !isPlaceholderName(name)) {
    patch.name = String(name).trim();
  }

  if (!Object.keys(patch).length) return existing;
  Object.assign(existing, patch);
  try {
    await existing.save();
  } catch (err) {
    // A racing order may have claimed the same email in between. The account is
    // still correct for this order, so keep it and drop the enrichment.
    if (err?.code !== 11000) throw err;
  }
  return existing;
}

// Resolve the customer for an incoming order, creating a guest stub on a miss.
// Returns { user, isNew, isGuest }, or null when the order carries no usable
// identity at all — a stub with neither phone nor email could never be matched
// again, so it would just be litter in the customer list.
export async function findOrCreateCustomer({ name, phone, email, source = "" }) {
  const { phone: p, email: e, phoneUsable } = contactIdentity({ phone, email });

  // Keep a malformed phone on the stub (it is still what the customer typed and
  // staff may need it) but do not let it be the ONLY thing identifying them.
  if (!e && !phoneUsable && !p) return null;

  const existing = await findCustomerByContact({ phone: p, email: e });
  if (existing) {
    await enrichExisting(existing, { name, phone: p, email: e });
    return { user: existing, isNew: false, isGuest: !!existing.isGuest };
  }

  // No match — create the stub. `email` is omitted entirely (not null) when the
  // customer gave none: the users.email index is sparse-unique, so any number of
  // email-less guests may coexist, but a stored email is still unique.
  const doc = {
    name: isPlaceholderName(name) ? "Guest" : String(name).trim(),
    role: "customer",
    isGuest: true,
    guestSource: source,
    emailVerified: false,
  };
  if (p) doc.phone = p;
  if (e) doc.email = e;

  try {
    const user = await User.create(doc);
    return { user, isNew: true, isGuest: true };
  } catch (err) {
    // Two orders from the same new customer can land at once (a double-submitted
    // checkout, or a landing page and the storefront in the same second). The
    // loser of that race must adopt the winner's record rather than fail — an
    // unattached order is exactly what this module exists to prevent.
    if (err?.code === 11000) {
      const raced = await findCustomerByContact({ phone: p, email: e });
      if (raced) return { user: raced, isNew: false, isGuest: !!raced.isGuest };
    }
    throw err;
  }
}

// Is this document a stub that a real registration may take over? A guest has no
// password by construction; the extra check means a half-finished registration
// (password set, email unverified) is never silently hijacked by a phone match.
function isClaimable(user) {
  return !!user && user.isGuest === true && !user.password && !isStaff(user.role);
}

// Find the guest stub a sign-up should adopt, by email or (optionally) phone.
// Returns null when there's nothing to claim — the caller then creates a user.
export async function findClaimableGuest({ email, phone }) {
  const { phone: p, email: e } = contactIdentity({ phone, email });

  if (e) {
    const byEmail = await User.findOne({ email: e }).select("+password");
    // An email hit that isn't claimable means a real account owns this address;
    // the caller must reject the sign-up rather than fall through to the phone.
    if (byEmail) return isClaimable(byEmail) ? byEmail : null;
  }
  if (p) {
    const byPhone = await User.find({ phone: p, isGuest: true }).select("+password").sort({ createdAt: 1 }).limit(1);
    if (isClaimable(byPhone[0])) return byPhone[0];
  }
  return null;
}

// Turn a claimed guest stub into a pending real account. Still a guest (and so
// still unable to sign in) until the OTP is verified — see completeGuestClaim.
export async function claimGuestAccount(guest, { name, email, phone, hashedPassword }) {
  guest.name = String(name || guest.name).trim();
  guest.email = lower(email);
  guest.password = hashedPassword;
  if (phone) guest.phone = normalizeBdPhone(phone);
  guest.emailVerified = false;
  await guest.save();
  return guest;
}

// Called once the OTP checks out. Promotes the stub to a full account and folds
// in any OTHER guest stub that shares this phone (e.g. one order placed with an
// email, a later one with only the phone), so the customer ends up with a single
// account holding every order.
export async function completeGuestClaim(userId) {
  const user = await User.findById(userId);
  if (!user) return null;

  if (user.isGuest) {
    user.isGuest = false;
    user.guestSource = "";
    await user.save();
  }

  if (!user.phone) return user;

  const duplicates = await User.find({
    _id: { $ne: user._id },
    phone: user.phone,
    isGuest: true,
  }).select("+password");

  for (const dup of duplicates) {
    if (!isClaimable(dup)) continue; // never absorb a real account
    await Order.updateMany({ user: dup._id }, { $set: { user: user._id } });
    if (!user.email && dup.email) user.email = dup.email;
    if (!user.address && dup.address) user.address = dup.address;
    await User.deleteOne({ _id: dup._id });
  }
  if (user.isModified()) await user.save();

  return user;
}

// Merge `sourceIds` into `targetId`: every order moves across, contact details
// and address fill any gap on the target, and the emptied stubs are deleted.
// Shared by the admin merge endpoint and the duplicate cleanup in the backfill.
//
// Refuses to absorb an account that can sign in or that carries panel access —
// merging those would destroy credentials, so they must be the target instead.
export async function mergeCustomers(targetId, sourceIds) {
  const target = await User.findById(targetId).select("+password");
  if (!target) throw new Error("Target customer not found");

  const result = { moved: 0, deleted: 0, skipped: [] };

  for (const id of sourceIds) {
    if (String(id) === String(target._id)) continue;
    const src = await User.findById(id).select("+password");
    if (!src) continue;

    if (src.password || isStaff(src.role)) {
      result.skipped.push({ id: String(id), name: src.name, reason: "has sign-in access" });
      continue;
    }

    const moved = await Order.updateMany({ user: src._id }, { $set: { user: target._id } });
    result.moved += moved.modifiedCount || 0;

    if (!target.phone && src.phone) target.phone = src.phone;
    if (!target.email && src.email) target.email = src.email;
    if (!target.address && src.address) target.address = src.address;
    if (isPlaceholderName(target.name) && !isPlaceholderName(src.name)) target.name = src.name;
    // The merged customer is as old as their earliest order with us.
    if (src.createdAt && target.createdAt && src.createdAt < target.createdAt) {
      target.createdAt = src.createdAt;
    }

    await User.deleteOne({ _id: src._id });
    result.deleted++;
  }

  if (target.isModified()) await target.save();
  return result;
}

// The shape every order route wants: an id to store on the order, or null, and
// never a thrown error — a linking failure must never cost us the sale. Logs
// loudly on failure because a null here is a customer dropping off the books.
export async function resolveCustomerId({ name, phone, email, source = "" }) {
  try {
    const res = await findOrCreateCustomer({ name, phone, email, source });
    if (res?.user?._id) return res.user._id;
    console.error(
      `[customer-link] no usable identity on a ${source || "unknown"} order ` +
      `(phone=${JSON.stringify(phone)} email=${JSON.stringify(email)}) — order will be unattached`
    );
    return null;
  } catch (e) {
    console.error(`[customer-link] failed on a ${source || "unknown"} order:`, e?.message || e);
    return null;
  }
}
