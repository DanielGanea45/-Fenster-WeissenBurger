#!/usr/bin/env node
/* Erzeugt die Register der bearbeitbaren Inhalte für den Admin-Bereich:
     data/texte.json  – Textbausteine (h1/h2/h3/p) der Hauptseiten; die Elemente erhalten im HTML ein
                        stabiles Attribut data-text="…", das beim Build zum Einsetzen der Admin-Texte dient.
     data/bilder.json – Bilder (<img>) der Hauptseiten mit Seite, Quelle, Alt-Text, Maßen.
   Idempotent: vorhandene data-text-Kennungen bleiben erhalten; neue Elemente bekommen neue Nummern.
   Aufruf: node scripts/inhalte-registry.js  (mit --pruefen nur lesen, nichts schreiben) */
"use strict";
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const nurPruefen = process.argv.includes("--pruefen");

const SEITEN = [
  { slug: "startseite", datei: "index.html", titel: "Startseite", sektion: "startseite" },
  { slug: "leistungen", datei: "leistungen/index.html", titel: "Leistungen", sektion: "leistungen" },
  { slug: "referenzen", datei: "referenzen/index.html", titel: "Referenzen", sektion: "referenzen" },
  { slug: "produkte", datei: "produkte/index.html", titel: "Produkte (Übersicht)", sektion: "produkte" },
  { slug: "kunststofffenster", datei: "produkte/kunststofffenster-koemmerling/index.html", titel: "Kunststofffenster (Kömmerling)", sektion: "produkte" },
  { slug: "aluminiumfenster", datei: "produkte/aluminiumfenster-cortizo/index.html", titel: "Aluminiumfenster (Cortizo)", sektion: "produkte" },
  { slug: "schiebetueren", datei: "produkte/schiebetueren/index.html", titel: "Hebe-Schiebetüren", sektion: "produkte" },
  { slug: "haustueren", datei: "produkte/haustueren/index.html", titel: "Haustüren", sektion: "produkte" },
  { slug: "holzfenster", datei: "produkte/holzfenster/index.html", titel: "Holzfenster & mehr", sektion: "produkte" },
  { slug: "einsatzgebiet", datei: "einsatzgebiet/index.html", titel: "Einsatzgebiet (Übersicht)", sektion: "sonstiges" },
  { slug: "impressum", datei: "impressum.html", titel: "Impressum", sektion: "sonstiges", geschuetzt: true },
  { slug: "datenschutz", datei: "datenschutz.html", titel: "Datenschutzerklärung", sektion: "sonstiges", geschuetzt: true },
];
const INLINE = /^(a|b|strong|em|i|br|span|small|sup|sub|time|abbr|mark|wbr)$/i;

/* Bereiche, in denen nichts bearbeitet wird: Kopf, Navigation, Formulare, Fußzeilen, Skripte */
function gesperrteBereiche(html) {
  const ranges = [];
  const re = /<(header|nav|form|footer|noscript|template|script|style|svg)\b[\s\S]*?<\/\1>/gi;
  let m; while ((m = re.exec(html))) ranges.push([m.index, m.index + m[0].length]);
  return ranges;
}
const inRange = (ranges, i) => ranges.some(([a, b]) => i >= a && i < b);
function textOf(html) { return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim(); }

function verarbeiteTexte(seite, html, registry) {
  const gesperrt = gesperrteBereiche(html);
  const used = new Set();
  const reId = new RegExp(`data-text="${seite.slug}-(\\d+)"`, "g");
  let m, max = 0; while ((m = reId.exec(html))) { max = Math.max(max, Number(m[1])); used.add(Number(m[1])); }
  let next = max + 1, count = 0;
  const out = html.replace(/<(h1|h2|h3|p)(\s[^>]*)?>([\s\S]*?)<\/\1>/gi, (ganz, tag, attrs, inner, offset) => {
    if (inRange(gesperrt, offset)) return ganz;
    attrs = attrs || "";
    if (/\sdata-firma="/.test(attrs)) return ganz; // Firmendaten kommen aus Einstellungen → Firma & Kontakt, nicht aus dem Texte-Editor
    /* Nur Elemente mit reinem Inline-Inhalt */
    const tags = [...inner.matchAll(/<\/?([a-zA-Z0-9]+)/g)].map((x) => x[1]);
    if (tags.some((t) => !INLINE.test(t))) return ganz;
    if (!textOf(inner)) return ganz;
    if (/class="[^"]*\b(sr-only|eyebrow|price|preis|konf-)/.test(attrs) && tag.toLowerCase() === "p" && false) return ganz;
    let id;
    const have = attrs.match(/data-text="([^"]+)"/);
    if (have) id = have[1];
    else { id = `${seite.slug}-${next++}`; attrs += ` data-text="${id}"`; }
    count++;
    registry.bloecke[id] = { seite: seite.slug, tag: tag.toLowerCase(), html: inner.trim(), label: textOf(inner).slice(0, 70), geschuetzt: !!seite.geschuetzt };
    return `<${tag}${attrs}>${inner}</${tag}>`;
  });
  return { html: out, count };
}

function verarbeiteBilder(seite, html, registry) {
  const re = /<img\b[^>]*>/gi;
  let m, n = 0;
  const seen = {};
  while ((m = re.exec(html))) {
    const tag = m[0];
    const attr = (k) => { const x = tag.match(new RegExp(`\\s${k}="([^"]*)"`)); return x ? x[1] : ""; };
    const src = attr("src");
    if (!/^\/?assets\//.test(src) || /logo/.test(src)) continue;
    const base = path.basename(src).replace(/-\d+(?=\.\w+$)/, "").replace(/\.\w+$/, "");
    let id = `${seite.slug}-${base}`;
    if (seen[id] !== undefined) { seen[id]++; id += "-" + seen[id]; } else seen[id] = 1;
    /* Wrapper erkennen: <figure>/<li> direkt davor (ggf. mit <picture>) → löschbar */
    const vor = html.slice(Math.max(0, m.index - 400), m.index).replace(/\s+$/, "");
    const wrapper = (vor.match(/<(figure|li)\b[^>]*>\s*(<picture>\s*(<source[^>]*>\s*)*)?$/i) || [])[1] || "";
    registry.bilder[id] = { seite: seite.slug, sektion: seite.sektion, src: src.replace(/^\//, ""), srcset: attr("srcset"), alt: attr("alt"), titel: attr("alt").split(/[:.–]/)[0].trim().slice(0, 60) || base, breite: Number(attr("width")) || 0, hoehe: Number(attr("height")) || 0, loeschbar: !!wrapper, wrapper: wrapper.toLowerCase() };
    n++;
  }
  return n;
}

const texte = { hinweis: "Automatisch erzeugt (scripts/inhalte-registry.js). Bearbeitbare Textbausteine; Admin-Änderungen liegen im Netlify-Blob daten/texte und werden beim Build eingesetzt.", seiten: {}, bloecke: {} };
const bilder = { hinweis: "Automatisch erzeugt (scripts/inhalte-registry.js). Bilder der Hauptseiten; Ersetzungen liegen im Netlify-Blob daten/bilder.", bilder: {} };
let total = 0, totalBilder = 0;
for (const s of SEITEN) {
  const f = path.join(root, s.datei);
  if (!fs.existsSync(f)) { console.warn("fehlt:", s.datei); continue; }
  const html = fs.readFileSync(f, "utf8");
  texte.seiten[s.slug] = { titel: s.titel, datei: s.datei, geschuetzt: !!s.geschuetzt };
  const t = verarbeiteTexte(s, html, texte);
  if (t.html !== html && !nurPruefen) fs.writeFileSync(f, t.html);
  const b = verarbeiteBilder(s, html, bilder);
  total += t.count; totalBilder += b;
  console.log(`${s.datei}: ${t.count} Texte, ${b} Bilder`);
}
if (!nurPruefen) {
  fs.writeFileSync(path.join(root, "data/texte.json"), JSON.stringify(texte, null, 1) + "\n");
  fs.writeFileSync(path.join(root, "data/bilder.json"), JSON.stringify(bilder, null, 1) + "\n");
}
console.log(`Gesamt: ${total} Textbausteine, ${totalBilder} Bilder${nurPruefen ? " (nur geprüft)" : ""}`);
