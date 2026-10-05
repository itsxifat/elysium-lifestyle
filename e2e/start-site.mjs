// Starts the built website for the end-to-end run, against the local preview
// ERP that e2e/erp-setup.mjs prepared (its website key is in .env.e2e.local).
// Build first with the same ERP_MEDIA_ORIGINS (see README → End-to-end tests).

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(root, ".env.e2e.local");
if (!existsSync(envFile)) throw new Error("No .env.e2e.local: run `npm run e2e:setup` first.");

const fromFile = Object.fromEntries(
  readFileSync(envFile, "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)])
);

const port = process.env.E2E_SITE_PORT || "3410";
const site = `http://localhost:${port}`;
const child = spawn(process.execPath, [path.join(root, "node_modules", "next", "dist", "bin", "next"), "start", "-p", port], {
  cwd: root,
  stdio: "inherit",
  env: {
    ...process.env,
    ...fromFile,
    NEXTAUTH_URL: site,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET || "e2e-only-secret-not-for-any-real-deploy-0123456789",
    NEXT_PUBLIC_SITE_URL: site,
    // The run signs in with email and password only.
    GOOGLE_CLIENT_ID: "",
    GOOGLE_CLIENT_SECRET: "",
  },
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 0));
