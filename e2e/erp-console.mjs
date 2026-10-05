// The local preview ERP's console API, signed in as the preview's org admin:
// shared by e2e/erp-setup.mjs (which prepares the ERP) and the specs (which
// check what the website did, e.g. that a checkout became a website order).
// Local previews only.

import { createHmac } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const stateDir = path.join(here, ".state");
mkdirSync(stateDir, { recursive: true });

export const API = (process.env.ERP_CONSOLE_API || "http://localhost:3300").replace(/\/+$/, "");
export const ORIGIN = (process.env.ERP_CONSOLE_ORIGIN || "http://localhost:5373").replace(/\/+$/, "");
const CREDENTIALS = process.env.ERP_PREVIEW_CREDENTIALS;
const BRAND = process.env.ERP_BRAND_SLUG || "elysium-lifestyle-bd";

if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(API)) {
  throw new Error(`Refusing to use ${API}: this is for a local preview only.`);
}

// --- a tiny cookie-jar client for the console API -------------------------------------------

export const jar = new Map();
function keep(response) {
  for (const header of response.headers.getSetCookie()) {
    const [pair] = header.split(";");
    const at = pair.indexOf("=");
    jar.set(pair.slice(0, at).trim(), pair.slice(at + 1).trim());
  }
}
const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");

export async function call(method, route, body, { allow = [] } = {}) {
  const response = await fetch(API + route, {
    method,
    headers: {
      Origin: ORIGIN,
      Cookie: cookieHeader(),
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(jar.get("erp_csrf") ? { "x-csrf-token": jar.get("erp_csrf") } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  keep(response);
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  if (!response.ok && !allow.includes(response.status)) {
    throw new Error(`${method} ${route} → ${response.status} ${text.slice(0, 400)}`);
  }
  return { status: response.status, body: json };
}

// --- TOTP, as an authenticator app computes it --------------------------------------------------

function base32(input) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  const out = [];
  for (const char of input.replace(/[\s=]/g, "").toUpperCase()) {
    value = (value << 5) | alphabet.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function totp(secret, at = Date.now()) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const digest = createHmac("sha1", base32(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

// --- sign in as the org admin -------------------------------------------------------------------

function credentialFor(email) {
  if (!CREDENTIALS || !existsSync(CREDENTIALS)) {
    throw new Error("Set ERP_PREVIEW_CREDENTIALS to the preview's preview-credentials.local.md");
  }
  const row = readFileSync(CREDENTIALS, "utf8")
    .split("\n")
    .find((line) => line.includes(`\`${email}\``));
  if (!row) throw new Error(`${email} is not in ${CREDENTIALS}`);
  return row.split("|")[4].trim().replace(/`/g, "");
}

const ADMIN = "admin@preview.elysium.test";
const totpFile = path.join(stateDir, "erp-admin-totp.json");

export async function signInAdmin() {
  const password = credentialFor(ADMIN);
  await call("GET", "/health/live");
  const signIn = await call("POST", "/api/auth/sign-in/email", { email: ADMIN, password });
  const saved = existsSync(totpFile) ? JSON.parse(readFileSync(totpFile, "utf8")) : null;

  if (signIn.body?.twoFactorRedirect) {
    if (!saved?.secret) throw new Error("The admin has two-step login but its secret is not in e2e/.state/");
    await call("POST", "/api/auth/two-factor/verify-totp", { code: totp(saved.secret) });
    return;
  }
  // Not enrolled yet: enrol now, as the console's wall would make a person do.
  const enrolled = await call("POST", "/api/auth/two-factor/enable", { password, method: "totp" }, { allow: [400] });
  if (enrolled.status === 200 && enrolled.body?.totpURI) {
    const secret = new URL(enrolled.body.totpURI).searchParams.get("secret");
    await call("POST", "/api/auth/two-factor/verify-totp", { code: totp(secret) });
    writeFileSync(totpFile, JSON.stringify({ email: ADMIN, secret }, null, 2));
  }
}

export async function chooseBrand() {
  const { body } = await call("GET", "/v1/me/orgs");
  const org = body.orgs.find((o) => o.slug === BRAND) || body.orgs[0];
  await call("POST", "/v1/me/active-org", { orgId: org.orgId });
  return org;
}

/** Signed in as the org admin, in the brand. */
export async function adminSession() {
  await signInAdmin();
  return chooseBrand();
}
