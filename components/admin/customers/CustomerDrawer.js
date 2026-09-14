"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  X, Phone, Mail, MapPin, Calendar, ShoppingBag, Pencil, Package,
  TrendingUp, RotateCcw, Ban, ExternalLink, Copy, Check,
} from "lucide-react";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";
import { Button, Pill, EmptyState } from "@/components/admin/ui";
import { orderStatusLabel, orderStatusTone } from "@/lib/order-status";
import {
  Avatar, TypeBadge, Drawer, taka, shortDate, timeAgo, channelLabel, channelTone,
} from "./shared";

// Everything the shop knows about one customer, in the order staff need it:
// who they are and how to reach them, what they are worth, then the history.

function CopyableLine({ icon: Icon, value, href, muted }) {
  const [copied, setCopied] = useState(false);
  if (!value) {
    return (
      <div className="flex items-center gap-2.5 text-[13px] text-brand-tan/60">
        <Icon size={14} className="flex-shrink-0" />
        <span>{muted}</span>
      </div>
    );
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch { toast.error("Could not copy"); }
  };
  return (
    <div className="flex items-center gap-2.5 text-[13px] text-brand-brown group">
      <Icon size={14} className="text-brand-tan flex-shrink-0" />
      {href ? (
        <a href={href} className="hover:text-brand-terracotta transition-colors truncate">{value}</a>
      ) : (
        <span className="truncate">{value}</span>
      )}
      <button
        type="button"
        onClick={copy}
        className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-brand-tan hover:text-brand-brown transition-opacity flex-shrink-0"
        aria-label={`Copy ${value}`}
      >
        {copied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
      </button>
    </div>
  );
}

function Metric({ label, value, hint, icon: Icon, tone = "brown" }) {
  const tones = {
    brown: "text-brand-brown",
    green: "text-emerald-700",
    amber: "text-amber-700",
    red: "text-red-600",
  };
  return (
    <div className="bg-white rounded-lg border border-brand-tan/15 p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-brand-tan font-medium">
        {Icon && <Icon size={11} />}
        <span className="truncate">{label}</span>
      </div>
      <p className={cn("text-lg font-bold mt-1 tabular-nums", tones[tone])}>{value}</p>
      {hint && <p className="text-[10px] text-brand-tan mt-0.5 truncate">{hint}</p>}
    </div>
  );
}

export default function CustomerDrawer({ customerId, open, onClose, onEdit, canManage }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !customerId) { setData(null); return; }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/admin/users/${customerId}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setData(d.error ? null : d); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [customerId, open]);

  const u = data?.user;

  return (
    <Drawer open={open} onClose={onClose} labelledBy="customer-drawer-title">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 p-4 sm:p-5 border-b border-brand-tan/15 bg-white flex-shrink-0">
        <div className="flex items-start gap-3 min-w-0">
          {u ? <Avatar user={u} size="lg" /> : <div className="w-16 h-16 rounded-full bg-brand-cream-dark animate-pulse" />}
          <div className="min-w-0 pt-1">
            <h2 id="customer-drawer-title" className="text-lg font-bold text-brand-brown truncate">
              {u?.name || (loading ? "Loading…" : "Customer")}
            </h2>
            {u && (
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                <TypeBadge user={u} />
                {u.guestSource && <Pill tone={channelTone(u.guestSource)}>via {channelLabel(u.guestSource)}</Pill>}
                {u.emailVerified && <Pill tone="green">Verified</Pill>}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {u && canManage && (
            <Button variant="ghost" size="icon" onClick={() => onEdit(u)} aria-label="Edit customer">
              <Pencil size={16} />
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X size={18} />
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
        {loading && !u && (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-white/70 rounded-lg animate-pulse" />)}
          </div>
        )}

        {!loading && !u && (
          <EmptyState icon={X} title="Could not load this customer" hint="They may have been merged or removed." />
        )}

        {u && (
          <>
            {/* Contact */}
            <section className="bg-white rounded-lg border border-brand-tan/15 p-4 space-y-2.5">
              <CopyableLine icon={Phone} value={u.phone} href={u.phone ? `tel:${u.phone}` : null} muted="No phone on file" />
              <CopyableLine icon={Mail} value={u.email} href={u.email ? `mailto:${u.email}` : null} muted="No email on file" />
              <div className="flex items-center gap-2.5 text-[13px] text-brand-tan">
                <Calendar size={14} className="flex-shrink-0" />
                <span>Customer since {shortDate(u.createdAt)}</span>
              </div>
            </section>

            {/* What they are worth */}
            <section>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <Metric label="Collected" value={taka(u.collected)} hint="delivered only" icon={TrendingUp} tone="green" />
                <Metric label="Orders" value={u.orderCount} hint={`${u.units} item${u.units === 1 ? "" : "s"}`} icon={ShoppingBag} />
                <Metric label="Avg order" value={taka(u.avgOrderValue)} icon={Package} />
                <Metric label="In flight" value={taka(u.inFlight)} hint="not yet delivered" tone="amber" />
              </div>
              {(u.cancelledCount > 0 || u.returnedCount > 0) && (
                <div className="flex items-center gap-3 mt-2.5 text-[11px] text-brand-tan px-1">
                  {u.cancelledCount > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <Ban size={11} /> {u.cancelledCount} cancelled ({taka(u.cancelledValue)})
                    </span>
                  )}
                  {u.returnedCount > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <RotateCcw size={11} /> {u.returnedCount} returned
                    </span>
                  )}
                </div>
              )}
            </section>

            {/* Channels */}
            {Object.keys(u.channels || {}).length > 0 && (
              <section>
                <h3 className="text-[11px] font-semibold uppercase tracking-[1.5px] text-brand-tan mb-2">Buys through</h3>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(u.channels)
                    .sort((a, b) => b[1] - a[1])
                    .map(([c, n]) => (
                      <Pill key={c} tone={channelTone(c)}>{channelLabel(c)} · {n}</Pill>
                    ))}
                </div>
              </section>
            )}

            {/* Addresses */}
            {data.addresses?.length > 0 && (
              <section>
                <h3 className="text-[11px] font-semibold uppercase tracking-[1.5px] text-brand-tan mb-2">
                  Delivery address{data.addresses.length > 1 ? `es (${data.addresses.length})` : ""}
                </h3>
                <div className="space-y-2">
                  {data.addresses.slice(0, 4).map((a, i) => (
                    <div key={i} className="bg-white rounded-lg border border-brand-tan/15 p-3 text-[13px]">
                      <div className="flex items-start gap-2">
                        <MapPin size={13} className="text-brand-tan mt-0.5 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-brand-brown">
                            {[a.street, a.city, a.state, a.postalCode].filter(Boolean).join(", ")}
                          </p>
                          <p className="text-[11px] text-brand-tan mt-0.5">
                            {a.name}{a.phone ? ` · ${a.phone}` : ""} · last used {shortDate(a.lastUsedAt)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Order history */}
            <section>
              <h3 className="text-[11px] font-semibold uppercase tracking-[1.5px] text-brand-tan mb-2">
                Order history {u.orderCount > 0 && <span className="normal-case tracking-normal">· last {timeAgo(u.lastOrderAt)}</span>}
              </h3>
              {!data.orders?.length ? (
                <div className="bg-white rounded-lg border border-brand-tan/15">
                  <EmptyState
                    icon={ShoppingBag}
                    title="No orders yet"
                    hint="This record was created from contact details but has no purchase against it."
                  />
                </div>
              ) : (
                <div className="bg-white rounded-lg border border-brand-tan/15 divide-y divide-brand-tan/10 overflow-hidden">
                  {data.orders.map((o) => (
                    <Link
                      key={o._id}
                      href={`/admin/orders/${o._id}`}
                      className="flex items-center gap-3 p-3 hover:bg-brand-cream/50 transition-colors group"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-medium text-brand-brown truncate">{o.orderNumber}</span>
                          <ExternalLink size={11} className="text-brand-tan opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                        </div>
                        <p className="text-[11px] text-brand-tan mt-0.5">
                          {shortDate(o.createdAt)} · {o.units} item{o.units === 1 ? "" : "s"} · {channelLabel(o.source)}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-[13px] font-semibold text-brand-brown tabular-nums">{taka(o.totalAmount)}</p>
                        <div className="mt-1">
                          <Pill tone={orderStatusTone(o.orderStatus)}>{orderStatusLabel(o.orderStatus)}</Pill>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </Drawer>
  );
}
