/* Steuer-Schalter (Kleinunternehmer § 19 UStG ↔ 19 %): Rechner, Texte, Einstellungen, Generator.
   Aufruf: node --test tests/ */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const ROOT = path.join(__dirname, "..");
const P = require("../js/preis.js");
const Steuer = require("../js/steuer.js");
const PV = require("../js/preis-validate.js");
/* Handrechnungen gelten für die Beispiel-Preisliste (Fixture) – data/preise.json enthält im Netlify-Build die echten Admin-Preise */
const liste = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "preise-beispiel.json"), "utf8"));
const F = (o) => Object.assign({ produkt: "fenster", system: "koemmerling-70", typ: "1-fluegelig", farbe: "weiss", glas: "2-fach", sprossen: "keine", rollladen: "keiner", zusaetze: [], breiteMm: 1000, hoeheMm: 1000, menge: 1, montage: true, demontage: false }, o);
const H = (o) => Object.assign({ produkt: "haustuer", modell: "modern-voll", farbe: "weiss", glas: "standard", seitenteil: "keines", zusaetze: [], breiteMm: 1100, hoeheMm: 2100, menge: 1, montage: true, demontage: false }, o);

/* ---------- Rechner ---------- */
test("0 %: Endpreis = Summe, keine Steuer; Online-Rabatt und Montage unverändert (Fenster F01)", () => {
  const r = P.berechne(F({}), liste, 0); // Basis 30000; Rabatt 1500 → 28500; Montage 9000; Summe 37500
  assert.equal(r.ok, true);
  assert.equal(r.rabatt, 1500); assert.equal(r.montage, 9000);
  assert.equal(r.summe, 37500); assert.equal(r.steuerProzent, 0); assert.equal(r.steuer, 0); assert.equal(r.endpreis, 37500);
  assert.equal(r.ohneRabatt, 39000); assert.equal(r.ersparnis, 1500);
});
test("19 %: Steuer auf die Summe, Endpreis = Summe + Steuer (Fenster F01)", () => {
  const r = P.berechne(F({}), liste, 19); // Summe 37500; Steuer 7125; Endpreis 44625
  assert.equal(r.summe, 37500); assert.equal(r.steuerProzent, 19); assert.equal(r.steuer, 7125); assert.equal(r.endpreis, 44625);
  assert.equal(r.ohneRabatt, 46410); assert.equal(r.ersparnis, 1785);
});
test("0 % und 19 %: Haustür (H01) – gleiche Summe, nur Steuer unterscheidet sich", () => {
  const a = P.berechne(H({}), liste, 0), b = P.berechne(H({}), liste, 19); // Summe 263000
  assert.equal(a.summe, 263000); assert.equal(b.summe, 263000);
  assert.equal(a.endpreis, 263000); assert.equal(a.steuer, 0);
  assert.equal(b.steuer, 49970); assert.equal(b.endpreis, 312970);
});
test("Mehrere Konfigurationen: Endpreis(0 %) = Summe, Endpreis(19 %) = Summe + rund(Summe × 0,19)", () => {
  const cfgs = [F({ system: "koemmerling-88", breiteMm: 1800, hoeheMm: 1500, menge: 3, demontage: true }), F({ typ: "2-fluegelig", farbe: "anthrazit", glas: "3-fach", rollladen: "aufsatz", zusaetze: ["fensterbank-innen"] }), H({ modell: "klassisch-golden-oak", farbe: "anthrazit", seitenteil: "rechts", menge: 2 }), F({ montage: false })];
  for (const c of cfgs) {
    const a = P.berechne(c, liste, 0), b = P.berechne(c, liste, 19);
    assert.equal(a.ok, true, JSON.stringify(a.fehler)); assert.equal(b.ok, true, JSON.stringify(b.fehler));
    assert.equal(a.endpreis, a.summe); assert.equal(a.steuer, 0);
    assert.equal(a.summe, b.summe); assert.equal(a.rabatt, b.rabatt); assert.equal(a.montage, b.montage);
    assert.equal(b.steuer, Math.round(b.summe * 19 / 100 + 1e-9)); assert.equal(b.endpreis, b.summe + b.steuer);
    assert.deepEqual(a.positionen, b.positionen);
  }
});
test("Ohne Satz oder mit ungültigem Satz rechnet der Rechner mit 0 % (Kleinunternehmer-Standard)", () => {
  assert.equal(P.berechne(F({}), liste).endpreis, 37500);
  assert.equal(P.berechne(F({}), liste, undefined).steuerProzent, 0);
  assert.equal(P.berechne(F({}), liste, "19").steuerProzent, 0);
  assert.equal(P.berechne(F({}), liste, -5).steuerProzent, 0);
});
test("Preisliste enthält keinen Steuersatz mehr; eine alte Liste mit mwstProzent bleibt gültig, der Satz wird ignoriert", () => {
  assert.equal(liste.mwstProzent, undefined);
  const aktuell = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "preise.json"), "utf8"));
  assert.equal(aktuell.mwstProzent, undefined, "aktuelle Preisliste ohne Steuersatz");
  assert.deepEqual(PV.validierePreise(aktuell), [], "aktuelle Preisliste (Repo bzw. Admin) ist gültig");
  const alt = Object.assign({}, liste, { mwstProzent: 19 });
  assert.equal(P.validiereListe(alt).ok, true);
  assert.equal(P.berechne(F({}), alt, 0).endpreis, 37500);
  assert.deepEqual(PV.validierePreise(liste), []);
});

/* ---------- Modul ---------- */
test("Steuer.satz: 0 als Standard, nur 0 oder 19 gültig", () => {
  assert.equal(Steuer.satz(undefined), 0);
  assert.equal(Steuer.satz({}), 0);
  assert.equal(Steuer.satz({ steuer: { satzProzent: 19 } }), 19);
  assert.equal(Steuer.satz({ steuer: { satzProzent: 7 } }), 0);
  assert.equal(Steuer.satz({ steuer: { satzProzent: "19" } }), 0);
  assert.deepEqual(Steuer.SAETZE, [0, 19]);
});
test("Steuer.texte: Kleinunternehmer-Texte bei 0 %, MwSt-Texte bei 19 %", () => {
  const t0 = Steuer.texte(0), t19 = Steuer.texte(19);
  assert.equal(t0.lang, "Endpreis – gemäß § 19 UStG wird keine Umsatzsteuer berechnet.");
  assert.equal(t0.kurz, "Endpreis gem. § 19 UStG");
  assert.equal(t0.steuerLabel, null); assert.equal(t0.summeLabel, "Endpreis");
  assert.equal(t19.kurz, "inkl. 19 % MwSt."); assert.equal(t19.steuerLabel, "MwSt. 19 %"); assert.equal(t19.summeLabel, "Netto");
  assert.equal(Steuer.preisMitZusatz("1,00 €", 0), "1,00 € · Endpreis gem. § 19 UStG");
  assert.deepEqual(Steuer.optionen().map((o) => o.label), ["0 % (Kleinunternehmer, § 19 UStG)", "19 %"]);
  assert.ok(!/mwst|inkl\./i.test(t0.lang + t0.kurz), "bei 0 % kein MwSt-Wort");
});
test("Platzhalter {steuerhinweis} wird je nach Satz ersetzt", () => {
  assert.equal(Steuer.ersetzePlatzhalter("<p>Preise: {steuerhinweis}</p>", 0), "<p>Preise: Endpreis – gemäß § 19 UStG wird keine Umsatzsteuer berechnet.</p>");
  assert.equal(Steuer.ersetzePlatzhalter("{steuerhinweis}", 19), "Alle Preise inkl. 19 % MwSt.");
  assert.equal(Steuer.ersetzePlatzhalter(null, 0), "");
});
test("Einstellungen: steuer.satzProzent muss 0 oder 19 sein; Repo-Einstellungen gültig mit 0 %", () => {
  const e = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "einstellungen.json"), "utf8"));
  assert.ok(Steuer.gueltig(Steuer.satz(e)), "Steuersatz der Einstellungen ist gültig");
  assert.deepEqual(PV.validiereEinstellungen(e), []);
  assert.deepEqual(PV.validiereEinstellungen({ konfigurator: { status: "aus" }, steuer: { satzProzent: 19 } }), []);
  assert.deepEqual(PV.validiereEinstellungen({ konfigurator: { status: "aus" } }), [], "ohne steuer-Block: Standard 0 %");
  assert.equal(PV.validiereEinstellungen({ konfigurator: { status: "aus" }, steuer: { satzProzent: 7 } })[0].feld, "steuer.satzProzent");
  assert.equal(PV.validiereEinstellungen({ konfigurator: { status: "aus" }, steuer: {} })[0].feld, "steuer.satzProzent");
});
test("Prüfwörter: verbotene Wörter werden gefunden, Modultexte sind erlaubt", () => {
  assert.equal(Steuer.verstoesse("Preis 100 € " + Steuer.texte(0).lang, 0).length, 0);
  assert.equal(Steuer.verstoesse("Preis 100 € " + Steuer.texte(19).kurz, 19).length, 0);
  assert.deepEqual(Steuer.verstoesse("Alles inkl. MwSt.\nBrutto 19%", 0).map((v) => v.wort + "@" + v.zeile), ["inkl. MwSt@1", "Brutto@2", "19%@2"]);
  assert.equal(Steuer.verstoesse("Richtpreis inkl. Montage, inkl. Demontage und Entsorgung, zzgl. Anfahrt", 0).length, 0, "inkl./zzgl. ohne Steuerbezug sind erlaubt");
  assert.deepEqual(Steuer.verstoesse("zzgl. USt. und inkl. 7 % Mehrwertsteuer", 0).map((v) => v.wort), ["zzgl. USt", "inkl. 7 % Mehrwertsteuer"]);
  assert.equal(Steuer.verstoesse("Umsatzsteuer-ID DE1", 0).length, 1, "USt-IdNr muss der Test gesondert ausnehmen");
  assert.equal(Steuer.verstoesse("§ 19 UStG", 0).length, 0, "Paragraf ohne Prozent ist kein Treffer");
});

/* ---------- Generator: Umschalten ändert die Seiten ---------- */
function kopie(satz, status) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fw-steuer-"));
  for (const f of ["index.html", "data/preise.json", "data/einstellungen.json", "js/preis.js", "js/steuer.js", "netlify/functions/_lib/firma.js"]) {
    fs.mkdirSync(path.dirname(path.join(tmp, f)), { recursive: true });
    fs.copyFileSync(path.join(ROOT, f), path.join(tmp, f));
  }
  const e = JSON.parse(fs.readFileSync(path.join(tmp, "data/einstellungen.json"), "utf8"));
  e.steuer.satzProzent = satz; e.konfigurator.status = status;
  fs.writeFileSync(path.join(tmp, "data/einstellungen.json"), JSON.stringify(e, null, 2));
  execFileSync(process.execPath, [path.join(ROOT, "scripts/build-konfigurator.js")], { env: Object.assign({}, process.env, { FW_ROOT: tmp }), stdio: "pipe" });
  return { fenster: fs.readFileSync(path.join(tmp, "konfigurator/fenster/index.html"), "utf8"), haustuer: fs.readFileSync(path.join(tmp, "konfigurator/haustuer/index.html"), "utf8") };
}
test("Generator bei 0 %: Seiten tragen data-steuer=0, den § 19-Hinweis und kein MwSt-Wort", () => {
  const s = kopie(0, "online");
  for (const html of [s.fenster, s.haustuer]) {
    assert.ok(html.includes('data-steuer="0"'));
    assert.ok(html.includes(Steuer.texte(0).lang));
    assert.ok(html.includes("/js/steuer.js"));
    assert.equal(Steuer.verstoesse(html, 0).length, 0, JSON.stringify(Steuer.verstoesse(html, 0)));
  }
});
test("Generator bei 19 %: Seiten tragen data-steuer=19 und die 19-%-Texte, nicht den § 19-Hinweis", () => {
  const s = kopie(19, "online");
  for (const html of [s.fenster, s.haustuer]) {
    assert.ok(html.includes('data-steuer="19"'));
    assert.ok(html.includes("inkl. 19 % MwSt."));
    assert.ok(!html.includes(Steuer.texte(0).lang));
    assert.equal(Steuer.verstoesse(html, 19).length, 0, JSON.stringify(Steuer.verstoesse(html, 19)));
  }
});
