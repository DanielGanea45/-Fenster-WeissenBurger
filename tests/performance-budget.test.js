/* Performance-Budget: Obergrenzen je veröffentlichter Seite (JS, CSS, Bilder, HTML) und Regeln für das Laden
   (Bilder lazy mit festen Maßen, höchstens ein fetchpriority="high", keine Videos mit preload="auto", keine
   ungehashten CSS/JS-Referenzen, Admin-Startbündel schlank, Module nachgeladen). Im Netlify-Build laufen die Tests nach
   dem Minimieren – die Budgets gelten aber schon für die unminimierten Quellen, damit sie auch lokal greifen. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");

/* bilder = sofort geladene Bilder (ohne loading="lazy") + Poster; bilderGesamt = kleinste Variante aller Bilder der Seite */
/* js: Quelltextgröße vor der Minimierung. 125 kB = Konfigurator-Seiten (Rechner, Bildwahl, Konfigurator, Hauptskript, Übergang)
   plus der KI-Assistent, der auf jeder Seite liegt (≈16 kB Quelle, ≈6 kB minimiert und komprimiert; sein Stylesheet lädt er nur bei Bedarf). */
const BUDGET = { js: 125 * 1024, css: 80 * 1024, bilder: 450 * 1024, bilderGesamt: 1024 * 1024, html: 120 * 1024 };
const SEITEN = ["index.html", "produkte/index.html", "leistungen/index.html", "referenzen/index.html", "impressum.html", "datenschutz.html", "konfigurator/fenster/index.html", "konfigurator/haustuer/index.html"]
  .concat(fs.readdirSync(path.join(ROOT, "produkte"), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => `produkte/${e.name}/index.html`))
  .concat(fs.readdirSync(path.join(ROOT, "einsatzgebiet"), { withFileTypes: true }).filter((e) => e.isDirectory()).slice(0, 3).map((e) => `einsatzgebiet/${e.name}/index.html`))
  .filter((f) => fs.existsSync(path.join(ROOT, f)));

const groesse = (f) => (fs.existsSync(f) ? fs.statSync(f).size : 0);
function aufloesen(seite, url) { const u = url.split(/[?#]/)[0]; if (/^(https?:|data:)/.test(u)) return null; return u.startsWith("/") ? path.join(ROOT, u) : path.join(path.dirname(path.join(ROOT, seite)), u); }
function analyse(seite) {
  const html = fs.readFileSync(path.join(ROOT, seite), "utf8");
  const js = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].filter((m) => !/type="fw\/modul"/.test(m[0])).map((m) => aufloesen(seite, m[1])).filter(Boolean);
  const css = [...html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)].map((m) => aufloesen(seite, m[1])).filter(Boolean);
  const imgs = [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
  // kleinste Bildvariante je <img> (srcset-Kandidat mit der kleinsten Breite, sonst src) + Poster
  const eager = imgs.filter((tag) => !/\bloading="lazy"/.test(tag));
  const kleinste = (tag) => { const ss = (tag.match(/\bsrcset="([^"]*)"/) || [])[1]; const src = (tag.match(/\bsrc="([^"]*)"/) || [])[1]; if (ss) { const k = ss.split(",").map((t) => t.trim().split(/\s+/)).sort((a, b) => parseInt(a[1]) - parseInt(b[1])); return aufloesen(seite, k[0][0]); } return src ? aufloesen(seite, src) : null; };
  const bildDateien = imgs.map(kleinste).filter(Boolean), eagerDateien = eager.map(kleinste).filter(Boolean);
  const poster = [...html.matchAll(/\bposter="([^"]+)"/g)].map((m) => aufloesen(seite, m[1])).filter(Boolean);
  return { html, bytes: { js: js.reduce((a, f) => a + groesse(f), 0), css: css.reduce((a, f) => a + groesse(f), 0), bilder: eagerDateien.concat(poster).reduce((a, f) => a + groesse(f), 0), bilderGesamt: bildDateien.concat(poster).reduce((a, f) => a + groesse(f), 0), html: Buffer.byteLength(html) }, imgs, js, css };
}

test("Budget: JS, CSS, Bilder und HTML je Seite unter den Grenzen", () => {
  const verstoesse = [];
  for (const s of SEITEN) { const a = analyse(s); for (const k of Object.keys(BUDGET)) if (a.bytes[k] > BUDGET[k]) verstoesse.push(`${s}: ${k} ${Math.round(a.bytes[k] / 1024)} kB > ${Math.round(BUDGET[k] / 1024)} kB`); }
  assert.deepEqual(verstoesse, [], verstoesse.join("\n"));
  assert.ok(SEITEN.length >= 10, "genug Seiten geprüft: " + SEITEN.length);
});
test("Laderegeln: Bilder mit width/height und lazy (außer LCP-Bild), höchstens ein fetchpriority=high, Videos nie preload=auto, AVIF-fähige Bilder haben eine .avif-Datei", () => {
  const fehler = [];
  for (const s of SEITEN) {
    const a = analyse(s);
    a.imgs.forEach((tag, i) => {
      if (/\bsrc=""/.test(tag)) return; // Lightbox-Platzhalter ohne Quelle
      if (!/\bwidth="\d+"/.test(tag) || !/\bheight="\d+"/.test(tag)) fehler.push(`${s}: <img> ${i + 1} ohne width/height`);
      if (i >= 2 && !/\bloading="lazy"/.test(tag) && !/\bfetchpriority="high"/.test(tag)) fehler.push(`${s}: <img> ${i + 1} unterhalb der ersten Ansicht ohne loading="lazy"`);
    });
    if ((a.html.match(/fetchpriority="high"/g) || []).length > 1) fehler.push(`${s}: mehr als ein fetchpriority="high"`);
    if (/<video\b[^>]*preload="auto"/.test(a.html)) fehler.push(`${s}: <video preload="auto"> lädt vor dem LCP`);
    if (/<video\b[^>]*\sautoplay\b/.test(a.html)) fehler.push(`${s}: <video autoplay> – Start übernimmt js/main.js nach dem Laden`);
    for (const m of a.html.matchAll(/(?:href|src)="([^"]*(?:css|js)\/[A-Za-z0-9_.-]+\.(?:css|js))"/g)) fehler.push(`${s}: ${m[1]} ohne ?v=-Hash (Cache ist ein Jahr unveränderlich)`);
  }
  // Jede WebP-Datei der Startseiten-Bilder hat eine AVIF-Variante (Build hüllt sie in <picture>)
  for (const d of ["assets/img", "assets/video"]) for (const f of fs.readdirSync(path.join(ROOT, d))) if (/\.webp$/.test(f) && !fs.existsSync(path.join(ROOT, d, f.replace(/\.webp$/, ".avif")))) fehler.push(`${d}/${f}: keine .avif (node scripts/bilder-avif.js)`);
  assert.deepEqual(fehler, [], fehler.join("\n"));
});
test("Videos: Telefon-Variante vorhanden und kleiner; Hero-Videos tragen data-klein", () => {
  const dir = path.join(ROOT, "assets", "video");
  for (const f of fs.readdirSync(dir)) { const m = /^([a-z-]+)\.mp4$/.exec(f); if (!m || /-klein$/.test(m[1])) continue; const klein = path.join(dir, m[1] + "-klein.mp4"); assert.ok(fs.existsSync(klein), `fehlt: ${m[1]}-klein.mp4 (node scripts/video-klein.js)`); assert.ok(groesse(klein) < groesse(path.join(dir, f)), `${m[1]}-klein.mp4 ist nicht kleiner`); }
  for (const s of ["index.html", "leistungen/index.html"]) { const html = fs.readFileSync(path.join(ROOT, s), "utf8"); for (const v of html.match(/<video\b[^>]*>/g) || []) { assert.match(v, /data-klein="[^"]+-klein\.mp4"/, `${s}: Video ohne data-klein`); assert.match(v, /preload="none"/, `${s}: Video ohne preload="none"`); } }
});
test("Build-Schritte: <picture> mit AVIF-Quelle wird korrekt und idempotent eingesetzt; Minimierung erhält die Logik", async () => {
  const picture = require("../scripts/bilder-picture");
  const html = '<p><img src="assets/img/haustuer-464.webp" srcset="assets/img/haustuer-464.webp 464w, assets/img/haustuer-928.webp 928w" sizes="50vw" width="928" height="1152" alt="" loading="lazy"></p><img src="/assets/gibt-es-nicht.webp" alt="">';
  const r = picture.verarbeite(ROOT, html, path.join(ROOT, "index.html"));
  assert.equal(r.n, 1);
  assert.match(r.html, /<picture><source type="image\/avif" srcset="assets\/img\/haustuer-464\.avif 464w, assets\/img\/haustuer-928\.avif 928w" sizes="50vw"><img src="assets\/img\/haustuer-464\.webp"/);
  assert.ok(r.html.includes('<img src="/assets/gibt-es-nicht.webp" alt="">') && !/gibt-es-nicht\.avif/.test(r.html), "ohne .avif bleibt das <img> unverändert");
  const r2 = picture.verarbeite(ROOT, r.html, path.join(ROOT, "index.html")); assert.equal(r2.n, 0, "idempotent"); assert.equal(r2.html, r.html);
  const esbuild = require("esbuild");
  const quelle = fs.readFileSync(path.join(ROOT, "js/steuer.js"), "utf8");
  const min = (await esbuild.transform(quelle, { loader: "js", minify: true, charset: "utf8", target: ["es2017"] })).code;
  if (!/minimiert im Build/.test(quelle)) assert.ok(min.length < quelle.length * 0.7, "deutlich kleiner"); // im Netlify-Build ist die Quelle bereits minimiert
  else assert.ok(min.length <= quelle.length);
  const m = { exports: {} }; new Function("module", min)(m); const Steuer = m.exports;
  assert.equal(Steuer.texte(0).kurz, require("../js/steuer.js").texte(0).kurz, "minimiertes Modul liefert dieselben Texte");
});
test("Admin: Startbündel schlank, große Bereiche als nachladbare Module, Zwischenspeicher nur in Functions", () => {
  const html = fs.readFileSync(path.join(ROOT, "admin/index.html"), "utf8");
  const eager = [...html.matchAll(/<script(?![^>]*type="fw\/modul")[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1].split("?")[0]);
  const lazy = [...html.matchAll(/<script[^>]*type="fw\/modul"[^>]*data-modul="([^"]+)"[^>]*src="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(lazy.sort(), ["assistent", "belege", "einstellungen", "produkte", "texte"]);
  const bytes = eager.reduce((a, f) => a + groesse(path.join(ROOT, f)), 0);
  assert.ok(bytes <= 170 * 1024, `Admin-Startbündel ${Math.round(bytes / 1024)} kB > 170 kB`);
  assert.ok(!eager.some((f) => /admin-(belege|einstellungen|produkte)/.test(f)), "Module nicht eager");
  const daten = fs.readFileSync(path.join(ROOT, "netlify/functions/_lib/daten.js"), "utf8");
  assert.match(daten, /AWS_LAMBDA_FUNCTION_NAME/, "Cache nur in Functions");
  const toml = fs.readFileSync(path.join(ROOT, "netlify.toml"), "utf8");
  assert.match(toml, /for = "\/js\/\*"[\s\S]{0,120}immutable/); assert.match(toml, /for = "\/css\/\*"[\s\S]{0,120}immutable/); assert.match(toml, /for = "\/data\/\*"[\s\S]{0,120}must-revalidate/);
});
