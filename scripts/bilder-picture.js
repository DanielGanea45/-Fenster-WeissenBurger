/* Build-Schritt „Bilder: AVIF-Quellen“: Jedes <img> mit WebP-Quelle, zu dem eine .avif-Datei existiert, wird in
   <picture><source type="image/avif" srcset="…"><img …></picture> gehüllt (gleiche Größenangaben, lazy/width/height
   bleiben am <img> → kein Layoutsprung, WebP als Rückfall). Idempotent; <img> innerhalb von <picture> bleiben unberührt.
   Läuft im Netlify-Build (NETLIFY gesetzt) oder mit --erzwingen; lokal ohne Flag nur Prüfung (--pruefen zeigt Kandidaten). */
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const AUSSCHLUSS = /[\\/](node_modules|\.git|\.netlify|design-[^\\/]*|firma ferestre|bilder-original[^\\/]*|admin)[\\/]/i;

function htmlDateien(root) {
  const out = [];
  (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (AUSSCHLUSS.test(p + path.sep)) continue; if (e.isDirectory()) walk(p); else if (/\.html$/.test(e.name)) out.push(p); } })(root);
  return out;
}
/* Pfad aus HTML (relativ zur Datei oder /-absolut) → Dateipfad */
function aufloesen(root, htmlDatei, url) {
  const ohneQuery = url.split(/[?#]/)[0];
  if (/^https?:|^data:/.test(ohneQuery)) return null;
  return ohneQuery.startsWith("/") ? path.join(root, ohneQuery) : path.join(path.dirname(htmlDatei), ohneQuery);
}
function avifSrcset(root, htmlDatei, srcset) {
  const teile = srcset.split(",").map((t) => t.trim()).filter(Boolean);
  const out = [];
  for (const t of teile) {
    const [url, deskriptor] = t.split(/\s+/);
    if (!/\.webp$/i.test(url)) return null;
    const f = aufloesen(root, htmlDatei, url); if (!f) return null;
    const avif = f.replace(/\.webp$/i, ".avif");
    if (!fs.existsSync(avif)) return null;
    out.push(url.replace(/\.webp$/i, ".avif") + (deskriptor ? " " + deskriptor : ""));
  }
  return out.length ? out.join(", ") : null;
}
function verarbeite(root, html, htmlDatei) {
  let n = 0;
  // <img …> außerhalb von <picture>: wir prüfen das Vorzeichen (letztes öffnendes Tag vor dem <img>)
  const out = html.replace(/<img\b[^>]*>/g, (tag, offset) => {
    const vorher = html.slice(Math.max(0, offset - 400), offset);
    if (/<picture\b[^>]*>\s*(<source\b[^>]*>\s*)*$/.test(vorher)) return tag;
    if (/\bdata-name="/.test(tag)) return tag; // vom Skript gesteuerte Bilder (Konfigurator-Vorschau): eine <source> würde spätere src-Wechsel überstimmen
    const srcset = (tag.match(/\bsrcset="([^"]*)"/) || [])[1];
    const src = (tag.match(/\bsrc="([^"]*)"/) || [])[1];
    const sizes = (tag.match(/\bsizes="([^"]*)"/) || [])[1];
    const quelle = srcset || src; if (!quelle) return tag;
    const avif = avifSrcset(root, htmlDatei, quelle); if (!avif) return tag;
    n++;
    return `<picture><source type="image/avif" srcset="${avif}"${sizes ? ` sizes="${sizes}"` : ""}>${tag}</picture>`;
  });
  return { html: out, n };
}
function lauf(root, { schreiben = true, log = console.log } = {}) {
  let bilder = 0, dateien = 0;
  for (const f of htmlDateien(root)) {
    const alt = fs.readFileSync(f, "utf8");
    const { html, n } = verarbeite(root, alt, f);
    if (n) { bilder += n; dateien++; if (schreiben) fs.writeFileSync(f, html); }
  }
  log(`Bilder: ${bilder} <img> in ${dateien} Seiten ${schreiben ? "mit AVIF-Quelle versehen" : "könnten eine AVIF-Quelle erhalten"}.`);
  return { bilder, dateien };
}
if (require.main === module) {
  const erzwingen = process.argv.includes("--erzwingen"), pruefen = process.argv.includes("--pruefen");
  if (!process.env.NETLIFY && !erzwingen && !pruefen) { console.log("Bilder: AVIF-Quellen werden nur im Netlify-Build eingesetzt (lokal: --erzwingen oder --pruefen)."); process.exit(0); }
  lauf(ROOT, { schreiben: !pruefen });
}
module.exports = { lauf, verarbeite, avifSrcset };
