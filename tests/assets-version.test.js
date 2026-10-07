/* Tests: Cache-Busting per Inhalts-Hash (scripts/assets-version.js) */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const av = require("../scripts/assets-version");

function abbild() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fw-assets-"));
  fs.mkdirSync(path.join(tmp, "css")); fs.mkdirSync(path.join(tmp, "js")); fs.mkdirSync(path.join(tmp, "produkte", "x"), { recursive: true }); fs.mkdirSync(path.join(tmp, "node_modules", "y"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "css/style.css"), ":root{--accent:#0B5ED7}");
  fs.writeFileSync(path.join(tmp, "js/main.js"), "console.log(1)");
  fs.writeFileSync(path.join(tmp, "index.html"), '<link rel="stylesheet" href="css/style.css?v=5"><script src="js/main.js?v=3" defer></script><a href="/css/style.css?v=5">x</a>');
  fs.writeFileSync(path.join(tmp, "produkte/x/index.html"), '<link href="/css/style.css?v=5"><script src="/js/main.js?v=3"></script><script src="/js/vendor/foo.js?v=1"></script>');
  fs.writeFileSync(path.join(tmp, "node_modules/y/index.html"), '<link href="/css/style.css?v=5">');
  return tmp;
}

test("Referenzen bekommen den Inhalts-Hash; Vendor und node_modules bleiben unberührt; idempotent", () => {
  const tmp = abbild();
  const r = av.versioniere(tmp);
  const h = av.hashVon(path.join(tmp, "css/style.css")), hj = av.hashVon(path.join(tmp, "js/main.js"));
  assert.equal(h.length, 8);
  assert.equal(r.dateien, 2); assert.equal(r.stellen, 5);
  const idx = fs.readFileSync(path.join(tmp, "index.html"), "utf8");
  assert.ok(idx.includes(`href="css/style.css?v=${h}"`)); assert.ok(idx.includes(`src="js/main.js?v=${hj}"`)); assert.ok(idx.includes(`href="/css/style.css?v=${h}"`));
  const sub = fs.readFileSync(path.join(tmp, "produkte/x/index.html"), "utf8");
  assert.ok(sub.includes(`/css/style.css?v=${h}`)); assert.ok(sub.includes("/js/vendor/foo.js?v=1"), "Vendor unverändert");
  assert.ok(fs.readFileSync(path.join(tmp, "node_modules/y/index.html"), "utf8").includes("?v=5"), "node_modules unverändert");
  const r2 = av.versioniere(tmp);
  assert.equal(r2.stellen, 0, "zweiter Lauf ändert nichts");
});
test("Geänderter Dateiinhalt ⇒ neue Version in allen Seiten (Palettenwechsel kann nicht mehr im Cache hängen bleiben)", () => {
  const tmp = abbild();
  av.versioniere(tmp);
  const vorher = av.hashVon(path.join(tmp, "css/style.css"));
  fs.writeFileSync(path.join(tmp, "css/style.css"), ":root{--accent:#FFA001}");
  const r = av.versioniere(tmp);
  const nachher = av.hashVon(path.join(tmp, "css/style.css"));
  assert.notEqual(vorher, nachher);
  assert.equal(r.stellen, 3, "nur die CSS-Referenzen wechseln");
  assert.ok(fs.readFileSync(path.join(tmp, "index.html"), "utf8").includes(`style.css?v=${nachher}`));
});
test("Repository: alle HTML-Referenzen tragen bereits den aktuellen Hash (--pruefen ohne Änderungen)", () => {
  const r = av.versioniere(path.join(__dirname, ".."), { pruefen: true });
  assert.equal(r.stellen, 0, `${r.stellen} veraltete Referenzen – bitte node scripts/assets-version.js ausführen`);
});
