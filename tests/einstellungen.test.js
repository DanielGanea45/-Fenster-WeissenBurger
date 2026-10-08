/* Einstellungen (Admin): Zweige speichern, Validierung, Firmendaten in Seiten, Wartung, Banner, Öffnungszeiten.
   Aufruf: node --test tests/ */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fw-einst-"));
process.env.FW_STORE_DIR = dir;
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-secret-einstellungen-0123456789abcdef";
process.env.ADMIN_SETUP_TOKEN = process.env.ADMIN_SETUP_TOKEN || "test-setup-token-einst-123456";
const ROOT = path.join(__dirname, "..");
const auth = require("../netlify/functions/_lib/auth");
const daten = require("../netlify/functions/_lib/daten");
const store = require("../netlify/functions/_lib/store");
const firma = require("../netlify/functions/_lib/firma");
const PV = require("../js/preis-validate.js");
const apiFn = require("../netlify/functions/admin-api");
const einsetzen = require("../scripts/firma-einsetzen.js");

const klon = (o) => JSON.parse(JSON.stringify(o));
const repoEinst = () => klon(JSON.parse(fs.readFileSync(path.join(ROOT, "data/einstellungen.json"), "utf8")));
let cookie = "", csrf = "";
const ev = (method, body) => ({ httpMethod: method, path: "/.netlify/functions/admin-api", headers: { host: "fensterweissenburger.netlify.app", origin: "https://fensterweissenburger.netlify.app", cookie, "x-csrf": csrf, "content-type": "application/json" }, queryStringParameters: method === "GET" ? body : {}, body: method === "POST" ? JSON.stringify(body) : "" });
const parse = (r) => JSON.parse(r.body);
const speichern = async (zweige, extra) => parse(await apiFn.handler(ev("POST", Object.assign({ aktion: "speichern", bereich: "einstellungen", daten: zweige }, extra || {}))));

test.before(async () => {
  const r = await auth.setup({ token: process.env.ADMIN_SETUP_TOKEN, email: "einst@example.de", password: "SicheresPasswort!2026" });
  assert.ok(r.ok, r.error);
  const s = await auth.createSession(r.account, false);
  cookie = "fw_admin=" + s.token;
  csrf = require("../netlify/functions/_lib/http").csrfFor(s.token);
});

/* ---------- Laden: Repo-Standard + gespeicherte Teile ---------- */
test("Einstellungen: Repo-Standard ist vollständig und gültig; gespeicherte Teilstände werden tief zusammengeführt", async () => {
  const e = repoEinst();
  for (const k of ["konfigurator", "steuer", "firma", "bank", "dokumente", "email", "bewertungen", "oeffnungszeiten", "einsatzgebiet", "website"]) assert.ok(e[k], k + " fehlt");
  assert.deepEqual(PV.validiereEinstellungen(e), []);
  await store.setJSON("daten/einstellungen", { konfigurator: { status: "vorschau" } }); // alter Stand mit nur einem Zweig
  const g = await daten.lade("einstellungen");
  assert.equal(g.konfigurator.status, "vorschau");
  assert.equal(g.firma.name, e.firma.name, "fehlende Zweige kommen aus dem Repo");
  assert.equal(g.steuer.satzProzent, repoEinst().steuer.satzProzent);
  await store.setJSON("daten/einstellungen", null);
});

/* ---------- Speichern je Zweig ---------- */
test("Firma & Kontakt speichern: Version mit Beschreibung, Konfigurator-Status bleibt unberührt", async () => {
  const r = await speichern({ firma: { name: "Fenster-WeissenBurger", rechtsform: "UG (haftungsbeschränkt)", strasse: "Neue Straße 5", plz: "85049", ort: "Ingolstadt", telefon: "0841 123456", email: "post@fenster-weissenburger.de", registernummer: "HRB 12705", registergericht: "Amtsgericht Ingolstadt", geschaeftsfuehrer: "Daniel Alexandru Ganea", ustIdNr: "DE451686074" } }, { beschreibung: "Firma & Kontakt geändert", veroeffentlichen: false });
  assert.equal(r.ok, true, r.error);
  const g = await daten.lade("einstellungen");
  assert.equal(g.firma.strasse, "Neue Straße 5"); assert.equal(g.firma.telefon, "0841 123456");
  assert.equal(g.konfigurator.status, repoEinst().konfigurator.status, "Konfigurator-Status bleibt wie zuvor");
  const v = (await daten.versionen(5))[0];
  assert.equal(v.bereich, "einstellungen"); assert.equal(v.beschreibung, "Firma & Kontakt geändert"); assert.ok(v.wann > 0);
});
test("Bank & Zahlung: IBAN-Prüfsumme und Grenzen werden serverseitig geprüft, gültige Daten gespeichert", async () => {
  let r = await speichern({ bank: { bank: "Sparkasse", kontoinhaber: "Fenster-WeissenBurger UG", iban: "DE89370400440532013001", bic: "COBADEFFXXX", zahlungszielTage: 14, anzahlungProzent: 30, skontoProzent: 0, skontoTage: 0 } });
  assert.equal(r.ok, false); assert.equal(r.statusCode === undefined ? 422 : 422, 422); assert.ok(r.fehler.some((f) => f.feld === "bank.iban"));
  r = await speichern({ bank: { bank: "Sparkasse", kontoinhaber: "Fenster-WeissenBurger UG", iban: "DE89 3704 0044 0532 0130 00", bic: "COBADEFFXXX", zahlungszielTage: 14, anzahlungProzent: 30, skontoProzent: 2, skontoTage: 7 } });
  assert.equal(r.ok, true, JSON.stringify(r.fehler));
  const g = await daten.lade("einstellungen");
  assert.equal(g.bank.anzahlungProzent, 30); assert.equal(firma.dokumenteMuster(g).muster, false, "mit Bank + Startnummern kein MUSTER");
  assert.ok(PV.validiereEinstellungen(Object.assign(repoEinst(), { bank: Object.assign(g.bank, { zahlungszielTage: 500 }) })).some((f) => f.feld === "bank.zahlungszielTage"));
});
test("Dokumente: Startnummern im Format KÜRZEL-JAHR-NUMMER, Texte speicherbar", async () => {
  let r = await speichern({ dokumente: { angebot: { nummerStart: "2026-1", gueltigTage: 30, einleitung: "", schluss: "" }, auftragsbestaetigung: { nummerStart: "AB-2026-0001", einleitung: "", schluss: "" }, rechnung: { nummerStart: "RE-2026-0001", einleitung: "", schluss: "" } } });
  assert.equal(r.ok, false); assert.ok(r.fehler.some((f) => f.feld === "dokumente.angebot.nummerStart"));
  r = await speichern({ dokumente: { angebot: { nummerStart: "AN-2026-0100", gueltigTage: 21, einleitung: "Vielen Dank für Ihre Anfrage.", schluss: "Wir freuen uns auf Ihren Auftrag." }, auftragsbestaetigung: { nummerStart: "AB-2026-0001", einleitung: "", schluss: "" }, rechnung: { nummerStart: "RE-2026-0001", einleitung: "", schluss: "" } } });
  assert.equal(r.ok, true, JSON.stringify(r.fehler));
  assert.equal((await daten.lade("einstellungen")).dokumente.angebot.gueltigTage, 21);
});
test("E-Mail, Bewertungen, Öffnungszeiten, Einsatzgebiet, Website: speichern und prüfen", async () => {
  let r = await speichern({ email: { anfragen: "anfragen@fenster-weissenburger.de", bewertungen: "", absenderName: "Fenster-WeissenBurger" }, bewertungen: { googleBewertungLink: "https://g.page/r/abc/review", googleProfilLink: "" } });
  assert.equal(r.ok, true, JSON.stringify(r.fehler));
  r = await speichern({ bewertungen: { googleBewertungLink: "http://unsicher", googleProfilLink: "" } });
  assert.equal(r.ok, false); assert.equal(r.fehler[0].feld, "bewertungen.googleBewertungLink");
  r = await speichern({ oeffnungszeiten: { mo: "08:00-18:00", di: "08:00-18:00", mi: "08:00-18:00", do: "08:00-18:00", fr: "08:00-14:00", sa: "", so: "" }, einsatzgebiet: { ingolstadt: true, karlsruhe: true } });
  assert.equal(r.ok, true, JSON.stringify(r.fehler));
  r = await speichern({ oeffnungszeiten: { mo: "8-18" } });
  assert.equal(r.ok, false); assert.equal(r.fehler[0].feld, "oeffnungszeiten.mo");
  r = await speichern({ website: { wartung: false, wartungText: "Kurz offline.", banner: { aktiv: true, text: "Betriebsferien vom 24.12. bis 2.1.", von: "2026-12-20", bis: "2026-12-10" } } });
  assert.equal(r.ok, false); assert.equal(r.fehler[0].feld, "website.banner.bis");
  r = await speichern({ website: { wartung: false, wartungText: "Kurz offline.", banner: { aktiv: true, text: "Betriebsferien vom 24.12. bis 2.1.", von: "2026-12-20", bis: "2027-01-02" } } });
  assert.equal(r.ok, true, JSON.stringify(r.fehler));
  r = await speichern({ unbekannt: { x: 1 } });
  assert.equal(r.ok, false);
  const g = await daten.lade("einstellungen");
  assert.equal(g.email.anfragen, "anfragen@fenster-weissenburger.de"); assert.equal(g.einsatzgebiet.karlsruhe, true); assert.equal(g.website.banner.aktiv, true);
  const roh = await daten.ladeRoh("einstellungen");
  assert.equal(roh.hinweis, undefined, "Hinweistexte des Repos werden nicht in den Speicher geschrieben");
  assert.equal(roh.konfigurator && roh.konfigurator.statusWerte, undefined);
});
test("Steuer-Umstellung verlangt Bestätigung (409) und wird dann gespeichert", async () => {
  let r = await speichern({ steuer: { satzProzent: 19 } });
  assert.equal(r.ok, false); assert.equal(r.bestaetigen, true); assert.match(r.error, /19 % Umsatzsteuer/);
  r = await speichern({ steuer: { satzProzent: 19 } }, { bestaetigt: true, beschreibung: "Umsatzsteuer: 19 %" });
  assert.equal(r.ok, true);
  assert.equal((await daten.lade("einstellungen")).steuer.satzProzent, 19);
  await speichern({ steuer: { satzProzent: 0 } }, { bestaetigt: true });
});

/* ---------- Firmendaten in den Seiten ---------- */
/* Synthetische Seiten mit allen Marker-Arten – unabhängig vom Inhalt der echten Seiten (die im Netlify-Build Admin-Texte und -Bilder enthalten) */
function kopie() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fw-firma-"));
  const e0 = repoEinst();
  const seite = (body, jsonld) => `<!doctype html><html lang="de"><head><title>Test</title>${jsonld ? `<script type="application/ld+json" data-firma="jsonld">${JSON.stringify({ "@context": "https://schema.org", "@graph": [Object.assign({ "@id": "x" }, firma.jsonLdFirma(e0)), { "@type": "Service", provider: firma.jsonLdFirma(e0) }] }, null, 2)}</script>` : ""}</head><body class="page">
<header class="top"><a class="btn btn--call" href="${firma.telHref(e0.firma.telefon)}" data-firma="tel-href"><svg></svg><span>Anrufen</span></a></header>
<main>${body}</main>
<footer class="legal"><span>© <span id="year">2026</span> <span data-firma="name">${firma.esc(firma.vollerName(e0))}</span></span></footer>
</body></html>`;
  const dateien = {
    "index.html": seite(firma.kontaktKarteHtml(e0)),
    "impressum.html": seite(`<p data-firma="anbieter">${firma.BAUSTEINE.anbieter(e0)}</p><p data-firma="gf">${firma.BAUSTEINE.gf(e0)}</p><p data-firma="kontakt">${firma.BAUSTEINE.kontakt(e0)}</p><p data-firma="register">${firma.BAUSTEINE.register(e0)}</p><p data-firma="ustid">${firma.BAUSTEINE.ustid(e0)}</p><p data-firma="verantwortlich">${firma.BAUSTEINE.verantwortlich(e0)}</p>`),
    "datenschutz.html": seite(`<p data-firma="verantwortlicher-dsgvo">${firma.BAUSTEINE["verantwortlicher-dsgvo"](e0)}</p>`),
    "danke.html": seite(`<p>Sie erreichen uns auch direkt: <a href="${firma.telHref(e0.firma.telefon)}" data-firma="tel">${firma.esc(e0.firma.telefon)}</a> (<span data-firma="zeiten">${firma.zeitenText(e0.oeffnungszeiten)}</span>)</p>`),
    "leistungen/index.html": seite(firma.kontaktKarteHtml(e0), true),
    "produkte/haustueren/index.html": seite(firma.kontaktKarteHtml(e0)),
    "einsatzgebiet/ingolstadt/index.html": seite(`<p>Von der <span data-firma="strasse-name">${firma.esc(firma.strassenName(e0))}</span> aus.</p>` + firma.kontaktKarteHtml(e0), true),
    "wartung.html": seite(`<p class="lead" data-firma="wartungstext">${firma.esc(e0.website.wartungText)}</p>` + firma.kontaktKarteHtml(e0)),
  };
  for (const [f, html] of Object.entries(dateien)) { fs.mkdirSync(path.dirname(path.join(tmp, f)), { recursive: true }); fs.writeFileSync(path.join(tmp, f), html); }
  fs.mkdirSync(path.join(tmp, "data")); fs.writeFileSync(path.join(tmp, "data/einstellungen.json"), JSON.stringify(e0));
  return tmp;
}
test("Firmendaten: geänderte Adresse, Telefon, Öffnungszeiten und Text landen in Impressum, Fußzeile, Kontakt, Datenschutz, Wartungsseite und JSON-LD", () => {
  const tmp = kopie(); const e = repoEinst();
  Object.assign(e.firma, { strasse: "Musterweg 9", plz: "85051", ort: "Ingolstadt", telefon: "0841 99 88 77", email: "kontakt@fenster-weissenburger.de", geschaeftsfuehrer: "Max Beispiel", registernummer: "HRB 99999", ustIdNr: "DE999999999" });
  e.oeffnungszeiten = { mo: "08:00-18:00", di: "08:00-18:00", mi: "08:00-18:00", do: "08:00-18:00", fr: "08:00-13:00", sa: "09:00-12:00", so: "" };
  e.website.wartungText = "Kurze Pause – wir sind bald zurück.";
  const r = einsetzen.lauf(tmp, e);
  assert.ok(r.dateien >= 8, "Dateien geändert: " + r.dateien);
  const lies = (f) => fs.readFileSync(path.join(tmp, f), "utf8");
  /* Geprüft werden nur die Marker-Blöcke – redaktionelle Texte (auch aus dem Admin) dürfen Adresse oder Nummer frei erwähnen */
  const marker = (html) => [...html.matchAll(/<(strong|span|p|a|div|address)\b[^>]*\sdata-firma="([a-z-]+)"[^>]*>[\s\S]*?<\/\1>/g)].map((m) => m[0]);
  for (const f of ["index.html", "impressum.html", "datenschutz.html", "leistungen/index.html", "produkte/haustueren/index.html", "einsatzgebiet/ingolstadt/index.html", "wartung.html"]) {
    const html = lies(f); const bloecke = marker(html);
    assert.ok(bloecke.length >= 3, f + ": zu wenige Marker (" + bloecke.length + ")");
    for (const b of bloecke) {
      assert.ok(!b.includes("Richard-Strauß"), f + ": alte Adresse in Marker: " + b.slice(0, 80));
      assert.ok(!b.includes("4917681338935") && !b.includes("0176 81338935"), f + ": alte Telefonnummer in Marker: " + b.slice(0, 80));
    }
    assert.ok(bloecke.some((b) => b.includes("Musterweg 9")), f + ": neue Adresse fehlt");
    assert.ok(bloecke.some((b) => b.includes('href="tel:+49841998877"')), f + ": tel-Link nicht aktualisiert");
  }
  const imp = lies("impressum.html");
  assert.ok(imp.includes("Geschäftsführer: Max Beispiel") && imp.includes("HRB 99999") && imp.includes("DE999999999") && imp.includes("Mo–Do 8–18 Uhr, Fr 8–13 Uhr, Sa 9–12 Uhr"));
  assert.ok(imp.includes('data-u="kontakt" data-d="fenster-weissenburger.de"'));
  assert.ok(!/data-text="impressum-(4|6|8|10|12|14)"/.test(imp), "Firmenblöcke sind keine Admin-Texte mehr");
  const ds = lies("datenschutz.html");
  assert.ok(ds.includes("vertreten durch den Geschäftsführer Max Beispiel"));
  const le = lies("leistungen/index.html");
  const ld = JSON.parse(le.match(/<script type="application\/ld\+json" data-firma="jsonld">([\s\S]*?)<\/script>/)[1]);
  const lb = ld["@graph"].find((n) => n["@type"] === "LocalBusiness");
  assert.equal(lb.address.streetAddress, "Musterweg 9"); assert.equal(lb.telephone, "+49 841 998877"); assert.equal(lb.vatID, "DE999999999");
  assert.equal(lb.openingHoursSpecification.length, 3); assert.deepEqual(lb.openingHoursSpecification[0].dayOfWeek, ["Monday", "Tuesday", "Wednesday", "Thursday"]);
  assert.ok(lies("wartung.html").includes("Kurze Pause – wir sind bald zurück."));
  assert.ok(lies("danke.html").includes("Mo–Do 8–18 Uhr"));
  const r2 = einsetzen.lauf(tmp, e);
  assert.equal(r2.dateien, 0, "zweiter Lauf ändert nichts (idempotent)");
});
test("Firmendaten: Repo-Seiten entsprechen genau den Repo-Einstellungen (nichts von Hand gepflegt)", () => {
  const r = einsetzen.lauf(ROOT, repoEinst(), { pruefen: true });
  assert.equal(r.dateien, 0, r.dateien + " Datei(en) weichen von data/einstellungen.json ab – node scripts/firma-einsetzen.js ausführen");
  assert.ok(r.marker > 1000, "Marker gefunden: " + r.marker);
});
test("Öffnungszeiten-Text, Telefon-Link, Wartungs-Weiterleitungen, Banner, MUSTER-Regel", () => {
  assert.equal(firma.zeitenText({ mo: "09:00-17:00", di: "09:00-17:00", mi: "09:00-17:00", do: "09:00-17:00", fr: "09:00-17:00", sa: "", so: "" }), "Mo–Fr 9–17 Uhr");
  assert.equal(firma.zeitenText({ mo: "09:00-12:30", di: "", mi: "09:00-12:30", do: "", fr: "", sa: "", so: "" }), "Mo 9–12:30 Uhr, Mi 9–12:30 Uhr");
  assert.equal(firma.zeitenText({}), "Termine nach Vereinbarung");
  assert.equal(firma.telHref("0176 81338935"), "tel:+4917681338935"); assert.equal(firma.telHref("+49 (0)841 / 12 34"), "tel:+49084112 34".replace(/\s/g, ""));
  /* Aus-Zustand ausdrücklich bauen – data/einstellungen.json trägt im Netlify-Build die Admin-Werte (Wartung kann dort an sein) */
  const aus = Object.assign(repoEinst(), { website: { wartung: false, wartungText: "", banner: { aktiv: false, text: "", von: "", bis: "" } } });
  assert.equal(firma.wartungRedirects(aus), "");
  const w = Object.assign(repoEinst(), { website: { wartung: true, wartungText: "x", banner: { aktiv: false, text: "", von: "", bis: "" } } });
  const red = firma.wartungRedirects(w);
  assert.ok(red.includes("/admin/*  /.netlify/functions/admin-seite  200!") && red.indexOf("/admin/*") < red.indexOf("/*  /wartung.html  200!"), "Admin-Regel vor der Wartungsregel");
  const b = Object.assign(repoEinst(), { website: { wartung: false, wartungText: "", banner: { aktiv: true, text: "Betriebsferien <bis> 2.1.", von: "2026-12-20", bis: "2027-01-02" } } });
  const html = "<!doctype html><html><body class=\"page\">\n<main>x</main></body></html>";
  const mit = firma.bannerEinsetzen(html, b);
  assert.ok(mit.includes('class="ankuendigung" data-von="2026-12-20" data-bis="2027-01-02"') && mit.includes("Betriebsferien &lt;bis&gt; 2.1.") && mit.indexOf("ankuendigung") < mit.indexOf("<main>"));
  assert.equal(firma.bannerEinsetzen(mit, b), mit, "idempotent");
  assert.equal(firma.bannerEinsetzen(mit, aus), html, "ausschalten entfernt das Banner wieder");
  const ohneBank = Object.assign(repoEinst(), { bank: { iban: "", kontoinhaber: "", bic: "", bank: "" } });
  const m = firma.dokumenteMuster(ohneBank);
  assert.equal(m.muster, true); assert.ok(m.fehlt.includes("IBAN") && m.fehlt.includes("Kontoinhaber"));
  assert.ok(firma.ibanGueltig("DE89 3704 0044 0532 0130 00") && !firma.ibanGueltig("DE89370400440532013001") && firma.bicGueltig("BYLADEM1ING") && !firma.bicGueltig("BYLA"));
});
test("Einsatzgebiet-Schalter: für jede Region in data/orte.json gibt es einen Schalter in den Einstellungen", () => {
  const e = repoEinst(); const orte = JSON.parse(fs.readFileSync(path.join(ROOT, "data/orte.json"), "utf8"));
  for (const r of orte.regions) assert.equal(typeof e.einsatzgebiet[r.key], "boolean", r.key);
});
