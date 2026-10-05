#!/usr/bin/env node
// Makes the self-signed certificate the end-to-end mail sink offers with
// STARTTLS (the ERP never sends email in the clear). Written to e2e/.mail-sink/
// (gitignored); start the ERP's worker with NODE_EXTRA_CA_CERTS pointing at
// e2e/.mail-sink/cert.pem so it trusts the sink. Needs `openssl` on the PATH
// (Git for Windows ships one).

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "e2e", ".mail-sink");
mkdirSync(dir, { recursive: true });
const cert = path.join(dir, "cert.pem");
if (existsSync(cert) && !process.argv.includes("--force")) {
  console.log(`exists: ${cert} (use --force to replace it)`);
  process.exit(0);
}
execFileSync(
  "openssl",
  [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes",
    "-keyout", path.join(dir, "key.pem"),
    "-out", cert,
    "-days", "825",
    "-subj", "/CN=localhost",
    "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1",
  ],
  { stdio: "inherit", env: { ...process.env, MSYS_NO_PATHCONV: "1" } }
);
console.log(`written: ${cert}`);
