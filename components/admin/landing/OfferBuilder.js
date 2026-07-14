"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import {
  Package, Plus, Trash2, ChevronDown, ChevronRight, Star, Minus, Tag, Layers, Boxes,
} from "lucide-react";
import {
  Card, Button, Field, TextInput, Select, Toggle, Pill, inputClass, EmptyState,
} from "@/components/admin/ui";
import CategoryProductBrowser from "@/components/admin/CategoryProductBrowser";
import { ImagePicker } from "./BlockFields";
import { applyOfferPricing, PRICING_MODES } from "@/lib/landing-pricing";
import { formatPrice, shouldUnoptimizeImage } from "@/lib/utils";

// Builds the offers a landing page sells. One offer = one or more products with
// quantities (so "single product" and "3-piece bundle" are the same shape), plus
// a landing-page-specific price rule.
//
// The regular total previewed here uses each line's cheapest in-stock variant —
// the same basis the server prices against, so the discount an admin sees is the
// discount a customer gets.

const newKey = () => Math.random().toString(36).slice(2, 10);

const blankOffer = () => ({
  key: newKey(),
  label: "",
  description: "",
  badge: "",
  image: "",
  kind: "fixed",
  items: [],
  pricingMode: "auto",
  priceValue: 0,
  tiers: [],
  compareAtPrice: 0,
  isDefault: false,
  isActive: true,
});

// Cheapest variant price × quantity, summed. `products` is the lookup cache the
// editor fills as items are picked.
function regularTotal(offer, products) {
  return (offer.items || []).reduce((sum, line) => {
    const p = products[line.product];
    if (!p?.variants?.length) return sum;
    const unit = line.size
      ? p.variants.find((v) => v.size === line.size)?.price ?? 0
      : Math.min(...p.variants.map((v) => v.price));
    return sum + unit * (line.quantity || 1);
  }, 0);
}

function OfferLine({ line, product, onChange, onRemove, hideQuantity = false }) {
  const sizes = product?.variants || [];
  return (
    <div className="flex items-center gap-2.5 p-2 rounded-lg border border-brand-tan/20 bg-white">
      <div className="relative w-10 h-12 rounded bg-brand-cream-dark overflow-hidden flex-shrink-0">
        {product?.image && (
          <Image src={product.image} alt="" fill className="object-cover" sizes="40px" unoptimized={shouldUnoptimizeImage(product.image)} />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-medium text-brand-brown truncate">{product?.name || "Product"}</p>
        <p className="text-[10px] text-brand-tan">
          {sizes.length ? `${sizes.length} size${sizes.length === 1 ? "" : "s"}` : "No variants"}
        </p>
      </div>

      {/* Pin a size, or let the customer pick on the page. */}
      <select
        value={line.size || ""}
        onChange={(e) => onChange({ ...line, size: e.target.value })}
        className={`${inputClass} w-[130px] py-1.5 text-[12px]`}
        title="Pin a size, or let the customer choose"
      >
        <option value="">Customer picks size</option>
        {sizes.map((v) => (
          <option key={v.size} value={v.size} disabled={v.stock <= 0}>
            {v.size} {v.stock <= 0 ? "(out of stock)" : `· ${v.stock} left`}
          </option>
        ))}
      </select>

      {/* Fixed offers set a per-line quantity; in a collection the CUSTOMER
          chooses how many, so the stepper is hidden. */}
      {!hideQuantity && (
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button
            type="button" title="Decrease quantity"
            onClick={() => onChange({ ...line, quantity: Math.max(1, (line.quantity || 1) - 1) })}
            className="p-1.5 text-brand-tan hover:text-brand-brown"
          >
            <Minus size={13} />
          </button>
          <span className="w-6 text-center text-[12px] font-semibold text-brand-brown tabular-nums">
            {line.quantity || 1}
          </span>
          <button
            type="button" title="Increase quantity"
            onClick={() => onChange({ ...line, quantity: Math.min(50, (line.quantity || 1) + 1) })}
            className="p-1.5 text-brand-tan hover:text-brand-brown"
          >
            <Plus size={13} />
          </button>
        </div>
      )}

      <button type="button" onClick={onRemove} className="p-1.5 text-red-400 hover:text-red-600 flex-shrink-0">
        <Trash2 size={13} />
      </button>
    </div>
  );
}

// The manual quantity→price ladder for a collection offer. Each rung is "buy this
// many total, pay this" — deliberately non-linear.
function TierLadder({ tiers, onChange }) {
  const rows = tiers || [];
  const update = (i, patch) => onChange(rows.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  const remove = (i) => onChange(rows.filter((_, idx) => idx !== i));
  const add = () => {
    const nextQ = rows.length ? Math.max(...rows.map((t) => Number(t.quantity) || 0)) + 1 : 1;
    onChange([...rows, { quantity: nextQ, price: 0 }]);
  };

  return (
    <div>
      <div className="grid grid-cols-[1fr_1fr_auto] gap-2 mb-1.5 px-1">
        <span className="text-[10px] uppercase tracking-wide text-brand-tan">Quantity</span>
        <span className="text-[10px] uppercase tracking-wide text-brand-tan">Total price (৳)</span>
        <span />
      </div>
      <div className="space-y-1.5">
        {rows.map((t, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
            <TextInput
              type="number" min="1" value={t.quantity ?? ""}
              onChange={(e) => update(i, { quantity: Math.max(1, Number(e.target.value) || 1) })}
            />
            <TextInput
              type="number" min="0" value={t.price ?? ""}
              onChange={(e) => update(i, { price: Math.max(0, Number(e.target.value) || 0) })}
            />
            <button type="button" onClick={() => remove(i)} className="p-1.5 text-red-400 hover:text-red-600">
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
      <Button type="button" variant="outline" size="sm" className="mt-2" onClick={add}>
        <Plus size={13} /> Add a quantity tier
      </Button>
      {rows.length > 0 && (
        <p className="text-[11px] text-brand-tan mt-2">
          Customer can order {Math.min(...rows.map((t) => Number(t.quantity) || 0))}–{Math.max(...rows.map((t) => Number(t.quantity) || 0))} pieces, mixing &amp; matching from the pool above.
        </p>
      )}
    </div>
  );
}

function OfferCard({ offer, products, categories, onChange, onRemove, onMakeDefault, onProductsLoaded }) {
  const [open, setOpen] = useState(!offer.label);
  const [picking, setPicking] = useState(false);
  const isCollection = offer.kind === "collection";

  const regular = useMemo(() => regularTotal(offer, products), [offer, products]);
  const price = applyOfferPricing(offer, regular);
  const savings = Math.max(0, (Number(offer.compareAtPrice) || regular) - price);

  // Collection summary values.
  const tierQtys = (offer.tiers || []).map((t) => Number(t.quantity) || 0).filter((q) => q >= 1);
  const fromPrice = (offer.tiers || []).reduce((min, t) => Math.min(min, Number(t.price) || 0), Infinity);

  const set = (patch) => onChange({ ...offer, ...patch });

  function addProduct(p) {
    onProductsLoaded(p);
    set({ items: [...(offer.items || []), { product: p._id, quantity: 1, size: "" }] });
  }
  function removeProduct(id) {
    set({ items: (offer.items || []).filter((i) => i.product !== id) });
  }

  return (
    <Card padded={false} className="overflow-hidden">
      {/* Summary row */}
      <div className="flex items-center gap-2 p-3 sm:p-4">
        <button type="button" onClick={() => setOpen((v) => !v)} className="text-brand-tan hover:text-brand-brown flex-shrink-0">
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[13px] font-semibold text-brand-brown truncate">{offer.label || "Untitled offer"}</p>
            {offer.isDefault && <Pill tone="terracotta"><Star size={9} className="mr-0.5 fill-current" /> Default</Pill>}
            {!offer.isActive && <Pill tone="gray">Hidden</Pill>}
          </div>
          <p className="text-[11px] text-brand-tan mt-0.5">
            {isCollection ? (
              <>
                <span className="inline-flex items-center gap-1 text-brand-brown/70"><Boxes size={11} /> Collection</span>
                {" · "}{(offer.items || []).length} in pool
                {tierQtys.length > 0 && Number.isFinite(fromPrice) && (
                  <> · from <span className="font-semibold text-brand-brown">{formatPrice(fromPrice)}</span></>
                )}
              </>
            ) : (
              <>
                {(offer.items || []).length} product{(offer.items || []).length === 1 ? "" : "s"}
                {regular > 0 && (
                  <>
                    {" · "}
                    <span className="font-semibold text-brand-brown">{formatPrice(price)}</span>
                    {savings > 0 && <span className="line-through ml-1.5">{formatPrice(offer.compareAtPrice || regular)}</span>}
                  </>
                )}
              </>
            )}
          </p>
        </div>

        <Toggle checked={offer.isActive} onChange={(v) => set({ isActive: v })} />
        <Button
          variant="ghost" size="icon" title="Make this the pre-selected offer"
          onClick={onMakeDefault} disabled={offer.isDefault}
        >
          <Star size={14} className={offer.isDefault ? "fill-brand-terracotta text-brand-terracotta" : ""} />
        </Button>
        <Button variant="danger-ghost" size="icon" title="Delete offer" onClick={onRemove}>
          <Trash2 size={14} />
        </Button>
      </div>

      {open && (
        <div className="px-3 sm:px-4 pb-4 space-y-4 border-t border-brand-tan/10 pt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Offer name" hint="Shown on the buttons customers choose between.">
              <TextInput value={offer.label} onChange={(e) => set({ label: e.target.value })} placeholder="Buy 1 · Bundle of 3" />
            </Field>
            <Field label="Badge" hint="Optional ribbon, e.g. “Most popular”.">
              <TextInput value={offer.badge} onChange={(e) => set({ badge: e.target.value })} placeholder="Best value" />
            </Field>
          </div>

          <Field label="Short description">
            <TextInput value={offer.description} onChange={(e) => set({ description: e.target.value })} placeholder="Save ৳500 vs buying separately" />
          </Field>

          {/* ── Offer kind ───────────────────────────────────────────── */}
          <div>
            <span className="block text-[12px] font-medium text-brand-brown mb-1.5">Offer type</span>
            <div className="grid grid-cols-2 gap-2">
              {[
                { k: "fixed", icon: Layers, title: "Fixed set", desc: "A preset product (or bundle) at one price." },
                { k: "collection", icon: Boxes, title: "Collection", desc: "A pool the customer mixes & matches; price by quantity." },
              ].map(({ k, icon: Icon, title, desc }) => {
                const active = (offer.kind || "fixed") === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => set({ kind: k })}
                    className={`text-left rounded-lg border p-2.5 transition-colors ${
                      active ? "border-brand-terracotta bg-brand-terracotta/[0.06]" : "border-brand-tan/20 hover:border-brand-brown/30"
                    }`}
                  >
                    <span className="flex items-center gap-1.5 text-[12px] font-semibold text-brand-brown">
                      <Icon size={13} /> {title}
                    </span>
                    <span className="block text-[10.5px] text-brand-tan leading-tight mt-0.5">{desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Products / pool ──────────────────────────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[12px] font-medium text-brand-brown">
                {isCollection ? "Products in the pool" : "Products in this offer"}
              </span>
              <Button type="button" variant="outline" size="sm" onClick={() => setPicking((v) => !v)}>
                <Plus size={13} /> {picking ? "Done adding" : "Add products"}
              </Button>
            </div>

            {(offer.items || []).length === 0 && !picking ? (
              <div className="rounded-lg border border-dashed border-brand-tan/30 py-8 text-center">
                <Package size={20} className="mx-auto text-brand-tan/40 mb-2" />
                <p className="text-[12px] text-brand-tan">
                  {isCollection
                    ? "Add the products the customer can mix & match between."
                    : "Add one product to sell it alone, or several to sell a bundle."}
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {(offer.items || []).map((line, i) => (
                  <OfferLine
                    key={`${line.product}-${i}`}
                    line={line}
                    product={products[line.product]}
                    hideQuantity={isCollection}
                    onChange={(next) => set({ items: offer.items.map((it, idx) => (idx === i ? next : it)) })}
                    onRemove={() => set({ items: offer.items.filter((_, idx) => idx !== i) })}
                  />
                ))}
              </div>
            )}

            {picking && (
              <div className="mt-3">
                <CategoryProductBrowser
                  categories={categories}
                  endpoint="/api/admin/landing-pages/products"
                  selectedIds={(offer.items || []).map((i) => i.product)}
                  onAdd={addProduct}
                  onRemove={removeProduct}
                />
              </div>
            )}
          </div>

          {/* ── Pricing ──────────────────────────────────────────────── */}
          <div className="rounded-lg bg-brand-cream/40 border border-brand-tan/15 p-3">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-brand-tan mb-3">
              <Tag size={12} /> {isCollection ? "Quantity price ladder" : "Landing page price"}
            </div>

            {isCollection ? (
              <>
                <TierLadder tiers={offer.tiers} onChange={(tiers) => set({ tiers })} />
                <div className="grid gap-3 sm:grid-cols-2 mt-3 pt-3 border-t border-brand-tan/15">
                  <Field label="Strike-through price (৳)" hint="Optional — shown crossed out.">
                    <TextInput type="number" min="0" value={offer.compareAtPrice ?? 0} onChange={(e) => set({ compareAtPrice: Number(e.target.value) || 0 })} />
                  </Field>
                  <Field label="Offer thumbnail" hint="Defaults to the first product's photo.">
                    <ImagePicker value={offer.image} onChange={(v) => set({ image: v })} />
                  </Field>
                </div>
              </>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Discount type">
                    <Select value={offer.pricingMode} onChange={(e) => set({ pricingMode: e.target.value })}>
                      {PRICING_MODES.map((m) => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </Select>
                  </Field>

                  {offer.pricingMode !== "auto" && (
                    <Field
                      label={
                        offer.pricingMode === "fixed" ? "Bundle price (৳)"
                          : offer.pricingMode === "percent" ? "Percent off (%)"
                          : "Amount off (৳)"
                      }
                    >
                      <TextInput type="number" min="0" value={offer.priceValue ?? 0} onChange={(e) => set({ priceValue: Number(e.target.value) || 0 })} />
                    </Field>
                  )}

                  <Field label="Strike-through price (৳)" hint="Leave 0 to strike through the normal total.">
                    <TextInput type="number" min="0" value={offer.compareAtPrice ?? 0} onChange={(e) => set({ compareAtPrice: Number(e.target.value) || 0 })} />
                  </Field>

                  <Field label="Offer thumbnail" hint="Defaults to the first product's photo.">
                    <ImagePicker value={offer.image} onChange={(v) => set({ image: v })} />
                  </Field>
                </div>

                {(offer.items || []).length > 0 && (
                  <div className="mt-3 pt-3 border-t border-brand-tan/15 flex flex-wrap items-baseline gap-x-5 gap-y-1">
                    <span className="text-[11px] text-brand-tan">Normal total <b className="text-brand-brown">{formatPrice(regular)}</b></span>
                    <span className="text-[11px] text-brand-tan">Customer pays <b className="text-brand-terracotta text-[13px]">{formatPrice(price)}</b></span>
                    {savings > 0 && <span className="text-[11px] text-emerald-600 font-medium">They save {formatPrice(savings)}</span>}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

export default function OfferBuilder({ offers, products, categories, onChange, onProductsLoaded }) {
  function setOffer(i, next) {
    onChange(offers.map((o, idx) => (idx === i ? next : o)));
  }
  function makeDefault(i) {
    onChange(offers.map((o, idx) => ({ ...o, isDefault: idx === i })));
  }
  function add() {
    // The first offer is automatically the pre-selected one.
    onChange([...offers, { ...blankOffer(), isDefault: offers.length === 0 }]);
  }
  function remove(i) {
    const next = offers.filter((_, idx) => idx !== i);
    // Never leave the page without a default to pre-select.
    if (next.length && !next.some((o) => o.isDefault)) next[0].isDefault = true;
    onChange(next);
  }

  return (
    <div className="space-y-3">
      {offers.length === 0 ? (
        <Card>
          <EmptyState
            icon={Package}
            title="No offers yet"
            hint="An offer is what the customer buys — one product on its own, or several as a bundle at a special landing-page price."
            action={<Button onClick={add}><Plus size={14} /> Add your first offer</Button>}
          />
        </Card>
      ) : (
        <>
          {offers.map((offer, i) => (
            <OfferCard
              key={offer.key}
              offer={offer}
              products={products}
              categories={categories}
              onChange={(next) => setOffer(i, next)}
              onRemove={() => remove(i)}
              onMakeDefault={() => makeDefault(i)}
              onProductsLoaded={onProductsLoaded}
            />
          ))}
          <Button type="button" variant="outline" onClick={add}>
            <Plus size={14} /> Add another offer
          </Button>
        </>
      )}
    </div>
  );
}
