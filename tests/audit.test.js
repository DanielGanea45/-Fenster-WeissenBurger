/* Audit 2026-10: Datensicherung (ZIP aller Admin-Daten ohne Zugangsdaten), Schutz-Header der Admin-Seite,
   canonical/og auf der Startseite, Datenschutzerklärung nennt den E-Mail-Dienst, keine Zugangsdaten in veröffentlichten
   Dateien, robots/sitemap schließen Admin aus. Läuft gegen einen temporären Dateistore. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fw-audit-"));
process.env.FW_STORE_DIR = dir;
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-secret-audit-0123456789abcdefghij";
process.env.ADMIN_SETUP_TOKEN = process.env.ADMIN_SETUP_TOKEN || "test-setup-token-audit-123456";
const ROOT = path.join(__dirname, "..");
const store = require("../netlify/functions/_lib/store");
const auth = require("../netlify/functions/_lib/auth");
const http = require("../netlify/functions/_lib/http");
const apiFn = require("../netlify/functions/admin-api");
const seiteFn = require("../netlify/functions/admin-seite");

let cookie = "", csrf = "";
const ev = (fn, method, body) => ({ httpMethod: method, path: "/.netlify/functions/" + fn, headers: { host: "fensterweissenburger.netlify.app", origin: "https://fensterweissenburger.netlify.app", cookie, "x-csrf": csrf, "content-type": "application/json" }, queryStringParameters: method === "GET" ? body : {}, body: method === "POST" ? JSON.stringify(body) : "" });

test.before(async () => {
  const r = await auth.setup({ token: process.env.ADMIN_SETUP_TOKEN, email: "audit@example.de", password: "SicheresPasswort!2026" });
  assert.ok(r.ok, r.error);
  const s = await auth.createSession(r.account, false);
  cookie = "fw_admin=" + s.token; csrf = http.csrfFor(s.token);
  await store.setJSON("daten/einstellungen", { steuer: { satzProzent: 0 }, website: { banner: { aktiv: false } } });
  await store.setJSON("anfragen/1700000000000-abc", { id: "1700000000000-abc", formular: "kontakt", eingegangen: 1700000000000, felder: { name: "Test" } });
  await store.setJSON("belege/test-1", { id: "test-1", art: "angebot", nummer: "AN-2026-0001" });
  await store.setBinary("belege-pdf/test-1", Buffer.from("%PDF-1.3 test"), "application/pdf");
});

test("Datensicherung: ZIP mit Einstellungen, Anfragen, Belegen und PDFs – ohne Konto, Sitzungen oder Schlüssel; nur angemeldet", async () => {
  const angemeldet = cookie; cookie = ""; const ohne = await apiFn.handler(ev("admin-api", "GET", { aktion: "sicherung" })); assert.equal(ohne.statusCode, 401); cookie = angemeldet;
  const r = await apiFn.handler(ev("admin-api", "GET", { aktion: "sicherung" }));
  assert.equal(r.statusCode, 200, r.body.slice(0, 200)); assert.equal(r.headers["Content-Type"], "application/zip"); assert.match(r.headers["Content-Disposition"], /sicherung-\d{4}-\d{2}-\d{2}\.zip/);
  const JSZip = require("jszip"); const zip = await JSZip.loadAsync(Buffer.from(r.body, "base64"));
  const namen = Object.keys(zip.files);
  for (const n of ["daten/einstellungen.json", "anfragen/1700000000000-abc.json", "belege/test-1.json", "belege-pdf/test-1.pdf", "SICHERUNG.json"]) assert.ok(namen.includes(n), "fehlt: " + n);
  assert.ok(!namen.some((n) => /^(konto|sessions|rate|reset)/.test(n)), "keine Zugangsdaten/Sitzungen in der Sicherung: " + namen.join(", "));
  const info = JSON.parse(await zip.file("SICHERUNG.json").async("string")); assert.ok(info.eintraege >= 4 && info.erstellt);
  const protokoll = await store.getJSON("protokoll", []); assert.ok(protokoll.some((p) => p.typ === "sicherung"), "Download wird protokolliert");
});
test("Admin-Seite: Schutz-Header (CSP, Referrer-Policy, Permissions-Policy, nosniff, DENY) kommen aus der Function", async () => {
  const r = await seiteFn.handler({ httpMethod: "GET", path: "/admin/", headers: { host: "fensterweissenburger.netlify.app" } });
  assert.equal(r.statusCode, 200);
  for (const h of ["Content-Security-Policy", "Referrer-Policy", "Permissions-Policy", "X-Content-Type-Options", "X-Frame-Options", "X-Robots-Tag"]) assert.ok(r.headers[h], "Header fehlt: " + h);
  assert.match(r.headers["Content-Security-Policy"], /default-src 'self'/); assert.match(r.headers["Content-Security-Policy"], /frame-ancestors 'none'/); assert.ok(!/unsafe-inline|unsafe-eval/.test(r.headers["Content-Security-Policy"]));
  assert.ok(!/<style|style="/.test(r.body.replace(/<svg[\s\S]*?<\/svg>/g, "")), "Admin-HTML ohne Inline-Styles (CSP)");
});
test("Startseite: canonical und og:url gesetzt; Datenschutzerklärung nennt Hosting, Formulare und E-Mail-Versand", () => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  assert.match(html, /<link rel="canonical" href="https:\/\/fenster-weissenburger\.de\/">/); assert.match(html, /property="og:url"/);
  const ds = fs.readFileSync(path.join(ROOT, "datenschutz.html"), "utf8");
  for (const w of ["Netlify", "Netlify Forms", "Brevo", "Sendinblue GmbH", "Art. 28 DSGVO", "keine Cookies"]) assert.ok(ds.includes(w), "Datenschutz ohne: " + w);
  const robots = fs.readFileSync(path.join(ROOT, "robots.txt"), "utf8"); assert.match(robots, /Disallow: \/admin\//); assert.match(robots, /Disallow: \/\.netlify\//);
  for (const f of fs.readdirSync(ROOT).filter((x) => /^sitemap.*\.xml$/.test(x))) assert.ok(!/\/admin|\.netlify/.test(fs.readFileSync(path.join(ROOT, f), "utf8")), f + " enthält Admin-Pfade");
});
test("Keine Zugangsdaten in veröffentlichten Dateien (Schlüsselmuster) und keine .env im Repository", () => {
  const AUS = /[\\/](node_modules|\.git|\.netlify|tests|design-[^\\/]*|firma ferestre|bilder-original[^\\/]*)[\\/]/i;
  const treffer = [];
  (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (AUS.test(p + path.sep)) continue; if (e.isDirectory()) walk(p); else if (/\.(html|js|json|toml|txt|xml|css|md)$/.test(e.name)) { const t = fs.readFileSync(p, "utf8"); if (/xkeysib-[A-Za-z0-9]{20,}|nfp_[A-Za-z0-9]{20,}|BEGIN (RSA|OPENSSH|EC) PRIVATE|AKIA[0-9A-Z]{16}/.test(t)) treffer.push(path.relative(ROOT, p)); } else if (/^\.env/.test(e.name)) treffer.push(path.relative(ROOT, p)); } })(ROOT);
  assert.deepEqual(treffer, []);
});
test.after(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* egal */ } });
