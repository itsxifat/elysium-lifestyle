// Registers the elyscanner:// deep link on MainActivity so the website can bounce
// the signed-in admin back into the app (Google/email login → token).
//
// The native android/ project is generated fresh in CI (`npx cap add android`),
// so we patch its AndroidManifest.xml here instead of committing the project.
// Capacitor's MainActivity is launchMode="singleTask", so the VIEW intent reuses
// the running task and fires the JS `appUrlOpen` event. Idempotent.

import { readFileSync, writeFileSync } from "node:fs";

const path = "android/app/src/main/AndroidManifest.xml";
let xml = readFileSync(path, "utf8");

if (xml.includes('android:scheme="elyscanner"')) {
  console.log("Deep-link intent filter already present — nothing to do.");
  process.exit(0);
}

const intentFilter = `
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="elyscanner" />
            </intent-filter>`;

// Insert just before the first </activity> (Capacitor's single MainActivity).
const idx = xml.indexOf("</activity>");
if (idx === -1) {
  console.error("Could not find </activity> in AndroidManifest.xml");
  process.exit(1);
}
xml = xml.slice(0, idx) + intentFilter + "\n        " + xml.slice(idx);
writeFileSync(path, xml);
console.log("Added elyscanner:// deep-link intent filter to AndroidManifest.xml");
