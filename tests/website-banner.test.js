/* Tests: Admin → Einstellungen → Website – Wartungsmodus und Ankündigungsbanner in allen Zuständen.
   Ursache des Produktionsfehlers (Oktober 2026): Der Bannertext steht bewusst auf jeder Seite; die Dubletten-Prüfung
   (scripts/text-duplikate.js, von scripts/build-orte.js für jede Ortsseite genutzt) zählte ihn als „doppelten Satz“ und ließ
   den Build scheitern, sobald der Text acht Wörter hatte. Der Block <!--ankuendigung--> ist jetzt ausgenommen.
   Keine festen Admin-Datenwerte – alle Erwartungen folgen aus synthetischen Einstellungen. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const firma = require("../netlify/functions/_lib/firma");
const PV = require("../js/preis-validate.js");
const td = require("../scripts/text-duplikate");
const lies = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const basis = () => JSON.parse(lies("data/einstellungen.json"));
const mitWebsite = (w) => { const e = basis(); e.website = Object.assign({}, e.website, w, w.banner ? { banner: Object.assign({}, e.website.banner, w.banner) } : {}); return e; };
const LANG = "Wir sind vom 1. Oktober bis 20. Oktober im Urlaub. Anfragen beantworten wir danach umgehend und freuen uns auf Sie.";

test("Banner: Zeitraum – leer = aktiv; laufend = aktiv; Beginn in der Zukunft = im HTML (Browser blendet am Starttag ein); Ende vorbei = schon im Build weg", () => {
  const heute = "2026-10-08";
  assert.equal(firma.bannerAktiv({ aktiv: true, text: "x", von: "", bis: "" }, heute), true);
  assert.equal(firma.bannerAktiv({ aktiv: true, text: "x", von: "2026-10-01", bis: "2026-10-20" }, heute), true);
  assert.equal(firma.bannerAktiv({ aktiv: true, text: "x", von: "2026-12-20", bis: "2027-01-06" }, heute), true, "künftiger Zeitraum bleibt im HTML (data-von), sichtbar erst ab dem Tag");
  assert.equal(firma.bannerAktiv({ aktiv: true, text: "x", von: "2026-09-01", bis: "2026-09-20" }, heute), false, "abgelaufen → nicht mehr eingesetzt");
  assert.equal(firma.bannerAktiv({ aktiv: false, text: "x" }, heute), false);
  assert.equal(firma.bannerAktiv({ aktiv: true, text: "   " }, heute), false);
  const html = firma.bannerHtml(mitWebsite({ banner: { aktiv: true, text: LANG, von: "2026-12-20", bis: "2027-01-06" } }));
  assert.match(html, /data-von="2026-12-20" data-bis="2027-01-06"/); assert.match(html, /\bhidden\b/, "im HTML versteckt, der Browser prüft das Datum");
  assert.equal(firma.bannerHtml(mitWebsite({ banner: { aktiv: true, text: LANG, von: "2020-01-01", bis: "2020-01-31" } })), "");
});
test("Banner wird auf jeder Seite eingesetzt und beim Ausschalten wieder entfernt (idempotent)", () => {
  const seite = "<!doctype html><html><body class=\"page\">\n<main><p>Inhalt</p></main></body></html>";
  const an = firma.bannerEinsetzen(seite, mitWebsite({ banner: { aktiv: true, text: LANG, von: "", bis: "" } }));
  assert.ok(an.includes("<!--ankuendigung-->") && an.includes(LANG) && an.indexOf("<!--ankuendigung-->") < an.indexOf("<main>"));
  assert.equal(firma.bannerEinsetzen(an, mitWebsite({ banner: { aktiv: true, text: LANG, von: "", bis: "" } })), an, "zweiter Lauf ändert nichts");
  const aus = firma.bannerEinsetzen(an, mitWebsite({ banner: { aktiv: false, text: LANG } }));
  assert.ok(!aus.includes("ankuendigung") && !aus.includes(LANG));
});
test("Dubletten-Prüfung ignoriert den Banner-Block – auch bei langen Texten mit Zahlen und Punkten", () => {
  const html = (ort) => `<html><head><title>${ort}</title></head><body>${firma.bannerBlock(mitWebsite({ banner: { aktiv: true, text: LANG, von: "", bis: "" } }))}<main><h1>${ort}</h1><p>Eigener Text über Fenster und Türen in ${ort} mit vielen verschiedenen Wörtern für die Prüfung.</p></main></body></html>`;
  const a = td.seiteAnalysieren(html("Ingolstadt")), b = td.seiteAnalysieren(html("Karlsruhe"));
  assert.ok(!a.saetze.some((s) => /Urlaub/.test(s)) && !b.saetze.some((s) => /Urlaub/.test(s)), "Bannersätze zählen nicht");
  const reg = lies("scripts/inhalte-registry.js"); assert.ok(reg.includes("<!--ankuendigung-->"), "Register sperrt den Banner-Block");
});
test("Speichern: klare Meldungen je Feld – Text nur bei aktivem Banner Pflicht, Datum im Kalenderformat, Ende nicht vor Beginn; gültige Kombinationen ohne Fehler", () => {
  const f = (w) => PV.validiereEinstellungen(mitWebsite(w)).filter((x) => x.feld.startsWith("website")).map((x) => x.feld + ": " + x.meldung);
  assert.deepEqual(f({ wartung: true }), []);
  assert.deepEqual(f({ banner: { aktiv: true, text: LANG, von: "", bis: "" } }), []);
  assert.deepEqual(f({ banner: { aktiv: true, text: LANG, von: "2026-12-20", bis: "2027-01-06" } }), []);
  assert.deepEqual(f({ banner: { aktiv: true, text: LANG, von: "2026-09-01", bis: "2026-09-20" } }), [], "vergangener Zeitraum ist erlaubt (Banner erscheint dann nicht)");
  assert.deepEqual(f({ banner: { aktiv: false, text: "", von: "", bis: "" } }), [], "aus: Text darf leer sein");
  assert.deepEqual(f({ banner: { aktiv: true, text: "", von: "", bis: "" } }), ["website.banner.text: Text für das Banner fehlt."]);
  assert.deepEqual(f({ banner: { aktiv: true, text: "x", von: "20.12.2026", bis: "" } }), ["website.banner.von: Datum im Format JJJJ-MM-TT."]);
  assert.deepEqual(f({ banner: { aktiv: true, text: "x", von: "2027-01-06", bis: "2026-12-20" } }), ["website.banner.bis: Ende liegt vor dem Beginn."]);
  assert.deepEqual(f({ wartung: "ja" }), ["website.wartung: Schalter an/aus."]);
});
test("Wartungsmodus: _redirects schickt Besucher auf wartung.html, Admin und Assets bleiben; aus = keine Regeln; Seite nennt Telefon und E-Mail", () => {
  const an = firma.wartungRedirects(mitWebsite({ wartung: true }));
  assert.match(an, /^\/\*  \/wartung\.html  200!$/m); assert.match(an, /\/admin\/\*  \/\.netlify\/functions\/admin-seite  200!/); assert.match(an, /\/assets\/\*/); assert.match(an, /\/css\/\*/); assert.match(an, /\/js\/\*/);
  assert.equal(firma.wartungRedirects(mitWebsite({ wartung: false })), "");
  const w = lies("wartung.html");
  assert.ok(/data-firma="tel"/.test(w) && /data-firma="mail"/.test(w) && /data-firma="wartungstext"/.test(w) && /noindex/.test(w));
});
test("Admin-Oberfläche: Datumsfelder als Kalender, Urlaubs-Knopf vorhanden, Fehlertext je Feld", () => {
  const ui = lies("js/admin-einstellungen.js");
  assert.ok(ui.includes('p: "website.banner.von"') && ui.includes('t: "date"'));
  assert.ok(ui.includes("urlaub"), "Schnellknopf „Urlaub“");
  assert.ok(ui.includes('class="fehler-text"'));
  assert.ok(lies("css/admin.css").includes(".fehler-text"));
});
