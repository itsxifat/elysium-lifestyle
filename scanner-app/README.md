# Elysium Scanner (Android app)

A tiny native scanner for warehouse packing. Staff sign in with their **ERP
account** (the brand ERP at `erp.elysium-lifestyle.bd`), scan the barcode on a shipping label, and instantly see the full
**packing list** for that shipment (every item with its size, quantity, colour
and SKU) — tap each one to check it off.

It uses Google **ML Kit** for scanning natively, so it does **not** depend on
the phone's Chrome/browser camera (which is what was failing on the web page).

- **Tech:** [Capacitor](https://capacitorjs.com) 6 + `@capacitor-mlkit/barcode-scanning`
- **App id:** `cloud.enfinito.elyscanner`
- **Web assets:** `www/` (plain HTML/JS/CSS — no build step)
- **Talks to:** the brand ERP: `POST /v1/scanner/sign-in` and `GET /v1/scanner/shipment?code=` (M35b), default
  server `https://erp.elysium-lifestyle.bd`. The website no longer has staff sign-in or scanner routes (M36).
  A new APK build is needed to ship this change; the response shapes are checked when M35b lands.

## Build the APK

You normally don't build by hand — the GitHub Actions workflow
`.github/workflows/build-scanner-apk.yml` builds, signs and publishes the APK to
`public/app/elysium-scanner.apk`. To build locally you need **JDK 17** and the
**Android SDK**:

```bash
cd scanner-app
npm install
npx cap add android      # generates the native android/ project
npx cap sync android
cd android
./gradlew assembleRelease
# → android/app/build/outputs/apk/release/app-release-unsigned.apk  (then sign it)
```

See [`docs/scanner-app.md`](../docs/scanner-app.md) for signing, hosting and how
staff install it on their phones.
