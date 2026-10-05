#!/usr/bin/env node
// M36 check 4: the website has no database connection and no admin panel left.
// Fails (exit 1) if any source file imports a database driver or ODM, reads a
// database URL, or if an admin page or admin API route exists. Run in CI and
// before every deploy: `npm run check:no-database`.

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_DIRS = ["app", "components", "context", "hooks", "lib", "middleware.js", "next.config.mjs", "package.json"];
const SKIP = new Set(["node_modules", ".next", ".git"]);

// A database driver, ODM or connection string, anywhere in the website's code.
const FORBIDDEN = [
  { re: /\bfrom\s+["'](mongoose|mongodb|pg|postgres|mysql2?|sqlite3?|better-sqlite3|@prisma\/client|drizzle-orm[^"']*|ioredis|redis)["']/, why: "imports a database driver" },
  { re: /\brequire\(\s*["'](mongoose|mongodb|pg|postgres|mysql2?|sqlite3?|@prisma\/client|ioredis|redis)["']\s*\)/, why: "requires a database driver" },
  { re: /"(mongoose|mongodb|pg|postgres|mysql2?|@prisma\/client|drizzle-orm|ioredis|redis|@enfinito\/demo-kit)"\s*:/, why: "depends on a database package" },
  { re: /\b(MONGODB_URI|DATABASE_URL|REDIS_URL)\b/, why: "reads a database URL" },
  { re: /\bconnectDB\s*\(/, why: "connects to a database" },
  { re: /@\/models\//, why: "imports a database model" },
];

function walk(target, out = []) {
  const full = path.join(root, target);
  if (!existsSync(full)) return out;
  const stat = statSync(full);
  if (stat.isFile()) {
    out.push(target);
    return out;
  }
  for (const name of readdirSync(full)) {
    if (SKIP.has(name)) continue;
    walk(path.join(target, name), out);
  }
  return out;
}

const problems = [];
for (const file of SOURCE_DIRS.flatMap((dir) => walk(dir))) {
  if (!/\.(m?js|jsx|ts|tsx|json)$/.test(file)) continue;
  const text = readFileSync(path.join(root, file), "utf8");
  for (const { re, why } of FORBIDDEN) {
    if (re.test(text)) problems.push(`${file}: ${why}`);
  }
}

// No admin pages or admin API routes: /admin is a redirect to the ERP (middleware.js).
for (const dir of ["app/(admin)", "app/(admin-auth)", "app/admin", "app/api/admin", "models"]) {
  if (existsSync(path.join(root, dir))) problems.push(`${dir}: must not exist (the admin panel and its models are the ERP's now)`);
}
const adminPages = walk("app").filter((f) => f.split(path.sep).includes("admin"));
for (const file of adminPages) problems.push(`${file}: an admin route`);

if (problems.length) {
  console.error("The website must have no database and no admin panel:");
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`ok: no database connection and no admin route in ${SOURCE_DIRS.length} source roots`);
