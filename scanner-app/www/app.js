/* Elysium Scanner — native warehouse packing scanner.
 *
 * Plain JS (no bundler) so the APK stays tiny and the build is trivial.
 * Capacitor exposes native plugins at runtime via Capacitor.Plugins.<Name>,
 * so we can call them without importing the JS wrappers. On a desktop browser
 * (dev) those plugins are absent — we degrade gracefully to manual entry. */

const Plugins = (window.Capacitor && window.Capacitor.Plugins) || {};
const Pref = Plugins.Preferences;
const BarcodeScanner = Plugins.BarcodeScanner;
const Haptics = Plugins.Haptics;
const Browser = Plugins.Browser;       // opens the website login in a Custom Tab
const CapApp = Plugins.App;            // receives the elyscanner:// deep link back

const state = { server: "", token: "", name: "", role: "", result: null, packed: new Set() };

/* ── storage (Preferences on device, localStorage in a browser) ───────── */
const store = {
  async get(k) { try { return Pref ? (await Pref.get({ key: k })).value : localStorage.getItem(k); } catch { return null; } },
  async set(k, v) { try { Pref ? await Pref.set({ key: k, value: v }) : localStorage.setItem(k, v); } catch {} },
  async del(k) { try { Pref ? await Pref.remove({ key: k }) : localStorage.removeItem(k); } catch {} },
};

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const taka = (n) => "৳" + Number(n || 0).toLocaleString("en-US");

function show(screen) {
  ["login", "scan", "result"].forEach((s) => { $("screen-" + s).hidden = s !== screen; });
}

async function haptic(kind) {
  try {
    if (!Haptics) return;
    if (kind === "found") await Haptics.notification({ type: "SUCCESS" });
    else await Haptics.impact({ style: "MEDIUM" });
  } catch {}
}

/* ── API ──────────────────────────────────────────────────────────────── */
function base() { return state.server.replace(/\/+$/, ""); }

async function apiLogin(server, email, password) {
  const res = await fetch(server.replace(/\/+$/, "") + "/api/admin/scanner/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || "Sign in failed");
  return d;
}

async function apiShipment(code) {
  const res = await fetch(base() + "/api/admin/scanner/shipment?code=" + encodeURIComponent(code), {
    headers: { Authorization: "Bearer " + state.token },
  });
  if (res.status === 401) { await logout(); throw new Error("Session expired — please sign in again."); }
  const d = await res.json().catch(() => ({}));
  if (!res.ok && res.status !== 200) throw new Error(d.error || "Lookup failed");
  return d;
}

/* ── Login ────────────────────────────────────────────────────────────── */
$("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("login-error");
  err.hidden = true;
  const server = $("in-server").value.trim();
  const email = $("in-email").value.trim();
  const password = $("in-password").value;
  if (!server || !email || !password) { err.textContent = "Fill in every field."; err.hidden = false; return; }

  const btn = $("btn-login");
  btn.disabled = true; btn.textContent = "Signing in…";
  try {
    const d = await apiLogin(server, email, password);
    state.server = server.replace(/\/+$/, "");
    state.token = d.token;
    state.name = d.user?.name || email;
    state.role = d.user?.role || "";
    await store.set("server", state.server);
    await store.set("token", state.token);
    await store.set("name", state.name);
    await store.set("role", state.role);
    enterScan();
  } catch (e2) {
    err.textContent = e2.message || "Sign in failed"; err.hidden = false;
  } finally {
    btn.disabled = false; btn.textContent = "Sign in";
  }
});

/* Web / Google sign-in: open the website login in a Chrome Custom Tab. After the
   admin signs in (Google or email there) the site bounces back via the
   elyscanner:// deep link carrying a token (see /scanner-connect). Pasting the
   code shown on that page is the fallback when the deep link doesn't fire. */
function showLoginError(msg) {
  const err = $("login-error");
  err.textContent = msg || ""; err.hidden = !msg;
}

async function finishLogin(token, name, role) {
  if (!token) return;
  // If the deep link cold-started the app, state.server may not be populated yet
  // (it was persisted before we opened the login tab) — recover it from storage.
  if (!state.server) state.server = (await store.get("server")) || "";
  state.token = token;
  state.name = name || state.name || "Signed in";
  state.role = role || "";
  await store.set("token", state.token);
  await store.set("name", state.name);
  await store.set("role", state.role);
  if (state.server) await store.set("server", state.server);
  if (Browser && Browser.close) { try { await Browser.close(); } catch {} }
  enterScan();
}

async function webLogin() {
  showLoginError("");
  const server = $("in-server").value.trim();
  if (!server) { showLoginError("Enter the server address first."); return; }
  state.server = server.replace(/\/+$/, "");
  await store.set("server", state.server);
  const url = state.server + "/scanner-connect";
  try {
    if (Browser && Browser.open) await Browser.open({ url, presentationStyle: "popover" });
    else window.location.href = url;
  } catch {
    showLoginError("Couldn't open the login page.");
  }
}
$("btn-web-login").addEventListener("click", webLogin);

// Deep link back from the website: elyscanner://auth?token=…&name=…&role=…
function handleAuthUrl(url) {
  if (!url || url.indexOf("token=") === -1) return;
  const get = (k) => {
    const m = new RegExp("[?&]" + k + "=([^&]+)").exec(url);
    return m ? decodeURIComponent(m[1].replace(/\+/g, " ")) : "";
  };
  const token = get("token");
  if (token) finishLogin(token, get("name"), get("role"));
}
if (CapApp && CapApp.addListener) {
  CapApp.addListener("appUrlOpen", (data) => handleAuthUrl(data && data.url));
}

// Toggles + paste-code fallback
$("toggle-pw").addEventListener("click", () => {
  const f = $("login-form"); f.hidden = !f.hidden;
  if (!f.hidden) $("in-email").focus();
});
$("toggle-code").addEventListener("click", () => {
  const r = $("paste-row"); r.hidden = !r.hidden;
  if (!r.hidden) $("in-code").focus();
});
$("btn-code-go").addEventListener("click", () => {
  const code = $("in-code").value.trim();
  if (code) { $("in-code").value = ""; finishLogin(code); }
  else showLoginError("Paste the code first.");
});

async function logout() {
  state.token = ""; state.name = ""; state.role = ""; state.result = null;
  await store.del("token");
  $("in-password").value = "";
  show("login");
}
$("btn-logout").addEventListener("click", logout);

function enterScan() {
  $("who").textContent = state.name + (state.role ? " · " + state.role : "");
  $("scan-status").hidden = true;
  show("scan");
}

/* ── Scanning ─────────────────────────────────────────────────────────── */
function setScanStatus(msg, isErr) {
  const el = $("scan-status");
  el.textContent = msg; el.hidden = !msg; el.classList.toggle("err", !!isErr);
}

async function doScan() {
  if (!BarcodeScanner) { setScanStatus("Scanner not available — type the number below.", true); return; }
  setScanStatus("");
  try {
    if (BarcodeScanner.isGoogleBarcodeScannerModuleAvailable) {
      const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
      if (!available) {
        setScanStatus("Preparing scanner (first run only)…");
        try { await BarcodeScanner.installGoogleBarcodeScannerModule(); } catch {}
      }
    }
    const { barcodes } = await BarcodeScanner.scan();
    const code = barcodes && barcodes[0] && (barcodes[0].rawValue || barcodes[0].displayValue);
    if (!code) { setScanStatus(""); return; }
    haptic("impact");
    await lookup(code.trim());
  } catch (e) {
    const m = (e && e.message) || String(e);
    if (/cancel/i.test(m)) { setScanStatus(""); return; }      // user backed out
    if (/module/i.test(m)) { setScanStatus("Scanner is still installing — try again in a moment.", true); return; }
    setScanStatus("Scan failed: " + m, true);
  }
}
$("btn-scan").addEventListener("click", doScan);
$("btn-scan-next").addEventListener("click", () => { show("scan"); doScan(); });

$("manual-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const v = $("in-manual").value.trim();
  if (v) { lookup(v); $("in-manual").value = ""; }
});

/* ── Lookup + render ──────────────────────────────────────────────────── */
async function lookup(code) {
  setScanStatus("Looking up " + code + "…");
  try {
    const d = await apiShipment(code);
    setScanStatus("");
    state.result = d;
    state.packed = new Set();
    if (d.found) haptic("found");
    renderResult(d);
    show("result");
  } catch (e) {
    setScanStatus(e.message || "Lookup failed", true);
  }
}

function renderResult(d) {
  const body = $("result-body");
  if (!d.found) {
    $("result-progress").textContent = "";
    body.innerHTML =
      '<div class="notfound"><div class="big">🔍</div><h2>No shipment found</h2>' +
      '<p class="muted">Scanned code: <b>' + esc(d.code) + "</b></p>" +
      '<p class="muted small">It may not be packed yet, or the label is from another system.</p></div>';
    return;
  }
  const o = d.order;
  const codClass = o.paid ? "paid" : "due";
  const codText = o.paid ? "PAID" : taka(o.codAmount);

  const head =
    '<div class="order-head">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">' +
        '<div><div class="order-num">' + esc(o.orderNumber) + "</div>" +
          '<div class="order-meta">' + (o.consignmentId ? "CN " + esc(o.consignmentId) + " · " : "") +
            esc(o.totalUnits) + " item" + (o.totalUnits === 1 ? "" : "s") + " · " + esc(o.itemCount) + " line" + (o.itemCount === 1 ? "" : "s") + "</div></div>" +
        '<span class="tag">' + esc(o.status || "—") + "</span>" +
      "</div>" +
      '<div class="recipient"><b>' + esc(o.recipient.name) + "</b><br>" +
        esc(o.recipient.phone) + '<br><span class="muted small">' + esc(o.recipient.address) + "</span></div>" +
      '<div class="cod-row"><span class="muted">' + (o.paid ? "Payment" : "Collect (COD)") + "</span>" +
        '<span class="cod-amt ' + codClass + '">' + codText + "</span></div>" +
    "</div>";

  const note = o.notes ? '<div class="note-box">📝 ' + esc(o.notes) + "</div>" : "";

  const items = o.items.map((it, i) => {
    const ph = "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="56" height="64"><rect width="56" height="64" fill="%23EDE8DF"/></svg>');
    const img = it.image ? esc(it.image) : ph;
    const ret = it.returnedQuantity > 0 ? '<span class="returned">' + esc(it.returnedQuantity) + " returned</span>" : "";
    return (
      '<div class="item" data-i="' + i + '">' +
        '<img class="item-thumb" src="' + img + '" onerror="this.src=\'' + ph + "'\" alt=\"\" />" +
        '<div class="item-main">' +
          '<div class="item-name">' + esc(it.name) + "</div>" +
          (it.sku ? '<div class="item-sub">' + esc(it.sku) + "</div>" : "") +
          '<div class="item-attrs">' +
            '<span class="size-chip">Size ' + esc(it.size || "—") + "</span>" +
            '<span class="qty-chip">× ' + esc(it.quantity) + "</span>" +
            (it.color ? '<span class="color-chip">' + esc(it.color) + "</span>" : "") +
            ret +
          "</div>" +
        "</div>" +
        '<div class="check">✓</div>' +
      "</div>"
    );
  }).join("");

  body.innerHTML = head + note + '<p class="items-title">Pack these items</p>' + items;

  body.querySelectorAll(".item").forEach((el) => {
    el.addEventListener("click", () => {
      const i = el.getAttribute("data-i");
      if (state.packed.has(i)) state.packed.delete(i); else { state.packed.add(i); haptic("impact"); }
      el.classList.toggle("packed", state.packed.has(i));
      updateProgress(o.items.length);
    });
  });
  updateProgress(o.items.length);
}

function updateProgress(total) {
  $("result-progress").textContent = state.packed.size + " / " + total + " packed";
}
$("btn-back").addEventListener("click", () => show("scan"));

/* ── Boot ─────────────────────────────────────────────────────────────── */
(async function boot() {
  state.server = (await store.get("server")) || "";
  state.token = (await store.get("token")) || "";
  state.name = (await store.get("name")) || "";
  state.role = (await store.get("role")) || "";
  if (state.server) $("in-server").value = state.server;
  if (state.token) enterScan(); else show("login");
})();
