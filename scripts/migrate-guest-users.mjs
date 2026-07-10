// One-time migration for guest customers (landing-page orders).
//
// Guests created from a landing-page order may have no email — only a phone. The
// users collection ships with a NON-sparse unique index on `email`, under which
// a second document missing the field collides with the first (both index as
// null). This rebuilds it as a sparse unique index and adds the `phone` index
// that customer matching relies on.
//
// Safe to re-run: it checks the current index shape and skips if already sparse.
//
//   node scripts/migrate-guest-users.mjs --dry-run
//   node scripts/migrate-guest-users.mjs
//
import mongoose from "mongoose";

try {
  const dotenv = await import("dotenv");
  (dotenv.default ?? dotenv).config({ path: process.env.ENV_FILE || ".env.local" });
} catch { /* dotenv not installed — using process.env directly */ }

const { MONGODB_URI } = process.env;
const DRY_RUN = process.argv.includes("--dry-run");

if (!MONGODB_URI) {
  console.error("MONGODB_URI is not set.");
  process.exit(1);
}

await mongoose.connect(MONGODB_URI);
const users = mongoose.connection.collection("users");

const indexes = await users.indexes();
const emailIdx = indexes.find((i) => i.key?.email === 1);
const phoneIdx = indexes.find((i) => i.key?.phone === 1);

console.log(`email index : ${emailIdx ? `${emailIdx.name} (sparse=${!!emailIdx.sparse}, unique=${!!emailIdx.unique})` : "missing"}`);
console.log(`phone index : ${phoneIdx ? phoneIdx.name : "missing"}`);

// Documents that would collide once a second email-less user appears.
const emailless = await users.countDocuments({ email: { $in: [null, ""] } });
if (emailless) console.log(`⚠ ${emailless} existing user(s) have a null/empty email — unsetting the field on them.`);

if (DRY_RUN) {
  console.log("\n--dry-run: no changes written.");
  await mongoose.disconnect();
  process.exit(0);
}

// A stored `null`/`""` email still occupies a slot in a sparse index; only an
// ABSENT field is skipped. Normalise those before rebuilding.
if (emailless) {
  const res = await users.updateMany({ email: { $in: [null, ""] } }, { $unset: { email: "" } });
  console.log(`unset email on ${res.modifiedCount} user(s)`);
}

if (emailIdx && !emailIdx.sparse) {
  await users.dropIndex(emailIdx.name);
  console.log(`dropped ${emailIdx.name}`);
}
if (!emailIdx || !emailIdx.sparse) {
  await users.createIndex({ email: 1 }, { unique: true, sparse: true, name: "email_1" });
  console.log("created sparse unique email_1");
} else {
  console.log("email index already sparse — skipped");
}

if (!phoneIdx) {
  await users.createIndex({ phone: 1 }, { name: "phone_1" });
  console.log("created phone_1");
} else {
  console.log("phone index already present — skipped");
}

console.log("\n✓ done");
await mongoose.disconnect();
