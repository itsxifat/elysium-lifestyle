"use client";

import { useEffect, useState } from "react";
import { X, Merge, ShieldAlert, Search, CheckCircle2 } from "lucide-react";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";
import { Button, Pill, EmptyState } from "@/components/admin/ui";
import { Modal, Avatar, taka, shortDate, timeAgo } from "./shared";

// Find records that are really one person, and fold them together.
//
// The merge is deliberately explicit: the admin picks which record SURVIVES,
// because that choice decides which name, phone and email the customer keeps.
// Orders always move — nothing is ever deleted out from under a sale.

const REASON_LABEL = {
  phone: "Same phone number",
  email: "Same email address",
  "name+address": "Same name and delivery address",
};

// Exported so the main page can offer the same merge flow for rows an admin
// hand-picked, rather than ones the scanner proposed.
export function MergeGroup({ group, onMerged }) {
  const [keepId, setKeepId] = useState(() => {
    // Default to the record worth keeping: the one with the most orders, then
    // the more complete one (an email is what lets them claim the account
    // later), then the oldest — which is the customer's true "since" date.
    const sorted = [...group.users].sort(
      (a, b) =>
        b.orderCount - a.orderCount ||
        Number(!!b.email) - Number(!!a.email) ||
        new Date(a.createdAt) - new Date(b.createdAt)
    );
    return sorted[0]?._id;
  });
  const [merging, setMerging] = useState(false);
  const [done, setDone] = useState(null);

  const merge = async () => {
    const sourceIds = group.users.filter((u) => u._id !== keepId).map((u) => u._id);
    if (!sourceIds.length) return;
    setMerging(true);
    try {
      const res = await fetch("/api/admin/users/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId: keepId, sourceIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Merge failed");
      setDone(data);
      toast.success(`Merged — ${data.ordersMoved} order${data.ordersMoved === 1 ? "" : "s"} moved`);
      onMerged?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setMerging(false);
    }
  };

  if (done) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3.5 flex items-center gap-2.5">
        <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0" />
        <p className="text-[13px] text-emerald-800">
          Merged into one record — {done.ordersMoved} order{done.ordersMoved === 1 ? "" : "s"} moved,{" "}
          {done.recordsDeleted} duplicate{done.recordsDeleted === 1 ? "" : "s"} removed.
          {done.skipped?.length > 0 && (
            <span className="block mt-1 text-emerald-700">
              {done.skipped.length} kept separate (can sign in).
            </span>
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-brand-tan/20 bg-white overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 bg-brand-cream/50 border-b border-brand-tan/15">
        <div className="flex items-center gap-2 min-w-0">
          <Pill tone={group.confidence === "certain" ? "red" : "amber"}>{group.confidence}</Pill>
          <span className="text-[12px] text-brand-brown font-medium truncate">
            {REASON_LABEL[group.reason] || group.reason}
          </span>
          <span className="text-[11px] text-brand-tan truncate hidden sm:inline">· {group.key}</span>
        </div>
        <Button size="sm" onClick={merge} disabled={merging} className="flex-shrink-0">
          <Merge size={13} />
          {merging ? "Merging…" : "Merge"}
        </Button>
      </div>

      <div className="divide-y divide-brand-tan/10">
        {group.users.map((u) => {
          const keep = u._id === keepId;
          return (
            <button
              key={u._id}
              type="button"
              onClick={() => setKeepId(u._id)}
              className={cn(
                "w-full flex items-center gap-3 p-3 text-left transition-colors",
                keep ? "bg-brand-terracotta/5" : "hover:bg-brand-cream/40"
              )}
            >
              <span
                className={cn(
                  "w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0",
                  keep ? "border-brand-terracotta" : "border-brand-tan/40"
                )}
              >
                {keep && <span className="w-2 h-2 rounded-full bg-brand-terracotta" />}
              </span>
              <Avatar user={u} size="xs" />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-brand-brown truncate">{u.name}</p>
                <p className="text-[11px] text-brand-tan truncate">
                  {[u.phone, u.email].filter(Boolean).join(" · ") || "no contact"}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-[12px] text-brand-brown tabular-nums">
                  {u.orderCount} order{u.orderCount === 1 ? "" : "s"}
                </p>
                <p className="text-[11px] text-brand-tan tabular-nums">
                  {taka(u.totalSpent)} · {u.lastOrderAt ? timeAgo(u.lastOrderAt) : shortDate(u.createdAt)}
                </p>
              </div>
              {keep && <Pill tone="terracotta">Keep</Pill>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function DuplicatesModal({ open, onClose, onMerged }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    fetch("/api/admin/users/duplicates")
      .then((r) => r.json())
      .then((d) => setData(d.error ? null : d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (open) load();
    else setData(null);
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} size="lg" labelledBy="duplicates-title">
      <div className="flex items-center justify-between gap-3 p-4 sm:p-5 border-b border-brand-tan/15 flex-shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-brand-terracotta/10 text-brand-terracotta flex items-center justify-center flex-shrink-0">
            <Merge size={17} />
          </div>
          <div className="min-w-0">
            <h2 id="duplicates-title" className="text-base font-bold text-brand-brown">Duplicate customers</h2>
            {data && (
              <p className="text-[11px] text-brand-tan">
                {data.total} group{data.total === 1 ? "" : "s"} across {data.scanned} records
              </p>
            )}
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close"><X size={18} /></Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
        {loading && (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => <div key={i} className="h-28 bg-brand-cream/70 rounded-lg animate-pulse" />)}
          </div>
        )}

        {!loading && data && data.groups.length === 0 && (
          <EmptyState
            icon={CheckCircle2}
            title="No duplicates found"
            hint={`All ${data.scanned} customer records have a distinct phone and email.`}
          />
        )}

        {!loading && !data && (
          <EmptyState icon={ShieldAlert} title="Could not scan for duplicates" hint="Try again in a moment." />
        )}

        {!loading && data?.groups.map((g, i) => (
          <MergeGroup key={g.reason + i} group={g} onMerged={onMerged} />
        ))}

        {data?.truncated && (
          <p className="text-[12px] text-brand-tan text-center py-2">
            Showing the first {data.groups.length} groups of {data.total}. Merge these, then scan again.
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 p-4 sm:p-5 border-t border-brand-tan/15 bg-brand-cream/30 flex-shrink-0">
        <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
          <Search size={13} /> Scan again
        </Button>
        <Button variant="outline" onClick={onClose}>Done</Button>
      </div>
    </Modal>
  );
}
