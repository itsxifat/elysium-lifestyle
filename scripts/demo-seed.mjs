// Build the demo template database.
//
// The template is the golden copy every visitor's sandbox is cloned from. It is
// seeded from the development database and then SCRUBBED — real people's orders
// and accounts must never reach a public demo, and a template is copied to every
// visitor, so anything left in here is published to strangers.
//
//   node scripts/demo-seed.mjs [--from elysium]
import { config } from "dotenv";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

config({ path: ".env.demo.local", quiet: true });

const args = process.argv.slice(2);
const val = (f, d) => (args.includes(f) ? args[args.indexOf(f) + 1] : d);

const SOURCE = val("--from", "elysium");
const TEMPLATE = process.env.DEMO_TEMPLATE_DB || "elysium_demo_template";
const CONTROL = process.env.MONGODB_URI;

if (!CONTROL) throw new Error("Set MONGODB_URI in .env.demo.local");
if (!TEMPLATE.includes("_demo")) throw new Error(`Refusing: "${TEMPLATE}" is not clearly a demo database`);

await mongoose.connect(CONTROL);
const conn = mongoose.connection;
const src = conn.useDb(SOURCE, { useCache: true });
const tpl = conn.useDb(TEMPLATE, { useCache: true });

console.log(`\nseeding ${TEMPLATE} from ${SOURCE}\n`);
await tpl.dropDatabase();

// ── Copy ────────────────────────────────────────────────────────────────────
for (const { name, type } of await src.db.listCollections().toArray()) {
  if (type === "view" || name.startsWith("system.")) continue;
  const count = await src.db.collection(name).countDocuments();
  if (count) {
    await src.db.collection(name)
      .aggregate([{ $match: {} }, { $out: { db: TEMPLATE, coll: name } }])
      .toArray();
  }
  const indexes = (await src.db.collection(name).indexes())
    .filter((i) => i.name !== "_id_")
    .map(({ v, ns, key, ...opts }) => ({ key, ...opts }));
  if (indexes.length) {
    await tpl.db.createCollection(name).catch(() => {});
    await tpl.db.collection(name).createIndexes(indexes).catch(() => {});
  }
  console.log(`  copied ${name.padEnd(20)} ${count}`);
}

// ── Scrub ───────────────────────────────────────────────────────────────────
// Everything here would otherwise be handed to every visitor of the demo.
console.log("");
const scrub = async (coll, filter, why) => {
  const { deletedCount } = await tpl.db.collection(coll).deleteMany(filter);
  console.log(`  scrubbed ${String(deletedCount).padStart(3)} from ${coll.padEnd(18)} (${why})`);
};

await scrub("users", {}, "real accounts and password hashes");
await scrub("orders", {}, "real customers' names, phones and addresses");
await scrub("notifications", {}, "references real orders");
await scrub("trackingevents", {}, "real visitor analytics");
await scrub("fraudaccounts", {}, "real phone numbers");

// Credentials for third-party services live in the settings document. The
// firewall stubs outbound calls, but a demo admin can READ these screens, so
// the values must not be there at all.
const settingsCleared = await tpl.db.collection("settings").updateMany({}, {
  $unset: {
    "payment.sslcommerz.storeId": "",
    "payment.sslcommerz.storePassword": "",
    "courier.steadfast.apiKey": "",
    "courier.steadfast.secretKey": "",
    "email.smtp.user": "",
    "email.smtp.pass": "",
    "ncom.apiKey": "",
    "ncom.webhookSecret": "",
    // Without these the ncom connector fails closed, which is exactly what a
    // sandbox wants: nothing outside can read a demo catalogue or move its stock.
    "ncom.connectorKeyId": "",
    "ncom.connectorSecret": "",
  },
});
console.log(`  cleared vendor credentials from settings (${settingsCleared.modifiedCount} doc)`);

// ── Demo accounts ───────────────────────────────────────────────────────────
// The admin PIN is pre-set. Elysium requires every panel member to create a
// 6-digit PIN before they can do anything, which for a demo visitor is a wall
// on their very first click — they would have to invent a PIN and remember it
// for thirty minutes. It is surfaced next to the password instead.
const DEMO_PIN = process.env.DEMO_ADMIN_PIN || "246810";

const ACCOUNTS = [
  { name: "Demo Admin", email: "admin@demo.elysium", password: "DemoAdmin24", role: "superadmin", pin: DEMO_PIN },
  { name: "Demo Shopper", email: "shopper@demo.elysium", password: "DemoShop24", role: "customer" },
];
if (process.env.DEMO_OWNER_EMAIL) {
  ACCOUNTS.push({
    name: "Demo Owner",
    email: process.env.DEMO_OWNER_EMAIL,
    password: process.env.DEMO_OWNER_PASSWORD || "ChangeThisOwner24",
    role: "superadmin",
    pin: DEMO_PIN,
  });
}

console.log("");
for (const a of ACCOUNTS) {
  await tpl.db.collection("users").insertOne({
    name: a.name,
    email: a.email,
    password: await bcrypt.hash(a.password, 10),
    role: a.role,
    permissions: [],
    emailVerified: true,
    isGuest: false,
    ...(a.pin
      ? { adminPin: await bcrypt.hash(a.pin, 10), pinSetAt: new Date(), pinFailedAttempts: 0, pinLockedUntil: null }
      : {}),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  console.log(`  + ${a.role.padEnd(11)} ${a.email}${a.pin ? `   PIN ${a.pin}` : ""}`);
}

const products = await tpl.db.collection("products").countDocuments();
console.log(`\ntemplate ready — ${products} products, ${ACCOUNTS.length} accounts`);
if (products < 20) {
  console.log(`\nNOTE: ${products} products is thin for a demo. A prospect judges the`);
  console.log(`      product by what they see here — 30-50 realistic items is the target.`);
}
console.log("");

await mongoose.disconnect();
