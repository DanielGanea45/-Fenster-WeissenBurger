/* Tests für js/preis.js mit data/preise.json (Beispielpreise).
   Erwartungswerte wurden VON HAND nach den Rechenregeln (README) berechnet – alle Angaben in Cent.
   Aufruf: node --test tests/  (läuft bei jedem Netlify-Build; schlägt ein Test fehl, wird nicht veröffentlicht). */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs");
const P = require("../js/preis.js");
const liste = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "preise.json"), "utf8"));

const F = (o) => Object.assign({ produkt: "fenster", system: "koemmerling-70", typ: "1-fluegelig", farbe: "weiss", glas: "2-fach", sprossen: "keine", rollladen: "keiner", zusaetze: [], breiteMm: 1000, hoeheMm: 1000, menge: 1, montage: true, demontage: false }, o);
const H = (o) => Object.assign({ produkt: "haustuer", modell: "modern-voll", farbe: "weiss", glas: "standard", seitenteil: "keines", zusaetze: [], breiteMm: 1100, hoeheMm: 2100, menge: 1, montage: true, demontage: false }, o);
const ok = (cfg) => { const r = P.berechne(cfg, liste); assert.equal(r.ok, true, "Fehler: " + JSON.stringify(r.fehler)); return r; };
const fail = (cfg) => { const r = P.berechne(cfg, liste); assert.equal(r.ok, false); return r.fehler; };

test("Preisliste ist gültig (Schema)", () => {
  assert.deepEqual(P.validiereListe(liste), { ok: true, fehler: [] });
});

/* ---------- Fenster: Handrechnungen ---------- */
test("F01 Kömmerling 70, 1,00 m², Standard, Montage: 300 → Rabatt 5 % → +90 Montage → 19 %", () => {
  // Basis 30000; Produkt 30000; Rabatt 1500 → 28500; Montage 9000; Netto 37500; MwSt 7125; Brutto 44625
  const r = ok(F({}));
  assert.equal(r.element, 30000); assert.equal(r.rabatt, 1500); assert.equal(r.montage, 9000);
  assert.equal(r.netto, 37500); assert.equal(r.mwst, 7125); assert.equal(r.brutto, 44625);
  // ohne Rabatt: 39000 + 7410 = 46410; Ersparnis 1785
  assert.equal(r.ohneRabattBrutto, 46410); assert.equal(r.ersparnisBrutto, 1785);
});
test("F02 76 AD, 1,2 m², 3-fach, Demontage", () => {
  // Basis 1,2×340=408,00 → 40800; Glas 1,2×40=48 → 4800; Element 45600; Rabatt 2280 → 43320;
  // Montage 90+40=130 → 13000; Netto 56320; MwSt 10700,8 → 10701; Brutto 67021
  const r = ok(F({ system: "koemmerling-76-ad", breiteMm: 1200, glas: "3-fach", demontage: true }));
  assert.equal(r.element, 45600); assert.equal(r.montage, 13000); assert.equal(r.netto, 56320); assert.equal(r.mwst, 10701); assert.equal(r.brutto, 67021);
  assert.equal(r.ohneRabattBrutto, 69734); // 58600 + 11134
});
test("F03 Kömmerling 88, 1,5×2,0 m, alle Optionen", () => {
  // Basis 3×440=1320 → 132000; Typ 2-fl 20 % 26400; Farbe anthrazit 15 % 19800; Glas 3×40=120 → 12000;
  // Wiener Sprossen 10000; Aufsatzrollladen 3×150=450 → 45000; RC2 12000; Insekt 8000; Motor 11000;
  // Fensterbank innen 1,5×50=75 → 7500; außen 1,5×70=105 → 10500
  // Element 294200; Rabatt 14710 → 279490; Montage 9000; Netto 288490; MwSt 54813,1 → 54813; Brutto 343303
  const r = ok(F({ system: "koemmerling-88", breiteMm: 1500, hoeheMm: 2000, typ: "2-fluegelig", farbe: "anthrazit", glas: "3-fach", sprossen: "wiener", rollladen: "aufsatz", zusaetze: ["rc2", "insektenschutz", "rollladenmotor", "fensterbank-innen", "fensterbank-aussen"] }));
  assert.equal(r.element, 294200); assert.equal(r.rabatt, 14710); assert.equal(r.netto, 288490); assert.equal(r.mwst, 54813); assert.equal(r.brutto, 343303);
  assert.equal(r.ohneRabattBrutto, 360808); // 303200 + 57608
  assert.equal(r.positionen.length, 11); // Basis + 10 Zuschläge
});
test("F04 Mindestfläche 0,5 m² bei 0,5×0,5 m, ohne Montage; Rundung ,5 Cent aufwärts", () => {
  // Fläche 0,25 → 0,5 m²; Basis 0,5×300=150 → 15000; Rabatt 750 → 14250; Netto 14250; MwSt 2707,5 → 2708; Brutto 16958
  const r = ok(F({ breiteMm: 500, hoeheMm: 500, montage: false }));
  assert.equal(r.element, 15000); assert.equal(r.montage, 0); assert.equal(r.mwst, 2708); assert.equal(r.brutto, 16958);
  assert.match(r.positionen[0].name, /Mindestfläche/);
});
test("F05 Menge 10 (Rabatt und Montage je Element)", () => {
  // Element 30000; Produkt 300000; Rabatt 15000 → 285000; Montage 90000; Netto 375000; MwSt 71250; Brutto 446250
  const r = ok(F({ menge: 10 }));
  assert.equal(r.produkt, 300000); assert.equal(r.rabatt, 15000); assert.equal(r.montage, 90000); assert.equal(r.brutto, 446250);
});
test("F06 Cortizo 60 an der Obergrenze 1400×2600 (3,64 m²)", () => {
  // Basis 3,64×540=1965,60 → 196560; Rabatt 9828 → 186732; Montage 9000; Netto 195732; MwSt 37189,08 → 37189; Brutto 232921
  const r = ok(F({ system: "cortizo-60", breiteMm: 1400, hoeheMm: 2600 }));
  assert.equal(r.element, 196560); assert.equal(r.brutto, 232921);
  assert.equal(r.ohneRabattBrutto, 244616); // 205560 + 39056 (39056,4)
});
test("F07 Cortizo 60: 1500 mm Breite überschreitet Systemgrenze", () => {
  assert.deepEqual(fail(F({ system: "cortizo-60", breiteMm: 1500, hoeheMm: 1000 })), ["breiteMax"]);
});
test("F08 Breite 300 mm unter Minimum", () => { assert.deepEqual(fail(F({ breiteMm: 300 })), ["breiteMin"]); });
test("F09 Unbekanntes System", () => { assert.ok(fail(F({ system: "gibt-es-nicht" })).includes("system")); });
test("F10 Festverglasung −20 % (76 MD)", () => {
  // Basis 38000; Typ −7600; Element 30400; Rabatt 1520 → 28880; Montage 9000; Netto 37880; MwSt 7197,2 → 7197; Brutto 45077
  const r = ok(F({ system: "koemmerling-76-md", typ: "festverglasung" }));
  assert.equal(r.element, 30400); assert.equal(r.brutto, 45077);
});
test("F11 Balkontür +15 % (0,8×2,0 m)", () => {
  // Basis 1,6×300=480 → 48000; Typ 7200; Element 55200; Rabatt 2760 → 52440; Montage 9000; Netto 61440; MwSt 11673,6 → 11674; Brutto 73114
  const r = ok(F({ typ: "balkontuer", breiteMm: 800, hoeheMm: 2000 }));
  assert.equal(r.element, 55200); assert.equal(r.mwst, 11674); assert.equal(r.brutto, 73114);
});
test("F12 AluClip, Golden Oak 20 %, Schallschutz 60 €/m²", () => {
  // Basis 46000; Farbe 9200; Glas 6000; Element 61200; Rabatt 3060 → 58140; Montage 9000; Netto 67140; MwSt 12756,6 → 12757; Brutto 79897
  const r = ok(F({ system: "koemmerling-76-aluclip", farbe: "golden-oak", glas: "schallschutz" }));
  assert.equal(r.element, 61200); assert.equal(r.brutto, 79897);
});
test("F13 AluClip Pro 1,5 m², zweifarbig 25 %, VSG, innenliegende Sprossen", () => {
  // Basis 1,5×520=780 → 78000; Farbe 19500; Glas 1,5×80=120 → 12000; Sprossen 4000; Element 113500;
  // Rabatt 5675 → 107825; Montage 9000; Netto 116825; MwSt 22196,75 → 22197; Brutto 139022
  const r = ok(F({ system: "koemmerling-76-aluclip-pro", hoeheMm: 1500, farbe: "zweifarbig", glas: "sicherheit", sprossen: "innenliegend" }));
  assert.equal(r.element, 113500); assert.equal(r.mwst, 22197); assert.equal(r.brutto, 139022);
});
test("F14 88 AluClip Pro 2 m², Vorsatzrollladen + Motor", () => {
  // Basis 120000; Rollladen 2×120=240 → 24000; Motor 11000; Element 155000; Rabatt 7750 → 147250; Montage 9000;
  // Netto 156250; MwSt 29687,5 → 29688; Brutto 185938
  const r = ok(F({ system: "koemmerling-88-aluclip-pro", breiteMm: 2000, rollladen: "vorsatz", zusaetze: ["rollladenmotor"] }));
  assert.equal(r.element, 155000); assert.equal(r.mwst, 29688); assert.equal(r.brutto, 185938);
});
test("F15 Rollladenmotor ohne Rollladen wird nicht berechnet", () => {
  const r = ok(F({ zusaetze: ["rollladenmotor"] }));
  assert.equal(r.brutto, 44625); assert.equal(r.positionen.length, 1);
});
test("F16 Fensterbank innen 1,0 lfm", () => {
  // Fensterbank 5000; Element 35000; Rabatt 1750 → 33250; Montage 9000; Netto 42250; MwSt 8027,5 → 8028; Brutto 50278
  const r = ok(F({ zusaetze: ["fensterbank-innen"] }));
  assert.equal(r.element, 35000); assert.equal(r.brutto, 50278);
});
test("F17 Cortizo 70 an der Obergrenze 1600×2600 (4,16 m²)", () => {
  // Basis 4,16×620=2579,20 → 257920; Rabatt 12896 → 245024; Montage 9000; Netto 254024; MwSt 48264,56 → 48265; Brutto 302289
  const r = ok(F({ system: "cortizo-70", breiteMm: 1600, hoeheMm: 2600 }));
  assert.equal(r.element, 257920); assert.equal(r.brutto, 302289);
});
test("F18 Menge 0 ungültig", () => { assert.deepEqual(fail(F({ menge: 0 })), ["mengeMin"]); });
test("F19 Menge 51 über Maximum", () => { assert.deepEqual(fail(F({ menge: 51 })), ["mengeMax"]); });
test("F20 krumme Maße 1234×987 mm", () => {
  // Fläche 1.217.958 mm²; Basis 1,217958×300=365,3874 → 36539 (36538,74); Rabatt 1826,95 → 1827 → 34712;
  // Montage 9000; Netto 43712; MwSt 8305,28 → 8305; Brutto 52017
  const r = ok(F({ breiteMm: 1234, hoeheMm: 987 }));
  assert.equal(r.element, 36539); assert.equal(r.rabatt, 1827); assert.equal(r.brutto, 52017);
});
test("F21 ohne Montage: Demontage wird ignoriert", () => {
  // Produkt 30000; Rabatt 1500 → 28500; Netto 28500; MwSt 5415; Brutto 33915
  const r = ok(F({ montage: false, demontage: true }));
  assert.equal(r.montage, 0); assert.equal(r.brutto, 33915);
});
test("F22 76 AD 1,2 m², 2-fl, Golden Oak, 3-fach, Wiener, Aufsatz, RC2, Menge 3, Demontage", () => {
  // Basis 40800; Typ 8160; Farbe 8160; Glas 4800; Sprossen 10000; Rollladen 1,2×150=180 → 18000; RC2 12000; Element 101920
  // Produkt 305760; Rabatt 15288 → 290472; Montage 130×3=390 → 39000; Netto 329472; MwSt 62599,68 → 62600; Brutto 392072
  const r = ok(F({ system: "koemmerling-76-ad", hoeheMm: 1200, typ: "2-fluegelig", farbe: "golden-oak", glas: "3-fach", sprossen: "wiener", rollladen: "aufsatz", zusaetze: ["rc2"], menge: 3, demontage: true }));
  assert.equal(r.element, 101920); assert.equal(r.produkt, 305760); assert.equal(r.montage, 39000); assert.equal(r.brutto, 392072);
});
test("F23 Liste ohne Online-Rabatt: Brutto = Preis ohne Rabatt", () => {
  const l = JSON.parse(JSON.stringify(liste)); l.onlineRabattProzent = 0;
  const r = P.berechne(F({}), l); // Netto 39000; MwSt 7410; Brutto 46410
  assert.equal(r.ok, true); assert.equal(r.rabatt, 0); assert.equal(r.brutto, 46410); assert.equal(r.ohneRabattBrutto, 46410); assert.equal(r.ersparnisBrutto, 0);
});
test("F24 Liste mit 7 % MwSt (Rechenweg unabhängig vom Satz)", () => {
  const l = JSON.parse(JSON.stringify(liste)); l.mwstProzent = 7;
  const r = P.berechne(F({}), l); // Netto 37500; MwSt 2625; Brutto 40125
  assert.equal(r.mwst, 2625); assert.equal(r.brutto, 40125);
});
test("F25 Fensterbank außen, 2 Stück, ohne Montage", () => {
  // Fensterbank 7000; Element 37000; Produkt 74000; Rabatt 3700 → 70300; Netto 70300; MwSt 13357; Brutto 83657
  const r = ok(F({ zusaetze: ["fensterbank-aussen"], menge: 2, montage: false }));
  assert.equal(r.produkt, 74000); assert.equal(r.brutto, 83657);
});
test("F26 Höhe 2600 bei Kunststoff überschreitet 2500", () => { assert.deepEqual(fail(F({ hoeheMm: 2600 })), ["hoeheMax"]); });
test("F27 unbekannter Zusatz", () => { assert.ok(fail(F({ zusaetze: ["jacuzzi"] })).includes("zusatz:jacuzzi")); });
test("F28 Nicht-ganzzahlige Maße werden abgelehnt", () => { assert.ok(fail(F({ breiteMm: 1000.5 })).includes("breiteMin")); });

/* ---------- Haustür: Handrechnungen ---------- */
test("H01 Modern vollflächig, Standardmaß, weiß", () => {
  // Grund 240000; Rabatt 12000 → 228000; Montage 35000; Netto 263000; MwSt 49970; Brutto 312970
  const r = ok(H({}));
  assert.equal(r.element, 240000); assert.equal(r.montage, 35000); assert.equal(r.brutto, 312970);
  assert.equal(r.ohneRabattBrutto, 327250); // 275000 + 52250
});
test("H02 Glasstreifen, Übergröße 1200×2200 (+10 %)", () => {
  // Grund 270000; Übergröße 27000; Element 297000; Rabatt 14850 → 282150; Montage 35000; Netto 317150; MwSt 60258,5 → 60259; Brutto 377409
  const r = ok(H({ modell: "modern-glasstreifen", breiteMm: 1200, hoeheMm: 2200 }));
  assert.equal(r.element, 297000); assert.equal(r.mwst, 60259); assert.equal(r.brutto, 377409);
});
test("H03 Klassisch, alle Optionen, Demontage", () => {
  // Grund 260000; Farbe Golden Oak 12 % 31200; VSG 15000; Seitenteile beidseitig 130000;
  // RC2 30000 + Fingerprint 60000 + Automatik 45000 + Oberlicht 50000 = 185000; Element 621200
  // Rabatt 31060 → 590140; Montage 350+80=430 → 43000; Netto 633140; MwSt 120296,6 → 120297; Brutto 753437
  const r = ok(H({ modell: "klassisch-golden-oak", breiteMm: 1000, hoeheMm: 2000, farbe: "golden-oak", glas: "sicherheit", seitenteil: "beidseitig", zusaetze: ["rc2", "fingerprint", "automatikschloss", "oberlicht"], demontage: true }));
  assert.equal(r.element, 621200); assert.equal(r.montage, 43000); assert.equal(r.brutto, 753437);
});
test("H04 Breite 700 mm unter Minimum", () => { assert.deepEqual(fail(H({ breiteMm: 700 })), ["breiteMin"]); });
test("H05 Unbekanntes Modell", () => { assert.ok(fail(H({ modell: "palast" })).includes("modell")); });
test("H06 Mit Seitenteil, anthrazit 10 %", () => {
  // Grund 310000; Farbe 31000; Element 341000; Rabatt 17050 → 323950; Montage 35000; Netto 358950; MwSt 68200,5 → 68201; Brutto 427151
  const r = ok(H({ modell: "mit-seitenteil", farbe: "anthrazit" }));
  assert.equal(r.element, 341000); assert.equal(r.mwst, 68201); assert.equal(r.brutto, 427151);
});
test("H07 Höhe 2401 über Maximum, Menge 6 über Maximum", () => {
  assert.deepEqual(fail(H({ hoeheMm: 2401 })), ["hoeheMax"]);
  assert.deepEqual(fail(H({ menge: 6 })), ["mengeMax"]);
});
test("H08 Genau Standardmaß 1100×2100 → keine Übergröße; 1101 → Übergröße", () => {
  assert.equal(ok(H({})).positionen.length, 1);
  assert.match(ok(H({ breiteMm: 1101 })).positionen[1].name, /Übergröße/);
});

/* ---------- Schema / Robustheit ---------- */
test("S01 Negativer Preis in der Liste → kein Preis (Preis auf Anfrage)", () => {
  const l = JSON.parse(JSON.stringify(liste)); l.fenster.systeme["koemmerling-70"].preisProM2 = -1;
  const v = P.validiereListe(l); assert.equal(v.ok, false); assert.ok(v.fehler.some((e) => /preisProM2/.test(e)));
  const r = P.berechne(F({}), l); assert.equal(r.ok, false); assert.equal(r.fehler[0], "preisliste");
});
test("S02 Fehlende Montage-Preise, MwSt 40 %, Rabatt 60 %, 3 Nachkommastellen → ungültig", () => {
  let l = JSON.parse(JSON.stringify(liste)); delete l.fenster.montage; assert.equal(P.validiereListe(l).ok, false);
  l = JSON.parse(JSON.stringify(liste)); l.mwstProzent = 40; assert.equal(P.validiereListe(l).ok, false);
  l = JSON.parse(JSON.stringify(liste)); l.onlineRabattProzent = 60; assert.equal(P.validiereListe(l).ok, false);
  l = JSON.parse(JSON.stringify(liste)); l.fenster.glas["3-fach"].zuschlagProM2 = 40.005; assert.equal(P.validiereListe(l).ok, false);
});
test("S03 Leere Systemliste, leeres Produkt, kaputte Konfiguration", () => {
  const l = JSON.parse(JSON.stringify(liste)); l.fenster.systeme = {}; assert.equal(P.validiereListe(l).ok, false);
  assert.deepEqual(P.berechne({ produkt: "zaun" }, liste).fehler, ["produkt"]);
  assert.deepEqual(P.berechne(null, liste).fehler, ["konfiguration"]);
});
test("S04 Euro-Formatierung", () => {
  assert.equal(P.euro(44625), "446,25 €"); assert.equal(P.euro(343303), "3.433,03 €"); assert.equal(P.euro(5), "0,05 €"); assert.equal(P.euro(0), "0,00 €");
});

/* ---------- Eigenschaften ---------- */
test("P01 Preis steigt monoton mit Breite und Höhe (alle Systeme)", () => {
  for (const sys of Object.keys(liste.fenster.systeme)) {
    let prev = 0;
    for (let b = 600; b <= 1400; b += 100) {
      const r = ok(F({ system: sys, breiteMm: b, hoeheMm: 1200 }));
      assert.ok(r.brutto >= prev, sys + " Breite " + b); prev = r.brutto;
    }
    prev = 0;
    for (let h = 600; h <= 2400; h += 100) {
      const r = ok(F({ system: sys, breiteMm: 1000, hoeheMm: h }));
      assert.ok(r.brutto >= prev, sys + " Höhe " + h); prev = r.brutto;
    }
  }
});
test("P02 Nie negativ, Brutto ≥ Netto ≥ 0, Ersparnis ≥ 0 – zufällige Konfigurationen", () => {
  const keys = (o) => Object.keys(o);
  let seed = 42; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  for (let i = 0; i < 300; i++) {
    const cfg = F({ system: pick(keys(liste.fenster.systeme)), typ: pick(keys(liste.fenster.typen)), farbe: pick(keys(liste.fenster.farben)), glas: pick(keys(liste.fenster.glas)), sprossen: pick(keys(liste.fenster.sprossen)), rollladen: pick(keys(liste.fenster.rollladen)), zusaetze: keys(liste.fenster.zusaetze).filter(() => rnd() < 0.5), breiteMm: 400 + Math.floor(rnd() * 1000), hoeheMm: 400 + Math.floor(rnd() * 2100), menge: 1 + Math.floor(rnd() * 50), montage: rnd() < 0.7, demontage: rnd() < 0.5 });
    const r = P.berechne(cfg, liste);
    assert.equal(r.ok, true, JSON.stringify(cfg) + " " + JSON.stringify(r.fehler));
    assert.ok(r.netto >= 0 && r.brutto >= r.netto && r.ersparnisBrutto >= 0 && r.rabatt >= 0 && r.positionen.every((p) => Number.isInteger(p.betrag)));
    assert.ok(Number.isInteger(r.brutto) && Number.isInteger(r.mwst));
  }
});
test("P03 Produktpreis ist linear in der Menge, Rabatt proportional", () => {
  const one = ok(F({ system: "koemmerling-88", breiteMm: 1300, hoeheMm: 1500, glas: "3-fach" }));
  for (const n of [2, 5, 17, 50]) {
    const r = ok(F({ system: "koemmerling-88", breiteMm: 1300, hoeheMm: 1500, glas: "3-fach", menge: n }));
    assert.equal(r.produkt, one.produkt * n); assert.equal(r.montage, one.montage * n);
  }
});
test("P04 Festverglasung ist immer günstiger als Dreh-Kipp, 2-flügelig immer teurer", () => {
  for (const sys of Object.keys(liste.fenster.systeme)) {
    const dk = ok(F({ system: sys, breiteMm: 1200, hoeheMm: 1300 })).brutto;
    assert.ok(ok(F({ system: sys, breiteMm: 1200, hoeheMm: 1300, typ: "festverglasung" })).brutto < dk);
    assert.ok(ok(F({ system: sys, breiteMm: 1200, hoeheMm: 1300, typ: "2-fluegelig" })).brutto > dk);
  }
});
