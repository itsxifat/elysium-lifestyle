import { connectDB } from "@/lib/mongoose";
import TrackingConfig from "@/models/TrackingConfig";
import { defaultEventSetting } from "./constants";

// Loads the singleton TrackingConfig with a short in-process cache so we don't
// hit Mongo on every event. Admin saves call bustConfigCache() (same process)
// so live edits take effect immediately; otherwise the cache self-expires.

const MASK = "••••••••";
let cache = { doc: null, at: 0 };
const TTL_MS = 15_000;

export function bustConfigCache() {
  cache = { doc: null, at: 0 };
}

export async function getTrackingConfig({ fresh = false } = {}) {
  if (!fresh && cache.doc && Date.now() - cache.at < TTL_MS) return cache.doc;
  await connectDB();
  let doc = await TrackingConfig.findOne({}).lean();
  if (!doc) {
    const created = await TrackingConfig.create({});
    doc = created.toObject();
  }
  cache = { doc, at: Date.now() };
  return doc;
}

// Resolve routing for a given event name; unknown/custom events get permissive
// defaults so arbitrary custom events still fire.
export function resolveEventSetting(config, eventName) {
  const found = config?.events?.find((e) => e.name === eventName);
  return found || defaultEventSetting(eventName);
}

// Client-safe projection (NO secrets) for the public /api/tracking/config route
// the browser helper reads to know what/where to fire.
export function clientSafeConfig(config) {
  return {
    meta: {
      pixelEnabled: Boolean(config.meta?.pixelEnabled),
      pixelId: config.meta?.pixelId || "",
    },
    ga4: {
      clientEnabled: Boolean(config.ga4?.clientEnabled),
      measurementId: config.ga4?.measurementId || "",
    },
    proxy: {
      metaScriptPath: config.proxy?.metaScriptPath || "/e1/s.js",
      metaCollectPath: config.proxy?.metaCollectPath || "/e1/t",
      ga4ScriptPath: config.proxy?.ga4ScriptPath || "/e2/s.js",
      ga4CollectPath: config.proxy?.ga4CollectPath || "/e2",
    },
    testMode: Boolean(config.testMode),
    // Only the client-relevant per-event flags.
    events: (config.events || []).map((e) => ({
      name: e.name,
      enabled: e.enabled,
      client: e.client,
    })),
  };
}

// Mask secrets for the admin GET. Same pattern as models/Settings redact().
export function redactConfig(config) {
  const c = JSON.parse(JSON.stringify(config));
  if (c.meta?.accessToken) c.meta.accessToken = MASK;
  if (c.ga4?.apiSecret) c.ga4.apiSecret = MASK;
  return c;
}

// Drop masked secret placeholders from an incoming admin PUT so we never
// overwrite a real stored token with "••••••••".
export function stripMaskedSecrets(update) {
  if (update?.meta && [MASK, ""].includes(update.meta.accessToken)) delete update.meta.accessToken;
  if (update?.ga4 && [MASK, ""].includes(update.ga4.apiSecret)) delete update.ga4.apiSecret;
  return update;
}

export { MASK };
