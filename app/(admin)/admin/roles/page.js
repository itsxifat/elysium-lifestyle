"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";
import { ShieldCheck, Check, X, Pencil, KeyRound, Lock } from "lucide-react";
import { PageHeader, Card, Button, Pill, TableWrap, SectionTitle } from "@/components/admin/ui";
import {
  ROLES, ROLE_LABELS, ROLE_PERMISSIONS, PERMISSIONS, PERMISSION_GROUPS,
  assignableRoles, getEffectivePermissions, isElevated,
} from "@/lib/permissions";

const ROLE_BADGE = {
  superadmin: "brown", admin: "terracotta", moderator: "blue", staff: "amber", customer: "gray",
};
const MATRIX_ROLES = [ROLES.STAFF, ROLES.MODERATOR, ROLES.ADMIN, ROLES.SUPERADMIN];

function roleHasPerm(role, key) {
  if (isElevated(role)) return true;
  return (ROLE_PERMISSIONS[role] || []).includes(key);
}

// ── Staff role + permission editor ───────────────────────────────────────────
function StaffEditModal({ user, actorRole, grantablePerms, onClose, onSaved }) {
  const [role, setRole] = useState(user.role);
  const [permissions, setPermissions] = useState(user.permissions || []);
  const [saving, setSaving] = useState(false);

  const roleOptions = Array.from(new Set([role, ...assignableRoles(actorRole)]));
  const togglePerm = (key) =>
    setPermissions((p) => (p.includes(key) ? p.filter((k) => k !== key) : [...p, key]));

  const submit = async () => {
    setSaving(true);
    try {
      const payload = { name: user.name, role, permissions: isElevated(role) ? [] : permissions };
      const res = await fetch(`/api/admin/users/${user._id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(d.error || "Failed"); setSaving(false); return; }
      toast.success("Staff updated");
      onSaved();
    } catch {
      toast.error("Something went wrong");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full max-w-md rounded-xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-brand-brown">Edit {user.name}</h2>
          <button onClick={onClose} className="text-brand-tan hover:text-brand-brown"><X size={18} /></button>
        </div>

        <label className="block text-[11px] uppercase tracking-widest text-brand-tan mb-1.5">Role</label>
        <select value={role} onChange={(e) => setRole(e.target.value)}
          className="w-full rounded-lg border border-brand-tan/30 bg-white px-3 py-2 text-sm text-brand-brown focus:outline-none focus:border-brand-brown mb-4">
          {roleOptions.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        </select>

        {isElevated(role) ? (
          <div className="rounded-lg bg-brand-cream/60 px-3 py-2.5 text-[11px] text-brand-tan">
            Full access — this role holds every permission.
          </div>
        ) : (
          <div>
            <label className="block text-[11px] uppercase tracking-widest text-brand-tan mb-1.5">Extra permissions</label>
            <p className="text-[10px] text-brand-tan mb-2">Role defaults are locked on. Tick extra permissions to grant.</p>
            <div className="space-y-3 max-h-60 overflow-y-auto border border-brand-tan/15 rounded-lg p-3">
              {PERMISSION_GROUPS.map((g) => (
                <div key={g.label}>
                  <p className="text-[9px] uppercase tracking-widest text-brand-tan/70 mb-1">{g.label}</p>
                  <div className="space-y-1">
                    {g.keys.map((key) => {
                      const isDefault = (ROLE_PERMISSIONS[role] || []).includes(key);
                      const grantable = grantablePerms.includes(key);
                      const checked = isDefault || permissions.includes(key);
                      const disabled = isDefault || !grantable;
                      return (
                        <label key={key} className={`flex items-center gap-2 text-[12px] ${disabled && !isDefault ? "opacity-40" : "cursor-pointer"}`}>
                          <input type="checkbox" checked={checked} disabled={disabled}
                            onChange={() => togglePerm(key)} className="accent-brand-terracotta" />
                          <span className="text-brand-brown">{PERMISSIONS[key]}</span>
                          {isDefault && <span className="text-[9px] text-brand-tan">(role)</span>}
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3 mt-5">
          <Button onClick={submit} disabled={saving} className="flex-1">{saving ? "Saving…" : "Save"}</Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

export default function RolesPage() {
  const { data: session } = useSession();
  const actorRole = session?.user?.role || ROLES.CUSTOMER;
  const elevated = isElevated(actorRole);
  const grantablePerms = getEffectivePermissions(session?.user);

  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editUser, setEditUser] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users?limit=100");
      const d = await res.json();
      setStaff((d.users || []).filter((u) => u.role !== ROLES.CUSTOMER));
    } catch { toast.error("Failed to load staff"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const resetPin = async (user) => {
    if (!confirm(`Reset ${user.name}'s PIN? They'll be asked to create a new one.`)) return;
    const res = await fetch("/api/admin/pin/reset", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: user._id }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(d.error || "Failed");
    toast.success("PIN reset");
    load();
  };

  return (
    <div>
      <PageHeader icon={ShieldCheck} title="Roles & PINs" subtitle="Permission matrix, staff access, and security PIN status" />

      {/* Permission matrix */}
      <SectionTitle>Role permissions</SectionTitle>
      <Card padded={false} className="mb-8">
        <TableWrap>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-brand-cream/40">
                <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-[1.5px] text-brand-tan font-semibold">Permission</th>
                {MATRIX_ROLES.map((r) => (
                  <th key={r} className="px-3 py-2.5 text-[10px] uppercase tracking-[1.5px] text-brand-tan font-semibold text-center">{ROLE_LABELS[r]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSION_GROUPS.map((g) => (
                <RoleGroupRows key={g.label} group={g} />
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Card>

      {/* Staff list */}
      <SectionTitle>Team members ({staff.length})</SectionTitle>
      <Card padded={false}>
        {loading ? (
          <p className="px-5 py-12 text-center text-brand-tan text-sm">Loading…</p>
        ) : (
          <TableWrap>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-brand-cream/40">
                  {["Member", "Role", "Permissions", "PIN", ""].map((h) => (
                    <th key={h} className="text-left px-4 py-2.5 text-[10px] uppercase tracking-[1.5px] text-brand-tan font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-tan/10">
                {staff.map((u) => {
                  const eff = getEffectivePermissions(u);
                  return (
                    <tr key={u._id} className="hover:bg-brand-cream/30">
                      <td className="px-4 py-3">
                        <p className="text-[13px] font-medium text-brand-brown">{u.name}</p>
                        <p className="text-[11px] text-brand-tan">{u.email}</p>
                      </td>
                      <td className="px-4 py-3"><Pill tone={ROLE_BADGE[u.role]}>{ROLE_LABELS[u.role]}</Pill></td>
                      <td className="px-4 py-3 text-[12px] text-brand-tan">
                        {isElevated(u.role) ? "All permissions" : `${eff.length} permission${eff.length === 1 ? "" : "s"}`}
                      </td>
                      <td className="px-4 py-3">
                        {u.pinLockedUntil ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-red-600"><Lock size={12} /> Locked</span>
                        ) : u.hasPin ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600"><Check size={12} /> Set</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] text-amber-600"><X size={12} /> Not set</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          {elevated && (
                            <button onClick={() => setEditUser(u)} title="Edit role & permissions"
                              className="p-1.5 text-brand-tan hover:text-brand-brown"><Pencil size={14} /></button>
                          )}
                          {elevated && (u.hasPin || u.pinLockedUntil) && (
                            <button onClick={() => resetPin(u)} title="Reset PIN"
                              className="p-1.5 text-brand-tan hover:text-red-500"><KeyRound size={14} /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>

      {editUser && (
        <StaffEditModal
          user={editUser}
          actorRole={actorRole}
          grantablePerms={grantablePerms}
          onClose={() => setEditUser(null)}
          onSaved={() => { setEditUser(null); load(); }}
        />
      )}
    </div>
  );
}

// Rows for one permission group in the matrix.
function RoleGroupRows({ group }) {
  return (
    <>
      <tr className="bg-brand-cream/20">
        <td colSpan={MATRIX_ROLES.length + 1} className="px-4 py-1.5 text-[9px] uppercase tracking-widest text-brand-tan/70 font-semibold">{group.label}</td>
      </tr>
      {group.keys.map((key) => (
        <tr key={key} className="border-t border-brand-tan/10">
          <td className="px-4 py-2.5 text-[12px] text-brand-brown">{PERMISSIONS[key]}</td>
          {MATRIX_ROLES.map((r) => (
            <td key={r} className="px-3 py-2.5 text-center">
              {roleHasPerm(r, key)
                ? <Check size={14} className="text-emerald-600 mx-auto" />
                : <span className="text-brand-tan/30">—</span>}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
