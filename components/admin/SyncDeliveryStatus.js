"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { RefreshCw, Truck, X, ArrowRight, AlertTriangle, PackageSearch } from "lucide-react";
import { getEffectivePermissions, isElevated } from "@/lib/permissions";
import { Button, Pill } from "./ui";

// "Sync delivery status" — asks Steadfast where every live consignment is and
// brings our order statuses in line, then reports what moved.
//
// Their vocabulary is not ours, so the report always shows both: the courier's
// own words for the parcel and the order status we derived from them.
//   in_review → processing  ·  pending → shipped  ·  delivered → delivered
//   partial_delivered → delivered (+ a return for staff to itemise)
//   cancelled → cancelled (and the stock comes back)

const STATUS_TONE = {
  pending: "amber",
  processing: "blue",
  shipped: "blue",
  delivered: "green",
  cancelled: "red",
};

// A tick / cross that draws itself. The dash length matches the path so the
// `draw-check` keyframes can run the stroke on from nothing.
function ResultMark({ ok }) {
  const ring = ok ? "bg-emerald-500" : "bg-red-500";
  const soft = ok ? "bg-emerald-100" : "bg-red-100";
  const stroke = ok ? "#059669" : "#DC2626";
  return (
    <div className={`relative mx-auto w-20 h-20 ${ok ? "" : "animate-shake"}`}>
      {/* one expanding halo, so the moment of arrival reads even on a glance */}
      <span className={`absolute inset-0 rounded-full ${ring} opacity-40 animate-ring-pulse`} aria-hidden />
      <div className={`relative w-20 h-20 rounded-full ${soft} flex items-center justify-center`}>
        <svg viewBox="0 0 52 52" className="w-11 h-11" fill="none" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round">
          {ok ? (
            <path d="M14 27.5 L22.5 36 L38 17" stroke={stroke} strokeDasharray="100" className="animate-draw-check" />
          ) : (
            <>
              <path d="M17 17 L35 35" stroke={stroke} strokeDasharray="100" className="animate-draw-cross" />
              <path d="M35 17 L17 35" stroke={stroke} strokeDasharray="100" className="animate-draw-cross" />
            </>
          )}
        </svg>
      </div>
    </div>
  );
}

function StatTile({ label, value, tone = "brown" }) {
  const tones = {
    brown: "text-brand-brown",
    green: "text-emerald-600",
    tan: "text-brand-tan",
    red: "text-red-600",
  };
  return (
    <div className="flex-1 min-w-[72px] rounded-lg bg-brand-cream/60 px-3 py-2.5 text-center">
      <p className={`text-xl font-semibold leading-none ${tones[tone]}`}>{value}</p>
      <p className="text-[10px] uppercase tracking-[1.2px] text-brand-tan mt-1.5">{label}</p>
    </div>
  );
}

export default function SyncDeliveryStatus() {
  const router = useRouter();
  const { data: session } = useSession();
  // idle → loading → done | failed
  const [phase, setPhase] = useState("idle");
  const [report, setReport] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  const run = async ({ includeSettled = false } = {}) => {
    setPhase("loading");
    setReport(null);
    setErrorMsg("");
    try {
      const res = await fetch("/api/admin/orders/sync-courier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ includeSettled }),
      });
      const d = await res.json();
      if (!res.ok) {
        setErrorMsg(d.error || "Steadfast could not be reached.");
        setPhase("failed");
        return;
      }
      setReport(d);
      setPhase("done");
      // Pull the fresh statuses into the list behind the popup, so closing it
      // reveals the updated rows rather than the ones we just replaced.
      if (d.updated > 0) router.refresh();
    } catch {
      setErrorMsg("Network error — the sync did not reach the server.");
      setPhase("failed");
    }
  };

  const close = () => {
    setPhase("idle");
    setReport(null);
    setErrorMsg("");
  };

  const open = phase !== "idle";

  // A sync MOVES orders, hands stock back and can mark COD payments paid, so
  // the route behind it requires orders.manage. Hidden rather than shown-and-
  // refused for anyone who only has read access to the orders list.
  const canSync = isElevated(session?.user?.role) || getEffectivePermissions(session?.user).includes("orders.manage");
  if (!canSync) return null;

  return (
    <>
      <Button variant="outline" onClick={() => run()} disabled={phase === "loading"}>
        <RefreshCw size={14} className={phase === "loading" ? "animate-spin" : ""} />
        <span className="ml-1.5">{phase === "loading" ? "Syncing…" : "Sync delivery status"}</span>
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm animate-fade-in" aria-hidden />
          <div className="relative min-h-full flex items-center justify-center p-4" onClick={phase === "loading" ? undefined : close}>
            <div
              onClick={(e) => e.stopPropagation()}
              className="relative bg-white w-full max-w-lg rounded-2xl shadow-2xl animate-pop-in overflow-hidden"
            >
              {phase !== "loading" && (
                <button
                  onClick={close}
                  aria-label="Close"
                  className="absolute top-3 right-3 text-brand-tan hover:text-brand-brown transition-colors"
                >
                  <X size={18} />
                </button>
              )}

              {/* ── Checking ─────────────────────────────────────────────── */}
              {phase === "loading" && (
                <div className="px-6 py-12 text-center">
                  <div className="relative mx-auto w-20 h-20">
                    <span className="absolute inset-0 rounded-full bg-brand-terracotta opacity-30 animate-ring-pulse" aria-hidden />
                    <div className="relative w-20 h-20 rounded-full bg-brand-terracotta/12 flex items-center justify-center">
                      <Truck size={30} className="text-brand-terracotta animate-pulse" strokeWidth={1.8} />
                    </div>
                  </div>
                  <p className="mt-5 font-semibold text-brand-brown">Asking Steadfast…</p>
                  <p className="text-[13px] text-brand-tan mt-1">
                    Checking every consignment we sent them. This can take a moment.
                  </p>
                </div>
              )}

              {/* ── Failed ───────────────────────────────────────────────── */}
              {phase === "failed" && (
                <div className="px-6 py-10 text-center">
                  <ResultMark ok={false} />
                  <p className="mt-5 text-lg font-semibold text-brand-brown animate-rise-in">Sync failed</p>
                  <p className="text-[13px] text-brand-tan mt-1.5 max-w-sm mx-auto animate-rise-in">{errorMsg}</p>
                  <div className="mt-6 flex justify-center gap-2 animate-rise-in">
                    <Button onClick={() => run()}>
                      <RefreshCw size={14} />
                      <span className="ml-1.5">Try again</span>
                    </Button>
                    <Button variant="outline" onClick={close}>Close</Button>
                  </div>
                </div>
              )}

              {/* ── Done ─────────────────────────────────────────────────── */}
              {phase === "done" && report && (
                <>
                  <div className="px-6 pt-10 pb-5 text-center">
                    <ResultMark ok />
                    <p className="mt-5 text-lg font-semibold text-brand-brown animate-rise-in">
                      {report.checked === 0
                        ? "Nothing to sync"
                        : report.updated > 0
                          ? `${report.updated} order${report.updated === 1 ? "" : "s"} updated`
                          : "Everything is up to date"}
                    </p>
                    <p className="text-[13px] text-brand-tan mt-1.5 max-w-sm mx-auto animate-rise-in">
                      {report.checked === 0
                        ? report.includeSettled
                          ? "No order has been sent to Steadfast yet."
                          : "Every parcel sent to Steadfast has already been settled."
                        : `Checked ${report.checked} parcel${report.checked === 1 ? "" : "s"} with Steadfast.`}
                    </p>
                  </div>

                  {report.checked > 0 && (
                    <div className="px-6 flex gap-2 animate-rise-in">
                      <StatTile label="Checked" value={report.checked} />
                      <StatTile label="Updated" value={report.updated} tone={report.updated > 0 ? "green" : "tan"} />
                      <StatTile label="Unchanged" value={report.unchanged} tone="tan" />
                      {report.failed > 0 && <StatTile label="Failed" value={report.failed} tone="red" />}
                    </div>
                  )}

                  {/* What actually moved — the point of the whole exercise */}
                  {report.changes?.length > 0 && (
                    <div className="px-6 mt-5">
                      <p className="text-[10px] uppercase tracking-[1.5px] text-brand-tan font-semibold mb-2">
                        Status changes
                      </p>
                      <div className="max-h-56 overflow-y-auto rounded-lg border border-brand-tan/15 divide-y divide-brand-tan/10">
                        {report.changes.map((c) => (
                          <div key={c.orderId} className="px-3 py-2.5 flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-[13px] text-brand-brown">{c.orderNumber}</span>
                            <span className="flex items-center gap-1.5 ml-auto">
                              <Pill tone={STATUS_TONE[c.from] || "gray"}>{c.from}</Pill>
                              <ArrowRight size={12} className="text-brand-tan/60" />
                              <Pill tone={STATUS_TONE[c.to] || "gray"}>{c.to}</Pill>
                            </span>
                            <p className="w-full text-[11px] text-brand-tan">
                              Steadfast: {c.courierStatusLabel}
                              {c.autoPaid ? " · COD marked paid" : ""}
                              {c.needsReturnEntry ? " · record the return" : ""}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {report.errors?.length > 0 && (
                    <div className="px-6 mt-4">
                      <p className="text-[10px] uppercase tracking-[1.5px] text-red-600 font-semibold mb-2 flex items-center gap-1">
                        <AlertTriangle size={11} /> Could not be checked
                      </p>
                      <div className="max-h-32 overflow-y-auto rounded-lg bg-red-50 border border-red-100 divide-y divide-red-100">
                        {report.errors.map((e) => (
                          <p key={e.orderId} className="px-3 py-2 text-[12px] text-red-700">
                            <span className="font-medium">{e.orderNumber}</span> — {e.error}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}

                  {report.remaining > 0 && (
                    <p className="mx-6 mt-4 text-[12px] text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                      {report.remaining} more parcel{report.remaining === 1 ? "" : "s"} still to check — press sync
                      again to carry on.
                    </p>
                  )}

                  <div className="mt-6 px-6 py-4 border-t border-brand-tan/15 bg-brand-cream/30 flex flex-wrap items-center gap-2">
                    {!report.includeSettled && report.settledSkipped > 0 && (
                      <button
                        onClick={() => run({ includeSettled: true })}
                        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-brand-terracotta hover:text-brand-terracotta-dark transition-colors"
                      >
                        <PackageSearch size={13} />
                        Re-check {report.settledSkipped} settled parcel{report.settledSkipped === 1 ? "" : "s"} too
                      </button>
                    )}
                    <Button className="ml-auto" onClick={close}>Done</Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
