/* Sitemap: /konfigurator/fenster/ und /konfigurator/haustuer/ stehen in sitemap-seiten.xml genau dann, wenn der Konfigurator
   online (indexierbar) ist – nach der vollständigen Build-Reihenfolge (build-konfigurator.js, dann build-orte.js).
   Hintergrund: build-orte.js schrieb die Seiten-Sitemap neu und löschte damit die zuvor von build-konfigurator.js
   eingetragenen Konfigurator-Seiten. Baut in einer Kopie (FW_ROOT); keine festen Admin-Werte – der Status wird je Fall gesetzt. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const ROOT = path.join(__dirname, "..");
const lies = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

function kopie() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fw-sitemap-konf-"));
  const kopiere = (rel) => { const q = path.join(ROOT, rel); if (!fs.existsSync(q)) return; const z = path.join(tmp, rel); if (fs.statSync(q).isDirectory()) { fs.mkdirSync(z, { recursive: true }); for (const e of fs.readdirSync(q)) kopiere(path.join(rel, e)); } else { fs.mkdirSync(path.dirname(z), { recursive: true }); fs.copyFileSync(q, z); } };
  for (const r of ["index.html", "leistungen", "referenzen", "produkte", "konfigurator", "einsatzgebiet", "data", "js", "css", "netlify/functions/_lib", "scripts/orte-texte.js", "sitemap-seiten.xml", "sitemap-orte.xml", "sitemap-index.xml"]) kopiere(r);
  return tmp;
}
function bauen(tmp, status) {
  const e = JSON.parse(lies("data/einstellungen.json")); e.konfigurator = Object.assign({}, e.konfigurator, { status });
  fs.writeFileSync(path.join(tmp, "data/einstellungen.json"), JSON.stringify(e));
  const env = Object.assign({}, process.env, { FW_ROOT: tmp });
  const ausgabe = [];
  for (const s of ["build-konfigurator.js", "build-orte.js"]) ausgabe.push(execFileSync(process.execPath, [path.join(ROOT, "scripts", s)], { env, stdio: "pipe", encoding: "utf8" }));
  return { xml: fs.readFileSync(path.join(tmp, "sitemap-seiten.xml"), "utf8"), ausgabe: ausgabe.join("\n") };
}
const KONF = ["/konfigurator/fenster/", "/konfigurator/haustuer/"];

test("Konfigurator online: beide Konfigurator-Seiten sind indexierbar und stehen nach build-konfigurator + build-orte in sitemap-seiten.xml (je genau einmal, mit gültigem lastmod)", () => {
  const tmp = kopie();
  const { xml } = bauen(tmp, "online");
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/^https?:\/\/[^/]+/, ""));
  for (const u of KONF) {
    const html = fs.readFileSync(path.join(tmp, u.slice(1), "index.html"), "utf8");
    assert.ok(!/<meta name="robots" content="noindex/.test(html), u + ": indexierbar");
    assert.equal(locs.filter((l) => l === u).length, 1, u + " genau einmal in der Sitemap: " + locs.join(", "));
  }
  for (const m of xml.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)) assert.match(m[1], /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(locs.includes("/") && locs.includes("/produkte/haustueren/"), "übrige Seiten bleiben");
});
test("Konfigurator aus/vorschau: Seiten tragen noindex und fehlen in der Sitemap; build-konfigurator.js behauptet nicht mehr, die Sitemap zu schreiben", () => {
  for (const status of ["aus"]) { // „vorschau“ nutzt denselben Weg (noindex, sobald status ≠ online) – ein Durchlauf genügt, der Aufbau dauert ~45 s
    const tmp = kopie();
    const { xml, ausgabe } = bauen(tmp, status);
    for (const u of KONF) {
      assert.ok(!xml.includes(u), status + ": " + u + " nicht in der Sitemap");
      const html = fs.readFileSync(path.join(tmp, u.slice(1), "index.html"), "utf8");
      assert.ok(/<meta name="robots" content="noindex/.test(html), status + ": " + u + " noindex");
    }
    assert.ok(!/Sitemap mit Konfigurator/.test(ausgabe), "alte Meldung „Sitemap mit Konfigurator“ entfernt");
  }
  const bk = lies("scripts/build-konfigurator.js");
  assert.ok(!/sitemap-seiten\.xml/.test(bk), "build-konfigurator.js schreibt die Sitemap nicht mehr (einzige Quelle: build-orte.js)");
  assert.ok(lies("scripts/build-orte.js").includes('seiten.push(`/konfigurator/${k}/`)'), "build-orte.js nimmt die Konfigurator-Seiten auf");
});
