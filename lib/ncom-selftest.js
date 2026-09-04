import mongoose from "mongoose";
import Product from "../models/Product.js";
import { signatureHeader } from "./ncom-signature.js";
import {
  getNcomConfig, siteOrigin, CONNECTOR_BASE_PATH, CONNECTOR_CONTRACT, PRICE_CURRENCY,
} from "./ncom.js";

// Our own conformance check, run against our own connector over the public
// internet — the same thing `pnpm check:connector` does at their end, but
// available before you hand ncom a URL and press Test.
//
// It runs the real HTTP path deliberately: signing requests in-process would
// prove the code is right and prove nothing about the thing that actually
// breaks — a reverse proxy stripping a header, a firewall, a base URL with a
// typo in it, or a server clock five minutes out.
//
// Nothing here writes. The reserve check asks for an impossible quantity, which
// must be refused; on the vanishing chance it is not, the hold is released
// immediately.

const TIMEOUT_MS = 8000;

function makeLog() {
  const lines = [];
  const push = (level) => (text) => lines.push({ level, text });
  return { lines, info: push("info"), warn: push("warn"), error: push("error"), ok: push("success") };
}

export async function runSelfTest({ origin: originOverride } = {}) {
  const log = makeLog();
  const checks = [];
  const add = (id, label, status, detail) => {
    checks.push({ id, label, status, detail: detail || "" });
    const level = status === "pass" ? "ok" : status === "fail" ? "error" : status === "warn" ? "warn" : "info";
    log[level](`${status.toUpperCase().padEnd(4)} ${label}${detail ? ` — ${detail}` : ""}`);
  };

  const cfg = await getNcomConfig({ fresh: true });

  // ── Preconditions ────────────────────────────────────────────────────────
  if (!cfg.connectorSecret) {
    add("secret", "Connector signing secret stored", "fail",
      "Press Connect on ncom's Settings → Product source and paste the key id and secret here.");
    return { ok: false, log: log.lines, checks };
  }
  add("secret", "Connector signing secret stored", "pass", cfg.connectorSource === "env" ? "from environment" : "from settings");

  if (!cfg.connectorKeyId) {
    add("keyid", "Connector key id stored", "warn",
      "Requests will be accepted on the signature alone. Storing the key id is what stops another workspace's signed request from reading this catalogue.");
  } else {
    add("keyid", "Connector key id stored", "pass");
  }

  const base = String(originOverride || siteOrigin(cfg) || "").replace(/\/+$/, "");
  if (!base) {
    add("origin", "Public base URL known", "fail",
      "Set NEXT_PUBLIC_SITE_URL on the server, or fill in the public base URL below.");
    return { ok: false, log: log.lines, checks };
  }
  if (!/^https:\/\//i.test(base)) {
    // Local development is the normal reason to see this, so it is a warning,
    // not a failure — but ncom refuses a plain-http product source outright.
    add("origin", "Public base URL is HTTPS", "warn", `${base} — ncom refuses plain http:// in production.`);
  } else {
    add("origin", "Public base URL is HTTPS", "pass", base);
  }

  const connectorUrl = base + CONNECTOR_BASE_PATH;

  if (!cfg.enabled) {
    add("enabled", "Serving switched on", "fail", "Every endpoint answers 503 until you turn it on.");
  } else {
    add("enabled", "Serving switched on", "pass");
  }

  // ── Index health ─────────────────────────────────────────────────────────
  // /stock runs on every cart render against a 4-second timeout. Without an
  // index on the variant subdocument id that is a full collection scan, and
  // subdocument _ids get no index for free.
  try {
    const existing = await Product.collection.indexes();
    const hasVariantIndex = existing.some((i) => Object.keys(i.key || {}).includes("variants._id"));
    if (hasVariantIndex) {
      add("index", "Variant id index present", "pass");
    } else {
      await Product.createIndexes();
      add("index", "Variant id index present", "warn", "It was missing and has just been built.");
    }
  } catch (e) {
    add("index", "Variant id index present", "warn", `Could not check: ${e.message}`);
  }

  // Everything below leaves this process and comes back through the front door.
  if (process.env.DEMO_MODE) {
    add("http", "Live endpoint checks", "skip", "Skipped in demo mode — outbound requests are blocked.");
    return { ok: !checks.some((c) => c.status === "fail"), log: log.lines, checks, connectorUrl };
  }

  // ── HTTP helper ──────────────────────────────────────────────────────────
  async function call(path, { method = "GET", body = null, signature, keyId, contract } = {}) {
    const raw = body === null ? "" : JSON.stringify(body);
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(connectorUrl + path, {
        method,
        headers: {
          "X-NCOM-Key": keyId === undefined ? cfg.connectorKeyId : keyId,
          "X-NCOM-Contract": contract === undefined ? CONNECTOR_CONTRACT : contract,
          "X-NCOM-Timestamp": String(Math.floor(Date.now() / 1000)),
          "X-NCOM-Signature": signature === undefined ? signatureHeader(cfg.connectorSecret, raw) : signature,
          "User-Agent": "NCOM-Catalog/1 (elysium self-test)",
          ...(body === null ? {} : { "Content-Type": "application/json" }),
        },
        body: body === null ? undefined : raw,
        signal: abort.signal,
        cache: "no-store",
        redirect: "manual",
      });

      const text = await res.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        /* left null — the checks below report "not JSON", which is the finding */
      }
      return { status: res.status, json, text, headers: res.headers };
    } catch (e) {
      return { status: 0, json: null, text: "", error: e.name === "AbortError" ? `no answer within ${TIMEOUT_MS}ms` : e.message };
    } finally {
      clearTimeout(timer);
    }
  }

  // ── /ping ────────────────────────────────────────────────────────────────
  const ping = await call("/ping");
  if (ping.status === 0) {
    add("ping", "GET /ping reachable", "fail", `${connectorUrl}/ping — ${ping.error}`);
    log.error("Nothing else can be checked until the connector answers. Is the base URL right, and is this server reachable from the internet?");
    return { ok: false, log: log.lines, checks, connectorUrl };
  }
  if (!ping.json) {
    add("ping", "GET /ping returns JSON", "fail",
      `HTTP ${ping.status} with a non-JSON body — that is a web page, not a connector. Check the base URL.`);
    return { ok: false, log: log.lines, checks, connectorUrl };
  }
  if (ping.status !== 200 || ping.json.ok !== true) {
    add("ping", "GET /ping handshake", "fail", `HTTP ${ping.status} — ${ping.json?.error?.message || "not ok"}`);
  } else {
    add("ping", "GET /ping handshake", "pass",
      `contract ${ping.json.contract}, ${ping.json.currency}, ${Object.entries(ping.json.capabilities || {}).filter(([, v]) => v).map(([k]) => k).join(" ")}`);
    if (ping.json.currency !== PRICE_CURRENCY) {
      add("currency", "Declared currency", "warn", `${ping.json.currency} — the ncom workspace must be set to the same.`);
    }
  }

  // ── Authentication must actually refuse ──────────────────────────────────
  const unsigned = await call("/ping", { signature: "" });
  add("auth-unsigned", "Unsigned request refused", unsigned.status === 401 ? "pass" : "fail",
    unsigned.status === 401 ? "" : `answered ${unsigned.status} — anyone who learns this URL can read your catalogue`);

  const forged = await call("/ping", { signature: `t=${Math.floor(Date.now() / 1000)},v1=${"0".repeat(64)}` });
  add("auth-forged", "Wrong signature refused", forged.status === 401 ? "pass" : "fail",
    forged.status === 401 ? "" : `answered ${forged.status}`);

  const stale = Math.floor(Date.now() / 1000) - 3600;
  const staleRes = await call("/ping", { signature: signatureHeader(cfg.connectorSecret, "", stale) });
  add("auth-replay", "Replayed request refused", staleRes.status === 401 ? "pass" : "fail",
    staleRes.status === 401 ? "an hour-old signature is rejected" : `answered ${staleRes.status} — a captured request could be replayed`);

  if (cfg.connectorKeyId) {
    const wrongKey = await call("/ping", { keyId: "ncomcat_not_this_workspace" });
    add("auth-key", "Foreign key id refused", wrongKey.status === 401 ? "pass" : "warn",
      wrongKey.status === 401 ? "" : `answered ${wrongKey.status}`);
  }

  // ── /products ────────────────────────────────────────────────────────────
  const list = await call("/products?limit=3");
  const products = list.json?.products;
  if (list.status !== 200 || !Array.isArray(products)) {
    add("products", "GET /products", "fail", `HTTP ${list.status} — ${list.json?.error?.message || "no products array"}`);
    return { ok: false, log: log.lines, checks, connectorUrl };
  }
  add("products", "GET /products", "pass",
    `${products.length} returned${list.json.total != null ? ` of ${list.json.total}` : ""}`);

  const sample = products[0];
  if (!sample) {
    add("shape", "Product shape", "warn", "No products to inspect — publish one and run this again.");
    return { ok: !checks.some((c) => c.status === "fail"), log: log.lines, checks, connectorUrl };
  }

  const missing = ["id", "title", "status", "variants"].filter((k) => sample[k] === undefined);
  add("shape", "Product shape", missing.length ? "fail" : "pass",
    missing.length ? `missing ${missing.join(", ")}` : `${sample.title} — ${sample.variants.length} variant(s), ${sample.images?.length || 0} image(s)`);

  const variant = (sample.variants || [])[0];
  if (variant) {
    const priceLooksRight = typeof variant.price === "string" && /^\d+(\.\d{2})?$/.test(variant.price);
    add("price", "Variant price is a decimal string", priceLooksRight ? "pass" : "warn",
      `${variant.title}: ${variant.price}`);
  }

  if (sample.images?.length) {
    const img = sample.images[0].url;
    add("images", "Image URLs are absolute HTTPS", /^https:\/\//i.test(img) ? "pass" : "warn", img.slice(0, 90));
  } else {
    add("images", "Image URLs are absolute HTTPS", "warn", "The first product carries no usable image URL.");
  }

  // ── ids are honoured, which is what makes a saved offer resolve ──────────
  const target = products[products.length - 1];
  const byIds = await call(`/products?ids=${encodeURIComponent(target.id)}`);
  const returned = byIds.json?.products || [];
  const honoursIds = returned.length === 1 && returned[0]?.id === target.id;
  add("ids", "?ids= returns exactly those products", honoursIds ? "pass" : "fail",
    honoursIds ? "" : `asked for 1, got ${returned.length} — every saved offer would render the wrong products`);

  // ── one product, and a missing one ───────────────────────────────────────
  const one = await call(`/products/${encodeURIComponent(target.id)}`);
  const oneId = one.json?.product?.id ?? one.json?.id;
  add("product-one", "GET /products/{id}", one.status === 200 && oneId === target.id ? "pass" : "fail",
    one.status === 200 ? "" : `HTTP ${one.status}`);

  const byHandle = await call(`/products/${encodeURIComponent(target.handle || target.id)}`);
  add("product-handle", "GET /products/{handle}", byHandle.status === 200 ? "pass" : "warn",
    byHandle.status === 200 ? "" : `HTTP ${byHandle.status}`);

  const ghost = await call("/products/000000000000000000000000");
  add("product-404", "A missing product answers 404", ghost.status === 404 ? "pass" : "fail",
    ghost.status === 404 ? "" : `answered ${ghost.status} — an offer for a deleted product would not hide itself`);

  // ── /stock ───────────────────────────────────────────────────────────────
  if (variant) {
    const stock = await call("/stock", { method: "POST", body: { ids: [variant.id, "000000000000000000000000"] } });
    const rows = stock.json?.stock || [];
    const known = rows.find((r) => r.id === variant.id);
    const unknown = rows.find((r) => r.id === "000000000000000000000000");
    add("stock", "POST /stock", stock.status === 200 && known ? "pass" : "fail",
      known ? `${variant.sku || variant.id} → ${known.available} (${known.policy})` : `HTTP ${stock.status}`);
    add("stock-unknown", "An unknown id is not sellable", unknown && unknown.available === 0 ? "pass" : "warn",
      unknown ? `available ${unknown.available}` : "no row returned for an unknown id");
  }

  // ── /reserve ─────────────────────────────────────────────────────────────
  if (cfg.capabilities.reserve && variant) {
    const orderRef = `selftest-${Math.floor(Date.now() / 1000)}-${variant.id.slice(-6)}`;
    const impossible = await call("/reserve", {
      method: "POST",
      body: { orderRef, lines: [{ variantId: variant.id, quantity: 1_000_000 }] },
    });
    const refused = impossible.status === 200 && impossible.json?.ok === false;
    add("reserve", "POST /reserve refuses an impossible quantity", refused ? "pass" : "fail",
      refused
        ? impossible.json.rejected?.[0]?.reason || ""
        : `HTTP ${impossible.status} ok=${impossible.json?.ok} — two shoppers could buy the same last unit`);

    if (impossible.json?.ok === true) {
      // Should be unreachable, but a million units held by a self-test is not a
      // thing to leave behind on the strength of "should".
      await call("/release", { method: "POST", body: { orderRef } });
      log.warn("The impossible reservation was accepted and has been released again.");
    }

    const release = await call("/release", { method: "POST", body: { orderRef: `${orderRef}-never-held` } });
    add("release", "POST /release is idempotent", release.status === 200 && release.json?.ok === true ? "pass" : "warn",
      release.status === 200 ? "releasing something never held is a no-op" : `HTTP ${release.status}`);
  } else {
    add("reserve", "POST /reserve", "skip",
      cfg.capabilities.reserve ? "no variant to test with" : "Holding stock is switched off for this connector.");
  }

  // ── /categories ──────────────────────────────────────────────────────────
  if (cfg.capabilities.categories) {
    const cats = await call("/categories");
    add("categories", "GET /categories", cats.status === 200 && Array.isArray(cats.json?.categories) ? "pass" : "fail",
      cats.status === 200 ? `${cats.json.categories.length} categor(ies)` : `HTTP ${cats.status}`);
  } else {
    add("categories", "GET /categories", "skip", "Switched off for this connector.");
  }

  // ── a typo'd path must still be JSON ─────────────────────────────────────
  const typo = await call("/prodcuts");
  add("typo", "A mistyped path answers JSON, not HTML", typo.status === 404 && typo.json ? "pass" : "warn",
    typo.json ? "" : `HTTP ${typo.status} with a non-JSON body`);

  const failed = checks.filter((c) => c.status === "fail").length;
  const warned = checks.filter((c) => c.status === "warn").length;
  if (failed) log.error(`${failed} check(s) failed. Fix those before connecting the product source.`);
  else if (warned) log.warn(`Everything essential passed, with ${warned} thing(s) worth a look.`);
  else log.ok("Every check passed. Paste the connector URL into ncom and press Test.");

  return { ok: failed === 0, log: log.lines, checks, connectorUrl, mongooseReady: mongoose.connection.readyState };
}
