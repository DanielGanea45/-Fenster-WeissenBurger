#!/usr/bin/env node
/* Sicherheits-Kopfzeilen der öffentlichen Seiten: Content-Security-Policy als EINE Quelle.
   Der Build schreibt sie in die Datei `_headers` (Netlify liest sie aus dem Veröffentlichungsordner); die übrigen
   Kopfzeilen (X-Frame-Options, Referrer-Policy …) stehen in netlify.toml. Streng: nur eigene Quellen – der KI-Assistent
   spricht ausschließlich mit der eigenen Netlify Function (connect-src 'self'), nichts Fremdes im Browser.
   Aufruf: node scripts/headers.js [--pruefen] */
"use strict";
const fs = require("fs");
const path = require("path");

const LOGO_STIL_HASH = "'sha256-iI6R5uwJVQojgZLUEcPZSFv4d5Dx3yu48qFGa6t/lhU='";
const FRC = "https://eu.frcapi.com https://global.frcapi.com"; // Friendly Captcha (vorbereitet)

function csp() {
  return [
    "default-src 'self'",
    "img-src 'self' data:",
    "media-src 'self'",
    `style-src 'self' ${LOGO_STIL_HASH}`,
    "script-src 'self'",
    `connect-src 'self' ${FRC}`,
    "worker-src 'self' blob:",
    "font-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
    "base-uri 'self'",
  ].join("; ");
}
function text() {
  return "# Automatisch erzeugt von scripts/headers.js – nicht von Hand bearbeiten.\n/*\n  Content-Security-Policy: " + csp() + "\n";
}
function schreiben(root) {
  const t = text();
  const f = path.join(root, "_headers");
  const alt = fs.existsSync(f) ? fs.readFileSync(f, "utf8") : null;
  if (alt !== t) fs.writeFileSync(f, t);
  return alt !== t;
}
module.exports = { csp, text, schreiben, LOGO_STIL_HASH };

if (require.main === module) {
  const root = process.env.FW_ROOT ? path.resolve(process.env.FW_ROOT) : path.join(__dirname, "..");
  if (process.argv.includes("--pruefen")) {
    const f = path.join(root, "_headers");
    const ok = fs.existsSync(f) && fs.readFileSync(f, "utf8") === text();
    console.log(ok ? "_headers aktuell." : "_headers weicht ab – node scripts/headers.js ausführen.");
    process.exit(ok ? 0 : 1);
  }
  console.log(schreiben(root) ? "_headers geschrieben." : "_headers unverändert.");
}
