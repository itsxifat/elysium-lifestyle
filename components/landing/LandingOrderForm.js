"use client";

import { useState, useMemo, useEffect } from "react";
import Image from "next/image";
import { Check, Loader2, ShieldCheck, Truck, PartyPopper, Plus, Minus } from "lucide-react";
import { shouldUnoptimizeImage, formatPrice, normalizeBdPhone } from "@/lib/utils";
import { applyOfferPricing, tierPriceFor } from "@/lib/landing-pricing";

// The order form block: pick an offer → choose items → enter delivery details →
// confirm. Cash on delivery, so the order is final the moment it's submitted.
//
// Two offer shapes:
//   fixed      → a preset set of products; the customer just picks sizes.
//   collection → a pool the customer mixes & matches from; the total quantity
//                picks a rung of the manual price ladder (tierPriceFor).
//
// Prices shown here are recomputed locally as the shopper changes their picks
// (same helpers the server uses). The server reprices everything from the DB on
// submit, so this is presentation only.

const ZONE_LABELS = {
  inside_dhaka: "Inside Dhaka",
  suburbs: "Dhaka Suburbs",
  outside_dhaka: "Outside Dhaka",
};

const fieldClass =
  "w-full px-4 py-3 rounded-xl border border-black/10 bg-white text-[14px] text-[color:var(--lp-text)] placeholder:text-[color:var(--lp-text)]/35 focus:outline-none focus:border-[color:var(--lp-accent)] focus:ring-2 focus:ring-[color:var(--lp-accent)]/15 transition-shadow";

const labelClass = "block text-[12px] font-medium text-[color:var(--lp-text)]/70 mb-1.5";

// Fixed offer: the size each line starts on (pinned, else first in stock).
function initialSizes(offer) {
  const out = {};
  if (offer?.kind === "collection") return out;
  (offer?.items || []).forEach((line, i) => {
    out[i] = line.pinnedSize || line.sizes?.[0]?.size || "";
  });
  return out;
}

// Collection offer: every pool product starts at quantity 0 with a default size.
function initialPicks(offer) {
  const out = {};
  if (offer?.kind !== "collection") return out;
  (offer.pool || []).forEach((p) => {
    out[p.productId] = { size: p.pinnedSize || p.sizes?.[0]?.size || "", qty: 0 };
  });
  return out;
}

export default function LandingOrderForm({ code, offers = [], form = {}, shipping, preview = false }) {
  const [offerKey, setOfferKey] = useState(() => (offers.find((o) => o.isDefault) || offers[0])?.key || "");
  const offer = useMemo(() => offers.find((o) => o.key === offerKey) || offers[0], [offers, offerKey]);
  const isCollection = offer?.kind === "collection";

  const [sizes, setSizes] = useState(() => initialSizes(offer));
  const [picks, setPicks] = useState(() => initialPicks(offer));
  const [zone, setZone] = useState("inside_dhaka");
  const [values, setValues] = useState({ name: "", phone: "", email: "", street: "", city: "", note: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);

  // Switching offers resets the item choices to that offer's defaults.
  useEffect(() => {
    setSizes(initialSizes(offer));
    setPicks(initialPicks(offer));
  }, [offer]);

  const totalQty = useMemo(
    () => (isCollection ? Object.values(picks).reduce((n, x) => n + (x?.qty || 0), 0) : 0),
    [isCollection, picks]
  );

  // Live totals for the current picks. For a collection the price comes from the
  // ladder; for a fixed offer from its discount rule.
  const totals = useMemo(() => {
    const shippingFee = shipping?.rates?.[zone] ?? 0;
    if (!offer) return { price: 0, savings: 0, shippingFee, total: shippingFee };

    if (isCollection) {
      const regular = (offer.pool || []).reduce((sum, p) => {
        const pk = picks[p.productId];
        if (!pk?.qty) return sum;
        const v = p.sizes.find((s) => s.size === pk.size) ?? p.sizes[0];
        return sum + (v?.price ?? 0) * pk.qty;
      }, 0);
      const price = tierPriceFor(offer.tiers, totalQty) ?? 0;
      const compareAt = offer.manualCompareAt || regular;
      return {
        price,
        compareAt,
        savings: Math.max(0, compareAt - price),
        shippingFee,
        total: price + shippingFee,
        priced: totalQty >= (offer.minQty || 1) && price > 0,
      };
    }

    const regular = (offer.items || []).reduce((sum, line, i) => {
      const chosen = line.pinnedSize || sizes[i];
      const variant = line.sizes?.find((s) => s.size === chosen) ?? line.sizes?.[0];
      return sum + (variant?.price ?? 0) * line.quantity;
    }, 0);
    const price = applyOfferPricing(offer.pricing, regular);
    const compareAt = offer.manualCompareAt || regular;
    return { price, compareAt, savings: Math.max(0, compareAt - price), shippingFee, total: price + shippingFee, priced: true };
  }, [offer, isCollection, sizes, picks, totalQty, zone, shipping]);

  const needsSize = !isCollection && (offer?.items || []).some((line, i) => !line.pinnedSize && !sizes[i]);

  // ── Collection stepper actions ─────────────────────────────────────────────
  const setPickSize = (productId, size) =>
    setPicks((prev) => ({ ...prev, [productId]: { ...prev[productId], size } }));
  const bump = (productId, delta) =>
    setPicks((prev) => {
      const cur = prev[productId] || { size: "", qty: 0 };
      let next = (cur.qty || 0) + delta;
      next = Math.max(0, next);
      // Don't let the running total exceed the top rung of the ladder.
      if (delta > 0 && offer.maxQty && totalQty >= offer.maxQty) return prev;
      return { ...prev, [productId]: { ...cur, qty: next } };
    });

  async function submit(e) {
    e.preventDefault();
    if (preview) return;
    setError("");

    if (isCollection) {
      if (totalQty < (offer.minQty || 1)) {
        return setError(`Please choose at least ${offer.minQty || 1} item${(offer.minQty || 1) === 1 ? "" : "s"}.`);
      }
    } else if (needsSize) {
      return setError("Please choose a size for each product.");
    }

    if (!values.name.trim()) return setError("Please enter your name.");
    // Same normalisation the server applies (Bangla digits, +88 prefix…).
    if (!/^01\d{9}$/.test(normalizeBdPhone(values.phone)))
      return setError("Enter a valid 11-digit mobile number (01XXXXXXXXX).");
    if (!values.street.trim()) return setError("Please enter your full address.");
    if (!values.city.trim()) return setError("Please enter your city or district.");

    const selections = isCollection
      ? Object.entries(picks)
          .filter(([, x]) => x.qty > 0)
          .map(([productId, x]) => ({ productId, size: x.size, quantity: x.qty }))
      : undefined;

    setSubmitting(true);
    try {
      const res = await fetch("/api/landing/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          offerKey: offer.key,
          ...(isCollection ? { selections } : { sizes }),
          shippingZone: zone,
          name: values.name,
          phone: values.phone,
          email: values.email,
          street: values.street,
          city: values.city,
          note: values.note,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not place the order.");

      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
        return;
      }
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
          {form.successMessage && (
            <p className="text-[14px] text-[color:var(--lp-text)]/65 mt-2 leading-relaxed">{form.successMessage}</p>
          )}
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
          {/* ── Offers ─────────────────────────────────────────────────── */}
          {offers.length > 1 && (
            <div className="p-5 sm:p-6 border-b border-black/[0.06]">
              <p className={labelClass}>Choose your package</p>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {offers.map((o) => {
                  const active = o.key === offer.key;
                  return (
                    <button
                      type="button"
                      key={o.key}
                      onClick={() => setOfferKey(o.key)}
                      className="relative flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-colors"
                      style={{
                        borderColor: active ? "var(--lp-accent)" : "rgba(0,0,0,0.08)",
                        background: active ? "color-mix(in srgb, var(--lp-accent) 6%, white)" : "white",
                      }}
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
                          {o.kind === "collection" && <span className="font-normal text-[color:var(--lp-text)]/50">from </span>}
                          {formatPrice(o.price)}
                          {o.kind !== "collection" && o.savings > 0 && (
                            <span className="ml-1.5 text-[11px] font-normal text-[color:var(--lp-text)]/40 line-through">
                              {formatPrice(o.compareAtPrice)}
                            </span>
                          )}
                        </p>
                      </div>
                      {o.badge && (
                        <span className="absolute -top-2 right-3 text-[9px] uppercase tracking-wide font-bold px-2 py-0.5 rounded-full text-white" style={{ background: "var(--lp-accent)" }}>
                          {o.badge}
                        </span>
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

          {/* ── Item selection ─────────────────────────────────────────── */}
          {isCollection ? (
            <CollectionPicker offer={offer} picks={picks} totalQty={totalQty} onSize={setPickSize} onBump={bump} />
          ) : (
            <div className="p-5 sm:p-6 border-b border-black/[0.06] space-y-4">
              {(offer.items || []).map((line, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="relative w-12 h-14 rounded-lg overflow-hidden bg-black/5 flex-shrink-0">
                    {line.image && <Image src={line.image} alt="" fill className="object-cover" sizes="48px" unoptimized={shouldUnoptimizeImage(line.image)} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-[color:var(--lp-text)] truncate">
                      {line.name}
                      {line.quantity > 1 && <span className="text-[color:var(--lp-text)]/45"> × {line.quantity}</span>}
                    </p>
                    {line.pinnedSize ? (
                      <p className="text-[11px] text-[color:var(--lp-text)]/50 mt-0.5">Size {line.pinnedSize}</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {line.sizes.map((s) => {
                          const active = sizes[i] === s.size;
                          return (
                            <button
                              type="button"
                              key={s.size}
                              onClick={() => setSizes((prev) => ({ ...prev, [i]: s.size }))}
                              className="min-w-[38px] px-2.5 py-1 rounded-lg border text-[12px] font-medium transition-colors"
                              style={{
                                borderColor: active ? "var(--lp-accent)" : "rgba(0,0,0,0.12)",
                                background: active ? "var(--lp-accent)" : "white",
                                color: active ? "#fff" : "inherit",
                              }}
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

          {/* ── Delivery details ───────────────────────────────────────── */}
          <div className="p-5 sm:p-6 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="lp-name">Full name *</label>
                <input id="lp-name" className={fieldClass} autoComplete="name" required value={values.name} onChange={(e) => setValues({ ...values, name: e.target.value })} />
              </div>
              <div>
                <label className={labelClass} htmlFor="lp-phone">Mobile number *</label>
                <input id="lp-phone" className={fieldClass} inputMode="tel" autoComplete="tel" placeholder="01XXXXXXXXX" required value={values.phone} onChange={(e) => setValues({ ...values, phone: e.target.value })} />
              </div>
            </div>

            {form.askEmail && (
              <div>
                <label className={labelClass} htmlFor="lp-email">Email (optional)</label>
                <input id="lp-email" type="email" className={fieldClass} autoComplete="email" value={values.email} onChange={(e) => setValues({ ...values, email: e.target.value })} />
              </div>
            )}

            <div>
              <label className={labelClass} htmlFor="lp-street">Full delivery address *</label>
              <textarea id="lp-street" rows={2} className={`${fieldClass} resize-none`} autoComplete="street-address" required placeholder="House, road, area" value={values.street} onChange={(e) => setValues({ ...values, street: e.target.value })} />
            </div>

            <div className={shipping?.askZone ? "grid gap-4 sm:grid-cols-2" : ""}>
              <div>
                <label className={labelClass} htmlFor="lp-city">City / District *</label>
                <input id="lp-city" className={fieldClass} autoComplete="address-level2" required value={values.city} onChange={(e) => setValues({ ...values, city: e.target.value })} />
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
                          style={{
                            borderColor: active ? "var(--lp-accent)" : "rgba(0,0,0,0.12)",
                            background: active ? "color-mix(in srgb, var(--lp-accent) 8%, white)" : "white",
                            color: active ? "var(--lp-accent)" : "inherit",
                          }}
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
                <textarea id="lp-note" rows={2} className={`${fieldClass} resize-none`} value={values.note} onChange={(e) => setValues({ ...values, note: e.target.value })} />
              </div>
            )}
          </div>

          {/* ── Summary + submit ───────────────────────────────────────── */}
          <div className="px-5 sm:px-6 py-5 bg-black/[0.02] border-t border-black/[0.06] space-y-2">
            <div className="flex justify-between text-[13px] text-[color:var(--lp-text)]/70">
              <span>
                {offer.label}
                {isCollection && totalQty > 0 && <span className="text-[color:var(--lp-text)]/45"> · {totalQty} pcs</span>}
              </span>
              <span>{isCollection && !totals.priced ? "—" : formatPrice(totals.price)}</span>
            </div>
            {totals.savings > 0 && totals.priced && (
              <div className="flex justify-between text-[13px]" style={{ color: "var(--lp-accent)" }}>
                <span>You save</span>
                <span>−{formatPrice(totals.savings)}</span>
              </div>
            )}
            <div className="flex justify-between text-[13px] text-[color:var(--lp-text)]/70">
              <span>Delivery</span>
              <span>{totals.shippingFee === 0 ? "Free" : formatPrice(totals.shippingFee)}</span>
            </div>
            <div className="flex justify-between pt-2 mt-1 border-t border-black/[0.07] text-[15px] font-bold text-[color:var(--lp-text)]">
              <span>Total payable</span>
              <span>{isCollection && !totals.priced ? "—" : formatPrice(totals.total)}</span>
            </div>

            {error && <p className="text-[12px] text-red-600 bg-red-50 rounded-lg px-3 py-2 mt-2" role="alert">{error}</p>}

            <button
              type="submit"
              disabled={submitting || preview}
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

// The mix-and-match pool for a collection offer: a price-ladder strip, a running
// counter, and each product with a size selector + quantity stepper.
function CollectionPicker({ offer, picks, totalQty, onSize, onBump }) {
  const atMax = offer.maxQty && totalQty >= offer.maxQty;
  const activeTierQty = [...offer.tiers].reverse().find((t) => t.quantity <= totalQty)?.quantity ?? 0;

  return (
    <div className="border-b border-black/[0.06]">
      {/* Price ladder */}
      <div className="px-5 sm:px-6 pt-5">
        <p className={labelClass}>Pick any {offer.minQty === offer.maxQty ? offer.maxQty : `${offer.minQty}–${offer.maxQty}`} — price drops as you add</p>
        <div className="flex flex-wrap gap-1.5">
          {offer.tiers.map((t) => {
            const active = t.quantity === activeTierQty;
            return (
              <span
                key={t.quantity}
                className="px-2.5 py-1 rounded-lg text-[11.5px] font-medium border transition-colors"
                style={{
                  borderColor: active ? "var(--lp-accent)" : "rgba(0,0,0,0.1)",
                  background: active ? "color-mix(in srgb, var(--lp-accent) 10%, white)" : "white",
                  color: active ? "var(--lp-accent)" : "inherit",
                }}
              >
                {t.quantity} pcs · {formatPrice(t.price)}
              </span>
            );
          })}
        </div>
      </div>

      {/* Pool */}
      <div className="p-5 sm:p-6 space-y-3">
        {(offer.pool || []).map((p) => {
          const pk = picks[p.productId] || { size: "", qty: 0 };
          const canAdd = !atMax;
          return (
            <div key={p.productId} className="flex items-center gap-3">
              <div className="relative w-12 h-14 rounded-lg overflow-hidden bg-black/5 flex-shrink-0">
                {p.image && <Image src={p.image} alt="" fill className="object-cover" sizes="48px" unoptimized={shouldUnoptimizeImage(p.image)} />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-[color:var(--lp-text)] truncate">{p.name}</p>
                {p.pinnedSize ? (
                  <p className="text-[11px] text-[color:var(--lp-text)]/50 mt-0.5">Size {p.pinnedSize}</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {p.sizes.map((s) => {
                      const active = pk.size === s.size;
                      return (
                        <button
                          type="button"
                          key={s.size}
                          onClick={() => onSize(p.productId, s.size)}
                          className="min-w-[34px] px-2 py-0.5 rounded-md border text-[11px] font-medium transition-colors"
                          style={{
                            borderColor: active ? "var(--lp-accent)" : "rgba(0,0,0,0.12)",
                            background: active ? "var(--lp-accent)" : "white",
                            color: active ? "#fff" : "inherit",
                          }}
                        >
                          {s.size}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Quantity stepper */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => onBump(p.productId, -1)}
                  disabled={!pk.qty}
                  className="w-7 h-7 rounded-full border border-black/15 flex items-center justify-center text-[color:var(--lp-text)]/70 disabled:opacity-30"
                >
                  <Minus size={13} />
                </button>
                <span className="w-6 text-center text-[13px] font-semibold tabular-nums text-[color:var(--lp-text)]">{pk.qty || 0}</span>
                <button
                  type="button"
                  onClick={() => onBump(p.productId, 1)}
                  disabled={!canAdd}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-white disabled:opacity-30"
                  style={{ background: "var(--lp-accent)" }}
                >
                  <Plus size={13} />
                </button>
              </div>
            </div>
          );
        })}

        <p className="text-[12px] text-center pt-1" style={{ color: atMax ? "var(--lp-accent)" : "var(--lp-text)" }}>
          {totalQty === 0
            ? `Add ${offer.minQty} or more to see your price`
            : atMax
            ? `Maximum ${offer.maxQty} items selected`
            : `${totalQty} selected${totalQty < offer.minQty ? ` — add ${offer.minQty - totalQty} more` : ""}`}
        </p>
      </div>
    </div>
  );
}
