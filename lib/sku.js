import { slugify } from "@/lib/utils";

// Configurable SKU scheme (driven by Settings.sku). A product gets a BASE code
// — a prefix (a global string, or its category's code) + a zero-padded running
// number — and each size variant optionally appends its size:
//
//   prefix mode + size:   ELY-0042-M
//   category mode + size:  DRS-0042-M
//   no size:              ELY-0042
//
// The slug optionally ends with the base code so it is unique + meaningful
// (floral-dress-ely-0042). Every knob is toggled from /admin/settings.

export const DEFAULT_SKU_CONFIG = {
  enabled: false,
  codeSource: "prefix",
  prefix: "ELY",
  separator: "-",
  padding: 4,
  appendSize: true,
  appendToSlug: true,
  nextNumber: 1,
};

// Merge a (possibly partial / legacy) settings.sku object onto the defaults.
export function skuConfig(settingsSku) {
  return { ...DEFAULT_SKU_CONFIG, ...(settingsSku || {}) };
}

// Sanitize a free-text segment into SKU-safe uppercase (letters/digits only).
function clean(s) {
  return String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// Compact, readable size codes. "One Size" → OS, "Free Size" → FS, else the
// size uppercased with separators stripped (XL → XL, "2XL" → 2XL).
export function sizeCode(size) {
  const s = String(size || "").trim().toUpperCase();
  if (!s) return "";
  const map = { "ONE SIZE": "OS", "ONESIZE": "OS", "FREE SIZE": "FS", "FREESIZE": "FS" };
  return map[s] || clean(s);
}

export function padNumber(n, width) {
  return String(Math.max(0, Math.floor(Number(n) || 0))).padStart(Math.max(0, Number(width) || 0), "0");
}

// The base code for a product, e.g. ELY-0042 or DRS-0042.
export function buildBaseCode(cfg, { number, categoryCode } = {}) {
  const c = skuConfig(cfg);
  const head = c.codeSource === "category" ? (clean(categoryCode) || clean(c.prefix)) : clean(c.prefix);
  return `${head}${c.separator}${padNumber(number, c.padding)}`;
}

// A single variant's SKU from the base code + its size.
export function buildVariantSku(cfg, baseCode, size) {
  const c = skuConfig(cfg);
  if (!c.appendSize) return baseCode;
  const sc = sizeCode(size);
  return sc ? `${baseCode}${c.separator}${sc}` : baseCode;
}

// Slug for a product. With appendToSlug, the base code is appended so it is
// globally unique and stable (floral-dress-ely-0042); otherwise just the name.
export function buildSlug(cfg, name, baseCode) {
  const c = skuConfig(cfg);
  const base = slugify(name);
  return c.appendToSlug && baseCode ? `${base}-${slugify(baseCode)}` : base;
}
