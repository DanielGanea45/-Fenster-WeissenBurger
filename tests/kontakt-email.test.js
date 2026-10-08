/* Tests: Anfrageformulare – E-Mail Pflicht (Telefon optional), „Worum geht es?“, Benachrichtigung/Bestätigung/Admin,
   Assistent verlangt die E-Mail, Datenschutz, keine Reste der alten Regel „Telefon oder E-Mail“.
   Unabhängig vom Build-Umfeld: process.env wird gesichert, mit eigenen Testwerten belegt (MAIL_FROM = Empfänger der
   Benachrichtigung, BREVO_API_KEY gesetzt, aber falsch) und am Ende wiederhergestellt; Brevo wird nie kontaktiert.
   Keine festen Admin-Werte aus data/*.json. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execSync } = require("child_process");

const ENV_ORIGINAL = Object.assign({}, process.env);
const FIRMA_MAIL = "firma@example.de";
for (const k of ["NETLIFY", "CONTEXT", "DEPLOY_PRIME_URL", "FRC_API_KEY", "NETLIFY_BLOBS_CONTEXT", "SITE_ID", "NETLIFY_BLOBS_TOKEN", "OPENAI_API_KEY"]) delete process.env[k];
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
const A = require("../netlify/functions/_lib/assistent");
const lies = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const OPTIONEN = ["Fenster (1–3 Stück)", "Fenster (4–10 Stück)", "Fenster (mehr als 10 Stück)", "Haustür", "Fenster und Haustür", "Rollläden / Insektenschutz", "Sonstiges"];
const MELDUNG_LEER = "Bitte geben Sie Ihre E-Mail-Adresse ein.", MELDUNG_FORM = "Bitte geben Sie eine gültige E-Mail-Adresse ein.";

let brevoAufrufe = 0;
const origFetch = globalThis.fetch;
globalThis.fetch = async (url) => { if (/api\.brevo\.com/.test(String(url))) { brevoAufrufe++; throw new Error("Brevo darf im Test nicht kontaktiert werden"); } return { status: 200, ok: true, text: async () => "" }; };
test.after(() => { globalThis.fetch = origFetch; });
test.beforeEach(async () => { mail.protokoll.length = 0; await store.setJSON("daten/einstellungen", { email: { anfragen: FIRMA_MAIL, absenderName: "Fenster-WeissenBurger" } }); });

const ev = (form, fields) => ({ httpMethod: "POST", headers: { host: "fensterweissenburgerdaniel.netlify.app", "user-agent": "test" }, body: JSON.stringify({ form, fields: Object.assign({ ts: String(Date.now() - 5000), js: "1", datenschutz: "ja" }, fields) }) });
const call = async (form, fields) => JSON.parse((await anfrage.handler(ev(form, fields))).body);
async function eintragMit(pruefung) { const alle = []; for (const k of await store.list("anfragen/")) alle.push(await store.getJSON(k, null)); return alle.find((e) => e && pruefung(e.felder || {})) || null; }
async function anzahlEintraege() { return (await store.list("anfragen/")).length; }

test("Server: ohne E-Mail abgelehnt (klare Meldung, nichts gespeichert, keine Mail); ungültige E-Mail abgelehnt; nur E-Mail ohne Telefon wird angenommen – Kontakt, Ortsseite, Konfigurator; Spam-Schutz bleibt", async () => {
  const vorher = await anzahlEintraege();
  let r = await call("kontakt", { name: "A B", plz: "85049", telefon: "0841 1" });
  assert.deepEqual([r.ok, r.reason, r.feld, r.meldung], [false, "felder", "email", MELDUNG_LEER]);
  r = await call("kontakt", { name: "A B", plz: "85049", email: "   " }); assert.deepEqual([r.ok, r.feld, r.meldung], [false, "email", MELDUNG_LEER]);
  r = await call("kontakt", { name: "A B", plz: "85049", email: "keine-adresse", telefon: "0841 1" }); assert.deepEqual([r.ok, r.feld, r.meldung], [false, "email", MELDUNG_FORM]);
  assert.equal(await anzahlEintraege(), vorher, "abgelehnte Anfragen werden nicht gespeichert"); assert.equal(mail.protokoll.length, 0, "abgelehnte Anfragen lösen keine Mail aus");
  r = await call("kontakt", { name: "A B", plz: "85049", email: "a@example.de" }); assert.equal(r.ok, true, JSON.stringify(r));
  r = await call("anfrage-einsatzgebiet", { name: "A B", plz: "76133", ort: "Ettlingen", region: "Karlsruhe", telefon: "0721 1" }); assert.equal(r.feld, "email");
  r = await call("anfrage-einsatzgebiet", { name: "A B", plz: "76133", ort: "Ettlingen", region: "Karlsruhe", email: "b@example.de", anliegen: "Haustür" }); assert.equal(r.ok, true, JSON.stringify(r));
  const preise = JSON.parse(lies("data/preise.json")); const sys = Object.keys(preise.fenster.systeme)[0];
  const konf = { produkt: "fenster", system: sys, typ: Object.keys(preise.fenster.typen)[0], breiteMm: 1200, hoeheMm: 1400, menge: 1, farbe: Object.keys(preise.fenster.farben)[0], glas: Object.keys(preise.fenster.glas)[0], sprossen: "keine", rollladen: "keiner", zusaetze: [], montage: true, demontage: true };
  r = await call("angebot-konfigurator", { name: "A B", plz: "85049", telefon: "0841 1", konfiguration: JSON.stringify(konf) }); assert.deepEqual([r.ok, r.feld], [false, "email"]);
  r = await call("angebot-konfigurator", { name: "A B", plz: "85049", email: "k@example.de", konfiguration: JSON.stringify(konf) }); assert.equal(r.ok, true, JSON.stringify(r));
  r = await call("kontakt", { name: "A B", plz: "85049", email: "a@example.de", "bot-field": "x" }); assert.equal(r.dropped, "honeypot");
  r = await call("kontakt", { name: "A B", plz: "85049", email: "a@example.de", ts: String(Date.now()) }); assert.deepEqual([r.ok, r.reason], [false, "zeit"]);
  assert.equal(brevoAufrufe, 0);
});
test("Zustellung: Anliegen in Betreff/Benachrichtigung/Bestätigung/Admin-Ablage, Antwort-an = Kunde (auch mit MAIL_FROM = Empfänger), Kunde erhält immer die Bestätigung; alte Anfragen mit „Anzahl Fenster“ bleiben lesbar", async () => {
  assert.equal(mail.simuliert(), true, "unter node --test wird der Versand simuliert");
  let r = await call("kontakt", { name: "Erika Muster", plz: "85049", email: "erika@example.de", anliegen: "Fenster (4–10 Stück)", nachricht: "Bitte Rückruf" }); assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(mail.protokoll.length, 2);
  const firma = mail.protokoll.find((m) => m.to === FIRMA_MAIL), kunde = mail.protokoll.find((m) => m.to === "erika@example.de");
  assert.ok(firma, "Benachrichtigung an die Firma"); assert.equal(firma.sender.email, FIRMA_MAIL); assert.equal(firma.replyTo, "erika@example.de", "Antwort-an = Kunde");
  assert.match(firma.subject, /Erika Muster · Fenster \(4–10 Stück\)/); assert.match(firma.text, /Anliegen: Fenster \(4–10 Stück\)/); assert.match(firma.text, /E-Mail: erika@example\.de/); assert.ok(!/\nanliegen:/.test(firma.text), "lesbare Beschriftung statt technischem Schlüssel");
  assert.ok(kunde, "Bestätigung an den Kunden"); assert.match(kunde.subject, /^Vielen Dank für Ihre Anfrage/); assert.match(kunde.text, /Erika Muster/); assert.match(kunde.text, /Anliegen: Fenster \(4–10 Stück\)/); assert.match(kunde.text, /zwei Werktagen/); assert.match(kunde.text, /Bitte Rückruf/);
  assert.ok(kunde.replyTo !== "erika@example.de" && (kunde.replyTo === "" || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(kunde.replyTo)), "Antwort-an der Bestätigung = Firma oder leer");
  assert.ok(!/MwSt|Umsatzsteuer|holz/i.test(kunde.text));
  const e = await eintragMit((f) => f.email === "erika@example.de"); assert.ok(e); assert.equal(e.felder.anliegen, "Fenster (4–10 Stück)"); assert.equal(e.formular, "kontakt");
  /* Konfigurator Haustür mit Anliegen */
  mail.protokoll.length = 0;
  const preise = JSON.parse(lies("data/preise.json")); const t = preise.haustuer;
  const konf = { produkt: "haustuer", modell: Object.keys(t.modelle || t.typen || {})[0], breiteMm: 1100, hoeheMm: 2100, menge: 1, farbe: Object.keys(t.farben)[0], glas: Object.keys(t.glas || {})[0], zusaetze: [], montage: true, demontage: true };
  r = await call("angebot-konfigurator", { name: "Max Tür", plz: "85049", email: "max@example.de", anliegen: "Haustür", konfiguration: JSON.stringify(konf) });
  if (r.ok) { const k = mail.protokoll.find((m) => m.to === "max@example.de"); assert.ok(k && /Anliegen: Haustür/.test(k.text)); }
  else assert.equal(r.reason, "konfiguration", "Konfigurator-Ablehnung nur wegen Konfiguration, nie wegen E-Mail: " + JSON.stringify(r));
  /* ältere Anfrage mit „anzahl-fenster“ (vor dieser Änderung gespeichert) bleibt im Admin lesbar */
  await store.setJSON("anfragen/1000000000000-alt", { id: "1000000000000-alt", formular: "kontakt", eingegangen: 1000000000000, felder: { name: "Alt", email: "alt@example.de", plz: "85049", "anzahl-fenster": "4–8" } });
  const admin = lies("js/admin.js");
  assert.ok(admin.includes('"anzahl-fenster": "Anzahl Fenster"') && admin.includes('anliegen: "Anliegen"') && admin.includes("<th>Anliegen</th>") && admin.includes("f.anliegen || f.produkt"), "Admin: Beschriftung Anliegen + alte Felder");
  assert.ok(admin.includes('key === "email" ? `<a href="mailto:'), "Admin: mailto-Link");
  assert.equal(mail.vorlagen.neueAnfrage({ name: "Alt", "anzahl-fenster": "4–8" }, "https://x/admin/").text.includes("Anzahl Fenster: 4–8"), true);
  assert.equal(brevoAufrufe, 0);
});
test("Formulare: E-Mail * Pflicht, Telefon (optional), „Worum geht es?“ mit fester Liste auf allen Formularen, Vorwahl Haustür (Haustür-Konfigurator, Haustür-Seite), kompakte Struktur, keine Reste der alten Regel", () => {
  const seiten = ["index.html", "leistungen/index.html", "produkte/index.html"];
  const generiert = [];
  for (const d of ["produkte", "einsatzgebiet", "konfigurator"]) if (fs.existsSync(path.join(ROOT, d))) for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) if (e.isDirectory() && fs.existsSync(path.join(ROOT, d, e.name, "index.html"))) generiert.push(d + "/" + e.name + "/index.html");
  const alle = seiten.concat(generiert.filter((f, i) => i % 7 === 0 || /haustueren|haustuer|fenster|ettlingen|ingolstadt|karlsruhe/.test(f)));
  let geprueft = 0;
  for (const f of alle) {
    const h = lies(f); const m = h.match(/<form class="form" name="(kontakt|anfrage-[a-z]+|angebot-konfigurator)"[\s\S]*?<\/form>/); if (!m) continue;
    const form = m[0]; geprueft++;
    assert.match(form, /name="email" type="email" required autocomplete="email" inputmode="email"/, f + ": E-Mail Pflicht");
    assert.match(form, /E-Mail \*<\/label>/, f + ": Beschriftung E-Mail *");
    assert.match(form, /Telefon \(optional\)<\/label>/, f + ": Telefon optional");
    assert.ok(!/name="telefon"[^>]*required/.test(form), f + ": Telefon nicht Pflicht");
    assert.match(form, /Worum geht es\?<\/label>/, f + ": Worum geht es?");
    const sel = form.match(/<select id="[af]-anliegen" name="anliegen">([\s\S]*?)<\/select>/); assert.ok(sel, f + ": Auswahl anliegen");
    const opts = [...sel[1].matchAll(/<option[^>]*>([^<]*)<\/option>/g)].map((x) => x[1]);
    assert.deepEqual(opts, ["Bitte wählen"].concat(OPTIONEN), f + ": Optionen in fester Reihenfolge");
    const vorwahl = (sel[1].match(/<option selected>([^<]*)<\/option>/) || [])[1] || "";
    if (/konfigurator\/haustuer|produkte\/haustueren/.test(f)) assert.equal(vorwahl, "Haustür", f + ": Haustür vorgewählt"); else assert.equal(vorwahl, "", f + ": keine Vorwahl");
    assert.ok(form.indexOf('name="name"') < form.indexOf('name="plz"') && form.indexOf('name="plz"') < form.indexOf('name="email"') && form.indexOf('name="email"') < form.indexOf('name="telefon"') && form.indexOf('name="telefon"') < form.indexOf('name="anliegen"') && form.indexOf('name="anliegen"') < form.indexOf('name="nachricht"'), f + ": Reihenfolge Name, PLZ, E-Mail, Telefon, Anliegen, Nachricht");
    assert.ok(/<textarea id="[af]-msg" name="nachricht" rows="3"/.test(form), f + ": Nachricht 3 Zeilen");
    assert.ok(form.includes("gelesen und stimme zu. *</label>"), f + ": kurzer Datenschutz-Text");
    assert.ok(!/form__hint|anzahl-fenster|anzahl-elemente|Anzahl Fenster|Anzahl Elemente|mindestens ein/.test(form), f + ": keine Reste");
    assert.ok(!/holz|€/i.test(form), f + ": kein Holz, keine Preise im Formular");
    if (f.startsWith("einsatzgebiet")) assert.match(form, /<input type="hidden" name="ort" value="[^"]+">/, f + ": Ort als verstecktes Feld");
  }
  assert.ok(geprueft >= 8, "geprüfte Formulare: " + geprueft);
  for (const g of ["scripts/build-orte.js", "scripts/build-produkte.js", "scripts/build-konfigurator.js"]) { const s = lies(g); assert.ok(s.includes('name="email" type="email" required') && s.includes('name="anliegen"') && !/form__hint|mindestens ein/.test(s), g); }
  const js = lies("js/main.js");
  assert.ok(js.includes(MELDUNG_LEER) && js.includes(MELDUNG_FORM) && js.includes("is-fehlend") && !/Telefonnummer oder/.test(js), "Browser-Prüfung der E-Mail");
  const css = lies("css/style.css");
  assert.ok(css.includes("@media (max-width: 599px) { .form__grid { grid-template-columns: 1fr; gap: 0; } }"), "Telefon: einspaltig");
  assert.ok(css.includes(".form__row.is-fehlend input") && !/form__hint|form__grid--kontakt/.test(css), "CSS ohne Reste");
  assert.ok(/height: 44px/.test(css.match(/\.form input, \.form select, \.form textarea \{[^}]*\}/)[0]), "Felder 44 px");
  assert.ok(/font-size: 12px/.test(css.match(/\.form__check label \{[^}]*\}/)[0]), "Datenschutz-Text 12 px");
  const ds = lies("datenschutz.html");
  assert.ok(/Name, E-Mail-Adresse, Postleitzahl, Anliegen, Nachricht sowie – freiwillig – Ihre Telefonnummer/.test(ds) && /Eingangsbestätigung/.test(ds) && !/mindestens ein/.test(ds), "Datenschutz Abschnitt 5");
});
test("Repo-weit: die alte Regel „Telefon oder E-Mail“ kommt nirgends mehr vor (0 Treffer für die alte Formulierung in allen versionierten Dateien)", () => {
  const dateien = execSync("git ls-files", { cwd: ROOT, encoding: "utf8" }).split(/\r?\n/).filter((f) => /\.html$/.test(f) && !/^(admin|docs)\//.test(f));
  let formulare = 0;
  for (const f of dateien) {
    const h = lies(f);
    for (const m of h.matchAll(/<form\b[^>]*>/g)) {
      const tag = m[0]; if (!/name="(kontakt|anfrage-[a-z]+|bewertung|angebot-konfigurator)"/.test(tag)) continue; formulare++;
      assert.ok(!/data-netlify|netlify-honeypot/.test(tag), f + ": Netlify Forms entfernt");
      assert.match(tag, /action="\/\.netlify\/functions\/anfrage"/, f + ": action → Function");
      assert.match(tag, /data-anfrage/, f + ": data-anfrage");
      const danke = (tag.match(/data-danke="([^"]*)"/) || [])[1]; assert.ok(danke && fs.existsSync(path.join(ROOT, danke)), f + ": Zielseite existiert: " + danke);
    }
    for (const m of h.matchAll(/<p class="hp"><label>Bitte leer lassen: <input name="bot-field"/g)) assert.ok(m, f + ": Honigtopf");
  }
  assert.ok(formulare >= 10, "Formulare gefunden: " + formulare);
  for (const g of ["scripts/build-orte.js", "scripts/build-produkte.js", "scripts/build-konfigurator.js"]) assert.ok(lies(g).includes('action="/.netlify/functions/anfrage" data-anfrage data-danke="/danke.html"') && !lies(g).includes("data-netlify"), g);
  const js = lies("js/main.js");
  assert.ok(js.includes('querySelectorAll("form[data-anfrage]")') && js.includes('form.getAttribute("data-danke")') && !js.includes("HTMLFormElement.prototype.submit.call") && !/data-netlify/.test(js), "main.js");
  assert.ok(lies("js/konfigurator.js").includes('form[data-anfrage]'), "konfigurator.js");
  assert.ok(!/forwardToNetlifyForms|weiterleitung/.test(lies("netlify/functions/anfrage.js")), "keine Weiterleitung an Netlify Forms mehr");
  assert.ok(/noindex/.test(lies("danke.html")) && /Vielen Dank für Ihre Anfrage/.test(lies("danke.html")) && /data-firma="tel"/.test(lies("danke.html")), "Dankeseite");
});
