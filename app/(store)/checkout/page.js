"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { useSession } from "next-auth/react";
import { useCart } from "@/context/CartContext";
import { useSettings } from "@/context/SettingsContext";
import { formatPrice, shouldUnoptimizeImage } from "@/lib/utils";
import Image from "next/image";
import toast from "react-hot-toast";
import Input from "@/components/ui/Input";
import Spinner from "@/components/ui/Spinner";
import { track } from "@/lib/tracking/client";

export default function CheckoutPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const { items, subtotal, clearCart, syncWithServer, mounted: cartMounted } = useCart();

  // Validate the basket against the shop before the customer fills anything in.
  useEffect(() => {
    if (!cartMounted) return;
    syncWithServer().then(({ changed }) => {
      for (const c of changed) if (c.reason) toast(c.reason);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartMounted]);
  const { settings } = useSettings();
  const [paymentMethod, setPaymentMethod] = useState("cod");
  const [shippingZone, setShippingZone] = useState("inside_dhaka");
  const [placing, setPlacing] = useState(false);
  const [couponInput, setCouponInput] = useState("");
  const [appliedCodes, setAppliedCodes] = useState([]);
  const [discountResult, setDiscountResult] = useState(null);
  const [applyingCoupon, setApplyingCoupon] = useState(false);

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
    formState: { errors },
  } = useForm({
    defaultValues: {
      name: session?.user?.name || "",
      email: session?.user?.email || "",
    },
  });

  const s = settings?.shipping || {};
  const zoneFees = {
    inside_dhaka: s.insideDhaka ?? 60,
    suburbs: s.suburbs ?? 100,
    outside_dhaka: s.outsideDhaka ?? 130,
  };
  const freeShippingEnabled = s.freeShippingEnabled ?? false;
  const freeThreshold = s.freeShippingThreshold ?? settings?.siteInfo?.freeShippingThreshold ?? 1500;
  const baseShipping = freeShippingEnabled || (freeThreshold > 0 && subtotal >= freeThreshold)
    ? 0
    : (zoneFees[shippingZone] ?? 60);
  const discountTotal = discountResult?.discountTotal || 0;
  const freeShip = !!discountResult?.freeShipping;
  const shipping = freeShip ? 0 : baseShipping;
  const total = Math.max(0, subtotal + shipping - discountTotal);

  // Re-evaluate automatic + applied-code discounts whenever the cart, zone, or
  // codes change. Prices/eligibility are computed server-side.
  useEffect(() => {
    if (items.length === 0) { setDiscountResult(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/discounts/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: items.map((i) => ({ productId: i.productId, size: i.size, quantity: i.quantity })),
            codes: appliedCodes,
            shippingFee: baseShipping,
          }),
        });
        const d = await res.json();
        if (!cancelled) setDiscountResult(d);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [items, appliedCodes, baseShipping]);

  const applyCoupon = async () => {
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    if (appliedCodes.includes(code)) { setCouponInput(""); return; }
    setApplyingCoupon(true);
    const next = [...appliedCodes, code];
    try {
      const res = await fetch("/api/discounts/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((i) => ({ productId: i.productId, size: i.size, quantity: i.quantity })),
          codes: next,
          shippingFee: baseShipping,
        }),
      });
      const d = await res.json();
      setDiscountResult(d);
      const wasRejected = (d.rejected || []).find((r) => r.code === code);
      const wasApplied = (d.applied || []).some((a) => a.code === code);
      if (wasApplied) { setAppliedCodes(next); setCouponInput(""); toast.success("Coupon applied"); }
      else toast.error(wasRejected ? `${code}: ${wasRejected.reason}` : "Coupon not applicable");
    } catch {
      toast.error("Couldn't apply coupon");
    } finally {
      setApplyingCoupon(false);
    }
  };
  const removeCode = (code) => setAppliedCodes((a) => a.filter((c) => c !== code));

  const shippingZoneOptions = [
    { value: "inside_dhaka", label: "Inside Dhaka", desc: "Gulshan, Dhanmondi, Mirpur, Uttara…", fee: zoneFees.inside_dhaka },
    { value: "suburbs", label: "Suburbs", desc: "Savar, Gazipur, Narayanganj…", fee: zoneFees.suburbs },
    { value: "outside_dhaka", label: "Outside Dhaka", desc: "Chittagong, Sylhet, Rajshahi…", fee: zoneFees.outside_dhaka },
  ];

  const enabledGateways = settings?.paymentGateways || {};
  const paymentOptions = [
    ...(enabledGateways.cod?.enabled ? [{ value: "cod", label: "Cash on Delivery", desc: "Pay when your order arrives" }] : []),
    ...(enabledGateways.sslcommerz?.enabled ? [{ value: "sslcommerz", label: "Online Payment (bKash / Card)", desc: "Secure payment via SSLCommerz" }] : []),
  ];

  const onSubmit = async (data) => {
    if (items.length === 0) {
      toast.error("Your cart is empty");
      return;
    }
    if (!paymentMethod) {
      toast.error("Please select a payment method");
      return;
    }

    setPlacing(true);
    try {
      const orderPayload = {
        items: items.map((i) => ({
          productId: i.productId,
          name: i.name,
          image: i.image,
          size: i.size,
          price: i.price,
          quantity: i.quantity,
        })),
        shippingAddress: {
          name: data.name,
          phone: data.phone,
          email: data.email,
          street: data.street,
          city: data.city,
          state: data.state || "",
          postalCode: data.postalCode || "",
        },
        guestEmail: !session ? data.email : undefined,
        shippingZone,
        paymentMethod,
        discountCodes: appliedCodes,
      };

      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderPayload),
      });
      const result = await res.json();

      if (!res.ok) {
        toast.error(result.error || "Failed to place order");
        // 409 means the shop moved under us — a size sold out mid-checkout, or
        // the cart was pointing at something that no longer exists. Re-sync so
        // the offending line is clamped or dropped and the next attempt can
        // actually succeed, instead of failing identically for ever.
        if (res.status === 409) await syncWithServer();
        return;
      }

      if (paymentMethod === "cod") {
        clearCart();
        router.push(`/order-confirmation/${result.orderId}`);
      } else if (paymentMethod === "sslcommerz") {
        const payRes = await fetch("/api/payment/sslcommerz/init", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: result.orderId }),
        });
        const payData = await payRes.json();
        if (payData.GatewayPageURL) {
          clearCart();
          window.location.href = payData.GatewayPageURL;
        } else {
          toast.error("Failed to initiate payment. Please try again.");
        }
      }
    } catch (err) {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setPlacing(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="container-custom py-20 text-center">
        <h1 className="text-2xl font-bold text-brand-brown mb-4">
          Your cart is empty
        </h1>
        <a href="/shop" className="btn-primary">
          Shop Now
        </a>
      </div>
    );
  }

  return (
    <div className="bg-brand-cream min-h-screen py-10">
      <div className="container-custom">
        <h1 className="section-title mb-8">Checkout</h1>
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="grid grid-cols-1 lg:grid-cols-5 gap-10"
        >
          {/* Left: Address + Payment */}
          <div className="lg:col-span-3 space-y-8">
            {/* Shipping Address */}
            <div className="bg-white border border-brand-tan/20 p-6">
              <h2 className="text-base font-semibold text-brand-brown uppercase tracking-wider mb-5">
                Shipping Information
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <Input
                    label="Full Name *"
                    {...register("name", { required: "Name is required" })}
                    error={errors.name?.message}
                    placeholder="Your full name"
                  />
                </div>
                <Input
                  label="Phone Number *"
                  type="tel"
                  {...register("phone", { required: "Phone is required" })}
                  error={errors.phone?.message}
                  placeholder="01700000000"
                />
                <Input
                  label="Email Address"
                  type="email"
                  {...register("email")}
                  placeholder="your@email.com"
                />
                <div className="sm:col-span-2">
                  <Input
                    label="Street Address *"
                    {...register("street", { required: "Address is required" })}
                    error={errors.street?.message}
                    placeholder="House, Road, Area"
                  />
                </div>
                <Input
                  label="City / Upazila *"
                  {...register("city", { required: "City is required" })}
                  error={errors.city?.message}
                  placeholder="Dhaka"
                />
                <Input
                  label="District"
                  {...register("state")}
                  placeholder="Dhaka"
                />
                <Input
                  label="Postal Code"
                  {...register("postalCode")}
                  placeholder="1212"
                />
              </div>
            </div>

            {/* Delivery Zone */}
            <div className="bg-white border border-brand-tan/20 p-6">
              <h2 className="text-base font-semibold text-brand-brown uppercase tracking-wider mb-1">
                Delivery Zone
              </h2>
              <p className="text-xs text-brand-tan mb-5">Select the area you&apos;re delivering to</p>
              <div className="space-y-3">
                {shippingZoneOptions.map((opt) => {
                  const effectiveFee = freeShippingEnabled || (freeThreshold > 0 && subtotal >= freeThreshold)
                    ? 0
                    : opt.fee;
                  const isFree = effectiveFee === 0;
                  return (
                    <label
                      key={opt.value}
                      className={`flex items-center justify-between p-4 border cursor-pointer transition-colors ${
                        shippingZone === opt.value
                          ? "border-brand-terracotta bg-brand-cream"
                          : "border-brand-tan/30 hover:border-brand-tan"
                      }`}
                    >
                      <div className="flex items-start gap-4">
                        <input
                          type="radio"
                          value={opt.value}
                          checked={shippingZone === opt.value}
                          onChange={() => setShippingZone(opt.value)}
                          className="mt-0.5 accent-brand-terracotta"
                        />
                        <div>
                          <p className="text-sm font-medium text-brand-brown">{opt.label}</p>
                          <p className="text-xs text-brand-tan mt-0.5">{opt.desc}</p>
                        </div>
                      </div>
                      <span className={`text-sm font-bold flex-shrink-0 ml-4 ${isFree ? "text-emerald-600" : "text-brand-brown"}`}>
                        {isFree ? "Free" : `Tk ${opt.fee}`}
                      </span>
                    </label>
                  );
                })}
              </div>
              {!freeShippingEnabled && freeThreshold > 0 && subtotal < freeThreshold && (
                <p className="text-xs text-brand-tan/70 mt-3">
                  Add Tk {(freeThreshold - subtotal).toLocaleString()} more to qualify for free shipping
                </p>
              )}
            </div>

            {/* Payment Method */}
            <div className="bg-white border border-brand-tan/20 p-6">
              <h2 className="text-base font-semibold text-brand-brown uppercase tracking-wider mb-5">
                Payment Method
              </h2>
              {paymentOptions.length === 0 ? (
                <p className="text-brand-tan text-sm">
                  No payment methods available. Please contact us.
                </p>
              ) : (
                <div className="space-y-3">
                  {paymentOptions.map((opt) => (
                    <label
                      key={opt.value}
                      className={`flex items-start gap-4 p-4 border cursor-pointer transition-colors ${
                        paymentMethod === opt.value
                          ? "border-brand-terracotta bg-brand-cream"
                          : "border-brand-tan/30 hover:border-brand-tan"
                      }`}
                    >
                      <input
                        type="radio"
                        value={opt.value}
                        checked={paymentMethod === opt.value}
                        onChange={() => setPaymentMethod(opt.value)}
                        className="mt-0.5 accent-brand-terracotta"
                      />
                      <div>
                        <p className="text-sm font-medium text-brand-brown">
                          {opt.label}
                        </p>
                        <p className="text-xs text-brand-tan mt-0.5">
                          {opt.desc}
                        </p>
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
              <h2 className="text-base font-semibold text-brand-brown uppercase tracking-wider mb-5">
                Your Order
              </h2>

              {/* Items */}
              <div className="space-y-4 mb-6 max-h-64 overflow-y-auto pr-1">
                {items.map((item) => (
                  <div
                    key={`${item.productId}-${item.size}`}
                    className="flex gap-3"
                  >
                    <div className="relative w-14 h-18 flex-shrink-0 bg-brand-cream-dark overflow-hidden">
                      <Image
                        src={item.image || "/placeholder.jpg"}
                        alt={item.name}
                        fill
                        unoptimized={shouldUnoptimizeImage(item.image)}
                        className="object-cover"
                      />
                      <span className="absolute -top-1 -right-1 bg-brand-brown text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center">
                        {item.quantity}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-brand-brown line-clamp-2">
                        {item.name}
                      </p>
                      <p className="text-xs text-brand-tan">Size: {item.size}</p>
                      {item.sku && <p className="text-[10px] text-brand-tan/80">SKU: {item.sku}</p>}
                      <p className="text-xs font-semibold text-brand-brown mt-1">
                        {formatPrice(item.price * item.quantity)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Coupon */}
              <div className="border-t border-brand-tan/20 pt-4">
                <div className="flex gap-2">
                  <input
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyCoupon(); } }}
                    placeholder="Coupon code"
                    className="flex-1 border border-brand-tan/30 rounded-lg px-3 py-2 text-sm uppercase text-brand-brown focus:outline-none focus:border-brand-brown"
                  />
                  <button
                    type="button"
                    onClick={applyCoupon}
                    disabled={applyingCoupon || !couponInput.trim()}
                    className="px-4 py-2 text-[12px] uppercase tracking-wider border border-brand-brown text-brand-brown hover:bg-brand-brown hover:text-white transition-colors disabled:opacity-40 rounded-lg"
                  >
                    {applyingCoupon ? "…" : "Apply"}
                  </button>
                </div>
                {appliedCodes.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {appliedCodes.map((c) => (
                      <span key={c} className="inline-flex items-center gap-1 bg-brand-cream px-2 py-1 rounded text-[11px] text-brand-terracotta font-medium">
                        {c}
                        <button type="button" onClick={() => removeCode(c)} className="hover:text-red-500">✕</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Totals */}
              <div className="border-t border-brand-tan/20 pt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-brand-tan">Subtotal</span>
                  <span>{formatPrice(subtotal)}</span>
                </div>
                {discountTotal > 0 && (
                  <div className="flex justify-between">
                    <span className="text-brand-tan">Discount</span>
                    <span className="text-green-600">− {formatPrice(discountTotal)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-brand-tan">Shipping{freeShip ? " (coupon)" : ""}</span>
                  <span className={shipping === 0 ? "text-green-600" : ""}>
                    {shipping === 0 ? "Free" : formatPrice(shipping)}
                  </span>
                </div>
                <div className="border-t border-brand-tan/20 pt-2 flex justify-between font-bold text-base">
                  <span>Total</span>
                  <span className="text-brand-terracotta">
                    {formatPrice(total)}
                  </span>
                </div>
              </div>

              <button
                type="submit"
                disabled={placing}
                className="w-full bg-brand-terracotta text-white py-4 uppercase text-sm font-bold tracking-widest hover:bg-brand-terracotta-dark disabled:bg-brand-tan disabled:cursor-not-allowed transition-colors mt-6 flex items-center justify-center gap-2"
              >
                {placing ? (
                  <>
                    <Spinner size="sm" />
                    Placing Order...
                  </>
                ) : (
                  `Place Order · ${formatPrice(total)}`
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
