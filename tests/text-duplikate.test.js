/* Text-Duplikate (scripts/text-duplikate.js): Jede öffentliche Seite hat eigene Texte.
   Der Test läuft im Netlify-Build (node --test tests/*.test.js) und lässt den Build scheitern, sobald zwei
   verschiedene Seiten einen Satz (≥ 8 Wörter) mit mehr als 80 % Ähnlichkeit, denselben Titel, dieselbe
   Beschreibung oder dieselbe H1 tragen. Dazu Selbsttests der Messung (Ähnlichkeit, Haupttext, Satzgrenzen). */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const td = require("../scripts/text-duplikate");
const ROOT = path.join(__dirname, "..");

let ergebnis;
test.before(() => { ergebnis = td.pruefen(ROOT); });

test("Text-Duplikate: alle öffentlichen Seiten werden erfasst (Startseite, Leistungen, Produkte, Ortsseiten)", () => {
  const s = ergebnis.seiten;
  assert.ok(s.length >= 170, "zu wenige Seiten: " + s.length);
  for (const f of ["index.html", "leistungen/index.html", "referenzen/index.html", "produkte/index.html", "produkte/haustueren/index.html", "einsatzgebiet/index.html", "einsatzgebiet/ingolstadt/index.html", "konfigurator/fenster/index.html"]) assert.ok(s.includes(f), "fehlt: " + f);
  for (const f of ["404.html", "danke.html", "wartung.html", "admin/index.html"]) assert.ok(!s.includes(f), "darf nicht geprüft werden: " + f);
  assert.ok(ergebnis.saetzeGesamt > 2000, "zu wenige Sätze im Vergleich: " + ergebnis.saetzeGesamt);
});
test("Text-Duplikate: kein Satz (≥ 8 Wörter) ist auf zwei verschiedenen Seiten zu mehr als 80 % gleich", () => {
  const p = ergebnis.paare;
  assert.equal(p.length, 0, `${p.length} doppelte Satzpaare – node scripts/text-duplikate.js --bericht zeigt alle. Die ersten:\n` + p.slice(0, 15).map((x) => `  ${(x.sim * 100).toFixed(0)} %  ${x.a} ↔ ${x.b}\n     A: „${x.satzA}“\n     B: „${x.satzB}“`).join("\n"));
});
test("Text-Duplikate: Titel, Beschreibungen und H1 sind je Seite einmalig", () => {
  const z = (l) => l.map((k) => `  [${k.feld}] ${k.seiten.join(" ↔ ")}: „${k.text}“`).join("\n");
  assert.equal(ergebnis.titel.length, 0, "gleiche Titel:\n" + z(ergebnis.titel));
  assert.equal(ergebnis.beschreibungen.length, 0, "gleiche Beschreibungen:\n" + z(ergebnis.beschreibungen));
  assert.equal(ergebnis.h1.length, 0, "gleiche H1:\n" + z(ergebnis.h1));
});

test("Selbsttest Ähnlichkeit: gleiche Sätze mit anderem Ortsnamen gelten als Duplikat, andere Formulierung nicht", () => {
  const a = "Wir melden uns innerhalb von zwei Werktagen und vereinbaren einen Termin bei Ihnen in Lenting.";
  const b = "Wir melden uns innerhalb von zwei Werktagen und vereinbaren einen Termin bei Ihnen in Hepberg.";
  const c = "Innerhalb von zwei Werktagen hören Sie von uns – mit einem Terminvorschlag für Beratung und Aufmaß bei Ihnen zu Hause.";
  assert.ok(td.aehnlichkeit(a, a) === 1);
  assert.ok(td.aehnlichkeit(a, b) > td.SCHWELLE, "Ortsname allein macht keinen eigenen Satz: " + td.aehnlichkeit(a, b));
  assert.ok(td.aehnlichkeit(a, "WIR MELDEN UNS innerhalb von zwei Werktagen, und vereinbaren einen Termin bei Ihnen in Lenting!") > 0.95, "Groß-/Kleinschreibung und Satzzeichen zählen nicht");
  assert.ok(td.aehnlichkeit(a, c) < td.SCHWELLE, "eigene Formulierung: " + td.aehnlichkeit(a, c));
  assert.ok(td.aehnlichkeit("Fenster und Türen nach Maß.", "Haustüren mit Mehrfachverriegelung und Sicherheitsglas.") < 0.5);
  /* Jaccard der 3-Gramme erkennt auch umgestellte/verlängerte Sätze */
  const d = "Beratung, Aufmaß und Montage finden bei Ihnen vor Ort statt, und die alten Fenster nehmen wir mit.";
  const e = "Zusätzlich gilt: Beratung, Aufmaß und Montage finden bei Ihnen vor Ort statt, und die alten Fenster nehmen wir mit.";
  assert.ok(td.aehnlichkeit(d, e) > td.SCHWELLE);
  assert.equal(td.levenshtein("kitten", "sitting", 10), 3);
  assert.equal(td.levenshtein("kitten", "sitting", 2), 3, "Band: Abbruch meldet maxDist + 1");
});
test("Selbsttest SatzIndex: findet Paare nur zwischen verschiedenen Seiten und ignoriert kurze Sätze", () => {
  const ix = new td.SatzIndex();
  const satz = "Unsere Monteure setzen jedes Element lot- und waagerecht und dichten die Fuge fachgerecht ab.";
  ix.add("a.html", satz);
  ix.add("a.html", "Ein zweiter, ganz anderer Satz derselben Seite über Haustüren mit Mehrfachverriegelung und Seitenteil.");
  assert.equal(ix.add("b.html", "Kurzer Satz ohne Belang."), null, "< 8 Wörter: nicht im Index");
  assert.equal(ix.paare().length, 0);
  ix.add("b.html", satz.replace("Monteure", "Fachleute"));
  const p = ix.paare();
  assert.equal(p.length, 1); assert.equal(p[0].a, "b.html"); assert.equal(p[0].b, "a.html"); assert.ok(p[0].sim > td.SCHWELLE);
  assert.equal(ix.konflikte("c.html", [satz + " Zweiter Satz mit acht Wörtern, der aber nirgends steht."]).length, 2, "Konflikt mit beiden Seiten");
  assert.equal(ix.konflikte("a.html", [satz]).length, 1, "eigene Seite zählt nicht");
});
test("Selbsttest Haupttext: Kopf, Navigation, H1, Fußzeile, Formular, Buttons, Firmendaten und Produktkarten bleiben außen vor", () => {
  const html = `<html><head><title>T &amp; T</title><meta name="description" content="Beschreibung &quot;x&quot;"></head><body>
    <header class="top"><nav><a href="/">Home</a></nav><p>Kopfzeile mit genug Wörtern, um einen langen Satz zu bilden.</p></header>
    <main><h1 class="title">Fenster <em>für Lenting</em></h1>
      <p class="lead">Erster Satz des Haupttexts mit ausreichend vielen Wörtern darin. Zweiter Satz, z. B. mit Abkürzung und ca. 3 Wörtern mehr.</p>
      <a class="btn btn--primary" href="#anfrage">Kostenloses Aufmaß anfragen – jetzt sofort unverbindlich hier klicken</a>
      <address class="contact__card" data-firma="adresse">Musterstraße 1, 85057 Ingolstadt, Telefon und noch mehr Text</address>
      <!--produkte-karten--><ul><li>Produktkarte mit vielen Wörtern aus dem Admin-Bereich der Website hier</li></ul><!--/produkte-karten-->
      <ul><li>Listenpunkt eins mit Text</li><li>Listenpunkt zwei</li></ul>
      <form><label>Name im Formular mit vielen Wörtern, die niemals gezählt werden dürfen</label></form>
      <script type="application/ld+json">{"text":"JSON mit vielen Wörtern, die niemals gezählt werden dürfen"}</script>
    </main>
    <footer class="legal">Fußzeile mit vielen Wörtern, die niemals gezählt werden dürfen</footer></body></html>`;
  const s = td.seiteAnalysieren(html);
  assert.equal(s.titel, "T & T"); assert.equal(s.beschreibung, 'Beschreibung "x"'); assert.equal(s.h1, "Fenster für Lenting");
  assert.deepEqual(s.saetze, ["Erster Satz des Haupttexts mit ausreichend vielen Wörtern darin.", "Zweiter Satz, z. B. mit Abkürzung und ca. 3 Wörtern mehr.", "Listenpunkt eins mit Text", "Listenpunkt zwei"]);
  assert.equal(s.lang.length, 2);
  assert.deepEqual(td.saetze("Preise ab 1.200 € inkl. Montage. Stand 31.12.2025! Noch eine Frage? Ja."), ["Preise ab 1.200 € inkl. Montage.", "Stand 31.12.2025!", "Noch eine Frage?", "Ja."]);
});
