"use client";

import { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import {
  Share2, Plug, Copy, Check, Webhook, KeyRound, RefreshCw, Barcode, Radio,
  ShieldCheck, AlertTriangle, Terminal, CircleCheck, CircleDashed, Building2,
  Antenna, Lock, PackageCheck, SlidersHorizontal, Activity,
} from "lucide-react";
import {
  PageHeader, Card, Field, TextInput, Toggle, Button, SectionTitle, StatCard, Pill,
} from "@/components/admin/ui";
import { cn } from "@/lib/utils";

const MASK = "••••••••";

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

const CHECK_TONE = {
  pass: { icon: CircleCheck, className: "text-emerald-600" },
  fail: { icon: AlertTriangle, className: "text-red-600" },
  warn: { icon: AlertTriangle, className: "text-amber-600" },
  skip: { icon: CircleDashed, className: "text-brand-tan/60" },
};

function CheckList({ checks }) {
  if (!checks?.length) return null;
  return (
    <ul className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-1.5">
      {checks.map((c) => {
        const { icon: Icon, className } = CHECK_TONE[c.status] || CHECK_TONE.skip;
        return (
          <li key={c.id} className="flex gap-2 items-start">
            <Icon size={14} className={cn("flex-shrink-0 mt-0.5", className)} />
            <div className="min-w-0">
              <p className="text-[12px] text-brand-brown leading-tight">{c.label}</p>
              {c.detail && <p className="text-[10.5px] text-brand-tan mt-0.5 break-words">{c.detail}</p>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// A labelled row of counters — what ncom has actually asked us for.
function Meter({ label, value, hint }) {
  return (
    <div className="rounded-lg bg-brand-cream/50 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-tan">{label}</p>
      <p className="text-[16px] font-semibold text-brand-brown leading-tight mt-0.5">{value}</p>
      {hint && <p className="text-[10.5px] text-brand-tan mt-0.5">{hint}</p>}
    </div>
  );
}

export default function NcomPage() {
  const [cfg, setCfg] = useState(null);
  const [status, setStatus] = useState(null);
  const [conn, setConn] = useState(null);
  const [hooks, setHooks] = useState(null);
  const [selftest, setSelftest] = useState(null);
  const [log, setLog] = useState(null);

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(null);
  const [enableScheme, setEnableScheme] = useState(false);
  const [copied, setCopied] = useState("");

  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  const load = useCallback(async () => {
    try {
      setCfg(await (await fetch("/api/admin/ncom")).json());
    } catch {
      toast.error("Could not load settings");
    }
  }, []);

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await (await fetch("/api/admin/ncom/status")).json());
    } catch {
      /* the panel still works without the counters */
    }
  }, []);

  useEffect(() => {
    load();
    loadStatus();
  }, [load, loadStatus]);

  const set = (key, value) => setCfg((c) => ({ ...c, [key]: value }));

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
      await load(); // re-read so masked fields reflect what is actually stored
      loadStatus();
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const testRest = async () => {
    setTesting(true);
    try {
      const d = await (await fetch("/api/admin/ncom/test")).json();
      setConn(d);
      if (d.ok) toast.success(`Connected to ${d.organization?.name || "ncom"}`);
      else toast.error(d.error || "Connection failed");
    } catch {
      setConn({ ok: false, error: "Connection failed" });
      toast.error("Connection failed");
    } finally {
      setTesting(false);
    }
  };

  const runSelfTest = async () => {
    setChecking(true);
    setSelftest(null);
    setLog(null);
    try {
      const d = await (await fetch("/api/admin/ncom/selftest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin: cfg?.publicBaseUrl || origin }),
      })).json();
      setSelftest(d);
      setLog({ title: "connector self-test", lines: d.log || [] });
      if (d.ok) toast.success("Connector passed every check");
      else toast.error("Some checks failed — see below");
      load();
    } catch {
      toast.error("Self-test could not run");
    } finally {
      setChecking(false);
    }
  };

  const runSkus = async (dryRun) => {
    setBusy(dryRun ? "dry" : "live");
    setLog(null);
    try {
      const d = await (await fetch("/api/admin/ncom/skus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun, enableScheme }),
      })).json();
      setLog({ title: `generate SKUs${dryRun ? " — preview" : ""}`, lines: d.log || [] });
      if (d.ok === false) toast.error("Finished with errors — see the log");
      else toast.success(dryRun ? "Preview ready" : "Done");
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
        // an existing one cannot produce it. Say that rather than implying a
        // secret arrived.
        else if (d.secretUnavailable) toast("Endpoint already registered. Its secret is only shown at creation — use Replace to issue a new one.", { icon: "ℹ️" });
        else toast.success("Registered. Paste the signing secret from ncom below.");
        load();
      } else {
        toast.error(d.error || "Could not register");
      }
      await loadHooks();
    } catch {
      toast.error("Could not register");
      setHooks(null);
    }
  };

  const copy = (value, key) => {
    navigator.clipboard?.writeText(value);
    setCopied(key);
    setTimeout(() => setCopied(""), 1500);
  };

  if (!cfg) return <div className="text-brand-tan py-10 text-center">Loading…</div>;

  const base = (cfg.publicBaseUrl || cfg.resolvedOrigin || origin || "").replace(/\/+$/, "");
  const connectorUrl = base + cfg.connectorPath;
  const webhookUrl = `${base}/api/ncom-webhook`;
  const cat = status?.catalogue;
  const stats = status?.stats || {};
  const reads = (stats.products || 0) + (stats.stock || 0) + (stats.categories || 0);
  const currencyWrong = conn?.ok && conn.organization?.currencyCode !== "BDT";
  const serving = cfg.enabled && cfg.hasConnectorSecret;

  const steps = [
    { done: !!base && /^https:\/\//i.test(base), label: "Public HTTPS address known", hint: base || "Set NEXT_PUBLIC_SITE_URL, or fill in the base URL below" },
    { done: cfg.hasConnectorSecret, label: "Connector secret stored", hint: cfg.hasConnectorSecret ? null : "Press Connect on ncom's Settings → Product source" },
    { done: !!cfg.connectorKeyId, label: "Connector key id stored" },
    { done: cfg.enabled, label: "Serving switched on", hint: cfg.enabled ? null : "Every endpoint answers 503 until this is on" },
    { done: !!cfg.lastSelfTestOk, label: "Self-test passed", hint: cfg.lastSelfTestAt ? relativeTime(cfg.lastSelfTestAt) : "Not run yet" },
    { done: !!cfg.lastRequestAt, label: "ncom has read the catalogue", hint: cfg.lastRequestAt ? relativeTime(cfg.lastRequestAt) : "No request received yet" },
    { done: cfg.hasApiKey, label: "REST API key saved (orders & webhooks)" },
    { done: cfg.hasWebhookSecret, label: "Webhook secret stored" },
    { done: !!cfg.lastWebhookAt, label: "Webhook delivering", hint: cfg.lastWebhookAt ? relativeTime(cfg.lastWebhookAt) : "No event received yet" },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <div>
      <PageHeader
        title="ncom.bd"
        subtitle="Live product source — ncom reads this shop, nothing is imported"
        icon={Share2}
        actions={
          <>
            <Button variant="outline" onClick={runSelfTest} disabled={checking}>
              <ShieldCheck size={14} /> {checking ? "Checking…" : "Run self-test"}
            </Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
          </>
        }
      />

      {/* Status row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <StatCard
          label="Product source"
          value={serving ? "Serving" : cfg.hasConnectorSecret ? "Paused" : "Not connected"}
          icon={Antenna}
          accent={serving ? "text-emerald-600" : cfg.hasConnectorSecret ? "text-amber-600" : "text-brand-tan"}
          hint={cfg.lastRequestAt ? `Last read ${relativeTime(cfg.lastRequestAt)}` : "No read yet"}
        />
        <StatCard
          label="Self-test"
          value={cfg.lastSelfTestAt ? (cfg.lastSelfTestOk ? "Passing" : "Failing") : "Not run"}
          icon={ShieldCheck}
          accent={cfg.lastSelfTestOk ? "text-emerald-600" : cfg.lastSelfTestAt ? "text-red-600" : ""}
          hint={cfg.lastSelfTestAt ? relativeTime(cfg.lastSelfTestAt) : "Run it before connecting"}
        />
        <StatCard
          label="Exposed live"
          value={cat ? `${cat.published}/${cat.products}` : "—"}
          icon={PackageCheck}
          hint={cat ? `${cat.variants} variants${cfg.includeDrafts && cat.drafts ? ` · ${cat.drafts} drafts visible` : ""}` : "products sellable"}
        />
        <StatCard
          label="Setup"
          value={`${doneCount}/${steps.length}`}
          icon={CircleCheck}
          accent={doneCount === steps.length ? "text-emerald-600" : "text-brand-tan"}
          hint={doneCount === steps.length ? "Fully live" : "Steps remaining"}
        />
      </div>

      {/* How this works now — the model changed entirely, so say so once. */}
      <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-brand-tan/25 bg-brand-cream/50 px-3.5 py-3">
        <Radio size={15} className="text-brand-terracotta flex-shrink-0 mt-0.5" />
        <p className="text-[12px] text-brand-brown/90 leading-snug">
          <b>ncom no longer stores a copy of this catalogue.</b> It reads this shop live — on every
          landing-page view, every cart and every checkout — so a price you change here is the price
          on their pages immediately, and there is no import to run and no stock to reconcile. When
          something sells there, ncom asks this server to hold the units before it writes the order,
          so two shoppers can never buy the same last one.
        </p>
      </div>

      {!cfg.hasConnectorSecret && (
        <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-3">
          <AlertTriangle size={15} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-[12px] text-amber-900 leading-snug">
            <b>Not connected yet.</b> In ncom, open <b>Settings → Product source</b>, paste the
            connector URL below and press <b>Connect</b>. It shows a key id and a secret exactly
            once — copy both into this page straight away, because they cannot be shown again.
          </p>
        </div>
      )}

      {currencyWrong && (
        <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-red-300 bg-red-50 px-3.5 py-3">
          <AlertTriangle size={15} className="text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-[12px] text-red-900 leading-snug">
            <b>Workspace currency is {conn.organization.currencyCode}, not BDT.</b> ncom reads the
            prices it fetches from here as workspace currency and nothing downstream can detect the
            mismatch — a ৳1,290 product would be sold as {conn.organization.currencyCode} 1,290.00.
            Change it in the ncom dashboard before connecting.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* ── Product source ─────────────────────────────────────────────── */}
        <Card className="space-y-4 xl:col-span-2">
          <SectionTitle className="flex items-center gap-2"><Antenna size={13} /> Product source</SectionTitle>

          <Field label="Connector URL" hint="Paste this into ncom → Settings → Product source. It must be reachable over HTTPS from the internet.">
            <div className="flex items-center gap-2">
              <code className="flex-1 text-[12px] bg-brand-cream/70 border border-brand-tan/20 rounded-lg px-3 py-2 text-brand-brown break-all">
                {connectorUrl}
              </code>
              <Button variant="outline" size="icon" onClick={() => copy(connectorUrl, "connector")} title="Copy">
                {copied === "connector" ? <Check size={15} /> : <Copy size={15} />}
              </Button>
            </div>
          </Field>

          <div className="flex items-center justify-between rounded-lg bg-brand-cream/50 px-3 py-2.5">
            <div>
              <p className="text-[13px] font-medium text-brand-brown">Serve the catalogue</p>
              <p className="text-[11px] text-brand-tan">Off answers every request 503 — ncom stops selling rather than guessing</p>
            </div>
            <Toggle checked={cfg.enabled} onChange={(v) => set("enabled", v)} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Field
              label="Key id"
              hint={cfg.envConnectorKey ? "An NCOM_CONNECTOR_KEY env var is set and takes precedence." : "Sent as X-NCOM-Key on every read. Not secret, but checked."}
            >
              <TextInput
                value={cfg.connectorKeyId}
                onChange={(e) => set("connectorKeyId", e.target.value)}
                placeholder="ncomcat_…"
              />
            </Field>
            <Field
              label="Signing secret"
              hint={cfg.envConnectorSecret ? "An NCOM_CONNECTOR_SECRET env var is set and takes precedence." : "Shown once by ncom. Without it every request is refused."}
            >
              <TextInput
                type="password"
                value={cfg.connectorSecret}
                onChange={(e) => set("connectorSecret", e.target.value)}
                placeholder={cfg.hasConnectorSecret ? MASK : "ncomsec_…"}
              />
            </Field>
          </div>

          <Field
            label="Public base URL"
            hint={cfg.envSiteUrl
              ? "NEXT_PUBLIC_SITE_URL is set on the server and is used unless you override it here."
              : "Where this shop answers on the internet. Product links and image URLs are built from it."}
          >
            <TextInput
              value={cfg.publicBaseUrl}
              onChange={(e) => set("publicBaseUrl", e.target.value)}
              placeholder={cfg.resolvedOrigin || "https://your-domain.com"}
            />
          </Field>

          <div className="rounded-lg border border-brand-tan/20 p-3 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[12px] font-medium text-brand-brown flex items-center gap-1.5">
                <ShieldCheck size={13} /> Self-test
                <span className="font-normal text-brand-tan">
                  — the same checks ncom runs, from outside this server
                </span>
              </p>
              <Button size="sm" variant="outline" onClick={runSelfTest} disabled={checking}>
                {checking ? "Checking…" : "Run now"}
              </Button>
            </div>
            {selftest ? (
              <CheckList checks={selftest.checks} />
            ) : (
              <p className="text-[11.5px] text-brand-tan leading-snug">
                Signs real requests against the connector URL above and reports what came back:
                whether the handshake works, whether a forged or replayed signature is refused,
                whether <code>?ids=</code> is honoured, whether a missing product answers 404, and
                whether <code>/reserve</code> refuses an impossible quantity. Run it before you press
                Test in ncom.
              </p>
            )}
          </div>
        </Card>

        {/* ── Setup checklist ─────────────────────────────────────────────── */}
        <Card>
          <SectionTitle className="flex items-center gap-2"><CircleCheck size={13} /> Setup</SectionTitle>
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
                  {s.hint && <p className="text-[10.5px] text-brand-tan/80 mt-0.5 break-all">{s.hint}</p>}
                </div>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      <LogPanel title={log?.title} lines={log?.lines} onClear={() => setLog(null)} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mt-5">
        {/* ── Capabilities ───────────────────────────────────────────────── */}
        <Card className="space-y-4">
          <SectionTitle className="flex items-center gap-2"><SlidersHorizontal size={13} /> What ncom may do</SectionTitle>
          <p className="text-[11.5px] text-brand-tan leading-snug">
            Declared truthfully on the handshake, so ncom shows the merchant exactly what this shop
            supports. Claiming something that is switched off turns a clear warning in their panel
            into a mysterious checkout failure.
          </p>

          {[
            {
              key: "allowReserve",
              title: "Hold stock during checkout",
              blurb: "On, this database decides who gets the last unit. Off, ncom checks stock moments before writing the order and no more — two shoppers can both get one.",
            },
            {
              key: "allowCategories",
              title: "Expose the category tree",
              blurb: "Lets their browse blocks mirror your categories.",
            },
            {
              key: "allowSearch",
              title: "Allow product search",
              blurb: "Their product picker can search this catalogue by name, SKU or tag.",
            },
            {
              key: "includeDrafts",
              title: "Show unpublished drafts",
              blurb: "Drafts appear in their dashboard so a page can be built before you publish. They are never sellable.",
            },
          ].map((row) => (
            <div key={row.key} className="flex items-start justify-between gap-3 rounded-lg bg-brand-cream/50 px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-brand-brown">{row.title}</p>
                <p className="text-[11px] text-brand-tan leading-snug">{row.blurb}</p>
              </div>
              <Toggle checked={cfg[row.key]} onChange={(v) => set(row.key, v)} />
            </div>
          ))}

          <Field
            label="Parcel weight (grams)"
            hint="Sent with every variant for courier labels. This catalogue carries no per-product weight, so 0 sends none at all rather than a wrong one."
          >
            <TextInput
              type="number"
              min={0}
              value={cfg.defaultWeightGrams}
              onChange={(e) => set("defaultWeightGrams", e.target.value)}
            />
          </Field>
        </Card>

        {/* ── Live activity ──────────────────────────────────────────────── */}
        <Card className="space-y-4">
          <SectionTitle className="flex items-center gap-2"><Activity size={13} /> Live activity</SectionTitle>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            <Meter label="Catalogue reads" value={stats.products || 0} hint="products" />
            <Meter label="Stock readings" value={stats.stock || 0} hint="carts & checkouts" />
            <Meter label="Handshakes" value={stats.ping || 0} hint="ping" />
            <Meter label="Holds taken" value={stats.reserve || 0} hint="reserve" />
            <Meter label="Holds returned" value={stats.release || 0} hint="release" />
            <Meter
              label="Refused"
              value={stats.refused || 0}
              hint={stats.refused ? "bad signatures" : "none"}
            />
          </div>

          <dl className="space-y-2 pt-1">
            {[
              ["Last request", cfg.lastRequestAt ? `${relativeTime(cfg.lastRequestAt)} (${cfg.lastRequestKind || "—"})` : "Never"],
              ["Total reads served", reads.toLocaleString()],
              ["Units currently held", status?.reservations?.held ?? "—"],
              ["Holds returned today", status?.reservations?.releasedToday ?? "—"],
              ["Last refusal", cfg.lastRefusalAt ? `${relativeTime(cfg.lastRefusalAt)} — ${cfg.lastRefusalReason}` : "None"],
            ].map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-3">
                <dt className="text-[11px] text-brand-tan">{k}</dt>
                <dd className="text-[12px] font-medium text-brand-brown text-right break-words">{v}</dd>
              </div>
            ))}
          </dl>

          {stats.refused > 0 && (
            <p className="text-[11px] text-amber-800 leading-snug flex gap-1.5">
              <Lock size={12} className="flex-shrink-0 mt-0.5 text-amber-600" />
              Refusals are requests whose signature did not check out. A handful around a
              credential change is normal; a steady stream means someone has found the URL and is
              trying it — they are getting nothing, but it is worth knowing.
            </p>
          )}
        </Card>
      </div>

      {/* ── REST API ────────────────────────────────────────────────────── */}
      <Card className="mt-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <SectionTitle className="flex items-center gap-2"><KeyRound size={13} /> REST API</SectionTitle>
            <p className="text-[12px] text-brand-tan mt-1">
              Separate from the product source above, and used for the other direction: reading
              orders back and registering webhooks. Nothing here writes a catalogue any more.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={testRest} disabled={testing || !cfg.hasApiKey}>
            <Plug size={14} /> {testing ? "Testing…" : "Test connection"}
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Field
            label="API key"
            hint={cfg.envApiKey
              ? "An NCOM_API_KEY env var is set and takes precedence over this."
              : "From Developers → API keys. ORDERS_READ and the two WEBHOOKS scopes are enough."}
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

          <div className="lg:col-span-1">
            {conn?.ok ? (
              <dl className="space-y-1.5">
                {[
                  ["Organisation", conn.organization?.name],
                  ["Currency", conn.organization?.currencyCode],
                  ["Key", conn.key?.name],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-baseline justify-between gap-3">
                    <dt className="text-[11px] text-brand-tan">{k}</dt>
                    <dd className="text-[12px] font-medium text-brand-brown text-right break-all">{v || "—"}</dd>
                  </div>
                ))}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {(conn.scopes || []).map((s) => (
                    <Pill key={s} tone={s.endsWith("WRITE") ? "terracotta" : "gray"}>{s.replace(/_/g, " ")}</Pill>
                  ))}
                </div>
              </dl>
            ) : conn ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
                <p className="text-[12px] text-red-800 leading-snug"><b>{conn.code || "Failed"}</b> — {conn.error}</p>
              </div>
            ) : (
              <p className="text-[11.5px] text-brand-tan leading-snug flex gap-1.5">
                <Building2 size={13} className="flex-shrink-0 mt-0.5" />
                Run the test to confirm the key reaches the right workspace, in the right currency,
                with the permissions this panel needs.
              </p>
            )}
          </div>
        </div>

        {conn?.warnings?.length > 0 && (
          <ul className="space-y-1.5">
            {conn.warnings.map((w, i) => (
              <li key={i} className="flex gap-2 text-[11.5px] text-amber-800 leading-snug">
                <AlertTriangle size={12} className="text-amber-600 flex-shrink-0 mt-0.5" />
                {w}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ── Webhooks ────────────────────────────────────────────────────── */}
      <Card className="mt-5 space-y-4">
        <SectionTitle className="flex items-center gap-2"><Webhook size={13} /> Webhooks</SectionTitle>
        <p className="text-[12px] text-brand-tan">
          How an ncom order, a fraud hold or a delivered parcel reaches your notifications. Stock is
          <b> not</b> among them — it moves through the product source above, before the order is
          even written.
        </p>

        <div className="flex items-center gap-2">
          <code className="flex-1 text-[12px] bg-brand-cream/70 border border-brand-tan/20 rounded-lg px-3 py-2 text-brand-brown break-all">
            {webhookUrl}
          </code>
          <Button variant="outline" size="icon" onClick={() => copy(webhookUrl, "hook")} title="Copy">
            {copied === "hook" ? <Check size={15} /> : <Copy size={15} />}
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
                            {w.deliveries && typeof w.deliveries === "object"
                              ? ` · ${w.deliveries.succeeded ?? 0} ok / ${w.deliveries.failed ?? 0} failed`
                              : typeof w.deliveries === "number" ? ` · ${w.deliveries} deliveries` : ""}
                            {w.lastSuccessAt && ` · last ok ${relativeTime(w.lastSuccessAt)}`}
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

      {/* ── Catalogue housekeeping ──────────────────────────────────────── */}
      <Card className="mt-5 space-y-3">
        <SectionTitle className="flex items-center gap-2"><Barcode size={13} /> Generate SKUs</SectionTitle>
        <p className="text-[12px] text-brand-tan leading-snug">
          Fills in any missing base codes and variant SKUs from your SKU scheme. Stock no longer
          depends on these — ncom addresses a variant by its own id, which cannot be edited or
          duplicated — but SKUs travel with every product and are copied onto ncom&apos;s order lines,
          so they are worth having. Never touches product URLs.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => runSkus(true)} disabled={!!busy}>
            {busy === "dry" ? "Previewing…" : "Preview"}
          </Button>
          <Button size="sm" onClick={() => runSkus(false)} disabled={!!busy}>
            <RefreshCw size={14} /> {busy === "live" ? "Generating…" : "Generate"}
          </Button>
          <label className="flex items-center gap-2 cursor-pointer ml-1">
            <Toggle checked={enableScheme} onChange={setEnableScheme} />
            <span className="text-[11px] text-brand-tan leading-tight">
              Also enable the scheme so new products get SKUs
            </span>
          </label>
        </div>
      </Card>
    </div>
  );
}
