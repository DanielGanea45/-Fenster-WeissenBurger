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
  { slug: "kunststoff-aluminium", datei: "produkte/kunststoff-aluminium-fenster/index.html", titel: "Kunststoff-Aluminium-Fenster", sektion: "produkte" },
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
  const rp = /<!--produkte-karten-->[\s\S]*?<!--\/produkte-karten-->/g; // Produktkarten kommen aus Admin → Produkte
  while ((m = rp.exec(html))) ranges.push([m.index, m.index + m[0].length]);
  return ranges;
}
const inRange = (ranges, i) => ranges.some(([a, b]) => i >= a && i < b);
function textOf(html) { return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim(); }

/* Abschnitte einer Seite für den Texte-Editor: je <section> ein Abschnitt, benannt nach der kleinen Zeile über der
   Überschrift („01 Produkte“ → „Produkte“) bzw. der Überschrift; der erste Abschnitt heißt „Oben auf der Seite“.
   Seiten ohne <section> (Impressum, Datenschutz) werden nach ihren Überschriften (h2) gegliedert. */
function abschnitteVon(html) {
  const liste = [];
  const sec = /<section\b[^>]*>/gi; let m;
  while ((m = sec.exec(html))) liste.push({ start: m.index, ende: html.indexOf("</section>", m.index), attrs: m[0] });
  if (!liste.length) { const h2 = /<h2\b[^>]*>([\s\S]*?)<\/h2>/gi; while ((m = h2.exec(html))) liste.push({ start: m.index, ende: html.length, titel: textOf(m[1]).slice(0, 60), ohneSection: true }); }
  liste.forEach((a, i) => {
    if (a.ohneSection) { a.key = "abschnitt-" + (i + 1); if (i + 1 < liste.length) a.ende = liste[i + 1].start; return; }
    const inner = html.slice(a.start, a.ende < 0 ? html.length : a.ende);
    const eyebrow = /<p\b[^>]*class="[^"]*\beyebrow\b[^"]*"[^>]*>([\s\S]*?)<\/p>/i.exec(inner);
    const kopf = /<h[12]\b[^>]*>([\s\S]*?)<\/h[12]>/i.exec(inner);
    const id = (a.attrs.match(/\sid="([^"]+)"/) || [])[1] || "";
    const hero = i === 0 || /\b(hero|phero)\b/.test(a.attrs) || id === "home";
    let titel = eyebrow ? textOf(eyebrow[1].replace(/^\s*<span[^>]*>[\s\S]*?<\/span>/i, "")) : kopf ? textOf(kopf[1]) : "";
    a.key = id || "abschnitt-" + (i + 1);
    a.titel = hero ? "Oben auf der Seite" : (titel || "Weitere Texte").slice(0, 60);
  });
  return liste;
}
function abschnittFuer(abschnitte, offset) {
  for (let i = abschnitte.length - 1; i >= 0; i--) { const a = abschnitte[i]; if (offset >= a.start && (a.ende < 0 || offset < a.ende)) return { key: a.key, titel: a.titel }; }
  if (!abschnitte.length || offset < abschnitte[0].start) return { key: "oben", titel: "Oben auf der Seite" };
  return { key: "weitere", titel: "Weitere Texte" };
}
const ROLLE = (tag, attrs, inner) => {
  if (/class="[^"]*\beyebrow\b/.test(attrs)) return "eyebrow";
  if (tag === "h1" || tag === "h2" || tag === "h3") return tag;
  if (/class="[^"]*\blead\b/.test(attrs)) return "lead";
  if (/^\s*<a\s[^>]*class="[^"]*\bbtn\b[^"]*"[^>]*>[\s\S]*<\/a>\s*$/.test(inner)) return "button";
  return "p";
};

function verarbeiteTexte(seite, html, registry) {
  const gesperrt = gesperrteBereiche(html);
  const abschnitte = abschnitteVon(html);
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
    const ab = abschnittFuer(abschnitte, offset);
    registry.bloecke[id] = { seite: seite.slug, tag: tag.toLowerCase(), html: inner.trim(), label: textOf(inner).slice(0, 70), geschuetzt: !!seite.geschuetzt, abschnitt: ab.key, abschnittTitel: ab.titel, rolle: ROLLE(tag.toLowerCase(), attrs, inner) };
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
