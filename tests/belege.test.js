/* Belege (Angebot → AB → Rechnung, Storno): lückenlose Nummern (auch nebenläufig), Unveränderlichkeit nach dem
   Festschreiben, Storno, Berechnung 0 % / 19 %, Anzahlung/Schlussrechnung, Pflichtangaben im PDF, MUSTER bei fehlenden
   Daten, Export, Zugriffsschutz. Läuft gegen einen temporären Dateistore mit eigenen Einstellungen – unabhängig von
   Produktionsdaten. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fw-belege-"));
process.env.FW_STORE_DIR = dir;
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-secret-belege-0123456789abcdefghij";
process.env.ADMIN_SETUP_TOKEN = process.env.ADMIN_SETUP_TOKEN || "test-setup-token-belege-123456";
delete process.env.BREVO_API_KEY;
const ROOT = path.join(__dirname, "..");
const store = require("../netlify/functions/_lib/store");
const auth = require("../netlify/functions/_lib/auth");
const http = require("../netlify/functions/_lib/http");
const B = require("../netlify/functions/_lib/belege");
const PDF = require("../netlify/functions/_lib/pdf");
const Steuer = require("../js/steuer.js");
const fn = require("../netlify/functions/belege");
/* Textauszug mit pdf.js (dieselbe Engine wie Chrome/Firefox). Verglichen wird ohne Leerzeichen, weil pdf.js
   Textstücke frei trennt; so bleibt die Prüfung unabhängig vom Zeilenumbruch. */
let pdfjs = null;
async function pdfText(r) {
  pdfjs = pdfjs || (await import("pdfjs-dist/legacy/build/pdf.mjs"));
  const doc = await pdfjs.getDocument({ data: new Uint8Array(Buffer.from(r.body, "base64")), disableFontFace: true, verbosity: 0 }).promise;
  let out = "";
  for (let i = 1; i <= doc.numPages; i++) { const t = await (await doc.getPage(i)).getTextContent(); out += t.items.map((x) => x.str).join(" ") + " "; }
  const flach = out.replace(/\s+/g, "");
  return { includes: (x) => flach.includes(String(x).replace(/\s+/g, "")), text: out, seiten: doc.numPages };
}

const EINST = JSON.parse(fs.readFileSync(path.join(ROOT, "data/einstellungen.json"), "utf8"));
const BANK = { bank: "Testbank Ingolstadt", kontoinhaber: "Fenster-WeissenBurger UG", iban: "DE89370400440532013000", bic: "COBADEFFXXX", zahlungszielTage: 14, anzahlungProzent: 30, skontoProzent: 0, skontoTage: 0 };
const DOK = { angebot: { nummerStart: "AN-2026-0001", gueltigTage: 30, einleitung: "", schluss: "" }, auftragsbestaetigung: { nummerStart: "AB-2026-0001", einleitung: "", schluss: "" }, rechnung: { nummerStart: "RE-2026-0001", einleitung: "", schluss: "" } };
const KUNDE = { anrede: "Herrn", name: "Max Mustermann", firma: "", strasse: "Musterstraße 1", plz: "85049", ort: "Ingolstadt", email: "max@example.de", telefon: "0841 123456" };
const POS = [
  { beschreibung: "Kunststofffenster Kömmerling 76 MD", details: "1200 × 1400 mm · Weiß", menge: 3, einheit: "Stk.", einzelpreis: 54500, art: "ware" },
  { beschreibung: "Haustür Elegant 76", details: "1100 × 2100 mm", menge: 1, einheit: "Stk.", einzelpreis: 289000, art: "ware" },
  { beschreibung: "Montage inkl. Abdichtung (Arbeitsleistung)", details: "", menge: 4, einheit: "Stk.", einzelpreis: 9500, art: "arbeit" },
];
let cookie = "", csrf = "";
const ev = (method, body) => ({ httpMethod: method, path: "/.netlify/functions/belege", headers: { host: "fensterweissenburger.netlify.app", origin: "https://fensterweissenburger.netlify.app", cookie, "x-csrf": csrf, "content-type": "application/json" }, queryStringParameters: method === "GET" ? body : {}, body: method === "POST" ? JSON.stringify(body) : "" });
const GET = async (q) => { const r = await fn.handler(ev("GET", q)); return r.headers["Content-Type"].startsWith("application/json") ? Object.assign(JSON.parse(r.body), { statusCode: r.statusCode }) : r; };
const POST = async (b) => { const r = await fn.handler(ev("POST", b)); return Object.assign(JSON.parse(r.body), { statusCode: r.statusCode }); };
async function einstSetzen(patch) { const e = JSON.parse(JSON.stringify(EINST)); e.bank = Object.assign({}, BANK, (patch && patch.bank) || {}); e.dokumente = JSON.parse(JSON.stringify(DOK)); e.steuer = { satzProzent: 0 }; if (patch && patch.steuer) e.steuer = patch.steuer; if (patch && patch.ohneBank) e.bank = { bank: "", kontoinhaber: "", iban: "", bic: "", zahlungszielTage: 14, anzahlungProzent: 0 }; await store.setJSON("daten/einstellungen", e); return e; }

test.before(async () => {
  const r = await auth.setup({ token: process.env.ADMIN_SETUP_TOKEN, email: "belege@example.de", password: "SicheresPasswort!2026" });
  assert.ok(r.ok, r.error);
  const s = await auth.createSession(r.account, false);
  cookie = "fw_admin=" + s.token; csrf = http.csrfFor(s.token);
  await einstSetzen();
});

/* ---------- Berechnung ---------- */
test("Berechnung 0 % (§ 19 UStG): keine Steuerzeile, Gesamt = Summe, Arbeitskosten getrennt", () => {
  const s = B.berechne({ positionen: POS, rabatt: {} }, 0);
  assert.equal(s.zwischensumme, 3 * 54500 + 289000 + 4 * 9500);
  assert.equal(s.steuer, 0); assert.equal(s.gesamt, s.summe); assert.equal(s.steuerProzent, 0);
  assert.equal(s.arbeitSumme, 4 * 9500); assert.equal(s.arbeitGesamt, 4 * 9500);
  assert.equal(s.positionen[2].pos, 3);
});
test("Berechnung 19 %: Steuer kaufmännisch gerundet, Rabatt in % und als Betrag", () => {
  const s = B.berechne({ positionen: [{ menge: 3, einzelpreis: 3333, einheit: "Stk." }], rabatt: { prozent: 5 } }, 19);
  assert.equal(s.zwischensumme, 9999); assert.equal(s.rabatt, 500); assert.equal(s.summe, 9499);
  assert.equal(s.steuer, Math.round(9499 * 0.19)); assert.equal(s.gesamt, 9499 + Math.round(9499 * 0.19));
  const s2 = B.berechne({ positionen: [{ menge: 1, einzelpreis: 10000 }], rabatt: { betrag: 2500 } }, 19);
  assert.equal(s2.rabatt, 2500); assert.equal(s2.gesamt, 7500 + 1425);
  const s3 = B.berechne({ positionen: [{ menge: 1, einzelpreis: 1000 }], rabatt: { betrag: 99999 } }, 19);
  assert.equal(s3.rabatt, 1000, "Rabatt nie größer als die Summe");
});
test("Anzahlungs- und Schlussrechnung: Anzahlung aus Prozentsatz, Schlussrechnung zieht sie ab", async () => {
  const einst = await einstSetzen();
  const an = B.neuerBeleg("angebot", einst, { kunde: KUNDE, betreff: "Test", positionen: POS }); an.nummer = "AN-2026-0099";
  const ab = B.abAusAngebot(an, einst); ab.nummer = "AB-2026-0099";
  const anz = B.rechnungAusAb(ab, einst, "anzahlung"); anz.nummer = "RE-2026-0098"; anz.festgeschrieben = { wann: 1, hash: "x" };
  const gesamt = B.berechne(ab, 0).gesamt;
  assert.equal(B.berechne(anz, 0).gesamt, Math.round(gesamt * 0.3));
  assert.equal(anz.rechnungstyp, "anzahlung");
  const schluss = B.rechnungAusAb(ab, einst, "schluss", anz);
  const s = B.berechne(schluss, 0);
  assert.equal(s.gesamt, gesamt); assert.equal(s.anzahlungGesamt, Math.round(gesamt * 0.3)); assert.equal(s.zahlbetrag, gesamt - Math.round(gesamt * 0.3));
  assert.equal(schluss.anzahlung.rechnungNummer, "RE-2026-0098");
});
test("Steuer-Momentaufnahme: Beleg behält seinen Steuerstatus, Texte kommen aus js/steuer.js", async () => {
  const e0 = await einstSetzen({ steuer: { satzProzent: 0 } });
  const b0 = B.neuerBeleg("angebot", e0, {});
  assert.equal(b0.steuer.satz, 0); assert.equal(b0.steuer.pdfHinweis, Steuer.texte(0).belegHinweis); assert.ok(b0.steuer.pdfHinweis.includes("§ 19 UStG"));
  const e19 = await einstSetzen({ steuer: { satzProzent: 19 } });
  const b19 = B.neuerBeleg("angebot", e19, {});
  assert.equal(b19.steuer.satz, 19); assert.equal(b19.steuer.belegSteuer, Steuer.texte(19).belegSteuer); assert.equal(b19.steuer.pdfHinweis, null);
  assert.equal(B.berechne(b0, b0.steuer.satz).steuerProzent, 0, "alter Beleg bleibt bei 0 %, auch wenn die Einstellung jetzt 19 % ist");
  await einstSetzen();
});

/* ---------- Nummernkreise ---------- */
test("Nummernkreis: fortlaufend ohne Lücke, auch bei 25 gleichzeitigen Vergaben; Jahreswechsel beginnt neu", async () => {
  const einst = await einstSetzen(); einst.dokumente.angebot.nummerStart = "AN-2026-0001";
  await store.del("belege-nummern").catch(() => {});
  const erste = await B.nummerVergeben("angebot", einst, "2026-03-01");
  assert.equal(erste, "AN-2026-0001");
  const parallel = await Promise.all(Array.from({ length: 25 }, () => B.nummerVergeben("angebot", einst, "2026-03-02")));
  const nummern = parallel.map((n) => Number(n.split("-")[2])).sort((a, b) => a - b);
  assert.deepEqual(nummern, Array.from({ length: 25 }, (_, i) => i + 2), "keine Doppelvergabe, keine Lücke");
  assert.equal(new Set(parallel).size, 25);
  const neuesJahr = await B.nummerVergeben("angebot", einst, "2027-01-05");
  assert.equal(neuesJahr, "AN-2027-0001");
  assert.equal(await B.nummerVergeben("rechnung", einst, "2026-05-05"), "RE-2026-0001", "Rechnungen haben einen eigenen Kreis");
  assert.equal(await B.nummerVergeben("storno", einst, "2026-05-05"), "ST-2026-0001", "Storno hat einen eigenen Kreis");
  await store.del("belege-nummern").catch(() => {});
});

/* ---------- API-Ablauf ---------- */
let angebotId, abId, rechnungId, stornoId, pdfArchiv = null;
test("Zugriffsschutz: ohne Sitzung 401, POST ohne CSRF-Token 403", async () => {
  const altCookie = cookie; cookie = ""; const r = await GET({ aktion: "liste" }); assert.equal(r.statusCode, 401); cookie = altCookie;
  const altCsrf = csrf; csrf = "falsch"; const p = await POST({ aktion: "anlegen" }); assert.equal(p.statusCode, 403); csrf = altCsrf;
});
test("Angebot anlegen und speichern: Nummer sofort, Summen vom Server, Browserwerte zählen nicht", async () => {
  const r = await POST({ aktion: "anlegen", daten: { kunde: KUNDE, betreff: "Fenster + Haustür", positionen: POS } });
  assert.ok(r.ok, r.error); angebotId = r.beleg.id;
  assert.equal(r.beleg.nummer, "AN-2026-0001"); assert.equal(r.beleg.art, "angebot"); assert.equal(r.beleg.status, "entwurf");
  assert.equal(r.summen.gesamt, B.berechne({ positionen: POS }, 0).gesamt);
  const manipuliert = POS.map((p) => Object.assign({}, p, { gesamt: 1, summe: 1 }));
  const s = await POST({ aktion: "speichern", id: angebotId, daten: { positionen: manipuliert, summen: { gesamt: 1 } } });
  assert.ok(s.ok, s.error); assert.equal(s.summen.gesamt, r.summen.gesamt, "Server rechnet selbst");
  assert.ok(s.beleg.kundeId, "Kunde wurde angelegt");
  const k = await GET({ aktion: "kunden" }); assert.ok(k.kunden.some((x) => x.name === "Max Mustermann" && x.belege === 1));
  const u = await POST({ aktion: "speichern", id: angebotId, daten: { betreff: "" } });
  assert.equal(u.statusCode, 422, "Pflichtfeld fehlt → 422"); assert.ok(u.fehler.some((f) => f.feld === "betreff"));
  await POST({ aktion: "speichern", id: angebotId, daten: { betreff: "Fenster + Haustür" } });
});
test("Angebot-PDF: Pflichtangaben, Unterschriftszeile, Gültigkeit, § 19-Hinweis bei 0 %", async () => {
  const r = await GET({ aktion: "pdf", id: angebotId });
  assert.equal(r.statusCode, 200); assert.equal(r.headers["Content-Type"], "application/pdf");
  const t = await pdfText(r);
  for (const s of ["Angebot", "AN-2026-0001", "Max Mustermann", "Musterstraße 1", "85049 Ingolstadt", "Gültig bis", "Gesamtbetrag", "Unterschrift Kunde", Steuer.texte(0).belegHinweis, "Umsatzsteuer-ID", "IBAN", "Geschäftsführer"]) assert.ok(t.includes(s), "fehlt im Angebot-PDF: " + s);
  assert.ok(!t.includes("MUSTER"), "mit vollständigen Einstellungen kein MUSTER");
});
test("AB aus Angebot: Positionen übernommen, eigene Nummer, Angebot gilt als angenommen", async () => {
  const r = await POST({ aktion: "ab-erstellen", id: angebotId, liefertermin: "2026-11-20" });
  assert.ok(r.ok, r.error); abId = r.beleg.id;
  assert.equal(r.beleg.nummer, "AB-2026-0001"); assert.equal(r.beleg.positionen.length, 3); assert.equal(r.beleg.liefertermin, "2026-11-20"); assert.equal(r.beleg.bezug.angebotNummer, "AN-2026-0001");
  const a = await GET({ aktion: "beleg", id: angebotId }); assert.equal(a.beleg.status, "angenommen"); assert.equal(a.folge[0].id, abId);
  const t = await pdfText(await GET({ aktion: "pdf", id: abId }));
  for (const s of ["Auftragsbestätigung", "AB-2026-0001", "AN-2026-0001", "20.11.2026"]) assert.ok(t.includes(s), "fehlt im AB-PDF: " + s);
});
test("Rechnung aus AB: Entwurf ohne Nummer; Festschreiben vergibt RE-Nummer, archiviert PDF + Prüfsumme; danach unveränderlich", async () => {
  const r = await POST({ aktion: "rechnung-erstellen", id: abId, typ: "voll", leistungsdatum: "2026-11-21" });
  assert.ok(r.ok, r.error); rechnungId = r.beleg.id;
  assert.equal(r.beleg.nummer, null); assert.equal(r.beleg.status, "entwurf"); assert.equal(r.beleg.leistungsdatum, "2026-11-21");
  const entwurf = await pdfText(await GET({ aktion: "pdf", id: rechnungId })); assert.ok(entwurf.includes("MUSTER"), "Rechnungsentwurf ohne Nummer ist als MUSTER gekennzeichnet");
  const f = await POST({ aktion: "festschreiben", id: rechnungId });
  assert.ok(f.ok, f.error);
  assert.equal(f.beleg.nummer, "RE-2026-0001"); assert.equal(f.beleg.status, "offen"); assert.match(f.beleg.festgeschrieben.hash, /^[a-f0-9]{64}$/);
  const pdf = await store.getBinary("belege-pdf/" + rechnungId); assert.ok(pdf && pdf.length > 5000, "PDF archiviert"); pdfArchiv = Buffer.from(pdf);
  assert.equal(B.hashFuer(f.beleg, pdf), f.beleg.festgeschrieben.hash, "Prüfsumme über PDF + Daten stimmt");
  const nochmal = await POST({ aktion: "festschreiben", id: rechnungId }); assert.equal(nochmal.statusCode, 409);
  const aend = await POST({ aktion: "speichern", id: rechnungId, daten: { betreff: "geändert" } }); assert.equal(aend.statusCode, 409, "festgeschriebene Rechnung ist nicht änderbar");
  const st = await POST({ aktion: "status", id: rechnungId, status: "bezahlt" }); assert.equal(st.statusCode, 400, "Zahlungsstatus nicht von Hand setzbar");
  const b = await GET({ aktion: "beleg", id: rechnungId }); assert.equal(b.beleg.betreff, "Rechnung zu Auftrag AB-2026-0001 – Lieferung und Montage"); assert.equal(b.aenderbar, false);
  const ab = await GET({ aktion: "beleg", id: abId }); assert.equal(ab.beleg.status, "erledigt");
});
test("Rechnungs-PDF: alle Pflichtangaben nach § 14 UStG, Zahlungsziel, Verwendungszweck, § 35a, Aufbewahrungshinweis", async () => {
  const r = await GET({ aktion: "pdf", id: rechnungId });
  const t = await pdfText(r);
  const b = (await GET({ aktion: "beleg", id: rechnungId })).beleg;
  const pflicht = ["Rechnung", "RE-2026-0001", "Rechnungsdatum", B.datumDe(b.datum), "Leistungsdatum", "21.11.2026", "Max Mustermann", "Musterstraße 1", "85049 Ingolstadt", b.firma.name, b.firma.strasse, "Umsatzsteuer-ID", b.firma.ustIdNr, "Zahlbar bis", B.datumDe(b.faelligAm), "ohne Abzug", "Verwendungszweck: RE-2026-0001", "IBAN: DE89 3704 0044 0532 0130 00", "BIC: COBADEFFXXX", "§ 35a EStG", B.euro(4 * 9500), "§ 14 Abs. 4 Nr. 9 UStG", Steuer.texte(0).belegHinweis, "Gesamtbetrag", "Menge", "Einzelpreis"];
  for (const s of pflicht) assert.ok(t.includes(s), "fehlt im Rechnungs-PDF: " + s);
  assert.ok(!t.includes("MUSTER"));
  assert.equal(r.headers["Content-Disposition"], 'inline; filename="Rechnung_RE-2026-0001.pdf"');
});
test("Zahlungen: teilweise → bezahlt; Zahlung nur auf festgeschriebene Rechnungen", async () => {
  const gesamt = (await GET({ aktion: "beleg", id: rechnungId })).summen.zahlbetrag;
  const z1 = await POST({ aktion: "zahlung", id: rechnungId, betrag: 100000, datum: "2026-11-25" }); assert.ok(z1.ok, z1.error); assert.equal(z1.beleg.status, "teilweise");
  const z2 = await POST({ aktion: "zahlung", id: rechnungId, betrag: gesamt - 100000, datum: "2026-11-30", notiz: "Rest" }); assert.ok(z2.ok); assert.equal(z2.beleg.status, "bezahlt");
  const k = await GET({ aktion: "kpis" }); assert.equal(k.kpis.offen, 0); assert.ok(k.kpis.umsatzJahr >= gesamt || k.kpis.gesamt >= 3);
  const falsch = await POST({ aktion: "zahlung", id: abId, betrag: 100 }); assert.equal(falsch.statusCode, 409);
});
test("Storno: eigene ST-Nummer, negative Positionen, Bezug, Rechnung bleibt archiviert und wird „storniert“; kein zweites Storno", async () => {
  const r = await POST({ aktion: "stornieren", id: rechnungId, grund: "Falsche Menge" });
  assert.ok(r.ok, r.error); stornoId = r.storno.id;
  assert.equal(r.storno.nummer, "ST-2026-0001"); assert.equal(r.storno.art, "storno"); assert.equal(r.storno.bezug.rechnungNummer, "RE-2026-0001");
  assert.ok(r.storno.positionen.every((p) => p.einzelpreis < 0)); assert.equal(B.berechne(r.storno, 0).gesamt, -B.berechne(r.rechnung, 0).gesamt);
  assert.match(r.storno.festgeschrieben.hash, /^[a-f0-9]{64}$/); assert.equal(r.rechnung.status, "storniert"); assert.equal(r.rechnung.bezug.stornoNummer, "ST-2026-0001");
  const alt = await store.getBinary("belege-pdf/" + rechnungId); assert.equal(Buffer.compare(Buffer.from(alt), pdfArchiv), 0, "Original-PDF unverändert"); assert.equal(r.rechnung.festgeschrieben.hash, (await GET({ aktion: "beleg", id: rechnungId })).beleg.festgeschrieben.hash);
  assert.equal(B.hashFuer(r.rechnung, alt), r.rechnung.festgeschrieben.hash, "Prüfsumme bleibt nachprüfbar, obwohl Status/Bezug sich geändert haben");
  const t = await pdfText(await GET({ aktion: "pdf", id: stornoId }));
  for (const s of ["Stornorechnung", "ST-2026-0001", "RE-2026-0001", "Gutschriftbetrag", "−"]) assert.ok(t.includes(s), "fehlt im Storno-PDF: " + s);
  const zweites = await POST({ aktion: "stornieren", id: rechnungId }); assert.equal(zweites.statusCode, 409);
  const neu = await POST({ aktion: "rechnung-erstellen", id: abId, typ: "voll" }); assert.ok(neu.ok, "nach Storno kann eine neue Rechnung aus der AB erstellt werden");
  const f = await POST({ aktion: "festschreiben", id: neu.beleg.id }); assert.equal(f.beleg.nummer, "RE-2026-0002", "Nummernkreis läuft weiter, keine Lücke, keine Wiederverwendung");
});
test("Anzahlungs- und Schlussrechnung über die API", async () => {
  const an = await POST({ aktion: "anlegen", daten: { kunde: Object.assign({}, KUNDE, { name: "Erika Beispiel", anrede: "Frau", email: "erika@example.de" }), betreff: "Terrassentür", positionen: [POS[0]] } });
  const ab = await POST({ aktion: "ab-erstellen", id: an.beleg.id });
  const schlussZuFrueh = await POST({ aktion: "rechnung-erstellen", id: ab.beleg.id, typ: "schluss" }); assert.equal(schlussZuFrueh.statusCode, 409, "Schlussrechnung braucht festgeschriebene Anzahlung");
  const anz = await POST({ aktion: "rechnung-erstellen", id: ab.beleg.id, typ: "anzahlung" }); assert.ok(anz.ok, anz.error);
  assert.equal(B.berechne(anz.beleg, 0).gesamt, Math.round(3 * 54500 * 0.3)); assert.match(anz.beleg.positionen[0].beschreibung, /Anzahlung 30 %/);
  const fa = await POST({ aktion: "festschreiben", id: anz.beleg.id }); assert.ok(fa.ok, fa.error);
  const schluss = await POST({ aktion: "rechnung-erstellen", id: ab.beleg.id, typ: "schluss" }); assert.ok(schluss.ok, schluss.error);
  const s = B.berechne(schluss.beleg, 0); assert.equal(s.zahlbetrag, 3 * 54500 - Math.round(3 * 54500 * 0.3)); assert.equal(schluss.beleg.anzahlung.rechnungNummer, fa.beleg.nummer);
  const fs2 = await POST({ aktion: "festschreiben", id: schluss.beleg.id }); assert.ok(fs2.ok);
  const t = await pdfText(await GET({ aktion: "pdf", id: schluss.beleg.id }));
  for (const x of ["abzüglich Anzahlung", fa.beleg.nummer, "Noch zu zahlen", B.euro(s.zahlbetrag), "Sehr geehrte Frau Beispiel"]) assert.ok(t.includes(x), "fehlt in der Schlussrechnung: " + x);
});
test("Angebot ablehnen/annehmen per Status; Senden ohne E-Mail-Dienst wird protokolliert, Status „gesendet“", async () => {
  const an = await POST({ aktion: "anlegen", daten: { kunde: KUNDE, betreff: "Test Status", positionen: [POS[0]] } });
  const s = await POST({ aktion: "senden", id: an.beleg.id, an: "max@example.de", text: "Hallo" });
  assert.ok(s.ok, s.error); assert.equal(s.uebersprungen, true); assert.equal(s.beleg.status, "gesendet"); assert.equal(s.beleg.gesendet.an, "max@example.de");
  const ab = await POST({ aktion: "status", id: an.beleg.id, status: "abgelehnt" }); assert.equal(ab.beleg.status, "abgelehnt");
  const falsch = await POST({ aktion: "status", id: an.beleg.id, status: "bezahlt" }); assert.equal(falsch.statusCode, 400);
});
test("MUSTER: ohne Bankdaten tragen PDFs „MUSTER – nicht gültig“, Festschreiben und Senden nennen die fehlenden Einstellungen", async () => {
  await einstSetzen({ ohneBank: true });
  const an = await POST({ aktion: "anlegen", daten: { kunde: KUNDE, betreff: "Muster", positionen: [POS[0]] } });
  const t = await pdfText(await GET({ aktion: "pdf", id: an.beleg.id })); assert.ok(t.includes("MUSTER"));
  const ab = await POST({ aktion: "ab-erstellen", id: an.beleg.id }); const re = await POST({ aktion: "rechnung-erstellen", id: ab.beleg.id });
  const f = await POST({ aktion: "festschreiben", id: re.beleg.id }); assert.equal(f.statusCode, 409); assert.match(f.error, /IBAN/); assert.match(f.error, /Einstellungen/);
  const s = await POST({ aktion: "senden", id: an.beleg.id, an: "max@example.de" }); assert.equal(s.statusCode, 409); assert.match(s.error, /IBAN/);
  const liste = await GET({ aktion: "liste" }); assert.equal(liste.muster.muster, true);
  await einstSetzen();
  assert.equal(B.muster(await einstSetzen()).muster, false);
});
test("Liste: Filter, Suche, Sortierung, Seiten; Kunden mit Belegen", async () => {
  const alle = await GET({ aktion: "liste", proSeite: 10 }); assert.ok(alle.gesamt >= 8); assert.equal(alle.belege.length, Math.min(10, alle.gesamt));
  const re = await GET({ aktion: "liste", art: "rechnung" }); assert.ok(re.belege.every((b) => b.art === "rechnung")); assert.ok(re.belege.some((b) => b.status === "storniert"));
  const bez = await GET({ aktion: "liste", art: "rechnung", status: "bezahlt" }); assert.ok(bez.belege.every((b) => b.status === "bezahlt"));
  const su = await GET({ aktion: "liste", suche: "erika" }); assert.ok(su.gesamt >= 1 && su.belege.every((b) => /Erika/.test(b.kunde)));
  const so = await GET({ aktion: "liste", sort: "nummer", richtung: "auf" }); const nums = so.belege.map((b) => b.nummer || ""); assert.deepEqual(nums, nums.slice().sort());
  const k = await GET({ aktion: "kunden" }); assert.equal(k.kunden.length, 2); const erika = k.kunden.find((x) => x.name === "Erika Beispiel"); assert.ok(erika.belege >= 4);
  const kd = await GET({ aktion: "kunde", id: erika.id }); assert.ok(kd.belege.length >= 4);
  const ks = await POST({ aktion: "kunde-speichern", id: erika.id, kunde: Object.assign({}, erika, { telefon: "0841 999", notizen: "Stammkundin" }) }); assert.ok(ks.ok); assert.equal(ks.kunde.notizen, "Stammkundin");
});
test("Export: CSV mit allen Belegen, DATEV-Buchungsstapel (EXTF), ZIP mit festgeschriebenen PDFs und Prüfsummen-Index", async () => {
  const csv = await fn.handler(ev("GET", { aktion: "export", format: "csv", von: "2026-01-01", bis: "2027-12-31" }));
  assert.equal(csv.statusCode, 200); assert.match(csv.headers["Content-Type"], /text\/csv/);
  assert.ok(csv.body.includes("RE-2026-0001") && csv.body.includes("ST-2026-0001") && csv.body.includes("AN-2026-0001"));
  assert.ok(/^Belegart;Nummer;/.test(csv.body.replace(/^﻿/, "")), "Kopfzeile");
  const datev = await fn.handler(ev("GET", { aktion: "export", format: "datev", von: "2026-01-01", bis: "2027-12-31" }));
  assert.ok(datev.body.startsWith('"EXTF"')); assert.ok(datev.body.includes("RE-2026-0001")); assert.ok(!datev.body.includes("AN-2026-0001"), "DATEV nur Rechnungen/Storno");
  const zip = await fn.handler(ev("GET", { aktion: "export", format: "zip", von: "2026-01-01", bis: "2027-12-31" }));
  assert.equal(zip.headers["Content-Type"], "application/zip"); assert.equal(zip.isBase64Encoded, true);
  const JSZip = require("jszip"); const z = await JSZip.loadAsync(Buffer.from(zip.body, "base64"));
  const namen = Object.keys(z.files);
  assert.ok(namen.includes("Rechnung_RE-2026-0001.pdf") && namen.includes("Stornorechnung_ST-2026-0001.pdf") && namen.includes("INDEX.json"));
  const index = JSON.parse(await z.file("INDEX.json").async("string")); assert.ok(index.every((e) => /^[a-f0-9]{64}$/.test(e.hash)));
});
test("E-Rechnung (vorbereitet, inaktiv): Datenstruktur nach EN 16931 lässt sich aus einer Rechnung ableiten", async () => {
  const b = (await GET({ aktion: "beleg", id: rechnungId })).beleg;
  const e = B.eRechnungDaten(b);
  assert.equal(e.profil, "EN16931"); assert.equal(e.id, "RE-2026-0001"); assert.equal(e.typ, "380"); assert.ok(e.verkaeufer.name && e.kaeufer.name && e.positionen.length === 3);
  assert.equal(b.eRechnung.aktiv, false);
});
test("Admin-Oberfläche: Modul eingebunden, Menüeinträge sichtbar, keine technischen Hinweise für den Kunden", () => {
  const html = fs.readFileSync(path.join(ROOT, "admin/index.html"), "utf8");
  assert.ok(/admin-belege\.js/.test(html));
  const js = fs.readFileSync(path.join(ROOT, "js/admin.js"), "utf8");
  assert.ok(/id: "angebote", gruppe: "Verkauf"(?![^}]*hidden: true)/.test(js), "Angebote & Rechnungen sichtbar");
  assert.ok(/id: "kunden", gruppe: "Verkauf"/.test(js));
  assert.ok(!/localStorage\.setItem\("fw-modul-angebote"/.test(js), "Entwickler-Hinweis entfernt");
  const ui = fs.readFileSync(path.join(ROOT, "js/admin-belege.js"), "utf8");
  assert.ok(!/MwSt|netto|brutto/i.test(ui.replace(/belegSumme|belegSteuer|belegHinweis/g, "")), "keine Steuerwörter im Modul – nur über den Beleg-Snapshot");
});
test.after(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* egal */ } });
