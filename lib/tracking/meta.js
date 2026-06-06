import { buildMetaUserData } from "./hash";
import { DEFAULT_META_API_VERSION } from "./constants";

// Build + send a single event to the Meta Conversions API.
// Returns a structured result (never throws) so the dispatcher can log it and
// keep firing the other platform.

const GRAPH = "https://graph.facebook.com";

// Compose the CAPI payload for one event. `userData` is raw (unhashed) — we
// hash here. action_source: "website" for browser-origin events, the caller can
// override (e.g. "system_generated" for backend-only signals).
export function buildMetaPayload({
  eventName,
  eventId,
  eventTime,
  eventSourceUrl,
  actionSource = "website",
  userData = {},
  customData = {},
  testEventCode,
  defaultCountryCode,
}) {
  const data = {
    event_name: eventName,
    event_time: eventTime || Math.floor(Date.now() / 1000),
    action_source: actionSource,
    user_data: buildMetaUserData(userData, { defaultCountryCode }),
  };
  if (eventId) data.event_id = eventId;
  if (eventSourceUrl) data.event_source_url = eventSourceUrl;
  if (customData && Object.keys(customData).length) data.custom_data = customData;

  const payload = { data: [data] };
  if (testEventCode) payload.test_event_code = testEventCode;
  return payload;
}

export async function sendToMeta({ config, payload }) {
  const version = config.meta?.apiVersion || DEFAULT_META_API_VERSION;
  const target = config.meta?.datasetId || config.meta?.pixelId;
  const endpoint = `${GRAPH}/${version}/${target}/events`;
  const url = `${endpoint}?access_token=${encodeURIComponent(config.meta.accessToken)}`;

  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    const latencyMs = Date.now() - started;
    // Meta returns 200 with events_received on success, or an `error` object.
    const ok = res.ok && !body.error;
    return {
      attempted: true,
      status: ok ? "success" : "error",
      httpStatus: res.status,
      latencyMs,
      request: payload,
      response: body,
      error: ok ? "" : body?.error?.message || `HTTP ${res.status}`,
      endpoint,
    };
  } catch (err) {
    return {
      attempted: true,
      status: "error",
      httpStatus: 0,
      latencyMs: Date.now() - started,
      request: payload,
      response: null,
      error: err?.message || "Network error",
      endpoint,
    };
  }
}
