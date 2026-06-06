"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Toggle, Field, TextInput, JsonViewer, Spinner, StatusBadge } from "./ui";

export default function ConfigPanel() {
  const [config, setConfig] = useState(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [testEvent, setTestEvent] = useState("Purchase");

  useEffect(() => {
    fetch("/api/admin/tracking/config")
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => toast.error("Failed to load config"));
  }, []);

  if (!config) return <Spinner label="Loading configuration…" />;

  const set = (path, value) => {
    setConfig((prev) => {
      const next = structuredClone(prev);
      let o = next;
      const parts = path.split(".");
      for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
      o[parts[parts.length - 1]] = value;
      return next;
    });
  };

  const setEvent = (name, key, value) => {
    setConfig((prev) => {
      const next = structuredClone(prev);
      const ev = next.events.find((e) => e.name === name);
      if (ev) ev[key] = value;
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/tracking/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setConfig(data);
      toast.success("Configuration saved");
    } catch (e) {
      toast.error(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const fireTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/admin/tracking/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventName: testEvent }),
      });
      const data = await res.json();
      setTestResult(data);
      toast.success("Test event fired");
    } catch {
      toast.error("Test failed");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Platform cards */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Meta */}
        <section className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
          <h3 className="font-semibold text-brand-brown flex items-center justify-between">
            Meta (Facebook)
            <span className="text-[10px] font-normal text-gray-400">Pixel + Conversions API</span>
          </h3>
          <ToggleRow label="Browser Pixel" desc="Client-side fbq events" checked={config.meta.pixelEnabled} onChange={(v) => set("meta.pixelEnabled", v)} />
          <ToggleRow label="Conversions API (server)" desc="Unblockable server events" checked={config.meta.capiEnabled} onChange={(v) => set("meta.capiEnabled", v)} />
          <Field label="Pixel ID">
            <TextInput value={config.meta.pixelId} onChange={(e) => set("meta.pixelId", e.target.value)} placeholder="123456789012345" />
          </Field>
          <Field label="CAPI Access Token" hint="Stored encrypted-at-rest in Mongo; masked here.">
            <TextInput type="password" value={config.meta.accessToken} onChange={(e) => set("meta.accessToken", e.target.value)} placeholder="EAAB…" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Test Event Code">
              <TextInput value={config.meta.testEventCode} onChange={(e) => set("meta.testEventCode", e.target.value)} placeholder="TEST12345" />
            </Field>
            <Field label="API Version">
              <TextInput value={config.meta.apiVersion} onChange={(e) => set("meta.apiVersion", e.target.value)} placeholder="v21.0" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Dataset ID" hint="Optional; defaults to Pixel ID">
              <TextInput value={config.meta.datasetId} onChange={(e) => set("meta.datasetId", e.target.value)} placeholder="(optional)" />
            </Field>
            <Field label="Default Country Code" hint="For phone E.164">
              <TextInput value={config.meta.defaultCountryCode} onChange={(e) => set("meta.defaultCountryCode", e.target.value)} placeholder="880" />
            </Field>
          </div>
        </section>

        {/* GA4 */}
        <section className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
          <h3 className="font-semibold text-brand-brown flex items-center justify-between">
            Google Analytics 4
            <span className="text-[10px] font-normal text-gray-400">gtag + Measurement Protocol</span>
          </h3>
          <ToggleRow label="Browser gtag.js" desc="Client-side GA events" checked={config.ga4.clientEnabled} onChange={(v) => set("ga4.clientEnabled", v)} />
          <ToggleRow label="Measurement Protocol (server)" desc="Server events" checked={config.ga4.mpEnabled} onChange={(v) => set("ga4.mpEnabled", v)} />
          <Field label="Measurement ID">
            <TextInput value={config.ga4.measurementId} onChange={(e) => set("ga4.measurementId", e.target.value)} placeholder="G-XXXXXXXXXX" />
          </Field>
          <Field label="API Secret" hint="Masked. From GA4 Admin → Data Streams → MP API secrets.">
            <TextInput type="password" value={config.ga4.apiSecret} onChange={(e) => set("ga4.apiSecret", e.target.value)} placeholder="••••" />
          </Field>
          <div className="pt-2 border-t border-gray-100">
            <p className="text-[12px] font-medium text-gray-600 mb-2">First-party proxy paths</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Meta script"><TextInput value={config.proxy.metaScriptPath} onChange={(e) => set("proxy.metaScriptPath", e.target.value)} /></Field>
              <Field label="Meta collect"><TextInput value={config.proxy.metaCollectPath} onChange={(e) => set("proxy.metaCollectPath", e.target.value)} /></Field>
              <Field label="GA4 script"><TextInput value={config.proxy.ga4ScriptPath} onChange={(e) => set("proxy.ga4ScriptPath", e.target.value)} /></Field>
              <Field label="GA4 transport"><TextInput value={config.proxy.ga4CollectPath} onChange={(e) => set("proxy.ga4CollectPath", e.target.value)} /></Field>
            </div>
          </div>
        </section>
      </div>

      {/* Global */}
      <section className="bg-white rounded-lg border border-gray-200 p-5 flex flex-wrap items-center gap-6">
        <ToggleRow label="Test Mode" desc="Route to Meta Test Events + GA4 DebugView" checked={config.testMode} onChange={(v) => set("testMode", v)} />
        <Field label="Log retention (days)">
          <TextInput type="number" className="w-24" value={config.logRetentionDays} onChange={(e) => set("logRetentionDays", Number(e.target.value))} />
        </Field>
        <button onClick={save} disabled={saving} className="ml-auto px-5 py-2.5 rounded-md bg-brand-terracotta text-white text-[13px] font-medium hover:bg-brand-terracotta/90 disabled:opacity-50">
          {saving ? "Saving…" : "Save configuration"}
        </button>
      </section>

      {/* Per-event routing matrix */}
      <section className="bg-white rounded-lg border border-gray-200 p-5">
        <h3 className="font-semibold text-brand-brown mb-1">Per-event routing</h3>
        <p className="text-[12px] text-gray-400 mb-4">Control each event independently — e.g. turn AddToCart off server-side but keep it client-side, or send Purchase to Meta only.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-gray-400 border-b border-gray-100">
                <th className="py-2 pr-4 font-medium">Event</th>
                <th className="py-2 px-3 font-medium text-center">Enabled</th>
                <th className="py-2 px-3 font-medium text-center">Client</th>
                <th className="py-2 px-3 font-medium text-center">Server</th>
                <th className="py-2 px-3 font-medium text-center">→ Meta</th>
                <th className="py-2 px-3 font-medium text-center">→ GA4</th>
              </tr>
            </thead>
            <tbody>
              {config.events.map((ev) => (
                <tr key={ev.name} className="border-b border-gray-50 last:border-0">
                  <td className="py-2 pr-4 font-medium text-brand-brown">{ev.name}</td>
                  {["enabled", "client", "server", "meta", "ga4"].map((k) => (
                    <td key={k} className="py-2 px-3 text-center">
                      <div className="flex justify-center">
                        <Toggle checked={ev[k]} disabled={!ev.enabled && k !== "enabled"} onChange={(v) => setEvent(ev.name, k, v)} />
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Test tool */}
      <section className="bg-white rounded-lg border border-gray-200 p-5">
        <h3 className="font-semibold text-brand-brown mb-3">Send a test event</h3>
        <div className="flex items-end gap-3 flex-wrap">
          <Field label="Event">
            <select value={testEvent} onChange={(e) => setTestEvent(e.target.value)} className="px-3 py-2 rounded-md border border-gray-300 text-[13px] bg-white">
              {config.events.map((e) => <option key={e.name}>{e.name}</option>)}
            </select>
          </Field>
          <button onClick={fireTest} disabled={testing} className="px-4 py-2 rounded-md bg-brand-brown text-white text-[13px] font-medium hover:opacity-90 disabled:opacity-50">
            {testing ? "Firing…" : "Fire test event"}
          </button>
          {testResult && (
            <div className="flex items-center gap-2 text-[12px] text-gray-500">
              Meta <StatusBadge status={testResult.meta?.status} /> · GA4 <StatusBadge status={testResult.ga4?.status} />
            </div>
          )}
        </div>
        {testResult && (
          <div className="grid md:grid-cols-2 gap-4 mt-4">
            <div>
              <p className="text-[11px] font-semibold text-gray-500 mb-1">Meta CAPI</p>
              <JsonViewer data={{ request: testResult.meta?.request, response: testResult.meta?.response }} maxHeight={260} />
            </div>
            <div>
              <p className="text-[11px] font-semibold text-gray-500 mb-1">GA4 MP (debug)</p>
              <JsonViewer data={{ request: testResult.ga4?.request, response: testResult.ga4?.response }} maxHeight={260} />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function ToggleRow({ label, desc, checked, onChange }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-[13px] font-medium text-gray-700">{label}</p>
        {desc && <p className="text-[11px] text-gray-400">{desc}</p>}
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}
