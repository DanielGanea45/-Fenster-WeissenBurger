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
const { Bilder, teil } = require("../js/konfigurator-bilder.js");
const { altText } = require("../scripts/konfigurator-bilder.js");
const B = Bilder(liste, preise);

/* ---------- Zuordnung Preislisten-Schlüssel → Bildteile ---------- */
test("Zuordnung der Repo-Schlüssel: Typ, Farbe, Sprossen, Rollladen, Modell", () => {
  const F = preise.fenster;
  assert.deepEqual(Object.keys(F.typen).map((k) => teil("typ", k, F.typen[k].name)), ["1fl", "2fl", "fest", "balkon"]);
  assert.deepEqual(Object.keys(F.farben).map((k) => teil("farbe", k, F.farben[k].name)), ["weiss", "anthrazit", "goldenoak", "zweifarbig"]);
  assert.deepEqual(Object.keys(F.sprossen).map((k) => teil("sprossen", k, F.sprossen[k].name)), ["keine", "innen", "wiener"]);
  assert.deepEqual(Object.keys(F.rollladen).map((k) => teil("rollladen", k, F.rollladen[k].name)), ["kein", "aufsatz", "vorsatz"]);
  assert.deepEqual(Object.keys(preise.haustuer.modelle).map((k) => teil("modell", k, preise.haustuer.modelle[k].name)), ["voll", "glasstreifen", "klassisch", "seitenteil"]);
  assert.equal(teil("farbe", "ral", "RAL-Farbe nach Wunsch"), null, "RAL bewusst ohne Foto");
});
test("Zuordnung über Namen/Schlagwörter – im Admin umbenannte oder neu angelegte Optionen", () => {
  assert.equal(teil("farbe", "anthrazit-aussen", "Anthrazit außen"), "anthrazit");
  assert.equal(teil("farbe", "anthrazit-beidseitig", "Anthrazit beidseitig"), "anthrazit");
  assert.equal(teil("farbe", "golden-oak-beidseitig", "Golden Oak beidseitig"), "goldenoak");
  assert.equal(teil("farbe", "eiche-dunkel", "Eiche dunkel"), "goldenoak");
  assert.equal(teil("farbe", "aussen-anthrazit-innen-weiss", "Außen Anthrazit, innen Weiß"), "zweifarbig");
  assert.equal(teil("farbe", "sonderfarbe", "Sonderfarbe RAL 6005"), null);
  assert.equal(teil("rollladen", "aufsatz-gurt", "Aufsatzrollladen Gurt/elektrisch"), "aufsatz");
  assert.equal(teil("rollladen", "gurt-elektrisch", "Gurt/elektrisch"), "aufsatz");
  assert.equal(teil("rollladen", "vorbau", "Vorbaurollladen mit Funkmotor"), "vorsatz");
  assert.equal(teil("rollladen", "ohne", "Ohne"), "kein");
  assert.equal(teil("sprossen", "glasteilend", "Glasteilende Sprossen (Wiener Art)"), "wiener");
  assert.equal(teil("sprossen", "szr", "Sprossen im Scheibenzwischenraum"), "innen");
  assert.equal(teil("typ", "stulp", "Stulpfenster zweiflügelig"), "2fl");
  assert.equal(teil("typ", "fix", "Fixverglasung"), "fest");
  assert.equal(teil("typ", "terrassentuer", "Terrassentür Dreh-Kipp"), "balkon");
  assert.equal(teil("zusatz", "motor", "Rollladenmotor (nur mit Rollladen)"), "zusatz-rollladenmotor");
  assert.equal(teil("zusatz", "pilzkopf", "Pilzkopfverriegelung RC 2"), "zusatz-rc2");
  assert.equal(teil("zusatz", "fensterbank-marmor", "Fensterbank innen Marmor"), "zusatz-fensterbank-innen");
  assert.equal(teil("glas", "ug06", "Dreifachglas Ug 0,6"), "glas-3fach");
  assert.equal(teil("zusatzTuer", "finger", "Fingerprint-Öffner"), "zusatz-rc2");
  /* unbekannte Option: Karte bekommt trotzdem ein Bild, Vorschau bleibt Zeichnung */
  const B2 = Bilder(liste, preise);
  assert.ok(B2.karte("fenster", "farbe", "regenbogen", { name: "Regenbogen" }, { typ: "1-fluegelig" }));
  assert.equal(B2.vorschau("fenster", { typ: "1-fluegelig", farbe: "regenbogen", sprossen: "keine", rollladen: "keiner" }), null);
});
test("Alle vorhandenen 1fl- und 2fl-Fotos werden von der passenden Konfiguration EXAKT getroffen", () => {
  const F = preise.fenster;
  const rueck = { typ: { "1fl": "1-fluegelig", "2fl": "2-fluegelig", fest: "festverglasung", balkon: "balkontuer" }, farbe: { weiss: "weiss", anthrazit: "anthrazit", goldenoak: "golden-oak", zweifarbig: "zweifarbig" }, sprossen: { keine: "keine", innen: "innenliegend", wiener: "wiener" }, rollladen: { kein: "keiner", aufsatz: "aufsatz", vorsatz: "vorsatz" } };
  const fotos = Object.keys(liste.bilder).filter((k) => /^fenster-(1fl|2fl)-/.test(k));
  assert.ok(fotos.length >= 60, "Serie 1fl/2fl: " + fotos.length);
  for (const f of fotos) {
    const [, typ, farbe, sprossen, rollladen] = f.split("-");
    const state = { typ: rueck.typ[typ], farbe: rueck.farbe[farbe], sprossen: rueck.sprossen[sprossen], rollladen: rueck.rollladen[rollladen] };
    assert.ok(F.typen[state.typ] && F.farben[state.farbe] && F.sprossen[state.sprossen] && F.rollladen[state.rollladen], f + ": Schlüssel vorhanden");
    assert.equal(B.vorschau("fenster", state), f, `Vorschau für ${JSON.stringify(state)}`);
  }
  /* der gemeldete Fall */
  assert.equal(B.vorschau("fenster", { typ: "1-fluegelig", farbe: "weiss", sprossen: "keine", rollladen: "aufsatz" }), "fenster-1fl-weiss-keine-aufsatz");
  /* alle 1fl- und 2fl-Kombinationen der Preisliste haben ein Foto (bis auf 2fl zweifarbig mit Sprossen) */
  let exakt = 0, gesamt = 0;
  for (const typ of ["1-fluegelig", "2-fluegelig"]) for (const farbe of Object.keys(F.farben)) for (const s of Object.keys(F.sprossen)) for (const r of Object.keys(F.rollladen)) { gesamt++; if (B.vorschau("fenster", { typ, farbe, sprossen: s, rollladen: r })) exakt++; }
  assert.equal(gesamt, 72); assert.equal(exakt, 66, "66 von 72 (2fl zweifarbig gibt es nur ohne Sprossen)");
});
test("Abdeckungsbericht läuft und zählt", () => {
  const { bericht } = require("../scripts/konfigurator-bilder-abdeckung.js");
  const r = bericht();
  assert.equal(r.gesamt, 144); assert.equal(r.z.exakt + r.z.aehnlich + r.z.fehlt, 144); assert.equal(r.z.fehlt, 0, "jede Kombination hat zumindest ein ähnliches Foto");
  assert.equal(r.z.exakt, 68); assert.equal(r.zz.exakt, 12); assert.match(r.md, /\| Typ \| Farbe \| Sprossen \| Rollladen \|/);
});
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
