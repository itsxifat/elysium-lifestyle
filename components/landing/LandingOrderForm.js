"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import Image from "next/image";
import { Check, Loader2, ShieldCheck, Truck, PartyPopper, Plus, Minus, Tag, Gift } from "lucide-react";
import { shouldUnoptimizeImage, formatPrice, normalizeBdPhone } from "@/lib/utils";
import { applyOfferPricing, tierPriceFor } from "@/lib/landing-pricing";
import { applyPromotions, promotionHints } from "@/lib/landing-promotions";
import { trackEvent } from "@/lib/tracking/client";
import { offerContents, landingCustomData } from "@/lib/landing-tracking";

// The order form block. Three offer shapes:
//   fixed      → preset set; pick sizes.
//   collection → a pool; total quantity picks a tier price.
//   alacarte   → a pool; each item at its own price, cart total = sum.
// Page-wide promotions (free delivery / spend-and-save) apply on top of any of
// them. All prices here are previews recomputed with the same shared helpers the
// server uses; the server reprices from the DB on submit.

const ZONE_LABELS = {
  inside_dhaka: "Inside Dhaka",
  suburbs: "Dhaka Suburbs",
  outside_dhaka: "Outside Dhaka",
};

const fieldClass =
  "w-full px-4 py-3 rounded-xl border border-black/10 bg-white text-[14px] text-[color:var(--lp-text)] placeholder:text-[color:var(--lp-text)]/35 focus:outline-none focus:border-[color:var(--lp-accent)] focus:ring-2 focus:ring-[color:var(--lp-accent)]/15 transition-shadow";

const labelClass = "block text-[12px] font-medium text-[color:var(--lp-text)]/70 mb-1.5";

function initialSizes(offer) {
  const out = {};
  if (offer?.kind === "collection" || offer?.kind === "alacarte") return out;
  (offer?.items || []).forEach((line, i) => {
    out[i] = line.pinnedSize || line.sizes?.[0]?.size || "";
  });
  return out;
}

function initialPicks(offer) {
  const out = {};
  if (offer?.kind !== "collection" && offer?.kind !== "alacarte") return out;
  (offer.pool || []).forEach((p) => {
    out[p.productId] = { size: p.pinnedSize || p.sizes?.[0]?.size || "", qty: 0 };
  });
  return out;
}

// The unit price of a pool product for the currently chosen size.
function poolUnit(p, size) {
  return (p.sizes.find((s) => s.size === size) ?? p.sizes[0])?.price ?? 0;
}

export default function LandingOrderForm({ code, offers = [], form = {}, shipping, promotions = {}, preview = false }) {
  const [offerKey, setOfferKey] = useState(() => (offers.find((o) => o.isDefault) || offers[0])?.key || "");
  const offer = useMemo(() => offers.find((o) => o.key === offerKey) || offers[0], [offers, offerKey]);
  const isCollection = offer?.kind === "collection";
  const isAlacarte = offer?.kind === "alacarte";
  const isPool = isCollection || isAlacarte;

  const [sizes, setSizes] = useState(() => initialSizes(offer));
  const [picks, setPicks] = useState(() => initialPicks(offer));
  const [zone, setZone] = useState("inside_dhaka");
  const [values, setValues] = useState({ name: "", phone: "", email: "", street: "", city: "", note: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);

  useEffect(() => {
    setSizes(initialSizes(offer));
    setPicks(initialPicks(offer));
  }, [offer]);

  const totalQty = useMemo(() => {
    if (isPool) return Object.values(picks).reduce((n, x) => n + (x?.qty || 0), 0);
    return (offer?.items || []).reduce((n, l) => n + (l.quantity || 1), 0);
  }, [isPool, picks, offer]);

  // Goods price (what they pay for products, before delivery) + strike-through.
  const goods = useMemo(() => {
    if (!offer) return { price: 0, compareAt: 0, priced: false };

    if (isPool) {
      const regular = (offer.pool || []).reduce((sum, p) => {
        const pk = picks[p.productId];
        return pk?.qty ? sum + poolUnit(p, pk.size) * pk.qty : sum;
      }, 0);
      const price = isCollection ? tierPriceFor(offer.tiers, totalQty) ?? 0 : applyOfferPricing(offer.pricing, regular);
      const priced = totalQty >= (offer.minQty || 1) && (isAlacarte ? totalQty > 0 : price > 0);
      return { price, compareAt: offer.manualCompareAt || regular, priced };
    }

    const regular = (offer.items || []).reduce((sum, line, i) => {
      const chosen = line.pinnedSize || sizes[i];
      const v = line.sizes?.find((s) => s.size === chosen) ?? line.sizes?.[0];
      return sum + (v?.price ?? 0) * line.quantity;
    }, 0);
    const price = applyOfferPricing(offer.pricing, regular);
    return { price, compareAt: offer.manualCompareAt || regular, priced: true };
  }, [offer, isPool, isCollection, isAlacarte, sizes, picks, totalQty]);

  // Promotions on top of the goods price.
  const promo = useMemo(() => {
    const base = shipping?.rates?.[zone] ?? 0;
    const res = applyPromotions({ goodsTotal: goods.price, quantity: totalQty, shippingFee: base, promotions });
    const hints = promotionHints({ goodsTotal: goods.price, quantity: totalQty, promotions });
    return { ...res, promoDiscount: Math.min(res.promoDiscount, goods.price), baseShipping: base, hints };
  }, [goods.price, totalQty, zone, shipping, promotions]);

  const offerSavings = Math.max(0, goods.compareAt - goods.price);
  const total = Math.max(0, goods.price - promo.promoDiscount + promo.shippingFee);

  const needsSize = !isPool && (offer?.items || []).some((line, i) => !line.pinnedSize && !sizes[i]);

  // ── Funnel tracking ────────────────────────────────────────────────────────
  // The page fires PageView + ViewContent (LandingTracking); the form owns the
  // rest, because it's the only thing that knows what the customer chose.
  // `preview` is the admin's live editor — never report that as traffic.
  const cart = useMemo(() => offerContents(offer, { sizes, picks }), [offer, sizes, picks]);
  const [engaged, setEngaged] = useState(false); // has the customer picked anything?
  const icFired = useRef(false);
  const lastAtc = useRef("");

  const selectOffer = (key) => { setEngaged(true); setOfferKey(key); };
  const chooseSize = (i, size) => { setEngaged(true); setSizes((prev) => ({ ...prev, [i]: size })); };
  const setPickSize = (productId, size) => {
    setEngaged(true);
    setPicks((prev) => ({ ...prev, [productId]: { ...prev[productId], size } }));
  };
  const bump = (productId, delta) => {
    setEngaged(true);
    setPicks((prev) => {
      const cur = prev[productId] || { size: "", qty: 0 };
      if (delta > 0 && offer.maxQty && totalQty >= offer.maxQty) return prev;
      return { ...prev, [productId]: { ...cur, qty: Math.max(0, (cur.qty || 0) + delta) } };
    });
  };

  // AddToCart once the selection settles. Picking a package, a size or a
  // quantity is this funnel's equivalent of filling a cart — but only after a
  // real interaction, since the default offer is preselected and ViewContent
  // already covers arriving on the page. Debounced so tapping a stepper 1→5
  // reports the cart the customer settled on, not five carts.
  useEffect(() => {
    if (preview || !engaged || !offer || !goods.priced || !cart.length) return;
    const signature = `${offer.key}|${cart.map((c) => `${c.id}:${c.quantity}:${c.item_price}`).join(",")}`;
    if (signature === lastAtc.current) return;
    const timer = setTimeout(() => {
      lastAtc.current = signature;
      trackEvent("AddToCart", { customData: landingCustomData(offer, { value: goods.price, contents: cart }) });
    }, 800);
    return () => clearTimeout(timer);
  }, [preview, engaged, offer, cart, goods.priced, goods.price]);

  // InitiateCheckout the moment they start entering delivery details — on a
  // one-page COD funnel that *is* the "started checkout" moment.
  const setField = (field, value) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    if (preview || icFired.current || !String(value).trim()) return;
    icFired.current = true;
    trackEvent("InitiateCheckout", { customData: landingCustomData(offer, { value: total, contents: cart }) });
  };

  async function submit(e) {
    e.preventDefault();
    if (preview) return;
    setError("");

    if (isPool) {
      if (totalQty < (offer.minQty || 1)) return setError(`Please choose at least ${offer.minQty || 1} item${(offer.minQty || 1) === 1 ? "" : "s"}.`);
    } else if (needsSize) {
      return setError("Please choose a size for each product.");
    }
    if (!values.name.trim()) return setError("Please enter your name.");
    if (!/^01\d{9}$/.test(normalizeBdPhone(values.phone))) return setError("Enter a valid 11-digit mobile number (01XXXXXXXXX).");
    if (!values.street.trim()) return setError("Please enter your full address.");
    if (!values.city.trim()) return setError("Please enter your city or district.");

    const selections = isPool
      ? Object.entries(picks).filter(([, x]) => x.qty > 0).map(([productId, x]) => ({ productId, size: x.size, quantity: x.qty }))
      : undefined;

    setSubmitting(true);
    try {
      const res = await fetch("/api/landing/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code, offerKey: offer.key,
          ...(isPool ? { selections } : { sizes }),
          shippingZone: zone,
          name: values.name, phone: values.phone, email: values.email, street: values.street, city: values.city, note: values.note,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not place the order.");

      // Browser-side Purchase, sharing the deterministic `purchase_<orderId>`
      // the server already fired with — Meta keeps exactly one of the pair. The
      // form itself is the best advanced-matching source we'll ever have, so
      // send it: hashing happens server-side in /api/events, never here.
      if (!preview) {
        const [firstName, ...rest] = values.name.trim().split(/\s+/);
        await trackEvent("Purchase", {
          eventId: `purchase_${data.orderId}`,
          customData: {
            ...landingCustomData(offer, { value: data.totalAmount, contents: cart }),
            order_id: data.orderNumber,
          },
          userData: {
            email: values.email || undefined,
            phone: normalizeBdPhone(values.phone),
            firstName,
            lastName: rest.join(" ") || undefined,
            city: values.city,
            country: "BD",
          },
        });
      }

      if (data.redirectUrl) { window.location.href = data.redirectUrl; return; }
      setDone(data);
      window.scrollTo({ top: document.getElementById("order")?.offsetTop ?? 0, behavior: "smooth" });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <section id="order" className="px-4 sm:px-6 py-16">
        <div className="max-w-lg mx-auto text-center rounded-2xl border border-black/[0.07] bg-white p-10">
          <div className="w-14 h-14 rounded-full mx-auto flex items-center justify-center mb-5" style={{ background: "var(--lp-accent)" }}>
            <PartyPopper size={24} className="text-white" />
          </div>
          <h2 className="text-xl font-bold text-[color:var(--lp-text)]">{form.successTitle}</h2>
          {form.successMessage && <p className="text-[14px] text-[color:var(--lp-text)]/65 mt-2 leading-relaxed">{form.successMessage}</p>}
          <div className="mt-6 rounded-xl bg-black/[0.03] px-5 py-4 text-left space-y-1.5">
            <p className="text-[12px] text-[color:var(--lp-text)]/55">Order number</p>
            <p className="font-semibold text-[color:var(--lp-text)] tracking-wide">{done.orderNumber}</p>
            <p className="text-[12px] text-[color:var(--lp-text)]/55 pt-2">Amount payable on delivery</p>
            <p className="font-semibold text-[color:var(--lp-text)]">{formatPrice(done.totalAmount)}</p>
          </div>
        </div>
      </section>
    );
  }

  if (!offers.length) {
    return (
      <section id="order" className="px-4 sm:px-6 py-16">
        <p className="text-center text-[14px] text-[color:var(--lp-text)]/50">
          {preview ? "Add an offer to see the order form." : "This offer is sold out."}
        </p>
      </section>
    );
  }

  return (
    <section id="order" className="px-4 sm:px-6 py-14 scroll-mt-4">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[color:var(--lp-text)]">{form.title}</h2>
          {form.subtitle && <p className="text-[14px] text-[color:var(--lp-text)]/60 mt-2">{form.subtitle}</p>}
        </div>

        <form onSubmit={submit} className="rounded-2xl border border-black/[0.07] bg-white overflow-hidden">
          {offers.length > 1 && (
            <div className="p-5 sm:p-6 border-b border-black/[0.06]">
              <p className={labelClass}>Choose your package</p>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {offers.map((o) => {
                  const active = o.key === offer.key;
                  const fromPrice = o.kind === "collection" || o.kind === "alacarte";
                  return (
                    <button
                      type="button" key={o.key} onClick={() => selectOffer(o.key)}
                      className="relative flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-colors"
                      style={{ borderColor: active ? "var(--lp-accent)" : "rgba(0,0,0,0.08)", background: active ? "color-mix(in srgb, var(--lp-accent) 6%, white)" : "white" }}
                    >
                      {o.image && (
                        <div className="relative w-12 h-14 rounded-lg overflow-hidden bg-black/5 flex-shrink-0">
                          <Image src={o.image} alt="" fill className="object-cover" sizes="48px" unoptimized={shouldUnoptimizeImage(o.image)} />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-semibold text-[color:var(--lp-text)] truncate">{o.label}</p>
                        {o.description && <p className="text-[11px] text-[color:var(--lp-text)]/55 truncate">{o.description}</p>}
                        <p className="text-[13px] font-bold mt-0.5" style={{ color: "var(--lp-accent)" }}>
                          {fromPrice && <span className="font-normal text-[color:var(--lp-text)]/50">from </span>}
                          {formatPrice(o.price)}
                          {!fromPrice && o.savings > 0 && (
                            <span className="ml-1.5 text-[11px] font-normal text-[color:var(--lp-text)]/40 line-through">{formatPrice(o.compareAtPrice)}</span>
                          )}
                        </p>
                      </div>
                      {o.badge && (
                        <span className="absolute -top-2 right-3 text-[9px] uppercase tracking-wide font-bold px-2 py-0.5 rounded-full text-white" style={{ background: "var(--lp-accent)" }}>{o.badge}</span>
                      )}
                      {active && (
                        <span className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "var(--lp-accent)" }}>
                          <Check size={12} strokeWidth={3} className="text-white" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Item selection */}
          {isPool ? (
            <PoolPicker offer={offer} picks={picks} totalQty={totalQty} isCollection={isCollection} onSize={setPickSize} onBump={bump} />
          ) : (
            <div className="p-5 sm:p-6 border-b border-black/[0.06] space-y-4">
              {(offer.items || []).map((line, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="relative w-12 h-14 rounded-lg overflow-hidden bg-black/5 flex-shrink-0">
                    {line.image && <Image src={line.image} alt="" fill className="object-cover" sizes="48px" unoptimized={shouldUnoptimizeImage(line.image)} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-[color:var(--lp-text)] truncate">
                      {line.name}{line.quantity > 1 && <span className="text-[color:var(--lp-text)]/45"> × {line.quantity}</span>}
                    </p>
                    {line.pinnedSize ? (
                      <p className="text-[11px] text-[color:var(--lp-text)]/50 mt-0.5">Size {line.pinnedSize}</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {line.sizes.map((s) => {
                          const active = sizes[i] === s.size;
                          return (
                            <button
                              type="button" key={s.size} onClick={() => chooseSize(i, s.size)}
                              className="min-w-[38px] px-2.5 py-1 rounded-lg border text-[12px] font-medium transition-colors"
                              style={{ borderColor: active ? "var(--lp-accent)" : "rgba(0,0,0,0.12)", background: active ? "var(--lp-accent)" : "white", color: active ? "#fff" : "inherit" }}
                            >
                              {s.size}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Delivery details */}
          <div className="p-5 sm:p-6 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="lp-name">Full name *</label>
                <input id="lp-name" className={fieldClass} autoComplete="name" required value={values.name} onChange={(e) => setField("name", e.target.value)} />
              </div>
              <div>
                <label className={labelClass} htmlFor="lp-phone">Mobile number *</label>
                <input id="lp-phone" className={fieldClass} inputMode="tel" autoComplete="tel" placeholder="01XXXXXXXXX" required value={values.phone} onChange={(e) => setField("phone", e.target.value)} />
              </div>
            </div>

            {form.askEmail && (
              <div>
                <label className={labelClass} htmlFor="lp-email">Email (optional)</label>
                <input id="lp-email" type="email" className={fieldClass} autoComplete="email" value={values.email} onChange={(e) => setField("email", e.target.value)} />
              </div>
            )}

            <div>
              <label className={labelClass} htmlFor="lp-street">Full delivery address *</label>
              <textarea id="lp-street" rows={2} className={`${fieldClass} resize-none`} autoComplete="street-address" required placeholder="House, road, area" value={values.street} onChange={(e) => setField("street", e.target.value)} />
            </div>

            <div className={shipping?.askZone ? "grid gap-4 sm:grid-cols-2" : ""}>
              <div>
                <label className={labelClass} htmlFor="lp-city">City / District *</label>
                <input id="lp-city" className={fieldClass} autoComplete="address-level2" required value={values.city} onChange={(e) => setField("city", e.target.value)} />
              </div>
              {shipping?.askZone && (
                <div>
                  <p className={labelClass}>Delivery area</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {Object.keys(ZONE_LABELS).map((z) => {
                      const active = zone === z;
                      return (
                        <button
                          type="button" key={z} onClick={() => setZone(z)}
                          className="px-2 py-2.5 rounded-xl border text-[11px] font-medium leading-tight transition-colors"
                          style={{ borderColor: active ? "var(--lp-accent)" : "rgba(0,0,0,0.12)", background: active ? "color-mix(in srgb, var(--lp-accent) 8%, white)" : "white", color: active ? "var(--lp-accent)" : "inherit" }}
                        >
                          {ZONE_LABELS[z]}
                          <span className="block text-[10px] opacity-60">{formatPrice(shipping.rates[z])}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {form.askNote && (
              <div>
                <label className={labelClass} htmlFor="lp-note">{form.noteLabel}</label>
                <textarea id="lp-note" rows={2} className={`${fieldClass} resize-none`} value={values.note} onChange={(e) => setField("note", e.target.value)} />
              </div>
            )}
          </div>

          {/* Summary + submit */}
          <div className="px-5 sm:px-6 py-5 bg-black/[0.02] border-t border-black/[0.06] space-y-2">
            <div className="flex justify-between text-[13px] text-[color:var(--lp-text)]/70">
              <span>{offer.label}{isPool && totalQty > 0 && <span className="text-[color:var(--lp-text)]/45"> · {totalQty} pcs</span>}</span>
              <span>{isPool && !goods.priced ? "—" : formatPrice(goods.price)}</span>
            </div>
            {offerSavings > 0 && goods.priced && (
              <div className="flex justify-between text-[13px]" style={{ color: "var(--lp-accent)" }}>
                <span>Offer saving</span>
                <span>−{formatPrice(offerSavings)}</span>
              </div>
            )}
            {promo.promoDiscount > 0 && goods.priced && (
              <div className="flex justify-between text-[13px]" style={{ color: "var(--lp-accent)" }}>
                <span className="flex items-center gap-1"><Tag size={12} /> {promo.promoLabel || "Discount"}</span>
                <span>−{formatPrice(promo.promoDiscount)}</span>
              </div>
            )}
            <div className="flex justify-between text-[13px] text-[color:var(--lp-text)]/70">
              <span>Delivery</span>
              <span>
                {promo.freeShipping && promo.baseShipping > 0 ? (
                  <><span className="line-through opacity-50 mr-1">{formatPrice(promo.baseShipping)}</span>Free</>
                ) : promo.shippingFee === 0 ? "Free" : formatPrice(promo.shippingFee)}
              </span>
            </div>

            {/* Promotion nudges */}
            {goods.priced && (promo.hints.freeShipping || promo.hints.discount) && (
              <div className="space-y-1 pt-1">
                {promo.hints.freeShipping && (promo.hints.freeShipping.amountMore > 0 || promo.hints.freeShipping.quantityMore > 0) && (
                  <p className="text-[11px] flex items-center gap-1" style={{ color: "var(--lp-accent)" }}>
                    <Truck size={12} />
                    {promo.hints.freeShipping.amountMore > 0
                      ? `Add ${formatPrice(promo.hints.freeShipping.amountMore)} more for FREE delivery`
                      : `Add ${promo.hints.freeShipping.quantityMore} more item(s) for FREE delivery`}
                  </p>
                )}
                {promo.hints.discount && (promo.hints.discount.amountMore > 0 || promo.hints.discount.quantityMore > 0) && (
                  <p className="text-[11px] flex items-center gap-1" style={{ color: "var(--lp-accent)" }}>
                    <Gift size={12} />
                    {promo.hints.discount.amountMore > 0
                      ? `Add ${formatPrice(promo.hints.discount.amountMore)} more — ${promo.hints.discount.label}`
                      : `Add ${promo.hints.discount.quantityMore} more item(s) — ${promo.hints.discount.label}`}
                  </p>
                )}
              </div>
            )}

            <div className="flex justify-between pt-2 mt-1 border-t border-black/[0.07] text-[15px] font-bold text-[color:var(--lp-text)]">
              <span>Total payable</span>
              <span>{isPool && !goods.priced ? "—" : formatPrice(total)}</span>
            </div>

            {error && <p className="text-[12px] text-red-600 bg-red-50 rounded-lg px-3 py-2 mt-2" role="alert">{error}</p>}

            <button
              type="submit" disabled={submitting || preview}
              className="w-full mt-3 py-4 rounded-xl text-white font-semibold text-[15px] tracking-wide shadow-lg transition-transform hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60 disabled:hover:scale-100 flex items-center justify-center gap-2"
              style={{ background: "var(--lp-accent)" }}
            >
              {submitting && <Loader2 size={16} className="animate-spin" />}
              {submitting ? "Placing your order…" : form.submitText}
            </button>

            <div className="flex items-center justify-center gap-5 pt-2 text-[11px] text-[color:var(--lp-text)]/50">
              <span className="flex items-center gap-1.5"><Truck size={13} /> Cash on delivery</span>
              <span className="flex items-center gap-1.5"><ShieldCheck size={13} /> No advance payment</span>
            </div>
          </div>
        </form>
      </div>
    </section>
  );
}

// Pool picker for collection + à la carte: a size selector + quantity stepper per
// product. Collection shows the price ladder; à la carte shows each unit price.
function PoolPicker({ offer, picks, totalQty, isCollection, onSize, onBump }) {
  const atMax = offer.maxQty && totalQty >= offer.maxQty;
  const activeTierQty = isCollection ? [...(offer.tiers || [])].reverse().find((t) => t.quantity <= totalQty)?.quantity ?? 0 : 0;
  const rangeLabel = offer.minQty === offer.maxQty && offer.maxQty ? `${offer.maxQty}` : `${offer.minQty || 1}${offer.maxQty ? `–${offer.maxQty}` : "+"}`;

  return (
    <div className="border-b border-black/[0.06]">
      {isCollection ? (
        <div className="px-5 sm:px-6 pt-5">
          <p className={labelClass}>Pick any {rangeLabel} — price drops as you add</p>
          <div className="flex flex-wrap gap-1.5">
            {offer.tiers.map((t) => {
              const active = t.quantity === activeTierQty;
              return (
                <span key={t.quantity} className="px-2.5 py-1 rounded-lg text-[11.5px] font-medium border transition-colors"
                  style={{ borderColor: active ? "var(--lp-accent)" : "rgba(0,0,0,0.1)", background: active ? "color-mix(in srgb, var(--lp-accent) 10%, white)" : "white", color: active ? "var(--lp-accent)" : "inherit" }}>
                  {t.quantity} pcs · {formatPrice(t.price)}
                </span>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="px-5 sm:px-6 pt-5">
          <p className={labelClass}>Pick what you want{offer.minQty > 1 || offer.maxQty ? ` (${rangeLabel} items)` : ""}</p>
        </div>
      )}

      <div className="p-5 sm:p-6 space-y-3">
        {(offer.pool || []).map((p) => {
          const pk = picks[p.productId] || { size: "", qty: 0 };
          return (
            <div key={p.productId} className="flex items-center gap-3">
              <div className="relative w-12 h-14 rounded-lg overflow-hidden bg-black/5 flex-shrink-0">
                {p.image && <Image src={p.image} alt="" fill className="object-cover" sizes="48px" unoptimized={shouldUnoptimizeImage(p.image)} />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-[color:var(--lp-text)] truncate">
                  {p.name}
                  {!isCollection && <span className="text-[color:var(--lp-text)]/55"> · {formatPrice(poolUnit(p, pk.size))}</span>}
                </p>
                {p.pinnedSize ? (
                  <p className="text-[11px] text-[color:var(--lp-text)]/50 mt-0.5">Size {p.pinnedSize}</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {p.sizes.map((s) => {
                      const active = pk.size === s.size;
                      return (
                        <button
                          type="button" key={s.size} onClick={() => onSize(p.productId, s.size)}
                          className="min-w-[34px] px-2 py-0.5 rounded-md border text-[11px] font-medium transition-colors"
                          style={{ borderColor: active ? "var(--lp-accent)" : "rgba(0,0,0,0.12)", background: active ? "var(--lp-accent)" : "white", color: active ? "#fff" : "inherit" }}
                        >
                          {s.size}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button type="button" onClick={() => onBump(p.productId, -1)} disabled={!pk.qty} className="w-7 h-7 rounded-full border border-black/15 flex items-center justify-center text-[color:var(--lp-text)]/70 disabled:opacity-30">
                  <Minus size={13} />
                </button>
                <span className="w-6 text-center text-[13px] font-semibold tabular-nums text-[color:var(--lp-text)]">{pk.qty || 0}</span>
                <button type="button" onClick={() => onBump(p.productId, 1)} disabled={!!atMax} className="w-7 h-7 rounded-full flex items-center justify-center text-white disabled:opacity-30" style={{ background: "var(--lp-accent)" }}>
                  <Plus size={13} />
                </button>
              </div>
            </div>
          );
        })}

        <p className="text-[12px] text-center pt-1" style={{ color: atMax ? "var(--lp-accent)" : "var(--lp-text)" }}>
          {totalQty === 0
            ? `Add ${offer.minQty || 1} or more to see your price`
            : atMax
            ? `Maximum ${offer.maxQty} items selected`
            : `${totalQty} selected${totalQty < (offer.minQty || 1) ? ` — add ${(offer.minQty || 1) - totalQty} more` : ""}`}
        </p>
      </div>
    </div>
  );
}
