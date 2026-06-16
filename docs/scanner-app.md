# Elysium Scanner — native Android packing app

The warehouse scanner that staff **install on their phones**, so it no longer
depends on the browser camera (which was being blocked). It scans the barcode on
a shipping label and shows the **full packing list** for that shipment — every
item with size, quantity, colour and SKU — and lets the packer tick each one off.

```
Phone app  ──login(email+pw)──►  POST /api/admin/scanner/login   ──►  bearer token
           ──scan label──────►  GET  /api/admin/scanner/shipment?code=…  (Bearer token)
                                  └─► order items + recipient + COD  ──►  packing list
```

- App source: [`scanner-app/`](../scanner-app) (Capacitor 6, ML Kit scanning)
- Server endpoints: `app/api/admin/scanner/{login,shipment}/route.js`
- Auth: each staff signs in with their **own admin account**; the server
  re-checks their role/permission (`orders.view`) on every request, exactly like
  the web admin. No shared key, full audit trail.

## 1. Server side — nothing new to configure

The endpoints sign tokens with the existing **`NEXTAUTH_SECRET`** — no new env
var is needed. Just make sure `NEXTAUTH_SECRET` is set (it already must be for
the site to work). Only staff with the `orders.view` permission can sign in.

## 2. Build & publish the APK (GitHub Actions)

You don't build by hand. The workflow
[`.github/workflows/build-scanner-apk.yml`](../.github/workflows/build-scanner-apk.yml)
does it:

1. Go to the repo **Actions** tab → **Build scanner APK** → **Run workflow**.
   (It also runs automatically whenever you change anything in `scanner-app/`.)
2. It compiles, signs and **commits** the APK to `public/app/elysium-scanner.apk`
   and flips `public/app/version.json` to `available: true`.
3. **Redeploy the site** so the new files ship. The Install button on
   `/admin/scan` then appears and links to `/app/elysium-scanner.apk`.

### Signing key (do this once, recommended)

Without a keystore the workflow generates a throwaway one each run — the APK
still installs, but **app updates require uninstalling the old app first**
(Android refuses an update signed by a different key). To get seamless updates,
create one persistent keystore and add it as repo secrets:

```bash
keytool -genkeypair -v -keystore release.keystore -alias elysium \
  -keyalg RSA -keysize 2048 -validity 9125 \
  -storepass 'CHOOSE_A_PASSWORD' -keypass 'CHOOSE_A_PASSWORD' \
  -dname "CN=Elysium Scanner, O=Elysium Lifestyle, C=BD"
base64 -w0 release.keystore   # copy this output
```

Repo → **Settings → Secrets and variables → Actions** → add:

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | the base64 output above |
| `ANDROID_KEYSTORE_PASSWORD` | the store password you chose |
| `ANDROID_KEY_ALIAS` | `elysium` |
| `ANDROID_KEY_PASSWORD` | the key password you chose |

Keep `release.keystore` somewhere safe and **out of git** — losing it means
future updates again need an uninstall-first.

### Building locally (optional)

Needs **JDK 17** + the **Android SDK**:

```bash
cd scanner-app
npm install
npx cap add android && npx cap sync android
cd android && ./gradlew assembleRelease
# sign android/app/build/outputs/apk/release/app-release-unsigned.apk with apksigner
```

## 3. Install on a staff phone

1. On the phone, open the admin site → **Scan Product** → **Install app**
   (or browse straight to `https://YOUR-DOMAIN/app/elysium-scanner.apk`).
2. Android warns about installing outside the Play Store → **allow "install
   unknown apps"** for the browser, then **Install**. (One-time per phone.)
3. Open **Elysium Scanner**, enter the **server address** (`https://YOUR-DOMAIN`)
   and sign in with the staff member's admin email + password.
4. Tap **Scan label**, point at the barcode → the packing list appears. Tap each
   item to check it off; **Scan next** for the following parcel.

## 4. Updating the app

Bump `version` in [`scanner-app/package.json`](../scanner-app/package.json), let
the workflow rebuild, redeploy. Phones reinstall from the same Install button.
(With a persistent keystore this is an in-place update; otherwise uninstall first.)

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Install button missing | APK not built yet, or site not redeployed after the build. Check `public/app/version.json` shows `available: true`. |
| "Scanner is still installing" | First run downloads Google's scanner module via Play Services — wait a few seconds and scan again. Needs Google Play Services on the phone. |
| "No shipment found" | The label's code didn't match `courier.trackingCode`, `orderNumber`, or `consignmentId`. Confirm the order exists / is in the courier. |
| "Session expired" | Token older than 30 days — just sign in again. |
| "This account can't access the scanner" | The user lacks the `orders.view` permission. Grant it in admin → roles/users. |
| Can't reach server | Check the server address is the full `https://…` origin and the phone has internet. |
