#!/usr/bin/env node
/* Setzt Bewertungs-Badge und Kundenstimmen-Karten in die Seiten ein (Markierungen <!--bewertungen-badge--> und
   <!--bewertungen-karten-->), aus data/bewertungen.json (freigegebene Bewertungen) und data/einstellungen.json
   (Noten, Anzahl, Links). Läuft im Build (scripts/build.js) und lokal. Aufruf: node scripts/bewertungen-einsetzen.js [--pruefen] */
"use strict";
const fs = require("fs");
const path = require("path");
const lib = require(path.join(__dirname, "..", "netlify", "functions", "_lib", "bewertungen"));

function dateien(root) {
  const out = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) { if (!/^(node_modules|\.git|\.claude|admin|netlify|assets|data|js|css|docs|tests|scripts|einsatzgebiet|konfigurator)$/.test(e.name) && !/^design-/.test(e.name)) walk(f); } else if (e.name.endsWith(".html")) out.push(f); } };
  walk(root);
  return out;
}
function lauf(root, liste, einst, nurPruefen) {
  if (!liste) liste = JSON.parse(fs.readFileSync(path.join(root, "data", "bewertungen.json"), "utf8"));
  if (!einst) einst = JSON.parse(fs.readFileSync(path.join(root, "data", "einstellungen.json"), "utf8"));
  let marker = 0, geaendert = 0;
  for (const f of dateien(root)) {
    const alt = fs.readFileSync(f, "utf8");
    if (!/<!--bewertungen-(badge|karten)/.test(alt)) continue;
    const r = lib.einsetzen(alt, liste, einst);
    marker += r.n;
    if (r.html !== alt) { geaendert++; if (!nurPruefen) fs.writeFileSync(f, r.html); }
  }
  return { marker, geaendert };
}
module.exports = { lauf };
if (require.main === module) {
  const root = process.env.FW_ROOT ? path.resolve(process.env.FW_ROOT) : path.join(__dirname, "..");
  const pruefen = process.argv.includes("--pruefen");
  const r = lauf(root, null, null, pruefen);
  console.log(`Bewertungen: ${r.marker} Markierungen geprüft, ${r.geaendert} Datei(en) ${pruefen ? "würden geändert" : "geändert"}.`);
  if (pruefen && r.geaendert) process.exit(1);
}
