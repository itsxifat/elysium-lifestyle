export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import Settings from "@/models/Settings";
import { requireAdmin } from "@/lib/auth";
import { invalidateNcomConfig, NCOM_DEFAULT_API, CONNECTOR_BASE_PATH, siteOrigin } from "@/lib/ncom";

const MASK = "••••••••";

export async function GET() {
  const { error } = await requireAdmin("settings.manage");
  if (error) return error;

  await connectDB();
  const settings = await Settings.findOne({}).select("ncom").lean();
  const cfg = settings?.ncom || {};

  return NextResponse.json({
    enabled: !!cfg.enabled,

    // Inbound connector. Never send real secrets to the browser — only whether
    // one is stored. The key id is not itself a credential, so it is shown.
    connectorKeyId: cfg.connectorKeyId || "",
    connectorSecret: cfg.connectorSecret ? MASK : "",
    hasConnectorSecret: !!cfg.connectorSecret,

    allowReserve: cfg.allowReserve !== false,
    allowCategories: cfg.allowCategories !== false,
    allowSearch: cfg.allowSearch !== false,
    includeDrafts: cfg.includeDrafts !== false,
    defaultWeightGrams: Number(cfg.defaultWeightGrams) || 0,
    publicBaseUrl: cfg.publicBaseUrl || "",

    // Outbound REST.
    apiKey: cfg.apiKey ? MASK : "",
    hasApiKey: !!cfg.apiKey,
    webhookSecret: cfg.webhookSecret ? MASK : "",
    hasWebhookSecret: !!cfg.webhookSecret,
    baseUrl: cfg.baseUrl || NCOM_DEFAULT_API,

    // What to paste into ncom's Settings → Product source.
    connectorPath: CONNECTOR_BASE_PATH,
    resolvedOrigin: siteOrigin({ publicBaseUrl: cfg.publicBaseUrl || "" }),

    lastWebhookAt: cfg.lastWebhookAt || null,
    lastRequestAt: cfg.lastRequestAt || null,
    lastRequestKind: cfg.lastRequestKind || "",
    lastRefusalAt: cfg.lastRefusalAt || null,
    lastRefusalReason: cfg.lastRefusalReason || "",
    lastSelfTestAt: cfg.lastSelfTestAt || null,
    lastSelfTestOk: !!cfg.lastSelfTestOk,

    // Env wins over the DB, so surface it — otherwise saving a key here and
    // seeing no change is baffling.
    envApiKey: !!(process.env.NCOM_API_KEY || "").trim(),
    envWebhookSecret: !!(process.env.NCOM_WEBHOOK_SECRET || "").trim(),
    envConnectorKey: !!(process.env.NCOM_CONNECTOR_KEY || "").trim(),
    envConnectorSecret: !!(process.env.NCOM_CONNECTOR_SECRET || "").trim(),
    envSiteUrl: !!(process.env.NEXT_PUBLIC_SITE_URL || "").trim(),
  });
}

export async function PUT(request) {
  const { error } = await requireAdmin("settings.manage");
  if (error) return error;

  const data = await request.json();
  await connectDB();

  let settings = await Settings.findOne({});
  if (!settings) settings = await Settings.create({});

  const cur = settings.ncom || {};
  // A masked field means "the browser never saw this, leave it alone" — the
  // alternative is that opening the page and pressing Save wipes every secret.
  const keep = (incoming, existing) =>
    incoming && incoming !== MASK ? String(incoming).trim() : existing || "";

  const url = String(data.publicBaseUrl || "").trim().replace(/\/+$/, "");

  settings.ncom = {
    ...(cur.toObject ? cur.toObject() : cur),
    enabled: !!data.enabled,

    connectorKeyId: keep(data.connectorKeyId, cur.connectorKeyId),
    connectorSecret: keep(data.connectorSecret, cur.connectorSecret),

    allowReserve: data.allowReserve !== false,
    allowCategories: data.allowCategories !== false,
    allowSearch: data.allowSearch !== false,
    includeDrafts: data.includeDrafts !== false,
    defaultWeightGrams: Math.max(0, Math.min(100_000, Math.round(Number(data.defaultWeightGrams) || 0))),
    // Only an absolute http(s) origin is meaningful here; anything else would
    // produce product links ncom cannot follow.
    publicBaseUrl: /^https?:\/\/[^\s]+$/i.test(url) ? url : "",

    apiKey: keep(data.apiKey, cur.apiKey),
    webhookSecret: keep(data.webhookSecret, cur.webhookSecret),
    baseUrl: (data.baseUrl || cur.baseUrl || NCOM_DEFAULT_API).trim(),
  };

  await settings.save();
  invalidateNcomConfig();

  return NextResponse.json({ ok: true });
}
