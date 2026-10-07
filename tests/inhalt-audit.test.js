/* Sperrtest Inhalte: kein „Holz“ (die Firma verkauft nichts aus Holz) und keine Platzhalter in veröffentlichten Dateien.
   Durchsucht alle veröffentlichten HTML-, JS-, JSON- und CSS-Dateien (auch die im Build aus dem Admin-Speicher
   eingesetzten Texte) sowie die referenzierten Bilddateinamen. Jeder Treffer ⇒ Build bricht ab ⇒ nichts wird veröffentlicht. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");

const HOLZ = /holz/gi;
const PLATZHALTER = /\[PREIS\]|\[DE COMPLETAT\]|\[MIT KUNDE KL[ÄA]REN\]|\[TODO\]|\bTODO\b|\bTBD\b|Lorem ipsum|\[PLATZHALTER\]|\[EINF[ÜU]GEN\]/g;
const SKIP_DIRS = new Set(["node_modules", ".git", ".netlify", "tests", "scripts", "bilder-original", "bilder-original-2", "firma ferestre", "docs"]);

function dateien() {
  const out = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) { if (SKIP_DIRS.has(e.name) || e.name.startsWith("design-") || e.name.startsWith(".")) continue; walk(path.join(dir, e.name)); continue; }
      const rel = path.relative(ROOT, path.join(dir, e.name)).split(path.sep).join("/");
      if (/\.(html|xml|txt)$/.test(rel)) out.push(rel);
      else if (/^(js|css)\/[^/]+\.(js|css)$/.test(rel)) out.push(rel);
      else if (/^data\/[^/]+\.json$/.test(rel)) out.push(rel);
      else if (/^netlify\/functions\/.*\.js$/.test(rel)) out.push(rel);
      else if (/^assets\/.*\.(webp|png|jpg|svg|mp4|webm|woff2)$/.test(rel)) out.push(rel); // nur der Dateiname wird geprüft
    }
  })(ROOT);
  return out.sort();
}
function treffer(rel, re) {
  if (/^assets\//.test(rel)) { re.lastIndex = 0; return re.test(rel) ? [`${rel} (Dateiname)`] : []; }
  const text = fs.readFileSync(path.join(ROOT, rel), "utf8");
  const out = []; let m; re.lastIndex = 0;
  while ((m = re.exec(text))) { const zeile = text.slice(0, m.index).split("\n").length; out.push(`${rel}:${zeile} „${m[0]}“`); if (out.length > 20) break; }
  return out;
}

test("Inhalte-Audit: kein „Holz“ in veröffentlichten Dateien und Dateinamen", () => {
  const files = dateien();
  assert.ok(files.length > 200, "zu wenige Dateien: " + files.length);
  const t = [];
  for (const f of files) t.push(...treffer(f, HOLZ));
  assert.deepEqual(t, [], `${t.length} Treffer „Holz“:\n` + t.join("\n"));
});
test("Inhalte-Audit: keine Platzhalter ([PREIS], [DE COMPLETAT], TODO, Lorem …) in veröffentlichten Seiten und Daten", () => {
  const files = dateien().filter((f) => !/^assets\//.test(f));
  const t = [];
  for (const f of files) t.push(...treffer(f, PLATZHALTER));
  assert.deepEqual(t, [], `${t.length} Platzhalter:\n` + t.join("\n"));
});
test("Inhalte-Audit: der Test selbst erkennt Treffer (Selbsttest)", () => {
  HOLZ.lastIndex = 0; assert.ok(HOLZ.test("Fenster in Holzoptik")); HOLZ.lastIndex = 0; assert.ok(!HOLZ.test("Dekor Golden Oak in Eichenoptik"));
  PLATZHALTER.lastIndex = 0; assert.ok(PLATZHALTER.test("ab <strong>[PREIS] €</strong>")); PLATZHALTER.lastIndex = 0; assert.ok(!PLATZHALTER.test("ab <strong>1.200 €</strong>"));
});
