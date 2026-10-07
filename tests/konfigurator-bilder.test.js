/* Tests: Bilderliste (data/konfigurator-bilder.json) passt zu den Dateien; jede Option der Preisliste bekommt
   eine Karte mit Bild; Vorschau liefert nur exakte Fotos (sonst null → SVG); Alt-Texte deutsch. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const liste = JSON.parse(fs.readFileSync(path.join(ROOT, "data/konfigurator-bilder.json"), "utf8"));
const preise = JSON.parse(fs.readFileSync(path.join(ROOT, "data/preise.json"), "utf8"));
const { Bilder } = require("../js/konfigurator-bilder.js");
const { altText } = require("../scripts/konfigurator-bilder.js");
const B = Bilder(liste);
const ORDNER = path.join(ROOT, "assets", "konfigurator");

test("Bilderliste und Dateien stimmen überein (jede Größe vorhanden, keine Datei ohne Eintrag)", () => {
  const namen = Object.keys(liste.bilder);
  assert.ok(namen.length >= 112, "mindestens 21 alte + 91 neue Bilder, gefunden: " + namen.length);
  for (const [name, b] of Object.entries(liste.bilder)) {
    assert.ok(b.groessen.length >= 2, name + ": zwei Größen");
    for (const g of b.groessen) assert.ok(fs.existsSync(path.join(ORDNER, `${name}-${g}.webp`)), `${name}-${g}.webp fehlt`);
    assert.ok(b.breite > 0 && b.hoehe > 0, name + ": Maße");
    assert.match(b.alt, /Abbildung beispielhaft$/);
    assert.ok(!/[a-z]-[a-z0-9]+-[a-z]/.test(b.alt.split(" – ")[0]) || /Profilschnitt/.test(b.alt), name + ": Alt-Text ist lesbar, kein Dateiname: " + b.alt);
  }
  for (const f of fs.readdirSync(ORDNER)) { const m = f.match(/^(.*)-(\d+)\.webp$/); if (m) assert.ok(liste.bilder[m[1]], f + " ohne Eintrag in der Liste"); }
  const neue = namen.filter((n) => /^(fenster|tuer|glas|zusatz)-/.test(n));
  assert.equal(neue.length, 91, "91 neue Bilder");
  neue.forEach((n) => assert.deepEqual(liste.bilder[n].groessen, [400, 900], n + ": 400 und 900 px"));
});

test("Alt-Texte: deutsch und sprechend", () => {
  assert.equal(altText("fenster-1fl-weiss-keine-kein"), "Fenster einflügelig (Dreh-Kipp) in Weiß, ohne Sprossen, ohne Rollladen – Abbildung beispielhaft");
  assert.equal(altText("fenster-2fl-zweifarbig-wiener-aufsatz"), "Fenster zweiflügelig (Stulp) in zweifarbig (außen farbig, innen weiß), mit Wiener Sprossen, mit Aufsatzrollladen – Abbildung beispielhaft");
  assert.equal(altText("tuer-klassisch-goldenoak"), "Haustür klassisch in Holzoptik in Golden Oak – Abbildung beispielhaft");
  assert.equal(altText("glas-vsg"), "Sicherheitsglas (VSG) – Abbildung beispielhaft");
  assert.equal(altText("zusatz-fensterbank-aussen"), "Fensterbank außen aus Aluminium – Abbildung beispielhaft");
});

test("Jede Karte im Konfigurator hat ein Bild (Fenster und Haustür, alle Optionen, alle Zustände)", () => {
  const F = preise.fenster, H = preise.haustuer;
  const state = { typ: "1-fluegelig", farbe: "weiss", sprossen: "keine", rollladen: "keiner" };
  for (const [gruppe, map] of [["system", F.systeme], ["typ", F.typen], ["farbe", F.farben], ["glas", F.glas], ["sprossen", F.sprossen], ["rollladen", F.rollladen], ["zusatz", F.zusaetze]]) {
    for (const [id, e] of Object.entries(map)) { const n = B.karte("fenster", gruppe, id, e, state); assert.ok(n && B.hat(n), `Fenster ${gruppe}/${id} ohne Bild`); }
  }
  /* auch mit anderen Vorauswahlen (Farbe/Typ) bleibt jede Fensterkarte bebildert */
  for (const typ of Object.keys(F.typen)) for (const farbe of Object.keys(F.farben)) {
    const st = { typ, farbe, sprossen: "wiener", rollladen: "vorsatz" };
    for (const id of Object.keys(F.sprossen)) assert.ok(B.karte("fenster", "sprossen", id, F.sprossen[id], st), `Sprossen ${id} bei ${typ}/${farbe}`);
    for (const id of Object.keys(F.rollladen)) assert.ok(B.karte("fenster", "rollladen", id, F.rollladen[id], st), `Rollladen ${id} bei ${typ}/${farbe}`);
  }
  const stT = { modell: "modern-voll", farbe: "anthrazit" };
  for (const [gruppe, map] of [["modell", H.modelle], ["farbe", H.farben], ["glas", H.glas], ["seitenteil", H.seitenteil], ["zusatz", H.zusaetze]]) {
    for (const [id, e] of Object.entries(map)) { const n = B.karte("haustuer", gruppe, id, e, stT); assert.ok(n && B.hat(n), `Haustür ${gruppe}/${id} ohne Bild`); }
  }
  assert.ok(B.hat("zusatz-montage") && B.hat("zusatz-demontage"));
});

test("Fensteroptionen zeigen das passende Foto der Serie (Typ/Farbe/Sprossen/Rollladen)", () => {
  assert.equal(B.karte("fenster", "typ", "2-fluegelig", preise.fenster.typen["2-fluegelig"], { farbe: "anthrazit" }), "fenster-2fl-anthrazit-keine-kein");
  assert.equal(B.karte("fenster", "farbe", "zweifarbig", preise.fenster.farben.zweifarbig, { typ: "1-fluegelig", sprossen: "innenliegend", rollladen: "aufsatz" }), "fenster-1fl-zweifarbig-innen-aufsatz");
  assert.equal(B.karte("fenster", "sprossen", "keine", preise.fenster.sprossen.keine, { typ: "1-fluegelig", farbe: "weiss", rollladen: "keiner" }), "fenster-1fl-weiss-keine-kein");
  assert.equal(B.karte("fenster", "sprossen", "innenliegend", preise.fenster.sprossen.innenliegend, { typ: "1-fluegelig", farbe: "golden-oak", rollladen: "vorsatz" }), "fenster-1fl-goldenoak-innen-vorsatz");
  /* Balkontür: nur eine Aufnahme in der Serie → nächstes Bild desselben Typs */
  assert.equal(B.karte("fenster", "typ", "balkontuer", preise.fenster.typen.balkontuer, { farbe: "weiss" }), "fenster-balkon-zweifarbig-keine-vorsatz");
  assert.equal(B.karte("fenster", "glas", "sicherheit", preise.fenster.glas.sicherheit, {}), "glas-vsg");
  assert.equal(B.karte("fenster", "zusatz", "rollladenmotor", preise.fenster.zusaetze.rollladenmotor, {}), "zusatz-rollladenmotor");
});

test("Vorschau: exaktes Foto oder null (dann SVG-Zeichnung)", () => {
  assert.equal(B.vorschau("fenster", { typ: "1-fluegelig", farbe: "weiss", sprossen: "keine", rollladen: "keiner" }), "fenster-1fl-weiss-keine-kein");
  assert.equal(B.vorschau("fenster", { typ: "2-fluegelig", farbe: "golden-oak", sprossen: "wiener", rollladen: "vorsatz" }), "fenster-2fl-goldenoak-wiener-vorsatz");
  assert.equal(B.vorschau("fenster", { typ: "balkontuer", farbe: "weiss", sprossen: "keine", rollladen: "keiner" }), null, "Kombination ohne Foto → SVG");
  assert.equal(B.vorschau("fenster", { typ: "festverglasung", farbe: "weiss", sprossen: "keine", rollladen: "keiner" }), null);
  assert.equal(B.vorschau("haustuer", { modell: "klassisch-golden-oak", farbe: "golden-oak" }), "tuer-klassisch-goldenoak");
  assert.equal(B.vorschau("haustuer", { modell: "mit-seitenteil", farbe: "ral" }), null, "RAL hat kein eigenes Foto → SVG");
  const nb = B.nachbarn("fenster", { typ: "1-fluegelig", farbe: "weiss", sprossen: "keine", rollladen: "keiner" }, { farbe: Object.keys(preise.fenster.farben), sprossen: Object.keys(preise.fenster.sprossen), rollladen: Object.keys(preise.fenster.rollladen), typ: Object.keys(preise.fenster.typen) });
  assert.ok(nb.includes("fenster-1fl-anthrazit-keine-kein") && nb.includes("fenster-1fl-weiss-innen-kein") && nb.includes("fenster-2fl-weiss-keine-kein"));
  assert.ok(nb.length <= 12);
});

test("Vorschau-Markup und Skripte in den generierten Konfigurator-Seiten", () => {
  for (const art of ["fenster", "haustuer"]) {
    const html = fs.readFileSync(path.join(ROOT, "konfigurator", art, "index.html"), "utf8");
    if (!/id="konf"/.test(html)) continue; // Status „aus“: nur Platzhalterseite
    assert.ok(html.includes('class="preview__foto"') && html.includes('class="preview__masse"'), art + ": Vorschau-Markup");
    assert.ok(/konfigurator-bilder\.js\?v=/.test(html), art + ": Bildauswahl-Skript eingebunden");
  }
  const gen = fs.readFileSync(path.join(ROOT, "scripts/build-konfigurator.js"), "utf8");
  assert.ok(gen.includes("preview__foto") && gen.includes("konfigurator-bilder.js"));
});
