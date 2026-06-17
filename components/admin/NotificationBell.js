"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bell, X, CheckCheck, AlertTriangle, Info, ShieldAlert } from "lucide-react";

const SEVERITY = {
  info: { dot: "bg-blue-500", icon: Info, cls: "text-blue-500" },
  warning: { dot: "bg-amber-500", icon: AlertTriangle, cls: "text-amber-500" },
  critical: { dot: "bg-red-500", icon: ShieldAlert, cls: "text-red-500" },
};

function timeAgo(date) {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

// Notification center. Polls every 30s for the unread badge; opens a right-side
// drawer (same pattern as the user detail drawer) with the recent feed.
export default function NotificationBell({ className = "" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const timer = useRef(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/notifications");
      if (!res.ok) return;
      const d = await res.json();
      setItems(d.notifications || []);
      setUnread(d.unreadCount || 0);
    } catch {}
  }, []);

  useEffect(() => {
    load();
    timer.current = setInterval(load, 30000);
    return () => clearInterval(timer.current);
  }, [load]);

  useEffect(() => { if (open) load(); }, [open, load]);

  const markAll = async () => {
    setItems((arr) => arr.map((n) => ({ ...n, read: true })));
    setUnread(0);
    await fetch("/api/admin/notifications/read", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    }).catch(() => {});
  };

  const openItem = async (n) => {
    if (!n.read) {
      setUnread((u) => Math.max(0, u - 1));
      setItems((arr) => arr.map((x) => (x._id === n._id ? { ...x, read: true } : x)));
      fetch("/api/admin/notifications/read", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: n._id }),
      }).catch(() => {});
    }
    if (n.link) { setOpen(false); router.push(n.link); }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Notifications"
        className={`relative w-9 h-9 flex items-center justify-center text-white/60 hover:text-white transition-colors ${className}`}
      >
        <Bell size={18} strokeWidth={1.5} />
        {unread > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-brand-terracotta text-white text-[9px] font-bold flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 bg-black/30 z-50" onClick={() => setOpen(false)} />
          <aside className="fixed right-0 top-0 bottom-0 w-full max-w-[400px] bg-white z-50 flex flex-col shadow-2xl animate-slide-in-right">
            <div className="flex items-center justify-between px-5 py-4 border-b border-brand-tan/20 flex-shrink-0">
              <div className="flex items-center gap-2">
                <p className="text-[11px] uppercase tracking-widest text-brand-tan font-medium">Notifications</p>
                {unread > 0 && <span className="text-[10px] bg-brand-terracotta/10 text-brand-terracotta px-1.5 py-0.5 rounded-full font-semibold">{unread} new</span>}
              </div>
              <div className="flex items-center gap-3">
                {unread > 0 && (
                  <button onClick={markAll} className="flex items-center gap-1 text-[11px] text-brand-terracotta hover:underline">
                    <CheckCheck size={13} /> Mark all read
                  </button>
                )}
                <button onClick={() => setOpen(false)} className="text-brand-tan hover:text-brand-brown"><X size={16} /></button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-brand-tan/60 px-6 text-center">
                  <Bell size={28} strokeWidth={1} className="mb-2" />
                  <p className="text-sm">No notifications yet</p>
                </div>
              ) : (
                items.map((n) => {
                  const sev = SEVERITY[n.severity] || SEVERITY.info;
                  return (
                    <button
                      key={n._id}
                      onClick={() => openItem(n)}
                      className={`w-full text-left flex gap-3 px-5 py-3.5 border-b border-brand-tan/10 hover:bg-brand-cream/40 transition-colors ${n.read ? "" : "bg-brand-cream/30"}`}
                    >
                      <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${n.read ? "bg-transparent" : sev.dot}`} />
                      <div className="min-w-0 flex-1">
                        <p className={`text-[13px] ${n.read ? "text-brand-brown/80" : "text-brand-brown font-semibold"}`}>{n.title}</p>
                        {n.body && <p className="text-[12px] text-brand-tan mt-0.5 line-clamp-2">{n.body}</p>}
                        <p className="text-[10px] text-brand-tan/70 mt-1">{timeAgo(n.createdAt)}{n.actorName ? ` · ${n.actorName}` : ""}</p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            <div className="px-5 py-3 border-t border-brand-tan/15 flex-shrink-0">
              <Link href="/admin/notifications" onClick={() => setOpen(false)} className="text-[12px] text-brand-terracotta hover:underline">
                View all notifications →
              </Link>
            </div>
          </aside>
        </>
      )}
    </>
  );
}
