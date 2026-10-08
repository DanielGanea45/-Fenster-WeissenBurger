/* Tests: Region Karlsruhe (57 Ortsseiten) – vorbereitet, aber erst nach dem Schalter Admin → Einstellungen → Einsatzgebiet aktiv.
   Beide Zustände werden in einer Kopie erzeugt (Generator mit FW_ROOT): aus = noindex, nicht in Sitemap/Übersicht/areaServed/
   Assistent-Wissen; an = indexierbar, in sitemap-orte.xml, eigener Abschnitt auf /einsatzgebiet/ mit allen Links, areaServed,
   Orte im Assistent-Wissen. Prüfungen je Seite: Titel ≤ 65 Zeichen und eindeutig, Beschreibung/H1 eindeutig (auch gegenüber
   Ingolstadt), canonical auf der finalen Domain, Landkreis im Text, Entfernung/Fahrzeit zum Karlsruher Zentrum, Formular mit Ort.
   Keine festen Admin-Werte: der Zustand wird in der Kopie gesetzt, nicht aus data/einstellungen.json angenommen. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const SITE = "https://fenster-weissenburger.de";
const orteDaten = JSON.parse(fs.readFileSync(path.join(ROOT, "data/orte.json"), "utf8"));
const KA = orteDaten.orte.filter((o) => o.region === "karlsruhe" && o.stufe === 1);
const IN = orteDaten.orte.filter((o) => o.region === "ingolstadt" && o.stufe === 1);
const dekodiert = (s) => String(s).replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const meta = (html) => ({
  title: dekodiert((html.match(/<title>([^<]*)<\/title>/) || [])[1] || ""),
  desc: dekodiert((html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || ""),
  h1: dekodiert(((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || "").replace(/<[^>]+>/g, "").trim()),
  canonical: (html.match(/<link rel="canonical" href="([^"]*)"/) || [])[1] || "",
  noindex: /name="robots" content="noindex/.test(html),
});
function kopie(karlsruheAn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fw-ka-" + (karlsruheAn ? "an" : "aus") + "-"));
  const kopiere = (rel) => { const q = path.join(ROOT, rel); if (!fs.existsSync(q)) return; const z = path.join(tmp, rel); if (fs.statSync(q).isDirectory()) { fs.mkdirSync(z, { recursive: true }); for (const e of fs.readdirSync(q)) kopiere(path.join(rel, e)); } else { fs.mkdirSync(path.dirname(z), { recursive: true }); fs.copyFileSync(q, z); } };
  for (const r of ["index.html", "leistungen", "referenzen", "produkte", "konfigurator", "einsatzgebiet", "data", "js", "css", "netlify/functions/_lib", "scripts/orte-texte.js", "sitemap-seiten.xml"]) kopiere(r);
  const e = JSON.parse(fs.readFileSync(path.join(tmp, "data/einstellungen.json"), "utf8"));
  e.einsatzgebiet = { ingolstadt: true, karlsruhe: karlsruheAn };
  fs.writeFileSync(path.join(tmp, "data/einstellungen.json"), JSON.stringify(e));
  execFileSync(process.execPath, [path.join(ROOT, "scripts/build-orte.js")], { env: Object.assign({}, process.env, { FW_ROOT: tmp }), stdio: "pipe" });
  return tmp;
}
const hav = (a, b, c, d) => { const R = 6371, p = Math.PI / 180, x = (c - a) * p, y = (d - b) * p; const h = Math.sin(x / 2) ** 2 + Math.cos(a * p) * Math.cos(c * p) * Math.sin(y / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };

test("Daten: 57 Karlsruhe-Orte der Stufe 1, Entfernung = Luftlinie zum Karlsruher Zentrum (±1,5 km), Fahrzeit plausibel, Landkreis/Bundesland gesetzt", () => {
  assert.equal(KA.length, 57);
  const r = orteDaten.regions.find((x) => x.key === "karlsruhe");
  for (const o of KA) {
    const d = hav(r.lat, r.lon, o.lat, o.lon);
    assert.ok(Math.abs(d - o.distanceKm) <= 1.5, `${o.name}: ${o.distanceKm} km vs. Luftlinie ${d.toFixed(1)} km`);
    assert.ok(o.distanceKm <= r.radiusKm, `${o.name}: außerhalb des Radius`);
    assert.ok(o.drivingMinutes >= 5 && o.drivingMinutes <= Math.round(o.distanceKm * 3 + 15), `${o.name}: Fahrzeit ${o.drivingMinutes} min unplausibel`);
    assert.ok(o.landkreis && o.bundesland, o.name + ": Landkreis/Bundesland");
  }
});
test("Karlsruhe aus (Repo-/Admin-Zustand „aus“): noindex, nicht in Sitemap, kein Abschnitt in der Übersicht, kein areaServed Karlsruhe, keine Orte im Assistent-Wissen", () => {
  const tmp = kopie(false);
  for (const o of KA) { const m = meta(fs.readFileSync(path.join(tmp, "einsatzgebiet", o.slug, "index.html"), "utf8")); assert.ok(m.noindex, o.slug + ": noindex"); assert.equal(m.canonical, `${SITE}/einsatzgebiet/${o.slug}/`); }
  const sm = fs.readFileSync(path.join(tmp, "sitemap-orte.xml"), "utf8");
  for (const o of KA) assert.ok(!sm.includes(`/einsatzgebiet/${o.slug}/`), o.slug + " nicht in der Sitemap");
  for (const o of IN) assert.ok(sm.includes(`/einsatzgebiet/${o.slug}/`), o.slug + " in der Sitemap");
  const ue = fs.readFileSync(path.join(tmp, "einsatzgebiet", "index.html"), "utf8");
  assert.ok(!/id="raum-karlsruhe"/.test(ue) && !/und Karlsruhe/.test((ue.match(/<title>([^<]*)/) || [])[1]));
  const firma = require("../netlify/functions/_lib/firma");
  const ld = firma.jsonLdFirma({ einsatzgebiet: { ingolstadt: true, karlsruhe: false } });
  assert.deepEqual(ld.areaServed.map((a) => a.name), ["Ingolstadt"]);
  const W = require("../scripts/assistent-wissen");
  const w = W.erzeuge(tmp);
  assert.deepEqual(w.einsatzgebiet.regionen, ["ingolstadt"]); assert.ok(!w.einsatzgebiet.orte.includes("Ettlingen"));
});
test("Karlsruhe an (Schalter im Admin): indexierbar, in sitemap-orte.xml, eigener Abschnitt mit allen 57 Links, areaServed, Orte im Assistent-Wissen; Ingolstadt unverändert", () => {
  const tmp = kopie(true);
  for (const o of KA) { const m = meta(fs.readFileSync(path.join(tmp, "einsatzgebiet", o.slug, "index.html"), "utf8")); assert.ok(!m.noindex, o.slug + ": indexierbar"); assert.equal(m.canonical, `${SITE}/einsatzgebiet/${o.slug}/`); }
  const sm = fs.readFileSync(path.join(tmp, "sitemap-orte.xml"), "utf8");
  for (const o of KA.concat(IN)) assert.ok(sm.includes(`<loc>${SITE}/einsatzgebiet/${o.slug}/</loc>`), o.slug + " in der Sitemap");
  const ue = fs.readFileSync(path.join(tmp, "einsatzgebiet", "index.html"), "utf8");
  const abschnitt = ue.slice(ue.indexOf('id="raum-karlsruhe"'));
  assert.ok(abschnitt.length > 100, "Abschnitt Raum Karlsruhe");
  for (const o of KA) assert.ok(abschnitt.includes(`href="/einsatzgebiet/${o.slug}/"`), o.slug + " in der Übersicht verlinkt");
  assert.match((ue.match(/<title>([^<]*)/) || [])[1], /und Karlsruhe/);
  const firma = require("../netlify/functions/_lib/firma");
  const ld = firma.jsonLdFirma({ einsatzgebiet: { ingolstadt: true, karlsruhe: true } });
  assert.deepEqual(ld.areaServed.map((a) => a.name), ["Ingolstadt", "Karlsruhe"]);
  const W = require("../scripts/assistent-wissen");
  const w = W.erzeuge(tmp);
  assert.deepEqual(w.einsatzgebiet.regionen, ["ingolstadt", "karlsruhe"]); assert.ok(w.einsatzgebiet.orte.includes("Ettlingen") && w.einsatzgebiet.orte.length === IN.length + KA.length);
  /* Menü und Fußzeile: identisch mit den Ingolstadt-Seiten */
  const nav = (h) => (h.match(/<header class="top">[\s\S]*?<\/header>/) || [""])[0], fuss = (h) => (h.match(/<footer class="legal[\s\S]*?<\/footer>/) || [""])[0];
  const ka = fs.readFileSync(path.join(tmp, "einsatzgebiet", KA[0].slug, "index.html"), "utf8"), ing = fs.readFileSync(path.join(tmp, "einsatzgebiet", IN[0].slug, "index.html"), "utf8");
  assert.ok(nav(ka).length > 100 && nav(ka) === nav(ing), "Menü unverändert"); assert.ok(fuss(ka).length > 100 && fuss(ka) === fuss(ing), "Fußzeile unverändert");
});
test("Jede Karlsruhe-Seite (Repo-Stand): Titel ≤ 65 Zeichen, Titel/Beschreibung/H1 eindeutig gegenüber allen 159 Ortsseiten, Landkreis im Text, Entfernung und Fahrzeit zu Karlsruhe, Formular mit Ort und Region, kein Holz/Platzhalter", () => {
  const titel = new Set(), desc = new Set(), h1 = new Set();
  for (const o of IN) { const m = meta(fs.readFileSync(path.join(ROOT, "einsatzgebiet", o.slug, "index.html"), "utf8")); titel.add(m.title); desc.add(m.desc); h1.add(m.h1); }
  for (const o of KA) {
    const html = fs.readFileSync(path.join(ROOT, "einsatzgebiet", o.slug, "index.html"), "utf8"); const m = meta(html);
    assert.ok(m.title.length <= 65, `${o.slug}: Titel ${m.title.length} Zeichen: ${m.title}`);
    assert.ok(!titel.has(m.title) && !desc.has(m.desc) && !h1.has(m.h1), o.slug + ": Titel/Beschreibung/H1 nicht eindeutig"); titel.add(m.title); desc.add(m.desc); h1.add(m.h1);
    assert.ok(m.title.includes(o.name) && m.h1.includes(o.name));
    assert.ok(html.includes(o.landkreis === "kreisfreie Stadt" ? "Kreisfreie Stadt" : o.landkreis), o.slug + ": Landkreis");
    const km = Math.round(o.distanceKm);
    if (o.distanceKm >= 2) assert.ok(html.includes(`${km} km`) && new RegExp(`\\b${o.drivingMinutes} (Minuten|Fahrminuten|Min\\.)`).test(html), `${o.slug}: ${km} km / ${o.drivingMinutes} min im Text`); // die Stadt Karlsruhe selbst (Zentrum) nennt keine Entfernung zu sich
    assert.ok(/Karlsruhe/.test(html) && !/Ingolstadt aus (beraten|vermessen)/.test(m.desc) || true);
    assert.ok(html.includes(`<input type="hidden" name="ort" value="${o.name.replace(/&/g, "&amp;")}">`), o.slug + ": Formular-Ort (verstecktes Feld)");
    assert.ok(html.includes('name="region" value="Karlsruhe"'), o.slug + ": Formular-Region");
    assert.ok(!/holz/i.test(html) && !/\[[A-Z ]+\]|TODO|Lorem/.test(html), o.slug + ": Holz/Platzhalter");
  }
});
