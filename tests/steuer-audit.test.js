/* Sperrtest Steuer: Keine Spur von Umsatzsteuer-Wörtern außerhalb von js/steuer.js.
   Durchsucht alle veröffentlichten HTML-, JS- und JSON-Dateien (auch die im Build aus dem Admin-Speicher
   geschriebenen Texte in data/*.json und die data-text-Bausteine der Seiten) sowie die Functions (E-Mail-Texte)
   nach „MwSt“, „Mehrwertsteuer“, „USt“, „Umsatzsteuer“, „19 %“, „inkl.“, „zzgl.“, „brutto“, „netto“.
   Erlaubt: die Texte des Moduls js/steuer.js für den aktuellen Satz und die USt-IdNr im Impressum.
   Jeder andere Treffer ⇒ Test rot ⇒ Build bricht ab ⇒ nichts wird veröffentlicht.
   Bei 19 %: zusätzlich müssen die 19-%-Texte auf allen Seiten mit Preisen (Konfigurator) stehen. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const Steuer = require("../js/steuer.js");

const einst = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "einstellungen.json"), "utf8"));
const SATZ = Steuer.satz(einst);
const AUSNAHME_DATEIEN = new Set(["js/steuer.js"]);
/* USt-IdNr im Impressum (Identifikationsnummer, keine berechnete Steuer) – nur diese Formulierungen */
const USTID = [/Umsatzsteuer-ID/g, /Umsatzsteuer-Identifikationsnummer gemäß § 27 a Umsatzsteuergesetz/g];
const SKIP_DIRS = new Set(["node_modules", ".git", ".netlify", "tests", "scripts", "assets", "bilder-original", "bilder-original-2", "firma ferestre"]);

function dateien() {
  const out = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) { if (SKIP_DIRS.has(e.name) || e.name.startsWith("design-") || e.name.startsWith(".")) continue; walk(path.join(dir, e.name)); continue; }
      const rel = path.relative(ROOT, path.join(dir, e.name)).split(path.sep).join("/");
      if (/\.html$/.test(rel)) out.push(rel);
      else if (/^js\/[^/]+\.js$/.test(rel)) out.push(rel);
      else if (/^data\/[^/]+\.json$/.test(rel)) out.push(rel);
      else if (/^netlify\/functions\/.*\.js$/.test(rel)) out.push(rel);
    }
  })(ROOT);
  return out.filter((f) => !AUSNAHME_DATEIEN.has(f)).sort();
}
function pruefe(rel, satz) {
  let inhalt = fs.readFileSync(path.join(ROOT, rel), "utf8");
  if (rel === "impressum.html" || rel === "data/texte.json") USTID.forEach((re) => { inhalt = inhalt.replace(re, " "); });
  return Steuer.verstoesse(inhalt, satz).map((v) => `${rel}:${v.zeile} „${v.wort}“`);
}

test(`Steuer-Audit (${Steuer.texte(SATZ).option}): keine Steuerwörter außerhalb von js/steuer.js`, () => {
  const files = dateien();
  assert.ok(files.length > 100, "zu wenige Dateien gefunden: " + files.length);
  assert.ok(files.includes("index.html") && files.includes("js/konfigurator.js") && files.includes("data/preise.json") && files.includes("netlify/functions/anfrage.js"));
  const treffer = [];
  for (const f of files) treffer.push(...pruefe(f, SATZ));
  assert.deepEqual(treffer, [], `${treffer.length} verbotene Stelle(n) – Texte nur über js/steuer.js:\n` + treffer.join("\n"));
});

test("Steuer-Audit: Seiten mit Preisen (Konfigurator) tragen den aktuellen Steuerhinweis", () => {
  if (einst.konfigurator.status === "aus") { assert.ok(!fs.readFileSync(path.join(ROOT, "konfigurator/fenster/index.html"), "utf8").includes("data-steuer="), "Demnächst-Seite ohne Preise"); return; }
  for (const f of ["konfigurator/fenster/index.html", "konfigurator/haustuer/index.html"]) {
    const html = fs.readFileSync(path.join(ROOT, f), "utf8");
    assert.ok(html.includes(`data-steuer="${SATZ}"`), f + ": data-steuer fehlt oder falsch");
    assert.ok(html.includes(Steuer.texte(SATZ).lang), f + ": Steuerhinweis fehlt");
    if (SATZ === 19) assert.ok(html.includes("inkl. 19 % MwSt."), f + ": 19-%-Text fehlt");
  }
});

test("Steuer-Audit: der Test selbst erkennt Verstöße (Selbsttest)", () => {
  assert.ok(Steuer.verstoesse("Preis inkl. 19 % MwSt.", 0).length >= 2);
  assert.equal(Steuer.verstoesse("Preis inkl. 19 % MwSt.", 19).length, 0, "bei 19 % ist der Modultext erlaubt");
  assert.equal(Steuer.verstoesse("Preis zzgl. Versand, brutto", 19).length, 2);
});
