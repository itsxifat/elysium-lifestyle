"use client";

import { useSession } from "next-auth/react";
import { useForm } from "react-hook-form";
import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { Eye, EyeOff, UserCircle, Lock } from "lucide-react";
import AvatarUpload from "@/components/account/AvatarUpload";

export default function AccountPage() {
  const { data: session, update: updateSession } = useSession();
  const [loading, setLoading] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [profileLoaded, setProfileLoaded] = useState(false);

  const { register, handleSubmit, formState: { errors }, reset } = useForm();
  const { register: pwRegister, handleSubmit: pwSubmit, formState: { errors: pwErrors }, reset: pwReset } = useForm();

  useEffect(() => {
    if (!session?.user?.id) return;
    fetch("/api/account/profile")
      .then((r) => r.json())
      .then((data) => {
        setAvatarUrl(data.image || null);
        reset({
          name: data.name || "",
          phone: data.phone || "",
          street: data.address?.street || "",
          city: data.address?.city || "",
          postalCode: data.address?.postalCode || "",
        });
        setProfileLoaded(true);
      })
      .catch(() => setProfileLoaded(true));
  }, [session?.user?.id, reset]);

  const handleAvatarUpdate = async (url) => {
    setAvatarUrl(url);
    await updateSession();
  };

  const onProfileSubmit = async (data) => {
    setLoading(true);
    try {
      const res = await fetch("/api/account/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          phone: data.phone,
          address: { street: data.street, city: data.city, postalCode: data.postalCode },
        }),
      });
      if (res.ok) { toast.success("Profile updated"); await updateSession(); }
      else toast.error("Failed to update");
    } catch { toast.error("Something went wrong"); }
    finally { setLoading(false); }
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

  if (!profileLoaded) {
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

  const inputClass =
    "w-full bg-transparent border-0 border-b border-stone-200 px-0 py-2.5 text-[13px] text-brand-brown placeholder-stone-300 focus:outline-none focus:border-brand-brown transition-colors duration-200";
  const labelClass = "block text-[10px] uppercase tracking-[2px] text-brand-tan mb-1.5";

  return (
    <div className="space-y-4">
      {/* Personal Info */}
      <div className="bg-white p-8">
        <div className="flex items-center gap-2.5 mb-8 pb-5 border-b border-stone-100">
          <UserCircle size={14} strokeWidth={1.5} className="text-brand-tan" />
          <span className="text-[10px] uppercase tracking-[2.5px] text-brand-tan">Personal Info</span>
        </div>

        <div className="flex items-center gap-5 mb-8">
          <AvatarUpload
            currentImage={avatarUrl}
            name={session?.user?.name}
            onUpdate={handleAvatarUpdate}
          />
          <div>
            <p className="font-semibold text-brand-brown">{session?.user?.name}</p>
            <p className="text-[12px] text-brand-tan mt-0.5">{session?.user?.email}</p>
            <p className="text-[11px] text-stone-300 mt-2">Click photo to update</p>
          </div>
        </div>

        <form onSubmit={handleSubmit(onProfileSubmit)} className="space-y-6 max-w-lg">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label className={labelClass}>Full Name</label>
              <input {...register("name", { required: true })} className={inputClass} />
              {errors.name && <p className="text-red-400 text-[11px] mt-1.5">Required</p>}
            </div>
            <div>
              <label className={labelClass}>Email</label>
              <input
                value={session?.user?.email || ""}
                disabled
                className={`${inputClass} opacity-40 cursor-not-allowed`}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Phone</label>
            <input {...register("phone")} className={inputClass} placeholder="01700000000" />
          </div>

          <div>
            <label className={labelClass}>Street Address</label>
            <input {...register("street")} className={inputClass} placeholder="House, Road, Area" />
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className={labelClass}>City</label>
              <input {...register("city")} className={inputClass} placeholder="Dhaka" />
            </div>
            <div>
              <label className={labelClass}>Postal Code</label>
              <input {...register("postalCode")} className={inputClass} placeholder="1212" />
            </div>
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

      {/* Change Password */}
      <div className="bg-white p-8">
        <div className="flex items-center gap-2.5 mb-8 pb-5 border-b border-stone-100">
          <Lock size={14} strokeWidth={1.5} className="text-brand-tan" />
          <span className="text-[10px] uppercase tracking-[2.5px] text-brand-tan">Change Password</span>
        </div>

        <form onSubmit={pwSubmit(onPasswordSubmit)} className="space-y-6 max-w-sm">
          <div>
            <label className={labelClass}>Current Password</label>
            <div className="relative">
              <input
                type={showCurrent ? "text" : "password"}
                {...pwRegister("currentPassword", { required: "Required" })}
                className={`${inputClass} pr-8`}
              />
              <button
                type="button"
                onClick={() => setShowCurrent((v) => !v)}
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
            <label className={labelClass}>New Password</label>
            <div className="relative">
              <input
                type={showNew ? "text" : "password"}
                {...pwRegister("newPassword", {
                  required: "Required",
                  minLength: { value: 6, message: "Min 6 characters" },
                })}
                className={`${inputClass} pr-8`}
                placeholder="At least 6 characters"
              />
              <button
                type="button"
                onClick={() => setShowNew((v) => !v)}
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
    </div>
  );
}
