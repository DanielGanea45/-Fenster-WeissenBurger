/* Fußzeile der Startseite: genau ein diskreter Login-Link (/admin/, rel=nofollow, Schloss-Symbol) – und sonst nirgends:
   keine andere öffentliche Seite, nicht in wartung.html, nicht in Sitemaps, JSON-LD oder Assistent-Wissen, nicht im Textregister. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const ROOT = path.join(__dirname, "..");
const lies = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

test("index.html: genau ein Login-Link im Footer (Rechtslinks), /admin/, rel=nofollow, Inline-SVG ohne Inline-Stil, kein data-text", () => {
  const h = lies("index.html");
  const footer = (h.match(/<footer class="legal">[\s\S]*?<\/footer>/) || [])[0]; assert.ok(footer, "Footer vorhanden");
  const links = [...h.matchAll(/<a\b[^>]*href="\/admin\/"[^>]*>/g)];
  assert.equal(links.length, 1, "genau ein Link auf /admin/ in index.html");
  const nav = (footer.match(/<nav class="legal__recht"[^>]*>[\s\S]*?<\/nav>/) || [])[0]; assert.ok(nav && nav.includes('href="/admin/"'), "Login-Link steht im Rechtslinks-Block des Footers");
  const a = (nav.match(/<a class="legal__login"[^>]*>[\s\S]*?<\/a>/) || [])[0]; assert.ok(a, "Link mit Klasse legal__login");
  assert.match(a, /rel="nofollow"/); assert.match(a, /<svg[^>]*aria-hidden="true"/); assert.ok(!/style=/.test(a) && !/data-text/.test(a) && /Login<\/a>$/.test(a), a);
  assert.ok(lies("css/style.css").includes(".legal__login svg {"), "Stil für das Schloss-Symbol");
});
test("Keine andere öffentliche Seite (auch nicht wartung.html, Generatoren, Danke-/Fehler-/404-Seite) verlinkt /admin/; nicht in Sitemaps, JSON-LD, Assistent-Wissen oder Textregister", () => {
  const dateien = execSync("git ls-files", { cwd: ROOT, encoding: "utf8" }).split(/\r?\n/).filter((f) => /\.html$/.test(f) && !/^(admin|docs)\//.test(f) && f !== "index.html");
  assert.ok(dateien.length > 150, "Seiten gefunden: " + dateien.length);
  for (const f of dateien) assert.ok(!/href="\/?admin\/?"/.test(lies(f)) && !/legal__login/.test(lies(f)), f + ": kein Login-Link");
  for (const g of ["scripts/build-orte.js", "scripts/build-produkte.js", "scripts/build-konfigurator.js", "netlify/functions/_lib/firma.js"]) assert.ok(!/legal__login|href="\/admin\/"/.test(lies(g)), g + ": Generator unverändert");
  for (const s of ["sitemap-seiten.xml", "sitemap-orte.xml", "sitemap-index.xml"]) assert.ok(!/admin/.test(lies(s)), s);
  for (const m of lies("index.html").matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) assert.ok(!/admin/i.test(m[1]), "JSON-LD ohne Admin");
  assert.ok(!/\/admin/.test(lies("data/assistent-wissen.json")), "Assistent-Wissen ohne Admin");
  assert.ok(!/"Login"|>Login</.test(lies("data/texte.json")), "Login nicht im Textregister (nicht in Admin → Texte editierbar)");
  assert.match(lies("robots.txt"), /Disallow: \/admin\//);
});
