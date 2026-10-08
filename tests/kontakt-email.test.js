/* Tests: E-Mail-Feld in allen Anfrageformularen – Regel „Telefon oder E-Mail, mindestens eines“ im Browser und auf dem Server,
   E-Mail in Benachrichtigung und Admin, Bestätigung an den Kunden nur mit E-Mail, Datenschutzerklärung. Keine festen Admin-Werte. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.FW_STORE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "fw-kontakt-"));
delete process.env.NETLIFY; delete process.env.BREVO_API_KEY; delete process.env.FRC_API_KEY; process.env.URL = "https://fensterweissenburgerdaniel.netlify.app";
const ROOT = path.join(__dirname, "..");
const mail = require("../netlify/functions/_lib/mail");
const store = require("../netlify/functions/_lib/store");
const anfrage = require("../netlify/functions/anfrage");
const lies = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

/* Netlify-Forms-Weiterleitung und Mailversand abfangen */
const gesendet = [];
const origSend = mail.send;
mail.send = async (m) => { gesendet.push(m); return { ok: true }; };
const origFetch = globalThis.fetch;
globalThis.fetch = async (url, opt) => { if (/netlify\.app|^https?:\/\/[^/]+\/$/.test(String(url)) || String(url).startsWith("http")) return { status: 200, ok: true, text: async () => "" }; return origFetch(url, opt); };
test.after(() => { mail.send = origSend; globalThis.fetch = origFetch; });
test.beforeEach(async () => { gesendet.length = 0; await store.setJSON("daten/einstellungen", { email: { anfragen: "firma@example.de", absenderName: "Fenster-WeissenBurger" } }); });

const ev = (form, fields) => ({ httpMethod: "POST", headers: { host: "fensterweissenburgerdaniel.netlify.app", "user-agent": "test" }, body: JSON.stringify({ form, fields: Object.assign({ ts: String(Date.now() - 5000), js: "1", datenschutz: "ja" }, fields) }) });
const call = async (form, fields) => JSON.parse((await anfrage.handler(ev(form, fields))).body);

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
});
test("E-Mail landet in der Benachrichtigung (mit Antwort-an) und in der Admin-Ablage; Bestätigung an den Kunden nur mit E-Mail", async () => {
  await call("kontakt", { name: "Erika Muster", plz: "85049", telefon: "0841 123456", nachricht: "3 Fenster" });
  assert.equal(gesendet.length, 1, "nur Firmenmail ohne Kunden-E-Mail"); assert.equal(gesendet[0].to, "firma@example.de"); assert.equal(gesendet[0].replyTo, undefined);
  gesendet.length = 0;
  await call("kontakt", { name: "Erika Muster", plz: "85049", email: "erika@example.de", "anzahl-fenster": "3-5", nachricht: "Bitte Rückruf" });
  assert.equal(gesendet.length, 2);
  const firma = gesendet.find((m) => m.to === "firma@example.de"), kunde = gesendet.find((m) => m.to === "erika@example.de");
  assert.ok(firma && /email: erika@example\.de/.test(firma.text) && firma.replyTo === "erika@example.de");
  assert.ok(kunde && /^Vielen Dank für Ihre Anfrage/.test(kunde.subject) && /Erika Muster/.test(kunde.text) && /zwei Werktagen/.test(kunde.text) && /Bitte Rückruf/.test(kunde.text));
  assert.ok(!/MwSt|Umsatzsteuer/.test(kunde.text));
  const keys = (await store.list("anfragen/")).sort(); const e = await store.getJSON(keys[keys.length - 1], null);
  assert.equal(e.felder.email, "erika@example.de"); assert.equal(e.formular, "kontakt");
  /* Admin zeigt E-Mail als mailto-Link */
  assert.ok(lies("js/admin.js").includes('key === "email" ? `<a href="mailto:'));
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
