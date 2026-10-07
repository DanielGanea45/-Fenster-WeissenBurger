#!/usr/bin/env node
/* Setzt die Firmendaten aus data/einstellungen.json (Admin → Einstellungen → Firma & Kontakt, Öffnungszeiten,
   Website) in alle HTML-Seiten ein: data-firma-Marker (Adresse, Telefon, E-Mail, Öffnungszeiten, Impressum,
   Datenschutz, JSON-LD) und das Ankündigungsbanner. Läuft bei jedem Netlify-Build (scripts/build.js) und kann
   lokal aufgerufen werden: node scripts/firma-einsetzen.js [--pruefen] */
"use strict";
const fs = require("fs");
const path = require("path");
const firma = require("../netlify/functions/_lib/firma");
const SITE = "https://fenster-weissenburger.de";

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".") || e.name === "node_modules" || e.name === "firma ferestre" || e.name.startsWith("bilder-original") || e.name.startsWith("design-") || e.name === "assets" || e.name === "admin") continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f, out); else if (e.name.endsWith(".html")) out.push(f);
  }
  return out;
}
function lauf(root, einst, opt = {}) {
  einst = einst || JSON.parse(fs.readFileSync(path.join(root, "data/einstellungen.json"), "utf8"));
  let dateien = 0, marker = 0, banner = 0;
  for (const f of walk(root, [])) {
    const alt = fs.readFileSync(f, "utf8");
    let { html, n } = firma.einsetzen(alt, einst, SITE);
    const mitBanner = firma.bannerEinsetzen(html, einst);
    if (mitBanner !== html) { banner++; html = mitBanner; }
    marker += n;
    if (html !== alt) { dateien++; if (!opt.pruefen) fs.writeFileSync(f, html); }
  }
  return { dateien, marker, banner };
}
if (require.main === module) {
  const root = process.env.FW_ROOT ? path.resolve(process.env.FW_ROOT) : path.join(__dirname, "..");
  const r = lauf(root, null, { pruefen: process.argv.includes("--pruefen") });
  console.log(`Firmendaten: ${r.marker} Marker geprüft, ${r.dateien} Datei(en) ${process.argv.includes("--pruefen") ? "würden geändert" : "geändert"}, Banner in ${r.banner} Datei(en) angepasst.`);
}
module.exports = { lauf, walk };
