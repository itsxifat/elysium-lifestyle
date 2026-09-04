import mongoose from "mongoose";
import { tenantModel } from "@enfinito/demo-kit/model";
import { STANDARD_EVENTS, DEFAULT_META_API_VERSION } from "@/lib/tracking/constants";

// Per-event routing/enable settings. Lets the admin, for example, turn off
// AddToCart server-side while keeping it firing client-side, or send Purchase
// to Meta only.
const eventSettingSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    enabled: { type: Boolean, default: true }, // master switch for the event
    client: { type: Boolean, default: true }, // fire pixel/gtag in browser
    server: { type: Boolean, default: true }, // fire CAPI/MP from server
    meta: { type: Boolean, default: true }, // include Meta (CAPI) server-side
    ga4: { type: Boolean, default: true }, // include GA4 (MP) server-side
  },
  { _id: false }
);

// Single settings document (like models/Settings.js). All credentials live here
// so the admin panel can change them live without a redeploy.
const trackingConfigSchema = new mongoose.Schema(
  {
    meta: {
      pixelEnabled: { type: Boolean, default: false }, // browser pixel
      capiEnabled: { type: Boolean, default: false }, // server Conversions API
      pixelId: { type: String, default: "" },
      accessToken: { type: String, default: "" }, // secret — masked in UI
      testEventCode: { type: String, default: "" },
      datasetId: { type: String, default: "" }, // optional; defaults to pixelId
      apiVersion: { type: String, default: DEFAULT_META_API_VERSION },
      defaultCountryCode: { type: String, default: "880" }, // for E.164 phone normalize
    },
    ga4: {
      clientEnabled: { type: Boolean, default: false }, // browser gtag.js
      mpEnabled: { type: Boolean, default: false }, // server Measurement Protocol
      measurementId: { type: String, default: "" }, // G-XXXXXXX
      apiSecret: { type: String, default: "" }, // secret — masked in UI
    },
    // First-party proxy paths the client helper loads scripts/beacons from.
    // Must match the Nginx config. Kept here so they can be renamed live.
    proxy: {
      metaScriptPath: { type: String, default: "/e1/s.js" }, // proxies fbevents.js
      metaCollectPath: { type: String, default: "/e1/t" }, // proxies facebook.com/tr (via sub_filter)
      ga4ScriptPath: { type: String, default: "/e2/s.js" }, // proxies gtag/js
      ga4CollectPath: { type: String, default: "/e2" }, // gtag transport_url base -> Nginx /e2/g/collect
    },
    testMode: { type: Boolean, default: false }, // route to Meta Test Events / GA debug
    events: { type: [eventSettingSchema], default: () => defaultEvents() },
    logRetentionDays: { type: Number, default: 30 },
  },
  { timestamps: true }
);

function defaultEvents() {
  return STANDARD_EVENTS.map((name) => ({
    name,
    enabled: true,
    client: true,
    server: true,
    meta: true,
    ga4: true,
  }));
}

// Tenant-aware: resolves to the current request's sandbox database in
// demo mode, and to the default connection otherwise. Import sites unchanged.
const TrackingConfig = tenantModel("TrackingConfig", trackingConfigSchema);
export default TrackingConfig;
