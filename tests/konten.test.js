/* Einstellungen → Konten & Zugänge: Speichern, Validierung, Dienste-Status nur als ja/nein, Ablauf-Erinnerung. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fw-konten-"));
process.env.FW_STORE_DIR = dir;
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-secret-konten-0123456789abcdefghij";
process.env.ADMIN_SETUP_TOKEN = process.env.ADMIN_SETUP_TOKEN || "test-setup-token-konten-123456";
const ROOT = path.join(__dirname, "..");
const auth = require("../netlify/functions/_lib/auth");
const daten = require("../netlify/functions/_lib/daten");
const PV = require("../js/preis-validate.js");
const apiFn = require("../netlify/functions/admin-api");

let cookie = "", csrf = "";
const ev = (method, body) => ({ httpMethod: method, path: "/.netlify/functions/admin-api", headers: { host: "fensterweissenburger.netlify.app", origin: "https://fensterweissenburger.netlify.app", cookie, "x-csrf": csrf, "content-type": "application/json" }, queryStringParameters: method === "GET" ? body : {}, body: method === "POST" ? JSON.stringify(body) : "" });
const parse = (r) => JSON.parse(r.body);

test.before(async () => {
  const r = await auth.setup({ token: process.env.ADMIN_SETUP_TOKEN, email: "konten@example.de", password: "SicheresPasswort!2026" });
  assert.ok(r.ok, r.error);
  const s = await auth.createSession(r.account, false);
  cookie = "fw_admin=" + s.token;
  csrf = require("../netlify/functions/_lib/http").csrfFor(s.token);
});

test("Repo-Standard enthält den Zweig konten mit Ablaufdatum und ist gültig", () => {
  const e = JSON.parse(fs.readFileSync(path.join(ROOT, "data/einstellungen.json"), "utf8"));
  assert.ok(e.konten && e.konten.netlify && e.konten.technik);
  assert.match(e.konten.blobsTokenAblauf, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(PV.validiereEinstellungen(e), []);
});
test("Konten speichern: Konten, Registrar, Ansprechpartner, Ablaufdatum – versioniert, ohne Veröffentlichung", async () => {
  const r = parse(await apiFn.handler(ev("POST", { aktion: "speichern", bereich: "einstellungen", daten: { konten: { netlify: { konto: "daniel@example.de" }, github: { konto: "DanielGanea45" }, brevo: { konto: "daniel@example.de" }, domain: { anbieter: "Strato", link: "https://www.strato.de/", konto: "kunde-123" }, google: { konto: "daniel@gmail.com" }, technik: { name: "Technik GmbH", email: "support@example.de", telefon: "0841 12345" }, blobsTokenAblauf: "2027-10-01" } }, beschreibung: "Konten & Zugänge geändert", veroeffentlichen: false })));
  assert.equal(r.ok, true, JSON.stringify(r.fehler || r.error));
  assert.equal(r.veroeffentlichung, null);
  const g = await daten.lade("einstellungen");
  assert.equal(g.konten.domain.anbieter, "Strato"); assert.equal(g.konten.technik.email, "support@example.de");
  assert.equal((await daten.versionen(3))[0].beschreibung, "Konten & Zugänge geändert");
});
test("Validierung: ungültige E-Mail, http-Link, falsches Datum werden je Feld gemeldet", async () => {
  const r = parse(await apiFn.handler(ev("POST", { aktion: "speichern", bereich: "einstellungen", daten: { konten: { netlify: { konto: "keine-mail" }, domain: { anbieter: "IONOS", link: "http://unsicher.de", konto: "" }, technik: { name: "", email: "x@", telefon: "" }, blobsTokenAblauf: "01.10.2027" } } })));
  assert.equal(r.ok, false);
  const felder = r.fehler.map((f) => f.feld);
  assert.ok(felder.includes("konten.domain.link") && felder.includes("konten.technik.email") && felder.includes("konten.blobsTokenAblauf"), felder.join(", "));
});
test("Dienste-Status liefert nur ja/nein (und die Absenderadresse), nie Schlüsselwerte", async () => {
  const alt = { b: process.env.BREVO_API_KEY, t: process.env.NETLIFY_BLOBS_TOKEN, h: process.env.NETLIFY_BUILD_HOOK, m: process.env.MAIL_FROM };
  process.env.BREVO_API_KEY = "xkeysib-GEHEIM-12345"; process.env.NETLIFY_BLOBS_TOKEN = "nfp_GEHEIM_67890"; delete process.env.NETLIFY_BUILD_HOOK; process.env.MAIL_FROM = "info@fenster-weissenburger.de";
  try {
    const raw = await apiFn.handler(ev("GET", { aktion: "dienste" }));
    const r = parse(raw);
    assert.equal(r.ok, true);
    assert.equal(r.dienste.mail, true); assert.equal(r.dienste.datenspeicher, true); assert.equal(r.dienste.veroeffentlichung, false);
    assert.equal(r.dienste.absender, "info@fenster-weissenburger.de");
    assert.ok(!raw.body.includes("GEHEIM"), "Antwort enthält Schlüsselwerte");
    for (const [k, v] of Object.entries(r.dienste)) if (k !== "absender" && k !== "kontext") assert.equal(typeof v, "boolean", k);
  } finally {
    if (alt.b === undefined) delete process.env.BREVO_API_KEY; else process.env.BREVO_API_KEY = alt.b;
    if (alt.t === undefined) delete process.env.NETLIFY_BLOBS_TOKEN; else process.env.NETLIFY_BLOBS_TOKEN = alt.t;
    if (alt.h !== undefined) process.env.NETLIFY_BUILD_HOOK = alt.h;
    if (alt.m === undefined) delete process.env.MAIL_FROM; else process.env.MAIL_FROM = alt.m;
  }
});
test("Übersicht liefert das Ablaufdatum; Erinnerung 30 Tage vorher (tageBis)", async () => {
  const r = parse(await apiFn.handler(ev("GET", { aktion: "uebersicht" })));
  assert.equal(r.ok, true); assert.equal(r.blobsTokenAblauf, "2027-10-01");
  assert.equal(PV.tageBis("2027-10-01", "2027-09-01"), 30);
  assert.equal(PV.tageBis("2027-10-01", "2027-10-02"), -1);
  assert.equal(PV.tageBis("", "2027-10-02"), null);
  assert.equal(PV.tageBis("2027-10-01", "2027-08-01") > 30, true);
});
