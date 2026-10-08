/* Functions-Bündel: Alles, was die Netlify Functions außerhalb von netlify/functions laden (js/*.js, data/*.json,
   admin/index.html, Schriften), muss in netlify.toml → included_files stehen – sonst startet die Function auf Netlify
   nicht (Runtime.ImportModuleError) und der Admin zeigt auf jeder Seite nur einen Fehler. Außerdem: der Admin zeigt
   bei Ladefehlern nie eine leere Meldung, sondern einen klaren Hinweis mit „Neu laden“. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");

function dateien(dir, out = []) { for (const f of fs.readdirSync(dir)) { const p = path.join(dir, f); if (fs.statSync(p).isDirectory()) dateien(p, out); else if (/\.js$/.test(f)) out.push(p); } return out; }
function includedFiles() { const toml = fs.readFileSync(path.join(ROOT, "netlify.toml"), "utf8"); const m = toml.match(/included_files\s*=\s*\[([^\]]*)\]/); assert.ok(m, "included_files fehlt in netlify.toml"); return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]); }
function passt(muster, datei) { const re = new RegExp("^" + muster.replace(/[.+^${}()|\\]/g, "\\$&").replace(/\*\*\//g, "(?:.*/)?").replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*") + "$"); return re.test(datei); }

test("Alle von den Functions geladenen Repo-Dateien (js/…, data/…, admin/…) stehen in included_files", () => {
  const inc = includedFiles();
  const fehlend = new Set();
  for (const f of dateien(path.join(ROOT, "netlify/functions"))) {
    const q = fs.readFileSync(f, "utf8");
    const verweise = [];
    /* path.join(__dirname, "..", …, "js", "preis.js") */
    for (const m of q.matchAll(/path\.join\(\s*__dirname\s*,((?:\s*"[^"]*"\s*,?)+)\)/g)) { const teile = [...m[1].matchAll(/"([^"]*)"/g)].map((x) => x[1]); const ziel = path.relative(ROOT, path.join(path.dirname(f), ...teile)).replace(/\\/g, "/"); if (!ziel.startsWith("..") && !ziel.startsWith("netlify/functions") && /\.(js|json|html|ttf)$/.test(ziel)) verweise.push(ziel); }
    /* require("../../js/x.js") */
    for (const m of q.matchAll(/require\(\s*"((?:\.\.\/)+[^"]+)"\s*\)/g)) { const ziel = path.relative(ROOT, path.resolve(path.dirname(f), m[1])).replace(/\\/g, "/"); if (!ziel.startsWith("netlify/functions")) verweise.push(/\.\w+$/.test(ziel) ? ziel : ziel + ".js"); }
    for (const z of verweise) if (!inc.some((muster) => passt(muster, z))) fehlend.add(`${z} (aus ${path.relative(ROOT, f).replace(/\\/g, "/")})`);
  }
  assert.deepEqual([...fehlend], [], "in netlify.toml → included_files ergänzen");
  for (const pflicht of ["js/texte-modell.js", "js/preis-validate.js", "js/steuer.js", "js/preis.js", "admin/index.html"]) assert.ok(inc.some((m) => passt(m, pflicht)), pflicht + " fehlt in included_files");
  for (const f of ["js/texte-modell.js", "js/preis-validate.js", "js/steuer.js", "js/preis.js"]) assert.ok(fs.existsSync(path.join(ROOT, f)), f + " existiert");
});
test("Admin: Ladefehler zeigen eine klare Meldung mit „Neu laden“, Hosting-Fehlerantworten werden abgefangen", () => {
  const js = fs.readFileSync(path.join(ROOT, "js/admin.js"), "utf8");
  assert.ok(js.includes("Diese Seite konnte nicht geladen werden.") && js.includes("Bitte Seite neu laden.") && js.includes('data-neuladen') && js.includes(">Neu laden<"), "Fehlerkarte mit Neu-laden-Knopf");
  assert.ok(!/Fehler: \$\{h\(e\.message\)\}/.test(js), "keine nackte „Fehler:“-Ausgabe mehr");
  assert.ok(/errorMessage/.test(js) && /r\.status >= 400/.test(js), "Antworten ohne ok/error (z. B. errorMessage vom Hosting) werden zu einer Meldung");
  const build = fs.readFileSync(path.join(ROOT, "scripts/build.js"), "utf8");
  assert.match(build, /admin-smoke\.js/, "Smoke-Test ist Teil des Builds");
  const smoke = fs.readFileSync(path.join(ROOT, "scripts/admin-smoke.js"), "utf8");
  for (const s of ["uebersicht", "bilder", "texte", "produkte", "bewertungen", "preise", "anfragen", "angebote", "kunden", "einstellungen/firma", "einstellungen/konten", "versionen", "protokoll", "konto"]) assert.ok(smoke.includes(`"${s}"`), "Smoke-Test prüft " + s);
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  assert.ok(pkg.devDependencies["puppeteer-core"] && pkg.devDependencies["@sparticuz/chromium"], "Chrome für den Smoke-Test im Build");
});
