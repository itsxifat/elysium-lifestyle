import crypto from "crypto";

// PII normalization + SHA-256 hashing per Meta's Advanced Matching spec.
// https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters
// Server-only (uses node:crypto).

export function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

const lower = (v) => (typeof v === "string" ? v.trim().toLowerCase() : "");

export function normalizeEmail(email) {
  return lower(email);
}

// Digits-only, country-coded (E.164 without the "+"). BD-aware: a local number
// starting with 0 gets the default country code; an international 00 prefix is
// stripped. Pass defaultCountryCode for the storefront's market (BD = 880).
export function normalizePhone(phone, defaultCountryCode = "880") {
  if (!phone) return "";
  let d = String(phone).replace(/[^0-9]/g, "");
  if (!d) return "";
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("0")) d = defaultCountryCode + d.replace(/^0+/, "");
  // Looks like a bare local number with no country code — prepend the default.
  else if (d.length <= 10 && !d.startsWith(defaultCountryCode)) d = defaultCountryCode + d;
  return d;
}

const alnum = (v) => lower(v).replace(/[^a-z0-9]/g, "");
const alpha = (v) => lower(v).replace(/[^a-z]/g, "");

// Build Meta's user_data object: hashed PII + non-hashed match signals
// (fbp, fbc, IP, UA are sent in the clear by spec).
export function buildMetaUserData(u = {}, opts = {}) {
  const cc = opts.defaultCountryCode || "880";
  const out = {};

  if (u.email) out.em = sha256(normalizeEmail(u.email));
  if (u.phone) {
    const ph = normalizePhone(u.phone, cc);
    if (ph) out.ph = sha256(ph);
  }
  if (u.firstName) out.fn = sha256(lower(u.firstName));
  if (u.lastName) out.ln = sha256(lower(u.lastName));
  if (u.city) out.ct = sha256(alnum(u.city));
  if (u.state) out.st = sha256(alpha(u.state));
  if (u.zip) out.zp = sha256(alnum(u.zip));
  if (u.country) out.country = sha256(alpha(u.country).slice(0, 2) || lower(u.country));
  if (u.gender) out.ge = sha256(lower(u.gender).charAt(0));
  if (u.dob) out.db = sha256(String(u.dob).replace(/[^0-9]/g, ""));
  if (u.externalId) out.external_id = sha256(lower(u.externalId));

  // Non-hashed signals.
  if (u.fbp) out.fbp = u.fbp;
  if (u.fbc) out.fbc = u.fbc;
  if (u.clientIpAddress) out.client_ip_address = u.clientIpAddress;
  if (u.clientUserAgent) out.client_user_agent = u.clientUserAgent;
  if (u.fbLoginId) out.fb_login_id = u.fbLoginId;

  return out;
}

// Which EMQ inputs are present — feeds the match-quality dashboard.
export function computeMatchKeys(u = {}) {
  return {
    email: Boolean(u.email),
    phone: Boolean(u.phone),
    firstName: Boolean(u.firstName),
    lastName: Boolean(u.lastName),
    city: Boolean(u.city),
    fbp: Boolean(u.fbp),
    fbc: Boolean(u.fbc),
    ip: Boolean(u.clientIpAddress),
    userAgent: Boolean(u.clientUserAgent),
    externalId: Boolean(u.externalId),
  };
}

export function maskEmail(email) {
  if (!email || typeof email !== "string" || !email.includes("@")) return "";
  const [name, domain] = email.split("@");
  const head = name.slice(0, 2);
  return `${head}${"*".repeat(Math.max(1, name.length - 2))}@${domain}`;
}

export function maskPhone(phone) {
  if (!phone) return "";
  const d = String(phone).replace(/[^0-9]/g, "");
  if (d.length < 4) return "***";
  return `${"*".repeat(d.length - 3)}${d.slice(-3)}`;
}
