"use client";

import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import {
  PackageCheck, Copy, Check, Plug, Wallet, Webhook, Zap, KeyRound, ArrowRight,
} from "lucide-react";
import { PageHeader, Card, Field, TextInput, Toggle, Button, SectionTitle, StatCard } from "@/components/admin/ui";

export default function SteadfastConfigPage() {
  const [cfg, setCfg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [conn, setConn] = useState(null); // { ok, balance } | { ok:false, error }

  const set = (k, v) => setCfg((c) => ({ ...c, [k]: v }));

  useEffect(() => {
    fetch("/api/admin/steadfast")
      .then((r) => r.json())
      .then(setCfg)
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

  return (
    <div>
      <PageHeader
        title="Steadfast Courier"
        subtitle="Order placement API & delivery webhook"
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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
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
          hint="When an order hits processing"
        />
        <StatCard
          label="Connection"
          value={conn ? (conn.ok ? `Tk ${conn.balance ?? 0}` : "Failed") : "Not tested"}
          icon={Wallet}
          accent={conn?.ok ? "text-emerald-600" : conn ? "text-red-600" : ""}
          hint={conn?.ok ? "Current balance" : "Run a test"}
        />
      </div>

      {/* Config grid — fills wide screens */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5 items-start">
        {/* Credentials */}
        <Card className="space-y-4">
          <SectionTitle className="flex items-center gap-2"><KeyRound size={13} /> API Credentials</SectionTitle>
          <div className="flex items-center justify-between rounded-lg bg-brand-cream/50 px-3 py-2.5">
            <div>
              <p className="text-[13px] font-medium text-brand-brown">Enable Steadfast</p>
              <p className="text-[11px] text-brand-tan">Place consignments & receive webhooks</p>
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
                ["Thresholds met", "Auto-moves to processing"],
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
