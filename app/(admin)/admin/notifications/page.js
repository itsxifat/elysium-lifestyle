"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";
import { Bell, Send, X, CheckCheck, AlertTriangle, Info, ShieldAlert } from "lucide-react";
import { PageHeader, Card, Button, Field, TextInput, Select, EmptyState } from "@/components/admin/ui";
import { isElevated, STAFF_ROLES, ROLE_LABELS } from "@/lib/permissions";

const SEVERITY = {
  info: { dot: "bg-blue-500", Icon: Info, cls: "text-blue-500" },
  warning: { dot: "bg-amber-500", Icon: AlertTriangle, cls: "text-amber-500" },
  critical: { dot: "bg-red-500", Icon: ShieldAlert, cls: "text-red-500" },
};

function timeAgo(date) {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Compose (elevated only) ──────────────────────────────────────────────────
function ComposeModal({ onClose, onSent }) {
  const [audience, setAudience] = useState("staff");
  const [recipient, setRecipient] = useState("");
  const [staff, setStaff] = useState([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [severity, setSeverity] = useState("info");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetch("/api/admin/users?limit=100")
      .then((r) => r.json())
      .then((d) => setStaff((d.users || []).filter((u) => STAFF_ROLES.includes(u.role))))
      .catch(() => {});
  }, []);

  const submit = async () => {
    if (!title.trim()) return toast.error("Title is required");
    if (audience === "user" && !recipient) return toast.error("Pick a recipient");
    setSending(true);
    try {
      const res = await fetch("/api/admin/notifications", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audience, recipient: audience === "user" ? recipient : undefined, title, body, severity }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(d.error || "Failed to send"); setSending(false); return; }
      toast.success("Notification sent");
      onSent();
    } catch {
      toast.error("Something went wrong");
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full max-w-md rounded-xl shadow-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-brand-brown">Send notification</h2>
          <button onClick={onClose} className="text-brand-tan hover:text-brand-brown"><X size={18} /></button>
        </div>
        <div className="space-y-4">
          <Field label="Send to">
            <Select value={audience} onChange={(e) => setAudience(e.target.value)}>
              <option value="staff">All staff &amp; moderators</option>
              <option value="user">A specific person</option>
            </Select>
          </Field>
          {audience === "user" && (
            <Field label="Recipient">
              <Select value={recipient} onChange={(e) => setRecipient(e.target.value)}>
                <option value="">Select…</option>
                {staff.map((u) => <option key={u._id} value={u._id}>{u.name} · {ROLE_LABELS[u.role] || u.role}</option>)}
              </Select>
            </Field>
          )}
          <Field label="Title"><TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Please process pending orders" /></Field>
          <Field label="Message"><TextInput value={body} onChange={(e) => setBody(e.target.value)} placeholder="optional details" /></Field>
          <Field label="Priority">
            <Select value={severity} onChange={(e) => setSeverity(e.target.value)}>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
            </Select>
          </Field>
          <div className="flex gap-3 pt-1">
            <Button onClick={submit} disabled={sending} className="flex-1"><Send size={14} /> {sending ? "Sending…" : "Send"}</Button>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function NotificationsPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const elevated = isElevated(session?.user?.role);

  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [composeOpen, setComposeOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/notifications?limit=50");
      const d = await res.json();
      setItems(d.notifications || []);
      setUnread(d.unreadCount || 0);
    } catch { toast.error("Failed to load"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const markAll = async () => {
    setItems((arr) => arr.map((n) => ({ ...n, read: true })));
    setUnread(0);
    await fetch("/api/admin/notifications/read", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true }),
    }).catch(() => {});
  };

  const openItem = (n) => {
    if (!n.read) {
      setItems((arr) => arr.map((x) => (x._id === n._id ? { ...x, read: true } : x)));
      setUnread((u) => Math.max(0, u - 1));
      fetch("/api/admin/notifications/read", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: n._id }),
      }).catch(() => {});
    }
    if (n.link) router.push(n.link);
  };

  return (
    <div>
      <PageHeader
        icon={Bell}
        title="Notifications"
        subtitle={unread > 0 ? `${unread} unread` : "You're all caught up"}
        actions={
          <div className="flex items-center gap-2">
            {unread > 0 && <Button variant="outline" onClick={markAll}><CheckCheck size={14} /> Mark all read</Button>}
            {elevated && <Button onClick={() => setComposeOpen(true)}><Send size={14} /> Send</Button>}
          </div>
        }
      />

      <Card padded={false}>
        {loading ? (
          <p className="px-5 py-12 text-center text-brand-tan text-sm">Loading…</p>
        ) : items.length === 0 ? (
          <EmptyState icon={Bell} title="No notifications" hint="Activity from your team and the store will appear here." />
        ) : (
          <div className="divide-y divide-brand-tan/10">
            {items.map((n) => {
              const sev = SEVERITY[n.severity] || SEVERITY.info;
              return (
                <button key={n._id} onClick={() => openItem(n)}
                  className={`w-full text-left flex gap-3 px-5 py-4 hover:bg-brand-cream/40 transition-colors ${n.read ? "" : "bg-brand-cream/30"}`}>
                  <sev.Icon size={16} className={`mt-0.5 flex-shrink-0 ${sev.cls}`} />
                  <div className="min-w-0 flex-1">
                    <p className={`text-[14px] ${n.read ? "text-brand-brown/80" : "text-brand-brown font-semibold"}`}>{n.title}</p>
                    {n.body && <p className="text-[13px] text-brand-tan mt-0.5">{n.body}</p>}
                    <p className="text-[11px] text-brand-tan/70 mt-1">{timeAgo(n.createdAt)}{n.actorName ? ` · ${n.actorName}` : ""}{n.link ? " · view →" : ""}</p>
                  </div>
                  {!n.read && <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${sev.dot}`} />}
                </button>
              );
            })}
          </div>
        )}
      </Card>

      {composeOpen && <ComposeModal onClose={() => setComposeOpen(false)} onSent={() => { setComposeOpen(false); load(); }} />}
    </div>
  );
}
