/* Tests: Preisvalidierung (Server), Konfigurator-Schalter mit Bestätigung, Versionen/Diff/Wiederherstellen,
   Text-Sanitizer, Bewertungsfreigabe, Veröffentlichen mit fehlgeschlagenem Test (nichts geht online). */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fw-admin-daten-"));
process.env.FW_STORE_DIR = dir;
process.env.ADMIN_SETUP_TOKEN = "test-setup-token-1234567890";
delete process.env.NETLIFY; delete process.env.CONTEXT; delete process.env.NETLIFY_BUILD_HOOK; delete process.env.INCOMING_HOOK_TITLE;

const ROOT = path.join(__dirname, "..");
const auth = require("../netlify/functions/_lib/auth");
const validate = require("../netlify/functions/_lib/validate");
const daten = require("../netlify/functions/_lib/daten");
const store = require("../netlify/functions/_lib/store");
const apiFn = require("../netlify/functions/admin-api");
const build = require("../scripts/build");
const Preis = require("../js/preis.js");

const PW = "SicheresPasswort!2026";
const klon = (o) => JSON.parse(JSON.stringify(o));
const repoPreise = () => klon(JSON.parse(fs.readFileSync(path.join(ROOT, "data/preise.json"), "utf8")));
let cookie = "", csrf = "";
const ev = (method, body, extra = {}) => ({ httpMethod: method, path: "/.netlify/functions/admin-api", headers: Object.assign({ host: "localhost:8888", origin: "http://localhost:8888", cookie, "x-csrf": csrf }, extra.headers || {}), body: body ? JSON.stringify(body) : null, queryStringParameters: extra.query || {} });
const parse = (r) => JSON.parse(r.body);

test.before(async () => {
  const r = await auth.setup({ token: process.env.ADMIN_SETUP_TOKEN, email: "daniel@example.de", password: PW });
  assert.ok(r.ok, r.error);
  const s = await auth.createSession(r.account, false);
  cookie = "fw_admin=" + s.token;
  csrf = require("../netlify/functions/_lib/http").csrfFor(s.token);
});

/* ---------- Preisvalidierung ---------- */
test("Gültige Repo-Preisliste besteht die Serverprüfung", () => {
  assert.deepEqual(validate.validierePreise(repoPreise()), []);
});
test("Negative Preise, leere Felder, absurde Prozente, min > max werden je Feld gemeldet", () => {
  const p = repoPreise();
  p.fenster.systeme["koemmerling-70"].preisProM2 = -5;
  p.fenster.grenzen.breiteMinMm = 3000; // > max 2500
  p.mwstProzent = 95;
  p.haustuer.modelle["modern-voll"].grundpreis = "";
  p.fenster.farben.anthrazit.zuschlagProzent = 400;
  p.onlineRabattProzent = -1;
  const f = validate.validierePreise(p);
  const felder = f.map((x) => x.feld);
  assert.ok(felder.includes("fenster.systeme.koemmerling-70.preisProM2"));
  assert.ok(felder.includes("fenster.grenzen.breiteMaxMm"));
  assert.ok(felder.includes("mwstProzent"));
  assert.ok(felder.includes("haustuer.modelle.modern-voll.grundpreis"));
  assert.ok(felder.includes("fenster.farben.anthrazit.zuschlagProzent"));
  assert.ok(felder.includes("onlineRabattProzent"));
  f.forEach((x) => assert.match(x.meldung, /[a-zäöü]/i));
});
test("Mehr als zwei Nachkommastellen bei Euro-Beträgen werden abgelehnt", () => {
  const p = repoPreise();
  p.fenster.glas["3-fach"].zuschlagProM2 = 40.123;
  assert.ok(validate.validierePreise(p).some((x) => x.feld === "fenster.glas.3-fach.zuschlagProM2"));
});
test("Speichern über die API lehnt ungültige Preise mit 422 und Feldliste ab", async () => {
  const p = repoPreise(); p.fenster.montage.montageProElement = -1;
  const r = await apiFn.handler(ev("POST", { aktion: "speichern", bereich: "preise", daten: p }));
  assert.equal(r.statusCode, 422);
  assert.equal(parse(r).fehler[0].feld, "fenster.montage.montageProElement");
  assert.equal(await daten.ladeRoh("preise"), null, "nichts gespeichert");
});
test("Gültige Preise werden gespeichert, Version mit Diff angelegt, Rechner nutzt die neuen Werte", async () => {
  const p = repoPreise(); p.fenster.systeme["koemmerling-70"].preisProM2 = 333; p.version = "2026-10-08-test";
  const r = await apiFn.handler(ev("POST", { aktion: "speichern", bereich: "preise", daten: p, beschreibung: "Kömmerling 70 angepasst" }));
  assert.equal(r.statusCode, 200, r.body);
  const vs = await daten.versionen();
  assert.equal(vs[0].bereich, "preise");
  assert.equal(vs[0].wer, "daniel@example.de");
  assert.ok(vs[0].aenderungen >= 2);
  const v = await daten.version(vs[0].id);
  assert.ok(v.diff.some((d) => d.pfad === "fenster.systeme.koemmerling-70.preisProM2" && d.alt === 300 && d.neu === 333));
  const cfg = { produkt: "fenster", system: "koemmerling-70", typ: "1-fluegelig", breiteMm: 1000, hoeheMm: 1000, farbe: "weiss", glas: "2-fach", menge: 1 };
  const rr = await apiFn.handler(ev("POST", { aktion: "rechnen", konfiguration: cfg }));
  assert.equal(parse(rr).ergebnis.positionen[0].betrag, 33300);
  assert.equal(parse(rr).ergebnis.brutto, Preis.berechne(cfg, p).brutto);
});

/* ---------- Konfigurator-Schalter ---------- */
test("Schalter: Vorschau ohne Rückfrage, Online nur mit Bestätigung, ungültige Werte abgelehnt", async () => {
  let r = await apiFn.handler(ev("POST", { aktion: "speichern", bereich: "einstellungen", daten: { konfigurator: { status: "vorschau" } } }));
  assert.equal(r.statusCode, 200, r.body);
  assert.equal((await daten.lade("einstellungen")).konfigurator.status, "vorschau");
  r = await apiFn.handler(ev("POST", { aktion: "speichern", bereich: "einstellungen", daten: { konfigurator: { status: "online" } } }));
  assert.equal(r.statusCode, 409);
  assert.equal(parse(r).bestaetigen, true);
  assert.equal((await daten.lade("einstellungen")).konfigurator.status, "vorschau");
  r = await apiFn.handler(ev("POST", { aktion: "speichern", bereich: "einstellungen", daten: { konfigurator: { status: "online" } }, bestaetigt: true }));
  assert.equal(r.statusCode, 200);
  assert.equal((await daten.lade("einstellungen")).konfigurator.status, "online");
  r = await apiFn.handler(ev("POST", { aktion: "speichern", bereich: "einstellungen", daten: { konfigurator: { status: "kaputt" } } }));
  assert.equal(r.statusCode, 422);
  r = await apiFn.handler(ev("POST", { aktion: "speichern", bereich: "einstellungen", daten: { konfigurator: { status: "aus" } } }));
  assert.equal(r.statusCode, 200);
});

/* ---------- Texte ---------- */
test("Text-Sanitizer entfernt Skripte und Ereignis-Attribute, behält einfache Auszeichnung", () => {
  const s = validate.sanitizeHtml('Hallo <b>Welt</b><script>alert(1)</script> <a href="javascript:x" onclick="y">Link</a> <em>ok</em><img src=x onerror=z>');
  assert.equal(s, "Hallo <b>Welt</b> <a>Link</a> <em>ok</em>");
});
test("Impressum/Datenschutz nur mit Bestätigung; Rücksetzen auf Original entfernt die Änderung", async () => {
  const reg = daten.repoDatei("texte");
  const frei = Object.keys(reg.bloecke).find((k) => reg.bloecke[k].seite === "startseite" && reg.bloecke[k].tag === "p");
  const gesch = Object.keys(reg.bloecke).find((k) => reg.bloecke[k].geschuetzt);
  let r = await apiFn.handler(ev("POST", { aktion: "speichern", bereich: "texte", daten: { [gesch]: "Neuer Text" } }));
  assert.equal(r.statusCode, 409);
  r = await apiFn.handler(ev("POST", { aktion: "speichern", bereich: "texte", daten: { [frei]: "Neuer <strong>Text</strong>" } }));
  assert.equal(r.statusCode, 200, r.body);
  let t = await daten.lade("texte");
  assert.equal(t.bloecke[frei].html, "Neuer <strong>Text</strong>");
  assert.equal(t.bloecke[frei].geaendert, true);
  r = await apiFn.handler(ev("POST", { aktion: "speichern", bereich: "texte", daten: { [frei]: null } }));
  t = await daten.lade("texte");
  assert.equal(t.bloecke[frei].html, reg.bloecke[frei].html);
  assert.ok(!t.bloecke[frei].geaendert);
});

/* ---------- Bewertungen ---------- */
test("Bewertung: offen → freigegeben erscheint in der Build-Ausgabe, abgelehnte nicht", async () => {
  await store.setJSON("daten/bewertungen", [
    { id: "b1", status: "offen", name: "A. B.", ort: "Ingolstadt", projekt: "Fenstertausch", sterne: 5, text: "Top.", datum: "2026-10" },
    { id: "b2", status: "offen", name: "C. D.", ort: "Eichstätt", projekt: "Haustür", sterne: 4, text: "Gut.", datum: "2026-10" },
  ]);
  let r = await apiFn.handler(ev("POST", { aktion: "bewertung", id: "b1", status: "freigegeben" }));
  assert.equal(r.statusCode, 200);
  r = await apiFn.handler(ev("POST", { aktion: "bewertung", id: "b2", status: "abgelehnt" }));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fw-bew-")); fs.mkdirSync(path.join(tmp, "data"));
  const n = build.bewertungenSchreiben(tmp, await daten.lade("bewertungen"));
  const out = JSON.parse(fs.readFileSync(path.join(tmp, "data/bewertungen.json"), "utf8"));
  assert.equal(n, 1); assert.equal(out[0].name, "A. B."); assert.equal(out[0].email, undefined);
});

/* ---------- Wiederherstellen ---------- */
test("Wiederherstellen setzt den Stand einer früheren Version als neue Version", async () => {
  const vs = (await daten.versionen()).filter((v) => v.bereich === "preise");
  const alt = vs[vs.length - 1];
  const v = await daten.wiederherstelle(alt.id, "daniel@example.de");
  assert.match(v.beschreibung, /Wiederhergestellt/);
  assert.equal((await daten.lade("preise")).fenster.systeme["koemmerling-70"].preisProM2, 333);
});

/* ---------- Veröffentlichen ---------- */
test("Veröffentlichen ohne NETLIFY_BUILD_HOOK: klare Fehlermeldung, Status „fehler“", async () => {
  const r = await apiFn.handler(ev("POST", { aktion: "veroeffentlichen" }));
  assert.equal(r.statusCode, 409);
  assert.match(parse(r).error, /NETLIFY_BUILD_HOOK/);
  assert.equal((await daten.publishStatus()).status, "fehler");
});
test("Veröffentlichen mit Build Hook: Status „läuft“, Hook wird mit Titel aufgerufen", async () => {
  process.env.NETLIFY_BUILD_HOOK = "https://api.netlify.com/build_hooks/test";
  const orig = global.fetch; let aufgerufen = "";
  global.fetch = async (url, o) => { aufgerufen = url; return { ok: true, status: 200 }; };
  try {
    const r = await apiFn.handler(ev("POST", { aktion: "veroeffentlichen", grund: "Test" }));
    assert.equal(r.statusCode, 200, r.body);
    assert.match(aufgerufen, /build_hooks\/test\?trigger_title=Admin/);
    assert.equal((await daten.publishStatus()).status, "laeuft");
    const r2 = await apiFn.handler(ev("POST", { aktion: "veroeffentlichen" }));
    assert.equal(r2.statusCode, 409, "zweite Veröffentlichung während eines Laufs wird abgelehnt");
  } finally { global.fetch = orig; delete process.env.NETLIFY_BUILD_HOOK; }
});

/* Build-Lauf in einem temporären Seitenabbild: fehlgeschlagener Test ⇒ Exit-Fehler + Status „fehler“ */
function seitenAbbild() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fw-site-"));
  for (const f of ["index.html", "data/preise.json", "data/einstellungen.json", "data/texte.json", "data/bilder.json", "data/bewertungen.json"]) {
    fs.mkdirSync(path.dirname(path.join(tmp, f)), { recursive: true });
    fs.copyFileSync(path.join(ROOT, f), path.join(tmp, f));
  }
  return tmp;
}
test("Build: schlägt ein Test fehl, wird NICHT veröffentlicht – Status „fehler“ mit Meldung, Exit ≠ 0", async () => {
  const tmp = seitenAbbild();
  const r = await build.lauf({ root: tmp, mitStore: true, still: true, ohneMail: true, log: () => {}, schritte: [{ name: "Tests", cmd: 'node -e "console.error(\'not ok 1 - Preis falsch\'); process.exit(1)"' }] });
  assert.equal(r.ok, false);
  const st = await daten.publishStatus();
  assert.equal(st.status, "fehler");
  assert.match(st.fehler, /Tests fehlgeschlagen/);
  assert.match(st.fehler, /Preis falsch/);
});
test("Build: alle Schritte bestehen ⇒ Status „veröffentlicht“, Admin-Daten im Abbild eingesetzt", async () => {
  const tmp = seitenAbbild();
  const reg = daten.repoDatei("texte");
  const id = Object.keys(reg.bloecke).find((k) => reg.bloecke[k].seite === "startseite" && reg.bloecke[k].tag === "h2");
  await store.setJSON("daten/texte", { [id]: "Überschrift <em>aus dem Admin</em>" });
  const r = await build.lauf({ root: tmp, mitStore: true, still: true, ohneMail: true, log: () => {}, schritte: [{ name: "Tests", cmd: "node -e \"process.exit(0)\"" }] });
  assert.equal(r.ok, true);
  assert.equal((await daten.publishStatus()).status, "veroeffentlicht");
  const html = fs.readFileSync(path.join(tmp, "index.html"), "utf8");
  assert.ok(html.includes(`data-text="${id}">Überschrift <em>aus dem Admin</em></h2>`));
  const p = JSON.parse(fs.readFileSync(path.join(tmp, "data/preise.json"), "utf8"));
  assert.equal(p.fenster.systeme["koemmerling-70"].preisProM2, 333);
  assert.equal(JSON.parse(fs.readFileSync(path.join(tmp, "data/einstellungen.json"), "utf8")).konfigurator.status, "aus");
  assert.ok(fs.existsSync(path.join(tmp, "_redirects")));
});
test("Build: ungültige Preisliste im Store ⇒ Abbruch vor den Tests", async () => {
  const tmp = seitenAbbild();
  const p = repoPreise(); p.mwstProzent = 99;
  await store.setJSON("daten/preise", p);
  const r = await build.lauf({ root: tmp, mitStore: true, still: true, ohneMail: true, log: () => {}, schritte: [] });
  assert.equal(r.ok, false);
  assert.match(r.fehler, /mwstProzent/);
  await store.setJSON("daten/preise", repoPreise());
});

test.after(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* egal */ } });
