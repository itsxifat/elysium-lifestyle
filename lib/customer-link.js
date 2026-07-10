import User from "@/models/User";
import Order from "@/models/Order";
import { normalizeBdPhone } from "@/lib/utils";
import { isStaff } from "@/lib/permissions";

// Attaching landing-page (and other guest) orders to a customer account.
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
//     account, their landing-page purchases are simply there.
//
// Guests never authenticate: they have no password, `isGuest` is true, and
// emailVerified is false. Only email verification clears `isGuest`.

const lower = (v) => String(v || "").toLowerCase().trim();

// Find the account this order belongs to, by email first (the stronger
// identifier — a phone can be a shared family number) then by phone.
//
// Staff accounts are matched too: if an admin orders with their own phone it is
// still their order. We never *create* anything but a customer, though.
export async function findCustomerByContact({ phone, email }) {
  const e = lower(email);
  const p = normalizeBdPhone(phone || "");

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

// Resolve the customer for an incoming order, creating a guest stub on a miss.
// Returns { user, isNew, isGuest }.
export async function findOrCreateCustomer({ name, phone, email, source = "" }) {
  const e = lower(email);
  const p = normalizeBdPhone(phone || "");

  const existing = await findCustomerByContact({ phone: p, email: e });
  if (existing) {
    // Backfill the contact details we just learned, without ever overwriting
    // what a real (non-guest) account already has.
    const patch = {};
    if (p && !existing.phone) patch.phone = p;
    if (e && !existing.email && existing.isGuest) patch.email = e;
    if (Object.keys(patch).length) {
      Object.assign(existing, patch);
      await existing.save();
    }
    return { user: existing, isNew: false, isGuest: !!existing.isGuest };
  }

  // No match — create the stub. `email` is omitted entirely (not null) when the
  // customer gave none: the users.email index is sparse-unique, so any number of
  // email-less guests may coexist, but a stored email is still unique.
  const doc = {
    name: String(name || "Guest").trim() || "Guest",
    role: "customer",
    isGuest: true,
    guestSource: source,
    emailVerified: false,
  };
  if (p) doc.phone = p;
  if (e) doc.email = e;

  const user = await User.create(doc);
  return { user, isNew: true, isGuest: true };
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
  const e = lower(email);
  const p = normalizeBdPhone(phone || "");

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
