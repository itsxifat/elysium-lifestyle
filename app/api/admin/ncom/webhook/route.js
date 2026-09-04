export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import Settings from "@/models/Settings";
import { requireAdmin } from "@/lib/auth";
import { listWebhooks, registerWebhook, WEBHOOK_TOPICS, invalidateNcomConfig } from "@/lib/ncom";

// GET — what ncom currently has registered, plus their delivery health.
export async function GET() {
  const { error } = await requireAdmin("settings.manage");
  if (error) return error;

  await connectDB();
  try {
    return NextResponse.json({ ok: true, webhooks: await listWebhooks(), topics: WEBHOOK_TOPICS });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message, code: e.code });
  }
}

// POST — register (or re-point) our receiver and capture the signing secret.
// ncom shows a webhook secret once, so if the response carries one we store it
// immediately; otherwise the admin pastes it by hand.
export async function POST(request) {
  const { error } = await requireAdmin("settings.manage");
  if (error) return error;

  const { url, replace } = await request.json().catch(() => ({}));
  if (!url || !/^https?:\/\//i.test(url)) {
    return NextResponse.json({ ok: false, error: "A valid absolute URL is required" }, { status: 400 });
  }

  await connectDB();

  try {
    const result = await registerWebhook(url, { replace: !!replace });

    let secretStored = false;
    if (result.secret) {
      let settings = await Settings.findOne({});
      if (!settings) settings = await Settings.create({});
      settings.ncom = { ...(settings.ncom || {}), webhookSecret: result.secret };
      await settings.save();
      invalidateNcomConfig();
      secretStored = true;
    }

    return NextResponse.json({ ok: true, ...result, secret: undefined, secretStored });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message, code: e.code }, { status: 400 });
  }
}
