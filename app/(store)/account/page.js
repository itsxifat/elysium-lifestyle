"use client";

import { useSession } from "next-auth/react";
import { useForm } from "react-hook-form";
import { useState, useEffect } from "react";
import Image from "next/image";
import toast from "react-hot-toast";
import { Eye, EyeOff, UserCircle, Lock, MapPin, Plus, Trash2, Pencil } from "lucide-react";
import { normalizeBdPhone, shouldUnoptimizeImage } from "@/lib/utils";

// The shopper's profile, saved addresses and password, all kept in the brand
// ERP (through /api/account/profile and /api/auth/change-password).

const inputClass =
  "w-full bg-transparent border-0 border-b border-stone-200 px-0 py-2.5 text-[13px] text-brand-brown placeholder-stone-300 focus:outline-none focus:border-brand-brown transition-colors duration-200";
const labelClass = "block text-[10px] uppercase tracking-[2px] text-brand-tan mb-1.5";
const localPhone = (value) => String(value || "").replace(/^\+?880/, "0");

// D-953: an address is one line plus the delivery zone it goes to.
const ZONE_LABELS = { inside_dhaka: "Inside Dhaka", suburbs: "Dhaka suburbs", outside_dhaka: "Outside Dhaka" };

function AddressForm({ initial, onSave, onCancel, saving }) {
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: {
      label: initial?.label || "",
      name: initial?.name || "",
      phone: localPhone(initial?.phone),
      // An address saved before D-953 kept its area apart: it joins the one line.
      addressLine: [initial?.addressLine, initial?.area].filter(Boolean).join(", "),
      zone: initial?.zone || "",
      isDefault: !!initial?.isDefault,
    },
  });

  const submit = (data) => {
    onSave({ ...(initial?.id ? { id: initial.id } : {}), ...data, area: undefined, districtId: undefined, thanaId: undefined });
  };

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-5 border border-stone-100 p-5" noValidate>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <label htmlFor="addr-label" className={labelClass}>Label</label>
          <input id="addr-label" {...register("label")} className={inputClass} placeholder="Home, Office…" />
        </div>
        <div>
          <label htmlFor="addr-name" className={labelClass}>Recipient name</label>
          <input id="addr-name" {...register("name", { required: true })} className={inputClass} />
          {errors.name && <p className="text-red-400 text-[11px] mt-1.5">Required</p>}
        </div>
        <div>
          <label htmlFor="addr-phone" className={labelClass}>Phone</label>
          <input
            id="addr-phone"
            {...register("phone", { validate: (v) => /^01[3-9]\d{8}$/.test(normalizeBdPhone(v)) || "A Bangladeshi mobile number" })}
            className={inputClass}
            placeholder="01700000000"
          />
          {errors.phone && <p className="text-red-400 text-[11px] mt-1.5">{errors.phone.message}</p>}
        </div>
        <div>
          <label htmlFor="addr-zone" className={labelClass}>Delivery area</label>
          <select id="addr-zone" {...register("zone", { required: true })} className={inputClass}>
            <option value="">Choose</option>
            {Object.entries(ZONE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          {errors.zone && <p className="text-red-400 text-[11px] mt-1.5">Required</p>}
        </div>
      </div>
      <div>
        <label htmlFor="addr-line" className={labelClass}>Full address</label>
        <textarea
          id="addr-line"
          rows={2}
          maxLength={500}
          {...register("addressLine", { required: true, minLength: 3 })}
          className={inputClass}
          placeholder="House, road, area, thana, district"
        />
        {errors.addressLine && <p className="text-red-400 text-[11px] mt-1.5">Required</p>}
      </div>
      <label className="flex items-center gap-2 text-[12px] text-brand-brown">
        <input type="checkbox" {...register("isDefault")} className="accent-brand-terracotta" /> Use as my default address
      </label>
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className="bg-brand-brown text-brand-cream text-[11px] uppercase tracking-[2.5px] px-6 py-2.5 hover:bg-brand-terracotta transition-colors disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save address"}
        </button>
        <button type="button" onClick={onCancel} className="text-[11px] uppercase tracking-[2px] text-brand-tan hover:text-brand-brown">
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function AccountPage() {
  const { data: session, update: updateSession } = useSession();
  const [loading, setLoading] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [profile, setProfile] = useState(null);
  const [editing, setEditing] = useState(null); // null | "new" | address id
  const [savingAddress, setSavingAddress] = useState(false);

  const { register, handleSubmit, formState: { errors }, reset } = useForm();
  const { register: pwRegister, handleSubmit: pwSubmit, formState: { errors: pwErrors }, reset: pwReset } = useForm();

  useEffect(() => {
    if (!session?.user?.id) return;
    fetch("/api/account/profile")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((data) => {
        setProfile(data);
        reset({ name: data.name || "", phone: localPhone(data.phone) });
      })
      .catch(() => setProfile({ failed: true, addresses: [] }));
  }, [session?.user?.id, reset]);

  const save = async (patch) => {
    const res = await fetch("/api/account/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Failed to update");
    setProfile(data);
    return data;
  };

  const onProfileSubmit = async (data) => {
    setLoading(true);
    try {
      await save({ name: data.name, phone: data.phone });
      toast.success("Profile updated");
      await updateSession();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const saveAddress = async (address) => {
    setSavingAddress(true);
    try {
      let list = profile.addresses.filter((a) => a.id !== address.id);
      if (address.isDefault) list = list.map((a) => ({ ...a, isDefault: false }));
      const next = address.id
        ? profile.addresses.map((a) => (a.id === address.id ? address : address.isDefault ? { ...a, isDefault: false } : a))
        : [...list, address];
      await save({ addresses: next });
      setEditing(null);
      toast.success("Address saved");
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSavingAddress(false);
    }
  };

  const removeAddress = async (id) => {
    try {
      await save({ addresses: profile.addresses.filter((a) => a.id !== id) });
      toast.success("Address removed");
    } catch (e) {
      toast.error(e.message);
    }
  };

  const onPasswordSubmit = async (data) => {
    setPwLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: data.currentPassword, newPassword: data.newPassword }),
      });
      const result = await res.json();
      if (res.ok) { toast.success("Password changed"); pwReset(); }
      else toast.error(result.error || "Failed to change password");
    } catch { toast.error("Something went wrong"); }
    finally { setPwLoading(false); }
  };

  if (!profile) {
    return (
      <div className="bg-white p-8 space-y-5 animate-pulse">
        <div className="h-2.5 bg-stone-100 rounded w-28" />
        <div className="flex items-center gap-4 py-4">
          <div className="w-16 h-16 rounded-full bg-stone-100" />
          <div className="space-y-2 flex-1">
            <div className="h-3 bg-stone-100 rounded w-32" />
            <div className="h-2.5 bg-stone-100 rounded w-44" />
          </div>
        </div>
        <div className="h-px bg-stone-100" />
        <div className="space-y-4 max-w-lg">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-10 bg-stone-100 rounded" />
          ))}
        </div>
      </div>
    );
  }

  const initials = (session?.user?.name || "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const image = session?.user?.image;
  const addresses = profile.addresses || [];

  return (
    <div className="space-y-4">
      {/* Personal Info */}
      <div className="bg-white p-8">
        <div className="flex items-center gap-2.5 mb-8 pb-5 border-b border-stone-100">
          <UserCircle size={14} strokeWidth={1.5} className="text-brand-tan" />
          <span className="text-[10px] uppercase tracking-[2.5px] text-brand-tan">Personal Info</span>
        </div>

        {profile.failed && (
          <p className="text-[12px] text-red-500 mb-6">We couldn&apos;t load your profile just now. Please try again in a moment.</p>
        )}

        <div className="flex items-center gap-5 mb-8">
          <div className="relative w-16 h-16 rounded-full overflow-hidden bg-brand-brown flex items-center justify-center text-brand-cream text-lg font-semibold">
            {image ? <Image src={image} alt="" fill sizes="64px" unoptimized={shouldUnoptimizeImage(image)} className="object-cover" /> : initials}
          </div>
          <div>
            <p className="font-semibold text-brand-brown">{session?.user?.name}</p>
            <p className="text-[12px] text-brand-tan mt-0.5">{session?.user?.email}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit(onProfileSubmit)} className="space-y-6 max-w-lg">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label htmlFor="profile-name" className={labelClass}>Full Name</label>
              <input id="profile-name" {...register("name", { required: true })} className={inputClass} />
              {errors.name && <p className="text-red-400 text-[11px] mt-1.5">Required</p>}
            </div>
            <div>
              <label htmlFor="profile-email" className={labelClass}>Email</label>
              <input
                id="profile-email"
                value={session?.user?.email || ""}
                disabled
                className={`${inputClass} opacity-40 cursor-not-allowed`}
              />
            </div>
          </div>

          <div>
            <label htmlFor="profile-phone" className={labelClass}>Phone</label>
            <input
              id="profile-phone"
              {...register("phone", { validate: (v) => !v || /^01[3-9]\d{8}$/.test(normalizeBdPhone(v)) || "A Bangladeshi mobile number" })}
              className={inputClass}
              placeholder="01700000000"
            />
            {errors.phone && <p className="text-red-400 text-[11px] mt-1.5">{errors.phone.message}</p>}
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="bg-brand-brown text-brand-cream text-[11px] uppercase tracking-[2.5px] px-7 py-3 hover:bg-brand-terracotta transition-colors duration-200 disabled:opacity-50"
            >
              {loading ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>

      {/* Saved addresses */}
      <div className="bg-white p-8">
        <div className="flex items-center justify-between mb-6 pb-5 border-b border-stone-100">
          <span className="flex items-center gap-2.5">
            <MapPin size={14} strokeWidth={1.5} className="text-brand-tan" />
            <span className="text-[10px] uppercase tracking-[2.5px] text-brand-tan">Saved Addresses</span>
          </span>
          {editing === null && addresses.length < 10 && (
            <button
              type="button"
              onClick={() => setEditing("new")}
              className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[2px] text-brand-terracotta hover:text-brand-brown"
            >
              <Plus size={13} /> Add address
            </button>
          )}
        </div>

        <div className="space-y-4">
          {addresses.length === 0 && editing === null && (
            <p className="text-[12px] text-brand-tan">No saved addresses yet. Save one to check out faster.</p>
          )}
          {addresses.map((a) =>
            editing === a.id ? (
              <AddressForm key={a.id} initial={a} saving={savingAddress} onSave={saveAddress} onCancel={() => setEditing(null)} />
            ) : (
              <div key={a.id} className="border border-stone-100 p-4 flex items-start justify-between gap-4">
                <div className="text-[12px] text-brand-tan space-y-0.5">
                  <p className="text-[13px] text-brand-brown font-medium">
                    {a.label || a.name}
                    {a.isDefault && <span className="ml-2 text-[9px] uppercase tracking-[2px] text-brand-terracotta">Default</span>}
                  </p>
                  <p>{a.name} · {localPhone(a.phone)}</p>
                  <p>{[a.addressLine, a.area].filter(Boolean).join(", ")}</p>
                  {ZONE_LABELS[a.zone] && <p>{ZONE_LABELS[a.zone]}</p>}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <button type="button" onClick={() => setEditing(a.id)} aria-label="Edit address" className="text-brand-tan hover:text-brand-brown">
                    <Pencil size={14} />
                  </button>
                  <button type="button" onClick={() => removeAddress(a.id)} aria-label="Remove address" className="text-brand-tan hover:text-red-500">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )
          )}
          {editing === "new" && (
            <AddressForm initial={{ name: profile.name, phone: profile.phone, isDefault: addresses.length === 0 }} saving={savingAddress} onSave={saveAddress} onCancel={() => setEditing(null)} />
          )}
        </div>
      </div>

      {/* Change Password */}
      {profile.hasPassword !== false && (
        <div className="bg-white p-8">
          <div className="flex items-center gap-2.5 mb-8 pb-5 border-b border-stone-100">
            <Lock size={14} strokeWidth={1.5} className="text-brand-tan" />
            <span className="text-[10px] uppercase tracking-[2.5px] text-brand-tan">Change Password</span>
          </div>

          <form onSubmit={pwSubmit(onPasswordSubmit)} className="space-y-6 max-w-sm">
            <div>
              <label htmlFor="pw-current" className={labelClass}>Current Password</label>
              <div className="relative">
                <input
                  id="pw-current"
                  type={showCurrent ? "text" : "password"}
                  {...pwRegister("currentPassword", { required: "Required" })}
                  className={`${inputClass} pr-8`}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent((v) => !v)}
                  aria-label={showCurrent ? "Hide password" : "Show password"}
                  className="absolute right-0 top-1/2 -translate-y-1/2 text-brand-tan hover:text-brand-brown transition-colors"
                >
                  {showCurrent ? <EyeOff size={14} strokeWidth={1.5} /> : <Eye size={14} strokeWidth={1.5} />}
                </button>
              </div>
              {pwErrors.currentPassword && (
                <p className="text-red-400 text-[11px] mt-1.5">{pwErrors.currentPassword.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="pw-new" className={labelClass}>New Password</label>
              <div className="relative">
                <input
                  id="pw-new"
                  type={showNew ? "text" : "password"}
                  {...pwRegister("newPassword", {
                    required: "Required",
                    minLength: { value: 8, message: "Min 8 characters" },
                  })}
                  className={`${inputClass} pr-8`}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowNew((v) => !v)}
                  aria-label={showNew ? "Hide password" : "Show password"}
                  className="absolute right-0 top-1/2 -translate-y-1/2 text-brand-tan hover:text-brand-brown transition-colors"
                >
                  {showNew ? <EyeOff size={14} strokeWidth={1.5} /> : <Eye size={14} strokeWidth={1.5} />}
                </button>
              </div>
              {pwErrors.newPassword && (
                <p className="text-red-400 text-[11px] mt-1.5">{pwErrors.newPassword.message}</p>
              )}
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={pwLoading}
                className="bg-brand-brown text-brand-cream text-[11px] uppercase tracking-[2.5px] px-7 py-3 hover:bg-brand-terracotta transition-colors duration-200 disabled:opacity-50"
              >
                {pwLoading ? "Updating…" : "Update Password"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
