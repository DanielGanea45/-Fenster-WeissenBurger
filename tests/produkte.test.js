/* Produktkarten (Admin → Produkte): Rendern, Preiszeile nur mit Preis, ganze Karte verlinkt, Speichern/Validierung, Einsetzen in die Startseite, Generator. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fw-produkte-"));
process.env.FW_STORE_DIR = dir;
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-secret-produkte-0123456789abcdefghij";
process.env.ADMIN_SETUP_TOKEN = process.env.ADMIN_SETUP_TOKEN || "test-setup-token-produkte-123456";
const ROOT = path.join(__dirname, "..");
const auth = require("../netlify/functions/_lib/auth");
const daten = require("../netlify/functions/_lib/daten");
const apiFn = require("../netlify/functions/admin-api");
const P = require("../netlify/functions/_lib/produkte");
const PV = require("../js/preis-validate.js");
const Steuer = require("../js/steuer.js");

const klon = (o) => JSON.parse(JSON.stringify(o));
const repoProdukte = () => klon(JSON.parse(fs.readFileSync(path.join(ROOT, "data/produkte.json"), "utf8")));
const einst0 = { konfigurator: { status: "aus" }, steuer: { satzProzent: 0 } };
const einst19 = { konfigurator: { status: "aus" }, steuer: { satzProzent: 19 } };
let cookie = "", csrf = "";
const ev = (method, body) => ({ httpMethod: method, path: "/.netlify/functions/admin-api", headers: { host: "fensterweissenburger.netlify.app", origin: "https://fensterweissenburger.netlify.app", cookie, "x-csrf": csrf, "content-type": "application/json" }, queryStringParameters: method === "GET" ? body : {}, body: method === "POST" ? JSON.stringify(body) : "" });
const parse = (r) => JSON.parse(r.body);

test.before(async () => {
  const r = await auth.setup({ token: process.env.ADMIN_SETUP_TOKEN, email: "produkte@example.de", password: "SicheresPasswort!2026" });
  assert.ok(r.ok, r.error);
  const s = await auth.createSession(r.account, false);
  cookie = "fw_admin=" + s.token;
  csrf = require("../netlify/functions/_lib/http").csrfFor(s.token);
});

test("Repo-Karten: gültig, vier auf der Startseite, fünf auf der Übersicht, kein Holz, Kunststoff-Aluminium dabei", () => {
  const d = repoProdukte();
  assert.deepEqual(PV.validiereProdukte(d), []);
  assert.equal(P.karten(d, "startseite").length, 4);
  assert.equal(P.karten(d, "alle").length, 5);
  assert.ok(d.karten.some((k) => k.id === "kunststoff-aluminium" && k.link === "/produkte/kunststoff-aluminium-fenster/"));
  assert.ok(!/holz/i.test(JSON.stringify(d)));
  assert.deepEqual(P.karten(d, "startseite").map((k) => k.titel), ["Kunststofffenster", "Aluminiumfenster", "Kunststoff-Aluminium-Fenster", "Haustüren"]);
});
test("Rendern: ganze Karte ist ein Link, genau ein Link je Karte, keine Preiszeile ohne Preis, Preiszeile mit Steuerhinweis bei Preis", () => {
  const d = repoProdukte();
  const html = P.startHtml(d, einst0, "");
  const karten = html.match(/<li class="product"/g).length;
  assert.equal(karten, 4);
  assert.equal((html.match(/<a /g) || []).length, 4, "ein Link je Karte");
  assert.ok(/<a class="product__link" href="produkte\/kunststoff-aluminium-fenster\/">/.test(html));
  assert.ok(!html.includes('class="price"'), "ohne Preis keine Preiszeile");
  assert.ok(!html.includes("[PREIS]"));
  d.karten[0].abPreis = 1200.5;
  const mit0 = P.startHtml(d, einst0, "");
  assert.ok(mit0.includes('<p class="price">ab <strong>1.200,5 €</strong> <small>' + Steuer.texte(0).kurz + "</small></p>"), mit0.match(/<p class="price">[^\n]*/)[0]);
  const mit19 = P.startHtml(d, einst19, "");
  assert.ok(mit19.includes("inkl. 19 % MwSt."));
  assert.equal((mit0.match(/class="price"/g) || []).length, 1, "nur die Karte mit Preis zeigt eine Preiszeile");
  const ue = P.uebersichtHtml(d, einst0);
  assert.equal((ue.match(/<li class="card"/g) || []).length, 5);
  assert.ok(ue.includes('class="card__link" href="/produkte/schiebetueren/"'));
});
test("Sichtbar/Startseite: ausgeblendete Karten erscheinen nirgends, Startseite-aus nur auf der Übersicht", () => {
  const d = repoProdukte();
  d.karten[0].sichtbar = false; d.karten[1].startseite = false;
  assert.equal(P.karten(d, "startseite").length, 2);
  assert.equal(P.karten(d, "alle").length, 4);
  assert.ok(!P.startHtml(d, einst0, "").includes("Kunststofffenster</h3>"));
  assert.ok(!P.startHtml(d, einst0, "").includes("Aluminiumfenster</h3>") && P.uebersichtHtml(d, einst0).includes("Aluminiumfenster</h3>"));
});
test("Einsetzen in die Startseite: Block zwischen Markern, idempotent, Reihenfolge aus den Daten", () => {
  const html = "<main>\n<!--produkte-karten-->\n<ul class=\"products\"><li>ALTINHALT</li></ul>\n<!--/produkte-karten-->\n</main>";
  const d = repoProdukte(); [d.karten[0], d.karten[3]] = [d.karten[3], d.karten[0]];
  const r = P.einsetzen(html, d, einst0, "");
  assert.equal(r.n, 1); assert.ok(!r.html.includes("ALTINHALT"));
  assert.ok(r.html.indexOf("Haustüren</h3>") < r.html.indexOf("Kunststofffenster</h3>"), "Reihenfolge");
  assert.equal(P.einsetzen(r.html, d, einst0, "").html, r.html, "idempotent");
  assert.equal(P.einsetzen("<p>ohne Marker</p>", d, einst0, "").n, 0);
  const repo = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  assert.ok(/<!--produkte-karten-->[\s\S]*<!--\/produkte-karten-->/.test(repo), "Startseite trägt die Marker");
  assert.equal(P.einsetzen(repo, repoProdukte(), JSON.parse(fs.readFileSync(path.join(ROOT, "data/einstellungen.json"), "utf8")), "").html, repo, "Startseite im Repo entspricht data/produkte.json");
});
test("Speichern über die API: Validierung je Feld, dann versionierte Speicherung mit Veröffentlichung", async () => {
  const d = repoProdukte();
  d.karten.push({ id: "neu", titel: "", kurz: "x", bild: null, abPreis: -5, link: "javascript:alert(1)", sichtbar: true, startseite: true });
  let r = parse(await apiFn.handler(ev("POST", { aktion: "speichern", bereich: "produkte", daten: { karten: d.karten } })));
  assert.equal(r.ok, false);
  const felder = r.fehler.map((f) => f.feld);
  assert.ok(felder.includes("karten.5.titel") && felder.includes("karten.5.bild") && felder.includes("karten.5.abPreis") && felder.includes("karten.5.link"), felder.join(", "));
  d.karten[5] = { id: "sonnenschutz", titel: "Sonnenschutz", untertitel: "", kurz: "Rollläden und Raffstores passend zum Fenster.", bild: { src: "assets/img/haustuer-464.webp", srcset: "", breite: 928, hoehe: 1152, alt: "Rollladen" }, abPreis: 350, link: "/leistungen/", sichtbar: true, startseite: false };
  r = parse(await apiFn.handler(ev("POST", { aktion: "speichern", bereich: "produkte", daten: { karten: d.karten }, beschreibung: "Produktkarten geändert", veroeffentlichen: false })));
  assert.equal(r.ok, true, JSON.stringify(r.fehler || r.error));
  const g = await daten.lade("produkte");
  assert.equal(g.karten.length, 6); assert.equal(g.karten[5].abPreis, 350);
  const v = (await daten.versionen(3))[0];
  assert.equal(v.bereich, "produkte"); assert.equal(v.beschreibung, "Produktkarten geändert");
  assert.ok(P.uebersichtHtml(g, einst0).includes("ab <strong>350 €</strong>"));
  await require("../netlify/functions/_lib/store").setJSON("daten/produkte", null);
});
test("Generator: Produktübersicht und neue Seite Kunststoff-Aluminium-Fenster aus den Daten, ohne Holz und ohne Arbeitsvermerke", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fw-prod-gen-"));
  for (const f of ["index.html", "data/einstellungen.json", "data/produkte.json", "netlify/functions/_lib/firma.js", "netlify/functions/_lib/produkte.js", "js/steuer.js", "js/hinweise.js"]) { fs.mkdirSync(path.dirname(path.join(tmp, f)), { recursive: true }); fs.copyFileSync(path.join(ROOT, f), path.join(tmp, f)); }
  const d = repoProdukte(); d.karten[2].abPreis = 890; fs.writeFileSync(path.join(tmp, "data/produkte.json"), JSON.stringify(d));
  execFileSync(process.execPath, [path.join(ROOT, "scripts/build-produkte.js")], { env: Object.assign({}, process.env, { FW_ROOT: tmp }), stdio: "pipe" });
  const ue = fs.readFileSync(path.join(tmp, "produkte/index.html"), "utf8");
  assert.ok(ue.includes('href="/produkte/kunststoff-aluminium-fenster/"') && ue.includes("ab <strong>890 €</strong>"));
  assert.ok(!/holz/i.test(ue) && !/\[MIT KUNDE KL/.test(ue));
  assert.ok(!fs.existsSync(path.join(tmp, "produkte/holzfenster")));
  const neu = fs.readFileSync(path.join(tmp, "produkte/kunststoff-aluminium-fenster/index.html"), "utf8");
  assert.ok(neu.includes("<h1") && neu.includes("Kömmerling 76 AluClip") && neu.includes("88 AluClip Pro") && !/holz/i.test(neu));
  assert.ok(neu.includes('"@type":"Product"') || neu.includes('"@type": "Product"'));
  const ks = fs.readFileSync(path.join(tmp, "produkte/kunststofffenster-koemmerling/index.html"), "utf8");
  assert.ok(ks.includes('href="/produkte/kunststoff-aluminium-fenster/">Kunststoff-Aluminium-Fenster</a>'), "Menüeintrag");
});
