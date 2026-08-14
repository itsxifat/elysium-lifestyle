export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import Settings from "@/models/Settings";
import { requireAdmin } from "@/lib/auth";
import { invalidateNcomConfig, NCOM_DEFAULT_API } from "@/lib/ncom";

const MASK = "••••••••";

export async function GET() {
  const { error } = await requireAdmin("settings.manage");
  if (error) return error;

  await connectDB();
  const settings = await Settings.findOne({}).select("ncom").lean();
  const cfg = settings?.ncom || {};

  return NextResponse.json({
    enabled: !!cfg.enabled,
    // Never send real secrets to the browser — only whether one is stored.
    apiKey: cfg.apiKey ? MASK : "",
    hasApiKey: !!cfg.apiKey,
    webhookSecret: cfg.webhookSecret ? MASK : "",
    hasWebhookSecret: !!cfg.webhookSecret,
    baseUrl: cfg.baseUrl || NCOM_DEFAULT_API,
    autoPushStock: cfg.autoPushStock !== false,
    includeImages: cfg.includeImages !== false,
    lastMigrateAt: cfg.lastMigrateAt || null,
    lastReconcileAt: cfg.lastReconcileAt || null,
    lastWebhookAt: cfg.lastWebhookAt || null,
    // Env wins over the DB, so surface it — otherwise saving a key here and
    // seeing no change is baffling.
    envApiKey: !!(process.env.NCOM_API_KEY || "").trim(),
    envWebhookSecret: !!(process.env.NCOM_WEBHOOK_SECRET || "").trim(),
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
  const keep = (incoming, existing) =>
    incoming && incoming !== MASK ? String(incoming).trim() : existing || "";

  settings.ncom = {
    ...cur,
    enabled: !!data.enabled,
    apiKey: keep(data.apiKey, cur.apiKey),
    webhookSecret: keep(data.webhookSecret, cur.webhookSecret),
    baseUrl: (data.baseUrl || cur.baseUrl || NCOM_DEFAULT_API).trim(),
    autoPushStock: data.autoPushStock !== false,
    includeImages: data.includeImages !== false,
  };

  await settings.save();
  invalidateNcomConfig();

  return NextResponse.json({ ok: true });
}
