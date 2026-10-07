#!/usr/bin/env node
/* Cache-Busting per Inhalts-Hash: Jede Referenz auf css/*.css und js/*.js in allen HTML-Dateien bekommt
   ?v=<8 Zeichen SHA-1 des Dateiinhalts>. Ändert sich eine Datei, ändert sich die URL – Browser mit altem
   Cache (z. B. aus der Zeit mit 7-Tage-Cache) laden die neue Version zwingend. Läuft bei jedem Build
   (scripts/build.js) vor den Tests; kann auch von Hand ausgeführt werden: node scripts/assets-version.js [--pruefen] */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const AUSSCHLUSS = /[\\/](node_modules|\.git|\.netlify|design-[^\\/]*|firma ferestre|bilder-original)[\\/]/i;

function hashVon(datei) { return crypto.createHash("sha1").update(fs.readFileSync(datei)).digest("hex").slice(0, 8); }

/* Hashes aller CSS/JS-Dateien unter root (ohne Vendor-Unterordner) */
function assetHashes(root) {
  const out = {};
  for (const ordner of ["css", "js"]) {
    const d = path.join(root, ordner);
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d)) if (/\.(css|js)$/.test(f)) out[ordner + "/" + f] = hashVon(path.join(d, f));
  }
  return out;
}
function htmlDateien(root) {
  const out = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (AUSSCHLUSS.test(p + (e.isDirectory() ? path.sep : ""))) continue;
      if (e.isDirectory()) walk(p);
      else if (/\.html$/.test(e.name)) out.push(p);
    }
  })(root);
  return out;
}
/* Ersetzt …(css|js)/<name>.(css|js)?v=<alt> → ?v=<hash>; relative und absolute Pfade */
function versioniere(root, { pruefen = false } = {}) {
  const hashes = assetHashes(root);
  const re = /((?:^|[^a-zA-Z0-9_.-])(?:\/|\.\.\/|\.\/)?)((?:css|js)\/[a-zA-Z0-9_.-]+\.(?:css|js))\?v=([a-zA-Z0-9_.-]+)/g;
  let dateien = 0, stellen = 0;
  for (const f of htmlDateien(root)) {
    const alt = fs.readFileSync(f, "utf8");
    let n = 0;
    const neu = alt.replace(re, (m, prefix, asset, v) => { const h = hashes[asset]; if (!h || h === v) return m; n++; return `${prefix}${asset}?v=${h}`; });
    if (n) { stellen += n; dateien++; if (!pruefen) fs.writeFileSync(f, neu); }
  }
  return { hashes, dateien, stellen };
}

module.exports = { versioniere, assetHashes, hashVon };

if (require.main === module) {
  const pruefen = process.argv.includes("--pruefen");
  const r = versioniere(path.join(__dirname, ".."), { pruefen });
  console.log(`Asset-Versionen: ${Object.keys(r.hashes).length} Dateien gehasht, ${r.stellen} Referenzen in ${r.dateien} HTML-Dateien ${pruefen ? "würden aktualisiert" : "aktualisiert"}.`);
  if (pruefen && r.stellen) process.exit(1);
}
