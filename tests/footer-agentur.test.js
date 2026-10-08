/* Fußzeile: Agentur-Hinweis „Website erstellt von CristianWeb“ (Logo + Text = ein Link, neuer Tab) auf allen öffentlichen Seiten
   außer Ortsseiten, wartung.html und Admin; Block aus einer Quelle (firma.agenturBlock), nicht im Textregister/Wissen/JSON-LD;
   Logo lokal (WebP + AVIF, 2× Anzeigegröße, width/height, lazy). */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const http = require("http");
const { execSync } = require("child_process");
const ROOT = path.join(__dirname, "..");
const lies = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const Firma = require("../netlify/functions/_lib/firma");
const LINK = /<a href="https:\/\/cristianweb\.de" target="_blank" rel="noopener">/g;

const ZIEL = ["index.html", "leistungen/index.html", "referenzen/index.html", "produkte/index.html", "einsatzgebiet/index.html", "impressum.html", "datenschutz.html", "cookies.html", "danke.html", "anfrage-fehler.html", "404.html"];
function alleHtml() { return execSync("git ls-files", { cwd: ROOT, encoding: "utf8" }).split(/\r?\n/).filter((f) => /\.html$/.test(f) && !/^docs\//.test(f)); }

test("Zielseiten (Start, Leistungen, Referenzen, Produkte + Produktseiten, Konfigurator, Einsatzgebiet-Übersicht, Impressum, Datenschutz, Cookies, Danke, Fehler, 404): genau ein Agentur-Link mit Logo, neuer Tab, rel=noopener", () => {
  const produkt = alleHtml().filter((f) => /^produkte\/[^/]+\/index\.html$/.test(f));
  const konf = alleHtml().filter((f) => /^konfigurator\/[^/]+\/index\.html$/.test(f));
  assert.ok(produkt.length >= 4 && konf.length === 2, "Produktseiten " + produkt.length + ", Konfigurator " + konf.length);
  for (const f of ZIEL.concat(produkt, konf)) {
    const h = lies(f);
    assert.equal((h.match(LINK) || []).length, 1, f + ": genau ein Link auf https://cristianweb.de");
    const footer = (h.match(/<footer class="legal[^"]*">[\s\S]*?<\/footer>/) || [])[0]; assert.ok(footer && /cristianweb\.de/.test(footer), f + ": Link steht im Footer");
    const block = (footer.match(/<!--agentur-->([\s\S]*?)<!--\/agentur-->/) || [])[1]; assert.ok(block, f + ": Marker-Block");
    assert.equal(block, Firma.agenturHtml(), f + ": Block identisch mit der einen Quelle");
    assert.match(block, /<img src="\/assets\/logo\/cristianweb\.webp" width="40" height="40" alt="CristianWeb" loading="lazy" decoding="async">Website erstellt von CristianWeb<\/a>/, f + ": Logo + Text im Link");
    assert.ok(!/style=|data-text|cristianweb\.ro/.test(block), f + ": kein Inline-Stil, kein data-text, keine fremde Domain");
    assert.equal((h.match(/cristianweb/gi) || []).length, (block.match(/cristianweb/gi) || []).length, f + ": CristianWeb nur im Footer-Block (nicht in JSON-LD/Text)");
  }
});
test("Nicht auf Ortsseiten (alle /einsatzgebiet/<ort>/ und sitemap-orte.xml), nicht in wartung.html, nicht im Admin; nicht im Textregister oder Assistent-Wissen; Generatoren nutzen die eine Quelle", () => {
  const orte = alleHtml().filter((f) => /^einsatzgebiet\/[^/]+\/index\.html$/.test(f));
  assert.ok(orte.length >= 100, "Ortsseiten: " + orte.length);
  for (const f of orte) assert.ok(!/cristianweb|legal__agentur|<!--agentur-->/i.test(lies(f)), f + ": kein Agentur-Block");
  for (const loc of [...lies("sitemap-orte.xml").matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])) { const rel = loc.replace(/^https?:\/\/[^/]+\//, "") + "index.html"; assert.ok(fs.existsSync(path.join(ROOT, rel)) && !/cristianweb/i.test(lies(rel)), rel); }
  for (const f of ["wartung.html", "admin/index.html"]) assert.ok(!/cristianweb|legal__agentur/i.test(lies(f)), f + ": kein Agentur-Block");
  assert.ok(!/cristianweb/i.test(lies("data/texte.json")) && !/cristianweb/i.test(lies("data/assistent-wissen.json")), "nicht im Textregister / Wissen");
  for (const g of ["scripts/build-produkte.js", "scripts/build-konfigurator.js", "scripts/build-orte.js"]) assert.ok(lies(g).includes("firmaLib.agenturBlock()") && !/cristianweb/i.test(lies(g)), g + ": nutzt die eine Quelle");
  assert.ok(lies("scripts/firma-einsetzen.js").includes("firma.agenturEinsetzen(html)"), "Build erneuert den Block aus der Quelle");
  assert.equal(Firma.agenturEinsetzen("<p>ohne Marker</p>"), "<p>ohne Marker</p>", "ohne Marker wird nichts eingefügt");
  assert.equal(Firma.agenturEinsetzen("<!--agentur-->alt<!--/agentur-->"), Firma.agenturBlock(), "Marker wird aus der Quelle erneuert");
});
test("Logo lokal: WebP + AVIF vorhanden, 40×40 (2× Anzeigegröße 20 px), wird mit 200 ausgeliefert; Stil ohne Umfärbung, Telefon eigene zentrierte Zeile", async () => {
  for (const f of ["assets/logo/cristianweb.webp", "assets/logo/cristianweb.avif"]) assert.ok(fs.existsSync(path.join(ROOT, f)) && fs.statSync(path.join(ROOT, f)).size > 200, f);
  const webp = fs.readFileSync(path.join(ROOT, "assets/logo/cristianweb.webp"));
  assert.equal(webp.slice(0, 4).toString(), "RIFF"); assert.equal(webp.slice(8, 12).toString(), "WEBP");
  /* Abmessungen aus dem VP8L-/VP8X-Kopf */
  let w = 0, h = 0; const vp8x = webp.indexOf("VP8X"), vp8l = webp.indexOf("VP8L");
  if (vp8x >= 0) { w = 1 + webp.readUIntLE(vp8x + 12, 3); h = 1 + webp.readUIntLE(vp8x + 15, 3); }
  else if (vp8l >= 0) { const b = webp.readUInt32LE(vp8l + 9); w = (b & 0x3fff) + 1; h = ((b >> 14) & 0x3fff) + 1; }
  assert.deepEqual([w, h], [40, 40], "WebP 40×40");
  const srv = http.createServer((req, res) => { const p = path.join(ROOT, decodeURIComponent(req.url.split("?")[0])); if (!fs.existsSync(p)) { res.writeHead(404); res.end(); return; } res.writeHead(200, { "Content-Type": p.endsWith(".avif") ? "image/avif" : "image/webp" }); fs.createReadStream(p).pipe(res); });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  try { for (const f of ["/assets/logo/cristianweb.webp", "/assets/logo/cristianweb.avif"]) { const r = await fetch(`http://127.0.0.1:${srv.address().port}${f}`); assert.equal(r.status, 200, f); assert.ok((await r.arrayBuffer()).byteLength > 200); } } finally { srv.close(); }
  const css = lies("css/style.css");
  assert.ok(css.includes(".legal__agentur img { width: 20px; height: 20px;") && !/legal__agentur img \{[^}]*filter/.test(css), "Logo 20 px, nicht umgefärbt");
  assert.ok(css.includes(".legal__agentur { grid-column: 1 / -1; margin: 6px 0 0; font-size: 12.5px; line-height: 1.4; display: flex; justify-content: center; }"), "Telefon: eigene zentrierte Zeile");
});
