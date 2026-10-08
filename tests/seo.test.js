/* Suchmaschinen-Vorbereitung (Search Console): Sitemap nur mit indexierbaren Seiten, robots mit Sitemap, canonical und
   og:url auf der finalen Domain und zur Datei passend, keine doppelten canonicals/Titel, gültige strukturierte Daten,
   optionale Google-Bestätigung per Umgebungsvariable, Domain-Weiterleitungen, Cookie-Richtlinie verlinkt. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const SITE = "https://fenster-weissenburger.de";
function seiten() {
  const out = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (!/^\./.test(e.name) && !/^design-/.test(e.name) && !/^(node_modules|admin|netlify|firma ferestre|tests|scripts|docs|assets|data|css|js|bilder-original-2)$/.test(e.name)) walk(p); } else if (e.name.endsWith(".html")) out.push(p); } };
  walk(ROOT);
  return out.map((f) => ({ f, rel: path.relative(ROOT, f).replace(/\\/g, "/"), html: fs.readFileSync(f, "utf8") })).filter((s) => !/^(404|danke|wartung)\.html$/.test(s.rel) && !/^firma ferestre/.test(s.rel));
}
const noindex = (h) => /name="robots" content="noindex/.test(h);

test("canonical und og:url zeigen auf die finale Domain und die eigene Adresse; keine doppelten canonicals", () => {
  const canon = new Map();
  for (const s of seiten()) {
    const erwartet = SITE + "/" + s.rel.replace(/index\.html$/, "");
    const c = (s.html.match(/<link rel="canonical" href="([^"]+)">/) || [])[1];
    const og = (s.html.match(/<meta property="og:url" content="([^"]+)">/) || [])[1];
    if (noindex(s.html)) { if (c) assert.ok(c.startsWith(SITE + "/"), "canonical (noindex): " + s.rel); continue; } // z. B. konfigurator/…/demnaechst.html zeigt auf die eigentliche Seite
    assert.equal(c, erwartet, "canonical: " + s.rel);
    assert.equal(og, erwartet, "og:url: " + s.rel);
    assert.ok(!canon.has(c), `canonical doppelt: ${s.rel} und ${canon.get(c)}`); canon.set(c, s.rel);
    assert.ok(!/netlify\.app/.test(s.html.replace(/<!--[\s\S]*?-->/g, "")), "Netlify-Adresse in Seite: " + s.rel);
  }
});
test("Indexierbare Seiten: eindeutige Titel und Beschreibungen, strukturierte Daten gültig (LocalBusiness, BreadcrumbList auf Unterseiten)", () => {
  const titel = new Map(), desc = new Map();
  for (const s of seiten()) {
    for (const m of s.html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) assert.doesNotThrow(() => JSON.parse(m[1]), "JSON-LD ungültig: " + s.rel);
    if (noindex(s.html)) continue;
    const t = (s.html.match(/<title>([^<]*)<\/title>/) || [])[1] || "", d = (s.html.match(/<meta name="description" content="([^"]*)">/) || [])[1] || "";
    assert.ok(t.length >= 10 && t.length <= 130, `Titel-Länge ${t.length}: ${s.rel}`);
    assert.ok(d.length >= 30 && d.length <= 320, `Beschreibungs-Länge ${d.length}: ${s.rel}`);
    assert.ok(!titel.has(t), `Titel doppelt: ${s.rel} = ${titel.get(t)}`); titel.set(t, s.rel);
    assert.ok(!desc.has(d), `Beschreibung doppelt: ${s.rel} = ${desc.get(d)}`); desc.set(d, s.rel);
    assert.match(s.html, /"@type":\s*"LocalBusiness"/, "LocalBusiness fehlt: " + s.rel);
    if (s.rel !== "index.html") assert.match(s.html, /"@type":\s*"BreadcrumbList"/, "BreadcrumbList fehlt: " + s.rel);
  }
});
test("Sitemaps: nur indexierbare Seiten, jede indexierbare Seite enthalten, lastmod gültig; robots verweist auf den Sitemap-Index", () => {
  const idx = fs.readFileSync(path.join(ROOT, "sitemap-index.xml"), "utf8");
  assert.match(idx, /<sitemapindex/); assert.match(idx, new RegExp(SITE + "/sitemap-seiten.xml")); assert.match(idx, new RegExp(SITE + "/sitemap-orte.xml"));
  const xml = fs.readFileSync(path.join(ROOT, "sitemap-seiten.xml"), "utf8") + fs.readFileSync(path.join(ROOT, "sitemap-orte.xml"), "utf8");
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.ok(locs.length > 50);
  for (const m of xml.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)) assert.match(m[1], /^\d{4}-\d{2}-\d{2}$/, "lastmod: " + m[1]);
  const alle = seiten();
  for (const l of locs) {
    assert.ok(l.startsWith(SITE + "/"), l);
    const rel = l.slice(SITE.length + 1) + (l.endsWith("/") ? "index.html" : "");
    const s = alle.find((x) => x.rel === rel);
    assert.ok(s, "Sitemap-Seite fehlt: " + rel);
    assert.ok(!noindex(s.html), "noindex-Seite in Sitemap: " + rel);
    assert.ok(!/\/admin|\.netlify|\/konfigurator\//.test(l) || /konfigurator/.test(l), l);
  }
  for (const s of alle) if (!noindex(s.html)) assert.ok(locs.includes(SITE + "/" + s.rel.replace(/index\.html$/, "")), "indexierbare Seite nicht in Sitemap: " + s.rel); // auch /konfigurator/… sobald online
  const robots = fs.readFileSync(path.join(ROOT, "robots.txt"), "utf8");
  assert.match(robots, new RegExp("Sitemap: " + SITE + "/sitemap-index.xml")); assert.match(robots, /Disallow: \/admin\//);
});
test("Google-Bestätigung nur mit GOOGLE_SITE_VERIFICATION; Domain-Weiterleitungen (www in netlify.toml, Netlify-Adresse nur mit DOMAIN_LIVE)", () => {
  const build = require("../scripts/build.js");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fw-seo-")); fs.mkdirSync(path.join(dir, "unter"));
  const kopf = '<!doctype html>\n<html lang="de">\n<head>\n  <meta charset="utf-8">\n  <title>t</title>\n</head><body></body></html>';
  fs.writeFileSync(path.join(dir, "index.html"), kopf); fs.writeFileSync(path.join(dir, "unter", "index.html"), kopf);
  assert.equal(build.googleVerifikationEinsetzen(dir, ""), 0);
  assert.equal(build.googleVerifikationEinsetzen(dir, "abc_DEF-123"), 2);
  assert.match(fs.readFileSync(path.join(dir, "unter", "index.html"), "utf8"), /<meta charset="utf-8">\n  <meta name="google-site-verification" content="abc_DEF-123">/);
  assert.equal(build.googleVerifikationEinsetzen(dir, "abc_DEF-123"), 0, "idempotent");
  assert.equal(build.googleVerifikationEinsetzen(dir, ""), 2, "entfernt ohne Variable");
  assert.ok(!/google-site-verification/.test(fs.readFileSync(path.join(dir, "index.html"), "utf8")));
  fs.rmSync(dir, { recursive: true, force: true });
  for (const s of seiten()) assert.ok(!/google-site-verification/.test(s.html), "Bestätigung darf nicht im Repo stehen: " + s.rel);
  const toml = fs.readFileSync(path.join(ROOT, "netlify.toml"), "utf8");
  assert.match(toml, /from = "https:\/\/www\.fenster-weissenburger\.de\/\*"\s+to = "https:\/\/fenster-weissenburger\.de\/:splat"\s+status = 301\s+force = true/);
  const alt = process.env.DOMAIN_LIVE;
  delete process.env.DOMAIN_LIVE; assert.equal(build.domainRedirects(), "");
  process.env.DOMAIN_LIVE = "1"; assert.match(build.domainRedirects(), /https:\/\/fensterweissenburgerdaniel\.netlify\.app\/\*\s+https:\/\/fenster-weissenburger\.de\/:splat\s+301!/);
  if (alt === undefined) delete process.env.DOMAIN_LIVE; else process.env.DOMAIN_LIVE = alt;
});
test("Cookie-Richtlinie: eigene Seite (noindex), im Fußbereich jeder Seite verlinkt, Datenschutzerklärung nennt Cookies/Speicher und Search Console", () => {
  const c = fs.readFileSync(path.join(ROOT, "cookies.html"), "utf8");
  assert.match(c, /<title>Cookie-Richtlinie/); assert.ok(noindex(c)); assert.match(c, /fw_admin/); assert.match(c, /fw-banner-zu/); assert.match(c, /fw-transition/); assert.match(c, /§ 25 Abs\. 2 Nr\. 2 TDDDG/);
  for (const s of seiten()) { if (/^konfigurator\//.test(s.rel)) continue; assert.match(s.html, /<footer class="legal[^"]*">[\s\S]*cookies\.html[\s\S]*<\/footer>/, "Cookie-Richtlinie fehlt im Fußbereich: " + s.rel); assert.ok(!/<footer[\s\S]*nav__drop[\s\S]*<\/footer>/.test(s.html), "Aufklappmenü im Fußbereich: " + s.rel); }
  const d = fs.readFileSync(path.join(ROOT, "datenschutz.html"), "utf8");
  assert.match(d, /Google Search Console/); assert.match(d, /sessionStorage/); assert.match(d, /fw_admin/); assert.match(d, /cookies\.html/);
  const js = fs.readFileSync(path.join(ROOT, "js/main.js"), "utf8") + fs.readFileSync(path.join(ROOT, "js/uebergang.js"), "utf8") + fs.readFileSync(path.join(ROOT, "js/konfigurator.js"), "utf8");
  assert.ok(!/document\.cookie|localStorage/.test(js), "öffentliche Skripte setzen keine Cookies und nutzen keinen dauerhaften Speicher");
});
