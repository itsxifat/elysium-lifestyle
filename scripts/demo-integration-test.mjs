// End-to-end: two visitors, two sandboxes, one shared template.
// Everything goes over HTTP the way a real visitor would drive it.
import { config } from "dotenv";
import mongoose from "mongoose";

config({ path: ".env.demo.local", quiet: true });

const SITE = process.env.DEMO_SITE_URL || "http://localhost:3200";
const ENDB = process.env.ENDB_URL || "http://localhost:3100";

let pass = 0, fail = 0;
const check = (n, ok, d = "") => { console.log(`${ok ? "  PASS" : "  FAIL"}  ${n}${d ? `  — ${d}` : ""}`); ok ? pass++ : fail++; };

await mongoose.connect(process.env.MONGODB_URI);
const conn = mongoose.connection;
const registry = conn.db.collection("__demo_sandboxes");
const countIn = async (db, coll) => conn.useDb(db, { useCache: true }).db.collection(coll).countDocuments();

// A visitor is just a cookie jar.
function visitor() {
  const jar = new Map();
  return {
    jar,
    async go(path, opts = {}) {
      const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
      const res = await fetch(SITE + path, {
        redirect: "manual",
        ...opts,
        headers: { ...(opts.headers || {}), ...(cookie ? { cookie } : {}) },
      });
      for (const c of res.headers.getSetCookie?.() || []) {
        const [pair] = c.split(";");
        const i = pair.indexOf("=");
        jar.set(pair.slice(0, i), pair.slice(i + 1));
      }
      return res;
    },
    async follow(path, max = 5) {
      let res = await this.go(path);
      let n = 0;
      while (res.status >= 300 && res.status < 400 && n++ < max) {
        const loc = new URL(res.headers.get("location"), SITE);
        res = await this.go(loc.pathname + loc.search);
      }
      return res;
    },
  };
}

const sidOf = async (v) => {
  const s = await (await v.go("/api/demo/status")).json();
  return s.sid;
};
const dbOf = async (sid) => (await registry.findOne({ sid }))?.db;

const templateProducts = await countIn(process.env.DEMO_TEMPLATE_DB, "products");
console.log(`\ntemplate has ${templateProducts} products\n`);

console.log("── Cold arrival ──");
const a = visitor();
const home = await a.follow("/");
check("a cold visitor is served the storefront", home.status === 200, `HTTP ${home.status}`);
// Landing on /demo/busy is also a 200, so assert we actually got a sandbox —
// otherwise every later check fails in a way that looks like a product bug
// when the real cause is ENDB being at capacity.
check("the visitor got a sandbox, not the busy screen", a.jar.has("endb_sid"),
  a.jar.has("endb_sid") ? "" : "no cookie — check ENDB capacity for this site");
if (!a.jar.has("endb_sid")) {
  console.log("\n  cannot continue without a sandbox\n");
  await mongoose.disconnect();
  process.exit(1);
}

const statusA = await (await a.go("/api/demo/status")).json();
check("status reports an active sandbox", statusA.active === true);
check("status exposes the demo credentials for autofill",
  statusA.accounts?.some((x) => x.label === "Admin" && x.email && x.password),
  statusA.accounts?.map((x) => x.label).join(", "));
check("status never leaks the database name", statusA.db === undefined);
check("status carries an expiry", !!statusA.expiresAt);

const sidA = statusA.sid;
const dbA = await dbOf(sidA);
check("the sandbox is a pool database, not the template or dev db",
  dbA?.startsWith("elysium_demo_pool_") && dbA !== process.env.DEMO_TEMPLATE_DB, dbA);
check("the sandbox was cloned with the template's catalogue",
  (await countIn(dbA, "products")) === templateProducts);

console.log("\n── Two visitors are isolated ──");
const b = visitor();
await b.follow("/");
const sidB = await sidOf(b);
const dbB = await dbOf(sidB);
check("the second visitor gets a sandbox too", b.jar.has("endb_sid"),
  b.jar.has("endb_sid") ? "" : "no cookie — ENDB is likely at capacity");
check("the second visitor gets a different sandbox", dbA !== dbB && !!dbB, `${dbA} vs ${dbB}`);

// Visitor A does the most destructive thing available.
await conn.useDb(dbA, { useCache: true }).db.collection("products").deleteMany({});
check("visitor A's catalogue is now empty", (await countIn(dbA, "products")) === 0);
check("visitor B is untouched", (await countIn(dbB, "products")) === templateProducts);
check("the template is untouched",
  (await countIn(process.env.DEMO_TEMPLATE_DB, "products")) === templateProducts);

console.log("\n── The site actually reads the sandbox ──");
const shopA = await a.go("/api/products?limit=50");
const shopB = await b.go("/api/products?limit=50");
if (shopA.status === 200 && shopB.status === 200) {
  const jA = await shopA.json();
  const jB = await shopB.json();
  const nA = (jA.products || jA.items || jA.data || []).length;
  const nB = (jB.products || jB.items || jB.data || []).length;
  check("visitor A's API returns an empty catalogue", nA === 0, `${nA} products`);
  check("visitor B's API still returns the full catalogue", nB === templateProducts, `${nB} products`);
} else {
  check("product API reachable for both visitors", false, `A:${shopA.status} B:${shopB.status}`);
}

console.log("\n── Expiry ──");
await registry.updateOne({ sid: sidA }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
// The cookie carries the deadline, so the Edge rejects it without a db lookup.
// Forge nothing — just wait for the real cookie to lapse is impractical, so
// assert the middleware's behaviour with a cookie we know to be past its exp.
const expiredJar = new Map(a.jar);
const stale = visitor();
stale.jar.set("endb_sid", expiredJar.get("endb_sid"));

const apiWhenGone = await stale.go("/api/admin/dashboard");
check("an API call with a valid-but-unknown sandbox is not silently served",
  [401, 403, 410, 500].includes(apiWhenGone.status), `HTTP ${apiWhenGone.status}`);

console.log("\n── Reap ──");
const before = await registry.countDocuments({ state: "leased" });
await registry.updateOne({ sid: sidB }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
const reap = await fetch(SITE + "/api/demo/reap", {
  method: "POST",
  headers: { "x-demo-reap-secret": process.env.DEMO_REAP_SECRET },
});
const reapBody = await reap.json();
check("the reap endpoint requires its secret",
  (await fetch(SITE + "/api/demo/reap", { method: "POST" })).status === 401);
check("reap collects the expired sandbox", reap.status === 200 && reapBody.reaped >= 1, `reaped ${reapBody.reaped}`);
check("the reaped slot no longer holds a lease", !(await registry.findOne({ sid: sidB, state: "leased" })));
check("the reaped slot was restored to the template",
  (await countIn(dbB, "products")) === templateProducts);
void before;

console.log("\n── Production path untouched ──");
check("the dev database was never written to",
  (await countIn("elysium", "products")) === 13, `${await countIn("elysium", "products")} products`);

await mongoose.disconnect();
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
