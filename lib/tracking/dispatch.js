import crypto from "crypto";
import { connectDB } from "@/lib/mongoose";
import TrackingEvent from "@/models/TrackingEvent";
import { getTrackingConfig, resolveEventSetting } from "./config";
import { computeMatchKeys, maskEmail, maskPhone } from "./hash";
import { buildMetaPayload, sendToMeta } from "./meta";
import { buildGa4Payload, sendToGa4 } from "./ga4";

// Single entry point that both /api/events and trackServerEvent() call.
// Never throws — failures are captured in the returned/logged result so the
// caller (and the customer) is never affected.

export function newEventId() {
  return crypto.randomUUID();
}

async function withRetry(fn, retries = 1, delayMs = 300) {
  let result = await fn();
  let attempt = 0;
  while (result.status === "error" && attempt < retries) {
    attempt += 1;
    await new Promise((r) => setTimeout(r, delayMs));
    result = await fn();
  }
  return result;
}

function combineStatus(meta, ga4) {
  const states = [meta, ga4].filter((p) => p.attempted).map((p) => p.status);
  if (states.length === 0) return "skipped";
  if (states.every((s) => s === "success")) return "success";
  if (states.every((s) => s === "error")) return "error";
  return "partial";
}

const SKIPPED = { attempted: false, status: "skipped", httpStatus: 0, latencyMs: 0, request: null, response: null, error: "", endpoint: "" };

/**
 * Dispatch one event to Meta CAPI and/or GA4 MP per config, then log it.
 *
 * @param {object} evt
 * @param {string} evt.eventName            e.g. "Purchase" or a custom name
 * @param {string} [evt.eventId]            shared dedup id (generated if absent)
 * @param {"client"|"server"} [evt.source]
 * @param {number} [evt.eventTime]          unix seconds
 * @param {string} [evt.eventSourceUrl]
 * @param {string} [evt.actionSource]       Meta action_source
 * @param {object} [evt.userData]           RAW (unhashed) PII + fbp/fbc
 * @param {object} [evt.customData]         value, currency, contents, etc.
 * @param {object} [evt.ga4]                { clientId, sessionId, userId, params }
 * @param {string} [evt.ip]                 resolved client IP
 * @param {string} [evt.userAgent]          client UA
 * @param {boolean} [evt.testMode]          override config.testMode
 * @param {string[]} [evt.only]             restrict to ["meta"] or ["ga4"] (used by retry)
 * @returns {Promise<object>} log-shaped result
 */
export async function dispatchEvent(evt) {
  const config = await getTrackingConfig();
  const eventId = evt.eventId || newEventId();
  const source = evt.source === "client" ? "client" : "server";
  const eventName = evt.eventName;
  const evCfg = resolveEventSetting(config, eventName);
  const testMode = evt.testMode != null ? Boolean(evt.testMode) : Boolean(config.testMode);

  // Fold the resolved IP/UA into userData so Meta gets first-class signals.
  const userData = { ...(evt.userData || {}) };
  if (evt.ip && !userData.clientIpAddress) userData.clientIpAddress = evt.ip;
  if (evt.userAgent && !userData.clientUserAgent) userData.clientUserAgent = evt.userAgent;

  const customData = evt.customData || {};
  const only = evt.only; // for targeted retries

  const serverAllowed = evCfg.enabled && evCfg.server;
  const wantMeta =
    serverAllowed &&
    config.meta?.capiEnabled &&
    evCfg.meta &&
    Boolean(config.meta?.pixelId && config.meta?.accessToken) &&
    (!only || only.includes("meta"));
  const wantGa4 =
    serverAllowed &&
    config.ga4?.mpEnabled &&
    evCfg.ga4 &&
    Boolean(config.ga4?.measurementId && config.ga4?.apiSecret) &&
    (!only || only.includes("ga4"));

  // Fire both platforms concurrently; one failing never blocks the other.
  const [metaResult, ga4Result] = await Promise.all([
    wantMeta
      ? withRetry(() =>
          sendToMeta({
            config,
            payload: buildMetaPayload({
              eventName,
              eventId,
              eventTime: evt.eventTime,
              eventSourceUrl: evt.eventSourceUrl,
              actionSource: evt.actionSource || (source === "server" ? "website" : "website"),
              userData,
              customData,
              testEventCode: testMode ? config.meta?.testEventCode : undefined,
              defaultCountryCode: config.meta?.defaultCountryCode,
            }),
          })
        )
      : Promise.resolve({ ...SKIPPED }),
    wantGa4
      ? withRetry(() =>
          sendToGa4({
            config,
            payload: buildGa4Payload({
              eventName,
              clientId: evt.ga4?.clientId,
              sessionId: evt.ga4?.sessionId,
              userId: evt.ga4?.userId,
              eventId,
              customData,
              extraParams: evt.ga4?.params,
              clientIp: evt.ip,
            }),
            userAgent: evt.userAgent,
            debug: testMode,
          })
        )
      : Promise.resolve({ ...SKIPPED }),
  ]);

  const status = combineStatus(metaResult, ga4Result);
  const totalLatencyMs = Math.max(metaResult.latencyMs || 0, ga4Result.latencyMs || 0);

  // Persist the log row. Wrapped so a logging failure never affects the send.
  let logId = null;
  try {
    await connectDB();
    const retentionDays = config.logRetentionDays || 30;
    const doc = await TrackingEvent.create({
      eventId,
      eventName,
      source,
      testMode,
      user: {
        emailMasked: maskEmail(userData.email),
        phoneMasked: maskPhone(userData.phone),
        ip: evt.ip || userData.clientIpAddress || "",
        userAgent: evt.userAgent || userData.clientUserAgent || "",
      },
      matchKeys: computeMatchKeys(userData),
      inbound: {
        eventName,
        source,
        actionSource: evt.actionSource,
        eventSourceUrl: evt.eventSourceUrl,
        ga4: evt.ga4 ? { clientId: evt.ga4.clientId, sessionId: evt.ga4.sessionId } : null,
      },
      customData,
      value: Number(customData.value || 0),
      currency: customData.currency || "",
      meta: metaResult,
      ga4: ga4Result,
      status,
      totalLatencyMs,
      expireAt: new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000),
    });
    logId = doc._id.toString();
  } catch (err) {
    console.error("[tracking] failed to write event log:", err.message);
  }

  return { logId, eventId, eventName, source, status, testMode, meta: metaResult, ga4: ga4Result };
}
