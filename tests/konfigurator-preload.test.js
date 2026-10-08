/* Test: Die Online-Konfigurator-Seiten zeigen das Vorschaufoto der Startkonfiguration bereits im HTML (LCP auf dem
   Telefon, kein Nachladen) – genau das Bild, das js/konfigurator.js für seinen Startzustand wählt (gleiche Bildauswahl,
   größte Stufe, data-name für das Skript). Platzhalterseiten („Demnächst“) enthalten kein Foto. Keine festen Admin-Datenwerte: Startzustand und Bildnamen kommen aus den Quellen. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const lies = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

function startzustaende() {
  /* aus js/konfigurator.js: var state = produkt === "fenster" ? {…} : {…}; */
  const js = lies("js/konfigurator.js");
  const m = js.match(/var state = produkt === "fenster"\s*\?\s*(\{[^\n]*\})\s*:\s*(\{[^\n]*\});/);
  assert.ok(m, "Startzustand in js/konfigurator.js gefunden");
  return { fenster: new Function("return " + m[1])(), haustuer: new Function("return " + m[2])() };
}
function erwartet() {
  const FWB = require("../js/konfigurator-bilder.js");
  const B = FWB.Bilder(JSON.parse(lies("data/konfigurator-bilder.json")), JSON.parse(lies("data/preise.json")));
  const st = startzustaende(), out = {};
  for (const k of ["fenster", "haustuer"]) { const n = B.vorschau(k, st[k]); const g = ((B.info(n) || {}).groessen || [900]); out[k] = n ? `/assets/konfigurator/${n}-${g[g.length - 1]}.webp` : null; }
  return out;
}
test("Generator (online): Vorschaufoto der Startkonfiguration steht im HTML – identisch mit der Bildwahl des Skripts; Platzhalterseite ohne Foto", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fw-konf-preload-"));
  const kopiere = (rel) => { const q = path.join(ROOT, rel); if (!fs.existsSync(q)) return; const z = path.join(tmp, rel); if (fs.statSync(q).isDirectory()) { fs.mkdirSync(z, { recursive: true }); for (const e of fs.readdirSync(q)) kopiere(path.join(rel, e)); } else { fs.mkdirSync(path.dirname(z), { recursive: true }); fs.copyFileSync(q, z); } };
  for (const r of ["index.html", "leistungen", "referenzen", "produkte", "konfigurator", "data", "js", "css", "netlify/functions/_lib", "sitemap-seiten.xml"]) kopiere(r);
  const e = JSON.parse(lies("data/einstellungen.json")); e.konfigurator = Object.assign({}, e.konfigurator, { status: "online" });
  fs.writeFileSync(path.join(tmp, "data/einstellungen.json"), JSON.stringify(e));
  execFileSync(process.execPath, [path.join(ROOT, "scripts/build-konfigurator.js")], { env: Object.assign({}, process.env, { FW_ROOT: tmp }), stdio: "pipe" });
  const soll = erwartet();
  for (const k of ["fenster", "haustuer"]) {
    const html = fs.readFileSync(path.join(tmp, "konfigurator", k, "index.html"), "utf8");
    const img = (html.match(/<img class="preview__foto"[^>]*>/) || [])[0];
    assert.ok(img, k + ": Vorschaubild vorhanden");
    if (soll[k]) {
      assert.ok(img.includes(`src="${soll[k]}"`), k + ": " + img);
      assert.ok(img.includes(`data-name="${path.basename(soll[k]).replace(/-\d+\.webp$/, "")}"`), k + ": data-name für das Skript");
      assert.ok(/fetchpriority="high"/.test(img) && !/hidden/.test(img) && /alt="[^"]+Abbildung beispielhaft"/.test(img), k + ": sichtbar, priorisiert, Alternativtext");
      assert.ok(/<div class="preview hat-foto">/.test(html) && html.includes('<p class="preview__note">Abbildung beispielhaft</p>'), k + ": Kasten im Foto-Zustand");
    } else assert.ok(/hidden/.test(img));
    assert.ok(!/rel="preload" as="image"/.test(html), k + ": kein zusätzlicher Preload");
    /* Der AVIF-Schritt darf das skriptgesteuerte Vorschaubild nicht in <picture> hüllen (eine <source> würde spätere src-Wechsel überstimmen) */
    const pic = require("../scripts/bilder-picture").verarbeite(ROOT, html, path.join(ROOT, "konfigurator", k, "index.html"));
    assert.ok(!/<picture>(<source[^>]*>)*<img class="preview__foto"/.test(pic.html), k + ": Vorschaubild bleibt ohne <picture>");
    const soon = fs.readFileSync(path.join(tmp, "konfigurator", k, "demnaechst.html"), "utf8");
    assert.ok(!/preview__foto/.test(soon), k + ": Platzhalterseite ohne Vorschaufoto");
  }
});
