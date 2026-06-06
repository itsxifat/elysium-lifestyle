"use client";

import { useState, useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import toast from "react-hot-toast";
import { Globe, Share2, CreditCard, Mail, AlertCircle, Megaphone, Tag, MessageSquare, Plus, Trash2, Settings, ShieldAlert } from "lucide-react";
import Input from "@/components/ui/Input";
import { PageHeader, Button, Toggle } from "@/components/admin/ui";

function SectionCard({ icon: Icon, title, description, children }) {
  return (
    <div className="bg-white border border-brand-tan/15 rounded-xl shadow-[0_1px_3px_rgba(44,24,16,0.04)]">
      <div className="flex items-start gap-4 px-6 py-5 border-b border-brand-tan/10">
        <div className="w-9 h-9 bg-brand-cream flex items-center justify-center flex-shrink-0 mt-0.5">
          <Icon size={16} className="text-brand-tan" strokeWidth={1.5} />
        </div>
        <div>
          <h2 className="text-[12px] font-semibold text-brand-brown uppercase tracking-wider">{title}</h2>
          {description && <p className="text-[11px] text-brand-tan mt-0.5">{description}</p>}
        </div>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  );
}

function FieldLabel({ children }) {
  return <label className="block text-[10px] uppercase tracking-widest text-brand-tan mb-1.5">{children}</label>;
}

function RawInput({ className = "", ...props }) {
  return (
    <input
      className={`w-full rounded-lg border border-brand-tan/30 bg-transparent px-3 py-2 text-sm text-brand-brown focus:outline-none focus:border-brand-brown transition-colors ${className}`}
      {...props}
    />
  );
}

export default function AdminSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testEmailLoading, setTestEmailLoading] = useState(false);
  const [sslEnabled, setSslEnabled] = useState(false);
  const [codEnabled, setCodEnabled] = useState(true);
  const [announcementEnabled, setAnnouncementEnabled] = useState(true);
  const [promoBannerEnabled, setPromoBannerEnabled] = useState(false);
  const [fraudAutoCheck, setFraudAutoCheck] = useState(true);
  const [fraudAutoProcess, setFraudAutoProcess] = useState(true);

  const { register, handleSubmit, reset, getValues, control } = useForm({
    defaultValues: { testimonials: [] },
  });

  const { fields: testimonialFields, append: appendTestimonial, remove: removeTestimonial } = useFieldArray({
    control,
    name: "testimonials",
  });

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((data) => {
        setSslEnabled(data.paymentGateways?.sslcommerz?.enabled || false);
        setCodEnabled(data.paymentGateways?.cod?.enabled ?? true);
        setAnnouncementEnabled(data.announcementBar?.enabled ?? true);
        setPromoBannerEnabled(data.promoBanner?.enabled ?? false);
        setFraudAutoCheck(data.fraud?.autoCheck ?? true);
        setFraudAutoProcess(data.fraud?.autoProcess ?? true);
        reset({
          fraudMinDelivery: data.fraud?.minDelivery ?? 10,
          fraudMinSuccessful: data.fraud?.minSuccessfulDelivery ?? 10,
          siteName: data.siteInfo?.siteName || "",
          whatsappNumber: data.siteInfo?.whatsappNumber || "",
          freeShippingThreshold: data.siteInfo?.freeShippingThreshold || 1500,
          shippingFee: data.siteInfo?.shippingFee || 80,
          email: data.siteInfo?.email || "",
          address: data.siteInfo?.address || "",
          facebook: data.socialLinks?.facebook || "",
          instagram: data.socialLinks?.instagram || "",
          tiktok: data.socialLinks?.tiktok || "",
          storeId: data.paymentGateways?.sslcommerz?.storeId || "",
          storePassword: "",
          isLive: data.paymentGateways?.sslcommerz?.isLive || false,
          smtpHost: data.emailSettings?.smtpHost || "",
          smtpPort: data.emailSettings?.smtpPort || 587,
          smtpUser: data.emailSettings?.smtpUser || "",
          smtpPass: "",
          fromName: data.emailSettings?.fromName || "Elysium Lifestyle",
          fromEmail: data.emailSettings?.fromEmail || "",
          testEmailTo: "",
          announcementText: data.announcementBar?.text ?? "Free shipping on orders over Tk 1500 · Cash on Delivery Available",
          announcementLink: data.announcementBar?.link || "",
          promoBannerHeadline: data.promoBanner?.headline || "Season Sale.",
          promoBannerSubtext: data.promoBanner?.subtext || "Up to 40% off selected styles. Refresh your wardrobe with our finest pieces at unbeatable prices.",
          promoBannerNote: data.promoBanner?.note || "+ Free shipping on all sale orders",
          promoBannerDecorativeText: data.promoBanner?.decorativeText || "40%",
          promoBannerPrimaryLabel: data.promoBanner?.primaryLabel || "Shop the Sale",
          promoBannerPrimaryHref: data.promoBanner?.primaryHref || "/shop?onSale=true",
          promoBannerSecondaryLabel: data.promoBanner?.secondaryLabel || "All Collections",
          promoBannerSecondaryHref: data.promoBanner?.secondaryHref || "/shop",
          testimonials: (data.testimonials || []).map((t) => ({
            name: t.name || "",
            location: t.location || "",
            rating: t.rating ?? 5,
            text: t.text || "",
          })),
        });
      })
      .catch(() => toast.error("Failed to load settings"))
      .finally(() => setLoading(false));
  }, []);

  const onSubmit = async (data) => {
    setSaving(true);
    try {
      const payload = {
        fraud: {
          autoCheck: fraudAutoCheck,
          autoProcess: fraudAutoProcess,
          minDelivery: Number(data.fraudMinDelivery) || 0,
          minSuccessfulDelivery: Number(data.fraudMinSuccessful) || 0,
        },
        announcementBar: {
          enabled: announcementEnabled,
          text: data.announcementText,
          link: data.announcementLink || "",
        },
        promoBanner: {
          enabled: promoBannerEnabled,
          headline: data.promoBannerHeadline,
          subtext: data.promoBannerSubtext,
          note: data.promoBannerNote,
          decorativeText: data.promoBannerDecorativeText,
          primaryLabel: data.promoBannerPrimaryLabel,
          primaryHref: data.promoBannerPrimaryHref,
          secondaryLabel: data.promoBannerSecondaryLabel,
          secondaryHref: data.promoBannerSecondaryHref,
        },
        testimonials: (data.testimonials || []).map((t, i) => ({
          name: t.name,
          location: t.location,
          rating: Number(t.rating) || 5,
          text: t.text,
          sortOrder: i,
        })),
        siteInfo: {
          siteName: data.siteName,
          whatsappNumber: data.whatsappNumber,
          freeShippingThreshold: Number(data.freeShippingThreshold),
          shippingFee: Number(data.shippingFee),
          email: data.email,
          address: data.address,
        },
        socialLinks: { facebook: data.facebook, instagram: data.instagram, tiktok: data.tiktok },
        paymentGateways: {
          cod: { enabled: codEnabled },
          sslcommerz: {
            enabled: sslEnabled,
            storeId: data.storeId,
            ...(data.storePassword ? { storePassword: data.storePassword } : {}),
            isLive: data.isLive === "true" || data.isLive === true,
          },
        },
        emailSettings: {
          smtpHost: data.smtpHost,
          smtpPort: Number(data.smtpPort),
          smtpUser: data.smtpUser,
          ...(data.smtpPass ? { smtpPass: data.smtpPass } : {}),
          fromName: data.fromName,
          fromEmail: data.fromEmail,
        },
      };

      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) toast.success("Settings saved!");
      else toast.error("Failed to save");
    } catch {
      toast.error("Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  const sendTestEmail = async () => {
    const to = getValues("testEmailTo");
    if (!to) { toast.error("Enter a recipient email first"); return; }
    setTestEmailLoading(true);
    try {
      const res = await fetch("/api/admin/email/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to }),
      });
      const data = await res.json();
      if (res.ok) toast.success(data.message || "Test email sent!");
      else toast.error(data.error || "Failed to send test email");
    } catch {
      toast.error("Something went wrong");
    } finally {
      setTestEmailLoading(false);
    }
  };

  if (loading) return <div className="text-brand-tan py-10">Loading settings…</div>;

  return (
    <div>
      <PageHeader
        icon={Settings}
        title="Settings"
        subtitle="Configure your store, payments, and email"
        actions={
          <Button type="button" onClick={handleSubmit(onSubmit)} disabled={saving}>
            {saving ? "Saving…" : "Save All"}
          </Button>
        }
      />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 max-w-2xl">

        {/* Announcement Bar */}
        <SectionCard icon={Megaphone} title="Announcement Bar" description="The bold bar shown at the very top of every page">
          <div className="space-y-4">
            <div>
              <FieldLabel>Announcement Text</FieldLabel>
              <RawInput {...register("announcementText")} placeholder="e.g. Free shipping on orders over Tk 1500 · New arrivals every week" />
            </div>
            <div>
              <FieldLabel>Link URL <span className="normal-case text-brand-tan/60">(optional — makes bar clickable)</span></FieldLabel>
              <RawInput {...register("announcementLink")} className="font-mono" placeholder="/shop or https://..." />
            </div>
            <div className="flex items-center justify-between py-2 border-t border-brand-tan/10">
              <div>
                <p className="text-[12px] font-medium text-brand-brown">Show Announcement Bar</p>
                <p className="text-[10px] text-brand-tan">Uncheck to hide it sitewide</p>
              </div>
              <Toggle checked={announcementEnabled} onChange={setAnnouncementEnabled} />
            </div>
          </div>
        </SectionCard>

        {/* Promo Banner */}
        <SectionCard icon={Tag} title="Promo Banner" description="Full-width dark sale banner shown on the homepage between featured products and new arrivals">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldLabel>Headline <span className="normal-case text-brand-tan/60">(last word is highlighted in terracotta)</span></FieldLabel>
                <RawInput {...register("promoBannerHeadline")} placeholder="Season Sale." />
              </div>
              <div>
                <FieldLabel>Decorative background text</FieldLabel>
                <RawInput {...register("promoBannerDecorativeText")} placeholder="40%" />
              </div>
            </div>
            <div>
              <FieldLabel>Subtext paragraph</FieldLabel>
              <textarea
                {...register("promoBannerSubtext")}
                rows={2}
                className="w-full rounded-lg border border-brand-tan/30 bg-transparent px-3 py-2 text-sm text-brand-brown focus:outline-none focus:border-brand-brown transition-colors resize-none"
                placeholder="Up to 40% off selected styles…"
              />
            </div>
            <div>
              <FieldLabel>Small note below subtext</FieldLabel>
              <RawInput {...register("promoBannerNote")} placeholder="+ Free shipping on all sale orders" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldLabel>Primary button label</FieldLabel>
                <RawInput {...register("promoBannerPrimaryLabel")} placeholder="Shop the Sale" />
              </div>
              <div>
                <FieldLabel>Primary button link</FieldLabel>
                <RawInput {...register("promoBannerPrimaryHref")} className="font-mono" placeholder="/shop?onSale=true" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldLabel>Secondary button label</FieldLabel>
                <RawInput {...register("promoBannerSecondaryLabel")} placeholder="All Collections" />
              </div>
              <div>
                <FieldLabel>Secondary button link</FieldLabel>
                <RawInput {...register("promoBannerSecondaryHref")} className="font-mono" placeholder="/shop" />
              </div>
            </div>
            <div className="flex items-center justify-between py-2 border-t border-brand-tan/10">
              <div>
                <p className="text-[12px] font-medium text-brand-brown">Show Promo Banner</p>
                <p className="text-[10px] text-brand-tan">Enable to display the dark sale banner on homepage</p>
              </div>
              <Toggle checked={promoBannerEnabled} onChange={setPromoBannerEnabled} />
            </div>
          </div>
        </SectionCard>

        {/* Testimonials */}
        <SectionCard icon={MessageSquare} title="Customer Testimonials" description="Reviews shown in the homepage carousel. Leave empty to hide the section.">
          <div className="space-y-3">
            {testimonialFields.map((field, index) => (
              <div key={field.id} className="border border-brand-tan/15 rounded-xl shadow-[0_1px_3px_rgba(44,24,16,0.04)] p-4 space-y-3 relative">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] uppercase tracking-widest text-brand-tan font-medium">Review #{index + 1}</p>
                  <button
                    type="button"
                    onClick={() => removeTestimonial(index)}
                    className="text-brand-tan/50 hover:text-red-500 transition-colors p-1"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <FieldLabel>Name</FieldLabel>
                    <RawInput {...register(`testimonials.${index}.name`)} placeholder="Tasnim Rahman" />
                  </div>
                  <div>
                    <FieldLabel>Location</FieldLabel>
                    <RawInput {...register(`testimonials.${index}.location`)} placeholder="Dhaka" />
                  </div>
                </div>
                <div>
                  <FieldLabel>Rating (1–5)</FieldLabel>
                  <select
                    {...register(`testimonials.${index}.rating`)}
                    className="rounded-lg border border-brand-tan/30 bg-transparent px-3 py-2 text-sm text-brand-brown focus:outline-none focus:border-brand-brown transition-colors"
                  >
                    {[5, 4, 3, 2, 1].map((n) => (
                      <option key={n} value={n}>{n} star{n !== 1 ? "s" : ""}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <FieldLabel>Review text</FieldLabel>
                  <textarea
                    {...register(`testimonials.${index}.text`)}
                    rows={3}
                    className="w-full rounded-lg border border-brand-tan/30 bg-transparent px-3 py-2 text-sm text-brand-brown focus:outline-none focus:border-brand-brown transition-colors resize-none"
                    placeholder="Share your experience…"
                  />
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={() => appendTestimonial({ name: "", location: "", rating: 5, text: "" })}
              className="w-full flex items-center justify-center gap-2 border border-dashed border-brand-tan/40 py-3 text-[11px] uppercase tracking-[2px] text-brand-tan hover:border-brand-tan hover:text-brand-brown transition-colors"
            >
              <Plus size={14} />
              Add Testimonial
            </button>

            {testimonialFields.length === 0 && (
              <p className="text-[11px] text-brand-tan/60 text-center py-1">No testimonials added — the section will be hidden on the homepage.</p>
            )}
          </div>
        </SectionCard>

        {/* Site Info */}
        <SectionCard icon={Globe} title="Site Information" description="Basic store details visible to customers">
          <div className="space-y-4">
            <Input label="Site Name" {...register("siteName")} />
            <div className="grid grid-cols-2 gap-4">
              <Input label="Contact Email" type="email" {...register("email")} />
              <Input label="WhatsApp Number" {...register("whatsappNumber")} placeholder="8801700000000" />
            </div>
            <Input label="Business Address" {...register("address")} />
            <div className="grid grid-cols-2 gap-4">
              <Input label="Free Shipping Threshold (Tk)" type="number" {...register("freeShippingThreshold")} />
              <Input label="Standard Shipping Fee (Tk)" type="number" {...register("shippingFee")} />
            </div>
          </div>
        </SectionCard>

        {/* Social Media */}
        <SectionCard icon={Share2} title="Social Media" description="Links shown in the footer">
          <div className="space-y-4">
            <Input label="Facebook URL" {...register("facebook")} placeholder="https://facebook.com/elysiumlifestyle" />
            <Input label="Instagram URL" {...register("instagram")} placeholder="https://instagram.com/elysiumlifestyle" />
            <Input label="TikTok URL" {...register("tiktok")} placeholder="https://tiktok.com/@elysiumlifestyle" />
          </div>
        </SectionCard>

        {/* Payment Gateways */}
        <SectionCard icon={CreditCard} title="Payment Gateways" description="Control which payment methods customers can use at checkout">
          <div className="space-y-3">
            <div className="flex items-center justify-between p-4 border border-brand-tan/15 rounded-xl shadow-[0_1px_3px_rgba(44,24,16,0.04)] rounded-sm">
              <div>
                <p className="text-[13px] font-medium text-brand-brown">Cash on Delivery</p>
                <p className="text-[11px] text-brand-tan mt-0.5">Customer pays when the order arrives</p>
              </div>
              <Toggle checked={codEnabled} onChange={setCodEnabled} />
            </div>

            <div className="border border-brand-tan/15 rounded-xl shadow-[0_1px_3px_rgba(44,24,16,0.04)] rounded-sm">
              <div className="flex items-center justify-between p-4">
                <div>
                  <p className="text-[13px] font-medium text-brand-brown">SSLCommerz · bKash · Cards</p>
                  <p className="text-[11px] text-brand-tan mt-0.5">Online payment via SSLCommerz gateway</p>
                </div>
                <Toggle checked={sslEnabled} onChange={setSslEnabled} />
              </div>

              {sslEnabled && (
                <div className="border-t border-brand-tan/10 px-4 pb-4 space-y-3">
                  <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 p-3 mt-3">
                    <AlertCircle size={14} className="text-amber-600 flex-shrink-0 mt-0.5" strokeWidth={1.5} />
                    <p className="text-[11px] text-amber-700">SSLCommerz requires a public callback URL. Use ngrok or similar during development.</p>
                  </div>
                  <Input label="Store ID" {...register("storeId")} />
                  <Input label="Store Password" type="password" {...register("storePassword")} placeholder="Leave blank to keep existing" />
                  <label className="flex items-center gap-2.5 cursor-pointer mt-1">
                    <input type="checkbox" value="true" {...register("isLive")} className="accent-brand-terracotta w-4 h-4" />
                    <span className="text-[12px] text-brand-brown">Live mode <span className="text-brand-tan">(uncheck for sandbox/testing)</span></span>
                  </label>
                </div>
              )}
            </div>
          </div>
        </SectionCard>

        {/* Email / SMTP */}
        <SectionCard icon={Mail} title="Email Settings (SMTP)" description="Used for order confirmations, password resets, and status update emails">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input label="SMTP Host" {...register("smtpHost")} placeholder="smtp.gmail.com" />
              <Input label="SMTP Port" type="number" {...register("smtpPort")} placeholder="587" />
            </div>
            <Input label="SMTP Username / Email" {...register("smtpUser")} placeholder="you@gmail.com" />
            <Input label="SMTP Password / App Password" type="password" {...register("smtpPass")} placeholder="Leave blank to keep existing" />
            <div className="grid grid-cols-2 gap-4">
              <Input label="From Name" {...register("fromName")} placeholder="Elysium Lifestyle" />
              <Input label="From Email" type="email" {...register("fromEmail")} placeholder="noreply@elysiumlifestyle.com" />
            </div>

            <div className="border-t border-brand-tan/10 pt-4">
              <p className="text-[10px] uppercase tracking-[2px] text-brand-tan mb-3 font-medium">Send Test Email</p>
              <div className="flex gap-3">
                <input
                  {...register("testEmailTo")}
                  type="email"
                  placeholder="recipient@example.com"
                  className="flex-1 rounded-lg border border-brand-tan/30 bg-transparent px-3 py-2.5 text-sm text-brand-brown focus:outline-none focus:border-brand-brown transition-colors"
                />
                <Button type="button" variant="outline" onClick={sendTestEmail} disabled={testEmailLoading} className="whitespace-nowrap">
                  {testEmailLoading ? "Sending…" : "Send Test"}
                </Button>
              </div>
              <p className="text-[10px] text-brand-tan/60 mt-2">Save your settings before sending a test email</p>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          icon={ShieldAlert}
          title="Fraud Check & Auto-Processing"
          description="New orders stay Pending until the customer's Steadfast courier history clears these thresholds — then they auto-move to Processing."
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[13px] font-medium text-brand-brown">Auto fraud check on new orders</p>
                <p className="text-[11px] text-brand-tan">Looks up the order&apos;s phone on Steadfast automatically</p>
              </div>
              <Toggle checked={fraudAutoCheck} onChange={setFraudAutoCheck} />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[13px] font-medium text-brand-brown">Auto-move to Processing</p>
                <p className="text-[11px] text-brand-tan">When both thresholds below are met; otherwise stays Pending</p>
              </div>
              <Toggle checked={fraudAutoProcess} onChange={setFraudAutoProcess} />
            </div>
            <div className="grid sm:grid-cols-2 gap-4 pt-1">
              <div>
                <FieldLabel>Min total deliveries</FieldLabel>
                <RawInput type="number" min="0" {...register("fraudMinDelivery")} />
              </div>
              <div>
                <FieldLabel>Min successful deliveries</FieldLabel>
                <RawInput type="number" min="0" {...register("fraudMinSuccessful")} />
              </div>
            </div>
            <p className="text-[11px] text-brand-tan">
              Manage Steadfast accounts on the{" "}
              <a href="/admin/frauds" className="text-brand-terracotta underline">Fraud Check</a> page.
            </p>
          </div>
        </SectionCard>

        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save All Settings"}
        </Button>
      </form>
    </div>
  );
}
