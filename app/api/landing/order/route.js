export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import LandingPage from "@/models/LandingPage";
import Order from "@/models/Order";
import Product from "@/models/Product";
import "@/models/User";
import { checkRateLimit } from "@/lib/rate-limit";
import { normalizeBdPhone } from "@/lib/utils";
import { priceOffer, priceCollection, priceAlacarte, landingShippingFee } from "@/lib/landing";
import { applyPromotions } from "@/lib/landing-promotions";
import { findOrCreateCustomer } from "@/lib/customer-link";
import { runFraudCheckForOrder } from "@/lib/fraud";
import { trackPurchaseFromOrder } from "@/lib/tracking/server";
import { notifyEvent } from "@/lib/notifications";
import { sendEmail, orderConfirmationTemplate } from "@/lib/email";

// The one-page landing checkout. Cash on delivery only: the order is created and
// confirmed in this single request, so the customer never leaves /lp/<code>.
//
// Everything that decides money is recomputed here from the database — the offer
// the customer names is looked up on the page, its lines are repriced against
// live Product.variants, and shipping comes from the page's own rules. The
// request body only chooses *which* offer, *which* sizes, and where to deliver.

const ZONES = ["inside_dhaka", "suburbs", "outside_dhaka"];
const str = (v, max = 300) => String(v ?? "").trim().slice(0, max);
const isEmail = (v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);

export async function POST(request) {
  // A landing page is a public, ad-linked URL — throttle order spam per IP.
  const limited = checkRateLimit(request, "landing-order", { limit: 8, windowMs: 10 * 60 * 1000 });
  if (limited) return limited;

  try {
    await connectDB();
    const body = await request.json().catch(() => ({}));

    const page = await LandingPage.findOne({ code: str(body.code, 40).toLowerCase() });
    if (!page || !page.isActive) {
      return NextResponse.json({ error: "This offer is no longer available." }, { status: 404 });
    }

    const offer = (page.offers || []).find((o) => o.key === str(body.offerKey, 40));
    if (!offer || offer.isActive === false) {
      return NextResponse.json({ error: "Please choose an available offer." }, { status: 400 });
    }

    // ── Customer details ─────────────────────────────────────────────────────
    const name = str(body.name, 120);
    const phone = normalizeBdPhone(str(body.phone, 30));
    const email = page.form?.askEmail ? str(body.email, 160).toLowerCase() : "";
    const street = str(body.street, 300);
    const city = str(body.city, 120);

    if (!name) return NextResponse.json({ error: "Please enter your name." }, { status: 400 });
    if (!/^01\d{9}$/.test(phone)) {
      return NextResponse.json({ error: "Enter a valid Bangladeshi mobile number." }, { status: 400 });
    }
    if (!street) return NextResponse.json({ error: "Please enter your full address." }, { status: 400 });
    if (!city) return NextResponse.json({ error: "Please enter your city or district." }, { status: 400 });
    if (email && !isEmail(email)) return NextResponse.json({ error: "That email doesn't look right." }, { status: 400 });

    const zone = ZONES.includes(body.shippingZone) ? body.shippingZone : "inside_dhaka";

    // ── Price the offer from the live catalog ────────────────────────────────
    // Fixed offer: sizeChoices maps a line index → the size chosen.
    // Collection offer: `selections` is the mix-and-match cart the customer built.
    // Either way the price is recomputed from the DB — the body only picks items.
    let priced;
    if (offer.kind === "collection" || offer.kind === "alacarte") {
      const selections = (Array.isArray(body.selections) ? body.selections : []).map((s) => ({
        productId: str(s.productId, 40),
        size: str(s.size, 40),
        quantity: Math.max(1, Number(s.quantity) || 1),
      }));
      priced = offer.kind === "alacarte"
        ? await priceAlacarte(offer, selections)
        : await priceCollection(offer, selections);
    } else {
      const sizeChoices = {};
      if (body.sizes && typeof body.sizes === "object") {
        for (const [k, v] of Object.entries(body.sizes)) sizeChoices[Number(k)] = str(v, 40);
      }
      priced = await priceOffer(offer, sizeChoices);
    }
    if (!priced.ok) return NextResponse.json({ error: priced.error }, { status: 400 });

    const { items, regularTotal, offerTotal } = priced;
    const orderQuantity = items.reduce((n, i) => n + i.quantity, 0);
    const baseShipping = await landingShippingFee(page, zone);

    // Page-wide promotions apply on top of the offer price (server is authority;
    // never trust a client-sent discount). goodsTotal = what they pay for goods.
    const promo = applyPromotions({
      goodsTotal: offerTotal,
      quantity: orderQuantity,
      shippingFee: baseShipping,
      promotions: page.promotions,
    });
    const promoDiscount = Math.min(promo.promoDiscount, offerTotal); // never below ৳0 goods
    const shippingFee = promo.shippingFee;

    // The offer-level saving and the promo saving are both recorded as discount,
    // so the order keeps honest product prices as its subtotal.
    const offerDiscount = regularTotal - offerTotal;
    const discount = offerDiscount + promoDiscount;
    const totalAmount = Math.max(0, offerTotal - promoDiscount + shippingFee);

    // ── Who is this? ─────────────────────────────────────────────────────────
    // A signed-in shopper is themselves; otherwise match on phone/email, and
    // fall back to a guest stub that will be claimed if they ever register.
    const session = await getServerSession(authOptions);
    let customerId = session?.user?.id || null;
    if (!customerId) {
      const { user } = await findOrCreateCustomer({ name, phone, email, source: "landing_page" });
      customerId = user._id;
    }

    const count = await Order.countDocuments();
    const orderNumber = `ELY-${new Date().getFullYear()}-${String(count + 1).padStart(5, "0")}`;

    const order = await Order.create({
      orderNumber,
      user: customerId,
      guestEmail: email || undefined,
      items,
      shippingAddress: { name, phone, email: email || undefined, street, city, country: "Bangladesh" },
      source: "landing_page",
      landingPage: {
        page: page._id,
        code: page.code,
        name: page.name,
        offerKey: offer.key,
        offerLabel: offer.label,
        offerPrice: offerTotal,
        regularPrice: regularTotal,
      },
      paymentMethod: "cod",
      paymentStatus: "pending",
      orderStatus: "pending",
      shippingZone: zone,
      subtotal: regularTotal,
      shippingFee,
      discount,
      appliedDiscounts: [
        offerDiscount > 0 && { code: `LP-${page.code}`, title: `Landing page offer — ${offer.label}`, type: "fixed", amount: offerDiscount },
        promoDiscount > 0 && { code: `LP-PROMO`, title: promo.promoLabel || "Promotion", type: "fixed", amount: promoDiscount },
        promo.freeShipping && { code: `LP-FREESHIP`, title: "Free delivery", type: "free_shipping", amount: 0, freeShipping: true },
      ].filter(Boolean),
      totalAmount,
      notes: page.form?.askNote ? str(body.note, 500) : "",
    });

    // COD: claim the stock now, exactly as the storefront checkout does.
    for (const item of items) {
      await Product.updateOne(
        { _id: item.product, "variants.size": item.size },
        { $inc: { "variants.$.stock": -item.quantity } }
      );
    }

    // Campaign stats for the admin list.
    LandingPage.updateOne({ _id: page._id }, { $inc: { orderCount: 1, revenue: totalAmount } }).catch(() => {});

    notifyEvent("order_new_landing", {
      severity: "info",
      title: `Landing page order ${orderNumber}`,
      body: `${name} ordered "${offer.label}" from ${page.name} (/lp/${page.code}) — ৳${totalAmount}, COD.`,
      link: `/admin/orders/${order._id}`,
      order: order._id,
    }).catch(() => {});

    if (email) {
      sendEmail({
        to: email,
        subject: `Order Confirmed — ${orderNumber}`,
        html: orderConfirmationTemplate(order.toObject()),
      }).catch(console.error);
    }

    // Courier fraud history on the phone; may auto-advance the order to
    // "processing" per the thresholds in Settings.
    runFraudCheckForOrder(order._id, phone).catch(() => {});

    // Server-side Purchase signal with the real customer IP/UA.
    trackPurchaseFromOrder(order, { request }).catch(() => {});

    return NextResponse.json(
      { orderId: order._id.toString(), orderNumber, totalAmount, redirectUrl: page.form?.redirectUrl || "" },
      { status: 201 }
    );
  } catch (err) {
    console.error("POST /api/landing/order error:", err);
    return NextResponse.json({ error: "Could not place the order. Please try again." }, { status: 500 });
  }
}
