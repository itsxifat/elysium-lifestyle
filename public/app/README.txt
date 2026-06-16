This folder serves the installable Android scanner app.

elysium-scanner.apk is built and dropped here by the GitHub Actions workflow
.github/workflows/build-scanner-apk.yml — it is NOT committed by hand.

Once present, it is served at /app/elysium-scanner.apk and the "Install Android
app" button on /admin/scan links to it. version.json holds the current version
so the admin page can show it.
