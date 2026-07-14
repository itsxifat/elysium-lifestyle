export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongoose";
import LandingPage from "@/models/LandingPage";
import { requireAdmin } from "@/lib/auth";
import { generateUniqueCode, normalizeCode, isReservedCode, makeKey } from "@/lib/landing";
import { sanitizeBlocks, starterBlocks } from "@/lib/landing-blocks";
import { LANDING_FONT_KEYS, DEFAULT_LANDING_FONT } from "@/lib/landing-fonts";

const PRICING_MODES = ["auto", "fixed", "percent", "amount"];
const SHIPPING_MODES = ["settings", "free", "flat", "zones"];

const str = (v, max = 500) => String(v ?? "").trim().slice(0, max);
const num = (v, min = 0) => Math.max(min, Number(v) || 0);
const isId = (v) => mongoose.Types.ObjectId.isValid(v);

// Rebuild the page-wide promotions from scratch. Drops rules with no threshold
// or no reward so a half-filled row can never accidentally trigger.
function sanitizePromotions(p = {}) {
  const fs = p.freeShipping || {};
  const rules = (Array.isArray(p.discountRules) ? p.discountRules : [])
    .map((r) => ({
      basis: r.basis === "quantity" ? "quantity" : "amount",
      threshold: Math.max(0, Math.round(num(r.threshold))),
      rewardType: r.rewardType === "percent" ? "percent" : "amount",
      value: num(r.value),
      maxDiscount: num(r.maxDiscount),
      label: str(r.label, 80),
    }))
    .filter((r) => r.threshold > 0 && r.value > 0);

  return {
    freeShipping: {
      enabled: !!fs.enabled,
      minSubtotal: Math.max(0, Math.round(num(fs.minSubtotal))),
      minQuantity: Math.max(0, Math.round(num(fs.minQuantity))),
    },
    discountRules: rules,
  };
}

// Normalize an incoming payload into the LandingPage schema shape. Every field
// is rebuilt from scratch — nothing the client sends reaches the DB unchecked,
// and `code` is handled by the callers (create generates it, update validates).
export function sanitize(data = {}) {
  const offers = (Array.isArray(data.offers) ? data.offers : [])
    .map((o) => {
      const kind = ["collection", "alacarte"].includes(o.kind) ? o.kind : "fixed";
      // Dedup + sort the price ladder by quantity so tierPriceFor's floor lookup
      // is well-defined; keep the last price entered for a duplicate quantity.
      const tierMap = new Map();
      for (const t of Array.isArray(o.tiers) ? o.tiers : []) {
        const q = Math.min(100, Math.max(1, Math.round(Number(t.quantity) || 0)));
        if (q >= 1) tierMap.set(q, num(t.price));
      }
      const tiers = [...tierMap.entries()].sort((a, b) => a[0] - b[0]).map(([quantity, price]) => ({ quantity, price }));

      return {
        key: str(o.key, 40) || makeKey(),
        label: str(o.label, 80),
        description: str(o.description, 300),
        badge: str(o.badge, 40),
        image: str(o.image, 500),
        kind,
        items: (Array.isArray(o.items) ? o.items : [])
          .filter((i) => isId(i?.product))
          .map((i) => ({
            product: i.product,
            quantity: Math.min(50, Math.max(1, Number(i.quantity) || 1)),
            size: str(i.size, 40),
          })),
        pricingMode: PRICING_MODES.includes(o.pricingMode) ? o.pricingMode : "auto",
        priceValue: num(o.priceValue),
        tiers,
        minQty: Math.max(0, Math.round(num(o.minQty))),
        maxQty: Math.max(0, Math.round(num(o.maxQty))),
        compareAtPrice: num(o.compareAtPrice),
        isDefault: !!o.isDefault,
        isActive: o.isActive !== false,
      };
    })
    // fixed/à la carte need products; a collection needs a pool AND a ladder.
    .filter((o) => o.label && o.items.length && (o.kind !== "collection" || o.tiers.length));

  // Exactly one default offer, so the page always has something pre-selected.
  const defaultIdx = offers.findIndex((o) => o.isDefault && o.isActive);
  const fallbackIdx = offers.findIndex((o) => o.isActive);
  const chosen = defaultIdx >= 0 ? defaultIdx : fallbackIdx;
  offers.forEach((o, i) => (o.isDefault = i === chosen));

  const sh = data.shipping || {};
  const f = data.form || {};
  const t = data.theme || {};

  return {
    name: str(data.name, 120),
    seoTitle: str(data.seoTitle, 160),
    seoDescription: str(data.seoDescription, 300),
    ogImage: str(data.ogImage, 500),
    theme: {
      accent: str(t.accent, 20) || "#B85C3A",
      background: str(t.background, 20) || "#FDFBF7",
      text: str(t.text, 20) || "#2C1810",
      backgroundImage: str(t.backgroundImage, 500),
      font: LANDING_FONT_KEYS.includes(t.font) ? t.font : DEFAULT_LANDING_FONT,
    },
    blocks: sanitizeBlocks(data.blocks, makeKey),
    offers,
    shipping: {
      mode: SHIPPING_MODES.includes(sh.mode) ? sh.mode : "settings",
      flat: num(sh.flat),
      insideDhaka: num(sh.insideDhaka ?? 60),
      suburbs: num(sh.suburbs ?? 100),
      outsideDhaka: num(sh.outsideDhaka ?? 130),
      askZone: sh.askZone !== false,
    },
    promotions: sanitizePromotions(data.promotions),
    form: {
      title: str(f.title, 120) || "Order now — cash on delivery",
      subtitle: str(f.subtitle, 300),
      submitText: str(f.submitText, 60) || "Confirm order",
      askEmail: f.askEmail !== false,
      askNote: !!f.askNote,
      noteLabel: str(f.noteLabel, 80) || "Notes (optional)",
      successTitle: str(f.successTitle, 160) || "Thank you! Your order is confirmed.",
      successMessage: str(f.successMessage, 500),
      redirectUrl: str(f.redirectUrl, 500),
    },
    isActive: !!data.isActive,
  };
}

export async function GET() {
  const { error } = await requireAdmin("landing.manage");
  if (error) return error;

  await connectDB();
  const pages = await LandingPage.find({}, "-blocks -offers")
    .sort({ createdAt: -1 })
    .lean();
  return NextResponse.json({ pages });
}

export async function POST(request) {
  const { error, session } = await requireAdmin("landing.manage");
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const doc = sanitize(body);
  if (!doc.name) return NextResponse.json({ error: "Give the landing page a name" }, { status: 400 });

  await connectDB();

  // An admin-chosen code, or a fresh short one.
  let code = normalizeCode(body.code);
  if (code) {
    if (code.length < 2) return NextResponse.json({ error: "Link is too short" }, { status: 400 });
    if (isReservedCode(code)) return NextResponse.json({ error: `"${code}" is reserved` }, { status: 400 });
    if (await LandingPage.exists({ code })) {
      return NextResponse.json({ error: `/lp/${code} is already taken` }, { status: 409 });
    }
  } else {
    code = await generateUniqueCode();
  }

  // A brand-new page always ships with something on it.
  if (!body.blocks) doc.blocks = starterBlocks(makeKey);

  try {
    const created = await LandingPage.create({
      ...doc,
      code,
      createdBy: session.user.id,
      createdByName: session.user.name || "",
    });
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    if (err?.code === 11000) return NextResponse.json({ error: `/lp/${code} is already taken` }, { status: 409 });
    return NextResponse.json({ error: err.message || "Failed to create landing page" }, { status: 400 });
  }
}
