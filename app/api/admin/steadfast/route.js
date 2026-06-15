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
  const settings = await Settings.findOne({}).select("steadfast").lean();
  const cfg = settings?.steadfast || {};
  return NextResponse.json({
    enabled: !!cfg.enabled,
    apiKey: cfg.apiKey || "",
    secretKey: cfg.secretKey ? MASK : "", // never expose the real secret
    hasSecret: !!cfg.secretKey,
    baseUrl: cfg.baseUrl || "https://portal.packzy.com/api/v1",
    autoSendOnProcessing: cfg.autoSendOnProcessing !== false,
    webhookToken: cfg.webhookToken || "",
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
  await settings.save();

  return NextResponse.json({ ok: true });
}
