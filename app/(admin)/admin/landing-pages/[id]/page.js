"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  ArrowLeft, Save, ExternalLink, Loader2, Plus, Trash2, ArrowUp, ArrowDown,
  Eye, EyeOff, Blocks, Package, Settings2, Monitor, Smartphone, X, GripVertical, Check,
} from "lucide-react";
import {
  PageHeader, Card, Button, Field, TextInput, Select, Toggle, Pill, SectionTitle, inputClass,
} from "@/components/admin/ui";
import BlockFields, { ImagePicker } from "@/components/admin/landing/BlockFields";
import OfferBuilder from "@/components/admin/landing/OfferBuilder";
import LandingPageView from "@/components/landing/LandingPageView";
import { landingFontVars } from "@/components/landing/fonts";
import { LANDING_BLOCKS, blockDefaults } from "@/lib/landing-blocks";
import { applyOfferPricing } from "@/lib/landing-pricing";
import {
  LANDING_FONTS, landingFontFamily, FONT_SAMPLE_BN, FONT_SAMPLE_EN,
} from "@/lib/landing-fonts";

const newKey = () => Math.random().toString(36).slice(2, 10);

const TABS = [
  { id: "blocks", label: "Sections", icon: Blocks },
  { id: "offers", label: "Offers", icon: Package },
  { id: "settings", label: "Settings", icon: Settings2 },
];

const ZONES = ["inside_dhaka", "suburbs", "outside_dhaka"];

// A ready-made palette so colours can be set with one tap, not just the raw
// picker. Warm brand tones first, then useful neutrals/accents.
const PALETTE = [
  "#B85C3A", "#8C3B24", "#D98E5A", "#E8B04B", "#2C1810", "#6B4423",
  "#1F7A5A", "#0E7490", "#2563EB", "#7C3AED", "#DB2777", "#DC2626",
  "#111111", "#4B5563", "#9CA3AF", "#FDFBF7", "#F3E8DD", "#FFFFFF",
];

// A colour input paired with the palette swatches.
function ColorField({ label, value, onChange }) {
  return (
    <div>
      <span className="block text-[12px] font-medium text-brand-brown mb-1.5">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value || "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-10 flex-shrink-0 rounded-lg border border-brand-tan/30 bg-white cursor-pointer p-0.5"
        />
        <TextInput value={value || ""} onChange={(e) => onChange(e.target.value)} className="font-mono text-[12px]" />
      </div>
      <div className="flex flex-wrap gap-1 mt-1.5">
        {PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            title={c}
            onClick={() => onChange(c)}
            className={`w-5 h-5 rounded-md border transition-transform hover:scale-110 ${
              (value || "").toLowerCase() === c.toLowerCase() ? "border-brand-brown ring-1 ring-brand-brown" : "border-black/10"
            }`}
            style={{ background: c }}
          />
        ))}
      </div>
    </div>
  );
}

// Turn the saved page (products populated by the API) into editor state: offer
// lines hold plain ids, and a side cache holds the product details the offer
// builder needs to price and preview them.
function hydrate(page) {
  const products = {};
  const offers = (page.offers || []).map((o) => ({
    ...o,
    items: (o.items || []).map((line) => {
      const p = line.product;
      if (p && typeof p === "object") {
        products[p._id] = {
          _id: p._id,
          name: p.name,
          image: p.images?.[0] || "",
          variants: p.variants || [],
        };
        return { ...line, product: p._id };
      }
      return line;
    }),
  }));
  return { form: { ...page, offers }, products };
}

// In-stock sizes for one product from the editor's product cache, honouring a
// pinned size. Mirrors sizesFor in lib/landing.js.
function editorSizes(p, minQty, pinned) {
  const inStock = (p.variants || []).filter((v) => v.stock >= minQty);
  return (pinned ? inStock.filter((v) => v.size === pinned) : inStock).map((v) => ({ size: v.size, price: v.price }));
}

// The offer shapes the public renderer expects, computed from editor state so the
// preview shows real prices, size pickers and the collection pool without a
// round-trip. Mirrors buildFixedOffer / buildCollectionOffer in lib/landing.js.
function previewOffers(offers, products) {
  const out = [];
  for (const o of offers) {
    if (o.isActive === false || !o.items?.length) continue;

    if (o.kind === "collection") {
      const tiers = (o.tiers || [])
        .map((t) => ({ quantity: Number(t.quantity) || 0, price: Math.max(0, Number(t.price) || 0) }))
        .filter((t) => t.quantity >= 1)
        .sort((a, b) => a.quantity - b.quantity);
      if (!tiers.length) continue;

      const pool = [];
      for (const line of o.items) {
        const p = products[line.product] || {};
        const pinned = line.size || (p.variants?.length === 1 ? p.variants[0].size : "");
        const sizes = editorSizes(p, 1, pinned);
        if (!sizes.length) continue;
        pool.push({ productId: line.product, name: p.name || "Product", image: p.image || "", pinnedSize: pinned, sizes });
      }
      if (!pool.length) continue;

      out.push({
        key: o.key,
        kind: "collection",
        label: o.label || "Untitled offer",
        description: o.description || "",
        badge: o.badge || "",
        image: o.image || pool[0]?.image || "",
        isDefault: !!o.isDefault,
        pool,
        tiers,
        minQty: tiers[0].quantity,
        maxQty: tiers[tiers.length - 1].quantity,
        manualCompareAt: Number(o.compareAtPrice) || 0,
        price: tiers[0].price,
      });
      continue;
    }

    let regular = 0;
    const items = o.items.map((line) => {
      const p = products[line.product] || {};
      const pinned = line.size || (p.variants?.length === 1 ? p.variants[0].size : "");
      const sizes = editorSizes(p, line.quantity || 1, pinned);
      regular += (sizes[0]?.price ?? 0) * (line.quantity || 1);
      return { productId: line.product, name: p.name || "Product", image: p.image || "", quantity: line.quantity || 1, pinnedSize: pinned, sizes };
    });

    const price = applyOfferPricing(o, regular);
    out.push({
      key: o.key,
      kind: "fixed",
      label: o.label || "Untitled offer",
      description: o.description || "",
      badge: o.badge || "",
      image: o.image || items[0]?.image || "",
      isDefault: !!o.isDefault,
      items,
      pricing: { mode: o.pricingMode || "auto", value: Number(o.priceValue) || 0 },
      manualCompareAt: Number(o.compareAtPrice) || 0,
      price,
      compareAtPrice: Number(o.compareAtPrice) || regular,
      savings: Math.max(0, (Number(o.compareAtPrice) || regular) - price),
    });
  }
  return out;
}

// The rates the preview's zone buttons show, mirroring lib/landing.js.
function previewShipping(shipping, storeRates) {
  const rate = (zone) => {
    switch (shipping.mode) {
      case "free": return 0;
      case "flat": return Number(shipping.flat) || 0;
      case "zones": return Number(shipping[zoneKey(zone)]) || 0;
      default: return Number(storeRates?.[zoneKey(zone)]) || 0;
    }
  };
  const askZone = shipping.askZone !== false && shipping.mode !== "free" && shipping.mode !== "flat";
  return { askZone, rates: Object.fromEntries(ZONES.map((z) => [z, rate(z)])) };
}

const zoneKey = (z) => ({ inside_dhaka: "insideDhaka", suburbs: "suburbs", outside_dhaka: "outsideDhaka" }[z]);

// ── Block list ───────────────────────────────────────────────────────────────
function BlockRow({ block, active, onSelect, onToggle, onMove, onRemove, isFirst, isLast }) {
  const spec = LANDING_BLOCKS[block.type];
  const locked = !!spec?.singleton;

  return (
    <div
      className={`group flex items-center gap-1.5 rounded-lg border px-2 py-2 transition-colors cursor-pointer ${
        active ? "border-brand-terracotta bg-brand-terracotta/[0.06]" : "border-brand-tan/20 hover:border-brand-brown/30"
      }`}
      onClick={onSelect}
    >
      <GripVertical size={13} className="text-brand-tan/40 flex-shrink-0" />
      <div className="min-w-0 flex-1">
        <p className={`text-[12.5px] font-medium truncate ${block.enabled === false ? "text-brand-tan line-through" : "text-brand-brown"}`}>
          {spec?.label || block.type}
        </p>
      </div>

      <button
        type="button" title={block.enabled === false ? "Show" : "Hide"}
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        className="p-1 text-brand-tan hover:text-brand-brown flex-shrink-0"
      >
        {block.enabled === false ? <EyeOff size={13} /> : <Eye size={13} />}
      </button>
      <button
        type="button" title="Move up" disabled={isFirst}
        onClick={(e) => { e.stopPropagation(); onMove(-1); }}
        className="p-1 text-brand-tan hover:text-brand-brown disabled:opacity-20 flex-shrink-0"
      >
        <ArrowUp size={13} />
      </button>
      <button
        type="button" title="Move down" disabled={isLast}
        onClick={(e) => { e.stopPropagation(); onMove(1); }}
        className="p-1 text-brand-tan hover:text-brand-brown disabled:opacity-20 flex-shrink-0"
      >
        <ArrowDown size={13} />
      </button>
      <button
        type="button" title={locked ? "The order form can't be removed" : "Delete section"}
        disabled={locked}
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="p-1 text-red-400 hover:text-red-600 disabled:opacity-20 flex-shrink-0"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

function AddBlockMenu({ onAdd, existing }) {
  const [open, setOpen] = useState(false);
  const available = Object.entries(LANDING_BLOCKS).filter(
    ([type, spec]) => !spec.singleton || !existing.some((b) => b.type === type)
  );

  return (
    <div className="relative">
      <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => setOpen((v) => !v)}>
        <Plus size={13} /> Add section
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 left-0 right-0 mt-1.5 bg-white border border-brand-tan/20 rounded-lg shadow-lg max-h-[300px] overflow-y-auto p-1">
            {available.map(([type, spec]) => (
              <button
                key={type} type="button"
                onClick={() => { onAdd(type); setOpen(false); }}
                className="w-full text-left px-2.5 py-2 rounded-md hover:bg-brand-cream/70 transition-colors"
              >
                <p className="text-[12.5px] font-medium text-brand-brown">{spec.label}</p>
                <p className="text-[11px] text-brand-tan leading-tight">{spec.desc}</p>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Editor ───────────────────────────────────────────────────────────────────
export default function LandingPageEditor() {
  const { id } = useParams();
  const router = useRouter();

  const [page, setPage] = useState(null);
  const [products, setProducts] = useState({});
  const [categories, setCategories] = useState([]);
  const [storeRates, setStoreRates] = useState({ insideDhaka: 60, suburbs: 100, outsideDhaka: 130 });
  const [tab, setTab] = useState("blocks");
  const [activeBlock, setActiveBlock] = useState("");
  const [device, setDevice] = useState("desktop");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [pRes, cRes, sRes] = await Promise.all([
          fetch(`/api/admin/landing-pages/${id}`),
          // The public categories route, not /api/admin/categories: it needs no
          // `categories.manage`, which a landing-page-only staffer won't hold.
          fetch("/api/categories"),
          fetch("/api/admin/settings"),
        ]);
        const pData = await pRes.json();
        if (!pRes.ok) throw new Error(pData.error || "Not found");

        const { form, products: prods } = hydrate(pData.page);
        setPage(form);
        setProducts(prods);
        setActiveBlock(form.blocks?.[0]?.key || "");

        const cData = await cRes.json();
        setCategories(Array.isArray(cData) ? cData : cData.categories || []);

        const sData = await sRes.json();
        if (sData?.shipping) setStoreRates(sData.shipping);
      } catch (err) {
        toast.error(err.message);
        router.push("/admin/landing-pages");
      }
    })();
  }, [id, router]);

  // Every edit funnels through here so the dirty flag can't drift.
  const update = useCallback((patch) => {
    setPage((prev) => ({ ...prev, ...(typeof patch === "function" ? patch(prev) : patch) }));
    setDirty(true);
  }, []);

  const cacheProduct = useCallback((p) => {
    setProducts((prev) => ({ ...prev, [p._id]: p }));
  }, []);

  // Warn before losing unsaved work.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const offersForPreview = useMemo(
    () => (page ? previewOffers(page.offers || [], products) : []),
    [page, products]
  );
  const shippingForPreview = useMemo(
    () => (page ? previewShipping(page.shipping || {}, storeRates) : null),
    [page, storeRates]
  );

  async function save(overrides = {}) {
    setSaving(true);
    try {
      const body = { ...page, ...overrides };
      const res = await fetch(`/api/admin/landing-pages/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");

      const { form, products: prods } = hydrate(data.page);
      setPage(form);
      setProducts((prev) => ({ ...prev, ...prods }));
      setDirty(false);
      toast.success(overrides.isActive === true ? "Published" : overrides.isActive === false ? "Unpublished" : "Saved");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!page) {
    return (
      <div className="flex justify-center py-24 text-brand-tan">
        <Loader2 size={24} className="animate-spin" />
      </div>
    );
  }

  const blocks = page.blocks || [];
  const selected = blocks.find((b) => b.key === activeBlock);
  const selectedSpec = selected ? LANDING_BLOCKS[selected.type] : null;

  const setBlocks = (next) => update({ blocks: next });
  const moveBlock = (i, dir) => {
    const next = [...blocks];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setBlocks(next);
  };
  const addBlock = (type) => {
    const block = { key: newKey(), type, enabled: true, data: blockDefaults(type) };
    setBlocks([...blocks, block]);
    setActiveBlock(block.key);
  };

  return (
    // landingFontVars here too, so the Typography picker's previews (outside the
    // page-preview pane) can render each option in its own font.
    <div className={landingFontVars}>
      <PageHeader
        title={page.name}
        subtitle={
          <span className="flex items-center gap-2">
            <span className="font-mono">/lp/{page.code}</span>
            <Pill tone={page.isActive ? "green" : "gray"}>{page.isActive ? "Live" : "Draft"}</Pill>
            {dirty && <Pill tone="amber">Unsaved</Pill>}
          </span>
        }
        actions={
          <>
            <Button as={Link} href="/admin/landing-pages" variant="ghost" size="sm">
              <ArrowLeft size={14} /> Back
            </Button>
            <Button as="a" href={`/lp/${page.code}`} target="_blank" rel="noopener" variant="outline" size="sm">
              <ExternalLink size={14} /> Open
            </Button>
            <Button
              variant={page.isActive ? "outline" : "secondary"} size="sm" disabled={saving}
              onClick={() => save({ isActive: !page.isActive })}
            >
              {page.isActive ? "Unpublish" : "Publish"}
            </Button>
            <Button size="sm" onClick={() => save()} disabled={saving || !dirty}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
            </Button>
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)] 2xl:grid-cols-[minmax(0,480px)_minmax(0,1fr)]">
        {/* ── Left: controls ──────────────────────────────────────────── */}
        <div className="min-w-0 space-y-4">
          <div className="flex gap-1 p-1 rounded-lg bg-brand-cream-dark/60">
            {TABS.map((t) => (
              <button
                key={t.id} type="button" onClick={() => setTab(t.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-[12.5px] font-medium transition-colors ${
                  tab === t.id ? "bg-white text-brand-brown shadow-sm" : "text-brand-tan hover:text-brand-brown"
                }`}
              >
                <t.icon size={14} /> {t.label}
              </button>
            ))}
          </div>

          {tab === "blocks" && (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,200px)_minmax(0,1fr)] xl:grid-cols-1">
              <Card className="space-y-1.5">
                <SectionTitle>Page sections</SectionTitle>
                {blocks.map((b, i) => (
                  <BlockRow
                    key={b.key}
                    block={b}
                    active={b.key === activeBlock}
                    isFirst={i === 0}
                    isLast={i === blocks.length - 1}
                    onSelect={() => setActiveBlock(b.key)}
                    onToggle={() => setBlocks(blocks.map((x, idx) => (idx === i ? { ...x, enabled: x.enabled === false } : x)))}
                    onMove={(dir) => moveBlock(i, dir)}
                    onRemove={() => {
                      setBlocks(blocks.filter((_, idx) => idx !== i));
                      if (b.key === activeBlock) setActiveBlock("");
                    }}
                  />
                ))}
                <div className="pt-1">
                  <AddBlockMenu onAdd={addBlock} existing={blocks} />
                </div>
              </Card>

              {selected && (
                <Card>
                  <div className="flex items-center justify-between mb-3">
                    <SectionTitle className="mb-0">{selectedSpec?.label}</SectionTitle>
                    <button onClick={() => setActiveBlock("")} className="text-brand-tan hover:text-brand-brown">
                      <X size={14} />
                    </button>
                  </div>
                  {selectedSpec?.fields?.length ? (
                    <BlockFields
                      fields={selectedSpec.fields}
                      data={selected.data || {}}
                      onChange={(data) => setBlocks(blocks.map((b) => (b.key === selected.key ? { ...b, data } : b)))}
                    />
                  ) : (
                    <p className="text-[12px] text-brand-tan leading-relaxed">
                      {selected.type === "orderform"
                        ? "The order form takes its products from the Offers tab and its wording from Settings → Order form."
                        : "This section has nothing to configure."}
                    </p>
                  )}
                </Card>
              )}
            </div>
          )}

          {tab === "offers" && (
            <OfferBuilder
              offers={page.offers || []}
              products={products}
              categories={categories}
              onChange={(offers) => update({ offers })}
              onProductsLoaded={cacheProduct}
            />
          )}

          {tab === "settings" && (
            <div className="space-y-4">
              <Card className="space-y-3.5">
                <SectionTitle>Page</SectionTitle>
                <Field label="Internal name">
                  <TextInput value={page.name} onChange={(e) => update({ name: e.target.value })} />
                </Field>
                <Field label="Link" hint="Short is better — this goes in your ads.">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13px] text-brand-tan whitespace-nowrap">/lp/</span>
                    <TextInput value={page.code} onChange={(e) => update({ code: e.target.value })} className="font-mono" />
                  </div>
                </Field>
                <div className="space-y-3">
                  {[
                    { key: "accent", label: "Accent colour" },
                    { key: "background", label: "Background colour" },
                    { key: "text", label: "Text colour" },
                  ].map((c) => (
                    <ColorField
                      key={c.key}
                      label={c.label}
                      value={page.theme?.[c.key]}
                      onChange={(v) => update({ theme: { ...page.theme, [c.key]: v } })}
                    />
                  ))}
                </div>

                <Field
                  label="Background image"
                  hint="Optional. Sits behind the whole page; the background colour shows through / around it."
                >
                  <ImagePicker value={page.theme?.backgroundImage || ""} onChange={(v) => update({ theme: { ...page.theme, backgroundImage: v } })} />
                </Field>
              </Card>

              <Card className="space-y-3">
                <div>
                  <SectionTitle className="mb-1">Typography</SectionTitle>
                  <p className="text-[11px] text-brand-tan">Every font supports both বাংলা and English.</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {Object.entries(LANDING_FONTS).map(([key, f]) => {
                    const active = (page.theme?.font || "hind_siliguri") === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => update({ theme: { ...page.theme, font: key } })}
                        className={`text-left rounded-lg border p-3 transition-colors ${
                          active ? "border-brand-terracotta bg-brand-terracotta/[0.06]" : "border-brand-tan/20 hover:border-brand-brown/30"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="text-[12px] font-semibold text-brand-brown">{f.label}</span>
                          {active ? (
                            <span className="w-4 h-4 rounded-full bg-brand-terracotta flex items-center justify-center flex-shrink-0">
                              <Check size={10} strokeWidth={3} className="text-white" />
                            </span>
                          ) : (
                            <span className="text-[9px] uppercase tracking-wide text-brand-tan">{f.group}</span>
                          )}
                        </div>
                        <div style={{ fontFamily: landingFontFamily(key) }}>
                          <p className="text-[15px] text-brand-brown leading-tight">{FONT_SAMPLE_BN}</p>
                          <p className="text-[12px] text-brand-tan leading-tight mt-0.5">{FONT_SAMPLE_EN}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </Card>

              <Card className="space-y-3.5">
                <SectionTitle>Order form</SectionTitle>
                <Field label="Form heading">
                  <TextInput value={page.form?.title || ""} onChange={(e) => update({ form: { ...page.form, title: e.target.value } })} />
                </Field>
                <Field label="Form subheading">
                  <TextInput value={page.form?.subtitle || ""} onChange={(e) => update({ form: { ...page.form, subtitle: e.target.value } })} />
                </Field>
                <Field label="Button text">
                  <TextInput value={page.form?.submitText || ""} onChange={(e) => update({ form: { ...page.form, submitText: e.target.value } })} />
                </Field>

                <div className="flex items-center justify-between py-1">
                  <div>
                    <p className="text-[12px] font-medium text-brand-brown">Ask for an email</p>
                    <p className="text-[11px] text-brand-tan">Optional field. Lets us send an order confirmation.</p>
                  </div>
                  <Toggle checked={page.form?.askEmail !== false} onChange={(v) => update({ form: { ...page.form, askEmail: v } })} />
                </div>
                <div className="flex items-center justify-between py-1">
                  <div>
                    <p className="text-[12px] font-medium text-brand-brown">Ask for a note</p>
                    <p className="text-[11px] text-brand-tan">Free-text box saved to the order notes.</p>
                  </div>
                  <Toggle checked={!!page.form?.askNote} onChange={(v) => update({ form: { ...page.form, askNote: v } })} />
                </div>

                <Field label="Thank-you heading">
                  <TextInput value={page.form?.successTitle || ""} onChange={(e) => update({ form: { ...page.form, successTitle: e.target.value } })} />
                </Field>
                <Field label="Thank-you message">
                  <textarea
                    rows={2} className={`${inputClass} resize-y`}
                    value={page.form?.successMessage || ""}
                    onChange={(e) => update({ form: { ...page.form, successMessage: e.target.value } })}
                  />
                </Field>
                <Field label="Redirect after order (optional)" hint="A thank-you URL, e.g. for a conversion pixel. Replaces the message above.">
                  <TextInput
                    value={page.form?.redirectUrl || ""} placeholder="https://…"
                    onChange={(e) => update({ form: { ...page.form, redirectUrl: e.target.value } })}
                  />
                </Field>
              </Card>

              <Card className="space-y-3.5">
                <SectionTitle>Delivery charge</SectionTitle>
                <Field label="Rate" hint="Free-shipping thresholds never apply on a landing page.">
                  <Select value={page.shipping?.mode || "settings"} onChange={(e) => update({ shipping: { ...page.shipping, mode: e.target.value } })}>
                    <option value="settings">Use the store&apos;s shipping rates</option>
                    <option value="free">Free delivery</option>
                    <option value="flat">One flat rate</option>
                    <option value="zones">Custom rate per zone</option>
                  </Select>
                </Field>

                {page.shipping?.mode === "flat" && (
                  <Field label="Flat rate (৳)">
                    <TextInput type="number" min="0" value={page.shipping?.flat ?? 0}
                      onChange={(e) => update({ shipping: { ...page.shipping, flat: Number(e.target.value) || 0 } })} />
                  </Field>
                )}

                {page.shipping?.mode === "zones" && (
                  <div className="grid grid-cols-3 gap-2">
                    {[["insideDhaka", "Inside Dhaka"], ["suburbs", "Suburbs"], ["outsideDhaka", "Outside Dhaka"]].map(([k, label]) => (
                      <Field key={k} label={label}>
                        <TextInput type="number" min="0" value={page.shipping?.[k] ?? 0}
                          onChange={(e) => update({ shipping: { ...page.shipping, [k]: Number(e.target.value) || 0 } })} />
                      </Field>
                    ))}
                  </div>
                )}

                {page.shipping?.mode !== "free" && page.shipping?.mode !== "flat" && (
                  <div className="flex items-center justify-between py-1">
                    <div>
                      <p className="text-[12px] font-medium text-brand-brown">Let the customer pick their area</p>
                      <p className="text-[11px] text-brand-tan">Off → everyone is charged the Inside-Dhaka rate.</p>
                    </div>
                    <Toggle checked={page.shipping?.askZone !== false} onChange={(v) => update({ shipping: { ...page.shipping, askZone: v } })} />
                  </div>
                )}
              </Card>

              <Card className="space-y-3.5">
                <SectionTitle>Search &amp; sharing</SectionTitle>
                <Field label="Browser / share title">
                  <TextInput value={page.seoTitle || ""} placeholder={page.name} onChange={(e) => update({ seoTitle: e.target.value })} />
                </Field>
                <Field label="Share description">
                  <textarea rows={2} className={`${inputClass} resize-y`} value={page.seoDescription || ""}
                    onChange={(e) => update({ seoDescription: e.target.value })} />
                </Field>
                <ImagePicker label="Share image" value={page.ogImage || ""} onChange={(v) => update({ ogImage: v })} />
              </Card>
            </div>
          )}
        </div>

        {/* ── Right: live preview ─────────────────────────────────────── */}
        <div className="min-w-0">
          <div className="sticky top-4">
            <div className="flex items-center justify-between mb-2">
              <SectionTitle className="mb-0">Live preview</SectionTitle>
              <div className="flex gap-1 p-0.5 rounded-lg bg-brand-cream-dark/60">
                {[["desktop", Monitor], ["mobile", Smartphone]].map(([d, Icon]) => (
                  <button
                    key={d} type="button" onClick={() => setDevice(d)}
                    className={`p-1.5 rounded-md transition-colors ${device === d ? "bg-white text-brand-brown shadow-sm" : "text-brand-tan"}`}
                    title={d}
                  >
                    <Icon size={14} />
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-brand-tan/20 bg-white overflow-hidden">
              <div
                className={`overflow-y-auto max-h-[calc(100vh-190px)] mx-auto transition-[width] ${
                  device === "mobile" ? "w-[390px] max-w-full border-x border-brand-tan/15" : "w-full"
                }`}
              >
                <LandingPageView
                  page={page}
                  offers={offersForPreview}
                  shipping={shippingForPreview}
                  preview
                />
              </div>
            </div>
            <p className="text-[11px] text-brand-tan mt-2 text-center">
              Ordering is disabled in the preview. Open the page to test a real order.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
