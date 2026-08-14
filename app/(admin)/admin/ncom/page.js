"use client";

import { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import {
  Share2, Plug, Copy, Check, Webhook, KeyRound, RefreshCw, Barcode, UploadCloud,
  Scale, ShieldCheck, AlertTriangle, Terminal, CircleCheck, CircleDashed, Building2,
  Image as ImageIcon,
} from "lucide-react";
import {
  PageHeader, Card, Field, TextInput, Toggle, Button, SectionTitle, StatCard, Pill,
} from "@/components/admin/ui";
import { cn } from "@/lib/utils";

const MASK = "••••••••";

// The three operations, in the order they must be run the first time.
const OPERATIONS = [
  {
    key: "backfill-skus",
    icon: Barcode,
    title: "Generate SKUs",
    blurb: "Stock sync addresses variants by SKU. Fills in any that are missing, using your existing SKU scheme. Never touches product URLs.",
    liveLabel: "Generate",
  },
  {
    key: "migrate",
    icon: UploadCloud,
    title: "Push catalogue",
    blurb: "Sends categories, then products, then opening stock. Safe to re-run — products match on their existing ID, so a second run updates instead of duplicating.",
    liveLabel: "Push now",
  },
  {
    key: "reconcile",
    icon: Scale,
    title: "Reconcile stock",
    blurb: "Overwrites their counts with yours. Day-to-day sync uses deltas, which drift over months; this is the correction. Best run when nothing is selling.",
    liveLabel: "Reconcile",
  },
];

function relativeTime(value) {
  if (!value) return "Never";
  const diff = Date.now() - new Date(value).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

// Console-style output, coloured by level — the same lines the CLI prints.
// A failed catalogue push can run to hundreds of lines, so this stays tall,
// counts what it is showing, filters to problems, and can be copied out whole.
function LogPanel({ title, lines, onClear }) {
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [copied, setCopied] = useState(false);
  if (!lines?.length) return null;

  const tone = {
    error: "text-red-300",
    warn: "text-amber-300",
    success: "text-emerald-300",
    info: "text-brand-cream/80",
  };

  const problems = lines.filter((l) => l.level === "error" || l.level === "warn");
  const shown = onlyProblems ? problems : lines;

  const copyAll = () => {
    navigator.clipboard?.writeText(lines.map((l) => l.text).join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="rounded-lg border border-brand-brown/20 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-brand-brown px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-brand-cream/90 flex items-center gap-1.5">
          <Terminal size={12} /> {title}
          <span className="font-normal normal-case tracking-normal text-brand-cream/50">
            {shown.length} of {lines.length} lines
            {problems.length > 0 && ` · ${problems.length} need attention`}
          </span>
        </span>
        <div className="flex items-center gap-3">
          {problems.length > 0 && (
            <button
              onClick={() => setOnlyProblems((v) => !v)}
              className="text-[11px] text-brand-cream/60 hover:text-brand-cream transition-colors"
            >
              {onlyProblems ? "Show all" : "Only problems"}
            </button>
          )}
          <button onClick={copyAll} className="text-[11px] text-brand-cream/60 hover:text-brand-cream transition-colors">
            {copied ? "Copied" : "Copy"}
          </button>
          <button onClick={onClear} className="text-[11px] text-brand-cream/60 hover:text-brand-cream transition-colors">
            Clear
          </button>
        </div>
      </div>
      <pre className="bg-[#2b211c] text-[11.5px] leading-relaxed p-3 max-h-[32rem] overflow-auto whitespace-pre-wrap break-words font-mono">
        {shown.map((l, i) => (
          <div key={i} className={tone[l.level] || tone.info}>{l.text}</div>
        ))}
      </pre>
    </div>
  );
}

// A single operation: preview (dry run) is one click, running live takes two.
function OperationRow({ op, busy, onRun, extra }) {
  const [confirming, setConfirming] = useState(false);
  const Icon = op.icon;

  return (
    <div className="rounded-lg border border-brand-tan/20 bg-brand-cream/30 p-3.5">
      <div className="flex items-start gap-3">
        <span className="w-8 h-8 rounded-lg bg-brand-terracotta/10 text-brand-terracotta flex items-center justify-center flex-shrink-0">
          <Icon size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-brand-brown leading-tight">{op.title}</p>
          <p className="text-[11.5px] text-brand-tan mt-1 leading-snug">{op.blurb}</p>
          {extra}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-3 sm:pl-11">
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => { setConfirming(false); onRun(op.key, true); }}
        >
          {busy === `${op.key}:dry` ? "Checking…" : "Preview"}
        </Button>

        {confirming ? (
          <>
            <Button
              size="sm"
              variant="danger"
              disabled={busy}
              onClick={() => { setConfirming(false); onRun(op.key, false); }}
            >
              {busy === `${op.key}:live` ? "Running…" : "Yes, write for real"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button>
          </>
        ) : (
          <Button size="sm" disabled={busy} onClick={() => setConfirming(true)}>
            {op.liveLabel}
          </Button>
        )}

        <span className="text-[11px] text-brand-tan">
          {confirming ? "This writes to your ncom workspace." : "Preview changes nothing."}
        </span>
      </div>
    </div>
  );
}

export default function NcomPage() {
  const [cfg, setCfg] = useState(null);
  const [status, setStatus] = useState(null);
  const [conn, setConn] = useState(null);
  const [hooks, setHooks] = useState(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [busy, setBusy] = useState(null);
  const [copied, setCopied] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [log, setLog] = useState(null);
  const [enableScheme, setEnableScheme] = useState(true);

  const set = (k, v) => setCfg((c) => ({ ...c, [k]: v }));

  const loadStatus = useCallback(() => {
    fetch("/api/admin/ncom/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/admin/ncom")
      .then((r) => r.json())
      .then(setCfg)
      .catch(() => toast.error("Failed to load config"));
    loadStatus();
    if (typeof window !== "undefined") setWebhookUrl(`${window.location.origin}/api/ncom-webhook`);
  }, [loadStatus]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/ncom", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfg),
      });
      if (!res.ok) throw new Error();
      toast.success("Saved");
      // Re-read so masked fields reflect what is actually stored.
      setCfg(await (await fetch("/api/admin/ncom")).json());
      loadStatus();
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    try {
      const d = await (await fetch("/api/admin/ncom/test")).json();
      setConn(d);
      if (d.ok) toast.success(`Connected to ${d.organization?.name || "ncom"}`);
      else toast.error(d.error || "Connection failed");
      loadStatus();
    } catch {
      setConn({ ok: false, error: "Connection failed" });
      toast.error("Connection failed");
    } finally {
      setTesting(false);
    }
  };

  const run = async (action, dryRun) => {
    setBusy(`${action}:${dryRun ? "dry" : "live"}`);
    setLog(null);
    try {
      const res = await fetch("/api/admin/ncom/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, dryRun, enableScheme }),
      });
      const d = await res.json();
      setLog({ title: `${action}${dryRun ? " — preview" : ""}`, lines: d.log || [] });
      if (d.ok === false) toast.error("Finished with errors — see the log");
      else if (dryRun) toast.success("Preview ready");
      else toast.success("Done");
      loadStatus();
    } catch {
      toast.error("Request failed");
    } finally {
      setBusy(null);
    }
  };

  const loadHooks = async () => {
    setHooks("loading");
    try {
      setHooks(await (await fetch("/api/admin/ncom/webhook")).json());
    } catch {
      setHooks({ ok: false, error: "Failed to load" });
    }
  };

  const registerHook = async (replace = false) => {
    setHooks("loading");
    try {
      const d = await (await fetch("/api/admin/ncom/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: webhookUrl, replace }),
      })).json();

      if (d.ok) {
        if (d.secretStored) toast.success("Registered — signing secret saved automatically");
        // ncom issues the secret only when an endpoint is created, so updating
        // an existing one can't produce it. Say that instead of implying a
        // secret arrived.
        else if (d.secretUnavailable) toast("Endpoint already registered. Its secret is only shown at creation — use Replace to issue a new one.", { icon: "ℹ️" });
        else toast.success("Registered. Paste the signing secret from ncom below.");
        setCfg(await (await fetch("/api/admin/ncom")).json());
      } else {
        toast.error(d.error || "Could not register");
      }
      await loadHooks();
    } catch {
      toast.error("Could not register");
      setHooks(null);
    }
  };

  const copyWebhook = () => {
    navigator.clipboard?.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (!cfg) return <div className="text-brand-tan py-10 text-center">Loading…</div>;

  const local = status?.local;
  const skusReady = local ? local.variants - local.missingSku : 0;
  const currencyWrong = conn?.ok && conn.organization?.currencyCode !== "BDT";

  // The first-run checklist, derived from live state rather than guessed at.
  const steps = [
    { done: cfg.hasApiKey, label: "API key saved" },
    { done: conn?.ok, label: "Connection verified", hint: conn?.ok ? null : "Run “Test connection”" },
    { done: conn?.ok ? !currencyWrong : false, label: "Workspace currency is BDT", hint: currencyWrong ? "Change it in the ncom dashboard" : null },
    { done: local ? local.missingSku === 0 : false, label: "Every variant has a SKU", hint: local?.missingSku ? `${local.missingSku} missing` : null },
    { done: local ? !local.duplicateSkus : false, label: "Every SKU is unique", hint: local?.duplicateSkus ? `${local.duplicateSkus} shared by two variants — stock can't sync for those` : null },
    { done: !!cfg.lastMigrateAt, label: "Catalogue pushed" },
    { done: cfg.hasWebhookSecret, label: "Webhook secret stored" },
    { done: !!cfg.lastWebhookAt, label: "Webhook delivering", hint: cfg.lastWebhookAt ? relativeTime(cfg.lastWebhookAt) : "No event received yet" },
    { done: cfg.enabled, label: "Stock sync switched on" },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <div>
      <PageHeader
        title="ncom.bd"
        subtitle="Catalogue import & two-way stock sync"
        icon={Share2}
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
          label="Connection"
          value={conn ? (conn.ok ? "Connected" : "Failed") : cfg.hasApiKey ? "Not tested" : "No key"}
          icon={Plug}
          accent={conn?.ok ? "text-emerald-600" : conn ? "text-red-600" : ""}
          hint={conn?.ok ? conn.organization?.name : "Run a test"}
        />
        <StatCard
          label="Stock sync"
          value={cfg.enabled ? (cfg.autoPushStock ? "On" : "Paused") : "Off"}
          icon={RefreshCw}
          accent={cfg.enabled && cfg.autoPushStock ? "text-emerald-600" : "text-brand-tan"}
          hint={cfg.enabled ? "Mirroring every sale" : "Turn on when ready"}
        />
        <StatCard
          label="SKUs ready"
          value={local ? `${skusReady}/${local.variants}` : "—"}
          icon={Barcode}
          accent={
            local && local.missingSku === 0 && !local.duplicateSkus
              ? "text-emerald-600"
              : "text-amber-600"
          }
          hint={
            local?.missingSku
              ? `${local.missingSku} still missing`
              : local?.duplicateSkus
                ? `${local.duplicateSkus} SKU(s) used twice`
                : "Required for stock sync"
          }
        />
        <StatCard
          label="Setup"
          value={`${doneCount}/${steps.length}`}
          icon={ShieldCheck}
          accent={doneCount === steps.length ? "text-emerald-600" : "text-brand-tan"}
          hint={doneCount === steps.length ? "Fully live" : "Steps remaining"}
        />
      </div>

      {currencyWrong && (
        <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-3">
          <AlertTriangle size={15} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-[12px] text-amber-900 leading-snug">
            <b>Workspace currency is {conn.organization.currencyCode}, not BDT.</b> Prices are sent as
            taka × 100, so a ৳1,290 product will read as {conn.organization.currencyCode} 1,290.00 over
            there. Change the workspace currency in the ncom dashboard before pushing — there is no API
            for it.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* ── Credentials ─────────────────────────────────────────────── */}
        <Card className="space-y-4">
          <SectionTitle className="flex items-center gap-2"><KeyRound size={13} /> Credentials</SectionTitle>

          <div className="flex items-center justify-between rounded-lg bg-brand-cream/50 px-3 py-2.5">
            <div>
              <p className="text-[13px] font-medium text-brand-brown">Enable stock sync</p>
              <p className="text-[11px] text-brand-tan">Mirror sales, returns and edits to ncom</p>
            </div>
            <Toggle checked={cfg.enabled} onChange={(v) => set("enabled", v)} />
          </div>

          <Field
            label="API key"
            hint={cfg.envApiKey
              ? "An NCOM_API_KEY env var is set and takes precedence over this."
              : "From Developers → API keys. Needs the three write permissions."}
          >
            <TextInput
              type="password"
              value={cfg.apiKey}
              onChange={(e) => set("apiKey", e.target.value)}
              placeholder={cfg.hasApiKey ? MASK : "ncom_live_…"}
            />
          </Field>

          <Field label="Base URL" hint="Leave as-is unless you are pointing at a staging workspace.">
            <TextInput value={cfg.baseUrl} onChange={(e) => set("baseUrl", e.target.value)} />
          </Field>

          <div className={cn("flex items-center justify-between rounded-lg bg-brand-cream/50 px-3 py-2.5 transition-opacity", !cfg.enabled && "opacity-50")}>
            <div>
              <p className="text-[13px] font-medium text-brand-brown">Auto-push movements</p>
              <p className="text-[11px] text-brand-tan">Off pauses pushing without losing the key</p>
            </div>
            <Toggle checked={cfg.autoPushStock} onChange={(v) => set("autoPushStock", v)} disabled={!cfg.enabled} />
          </div>

          <div className="flex items-start gap-2 rounded-lg bg-brand-cream/40 px-3 py-2.5">
            <ImageIcon size={13} className="text-brand-tan flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-brand-tan leading-snug">
              Product images sync as URLs — ncom fetches them from your CDN and remembers each one,
              so re-running a push costs nothing for artwork that has not changed.
            </p>
          </div>
        </Card>

        {/* ── Connection detail ───────────────────────────────────────── */}
        <Card className="space-y-3">
          <SectionTitle className="flex items-center gap-2"><Building2 size={13} /> Workspace</SectionTitle>

          {!conn && (
            <p className="text-[12px] text-brand-tan">
              Run <b className="text-brand-brown">Test connection</b> to confirm the key reaches the right
              workspace and carries the permissions this needs.
            </p>
          )}

          {conn && !conn.ok && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
              <p className="text-[12px] text-red-800 leading-snug">
                <b>{conn.code || "Failed"}</b> — {conn.error}
              </p>
            </div>
          )}

          {conn?.ok && (
            <>
              <dl className="space-y-2">
                {[
                  ["Organisation", conn.organization?.name],
                  ["Slug", conn.organization?.slug],
                  ["Currency", conn.organization?.currencyCode],
                  ["Key", conn.key?.name],
                  ["Config source", conn.source === "env" ? "Environment variable" : "Admin panel"],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-baseline justify-between gap-3">
                    <dt className="text-[11px] text-brand-tan">{k}</dt>
                    <dd className="text-[12px] font-medium text-brand-brown text-right break-all">{v || "—"}</dd>
                  </div>
                ))}
              </dl>

              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-tan mb-1.5">Permissions</p>
                <div className="flex flex-wrap gap-1.5">
                  {(conn.scopes || []).map((s) => (
                    <Pill key={s} tone={s.endsWith("WRITE") ? "terracotta" : "gray"}>{s.replace(/_/g, " ")}</Pill>
                  ))}
                </div>
              </div>

              {conn.warnings?.length > 0 && (
                <ul className="space-y-1.5 pt-1">
                  {conn.warnings.map((w, i) => (
                    <li key={i} className="flex gap-2 text-[11.5px] text-amber-800 leading-snug">
                      <AlertTriangle size={12} className="text-amber-600 flex-shrink-0 mt-0.5" />
                      {w}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {status?.remote && (
            <div className="pt-2 border-t border-brand-tan/15">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-tan mb-2">Over there vs here</p>
              {[
                ["Products", status.remote.products, local?.products],
                ["Categories", status.remote.categories, local?.categories],
                ["Variants", status.remote.variants, local?.variants],
              ].map(([k, remote, mine]) => (
                <div key={k} className="flex items-baseline justify-between gap-3 py-0.5">
                  <span className="text-[11px] text-brand-tan">{k}</span>
                  <span className="text-[12px] font-medium text-brand-brown">
                    {remote} <span className="text-brand-tan font-normal">/ {mine ?? "—"} here</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* ── Setup checklist ─────────────────────────────────────────── */}
        <Card>
          <SectionTitle className="flex items-center gap-2"><ShieldCheck size={13} /> Setup</SectionTitle>
          <ol className="space-y-2 mt-2">
            {steps.map((s) => (
              <li key={s.label} className="flex gap-2.5 items-start">
                {s.done
                  ? <CircleCheck size={15} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                  : <CircleDashed size={15} className="text-brand-tan/50 flex-shrink-0 mt-0.5" />}
                <div className="min-w-0">
                  <p className={cn("text-[12px] leading-tight", s.done ? "text-brand-brown font-medium" : "text-brand-tan")}>
                    {s.label}
                  </p>
                  {s.hint && <p className="text-[10.5px] text-brand-tan/80 mt-0.5">{s.hint}</p>}
                </div>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      {/* ── Webhook ───────────────────────────────────────────────────── */}
      <Card className="mt-5 space-y-4">
        <SectionTitle className="flex items-center gap-2"><Webhook size={13} /> Webhook</SectionTitle>
        <p className="text-[12px] text-brand-tan">
          This is how a sale on ncom reaches your stock. Register the URL, then store the signing secret
          they issue — the receiver rejects everything until it has one.
        </p>

        <div className="flex items-center gap-2">
          <code className="flex-1 text-[12px] bg-brand-cream/70 border border-brand-tan/20 rounded-lg px-3 py-2 text-brand-brown break-all">
            {webhookUrl}
          </code>
          <Button variant="outline" size="icon" onClick={copyWebhook} title="Copy">
            {copied ? <Check size={15} /> : <Copy size={15} />}
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Field
            label="Signing secret"
            hint={cfg.envWebhookSecret
              ? "An NCOM_WEBHOOK_SECRET env var is set and takes precedence over this."
              : "Stored automatically if ncom returns it when registering."}
          >
            <TextInput
              type="password"
              value={cfg.webhookSecret}
              onChange={(e) => set("webhookSecret", e.target.value)}
              placeholder={cfg.hasWebhookSecret ? MASK : "whsec_…"}
            />
          </Field>

          <div className="flex flex-col justify-end gap-2">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={loadHooks} disabled={hooks === "loading"}>
                {hooks === "loading" ? "Loading…" : "View registered"}
              </Button>
              <Button size="sm" onClick={() => registerHook(false)} disabled={hooks === "loading" || !cfg.hasApiKey}>
                Register this URL
              </Button>
              {!cfg.hasWebhookSecret && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => registerHook(true)}
                  disabled={hooks === "loading" || !cfg.hasApiKey}
                  title="Deletes and re-creates the endpoint so ncom issues a fresh signing secret"
                >
                  Replace &amp; issue secret
                </Button>
              )}
            </div>
            <p className="text-[11px] text-brand-tan">
              Last event received: <b className="text-brand-brown">{relativeTime(cfg.lastWebhookAt)}</b>
            </p>
          </div>
        </div>

        {hooks && hooks !== "loading" && (
          hooks.ok
            ? (hooks.webhooks?.length
                ? (
                  <div className="rounded-lg border border-brand-tan/20 divide-y divide-brand-tan/15">
                    {hooks.webhooks.map((w) => (
                      <div key={w.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                        <div className="min-w-0">
                          <p className="text-[12px] text-brand-brown break-all">{w.url}</p>
                          <p className="text-[10.5px] text-brand-tan mt-0.5">
                            {(w.topics || []).join(", ") || "no topics"}
                            {typeof w.deliveries === "number" && ` · ${w.deliveries} deliveries`}
                            {w.lastSuccessAt && ` · last ok ${relativeTime(w.lastSuccessAt)}`}
                            {w.lastFailureAt && ` · last fail ${relativeTime(w.lastFailureAt)}`}
                          </p>
                        </div>
                        <Pill tone={w.isActive === false ? "red" : w.lastFailureAt && !w.lastSuccessAt ? "amber" : "green"}>
                          {w.isActive === false ? "Paused" : "Active"}
                        </Pill>
                      </div>
                    ))}
                  </div>
                )
                : <p className="text-[12px] text-brand-tan">No endpoints registered yet.</p>
              )
            : <p className="text-[12px] text-red-700">{hooks.error}</p>
        )}
      </Card>

      {/* ── Operations ────────────────────────────────────────────────── */}
      <Card className="mt-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <SectionTitle className="flex items-center gap-2"><RefreshCw size={13} /> Operations</SectionTitle>
            <p className="text-[12px] text-brand-tan mt-1">
              Run these in order the first time. Everything previews before it writes.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => run("audit-images", true)}
            title="Downloads every product image the way ncom would, and lists any that fail"
          >
            <ImageIcon size={14} />
            {busy === "audit-images:dry" ? "Checking images…" : "Check images"}
          </Button>
        </div>

        <div className="flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2.5">
          <AlertTriangle size={13} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-[11.5px] text-amber-900 leading-snug">
            A product with even one image ncom cannot download is rejected <b>entirely</b> — not
            imported without the picture. Run <b>Check images</b> first to find those, or push anyway:
            blocked products are automatically re-sent without artwork so you never lose the product,
            and the log names each one to fix.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {OPERATIONS.map((op) => (
            <OperationRow
              key={op.key}
              op={op}
              busy={busy}
              onRun={run}
              extra={
                op.key === "backfill-skus" && status && !status.schemeEnabled ? (
                  <label className="flex items-center gap-2 mt-2 cursor-pointer">
                    <Toggle checked={enableScheme} onChange={setEnableScheme} />
                    <span className="text-[11px] text-brand-tan leading-tight">
                      Also enable the scheme so new products get SKUs
                    </span>
                  </label>
                ) : null
              }
            />
          ))}
        </div>

        <LogPanel title={log?.title} lines={log?.lines} onClear={() => setLog(null)} />

        {status?.local && (
          <p className="text-[11px] text-brand-tan">
            Last catalogue push <b className="text-brand-brown">{relativeTime(cfg.lastMigrateAt)}</b> ·
            {" "}last reconcile <b className="text-brand-brown">{relativeTime(cfg.lastReconcileAt)}</b>
          </p>
        )}
      </Card>
    </div>
  );
}
