/* Tests: Bilderliste (data/konfigurator-bilder.json) passt zu den Dateien; jede Option der Preisliste bekommt eine
   Karte mit Bild und innerhalb einer Gruppe sind die Bilder verschieden; jede Fensterkombination
   Typ × Farbe × Sprossen × Rollladen hat ihr EXAKTES Foto (vollständige Serie); Zuordnung über Schlüssel und Namen;
   Vorschau nur bei RAL/Sonderfarben ohne Foto (→ SVG); Alt-Texte deutsch. */
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
const ORDNER = path.join(ROOT, "assets", "konfigurator");
const F = preise.fenster, H = preise.haustuer;
const RUECK = { typ: { "1fl": "1-fluegelig", "2fl": "2-fluegelig", fest: "festverglasung", balkon: "balkontuer" }, farbe: { weiss: "weiss", anthrazit: "anthrazit", goldenoak: "golden-oak", zweifarbig: "zweifarbig" }, sprossen: { keine: "keine", innen: "innenliegend", wiener: "wiener" }, rollladen: { kein: "keiner", aufsatz: "aufsatz", vorsatz: "vorsatz" } };

test("Bilderliste und Dateien stimmen überein; vollständige Serie 144 Fenster + 12 Türen + 11 Karten", () => {
  const namen = Object.keys(liste.bilder);
  assert.ok(namen.length >= 188, "21 alte + 167 neue Bilder, gefunden: " + namen.length);
  for (const [name, b] of Object.entries(liste.bilder)) {
    assert.ok(b.groessen.length >= 2, name + ": zwei Größen");
    for (const g of b.groessen) assert.ok(fs.existsSync(path.join(ORDNER, `${name}-${g}.webp`)), `${name}-${g}.webp fehlt`);
    assert.ok(b.breite > 0 && b.hoehe > 0, name + ": Maße");
    assert.match(b.alt, /Abbildung beispielhaft$/);
  }
  for (const f of fs.readdirSync(ORDNER)) { const m = f.match(/^(.*)-(\d+)\.webp$/); if (m) assert.ok(liste.bilder[m[1]], f + " ohne Eintrag in der Liste"); }
  assert.equal(namen.filter((n) => /^fenster-/.test(n)).length, 144, "144 Fensterfotos");
  assert.equal(namen.filter((n) => /^tuer-/.test(n)).length, 12, "12 Türfotos");
  assert.equal(namen.filter((n) => /^(glas|zusatz)-/.test(n)).length, 11, "11 Kartenbilder");
  namen.filter((n) => /^(fenster|tuer|glas|zusatz)-/.test(n)).forEach((n) => assert.deepEqual(liste.bilder[n].groessen, [400, 900], n + ": 400 und 900 px"));
});

test("Alt-Texte: deutsch und sprechend", () => {
  assert.equal(altText("fenster-1fl-weiss-keine-kein"), "Fenster einflügelig (Dreh-Kipp) in Weiß, ohne Sprossen, ohne Rollladen – Abbildung beispielhaft");
  assert.equal(altText("fenster-balkon-zweifarbig-wiener-aufsatz"), "Fenster Balkontür in zweifarbig (außen farbig, innen weiß), mit Wiener Sprossen, mit Aufsatzrollladen – Abbildung beispielhaft");
  assert.equal(altText("tuer-klassisch-goldenoak"), "Haustür klassisch in Holzoptik in Golden Oak – Abbildung beispielhaft");
  assert.equal(altText("glas-vsg"), "Sicherheitsglas (VSG) – Abbildung beispielhaft");
});

/* ---------- Zuordnung ---------- */
test("Zuordnung der Repo-Schlüssel: Typ, Farbe, Sprossen, Rollladen, Modell", () => {
  assert.deepEqual(Object.keys(F.typen).map((k) => teil("typ", k, F.typen[k].name)), ["1fl", "2fl", "fest", "balkon"]);
  assert.deepEqual(Object.keys(F.farben).map((k) => teil("farbe", k, F.farben[k].name)), ["weiss", "anthrazit", "goldenoak", "zweifarbig"]);
  assert.deepEqual(Object.keys(F.sprossen).map((k) => teil("sprossen", k, F.sprossen[k].name)), ["keine", "innen", "wiener"]);
  assert.deepEqual(Object.keys(F.rollladen).map((k) => teil("rollladen", k, F.rollladen[k].name)), ["kein", "aufsatz", "vorsatz"]);
  assert.deepEqual(Object.keys(H.modelle).map((k) => teil("modell", k, H.modelle[k].name)), ["voll", "glasstreifen", "klassisch", "seitenteil"]);
  assert.equal(teil("farbe", "ral", "RAL-Farbe nach Wunsch"), null, "RAL bewusst ohne Foto");
});
test("Zuordnung über Namen/Schlagwörter – im Admin umbenannte oder neu angelegte Optionen", () => {
  assert.equal(teil("farbe", "anthrazit-aussen", "Anthrazit außen"), "anthrazit");
  assert.equal(teil("farbe", "golden-oak-beidseitig", "Golden Oak beidseitig"), "goldenoak");
  assert.equal(teil("farbe", "aussen-anthrazit-innen-weiss", "Außen Anthrazit, innen Weiß"), "zweifarbig");
  assert.equal(teil("farbe", "sonderfarbe", "Sonderfarbe RAL 6005"), null);
  assert.equal(teil("rollladen", "aufsatz-gurt", "Aufsatzrollladen, Gurt/elektrisch"), "aufsatz");
  assert.equal(teil("rollladen", "vorbau", "Vorbaurollladen mit Funkmotor"), "vorsatz");
  assert.equal(teil("rollladen", "ohne", "Ohne"), "kein");
  assert.equal(teil("sprossen", "glasteilend", "Glasteilende Sprossen (Wiener Art)"), "wiener");
  assert.equal(teil("sprossen", "szr", "Sprossen im Scheibenzwischenraum"), "innen");
  assert.equal(teil("typ", "dk1", "Dreh-Kipp 1-flügelig"), "1fl");
  assert.equal(teil("typ", "stulp", "Stulpfenster zweiflügelig"), "2fl");
  assert.equal(teil("typ", "fix", "Fixverglasung"), "fest");
  assert.equal(teil("typ", "terrassentuer", "Terrassentür Dreh-Kipp"), "balkon");
  assert.equal(teil("zusatz", "motor", "Rollladenmotor (nur mit Rollladen)"), "zusatz-rollladenmotor");
  assert.equal(teil("zusatz", "pilzkopf", "Pilzkopfverriegelung RC 2"), "zusatz-rc2");
  assert.equal(teil("glas", "ug06", "Dreifachglas Ug 0,6"), "glas-3fach");
  assert.equal(teil("zusatzTuer", "finger", "Fingerprint-Öffner"), "tuer-voll-anthrazit");
  const B2 = Bilder(liste, preise);
  assert.ok(B2.karte("fenster", "farbe", "regenbogen", { name: "Regenbogen" }, { typ: "1-fluegelig" }), "unbekannte Option bekommt trotzdem ein Kartenbild");
  assert.equal(B2.vorschau("fenster", { typ: "1-fluegelig", farbe: "regenbogen", sprossen: "keine", rollladen: "keiner" }), null, "… aber kein Vorschaufoto");
});

/* ---------- Vorschau: jede Kombination exakt ---------- */
test("Jede Fensterkombination Typ × Farbe × Sprossen × Rollladen zeigt ihr EXAKTES Foto (144/144)", () => {
  let n = 0;
  for (const typ of Object.keys(F.typen)) for (const farbe of Object.keys(F.farben)) for (const sprossen of Object.keys(F.sprossen)) for (const rollladen of Object.keys(F.rollladen)) {
    const erwartet = `fenster-${teil("typ", typ)}-${teil("farbe", farbe)}-${teil("sprossen", sprossen)}-${teil("rollladen", rollladen)}`;
    assert.equal(B.vorschau("fenster", { typ, farbe, sprossen, rollladen }), erwartet, `${typ}/${farbe}/${sprossen}/${rollladen}`); n++;
  }
  assert.equal(n, 144);
  /* und umgekehrt: jedes Foto der Serie wird von genau seiner Konfiguration getroffen */
  for (const f of Object.keys(liste.bilder).filter((k) => /^fenster-/.test(k))) {
    const [, typ, farbe, sprossen, rollladen] = f.split("-");
    assert.equal(B.vorschau("fenster", { typ: RUECK.typ[typ], farbe: RUECK.farbe[farbe], sprossen: RUECK.sprossen[sprossen], rollladen: RUECK.rollladen[rollladen] }), f);
  }
  assert.equal(B.vorschau("fenster", { typ: "1-fluegelig", farbe: "weiss", sprossen: "keine", rollladen: "aufsatz" }), "fenster-1fl-weiss-keine-aufsatz", "der gemeldete Fall");
});
test("Haustür: Modell × Farbe exakt, RAL → Zeichnung; Angebotsbild fällt bei RAL auf das nächstliegende Foto zurück", () => {
  for (const modell of Object.keys(H.modelle)) for (const farbe of Object.keys(H.farben)) {
    const v = B.vorschau("haustuer", { modell, farbe });
    if (farbe === "ral") { assert.equal(v, null, modell + "/ral → SVG"); assert.ok(B.angebotBild("haustuer", { modell, farbe }), "Angebotsbild vorhanden"); }
    else assert.equal(v, `tuer-${teil("modell", modell)}-${teil("farbe", farbe)}`);
  }
  assert.equal(B.angebotBild("fenster", { typ: "balkontuer", farbe: "zweifarbig", sprossen: "wiener", rollladen: "vorsatz" }), "fenster-balkon-zweifarbig-wiener-vorsatz");
});

/* ---------- Karten: jede Option bebildert, keine Doppelungen in einer Gruppe ---------- */
test("Karten: jede Option hat ein Bild, zeigt die Option in der aktuellen Kombination, und keine zwei Karten einer Gruppe teilen ein Bild", () => {
  const zustaende = [
    { typ: "1-fluegelig", farbe: "weiss", sprossen: "keine", rollladen: "keiner" },
    { typ: "2-fluegelig", farbe: "anthrazit", sprossen: "wiener", rollladen: "vorsatz" },
    { typ: "festverglasung", farbe: "golden-oak", sprossen: "innenliegend", rollladen: "aufsatz" },
    { typ: "balkontuer", farbe: "zweifarbig", sprossen: "keine", rollladen: "aufsatz" },
  ];
  for (const st of zustaende) {
    for (const [gruppe, map] of [["system", F.systeme], ["typ", F.typen], ["farbe", F.farben], ["glas", F.glas], ["sprossen", F.sprossen], ["rollladen", F.rollladen], ["zusatz", F.zusaetze]]) {
      const bilder = Object.entries(map).map(([id, e]) => { const n = B.karte("fenster", gruppe, id, e, st); assert.ok(n && B.hat(n), `Fenster ${gruppe}/${id} ohne Bild`); return n; });
      assert.equal(new Set(bilder).size, bilder.length, `Fenster ${gruppe}: doppelte Bilder bei ${JSON.stringify(st)} → ${bilder.join(", ")}`);
    }
    /* Rollladen-Karten zeigen kein/aufsatz/vorsatz in der aktuellen Kombination */
    for (const r of Object.keys(F.rollladen)) assert.equal(B.karte("fenster", "rollladen", r, F.rollladen[r], st), `fenster-${teil("typ", st.typ)}-${teil("farbe", st.farbe)}-${teil("sprossen", st.sprossen)}-${teil("rollladen", r)}`);
    for (const s of Object.keys(F.sprossen)) assert.equal(B.karte("fenster", "sprossen", s, F.sprossen[s], st), `fenster-${teil("typ", st.typ)}-${teil("farbe", st.farbe)}-${teil("sprossen", s)}-${teil("rollladen", st.rollladen)}`);
    for (const f of Object.keys(F.farben)) assert.equal(B.karte("fenster", "farbe", f, F.farben[f], st), `fenster-${teil("typ", st.typ)}-${teil("farbe", f)}-${teil("sprossen", st.sprossen)}-${teil("rollladen", st.rollladen)}`);
    for (const t of Object.keys(F.typen)) assert.equal(B.karte("fenster", "typ", t, F.typen[t], st), `fenster-${teil("typ", t)}-${teil("farbe", st.farbe)}-keine-kein`);
  }
  for (const st of [{ modell: "modern-voll", farbe: "anthrazit" }, { modell: "klassisch-golden-oak", farbe: "golden-oak" }, { modell: "mit-seitenteil", farbe: "ral" }]) {
    for (const [gruppe, map] of [["modell", H.modelle], ["farbe", H.farben], ["glas", H.glas], ["seitenteil", H.seitenteil], ["zusatz", H.zusaetze]]) {
      const bilder = Object.entries(map).map(([id, e]) => { const n = B.karte("haustuer", gruppe, id, e, st); assert.ok(n && B.hat(n), `Haustür ${gruppe}/${id} ohne Bild`); return n + (B.spiegeln("haustuer", gruppe, id, e) ? "|gespiegelt" : ""); });
      assert.equal(new Set(bilder).size, bilder.length, `Haustür ${gruppe}: doppelte Bilder bei ${JSON.stringify(st)} → ${bilder.join(", ")}`);
    }
  }
  assert.ok(B.hat("zusatz-montage") && B.hat("zusatz-demontage"));
  assert.equal(B.karte("fenster", "glas", "sicherheit", F.glas.sicherheit, {}), "glas-vsg");
  assert.equal(B.karte("fenster", "zusatz", "rollladenmotor", F.zusaetze.rollladenmotor, {}), "zusatz-rollladenmotor");
});

test("Abdeckungsbericht: 144/144 Fenster exakt, Haustür 12 exakt + 4 RAL ähnlich", () => {
  const { bericht } = require("../scripts/konfigurator-bilder-abdeckung.js");
  const r = bericht();
  assert.equal(r.gesamt, 144); assert.equal(r.z.exakt, 144); assert.equal(r.z.fehlt, 0);
  assert.equal(r.zz.exakt, 12); assert.equal(r.zz.aehnlich, 4);
});

test("Vorschau-Markup, Angebotsbild und Skripte in den Konfigurator-Seiten", () => {
  for (const art of ["fenster", "haustuer"]) {
    const html = fs.readFileSync(path.join(ROOT, "konfigurator", art, "index.html"), "utf8");
    if (!/id="konf"/.test(html)) continue; // Status „aus“: Platzhalterseite
    assert.ok(html.includes('class="preview__foto"') && html.includes('class="preview__masse"'), art + ": Vorschau-Markup");
    assert.ok(/konfigurator-bilder\.js\?v=/.test(html), art + ": Bildauswahl-Skript eingebunden");
  }
  const js = fs.readFileSync(path.join(ROOT, "js/konfigurator.js"), "utf8");
  assert.ok(js.includes("angebot__bild") && js.includes("angebotBildHtml"), "Angebotsschritt mit großem Bild");
  assert.ok(!/style="/.test(js), "keine Inline-Styles (CSP)");
});
