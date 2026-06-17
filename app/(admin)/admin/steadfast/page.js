"use client";

import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import {
  PackageCheck, Copy, Check, Plug, Wallet, Webhook, Zap, KeyRound, ArrowRight,
  ShieldCheck, Package, Percent, ShieldAlert, Gauge, Info,
} from "lucide-react";
import { PageHeader, Card, Field, TextInput, Toggle, Button, SectionTitle, StatCard, Pill, inputClass } from "@/components/admin/ui";
import { cn } from "@/lib/utils";

const FRAUD_DEFAULTS = {
  autoCheck: true,
  autoProcess: true,
  minDelivery: 10,
  minSuccessfulDelivery: 10,
  minSuccessRate: 0,
  maxFrauds: 0,
};

// A single auto-processing gate — icon + numeric input + unit + hint. Dimmed when
// the parent auto-process flow is off so it reads as "not in effect".
function GateInput({ icon: Icon, label, hint, suffix, value, onChange, max, disabled }) {
  return (
    <div className={cn("rounded-lg border border-brand-tan/20 bg-brand-cream/30 p-3 transition-opacity", disabled && "opacity-50")}>
      <div className="flex items-center gap-2 mb-2">
        <span className="w-6 h-6 rounded-md bg-brand-terracotta/10 text-brand-terracotta flex items-center justify-center flex-shrink-0">
          <Icon size={13} />
        </span>
        <span className="text-[12px] font-medium text-brand-brown leading-tight">{label}</span>
      </div>
      <div className="relative">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={max}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className={cn(inputClass, suffix && "pr-9", "disabled:cursor-not-allowed")}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-medium text-brand-tan pointer-events-none">{suffix}</span>
        )}
      </div>
      <p className="text-[10px] text-brand-tan mt-1.5 leading-snug">{hint}</p>
    </div>
  );
}

// Plain-English summary of the active gates, so the admin can read the rule at a
// glance instead of decoding four numbers.
function gateChips(f) {
  const n = (x) => Number(x) || 0;
  const chips = [];
  if (n(f.minDelivery) > 0) chips.push(`≥ ${n(f.minDelivery)} total parcels`);
  if (n(f.minSuccessfulDelivery) > 0) chips.push(`≥ ${n(f.minSuccessfulDelivery)} delivered`);
  if (n(f.minSuccessRate) > 0) chips.push(`≥ ${n(f.minSuccessRate)}% success rate`);
  chips.push(`≤ ${n(f.maxFrauds)} fraud report${n(f.maxFrauds) === 1 ? "" : "s"}`);
  return chips;
}

export default function SteadfastConfigPage() {
  const [cfg, setCfg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [conn, setConn] = useState(null); // { ok, balance } | { ok:false, error }

  const set = (k, v) => setCfg((c) => ({ ...c, [k]: v }));
  const setF = (k, v) => setCfg((c) => ({ ...c, fraud: { ...c.fraud, [k]: v } }));

  useEffect(() => {
    fetch("/api/admin/steadfast")
      .then((r) => r.json())
      .then((d) => setCfg({ ...d, fraud: { ...FRAUD_DEFAULTS, ...(d.fraud || {}) } }))
      .catch(() => toast.error("Failed to load config"));
    if (typeof window !== "undefined") setWebhookUrl(`${window.location.origin}/api/webhooks/steadfast`);
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/steadfast", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cfg),
      });
      if (res.ok) toast.success("Saved"); else toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    try {
      const res = await fetch("/api/admin/steadfast/test");
      const d = await res.json();
      setConn(d);
      if (d.ok) toast.success(`Connected — balance Tk ${d.balance ?? 0}`);
      else toast.error(d.error || "Connection failed");
    } catch {
      setConn({ ok: false, error: "Connection failed" });
    } finally {
      setTesting(false);
    }
  };

  const copyWebhook = () => {
    navigator.clipboard?.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (!cfg) return <div className="text-brand-tan py-10 text-center">Loading…</div>;

  const f = cfg.fraud;
  const gatesDisabled = !f.autoCheck || !f.autoProcess;

  return (
    <div>
      <PageHeader
        title="Steadfast Courier"
        subtitle="Order placement, fraud screening & delivery webhook"
        icon={PackageCheck}
        actions={
          <>
            <Button variant="outline" onClick={test} disabled={testing}>
              <Plug size={14} /> {testing ? "Testing…" : "Test connection"}
            </Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
          </>
        }
      />

      {/* Status row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <StatCard
          label="Integration"
          value={cfg.enabled ? "Enabled" : "Disabled"}
          icon={PackageCheck}
          accent={cfg.enabled ? "text-emerald-600" : "text-brand-tan"}
          hint={cfg.enabled ? "Placing consignments" : "Turn on to start"}
        />
        <StatCard
          label="Auto-send"
          value={cfg.autoSendOnProcessing ? "On" : "Off"}
          icon={Zap}
          accent={cfg.autoSendOnProcessing ? "text-emerald-600" : "text-brand-tan"}
          hint="When an order hits processing"
        />
        <StatCard
          label="Auto-processing"
          value={f.autoCheck ? (f.autoProcess ? "On" : "Check only") : "Off"}
          icon={ShieldCheck}
          accent={f.autoCheck && f.autoProcess ? "text-emerald-600" : "text-brand-tan"}
          hint={f.autoCheck ? (f.autoProcess ? "Pending → processing" : "Screens, never moves") : "No fraud screening"}
        />
        <StatCard
          label="Connection"
          value={conn ? (conn.ok ? `Tk ${conn.balance ?? 0}` : "Failed") : "Not tested"}
          icon={Wallet}
          accent={conn?.ok ? "text-emerald-600" : conn ? "text-red-600" : ""}
          hint={conn?.ok ? "Current balance" : "Run a test"}
        />
      </div>

      {/* Fraud screening + auto-processing — the prominent control */}
      <Card className="mb-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-9 h-9 rounded-lg bg-brand-terracotta/10 text-brand-terracotta flex items-center justify-center flex-shrink-0">
            <ShieldCheck size={18} />
          </div>
          <div className="min-w-0">
            <h2 className="text-[14px] font-semibold text-brand-brown leading-tight">Fraud Check &amp; Auto-Processing</h2>
            <p className="text-[12px] text-brand-tan mt-0.5">
              New orders stay <b className="text-brand-brown">Pending</b> until the customer&apos;s Steadfast courier history clears every gate below — then they auto-move to <b className="text-brand-brown">Processing</b>.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 items-start">
          {/* Toggles */}
          <div className="lg:col-span-2 space-y-3">
            <div className="flex items-center justify-between gap-4 rounded-lg bg-brand-cream/50 px-3 py-3">
              <div>
                <p className="text-[13px] font-medium text-brand-brown">Auto fraud check</p>
                <p className="text-[11px] text-brand-tan">Look up each new order&apos;s phone on Steadfast</p>
              </div>
              <Toggle checked={f.autoCheck} onChange={(v) => setF("autoCheck", v)} />
            </div>
            <div className={cn("flex items-center justify-between gap-4 rounded-lg bg-brand-cream/50 px-3 py-3 transition-opacity", !f.autoCheck && "opacity-50")}>
              <div>
                <p className="text-[13px] font-medium text-brand-brown">Auto-move to Processing</p>
                <p className="text-[11px] text-brand-tan">Only when every gate passes — otherwise stays Pending for review</p>
              </div>
              <Toggle checked={f.autoProcess} onChange={(v) => setF("autoProcess", v)} disabled={!f.autoCheck} />
            </div>

            {/* Live rule summary */}
            <div className="rounded-lg border border-brand-tan/20 bg-white px-3 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-tan mb-2 flex items-center gap-1.5">
                <Gauge size={12} /> Auto-process when
              </p>
              {gatesDisabled ? (
                <p className="text-[12px] text-brand-tan">
                  {!f.autoCheck ? "Fraud checking is off — orders won’t be screened." : "Auto-move is off — orders are screened but stay Pending for manual review."}
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {gateChips(f).map((c, i, arr) => (
                    <Pill key={i} tone={i === arr.length - 1 ? "terracotta" : "green"}>{c}</Pill>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Gates */}
          <div className="lg:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <GateInput
              icon={Package}
              label="Min total deliveries"
              suffix="pcs"
              hint="Total parcels in courier history. 0 = ignore."
              value={f.minDelivery}
              onChange={(v) => setF("minDelivery", v)}
              disabled={gatesDisabled}
            />
            <GateInput
              icon={PackageCheck}
              label="Min successful deliveries"
              suffix="pcs"
              hint="Delivered parcels required. 0 = ignore."
              value={f.minSuccessfulDelivery}
              onChange={(v) => setF("minSuccessfulDelivery", v)}
              disabled={gatesDisabled}
            />
            <GateInput
              icon={Percent}
              label="Min success rate"
              suffix="%"
              hint="Delivered ÷ total parcels. 0 = ignore."
              value={f.minSuccessRate}
              onChange={(v) => setF("minSuccessRate", v)}
              max={100}
              disabled={gatesDisabled}
            />
            <GateInput
              icon={ShieldAlert}
              label="Max fraud reports"
              hint="Block above this count. 0 = zero tolerance."
              value={f.maxFrauds}
              onChange={(v) => setF("maxFrauds", v)}
              disabled={gatesDisabled}
            />
          </div>
        </div>

        <p className="text-[11px] text-brand-tan mt-4 flex items-center gap-1.5">
          <Info size={12} className="text-brand-terracotta flex-shrink-0" />
          Manage Steadfast login accounts on the{" "}
          <a href="/admin/frauds" className="text-brand-terracotta underline">Fraud Check</a> page.
        </p>
      </Card>

      {/* Config grid — fills wide screens */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5 items-start">
        {/* Credentials */}
        <Card className="space-y-4">
          <SectionTitle className="flex items-center gap-2"><KeyRound size={13} /> API Credentials</SectionTitle>
          <div className="flex items-center justify-between rounded-lg bg-brand-cream/50 px-3 py-2.5">
            <div>
              <p className="text-[13px] font-medium text-brand-brown">Enable Steadfast</p>
              <p className="text-[11px] text-brand-tan">Place consignments &amp; receive webhooks</p>
            </div>
            <Toggle checked={cfg.enabled} onChange={(v) => set("enabled", v)} />
          </div>
          <Field label="API Key">
            <TextInput value={cfg.apiKey} onChange={(e) => set("apiKey", e.target.value)} placeholder="Api-Key from the portal" />
          </Field>
          <Field label="Secret Key" hint={cfg.hasSecret ? "A secret is saved — leave masked to keep it." : "From the Steadfast portal"}>
            <TextInput type="password" value={cfg.secretKey} onChange={(e) => set("secretKey", e.target.value)} placeholder="Secret-Key" />
          </Field>
          <Field label="Base URL">
            <TextInput value={cfg.baseUrl} onChange={(e) => set("baseUrl", e.target.value)} />
          </Field>
        </Card>

        {/* Automation + flow */}
        <div className="space-y-5">
          <Card className="space-y-3">
            <SectionTitle className="flex items-center gap-2"><Zap size={13} /> Automation</SectionTitle>
            <div className="flex items-center justify-between rounded-lg bg-brand-cream/50 px-3 py-2.5">
              <div>
                <p className="text-[13px] font-medium text-brand-brown">Auto-send on “processing”</p>
                <p className="text-[11px] text-brand-tan">Create the consignment automatically</p>
              </div>
              <Toggle checked={cfg.autoSendOnProcessing} onChange={(v) => set("autoSendOnProcessing", v)} />
            </div>
          </Card>

          <Card>
            <SectionTitle>How it flows</SectionTitle>
            <ol className="space-y-2.5 mt-1">
              {[
                ["Order placed", "Stays pending while the fraud check runs"],
                ["Gates pass", "Auto-moves to processing"],
                ["Sent to courier", "Consignment created (in review)"],
                ["Webhook updates", "pending → shipped, then delivered"],
              ].map(([t, d], i) => (
                <li key={t} className="flex gap-3">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-brand-terracotta/10 text-brand-terracotta text-[10px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                  <div>
                    <p className="text-[12px] font-medium text-brand-brown leading-tight">{t}</p>
                    <p className="text-[11px] text-brand-tan">{d}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        {/* Webhook */}
        <Card className="space-y-4">
          <SectionTitle className="flex items-center gap-2"><Webhook size={13} /> Webhook</SectionTitle>
          <p className="text-[12px] text-brand-tan">
            Paste this URL into the Steadfast portal’s webhook settings. We update each order’s
            status automatically.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-[12px] bg-brand-cream/70 border border-brand-tan/20 rounded-lg px-3 py-2 text-brand-brown break-all">{webhookUrl}</code>
            <Button variant="outline" size="icon" onClick={copyWebhook} title="Copy">
              {copied ? <Check size={15} /> : <Copy size={15} />}
            </Button>
          </div>
          <Field label="Webhook token" hint="Verified against the Authorization: Bearer header. Blank = use the API Key.">
            <TextInput value={cfg.webhookToken} onChange={(e) => set("webhookToken", e.target.value)} placeholder="(optional) custom bearer token" />
          </Field>
          <div className="flex items-center gap-2 text-[11px] text-brand-tan bg-brand-cream/40 rounded-lg px-3 py-2">
            <ArrowRight size={12} className="text-brand-terracotta" />
            Their <b className="mx-1">pending</b> means parcel received → we set <b className="ml-1">shipped</b>.
          </div>
        </Card>
      </div>
    </div>
  );
}
