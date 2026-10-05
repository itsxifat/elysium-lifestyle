"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { useSession } from "next-auth/react";
import { useCart } from "@/context/CartContext";
import { useSettings } from "@/context/SettingsContext";
import { formatPrice, formatMoney, shouldUnoptimizeImage, PLACEHOLDER_IMAGE, normalizeBdPhone } from "@/lib/utils";
import Image from "next/image";
import toast from "react-hot-toast";
import Input from "@/components/ui/Input";
import Spinner from "@/components/ui/Spinner";
import AreaPicker from "@/components/checkout/AreaPicker";
import { track } from "@/lib/tracking/client";

// The checkout. Every figure on it is the brand ERP's quote for this cart,
// address and codes (POST /api/cart/quote); "Place order" sends that quote's
// figures as `expected`, and the ERP places the order only if nothing moved
// (otherwise 409 CART_REPRICED with the new figures, shown here to confirm).
// Each press carries its own idempotency key, reused if the press is retried
// after a dropped connection, so an order is never placed twice.

const ZONE_LABELS = { inside_dhaka: "Inside Dhaka", suburbs: "Dhaka suburbs", outside_dhaka: "Outside Dhaka" };

function newKey() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

const taka = (money) => Number(money?.taka || 0);
const localPhone = (value) => String(value || "").replace(/^\+?880/, "0");

export default function CheckoutPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const { items, subtotal, clearCart, syncWithServer, reconcile, mounted: cartMounted } = useCart();
  const { settings } = useSettings();

  // Validate the basket against the shop before the customer fills anything in.
  useEffect(() => {
    if (!cartMounted) return;
    syncWithServer().then(({ changed }) => {
      for (const c of changed) if (c.reason) toast(c.reason);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartMounted]);

  const gateways = settings?.paymentGateways || {};
  const paymentOptions = useMemo(
    () => [
      ...(gateways.cod?.enabled !== false ? [{ value: "cod", label: "Cash on Delivery", desc: "Pay when your order arrives" }] : []),
      ...(gateways.sslcommerz?.enabled ? [{ value: "sslcommerz", label: "Online Payment (bKash / Card)", desc: "Secure payment via SSLCommerz" }] : []),
    ],
    [gateways.cod?.enabled, gateways.sslcommerz?.enabled]
  );

  const [paymentMethod, setPaymentMethod] = useState("cod");
  const [area, setArea] = useState({ districtId: "", thanaId: "" });
  const [areaErrors, setAreaErrors] = useState({});
  const [placing, setPlacing] = useState(false);
  const [couponInput, setCouponInput] = useState("");
  const [appliedCodes, setAppliedCodes] = useState([]);
  const [quote, setQuote] = useState(null);
  const [quoting, setQuoting] = useState(false);
  const [repriced, setRepriced] = useState(false);
  const [saved, setSaved] = useState([]);
  const pressKey = useRef(null);

  useEffect(() => {
    if (paymentOptions.length && !paymentOptions.some((o) => o.value === paymentMethod)) {
      setPaymentMethod(paymentOptions[0].value);
    }
  }, [paymentOptions, paymentMethod]);

  // InitiateCheckout — fires once when the cart has hydrated with items.
  const icFired = useRef(false);
  useEffect(() => {
    if (icFired.current || !items.length) return;
    icFired.current = true;
    track.initiateCheckout({
      customData: {
        value: subtotal,
        currency: "BDT",
        content_type: "product",
        num_items: items.reduce((n, i) => n + i.quantity, 0),
        content_ids: items.map((i) => i.productId),
        contents: items.map((i) => ({ id: i.productId, quantity: i.quantity, item_price: i.price })),
      },
    });
  }, [items, subtotal]);

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    watch,
    formState: { errors },
  } = useForm({
    defaultValues: {
      name: session?.user?.name || "",
      email: session?.user?.email || "",
      phone: "",
      area: "",
      addressLine: "",
      notes: "",
    },
  });
  const phone = watch("phone");

  const fillAddress = useCallback(
    (a) => {
      setValue("name", a.name || "");
      setValue("phone", localPhone(a.phone));
      setValue("area", a.area || "");
      setValue("addressLine", a.addressLine || "");
      setArea({ districtId: a.districtId, thanaId: a.thanaId });
    },
    [setValue]
  );

  // A signed-in shopper's saved addresses fill the form in one click.
  useEffect(() => {
    if (!session?.user?.id) return;
    if (session.user.name) setValue("name", session.user.name);
    if (session.user.email) setValue("email", session.user.email);
    fetch("/api/account/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((profile) => {
        if (!profile) return;
        setSaved(profile.addresses || []);
        if (profile.phone) setValue("phone", localPhone(profile.phone));
        const preferred = (profile.addresses || []).find((a) => a.isDefault) || profile.addresses?.[0];
        if (preferred) fillAddress(preferred);
      })
      .catch(() => {});
  }, [session?.user?.id, session?.user?.name, session?.user?.email, setValue, fillAddress]);

  const lines = useMemo(() => items.map((i) => ({ skuId: i.skuId, qty: i.quantity })), [items]);
  const quotePhone = normalizeBdPhone(phone || "");
  const phoneForQuote = quotePhone.length === 11 ? quotePhone : undefined;

  // Ask the ERP for the figures whenever the cart, the address or the codes change.
  const requestQuote = useCallback(
    async (codes) => {
      if (!lines.length) return null;
      const res = await fetch("/api/cart/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines,
          address: area.districtId && area.thanaId ? area : undefined,
          codes,
          phone: phoneForQuote,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not price your bag");
      return data.quote;
    },
    [lines, area, phoneForQuote]
  );

  useEffect(() => {
    if (!lines.length) { setQuote(null); return; }
    let cancelled = false;
    setQuoting(true);
    const timer = setTimeout(() => {
      requestQuote(appliedCodes)
        .then((q) => { if (!cancelled) setQuote(q); })
        .catch(() => {})
        .finally(() => { if (!cancelled) setQuoting(false); });
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [requestQuote, appliedCodes, lines.length]);

  const applyCoupon = async () => {
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    if (appliedCodes.includes(code)) { setCouponInput(""); return; }
    const next = [...appliedCodes, code];
    try {
      const q = await requestQuote(next);
      const verdict = (q?.codes || []).find((c) => c.code === code);
      if (verdict?.applied) {
        setAppliedCodes(next);
        setQuote(q);
        setCouponInput("");
        toast.success("Coupon applied");
      } else {
        toast.error(`${code}: ${verdict?.reason ? verdict.reason.replace(/_/g, " ") : "not applicable"}`);
      }
    } catch {
      toast.error("Couldn't apply coupon");
    }
  };
  const removeCode = (code) => setAppliedCodes((a) => a.filter((c) => c !== code));

  const onSubmit = async (data) => {
    if (items.length === 0) { toast.error("Your cart is empty"); return; }
    if (!area.districtId || !area.thanaId) {
      setAreaErrors({ districtId: !area.districtId ? "Choose your district" : undefined, thanaId: !area.thanaId ? "Choose your thana" : undefined });
      toast.error("Please choose your district and thana");
      return;
    }
    setAreaErrors({});
    if (!quote || quoting) { toast("Updating your total — one moment…"); return; }
    if (!quote.deliverable) { toast.error("We don't deliver to that area yet. Please choose another address."); return; }
    if (quote.unavailable?.length) {
      await syncWithServer();
      toast.error("Some items changed in your bag. Please check it and try again.");
      return;
    }
    if (paymentMethod === "sslcommerz" && !data.email) {
      setError("email", { message: "Email is required for online payment (your receipt goes there)" });
      return;
    }

    setPlacing(true);
    // One key per press; a press retried after a dropped connection reuses it.
    if (!pressKey.current) pressKey.current = newKey();
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": pressKey.current },
        body: JSON.stringify({
          lines,
          contact: { name: data.name, phone: data.phone, email: data.email || undefined },
          address: { ...area, area: data.area || undefined, addressLine: data.addressLine },
          codes: appliedCodes,
          paymentMethod,
          notes: data.notes || undefined,
          locale: "en",
          expected: {
            totalPoisha: quote.total.poisha,
            lines: quote.lines.map((l) => ({ skuId: l.skuId, unitPricePoisha: l.unitPrice.poisha })),
          },
        }),
      });
      const result = await res.json().catch(() => ({}));
      // Only a definitive answer ends this press: placed (2xx) or refused (4xx).
      // A gateway timeout, a 5xx or "still being placed" may mean the order went
      // in, so the next press reuses the key and gets that same order back.
      const definitive = res.ok || (res.status >= 400 && res.status < 500 && result.code !== "IDEMPOTENCY_IN_FLIGHT");
      if (definitive) pressKey.current = null;

      if (!res.ok) {
        if (result.code === "CART_REPRICED" && result.quote) {
          setQuote(result.quote);
          setRepriced(true);
          reconcile(
            result.quote.lines.map((l) => ({
              skuId: l.skuId,
              status: "ok",
              price: taka(l.unitPrice),
              regularPrice: l.compareAt ? taka(l.compareAt) : null,
              available: l.availableQty,
            }))
          );
          toast.error("Prices in your bag changed. Please check the new total and press Place order again.");
        } else if (result.code === "OUT_OF_STOCK" && result.lines) {
          reconcile(
            result.lines.map((l) => ({
              skuId: l.skuId,
              status: l.availableQty > 0 ? "limited" : "gone",
              available: l.availableQty || 0,
            }))
          );
          toast.error(result.error);
        } else if (result.code === "ORDER_PHONE_INVALID") {
          setError("phone", { message: result.error });
        } else {
          toast.error(result.error || "Failed to place order");
        }
        return;
      }

      const order = result.order;
      if (order.payment?.required) {
        const payRes = await fetch("/api/payment/sslcommerz/init", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderNo: order.orderNo }),
        });
        const pay = await payRes.json().catch(() => ({}));
        clearCart();
        if (payRes.ok && pay.gatewayUrl) {
          window.location.href = pay.gatewayUrl;
        } else {
          toast.error(pay.error || "The payment page could not be opened. You can pay from your order page.");
          router.push(`/order-confirmation/${order.orderNo}`);
        }
        return;
      }
      clearCart();
      router.push(`/order-confirmation/${order.orderNo}`);
    } catch {
      // The connection dropped: the key is kept, so pressing again is safe.
      toast.error("Connection lost. Please press Place order again — you won't be charged twice.");
    } finally {
      setPlacing(false);
    }
  };

  if (cartMounted && items.length === 0) {
    return (
      <div className="container-custom py-20 text-center">
        <h1 className="text-2xl font-bold text-brand-brown mb-4">Your cart is empty</h1>
        <a href="/shop" className="btn-primary">Shop Now</a>
      </div>
    );
  }

  const itemsTotal = quote ? taka(quote.items) : subtotal;
  const discount = quote ? taka(quote.discount) : 0;
  const delivery = quote ? taka(quote.delivery) - taka(quote.deliveryDiscount) : 0;
  const shipping = settings?.shipping || {};
  const freeOver = shipping.freeShippingEnabled ? shipping.freeShippingThreshold : null;
  const totalLabel = quote ? formatMoney(quote.total) : formatPrice(subtotal);

  return (
    <div className="bg-brand-cream min-h-screen py-10">
      <div className="container-custom">
        <h1 className="section-title mb-8">Checkout</h1>
        <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 lg:grid-cols-5 gap-10" noValidate>
          {/* Left: Address + Payment */}
          <div className="lg:col-span-3 space-y-8">
            {/* Shipping Address */}
            <div className="bg-white border border-brand-tan/20 p-6">
              <h2 className="text-base font-semibold text-brand-brown uppercase tracking-wider mb-5">
                Shipping Information
              </h2>
              {saved.length > 0 && (
                <div className="mb-5">
                  <label htmlFor="saved-address" className="block text-sm font-medium text-brand-brown mb-1">Saved addresses</label>
                  <select
                    id="saved-address"
                    defaultValue=""
                    onChange={(e) => { const a = saved.find((s) => s.id === e.target.value); if (a) fillAddress(a); }}
                    className="w-full border border-brand-tan bg-white px-4 py-3 text-sm text-brand-brown focus:outline-none focus:border-brand-terracotta"
                  >
                    <option value="">Choose a saved address</option>
                    {saved.map((a) => (
                      <option key={a.id} value={a.id}>{a.label ? `${a.label} — ` : ""}{a.addressLine}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <Input
                    label="Full Name *"
                    {...register("name", { required: "Name is required" })}
                    error={errors.name?.message}
                    placeholder="Your full name"
                    autoComplete="name"
                  />
                </div>
                <Input
                  label="Phone Number *"
                  type="tel"
                  {...register("phone", {
                    required: "Phone is required",
                    validate: (v) => /^01[3-9]\d{8}$/.test(normalizeBdPhone(v)) || "Enter a Bangladeshi mobile number (01XXXXXXXXX)",
                  })}
                  error={errors.phone?.message}
                  placeholder="01700000000"
                  autoComplete="tel"
                />
                <Input
                  label={paymentMethod === "sslcommerz" ? "Email Address *" : "Email Address"}
                  type="email"
                  {...register("email")}
                  error={errors.email?.message}
                  placeholder="your@email.com"
                  autoComplete="email"
                />
                <div className="sm:col-span-2">
                  <AreaPicker value={area} onChange={(next) => { setArea(next); setAreaErrors({}); }} errors={areaErrors} idPrefix="checkout" />
                </div>
                <Input label="Area" {...register("area")} placeholder="Dhanmondi 27" />
                <Input
                  label="Street Address *"
                  {...register("addressLine", { required: "Address is required", minLength: { value: 3, message: "Address is required" } })}
                  error={errors.addressLine?.message}
                  placeholder="House, Road"
                  autoComplete="street-address"
                />
                <div className="sm:col-span-2">
                  <Input label="Order notes" {...register("notes")} placeholder="Anything the rider should know" />
                </div>
              </div>
            </div>

            {/* Delivery */}
            <div className="bg-white border border-brand-tan/20 p-6">
              <h2 className="text-base font-semibold text-brand-brown uppercase tracking-wider mb-1">Delivery</h2>
              {!area.thanaId ? (
                <p className="text-xs text-brand-tan">Choose your district and thana to see the delivery charge.</p>
              ) : quote && !quote.deliverable ? (
                <p className="text-sm text-red-600">We don&apos;t deliver to that area yet. Please choose another address.</p>
              ) : quote ? (
                <div className="flex items-center justify-between p-4 border border-brand-terracotta bg-brand-cream mt-3">
                  <div>
                    <p className="text-sm font-medium text-brand-brown">{ZONE_LABELS[quote.zone] || "Delivery"}</p>
                    <p className="text-xs text-brand-tan mt-0.5">Delivered to your door by courier</p>
                  </div>
                  <span className={`text-sm font-bold ${delivery === 0 ? "text-emerald-600" : "text-brand-brown"}`} data-testid="delivery-fee">
                    {delivery === 0 ? "Free" : formatPrice(delivery)}
                  </span>
                </div>
              ) : (
                <Spinner size="sm" className="mt-3" />
              )}
              {freeOver > 0 && itemsTotal < freeOver && (
                <p className="text-xs text-brand-tan/70 mt-3">
                  Add {formatPrice(freeOver - itemsTotal)} more to qualify for free shipping
                </p>
              )}
            </div>

            {/* Payment Method */}
            <div className="bg-white border border-brand-tan/20 p-6">
              <h2 className="text-base font-semibold text-brand-brown uppercase tracking-wider mb-5">Payment Method</h2>
              {paymentOptions.length === 0 ? (
                <p className="text-brand-tan text-sm">No payment methods available. Please contact us.</p>
              ) : (
                <div className="space-y-3">
                  {paymentOptions.map((opt) => (
                    <label
                      key={opt.value}
                      className={`flex items-start gap-4 p-4 border cursor-pointer transition-colors ${
                        paymentMethod === opt.value ? "border-brand-terracotta bg-brand-cream" : "border-brand-tan/30 hover:border-brand-tan"
                      }`}
                    >
                      <input
                        type="radio"
                        name="paymentMethod"
                        value={opt.value}
                        checked={paymentMethod === opt.value}
                        onChange={() => setPaymentMethod(opt.value)}
                        className="mt-0.5 accent-brand-terracotta"
                      />
                      <div>
                        <p className="text-sm font-medium text-brand-brown">{opt.label}</p>
                        <p className="text-xs text-brand-tan mt-0.5">{opt.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: Order summary */}
          <div className="lg:col-span-2">
            <div className="bg-white border border-brand-tan/20 p-6 sticky top-24">
              <h2 className="text-base font-semibold text-brand-brown uppercase tracking-wider mb-5">Your Order</h2>

              {repriced && (
                <div role="alert" className="mb-4 px-3 py-2 bg-amber-50 border border-amber-200 text-amber-800 text-[12px]">
                  Prices changed since you opened checkout. The total below is the new one.
                </div>
              )}

              {/* Items */}
              <div className="space-y-4 mb-6 max-h-64 overflow-y-auto pr-1">
                {items.map((item) => {
                  const line = quote?.lines?.find((l) => l.skuId === item.skuId);
                  const lineTotal = line ? taka(line.lineTotal) : item.price * item.quantity;
                  const shelf = line?.compareAt ? taka(line.compareAt) * item.quantity : item.regularPrice ? item.regularPrice * item.quantity : null;
                  return (
                    <div key={`${item.productId}-${item.size}`} className="flex gap-3">
                      <div className="relative w-14 flex-shrink-0 bg-brand-cream-dark overflow-hidden" style={{ height: 72 }}>
                        <Image
                          src={item.image || PLACEHOLDER_IMAGE}
                          alt={item.name}
                          fill
                          sizes="56px"
                          unoptimized={shouldUnoptimizeImage(item.image || PLACEHOLDER_IMAGE)}
                          className="object-cover"
                        />
                        <span className="absolute -top-1 -right-1 bg-brand-brown text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center">
                          {item.quantity}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-brand-brown line-clamp-2">{item.name}</p>
                        <p className="text-xs text-brand-tan">Size: {item.size}</p>
                        {item.sku && <p className="text-[10px] text-brand-tan/80">SKU: {item.sku}</p>}
                        <p className="text-xs font-semibold text-brand-brown mt-1">
                          {formatPrice(lineTotal)}
                          {shelf > lineTotal && (
                            <span className="ml-1.5 font-normal text-brand-tan line-through">{formatPrice(shelf)}</span>
                          )}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Coupon */}
              <div className="border-t border-brand-tan/20 pt-4">
                <div className="flex gap-2">
                  <input
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyCoupon(); } }}
                    placeholder="Coupon code"
                    aria-label="Coupon code"
                    className="flex-1 border border-brand-tan/30 rounded-lg px-3 py-2 text-sm uppercase text-brand-brown focus:outline-none focus:border-brand-brown"
                  />
                  <button
                    type="button"
                    onClick={applyCoupon}
                    disabled={!couponInput.trim()}
                    className="px-4 py-2 text-[12px] uppercase tracking-wider border border-brand-brown text-brand-brown hover:bg-brand-brown hover:text-white transition-colors disabled:opacity-40 rounded-lg"
                  >
                    Apply
                  </button>
                </div>
                {appliedCodes.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {appliedCodes.map((c) => (
                      <span key={c} className="inline-flex items-center gap-1 bg-brand-cream px-2 py-1 rounded text-[11px] text-brand-terracotta font-medium">
                        {c}
                        <button type="button" onClick={() => removeCode(c)} aria-label={`Remove ${c}`} className="hover:text-red-500">✕</button>
                      </span>
                    ))}
                  </div>
                )}
                {(quote?.discounts || []).filter((d) => d.automatic).map((d) => (
                  <p key={d.title} className="text-[11px] text-green-700 mt-2">{d.title} applied</p>
                ))}
              </div>

              {/* Totals: the ERP's quote */}
              <div className="border-t border-brand-tan/20 pt-4 mt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-brand-tan">Subtotal</span>
                  <span data-testid="quote-items">{formatPrice(itemsTotal)}</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-brand-tan">Discount</span>
                    <span className="text-green-600">− {formatPrice(discount)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-brand-tan">Shipping</span>
                  <span className={quote?.deliverable && delivery === 0 ? "text-green-600" : ""}>
                    {!quote?.deliverable ? "—" : delivery === 0 ? "Free" : formatPrice(delivery)}
                  </span>
                </div>
                <div className="border-t border-brand-tan/20 pt-2 flex justify-between font-bold text-base">
                  <span>Total</span>
                  <span className="text-brand-terracotta" data-testid="quote-total">{totalLabel}</span>
                </div>
              </div>

              <button
                type="submit"
                disabled={placing || quoting || !quote}
                className="w-full bg-brand-terracotta text-white py-4 uppercase text-sm font-bold tracking-widest hover:bg-brand-terracotta-dark disabled:bg-brand-tan disabled:cursor-not-allowed transition-colors mt-6 flex items-center justify-center gap-2"
              >
                {placing ? (
                  <>
                    <Spinner size="sm" />
                    Placing Order...
                  </>
                ) : (
                  `Place Order · ${totalLabel}`
                )}
              </button>
              <p className="text-xs text-brand-tan text-center mt-3">
                By placing your order you agree to our Terms & Privacy Policy
              </p>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
