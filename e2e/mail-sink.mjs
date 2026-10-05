// A local mail sink for the end-to-end run: the ERP's worker sends the shop's
// emails (sign-up codes, reset links, order mails) here instead of to real
// inboxes, and the tests read them over a small HTTP API.
//
// The ERP only ever speaks SMTP with TLS (STARTTLS required, D-529), so the
// sink offers STARTTLS with the self-signed certificate in e2e/.mail-sink/
// (made once by `npm run e2e:cert`); the ERP's worker is started with
// NODE_EXTRA_CA_CERTS pointing at it. Nothing here is used outside tests.
//
//   node e2e/mail-sink.mjs            SMTP on 127.0.0.1:2525, HTTP on 127.0.0.1:2580
//   GET  /messages?to=<address>       the messages to that address, newest first
//   DELETE /messages                  forget everything

import { readFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { simpleParser } from "mailparser";
import { SMTPServer } from "smtp-server";

const here = path.dirname(fileURLToPath(import.meta.url));

export async function startMailSink({
  smtpPort = Number(process.env.MAIL_SINK_SMTP_PORT || 2525),
  httpPort = Number(process.env.MAIL_SINK_HTTP_PORT || 2580),
  certDir = path.join(here, ".mail-sink"),
} = {}) {
  const messages = [];

  const smtp = new SMTPServer({
    secure: false,
    key: readFileSync(path.join(certDir, "key.pem")),
    cert: readFileSync(path.join(certDir, "cert.pem")),
    authOptional: true,
    disabledCommands: ["AUTH"],
    banner: "elysium e2e mail sink",
    logger: false,
    onData(stream, session, callback) {
      simpleParser(stream)
        .then((mail) => {
          messages.unshift({
            to: session.envelope.rcptTo.map((r) => r.address.toLowerCase()),
            from: session.envelope.mailFrom?.address || "",
            subject: mail.subject || "",
            text: mail.text || "",
            html: typeof mail.html === "string" ? mail.html : "",
            receivedAt: new Date().toISOString(),
          });
          if (messages.length > 500) messages.length = 500;
          callback();
        })
        .catch(callback);
    },
  });
  await new Promise((resolve, reject) => {
    smtp.once("error", reject);
    smtp.listen(smtpPort, "127.0.0.1", resolve);
  });

  const api = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname === "/messages" && req.method === "DELETE") {
      messages.length = 0;
      res.writeHead(204).end();
      return;
    }
    if (url.pathname === "/messages") {
      const to = (url.searchParams.get("to") || "").toLowerCase();
      const found = to ? messages.filter((m) => m.to.includes(to)) : messages;
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(found));
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise((resolve) => api.listen(httpPort, "127.0.0.1", resolve));

  return {
    smtpPort,
    httpPort,
    async stop() {
      await new Promise((resolve) => smtp.close(resolve));
      await new Promise((resolve) => api.close(resolve));
    },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sink = await startMailSink();
  console.log(`mail sink: SMTP 127.0.0.1:${sink.smtpPort}, HTTP 127.0.0.1:${sink.httpPort}`);
}
