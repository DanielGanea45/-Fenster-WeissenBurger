#!/usr/bin/env node
/* Sicherheits-Kopfzeilen der öffentlichen Seiten: Content-Security-Policy als EINE Quelle.
   Der Build schreibt sie in die Datei `_headers` (Netlify liest sie aus dem Veröffentlichungsordner); die übrigen
   Kopfzeilen (X-Frame-Options, Referrer-Policy …) stehen in netlify.toml.
   Zwei Varianten:
     - streng (Standard): nur eigene Quellen, Inline-Stile nur über den Hash des Logo-Stils
     - mit Live-Chat (Crisp): zusätzlich die Crisp-Domänen – und 'unsafe-inline' für Stile, weil der Chat seine Farben als
       Inline-Stil setzt (Browser ignorieren 'unsafe-inline', sobald ein Hash dabei steht – deshalb entfällt der Hash hier).
   Die Chat-Variante gilt nur, wenn der Chat wirklich eingeschaltet ist (Kennung vorhanden + Schalter im Admin an).
   Aufruf: node scripts/headers.js [--chat] [--pruefen] */
"use strict";
const fs = require("fs");
const path = require("path");

const LOGO_STIL_HASH = "'sha256-iI6R5uwJVQojgZLUEcPZSFv4d5Dx3yu48qFGa6t/lhU='";
/* Crisp-Domänen laut Crisp-Dokumentation (Whitelisting our systems): nur die für den Chat nötigen */
const CRISP = {
  client: "https://client.crisp.chat",      // Skript, Stile, Schriften, Einstellungen, Web Worker, Medien
  relay: "wss://client.relay.crisp.chat",   // Nachrichten (WebSocket)
  rescue: "wss://client.relay.rescue.crisp.chat", // Ausweich-WebSocket bei Störungen
  image: "https://image.crisp.chat",        // Avatare und Bilder
  storage: "https://storage.crisp.chat",    // Dateien im Chat (hoch-/herunterladen)
};
const FRC = "https://eu.frcapi.com https://global.frcapi.com"; // Friendly Captcha (vorbereitet)

function csp(opt) {
  const chat = !!(opt && opt.chat);
  const d = [
    "default-src 'self'",
    "img-src 'self' data:" + (chat ? ` ${CRISP.image} ${CRISP.client}` : ""),
    "media-src 'self'" + (chat ? ` ${CRISP.client}` : ""),
    chat ? `style-src 'self' 'unsafe-inline' ${CRISP.client}` : `style-src 'self' ${LOGO_STIL_HASH}`,
    "script-src 'self'" + (chat ? ` ${CRISP.client}` : ""),
    `connect-src 'self' ${FRC}` + (chat ? ` ${CRISP.client} ${CRISP.relay} ${CRISP.rescue} ${CRISP.storage}` : ""),
    "worker-src 'self' blob:" + (chat ? ` ${CRISP.client}` : ""),
    "font-src 'self'" + (chat ? ` ${CRISP.client}` : ""),
    "form-action 'self'",
    "frame-ancestors 'self'",
    "base-uri 'self'",
  ];
  return d.join("; ");
}
/* Chat eingeschaltet? Kennung (Umgebungsvariable CRISP_WEBSITE_ID) UND Schalter Einstellungen → Website → Live-Chat */
function chatAktiv(einst, id) {
  const kennung = String(id == null ? process.env.CRISP_WEBSITE_ID || "" : id).trim();
  return /^[0-9a-f-]{20,64}$/i.test(kennung) && !!(einst && einst.website && einst.website.liveChat === true);
}
function text(opt) {
  return "# Automatisch erzeugt von scripts/headers.js – nicht von Hand bearbeiten. Variante: " + (opt && opt.chat ? "mit Live-Chat (Crisp)" : "streng (ohne Chat)") + "\n/*\n  Content-Security-Policy: " + csp(opt) + "\n";
}
function schreiben(root, opt) {
  const t = text(opt);
  const f = path.join(root, "_headers");
  const alt = fs.existsSync(f) ? fs.readFileSync(f, "utf8") : null;
  if (alt !== t) fs.writeFileSync(f, t);
  return alt !== t;
}
module.exports = { csp, text, schreiben, chatAktiv, CRISP, LOGO_STIL_HASH };

if (require.main === module) {
  const root = process.env.FW_ROOT ? path.resolve(process.env.FW_ROOT) : path.join(__dirname, "..");
  const chat = process.argv.includes("--chat");
  if (process.argv.includes("--pruefen")) {
    const f = path.join(root, "_headers");
    const ok = fs.existsSync(f) && fs.readFileSync(f, "utf8") === text({ chat });
    console.log(ok ? "_headers aktuell." : "_headers weicht ab – node scripts/headers.js ausführen.");
    process.exit(ok ? 0 : 1);
  }
  console.log(schreiben(root, { chat }) ? "_headers geschrieben." : "_headers unverändert.");
}
