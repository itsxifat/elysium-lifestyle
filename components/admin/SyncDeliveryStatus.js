"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  RefreshCw, Truck, X, ArrowRight, AlertTriangle, PackageSearch,
  History, KeyRound, Clock, User, ChevronRight, Download,
} from "lucide-react";
import { getEffectivePermissions, isElevated } from "@/lib/permissions";
import { orderStatusLabel, orderStatusTone } from "@/lib/order-status";
import { Button, Pill } from "./ui";

// "Sync delivery status" — asks Steadfast where every live consignment is and
// brings our order statuses in line, then reports what moved.
//
// Their vocabulary is not ours, so the report always shows both: the courier's
// own words for the parcel and the order status we derived from them.
//   in_review → processing  ·  pending → shipped  ·  delivered → delivered
//   partial_delivered → return requested (staff then itemise it)
//   cancelled → cancelled (and the stock comes back)
// It also reads their return-request list, which is the only way to notice a
// return raised AFTER a parcel was delivered.
//
// The run itself happens on the server and outlives the request that started it
// (see lib/courier-sync-runs), because a few hundred deliberately-spaced
// requests to Steadfast take minutes. So this polls the run while it is open,
// is safe to close (a notification announces the result), and keeps every past
// run in a history that can be opened and read back.

const POLL_MS = 1500;

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
  const tones = { brown: "text-brand-brown", green: "text-emerald-600", tan: "text-brand-tan", red: "text-red-600" };
  return (
    <div className="flex-1 min-w-[72px] rounded-lg bg-brand-cream/60 px-3 py-2.5 text-center">
      <p className={`text-xl font-semibold leading-none ${tones[tone]}`}>{value}</p>
      <p className="text-[10px] uppercase tracking-[1.2px] text-brand-tan mt-1.5">{label}</p>
    </div>
  );
}

// One status change, animated in. Staggered by index so a run's changes land as
// a sequence rather than all at once — which is what makes a replayed run
// readable instead of a wall of rows.
function ChangeRow({ change, index }) {
  return (
    <div
      className="px-3 py-2.5 flex items-center gap-2 flex-wrap animate-rise-in"
      style={{ animationDelay: `${Math.min(index, 12) * 45}ms` }}
    >
      <span className="font-medium text-[13px] text-brand-brown">{change.orderNumber}</span>
      <span className="flex items-center gap-1.5 ml-auto">
        <Pill tone={orderStatusTone(change.from)}>{orderStatusLabel(change.from)}</Pill>
        <ArrowRight size={12} className="text-brand-tan/60" />
        <Pill tone={orderStatusTone(change.to)}>{orderStatusLabel(change.to)}</Pill>
      </span>
      <p className="w-full text-[11px] text-brand-tan">
        Steadfast: {change.courierStatusLabel || change.courierStatus || "—"}
        {change.via === "return_request" ? " · return request" : ""}
        {change.autoPaid ? " · COD marked paid" : ""}
        {change.needsReturnEntry ? " · record the return" : ""}
        {change.reason ? ` · "${change.reason}"` : ""}
      </p>
    </div>
  );
}

const fmtTime = (d) =>
  d ? new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "";

function duration(run) {
  if (!run?.startedAt || !run?.finishedAt) return "";
  const ms = new Date(run.finishedAt) - new Date(run.startedAt);
  if (ms < 1000) return "under a second";
  const s = Math.round(ms / 1000);
  return s < 90 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

export default function SyncDeliveryStatus() {
  const router = useRouter();
  const { data: session } = useSession();

  // null (closed) | "run" | "history" | "detail"
  const [view, setView] = useState(null);
  const [run, setRun] = useState(null);
  const [runs, setRuns] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [starting, setStarting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const refreshed = useRef(false);

  const runId = run?._id;
  const watching = view === "run" && run?.state === "running";

  // Follow a run that is still working. The run lives on the server, so this is
  // a read loop rather than the work itself — closing the popup does not stop
  // it, and reopening a window later would pick it up just the same.
  useEffect(() => {
    if (!watching) return;
    let cancelled = false;
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/admin/orders/sync-courier?runId=${runId}`, { cache: "no-store" });
        const d = await res.json();
        if (!cancelled && d.run) setRun(d.run);
      } catch {
        /* a dropped poll is not a failed run — the next tick tries again */
      }
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [watching, runId]);

  // Pull the fresh statuses into the list behind the popup once a run lands, so
  // closing it reveals the updated rows rather than the ones just replaced.
  const justFinished = view === "run" && run?.state === "done" && (run?.totals?.updated || 0) > 0;
  useEffect(() => {
    if (justFinished && !refreshed.current) {
      refreshed.current = true;
      router.refresh();
    }
  }, [justFinished, router]);

  const start = async ({ includeSettled = false } = {}) => {
    setStarting(true);
    setErrorMsg("");
    setImportResult(null);
    refreshed.current = false;
    try {
      const res = await fetch("/api/admin/orders/sync-courier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ includeSettled }),
      });
      const d = await res.json();
      if (!res.ok) {
        setErrorMsg(d.error || "Steadfast could not be reached.");
        setRun(null);
      } else {
        setRun(d.run);
      }
      setView("run");
    } catch {
      setErrorMsg("Network error — the sync did not reach the server.");
      setRun(null);
      setView("run");
    } finally {
      setStarting(false);
    }
  };

  const openHistory = useCallback(async () => {
    setView("history");
    setRuns(null);
    setImportResult(null);
    try {
      const res = await fetch("/api/admin/orders/sync-courier", { cache: "no-store" });
      const d = await res.json();
      setRuns(d.runs || []);
    } catch {
      setRuns([]);
    }
  }, []);

  const openRun = async (id) => {
    setView("detail");
    setRun(null);
    try {
      const res = await fetch(`/api/admin/orders/sync-courier?runId=${id}`, { cache: "no-store" });
      const d = await res.json();
      setRun(d.run || null);
    } catch {
      setRun(null);
    }
  };

  // Rebuild the runs that happened before this history existed, out of the
  // audit trail they left on the orders themselves.
  const importHistory = async () => {
    setImporting(true);
    try {
      const res = await fetch("/api/admin/orders/sync-courier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "import-history" }),
      });
      const d = await res.json();
      setImportResult(res.ok ? d : { error: d.error || "Could not rebuild history" });
      if (res.ok) {
        const list = await fetch("/api/admin/orders/sync-courier", { cache: "no-store" }).then((r) => r.json());
        setRuns(list.runs || []);
      }
    } catch {
      setImportResult({ error: "Could not rebuild history" });
    } finally {
      setImporting(false);
    }
  };

  const close = () => {
    setView(null);
    setRun(null);
    setErrorMsg("");
    setImportResult(null);
  };

  const canSync = isElevated(session?.user?.role) || getEffectivePermissions(session?.user).includes("orders.manage");
  if (!canSync) return null;

  const pct = run?.progress?.total ? Math.min(100, Math.round((run.progress.done / run.progress.total) * 100)) : 0;
  const showReport = (view === "run" && !errorMsg && run && run.state !== "running") || (view === "detail" && run);

  return (
    <>
      <div className="flex items-center gap-1.5">
        <Button variant="outline" onClick={() => start()} disabled={starting || watching}>
          <RefreshCw size={14} className={starting || watching ? "animate-spin" : ""} />
          <span className="ml-1.5">{watching ? "Syncing…" : "Sync delivery status"}</span>
        </Button>
        <Button variant="ghost" onClick={openHistory} title="Sync history" aria-label="Sync history">
          <History size={15} />
        </Button>
      </div>

      {view && (
        <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm animate-fade-in" aria-hidden />
          <div className="relative min-h-full flex items-center justify-center p-4" onClick={close}>
            <div
              onClick={(e) => e.stopPropagation()}
              className="relative bg-white w-full max-w-lg rounded-2xl shadow-2xl animate-pop-in overflow-hidden my-6"
            >
              <button onClick={close} aria-label="Close" className="absolute top-3 right-3 z-10 text-brand-tan hover:text-brand-brown transition-colors">
                <X size={18} />
              </button>

              {/* ── A run in flight ─────────────────────────────────────── */}
              {view === "run" && !errorMsg && run?.state === "running" && (
                <div className="px-6 py-10 text-center">
                  <div className="relative mx-auto w-20 h-20">
                    <span className="absolute inset-0 rounded-full bg-brand-terracotta opacity-30 animate-ring-pulse" aria-hidden />
                    <div className="relative w-20 h-20 rounded-full bg-brand-terracotta/12 flex items-center justify-center">
                      <Truck size={30} className="text-brand-terracotta animate-pulse" strokeWidth={1.8} />
                    </div>
                  </div>
                  <p className="mt-5 font-semibold text-brand-brown">Asking Steadfast…</p>
                  <p className="text-[13px] text-brand-tan mt-1">
                    {run.progress?.total
                      ? `${run.progress.done} of ${run.progress.total} parcel${run.progress.total === 1 ? "" : "s"} checked`
                      : "Working out which parcels to check"}
                  </p>

                  {/* Requests are spaced out deliberately to stay inside
                      Steadfast's tolerance, so this is a slow bar by design. */}
                  <div className="mt-4 h-1.5 rounded-full bg-brand-cream-dark overflow-hidden">
                    <div className="h-full bg-brand-terracotta transition-[width] duration-500" style={{ width: `${pct}%` }} />
                  </div>

                  {run.changes?.length > 0 && (
                    <div className="mt-4 max-h-40 overflow-y-auto rounded-lg border border-brand-tan/15 divide-y divide-brand-tan/10 text-left">
                      {run.changes.map((c, i) => <ChangeRow key={`${c.orderNumber}-${i}`} change={c} index={i} />)}
                    </div>
                  )}

                  <p className="text-[11px] text-brand-tan mt-5">
                    Safe to close — it keeps running, and a notification lands when it finishes.
                  </p>
                  <div className="mt-3 flex justify-center gap-2">
                    <Button variant="outline" onClick={close}>Close</Button>
                  </div>
                </div>
              )}

              {/* ── Could not even start ───────────────────────────────── */}
              {view === "run" && errorMsg && (
                <div className="px-6 py-10 text-center">
                  <ResultMark ok={false} />
                  <p className="mt-5 text-lg font-semibold text-brand-brown animate-rise-in">Sync failed</p>
                  <p className="text-[13px] text-brand-tan mt-1.5 max-w-sm mx-auto animate-rise-in">{errorMsg}</p>
                  <div className="mt-6 flex justify-center gap-2 animate-rise-in">
                    <Button onClick={() => start()}><RefreshCw size={14} /><span className="ml-1.5">Try again</span></Button>
                    <Button variant="outline" onClick={close}>Close</Button>
                  </div>
                </div>
              )}

              {/* ── A finished run: the one just done, or one from history ── */}
              {showReport && (
                <RunReport run={run} onBack={view === "detail" ? openHistory : null} onRerun={start} onClose={close} />
              )}

              {view === "detail" && !run && <div className="px-6 py-14 text-center text-[13px] text-brand-tan">Loading…</div>}

              {/* ── History ─────────────────────────────────────────────── */}
              {view === "history" && (
                <>
                  <div className="px-6 pt-6 pb-4 border-b border-brand-tan/15">
                    <h2 className="font-semibold text-brand-brown flex items-center gap-2">
                      <History size={16} className="text-brand-terracotta" /> Sync history
                    </h2>
                    <p className="text-[12px] text-brand-tan mt-1">
                      Every delivery-status sync, who ran it and what it changed. Open one to see the exact changes.
                    </p>
                  </div>

                  <div className="max-h-[22rem] overflow-y-auto divide-y divide-brand-tan/10">
                    {runs === null && <p className="px-6 py-10 text-center text-[13px] text-brand-tan">Loading…</p>}
                    {runs?.length === 0 && (
                      <p className="px-6 py-10 text-center text-[13px] text-brand-tan">
                        No syncs recorded yet. If you ran some before this history existed, rebuild them below.
                      </p>
                    )}
                    {runs?.map((r, i) => (
                      <button
                        key={r._id}
                        onClick={() => openRun(r._id)}
                        className="w-full text-left px-6 py-3 hover:bg-brand-cream/50 transition-colors flex items-center gap-3 animate-rise-in"
                        style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[13px] font-medium text-brand-brown">{fmtTime(r.startedAt)}</span>
                            {r.state === "running" && <Pill tone="blue">running</Pill>}
                            {r.state === "failed" && <Pill tone="red">{r.authFailed ? "keys refused" : "failed"}</Pill>}
                            {r.state === "done" && r.totals?.updated > 0 && <Pill tone="green">{r.totals.updated} updated</Pill>}
                            {r.state === "done" && !r.totals?.updated && <Pill tone="gray">no change</Pill>}
                            {r.reconstructed && <Pill tone="brown">rebuilt</Pill>}
                          </div>
                          <p className="text-[11px] text-brand-tan mt-0.5 truncate">
                            {r.byName ? `${r.byName} · ` : ""}
                            {r.scope}
                            {r.totals?.checked ? ` · ${r.totals.checked} checked` : ""}
                            {r.totals?.failed ? ` · ${r.totals.failed} failed` : ""}
                          </p>
                        </div>
                        <ChevronRight size={15} className="text-brand-tan/50 flex-shrink-0" />
                      </button>
                    ))}
                  </div>

                  {importResult && (
                    <p className={`mx-6 mt-4 text-[12px] rounded-lg px-3 py-2 ${importResult.error ? "text-red-700 bg-red-50" : "text-emerald-700 bg-emerald-50"}`}>
                      {importResult.error
                        ? importResult.error
                        : importResult.inserted
                          ? `Rebuilt ${importResult.inserted} past sync${importResult.inserted === 1 ? "" : "s"} from the audit trail${importResult.skipped ? ` (${importResult.skipped} already recorded)` : ""}.`
                          : "Nothing new to rebuild — every past sync we can trace is already here."}
                    </p>
                  )}

                  <div className="mt-4 px-6 py-4 border-t border-brand-tan/15 bg-brand-cream/30 flex flex-wrap items-center gap-2">
                    <button
                      onClick={importHistory}
                      disabled={importing}
                      className="inline-flex items-center gap-1.5 text-[12px] font-medium text-brand-terracotta hover:text-brand-terracotta-dark transition-colors disabled:opacity-50"
                      title="Rebuild runs from before this history existed, using the audit trail on each order"
                    >
                      <Download size={13} />
                      {importing ? "Rebuilding…" : "Rebuild past syncs"}
                    </button>
                    <Button className="ml-auto" onClick={() => start()} disabled={starting}>
                      <RefreshCw size={14} /><span className="ml-1.5">Sync now</span>
                    </Button>
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

// The result of one run — shown the moment a sync lands, and again whenever
// somebody opens it from the history. The same component either way, so a
// replayed run reads exactly as the original did, animation and all.
function RunReport({ run, onBack, onRerun, onClose }) {
  const t = run.totals || {};
  const ok = run.state === "done" && !run.authFailed;
  const changed = t.updated || 0;

  return (
    <>
      <div className="px-6 pt-10 pb-5 text-center">
        <ResultMark ok={ok} />
        <p className="mt-5 text-lg font-semibold text-brand-brown animate-rise-in">
          {run.authFailed
            ? "Steadfast refused the API keys"
            : run.state === "failed"
              ? "Sync failed"
              : t.checked === 0
                ? "Nothing to sync"
                : changed > 0
                  ? `${changed} order${changed === 1 ? "" : "s"} updated`
                  : "Everything is up to date"}
        </p>
        <p className="text-[13px] text-brand-tan mt-1.5 max-w-sm mx-auto animate-rise-in">
          {run.authFailed || run.state === "failed"
            ? run.error || "The run stopped before it finished."
            : t.checked === 0
              ? run.includeSettled
                ? "No order has been sent to Steadfast yet."
                : "Every parcel sent to Steadfast has already been settled."
              : `Checked ${t.checked} parcel${t.checked === 1 ? "" : "s"} with Steadfast${
                  t.returnRequests ? `, plus ${t.returnRequests} open return request${t.returnRequests === 1 ? "" : "s"}` : ""
                }.`}
        </p>

        {/* Who ran it and when — the two things a history entry is read for. */}
        <p className="text-[11px] text-brand-tan mt-3 flex items-center justify-center gap-x-3 gap-y-1 flex-wrap">
          <span className="inline-flex items-center gap-1">
            <Clock size={10} /> {fmtTime(run.startedAt)}{duration(run) ? ` · ${duration(run)}` : ""}
          </span>
          <span className="inline-flex items-center gap-1">
            <User size={10} /> {run.byName || "unknown"}
          </span>
          <span>{run.scope}</span>
        </p>
      </div>

      {/* The credentials answer, with the way to fix it. */}
      {run.authFailed && (
        <div className="mx-6 mb-4 rounded-lg bg-red-50 border border-red-100 px-3 py-2.5">
          <p className="text-[12px] text-red-700 flex items-start gap-1.5">
            <KeyRound size={13} className="mt-0.5 shrink-0" />
            The run stopped at the first refusal instead of asking about every remaining parcel. Check the Api-Key and
            Secret-Key on the Courier page — its “Test connection” button checks them against Steadfast directly.
          </p>
          <Link href="/admin/steadfast" className="mt-1.5 inline-block text-[12px] font-medium text-red-700 underline">
            Open Courier settings
          </Link>
        </div>
      )}

      {t.checked > 0 && (
        <div className="px-6 flex gap-2 animate-rise-in">
          <StatTile label="Checked" value={t.checked} />
          <StatTile label="Updated" value={changed} tone={changed > 0 ? "green" : "tan"} />
          {!run.reconstructed && <StatTile label="Unchanged" value={t.unchanged || 0} tone="tan" />}
          {t.failed > 0 && <StatTile label="Failed" value={t.failed} tone="red" />}
        </div>
      )}

      {run.reconstructed && (
        <p className="mx-6 mt-3 text-[11px] text-brand-tan bg-brand-cream/60 rounded-lg px-3 py-2">
          Rebuilt from the audit trail on each order. The changes and failures below are exact; how many parcels this run
          checked and found unchanged was never recorded, so it is not shown.
        </p>
      )}

      {run.changes?.length > 0 && (
        <div className="px-6 mt-5">
          <p className="text-[10px] uppercase tracking-[1.5px] text-brand-tan font-semibold mb-2">Status changes</p>
          <div className="max-h-56 overflow-y-auto rounded-lg border border-brand-tan/15 divide-y divide-brand-tan/10">
            {run.changes.map((c, i) => <ChangeRow key={`${c.orderNumber}-${i}`} change={c} index={i} />)}
          </div>
        </div>
      )}

      {run.failures?.length > 0 && (
        <div className="px-6 mt-4">
          <p className="text-[10px] uppercase tracking-[1.5px] text-red-600 font-semibold mb-2 flex items-center gap-1">
            <AlertTriangle size={11} /> Could not be checked
          </p>
          <div className="max-h-32 overflow-y-auto rounded-lg bg-red-50 border border-red-100 divide-y divide-red-100">
            {run.failures.map((e, i) => (
              <p key={i} className="px-3 py-2 text-[12px] text-red-700">
                <span className="font-medium">{e.orderNumber}</span> — {e.error}
              </p>
            ))}
          </div>
        </div>
      )}

      {run.returnRequestError && (
        <p className="mx-6 mt-4 text-[12px] text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
          Delivery statuses synced, but Steadfast&apos;s return-request list could not be read ({run.returnRequestError}).
          A return raised after delivery may not show up yet.
        </p>
      )}

      {t.remaining > 0 && (
        <p className="mx-6 mt-4 text-[12px] text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
          {t.remaining} more parcel{t.remaining === 1 ? "" : "s"} still to check — press sync again to carry on.
        </p>
      )}

      <div className="mt-6 px-6 py-4 border-t border-brand-tan/15 bg-brand-cream/30 flex flex-wrap items-center gap-2">
        {onBack && (
          <button onClick={onBack} className="inline-flex items-center gap-1.5 text-[12px] font-medium text-brand-terracotta hover:underline">
            <History size={13} /> Back to history
          </button>
        )}
        {!onBack && !run.includeSettled && t.settledSkipped > 0 && (
          <button
            onClick={() => onRerun({ includeSettled: true })}
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-brand-terracotta hover:text-brand-terracotta-dark transition-colors"
          >
            <PackageSearch size={13} />
            Re-check {t.settledSkipped} settled parcel{t.settledSkipped === 1 ? "" : "s"} too
          </button>
        )}
        <Button className="ml-auto" onClick={onClose}>Done</Button>
      </div>
    </>
  );
}
