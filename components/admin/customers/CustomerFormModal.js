"use client";

import { useEffect, useState } from "react";
import { X, UserPlus, Shield, KeyRound } from "lucide-react";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";
import { Button, Field, TextInput, Toggle } from "@/components/admin/ui";
import {
  ROLES, ROLE_LABELS, ROLE_DESCRIPTIONS, ROLE_PERMISSIONS,
  assignableRoles, getEffectivePermissions, isElevated,
  PERMISSION_GROUPS, PERMISSIONS,
} from "@/lib/permissions";
import { Modal, Dropdown, Checkbox } from "./shared";

// Create or edit a directory record.
//
// The important distinction the form makes visible: a CUSTOMER needs only a way
// to reach them (a phone is enough — that is how COD works), while an account
// that can SIGN IN needs an email and a password. Forcing an email on every
// walk-in buyer is what drove staff to invent fake addresses.

const blank = { name: "", phone: "", email: "", password: "", role: ROLES.CUSTOMER, permissions: [], emailVerified: false };

export default function CustomerFormModal({ open, user, mode, onClose, onSaved, actor }) {
  const isEdit = mode === "edit";
  const [form, setForm] = useState(blank);
  const [wantsLogin, setWantsLogin] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (isEdit && user) {
      setForm({
        name: user.name || "",
        phone: user.phone || "",
        email: user.email || "",
        password: "",
        role: user.role || ROLES.CUSTOMER,
        permissions: user.permissions || [],
        emailVerified: !!user.emailVerified,
      });
      setWantsLogin(!user.isGuest);
    } else {
      setForm(blank);
      setWantsLogin(false);
    }
  }, [open, isEdit, user]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const roleOptions = assignableRoles(actor?.role).map((r) => ({ value: r, label: ROLE_LABELS[r] || r }));
  const isTeamRole = form.role !== ROLES.CUSTOMER;
  // Elevated roles already hold everything; per-permission checkboxes would lie.
  const showPermissions = isTeamRole && !isElevated(form.role);
  const roleDefaults = ROLE_PERMISSIONS[form.role] || [];
  const actorPerms = getEffectivePermissions(actor || {});

  const togglePerm = (key) => {
    setForm((f) => ({
      ...f,
      permissions: f.permissions.includes(key)
        ? f.permissions.filter((p) => p !== key)
        : [...f.permissions, key],
    }));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error("Name is required");

    const needsLogin = isTeamRole || wantsLogin;
    if (!isEdit && needsLogin && (!form.email.trim() || !form.password))
      return toast.error("A sign-in account needs an email and a password");
    if (!isEdit && !needsLogin && !form.phone.trim() && !form.email.trim())
      return toast.error("Give at least a phone number or an email");

    setSaving(true);
    try {
      const url = isEdit ? `/api/admin/users/${user._id}` : "/api/admin/users";
      const body = isEdit
        ? {
            name: form.name,
            phone: form.phone,
            email: form.email,
            role: form.role,
            permissions: form.permissions,
            emailVerified: form.emailVerified,
          }
        : {
            name: form.name,
            phone: form.phone,
            email: form.email,
            password: needsLogin ? form.password : undefined,
            role: form.role,
            permissions: form.permissions,
          };

      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save");

      toast.success(isEdit ? "Customer updated" : "Customer created");
      onSaved(data);
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} size={showPermissions ? "lg" : "md"} labelledBy="customer-form-title">
      <div className="flex items-center justify-between gap-3 p-4 sm:p-5 border-b border-brand-tan/15 flex-shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-brand-terracotta/10 text-brand-terracotta flex items-center justify-center flex-shrink-0">
            {isTeamRole ? <Shield size={17} /> : <UserPlus size={17} />}
          </div>
          <h2 id="customer-form-title" className="text-base font-bold text-brand-brown truncate">
            {isEdit ? `Edit ${user?.name || "record"}` : "New customer"}
          </h2>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close"><X size={18} /></Button>
      </div>

      <form onSubmit={submit} className="flex-1 overflow-y-auto">
        <div className="p-4 sm:p-5 space-y-4">
          <Field label="Full name">
            <TextInput value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Mohammad Samir" autoFocus />
          </Field>

          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Phone" hint="Stored as 01XXXXXXXXX — paste any format">
              <TextInput value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="01712345678" inputMode="tel" />
            </Field>
            <Field
              label="Email"
              hint={isEdit && !user?.isGuest ? "Sign-in address — not editable here" : "Optional"}
            >
              <TextInput
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="name@example.com"
                disabled={isEdit && !user?.isGuest}
              />
            </Field>
          </div>

          {/* Sign-in account */}
          {!isEdit && (
            <div className="rounded-lg border border-brand-tan/20 bg-brand-cream/40 p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-brand-brown">Can sign in</p>
                  <p className="text-[11px] text-brand-tan mt-0.5">
                    Give them an email and password so they can log in and see their orders.
                    Leave off for a normal COD buyer.
                  </p>
                </div>
                <Toggle checked={wantsLogin || isTeamRole} onChange={setWantsLogin} disabled={isTeamRole} />
              </div>
              {(wantsLogin || isTeamRole) && (
                <div className="mt-3">
                  <Field label="Password" hint="At least 6 characters">
                    <TextInput
                      type="password"
                      value={form.password}
                      onChange={(e) => set("password", e.target.value)}
                      placeholder="••••••••"
                      autoComplete="new-password"
                    />
                  </Field>
                </div>
              )}
            </div>
          )}

          {/* Role */}
          {roleOptions.length > 1 && (
            <Field label="Role" hint={ROLE_DESCRIPTIONS[form.role]}>
              <Dropdown
                value={form.role}
                onChange={(v) => set("role", v)}
                options={roleOptions}
                widthClass="w-full"
                className="w-full"
              />
            </Field>
          )}

          {isEdit && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-brand-tan/20 p-3.5">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-brand-brown">Email verified</p>
                <p className="text-[11px] text-brand-tan mt-0.5">Verified accounts can reset their password.</p>
              </div>
              <Toggle checked={form.emailVerified} onChange={(v) => set("emailVerified", v)} />
            </div>
          )}

          {/* Extra permissions */}
          {showPermissions && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <KeyRound size={13} className="text-brand-tan" />
                <span className="text-[11px] font-semibold uppercase tracking-[1.5px] text-brand-tan">
                  Extra permissions
                </span>
              </div>
              <p className="text-[11px] text-brand-tan mb-3">
                {ROLE_LABELS[form.role]} already includes its own defaults (shown ticked and locked).
                Tick anything extra this person needs.
              </p>
              <div className="space-y-3">
                {PERMISSION_GROUPS.map((group) => (
                  <div key={group.label}>
                    <p className="text-[11px] font-medium text-brand-brown mb-1.5">{group.label}</p>
                    <div className="grid sm:grid-cols-2 gap-1.5">
                      {group.keys.map((key) => {
                        const fromRole = roleDefaults.includes(key);
                        const grantable = actorPerms.includes(key);
                        const checked = fromRole || form.permissions.includes(key);
                        return (
                          <label
                            key={key}
                            className={cn(
                              "flex items-center gap-2 px-2.5 py-2 rounded-lg border text-[12px] transition-colors",
                              checked ? "border-brand-terracotta/30 bg-brand-terracotta/5" : "border-brand-tan/20",
                              (fromRole || !grantable) ? "opacity-60" : "cursor-pointer hover:border-brand-tan/50"
                            )}
                          >
                            <Checkbox
                              checked={checked}
                              disabled={fromRole || !grantable}
                              onChange={() => togglePerm(key)}
                              label={PERMISSIONS[key]}
                            />
                            <span className="text-brand-brown truncate">{PERMISSIONS[key]}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 p-4 sm:p-5 border-t border-brand-tan/15 bg-brand-cream/30 flex-shrink-0">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Create customer"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
