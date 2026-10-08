#!/usr/bin/env node
/* Text-Duplikate: prüft alle öffentlichen HTML-Seiten auf doppelte Texte ZWISCHEN verschiedenen Seiten.
   Aufruf: node scripts/text-duplikate.js            → Zusammenfassung + die ersten 40 Funde
           node scripts/text-duplikate.js --bericht  → vollständiger Bericht
   Exit-Code 1, sobald es Funde gibt (Build-Schranke; tests/text-duplikate.test.js führt die Prüfung aus).

   Geprüft werden alle index.html im Projekt sowie die HTML-Dateien im Wurzelordner – ohne admin/, 404.html,
   danke.html, wartung.html, node_modules und Entwurfsordner. Aus jeder Seite wird der Haupttext gewonnen:
   ohne <header>, <nav>, <footer>, <form>, <script>, <style>, <noscript>, <template>, <svg>, ohne Elemente mit
   data-firma (Firmendaten aus den Einstellungen), ohne Buttons/CTA-Links (.btn), ohne die H1 (eigene Prüfung
   unten) und ohne den Produktkarten-Block zwischen <!--produkte-karten--> und <!--/produkte-karten--> (Admin → Produkte).

   Satzvergleich: Sätze mit mindestens 8 Wörtern werden kleingeschrieben, Satzzeichen entfernt und paarweise über
   Seitengrenzen verglichen. Ähnlichkeit = max(normierte Levenshtein-Ähnlichkeit, Jaccard der Wort-3-Gramme);
   Paare über 0,80 sind Funde. Kandidaten kommen aus einem 3-Gramm-Index (schnell auch für ~190 Seiten); die
   genaue Levenshtein-Distanz wird nur für Kandidaten berechnet (mit Zeichen-Histogramm-Schranke und Band).
   Ausgenommen vom Satzvergleich: Impressum und Datenschutzerklärung (Rechtstexte, noindex) – sie werden aber bei
   Titel, Beschreibung und H1 mitgeprüft.

   Titel und Beschreibung: Fund, wenn zwei Seiten denselben <title> bzw. dieselbe meta description tragen – auch
   dann, wenn sie sich nur durch Groß-/Kleinschreibung, Satzzeichen, Zahlen oder den Markenzusatz
   „| Fenster-WeissenBurger“ unterscheiden. H1: Fund bei gleicher Überschrift (normiert).
   Ortsnamen zählen als echter Unterschied: „Fenster in Lenting“ und „Fenster in Hepberg“ sind verschiedene Titel.

   Das Modul exportiert die Bausteine (seitenFinden, hauptText, saetze, aehnlichkeit, SatzIndex, pruefen), damit
   Generatoren (scripts/build-orte.js) ihre Texte beim Erzeugen mit genau derselben Messung prüfen können. */
"use strict";
const fs = require("fs");
const path = require("path");

const SCHWELLE = 0.8;
const MIN_WOERTER = 8;
const ORDNER_AUS = new Set(["admin", "node_modules", ".git", ".netlify", "tests", "scripts", "docs", "firma ferestre", "bilder-original", "bilder-original-2"]);
const DATEIEN_AUS = new Set(["404.html", "danke.html", "wartung.html"]);
const RECHTLICH = new Set(["impressum.html", "datenschutz.html"]);
const MARKE = /\|?\s*fenster[- ]weissenburger(\s+ug)?(\s*\(haftungsbeschränkt\))?/g;

/* ---------- Seiten finden ---------- */
function seitenFinden(root) {
  const out = [];
  for (const e of fs.readdirSync(root, { withFileTypes: true })) {
    if (e.isFile() && /\.html$/i.test(e.name) && !DATEIEN_AUS.has(e.name)) out.push(e.name);
  }
  (function walk(dir, rel) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      if (ORDNER_AUS.has(e.name) || e.name.startsWith(".") || e.name.startsWith("design-")) continue;
      const r = rel ? rel + "/" + e.name : e.name;
      const idx = path.join(dir, e.name, "index.html");
      if (fs.existsSync(idx)) out.push(r + "/index.html");
      walk(path.join(dir, e.name), r);
    }
  })(root, "");
  return out.sort();
}

/* ---------- HTML → Haupttext ---------- */
const VOID = new Set(["img", "meta", "link", "input", "br", "hr", "source", "track", "wbr", "area", "base", "col", "embed", "param"]);
/* Entfernt das Element, dessen Start-Tag an Position start beginnt (verschachtelte gleichnamige Tags werden mitgezählt). */
function elementEntfernen(s, start, tag) {
  const startEnd = s.indexOf(">", start);
  if (startEnd < 0) return s.slice(0, start);
  if (VOID.has(tag) || s[startEnd - 1] === "/") return s.slice(0, start) + " " + s.slice(startEnd + 1);
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, "gi");
  re.lastIndex = startEnd + 1;
  let tiefe = 1, m;
  while ((m = re.exec(s))) {
    if (m[1] === "/") tiefe--; else if (!/\/>$/.test(m[0])) tiefe++;
    if (tiefe === 0) return s.slice(0, start) + " " + s.slice(m.index + m[0].length);
  }
  return s.slice(0, start); // ungeschlossen: Rest verwerfen
}
function alleEntfernen(s, startRe, tagGruppe = 1) {
  for (;;) {
    startRe.lastIndex = 0;
    const m = startRe.exec(s);
    if (!m) return s;
    s = elementEntfernen(s, m.index, m[tagGruppe].toLowerCase());
  }
}
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", shy: "", ndash: "–", mdash: "—", hellip: "…", laquo: "«", raquo: "»", bdquo: "„", ldquo: "“", rdquo: "”", lsquo: "‚", rsquo: "’", euro: "€", times: "×", middot: "·", copy: "©", auml: "ä", ouml: "ö", uuml: "ü", Auml: "Ä", Ouml: "Ö", Uuml: "Ü", szlig: "ß", sect: "§", deg: "°", thinsp: " ", ensp: " ", emsp: " " };
function entitiesDekodieren(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") { const cp = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(cp) ? String.fromCodePoint(cp) : m; }
    return e in ENTITIES ? ENTITIES[e] : m;
  });
}
const BLOCK = "p|h[1-6]|li|td|th|dd|dt|dl|summary|details|div|section|article|aside|figcaption|blockquote|caption|tr|table|thead|tbody|ul|ol|option|label|address|main|figure|pre";
/* Haupttext einer Seite als Liste von Textblöcken (Absätze, Überschriften, Listenpunkte, Tabellenzellen …). */
function hauptText(html) {
  let s = html;
  const body = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(s);
  if (body) s = body[1];
  s = s.replace(/<!--produkte-karten-->[\s\S]*?<!--\/produkte-karten-->/g, " ");
  s = s.replace(/<!--ankuendigung-->[\s\S]*?<!--\/ankuendigung-->/g, " "); // Ankündigungsbanner (Admin → Website) steht bewusst auf jeder Seite
  /* Kundenstimmen stehen bewusst wortgleich auf Start- und Referenzenseite (Admin → Bewertungen) */
  s = s.replace(/<!--bewertungen-(badge|karten)(?::[^>]*)?-->[\s\S]*?<!--\/bewertungen-\1-->/g, " ");
  s = s.replace(/<!--[\s\S]*?-->/g, " ");
  for (const tag of ["script", "style", "noscript", "template", "svg", "header", "nav", "footer", "form", "h1"]) s = alleEntfernen(s, new RegExp(`<(${tag})\\b`, "i")); // h1: eigene Prüfung (gleiche H1)
  s = alleEntfernen(s, /<([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*\sdata-firma(?:=|\s|>)/i);
  s = alleEntfernen(s, /<(a|button)\b[^>]*\bclass="[^"]*\bbtn\b[^"]*"/i);
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(new RegExp(`</?(${BLOCK})\\b[^>]*>`, "gi"), "\n");
  s = s.replace(/<[^>]+>/g, "");
  s = entitiesDekodieren(s);
  return s.split("\n").map((b) => b.replace(/\s+/g, " ").trim()).filter(Boolean);
}

/* ---------- Sätze ---------- */
const ABK = /\b(z\. ?B|ca|bzw|u\. ?a|inkl|zzgl|Nr|Min|Std|mind|max|ggf|evtl|vgl|Str|Tel|St|d\. ?h|usw|etc|Mo|Di|Mi|Do|Fr|Sa|So|Dr|Abs|Art|S|sog|o\. ?Ä|Mio|Tsd|Hrsg|Ing|Dipl)\./g;
function saetze(block) {
  const geschuetzt = block.replace(ABK, (m) => m.replace(/\./g, "\u0001"));
  return geschuetzt.split(/(?<=[.!?…])\s+(?=\S)/).map((t) => t.replace(/\u0001/g, ".").trim()).filter(Boolean);
}
function normalisieren(satz) {
  return satz.toLowerCase().replace(/[^a-z0-9äöüß]+/g, " ").trim();
}
const woerter = (norm) => (norm ? norm.split(" ") : []);
function dreigramme(w) { const out = []; for (let i = 0; i + 3 <= w.length; i++) out.push(w[i] + " " + w[i + 1] + " " + w[i + 2]); return out; }

/* ---------- Ähnlichkeit ---------- */
/* Levenshtein-Distanz, bricht ab, sobald sie größer als maxDist wird (Band). Rückgabe: Distanz oder maxDist + 1. */
function levenshtein(a, b, maxDist) {
  if (a.length < b.length) [a, b] = [b, a];
  const n = a.length, m = b.length;
  if (n - m > maxDist) return maxDist + 1;
  if (m === 0) return n;
  let prev = new Int32Array(m + 1), cur = new Int32Array(m + 1);
  for (let j = 0; j <= m; j++) prev[j] = j;
  for (let i = 1; i <= n; i++) {
    const von = Math.max(1, i - maxDist), bis = Math.min(m, i + maxDist);
    cur[0] = i;
    if (von > 1) cur[von - 1] = maxDist + 1;
    let zeilenMin = maxDist + 1;
    const ca = a.charCodeAt(i - 1);
    for (let j = von; j <= bis; j++) {
      const kosten = ca === b.charCodeAt(j - 1) ? 0 : 1;
      let v = prev[j - 1] + kosten;
      const l = cur[j - 1] + 1, o = prev[j] + 1;
      if (l < v) v = l; if (o < v) v = o;
      cur[j] = v; if (v < zeilenMin) zeilenMin = v;
    }
    if (bis < m) cur[bis + 1] = maxDist + 1;
    if (zeilenMin > maxDist) return maxDist + 1;
    [prev, cur] = [cur, prev];
  }
  return Math.min(prev[m], maxDist + 1);
}
function histogramm(norm) { const h = new Map(); for (const ch of norm) h.set(ch, (h.get(ch) || 0) + 1); return h; }
/* Untere Schranke der Levenshtein-Distanz aus den Zeichen-Histogrammen (jede Einfügung/Löschung ändert ein Zeichen). */
function histoSchranke(ha, hb) {
  let plus = 0, minus = 0;
  for (const [ch, n] of ha) { const d = n - (hb.get(ch) || 0); if (d > 0) plus += d; }
  for (const [ch, n] of hb) { const d = n - (ha.get(ch) || 0); if (d > 0) minus += d; }
  return Math.max(plus, minus);
}
function jaccard(ga, gb) {
  if (!ga.size || !gb.size) return 0;
  let n = 0; for (const g of ga) if (gb.has(g)) n++;
  return n / (ga.size + gb.size - n);
}
/* Ähnlichkeit zweier Sätze (Rohtext oder bereits normiert). Vollständige Berechnung – für Einzelvergleiche und Tests. */
function aehnlichkeit(a, b) {
  const na = normalisieren(a), nb = normalisieren(b);
  const maxLen = Math.max(na.length, nb.length);
  const lev = maxLen ? 1 - levenshtein(na, nb, maxLen) / maxLen : 1;
  const jac = jaccard(new Set(dreigramme(woerter(na))), new Set(dreigramme(woerter(nb))));
  return Math.max(lev, jac);
}

/* ---------- Index über Sätze (mehrere Seiten) ---------- */
class SatzIndex {
  constructor(schwelle = SCHWELLE) {
    this.schwelle = schwelle;
    this.saetze = []; // {seite, text, norm, w, gramme:Set, histo}
    this.postings = new Map(); // 3-Gramm → [Satz-Index]
  }
  static eintrag(seite, text) {
    const norm = normalisieren(text), w = woerter(norm);
    return { seite, text, norm, w, gramme: new Set(dreigramme(w)), histo: histogramm(norm) };
  }
  add(seite, text) {
    const e = SatzIndex.eintrag(seite, text);
    if (e.w.length < MIN_WOERTER) return null;
    const id = this.saetze.push(e) - 1;
    for (const g of e.gramme) { const p = this.postings.get(g); if (p) p.push(id); else this.postings.set(g, [id]); }
    return id;
  }
  /* Ähnlichkeit zweier Einträge, nur wenn sie über der Schwelle liegt (sonst 0). */
  vergleiche(a, b) {
    const jac = jaccard(a.gramme, b.gramme);
    const maxLen = Math.max(a.norm.length, b.norm.length);
    const maxDist = Math.floor((1 - this.schwelle) * maxLen); // Distanz > maxDist ⇒ Ähnlichkeit < Schwelle
    let lev = 0;
    if (histoSchranke(a.histo, b.histo) <= maxDist) {
      const d = levenshtein(a.norm, b.norm, maxDist);
      if (d <= maxDist) lev = 1 - d / maxLen;
    }
    const sim = Math.max(lev, jac);
    return sim > this.schwelle ? sim : 0;
  }
  /* Kandidaten (andere Seite, mindestens ein gemeinsames 3-Gramm) zu einem Eintrag, optional nur Indizes < bis. */
  kandidaten(e, nurVor = Infinity) {
    const out = new Set();
    for (const g of e.gramme) { const p = this.postings.get(g); if (!p) continue; for (const j of p) { if (j >= nurVor) break; if (this.saetze[j].seite !== e.seite) out.add(j); } }
    return out;
  }
  /* Alle Satzpaare über der Schwelle zwischen verschiedenen Seiten. */
  paare() {
    const out = [];
    for (let i = 0; i < this.saetze.length; i++) {
      const a = this.saetze[i];
      for (const j of this.kandidaten(a, i)) { const sim = this.vergleiche(a, this.saetze[j]); if (sim) out.push({ a: a.seite, b: this.saetze[j].seite, sim, satzA: a.text, satzB: this.saetze[j].text }); }
    }
    return out.sort((x, y) => y.sim - x.sim || (x.a + x.b).localeCompare(y.a + y.b));
  }
  /* Für Generatoren: Konflikte eines noch nicht eingefügten Textes (Liste von Sätzen/Blöcken) mit dem Index. */
  konflikte(seite, texte) {
    const out = [];
    for (const t of texte) for (const satz of saetze(t)) {
      const e = SatzIndex.eintrag(seite, satz);
      if (e.w.length < MIN_WOERTER) continue;
      for (const j of this.kandidaten(e)) { const sim = this.vergleiche(e, this.saetze[j]); if (sim) out.push({ satz, mit: this.saetze[j].text, seite: this.saetze[j].seite, sim }); }
    }
    return out;
  }
}

/* ---------- Seite analysieren ---------- */
function kopfdaten(html) {
  const t = /<title>([\s\S]*?)<\/title>/i.exec(html);
  const d = /<meta\s+name="description"\s+content="([^"]*)"/i.exec(html) || /<meta\s+content="([^"]*)"\s+name="description"/i.exec(html);
  const h = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  const text = (x) => (x ? entitiesDekodieren(x.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim() : "");
  return { titel: text(t && t[1]), beschreibung: text(d && d[1]), h1: text(h && h[1]) };
}
/* Gesetzlich festgelegte Steuertexte (js/steuer.js) müssen auf jeder Seite mit Preisen wörtlich gleich stehen –
   sie zählen deshalb nicht als Dublette. */
let steuerSaetze = null;
function istSteuerText(satz) {
  if (!steuerSaetze) { const Steuer = require(path.join(__dirname, "..", "js", "steuer.js")); steuerSaetze = new Set(); for (const s of Steuer.SAETZE) for (const t of Steuer.erlaubteTexte(s)) steuerSaetze.add(normalisieren(t)); }
  return steuerSaetze.has(normalisieren(satz));
}
function seiteAnalysieren(html) {
  const bloecke = hauptText(html);
  const alle = [];
  for (const b of bloecke) alle.push(...saetze(b));
  return Object.assign(kopfdaten(html), { bloecke, saetze: alle, lang: alle.filter((s) => woerter(normalisieren(s)).length >= MIN_WOERTER && !istSteuerText(s)) });
}

/* ---------- Gesamtprüfung ---------- */
const kopfNorm = (s) => normalisieren(s.replace(MARKE, " ")).replace(/[0-9]+/g, " ").replace(/\s+/g, " ").trim();
function gleicheKoepfe(seiten, feld, norm) {
  const gruppen = new Map();
  for (const s of seiten) { const v = s[feld]; if (!v) continue; const k = norm(v); (gruppen.get(k) || gruppen.set(k, []).get(k)).push(s); }
  const out = [];
  for (const g of gruppen.values()) if (g.length > 1) out.push({ feld, seiten: g.map((s) => s.datei), text: g[0][feld] });
  return out.sort((x, y) => x.seiten[0].localeCompare(y.seiten[0]));
}
function pruefen(root, { schwelle = SCHWELLE } = {}) {
  const dateien = seitenFinden(root);
  const seiten = dateien.map((datei) => Object.assign({ datei }, seiteAnalysieren(fs.readFileSync(path.join(root, datei), "utf8"))));
  const index = new SatzIndex(schwelle);
  let saetzeGesamt = 0;
  for (const s of seiten) { if (RECHTLICH.has(s.datei)) continue; for (const satz of s.lang) { index.add(s.datei, satz); saetzeGesamt++; } }
  return {
    seiten: dateien,
    imSatzvergleich: dateien.filter((d) => !RECHTLICH.has(d)),
    saetzeGesamt,
    paare: index.paare(),
    titel: gleicheKoepfe(seiten, "titel", kopfNorm),
    beschreibungen: gleicheKoepfe(seiten, "beschreibung", kopfNorm),
    h1: gleicheKoepfe(seiten, "h1", normalisieren),
  };
}
function anzahlFunde(e) { return e.paare.length + e.titel.length + e.beschreibungen.length + e.h1.length; }

/* ---------- Bericht ---------- */
function bericht(e, { alles = false, limit = 40 } = {}) {
  const z = [];
  const prozent = (x) => (x * 100).toFixed(0) + " %";
  z.push(`Text-Duplikate – Seiten: ${e.seiten.length} (im Satzvergleich: ${e.imSatzvergleich.length}), Sätze ≥ ${MIN_WOERTER} Wörter: ${e.saetzeGesamt}`);
  z.push(`Doppelte Satzpaare > ${prozent(SCHWELLE)}: ${e.paare.length} · gleiche Titel: ${e.titel.length} · gleiche Beschreibungen: ${e.beschreibungen.length} · gleiche H1: ${e.h1.length}`);
  const seitenMit = new Set(); for (const p of e.paare) { seitenMit.add(p.a); seitenMit.add(p.b); }
  if (e.paare.length) z.push(`Betroffene Seiten (Sätze): ${seitenMit.size}`);
  const kopf = [...e.titel, ...e.beschreibungen, ...e.h1];
  if (kopf.length) { z.push("", "Gleiche Titel / Beschreibungen / H1:"); for (const k of kopf) z.push(`  [${k.feld}] ${k.seiten.join("  ↔  ")}`, `      „${k.text}“`); }
  const liste = alles ? e.paare : e.paare.slice(0, limit);
  if (liste.length) {
    z.push("", `Doppelte Sätze${alles ? "" : ` (die ersten ${liste.length} von ${e.paare.length}; --bericht zeigt alle)`}:`);
    for (const p of liste) {
      z.push(`  ${prozent(p.sim).padStart(5)}  ${p.a}  ↔  ${p.b}`);
      if (p.satzA === p.satzB) z.push(`         „${p.satzA}“`);
      else z.push(`         A: „${p.satzA}“`, `         B: „${p.satzB}“`);
    }
  }
  if (!anzahlFunde(e)) z.push("Keine Funde – alle Seiten haben eigene Texte.");
  return z.join("\n");
}

module.exports = { SCHWELLE, MIN_WOERTER, seitenFinden, hauptText, saetze, normalisieren, aehnlichkeit, levenshtein, SatzIndex, seiteAnalysieren, kopfdaten, pruefen, anzahlFunde, bericht };

if (require.main === module) {
  const root = path.join(__dirname, "..");
  const t0 = Date.now();
  const e = pruefen(root);
  const alles = process.argv.includes("--bericht");
  console.log(bericht(e, { alles }));
  console.log(`\nDauer: ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  process.exitCode = anzahlFunde(e) ? 1 : 0;
}
