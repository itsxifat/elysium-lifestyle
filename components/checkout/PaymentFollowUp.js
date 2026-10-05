"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, Loader2 } from "lucide-react";
import toast from "react-hot-toast";

// An online (SSLCommerz) order that is not paid yet. Right after the gateway
// sends the shopper back, the ERP may still be checking the payment with
// SSLCommerz ("checking"): the page then re-reads the order every few seconds
// for a minute. An order still waiting for its payment can open the payment
// page again (the ERP reuses an open session). The order's state always comes
// from the ERP; nothing here marks anything paid.
export default function PaymentFollowUp({ orderNo, checking = false, canPay = false }) {
  const router = useRouter();
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    if (!checking) return;
    let rounds = 0;
    const id = setInterval(() => {
      rounds += 1;
      router.refresh();
      if (rounds >= 12) clearInterval(id);
    }, 5000);
    return () => clearInterval(id);
  }, [checking, router]);

  const pay = async () => {
    setPaying(true);
    try {
      const res = await fetch("/api/payment/sslcommerz/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderNo }),
      });
      const data = await res.json();
      if (res.ok && data.gatewayUrl) {
        window.location.href = data.gatewayUrl;
        return;
      }
      toast.error(data.error || "The payment page could not be opened. Please try again.");
    } catch {
      toast.error("The payment page could not be opened. Please try again.");
    }
    setPaying(false);
  };

  return (
    <div className="bg-white border border-brand-terracotta/30 p-5 mb-6 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
      <div className="flex items-start gap-3">
        {checking ? (
          <Loader2 size={18} className="text-brand-terracotta animate-spin mt-0.5" />
        ) : (
          <CreditCard size={18} className="text-brand-terracotta mt-0.5" />
        )}
        <div>
          <p className="text-sm font-semibold text-brand-brown">
            {checking ? "We are confirming your payment" : "Waiting for your online payment"}
          </p>
          <p className="text-[12px] text-brand-tan mt-0.5">
            {checking
              ? "This page updates by itself in a moment."
              : "An unpaid online order is cancelled after an hour and its items go back on sale."}
          </p>
        </div>
      </div>
      {canPay && !checking && (
        <button
          type="button"
          onClick={pay}
          disabled={paying}
          className="bg-brand-terracotta text-white px-6 py-3 text-[11px] uppercase tracking-[2px] font-bold hover:bg-brand-terracotta-dark disabled:opacity-60"
        >
          {paying ? "Opening…" : "Pay now"}
        </button>
      )}
    </div>
  );
}
