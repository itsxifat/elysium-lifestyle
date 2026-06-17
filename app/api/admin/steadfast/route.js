export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import Settings from "@/models/Settings";
import { requireAdmin } from "@/lib/auth";

const MASK = "••••••••";

export async function GET() {
  const { error } = await requireAdmin("settings.manage");
  if (error) return error;

  await connectDB();
  const settings = await Settings.findOne({}).select("steadfast fraud").lean();
  const cfg = settings?.steadfast || {};
  const f = settings?.fraud || {};
  return NextResponse.json({
    enabled: !!cfg.enabled,
    apiKey: cfg.apiKey || "",
    secretKey: cfg.secretKey ? MASK : "", // never expose the real secret
    hasSecret: !!cfg.secretKey,
    baseUrl: cfg.baseUrl || "https://portal.packzy.com/api/v1",
    autoSendOnProcessing: cfg.autoSendOnProcessing !== false,
    webhookToken: cfg.webhookToken || "",
    // Fraud-history based auto-processing gates (managed here on the Courier page).
    fraud: {
      autoCheck: f.autoCheck !== false,
      autoProcess: f.autoProcess !== false,
      minDelivery: f.minDelivery ?? 10,
      minSuccessfulDelivery: f.minSuccessfulDelivery ?? 10,
      minSuccessRate: f.minSuccessRate ?? 0,
      maxFrauds: f.maxFrauds ?? 0,
    },
  });
}

export async function PUT(request) {
  const { error } = await requireAdmin("settings.manage");
  if (error) return error;

  const data = await request.json();
  await connectDB();
  let settings = await Settings.findOne({});
  if (!settings) settings = await Settings.create({});

  const cur = settings.steadfast || {};
  settings.steadfast = {
    enabled: !!data.enabled,
    apiKey: (data.apiKey ?? cur.apiKey ?? "").trim(),
    // Keep the stored secret unless a new (non-masked) one was typed.
    secretKey: data.secretKey && data.secretKey !== MASK ? data.secretKey.trim() : (cur.secretKey || ""),
    baseUrl: (data.baseUrl || cur.baseUrl || "https://portal.packzy.com/api/v1").trim(),
    autoSendOnProcessing: data.autoSendOnProcessing !== false,
    webhookToken: (data.webhookToken ?? cur.webhookToken ?? "").trim(),
  };

  // Fraud-history auto-processing gates (moved here from the Settings page).
  if (data.fraud) {
    const f = data.fraud;
    settings.fraud = {
      autoCheck: f.autoCheck !== false,
      autoProcess: f.autoProcess !== false,
      minDelivery: Math.max(0, Number(f.minDelivery) || 0),
      minSuccessfulDelivery: Math.max(0, Number(f.minSuccessfulDelivery) || 0),
      minSuccessRate: Math.min(100, Math.max(0, Number(f.minSuccessRate) || 0)),
      maxFrauds: Math.max(0, Number(f.maxFrauds) || 0),
    };
  }
  await settings.save();

  return NextResponse.json({ ok: true });
}
