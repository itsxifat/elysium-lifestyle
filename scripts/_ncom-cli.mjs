// Shared bootstrap for the ncom CLI scripts.
//
// Everything these scripts do is also available at /admin/ncom, which needs no
// shell access and no env plumbing — prefer that. These remain for cron
// (the nightly reconcile) and for a headless first run.
//
// IMPORTANT — why the scripts `await import()` the sync module instead of
// importing it at the top: ESM evaluates every static import before any
// top-level await, and lib/cdn.js captures CDN_API_SECRET at module scope. A
// plain `import` therefore runs it before loadEnv() has populated process.env,
// leaving the secret undefined and every product image silently unsigned and
// dropped. Loading env first, then importing dynamically, is what makes the
// CLI behave the same as the app.

import mongoose from "mongoose";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);

// Try the usual env files rather than only .env.local. A production checkout
// commonly keeps its vars in .env or .env.production, which is why
// `.env.local` can load zero variables and MONGODB_URI comes back undefined.
const CANDIDATES = [
  process.env.ENV_FILE,
  ".env.local",
  ".env",
  ".env.production",
  ".env.production.local",
].filter(Boolean);

export async function loadEnv() {
  let dotenv = null;
  try {
    const mod = await import("dotenv");
    dotenv = mod.default ?? mod;
  } catch {
    /* dotenv not installed — fall back to the parser below */
  }

  const loaded = [];
  for (const candidate of CANDIDATES) {
    const file = path.isAbsolute(candidate) ? candidate : path.join(ROOT, candidate);
    if (!fs.existsSync(file)) continue;

    if (dotenv) {
      dotenv.config({ path: file, override: false });
    } else {
      // Minimal KEY=VALUE parser, so a missing dotenv can't block a migration.
      for (const line of fs.readFileSync(file, "utf8").split("\n")) {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
        if (!m || line.trim().startsWith("#")) continue;
        if (process.env[m[1]] === undefined) {
          process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
        }
      }
    }
    loaded.push(path.relative(ROOT, file) || file);
  }

  return loaded;
}

export async function connect() {
  const loaded = await loadEnv();

  if (!process.env.MONGODB_URI) {
    console.error("\nMONGODB_URI is not set.\n");
    console.error(loaded.length
      ? `  Read env from: ${loaded.join(", ")} — but none defined MONGODB_URI.`
      : `  No env file found in ${ROOT}. Looked for: ${CANDIDATES.join(", ")}.`);
    console.error(`
  Fix it either way:
    ENV_FILE=/path/to/your/env node scripts/<script>.mjs ...
    MONGODB_URI='mongodb+srv://…' node scripts/<script>.mjs ...

  Or skip the shell entirely and use the admin panel: /admin/ncom
`);
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  return loaded;
}

const COLOR = {
  info: (s) => s,
  success: (s) => `\x1b[32m${s}\x1b[0m`,
  warn: (s) => `\x1b[33m${s}\x1b[0m`,
  error: (s) => `\x1b[31m${s}\x1b[0m`,
};

export function printLog(lines) {
  for (const line of lines || []) {
    console.log((COLOR[line.level] || COLOR.info)(line.text));
  }
}

export async function finish(result) {
  printLog(result?.log);
  await mongoose.disconnect();
  process.exit(result?.ok === false ? 1 : 0);
}
