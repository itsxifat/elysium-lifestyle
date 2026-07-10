"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { BellRing, ArrowLeft, Save, AlertTriangle, Info, Lock } from "lucide-react";
import { PageHeader, Card, Button, Toggle, Pill, EmptyState } from "@/components/admin/ui";
import { STAFF_ROLES, ROLE_LABELS } from "@/lib/permissions";
import { NOTIFICATION_EVENTS } from "@/lib/notification-events";

// Group events for display (currently all "Orders", but future-proofed).
const GROUPS = [...new Set(NOTIFICATION_EVENTS.map((e) => e.group))];

export default function NotificationRulesPage() {
  const [routing, setRouting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/notifications/settings");
        if (res.status === 403) { setDenied(true); return; }
        const d = await res.json();
        setRouting(d.routing || {});
      } catch {
        toast.error("Failed to load notification rules");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const has = (key, role) => (routing?.[key] || []).includes(role);

  const setRoles = (key, roles) =>
    setRouting((prev) => ({ ...prev, [key]: STAFF_ROLES.filter((r) => roles.includes(r)) }));

  const toggleCell = (key, role) => {
    const cur = new Set(routing[key] || []);
    cur.has(role) ? cur.delete(role) : cur.add(role);
    setRoles(key, [...cur]);
    setDirty(true);
  };

  const toggleRow = (key) => {
    const allOn = STAFF_ROLES.every((r) => has(key, r));
    setRoles(key, allOn ? [] : [...STAFF_ROLES]);
    setDirty(true);
  };

  const toggleColumn = (role) => {
    const allOn = NOTIFICATION_EVENTS.every((e) => has(e.key, role));
    setRouting((prev) => {
      const next = { ...prev };
      for (const e of NOTIFICATION_EVENTS) {
        const cur = new Set(next[e.key] || []);
        allOn ? cur.delete(role) : cur.add(role);
        next[e.key] = STAFF_ROLES.filter((r) => cur.has(r));
      }
      return next;
    });
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/notifications/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routing }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Failed to save");
      setRouting(d.routing);
      setDirty(false);
      toast.success("Notification rules saved");
    } catch (e) {
      toast.error(e.message || "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  if (denied) {
    return (
      <div>
        <PageHeader icon={BellRing} title="Notification Rules" />
        <Card>
          <EmptyState
            icon={Lock}
            title="You don't have access"
            hint="Managing notification rules requires the Settings permission. Ask a Super Admin if you need it."
          />
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        icon={BellRing}
        title="Notification Rules"
        subtitle="Choose which staff roles receive each notification"
        actions={
          <div className="flex items-center gap-2">
            <Button as={Link} href="/admin/notifications" variant="outline">
              <ArrowLeft size={14} /> Feed
            </Button>
            <Button onClick={save} disabled={saving || !dirty || loading}>
              <Save size={14} /> {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        }
      />

      <Card className="mb-4 bg-brand-cream/40 border-brand-tan/25">
        <div className="flex gap-3">
          <Info size={16} className="text-brand-terracotta mt-0.5 flex-shrink-0" />
          <p className="text-[12.5px] text-brand-brown/80 leading-relaxed">
            Tick a box so that role receives that notification in the bell &amp; notifications
            feed. Super Admins and Admins have full access, but alerts are still opt-in here —
            untick a box to stop that role being notified. Click a role heading to toggle its
            whole column, or “All / None” to toggle a row.
          </p>
        </div>
      </Card>

      {loading || !routing ? (
        <Card><p className="py-10 text-center text-brand-tan text-sm">Loading…</p></Card>
      ) : (
        <Card padded={false}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left">
              <thead>
                <tr className="border-b border-brand-tan/15 bg-brand-cream/30">
                  <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-brand-tan">
                    Notification
                  </th>
                  {STAFF_ROLES.map((role) => (
                    <th key={role} className="px-2 py-3 text-center">
                      <button
                        onClick={() => toggleColumn(role)}
                        title="Toggle this role for every notification"
                        className="text-[11px] font-semibold uppercase tracking-wide text-brand-brown hover:text-brand-terracotta transition-colors"
                      >
                        {ROLE_LABELS[role]}
                      </button>
                    </th>
                  ))}
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {GROUPS.map((group) => (
                  <GroupBlock
                    key={group}
                    group={group}
                    has={has}
                    onToggleCell={toggleCell}
                    onToggleRow={toggleRow}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function GroupBlock({ group, has, onToggleCell, onToggleRow }) {
  const events = NOTIFICATION_EVENTS.filter((e) => e.group === group);
  return (
    <>
      {GROUPS.length > 1 && (
        <tr>
          <td colSpan={STAFF_ROLES.length + 2} className="px-5 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-[1.5px] text-brand-tan">
            {group}
          </td>
        </tr>
      )}
      {events.map((e) => (
        <tr key={e.key} className="border-b border-brand-tan/10 hover:bg-brand-cream/20 transition-colors">
          <td className="px-5 py-3.5 align-top">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-medium text-brand-brown">{e.label}</span>
              {e.severity === "warning" && (
                <Pill tone="amber"><AlertTriangle size={9} className="mr-0.5" /> Alert</Pill>
              )}
            </div>
            <p className="text-[11px] text-brand-tan mt-0.5 max-w-md">{e.desc}</p>
          </td>
          {STAFF_ROLES.map((role) => (
            <td key={role} className="px-2 py-3.5 text-center">
              <div className="flex justify-center">
                <Toggle checked={has(e.key, role)} onChange={() => onToggleCell(e.key, role)} />
              </div>
            </td>
          ))}
          <td className="px-3 py-3.5 text-right">
            <button
              onClick={() => onToggleRow(e.key)}
              className="text-[11px] text-brand-tan hover:text-brand-terracotta transition-colors whitespace-nowrap"
            >
              All / None
            </button>
          </td>
        </tr>
      ))}
    </>
  );
}
