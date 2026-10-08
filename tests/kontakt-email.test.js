/* Tests: E-Mail-Feld in allen Anfrageformularen – Regel „Telefon oder E-Mail, mindestens eines“ im Browser und auf dem Server,
   E-Mail in Benachrichtigung und Admin, Bestätigung an den Kunden nur mit E-Mail, Datenschutzerklärung.
   Unabhängig vom Build-Umfeld: process.env wird gesichert, mit eigenen Testwerten belegt (MAIL_FROM = Empfänger der
   Benachrichtigung, BREVO_API_KEY gesetzt, aber falsch) und am Ende wiederhergestellt; Brevo wird nie kontaktiert.
   Keine festen Admin-Werte aus data/*.json. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

/* Umgebung sichern und mit eigenen Werten belegen (Build setzt NETLIFY, CONTEXT, URL, MAIL_FROM, MAIL_FROM_NAME, BREVO_API_KEY) */
const ENV_ORIGINAL = Object.assign({}, process.env);
const FIRMA_MAIL = "firma@example.de";
for (const k of ["NETLIFY", "CONTEXT", "DEPLOY_PRIME_URL", "FRC_API_KEY", "NETLIFY_BLOBS_CONTEXT", "SITE_ID", "NETLIFY_BLOBS_TOKEN"]) delete process.env[k];
process.env.FW_STORE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "fw-kontakt-"));
process.env.URL = "https://fensterweissenburgerdaniel.netlify.app";
process.env.MAIL_FROM = FIRMA_MAIL; // absichtlich identisch mit dem Empfänger der Benachrichtigung
process.env.MAIL_FROM_NAME = "Fenster-WeissenBurger Website";
process.env.BREVO_API_KEY = "xkeysib-TEST-nicht-echt";
test.after(() => { for (const k of Object.keys(process.env)) if (!(k in ENV_ORIGINAL)) delete process.env[k]; Object.assign(process.env, ENV_ORIGINAL); });

const ROOT = path.join(__dirname, "..");
const mail = require("../netlify/functions/_lib/mail");
const store = require("../netlify/functions/_lib/store");
const anfrage = require("../netlify/functions/anfrage");
const lies = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

/* Netz abfangen: Netlify-Forms-Weiterleitung antwortet 200; Brevo darf NIE aufgerufen werden */
let brevoAufrufe = 0;
const origFetch = globalThis.fetch;
globalThis.fetch = async (url) => { if (/api\.brevo\.com/.test(String(url))) { brevoAufrufe++; throw new Error("Brevo darf im Test nicht kontaktiert werden"); } return { status: 200, ok: true, text: async () => "" }; };
test.after(() => { globalThis.fetch = origFetch; });
test.beforeEach(async () => { mail.protokoll.length = 0; await store.setJSON("daten/einstellungen", { email: { anfragen: FIRMA_MAIL, absenderName: "Fenster-WeissenBurger" } }); });

const ev = (form, fields) => ({ httpMethod: "POST", headers: { host: "fensterweissenburgerdaniel.netlify.app", "user-agent": "test" }, body: JSON.stringify({ form, fields: Object.assign({ ts: String(Date.now() - 5000), js: "1", datenschutz: "ja" }, fields) }) });
const call = async (form, fields) => JSON.parse((await anfrage.handler(ev(form, fields))).body);
/* Eintrag im Admin-Speicher über den Inhalt finden – nicht über die Sortierung der Kennungen (zwei Anfragen können in derselben Millisekunde eingehen) */
async function eintragMit(pruefung) { const alle = []; for (const k of await store.list("anfragen/")) alle.push(await store.getJSON(k, null)); return alle.find((e) => e && pruefung(e.felder || {})) || null; }

test("Server: Telefon ODER E-Mail reicht; beides leer → klare Meldung; ungültige E-Mail → Meldung; Konfigurator ohne E-Mail-Pflicht", async () => {
  let r = await call("kontakt", { name: "A B", plz: "85049", telefon: "0841 1" }); assert.equal(r.ok, true, JSON.stringify(r));
  r = await call("kontakt", { name: "A B", plz: "85049", email: "a@example.de" }); assert.equal(r.ok, true);
  r = await call("kontakt", { name: "A B", plz: "85049" }); assert.deepEqual([r.ok, r.reason, r.feld], [false, "felder", "kontakt"]); assert.match(r.meldung, /Telefonnummer oder E-Mail-Adresse/);
  r = await call("kontakt", { name: "A B", plz: "85049", email: "keine-adresse" }); assert.deepEqual([r.ok, r.feld], [false, "email"]); assert.match(r.meldung, /gültige E-Mail/);
  r = await call("anfrage-einsatzgebiet", { name: "A B", plz: "76133", ort: "Ettlingen", telefon: "0721 1" }); assert.equal(r.ok, true);
  const preise = JSON.parse(lies("data/preise.json")); const sys = Object.keys(preise.fenster.systeme)[0];
  const konf = { produkt: "fenster", system: sys, typ: Object.keys(preise.fenster.typen)[0], breiteMm: 1200, hoeheMm: 1400, menge: 1, farbe: Object.keys(preise.fenster.farben)[0], glas: Object.keys(preise.fenster.glas)[0], sprossen: "keine", rollladen: "keiner", zusaetze: [], montage: true, demontage: true };
  r = await call("angebot-konfigurator", { name: "A B", plz: "85049", telefon: "0841 1", konfiguration: JSON.stringify(konf) }); assert.equal(r.ok, true, JSON.stringify(r));
  r = await call("angebot-konfigurator", { name: "A B", plz: "85049", konfiguration: JSON.stringify(konf) }); assert.equal(r.feld, "kontakt");
  /* Spam-Schutz bleibt: Honigtopf und Mindestzeit */
  r = await call("kontakt", { name: "A B", plz: "85049", telefon: "1", "bot-field": "x" }); assert.equal(r.dropped, "honeypot");
  r = await call("kontakt", { name: "A B", plz: "85049", telefon: "1", ts: String(Date.now()) }); assert.deepEqual([r.ok, r.reason], [false, "zeit"]);
  assert.equal(brevoAufrufe, 0);
});
test("E-Mail landet in der Benachrichtigung (mit Antwort-an) und in der Admin-Ablage; Bestätigung an den Kunden nur mit E-Mail", async () => {
  let r = await call("kontakt", { name: "Erika Muster", plz: "85049", telefon: "0841 123456", nachricht: "3 Fenster" }); assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(mail.protokoll.length, 1, "nur Firmenmail ohne Kunden-E-Mail"); assert.equal(mail.protokoll[0].to, FIRMA_MAIL); assert.equal(mail.protokoll[0].replyTo, "");
  const ohne = await eintragMit((f) => f.name === "Erika Muster" && f.telefon === "0841 123456"); assert.ok(ohne, "Eintrag ohne E-Mail"); assert.equal(ohne.felder.email, undefined);
  mail.protokoll.length = 0;
  r = await call("kontakt", { name: "Erika Muster", plz: "85049", email: "erika@example.de", "anzahl-fenster": "3-5", nachricht: "Bitte Rückruf" }); assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(mail.protokoll.length, 2);
  const firma = mail.protokoll.find((m) => m.to === FIRMA_MAIL), kunde = mail.protokoll.find((m) => m.to === "erika@example.de");
  assert.ok(firma && /email: erika@example\.de/.test(firma.text) && firma.replyTo === "erika@example.de", "Firmenmail mit Antwort-an");
  assert.ok(kunde && /^Vielen Dank für Ihre Anfrage/.test(kunde.subject) && /Erika Muster/.test(kunde.text) && /zwei Werktagen/.test(kunde.text) && /Bitte Rückruf/.test(kunde.text));
  assert.ok(!/MwSt|Umsatzsteuer/.test(kunde.text));
  const e = await eintragMit((f) => f.email === "erika@example.de"); assert.ok(e, "Eintrag mit E-Mail in der Admin-Ablage");
  assert.equal(e.felder.email, "erika@example.de"); assert.equal(e.formular, "kontakt"); assert.equal(e.felder.nachricht, "Bitte Rückruf");
  assert.ok(ohne.id < e.id, "Kennungen strikt steigend");
  /* Admin zeigt E-Mail als mailto-Link */
  assert.ok(lies("js/admin.js").includes('key === "email" ? `<a href="mailto:'));
  assert.equal(brevoAufrufe, 0);
});
test("Build-Umfeld: MAIL_FROM = Empfänger der Benachrichtigung und BREVO_API_KEY gesetzt → Absender aus MAIL_FROM, Antwort-an = Kunde, Bestätigung an den Kunden, Brevo wird nie aufgerufen", async () => {
  assert.equal(process.env.MAIL_FROM, FIRMA_MAIL); assert.ok(process.env.BREVO_API_KEY); assert.equal(mail.simuliert(), true, "unter node --test wird der Versand simuliert");
  const r = await call("anfrage-einsatzgebiet", { name: "Max Beispiel", plz: "76133", ort: "Ettlingen", email: "max@example.de", telefon: "0721 55", produkt: "Haustür" }); assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(mail.protokoll.length, 2);
  const firma = mail.protokoll.find((m) => m.to === FIRMA_MAIL), kunde = mail.protokoll.find((m) => m.to === "max@example.de");
  assert.ok(firma, "Benachrichtigung an die Firma");
  assert.equal(firma.sender.email, FIRMA_MAIL, "Absender aus MAIL_FROM (identisch mit Empfänger)");
  assert.equal(firma.replyTo, "max@example.de", "Antwort-an = Kunde, auch wenn Absender = Empfänger");
  assert.ok(kunde, "Bestätigung an den Kunden"); assert.equal(kunde.sender.email, FIRMA_MAIL); assert.ok(kunde.replyTo !== "max@example.de" && (kunde.replyTo === "" || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(kunde.replyTo)), "Antwort-an der Bestätigung = Firma (aus den Einstellungen) oder leer, nie der Kunde"); assert.match(kunde.subject, /^Vielen Dank für Ihre Anfrage/); assert.match(kunde.text, /Max Beispiel/);
  const e = await eintragMit((f) => f.email === "max@example.de"); assert.ok(e && e.felder.telefon === "0721 55");
  assert.equal(brevoAufrufe, 0, "Brevo darf im Test nie kontaktiert werden");
  /* Echter Versand ohne Simulation bleibt unverändert möglich: ohne Schlüssel → übersprungen */
  const alt = process.env.BREVO_API_KEY; delete process.env.BREVO_API_KEY;
  try { const s = await mail.send({ to: "x@example.de", subject: "t", text: "t" }); assert.deepEqual(s, { ok: false, skipped: true }); } finally { process.env.BREVO_API_KEY = alt; }
});
test("Formulare: E-Mail-Feld (type=email, autocomplete) in allen Anfrageformularen, Telefon nicht mehr Pflicht, Hinweis, Konfigurator ohne E-Mail-Pflicht; Browser-Regel in main.js", () => {
  const seiten = ["index.html", "leistungen/index.html", "produkte/index.html"];
  const generiert = [];
  for (const d of ["produkte", "einsatzgebiet"]) for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) if (e.isDirectory() && fs.existsSync(path.join(ROOT, d, e.name, "index.html"))) generiert.push(path.join(d, e.name, "index.html"));
  const alle = seiten.concat(generiert.filter((f, i) => i % 7 === 0 || /haustueren|ettlingen|ingolstadt/.test(f)));
  for (const f of alle) {
    const h = lies(f); if (!/<form class="form"[^>]*data-netlify/.test(h)) continue;
    assert.match(h, /<input id="f-mail" name="email" type="email" autocomplete="email" inputmode="email">/, f + ": E-Mail-Feld");
    assert.ok(!/name="telefon" type="tel" required/.test(h), f + ": Telefon nicht mehr Pflicht");
    assert.ok(h.includes("Telefon oder E-Mail – mindestens eine Angabe"), f + ": Hinweis");
    if (!f.startsWith("einsatzgebiet")) assert.ok(h.indexOf('name="email"') < h.indexOf('name="plz"'), f + ": E-Mail vor PLZ");
  }
  const k = lies("scripts/build-konfigurator.js");
  assert.ok(k.includes('<input id="a-mail" name="email" type="email" autocomplete="email" inputmode="email">') && !/name="telefon" type="tel" required/.test(k) && k.includes("Telefon oder E-Mail – mindestens eine Angabe"));
  for (const g of ["scripts/build-orte.js", "scripts/build-produkte.js"]) assert.ok(lies(g).includes('name="email" type="email" autocomplete="email"'), g);
  const js = lies("js/main.js");
  assert.ok(js.includes("Telefonnummer oder Ihre E-Mail-Adresse an") && js.includes("is-fehlend"));
  assert.ok(lies("css/style.css").includes(".form__grid--kontakt { grid-template-columns: 1fr;"), "auf dem Telefon untereinander");
  assert.ok(/E-Mail-Adresse – mindestens eines von beiden/.test(lies("datenschutz.html")) && /Eingangsbestätigung/.test(lies("datenschutz.html")));
});
