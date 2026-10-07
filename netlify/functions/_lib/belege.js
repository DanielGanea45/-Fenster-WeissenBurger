/* Belege: Angebot (AN) → Auftragsbestätigung (AB) → Rechnung (RE), Stornorechnung (ST). Fachlogik für Functions
   und Tests: Berechnung in Cent (serverseitig, Browserwerte werden nie übernommen), lückenlose Nummernkreise je
   Belegart (Compare-and-Set), Momentaufnahmen von Firma/Bank/Steuer beim Erstellen, GoBD: festgeschriebene Belege
   sind unveränderlich (SHA-256 über PDF + Daten), Korrektur nur per Stornorechnung, vollständiger Verlauf.
   Firmendaten/Bank/Texte/Nummern kommen ausschließlich aus data/einstellungen.json; Steuer aus js/steuer.js. */
"use strict";
const crypto = require("crypto");
const store = require("./store");
const firmaLib = require("./firma");
const Steuer = require("../../../js/steuer.js");

const ARTEN = {
  angebot: { kreis: "angebot", kuerzel: "AN", titel: "Angebot", badge: "ANGEBOT", status: ["entwurf", "gesendet", "angenommen", "abgelehnt", "abgelaufen"] },
  ab: { kreis: "auftragsbestaetigung", kuerzel: "AB", titel: "Auftragsbestätigung", badge: "AUFTRAGSBESTÄTIGUNG", status: ["entwurf", "gesendet", "erledigt"] },
  rechnung: { kreis: "rechnung", kuerzel: "RE", titel: "Rechnung", badge: "RECHNUNG", status: ["entwurf", "offen", "teilweise", "bezahlt", "ueberfaellig", "storniert"] },
  storno: { kreis: "storno", kuerzel: "ST", titel: "Stornorechnung", badge: "STORNORECHNUNG", status: ["festgeschrieben"] },
};
const EINHEITEN = ["Stk.", "m²", "lfm", "pauschal", "Std."];
const STATUS_LABEL = { entwurf: "Entwurf", gesendet: "Gesendet", angenommen: "Angenommen", abgelehnt: "Abgelehnt", abgelaufen: "Abgelaufen", erledigt: "Erledigt", offen: "Offen", teilweise: "Teilweise bezahlt", bezahlt: "Bezahlt", ueberfaellig: "Überfällig", storniert: "Storniert", festgeschrieben: "Festgeschrieben" };
const RECHNUNGSTYPEN = ["voll", "anzahlung", "schluss"];

const rund = (x) => Math.round(x + 1e-9);
const cent = (euro) => rund(Number(euro) * 100);
function euro(c) { const neg = c < 0; c = Math.abs(Math.round(c)); const s = (c / 100).toFixed(2).replace(".", ","); return (neg ? "−" : "") + s.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + " €"; }
function heute() { return new Date().toISOString().slice(0, 10); }
function datumDe(iso) { if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return ""; const [j, m, t] = iso.slice(0, 10).split("-"); return `${t}.${m}.${j}`; }
function plusTage(iso, tage) { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + Number(tage || 0)); return d.toISOString().slice(0, 10); }
function id() { return Date.now().toString(36) + "-" + crypto.randomBytes(4).toString("hex"); }

/* ---------- Berechnung (immer serverseitig) ---------- */
function berechne(beleg, satz) {
  satz = Steuer.gueltig(satz) ? satz : Steuer.satz(beleg.steuer ? { steuer: { satzProzent: beleg.steuer.satz } } : null);
  const pos = (beleg.positionen || []).map((p, i) => {
    const menge = Number(p.menge) || 0, einzel = Math.round(Number(p.einzelpreis) || 0);
    return Object.assign({}, p, { pos: i + 1, menge, einzelpreis: einzel, gesamt: rund(menge * einzel) });
  });
  const zwischensumme = pos.reduce((a, p) => a + p.gesamt, 0);
  const rab = beleg.rabatt || {};
  let rabatt = 0;
  if (rab.prozent) rabatt = rund(zwischensumme * Number(rab.prozent) / 100);
  else if (rab.betrag) rabatt = Math.round(Number(rab.betrag));
  rabatt = Math.max(0, Math.min(rabatt, Math.max(0, zwischensumme)));
  const summe = zwischensumme - rabatt;
  const steuer = rund(summe * satz / 100);
  const gesamt = summe + steuer;
  const arbeitSumme = pos.filter((p) => p.art === "arbeit").reduce((a, p) => a + p.gesamt, 0);
  const arbeitGesamt = arbeitSumme + rund(arbeitSumme * satz / 100);
  const anz = beleg.anzahlung || {};
  let anzahlungGesamt = 0;
  if (beleg.art === "rechnung" && beleg.rechnungstyp === "schluss" && anz.verrechnet) anzahlungGesamt = Math.round(Number(anz.verrechnet));
  const zahlbetrag = gesamt - anzahlungGesamt;
  return { positionen: pos, zwischensumme, rabatt, rabattProzent: rab.prozent ? Number(rab.prozent) : 0, summe, steuerProzent: satz, steuer, gesamt, arbeitSumme, arbeitGesamt, anzahlungGesamt, zahlbetrag };
}
/* Anzahlungsrechnung: Prozentsatz vom Gesamt des Auftrags */
function anzahlungPositionen(abBeleg, prozent, satz) {
  const s = berechne(abBeleg, satz);
  const anteil = rund(s.summe * Number(prozent) / 100);
  return [{ beschreibung: `Anzahlung ${prozent} % auf Auftrag ${abBeleg.nummer || ""}`.trim(), details: `Gemäß Auftragsbestätigung vom ${datumDe(abBeleg.datum)}; Gesamtauftrag ${euro(s.gesamt)}`, menge: 1, einheit: "pauschal", einzelpreis: anteil, art: "ware" }];
}

/* ---------- Validierung ---------- */
function validiere(beleg) {
  const f = [];
  const add = (feld, meldung) => f.push({ feld, meldung });
  const str = (x) => (typeof x === "string" ? x.trim() : "");
  if (!ARTEN[beleg.art]) add("art", "Unbekannte Belegart.");
  const k = beleg.kunde || {};
  if (!str(k.name)) add("kunde.name", "Name des Kunden fehlt.");
  if (!str(k.strasse)) add("kunde.strasse", "Straße fehlt.");
  if (!/^\d{5}$/.test(str(k.plz))) add("kunde.plz", "Postleitzahl: fünf Ziffern.");
  if (!str(k.ort)) add("kunde.ort", "Ort fehlt.");
  if (str(k.email) && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(str(k.email))) add("kunde.email", "E-Mail-Adresse prüfen.");
  if (!str(beleg.betreff)) add("betreff", "Betreff fehlt.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(beleg.datum || ""))) add("datum", "Datum im Format JJJJ-MM-TT.");
  if (beleg.leistungsdatum && !/^\d{4}-\d{2}-\d{2}$/.test(String(beleg.leistungsdatum))) add("leistungsdatum", "Leistungsdatum im Format JJJJ-MM-TT.");
  if (beleg.leistungsende && !/^\d{4}-\d{2}-\d{2}$/.test(String(beleg.leistungsende))) add("leistungsende", "Leistungszeitraum-Ende im Format JJJJ-MM-TT.");
  const pos = Array.isArray(beleg.positionen) ? beleg.positionen : [];
  if (!pos.length) add("positionen", "Mindestens eine Position.");
  pos.forEach((p, i) => {
    const n = `positionen.${i}.`;
    if (!str(p.beschreibung)) add(n + "beschreibung", "Beschreibung fehlt.");
    if (!(Number(p.menge) > 0 && Number(p.menge) < 100000)) add(n + "menge", "Menge: positive Zahl.");
    if (!EINHEITEN.includes(p.einheit)) add(n + "einheit", "Einheit: " + EINHEITEN.join(", "));
    if (!(Number.isInteger(Number(p.einzelpreis)) && Math.abs(Number(p.einzelpreis)) < 100000000)) add(n + "einzelpreis", "Einzelpreis in Cent (ganze Zahl).");
    if (p.art && !["ware", "arbeit"].includes(p.art)) add(n + "art", "Art: ware oder arbeit.");
  });
  const r = beleg.rabatt || {};
  if (r.prozent && !(Number(r.prozent) >= 0 && Number(r.prozent) <= 50)) add("rabatt.prozent", "Rabatt: 0 bis 50 %.");
  if (r.betrag && !(Number.isInteger(Number(r.betrag)) && Number(r.betrag) >= 0)) add("rabatt.betrag", "Rabattbetrag in Cent.");
  if (beleg.art === "rechnung" && !RECHNUNGSTYPEN.includes(beleg.rechnungstyp || "voll")) add("rechnungstyp", "Rechnungstyp: voll, anzahlung oder schluss.");
  return f;
}

/* ---------- Momentaufnahmen ---------- */
function firmaSnapshot(einst) {
  const f = einst.firma || {}, b = einst.bank || {};
  return { name: firmaLib.vollerName(einst), kurzname: f.name || "", strasse: f.strasse, plz: f.plz, ort: f.ort, telefon: f.telefon, email: f.email, registergericht: f.registergericht, registernummer: f.registernummer, geschaeftsfuehrer: f.geschaeftsfuehrer, ustIdNr: f.ustIdNr, web: "www.fenster-weissenburger.de", bank: b.bank || "", kontoinhaber: b.kontoinhaber || "", iban: b.iban ? firmaLib.ibanFormat(b.iban) : "", bic: (b.bic || "").toUpperCase(), zahlungszielTage: Number(b.zahlungszielTage) || 0, anzahlungProzent: Number(b.anzahlungProzent) || 0, skontoProzent: Number(b.skontoProzent) || 0, skontoTage: Number(b.skontoTage) || 0 };
}
function steuerSnapshot(einst) { const s = Steuer.satz(einst); const t = Steuer.texte(s); return { satz: s, kurz: t.kurz, lang: t.lang, summeLabel: t.summeLabel, steuerLabel: t.steuerLabel, pdfHinweis: t.belegHinweis || null, belegSumme: t.belegSumme, belegSteuer: t.belegSteuer || null, belegArbeit: t.belegArbeit }; }
function muster(einst) { return firmaLib.dokumenteMuster(einst); }

/* ---------- Nummernkreise: lückenlos, Jahr wechselt automatisch ---------- */
function nummerMuster(start) {
  const m = /^([A-Z]{1,5})-(\d{4})-(\d{3,6})$/.exec(String(start || ""));
  if (!m) return null;
  return { praefix: m[1], jahr: Number(m[2]), start: Number(m[3]), breite: m[3].length };
}
function nummerFormat(muster, jahr, n) { return `${muster.praefix}-${jahr}-${String(n).padStart(muster.breite, "0")}`; }
async function nummerVergeben(art, einst, datum) {
  const a = ARTEN[art]; if (!a) throw new Error("Belegart");
  const jahr = Number(String(datum || heute()).slice(0, 4));
  const d = (einst.dokumente || {});
  const startDef = art === "storno" ? (d.rechnung && d.rechnung.nummerStart ? d.rechnung.nummerStart.replace(/^[A-Z]+/, "ST") : "ST-" + jahr + "-0001") : (d[a.kreis] && d[a.kreis].nummerStart);
  const mu = nummerMuster(startDef); if (!mu) throw new Error("Startnummer für " + a.titel + " fehlt oder ist ungültig (Einstellungen → Dokumente).");
  for (let versuch = 0; versuch < 12; versuch++) {
    const { wert, etag } = await store.getJSONMitEtag("belege-nummern", {});
    const kreise = Object.assign({}, wert);
    const k = Object.assign({ jahr: null, letzte: 0, vergeben: 0 }, kreise[art] || {});
    let n;
    if (k.jahr !== jahr) { n = jahr === mu.jahr ? mu.start : 1; } else { n = Math.max(k.letzte + 1, jahr === mu.jahr ? mu.start : 1); }
    kreise[art] = { jahr, letzte: n, vergeben: (k.vergeben || 0) + 1, geaendert: Date.now() };
    if (await store.setJSONWenn("belege-nummern", kreise, etag)) return nummerFormat(mu, jahr, n);
    await new Promise((r) => setTimeout(r, 10 + Math.random() * 40));
  }
  throw new Error("Nummer konnte nicht vergeben werden (zu viele gleichzeitige Zugriffe) – bitte erneut versuchen.");
}
/* Sperre: Rechnungsnummer darf nach der ersten festgeschriebenen Rechnung nicht herabgesetzt werden */
async function nummerStartZulaessig(art, neueStart) {
  const kreise = await store.getJSON("belege-nummern", {});
  const k = kreise[ARTEN[art] ? art : "rechnung"]; const mu = nummerMuster(neueStart);
  if (!k || !mu) return true;
  if (mu.jahr < k.jahr) return false;
  if (mu.jahr === k.jahr && mu.start <= k.letzte) return false;
  return true;
}

/* ---------- Belege anlegen / ableiten ---------- */
function neuerBeleg(art, einst, basis) {
  basis = basis || {};
  const datum = basis.datum || heute();
  const d = (einst.dokumente || {})[ARTEN[art].kreis] || {};
  const b = {
    id: id(), art, nummer: null, status: "entwurf", datum, erstellt: Date.now(), geaendert: Date.now(),
    kundeId: basis.kundeId || null,
    kunde: Object.assign({ anrede: "", name: "", firma: "", strasse: "", plz: "", ort: "", email: "", telefon: "" }, basis.kunde || {}),
    betreff: basis.betreff || "", einleitung: basis.einleitung !== undefined ? basis.einleitung : (d.einleitung || ""), schluss: basis.schluss !== undefined ? basis.schluss : (d.schluss || ""),
    positionen: basis.positionen || [], rabatt: basis.rabatt || { prozent: 0, betrag: 0 },
    leistungsdatum: basis.leistungsdatum || "", leistungsende: basis.leistungsende || "",
    bezug: basis.bezug || {}, bild: basis.bild || null, quelle: basis.quelle || null,
    firma: firmaSnapshot(einst), steuer: steuerSnapshot(einst),
    verlauf: [], zahlungen: [], festgeschrieben: null, gesendet: null,
    eRechnung: { aktiv: !!((einst.dokumente || {}).eRechnung), profil: "EN 16931 (ZUGFeRD/XRechnung) – vorbereitet, nicht aktiv" },
  };
  if (art === "angebot") b.gueltigBis = plusTage(datum, d.gueltigTage || 30);
  if (art === "ab") b.liefertermin = basis.liefertermin || "";
  if (art === "rechnung") { b.rechnungstyp = basis.rechnungstyp || "voll"; b.faelligAm = plusTage(datum, (einst.bank || {}).zahlungszielTage || 14); b.anzahlung = basis.anzahlung || null; }
  return b;
}
function ausAnfrage(anfrage, einst) {
  const k = anfrage.felder || {}; const konf = anfrage.konfiguration || null;
  const kunde = { anrede: "", name: k.name || "", firma: "", strasse: k.strasse || "", plz: k.plz || "", ort: k.ort || "", email: k.email || "", telefon: k.telefon || "" };
  const positionen = [];
  if (konf) {
    const zeilen = String(k.zusammenfassung || "").split(" | ").filter((x) => x && !/^Richtpreis|^Preis auf Anfrage/.test(x));
    const satz = Steuer.satz(einst);
    const gesamt = Number(anfrage.preisServer || 0);
    const summe = satz ? rund(gesamt / (1 + satz / 100)) : gesamt;
    const menge = (konf.menge && Number(konf.menge)) || 1;
    positionen.push({ beschreibung: (konf.produkt === "haustuer" ? "Haustür" : "Fenster") + " nach Konfiguration" + (konf.breiteMm ? ` ${konf.breiteMm} × ${konf.hoeheMm} mm` : ""), details: zeilen.join(" · "), menge, einheit: "Stk.", einzelpreis: menge ? rund(summe / menge) : summe, art: "ware", bild: anfrage.bild || null });
  } else if (k.produkt || k.leistung) positionen.push({ beschreibung: String(k.produkt || k.leistung), details: String(k.nachricht || "").slice(0, 300), menge: 1, einheit: "Stk.", einzelpreis: 0, art: "ware" });
  return { kunde, positionen, betreff: konf ? (konf.produkt === "haustuer" ? "Angebot über Lieferung und Montage einer Haustür" : "Angebot über Lieferung und Montage von Fenstern") : "Angebot", quelle: { anfrageId: anfrage.id, eingegangen: anfrage.eingegangen }, bild: anfrage.bild || null };
}
function abAusAngebot(angebot, einst) {
  return neuerBeleg("ab", einst, { kundeId: angebot.kundeId, kunde: angebot.kunde, betreff: angebot.betreff.replace(/^Angebot/, "Auftragsbestätigung"), positionen: angebot.positionen.map((p) => Object.assign({}, p)), rabatt: angebot.rabatt, bezug: { angebotId: angebot.id, angebotNummer: angebot.nummer }, bild: angebot.bild, liefertermin: plusTage(heute(), 42) });
}
function rechnungAusAb(ab, einst, typ, anzahlungBeleg) {
  typ = RECHNUNGSTYPEN.includes(typ) ? typ : "voll";
  const satz = Steuer.satz(einst);
  const basis = { kundeId: ab.kundeId, kunde: ab.kunde, bezug: { abId: ab.id, abNummer: ab.nummer, angebotId: ab.bezug && ab.bezug.angebotId, angebotNummer: ab.bezug && ab.bezug.angebotNummer }, bild: ab.bild, rechnungstyp: typ, leistungsdatum: ab.liefertermin || "" };
  if (typ === "anzahlung") {
    const prozent = Number((einst.bank || {}).anzahlungProzent) || 30;
    Object.assign(basis, { betreff: `Anzahlungsrechnung zu Auftrag ${ab.nummer || ""}`.trim(), positionen: anzahlungPositionen(ab, prozent, satz), rabatt: { prozent: 0, betrag: 0 }, anzahlung: { prozent } });
  } else {
    Object.assign(basis, { betreff: `Rechnung zu Auftrag ${ab.nummer || ""} – Lieferung und Montage`.trim(), positionen: ab.positionen.map((p) => Object.assign({}, p)), rabatt: ab.rabatt });
    if (typ === "schluss" && anzahlungBeleg) { const s = berechne(anzahlungBeleg, anzahlungBeleg.steuer.satz); basis.anzahlung = { rechnungId: anzahlungBeleg.id, rechnungNummer: anzahlungBeleg.nummer, verrechnet: s.gesamt, verrechnetSumme: s.summe, verrechnetSteuer: s.steuer }; }
  }
  return neuerBeleg("rechnung", einst, basis);
}
function stornoAus(rechnung, einst, grund) {
  const b = neuerBeleg("storno", einst, { kundeId: rechnung.kundeId, kunde: rechnung.kunde, betreff: `Stornorechnung zu Rechnung ${rechnung.nummer}`, positionen: rechnung.positionen.map((p) => Object.assign({}, p, { einzelpreis: -Math.abs(Number(p.einzelpreis) || 0) })), rabatt: rechnung.rabatt && rechnung.rabatt.prozent ? { prozent: rechnung.rabatt.prozent, betrag: 0 } : { prozent: 0, betrag: -Math.abs(Number((rechnung.rabatt || {}).betrag) || 0) }, bezug: { rechnungId: rechnung.id, rechnungNummer: rechnung.nummer }, leistungsdatum: rechnung.leistungsdatum });
  b.einleitung = `Hiermit stornieren wir die Rechnung ${rechnung.nummer} vom ${datumDe(rechnung.datum)} vollständig.${grund ? " Grund: " + grund : ""}`;
  b.schluss = "Ein bereits gezahlter Betrag wird erstattet bzw. mit der neuen Rechnung verrechnet.";
  b.steuer = rechnung.steuer; // Steuerstatus der stornierten Rechnung bleibt
  b.anzahlung = rechnung.anzahlung || null; b.rechnungstyp = rechnung.rechnungstyp || "voll";
  return b;
}

/* ---------- GoBD ---------- */
function istFestgeschrieben(b) { return !!(b && b.festgeschrieben && b.festgeschrieben.hash); }
function pruefeAenderbar(b) { if (istFestgeschrieben(b)) throw Object.assign(new Error(`${ARTEN[b.art].titel} ${b.nummer} ist festgeschrieben und kann nicht mehr geändert werden. Korrekturen nur per Stornorechnung.`), { code: 409 }); }
function hashFuer(beleg, pdf) {
  // Nur die beim Festschreiben fixierten Inhalte zählen; Nachträge (Status, Zahlungen, Versand, Storno-Verweis, Verlauf) nicht.
  const daten = Object.assign({}, beleg, { verlauf: undefined, festgeschrieben: undefined, gesendet: undefined, zahlungen: undefined, status: undefined, geaendert: undefined, bezug: Object.assign({}, beleg.bezug || {}, { stornoId: undefined, stornoNummer: undefined, rechnungId: undefined }) });
  const h = crypto.createHash("sha256"); h.update(pdf); h.update(JSON.stringify(daten)); return h.digest("hex");
}
function journal(b, wer, was, details) { (b.verlauf = b.verlauf || []).push({ wann: Date.now(), wer: wer || "", was, details: details || "" }); b.geaendert = Date.now(); }

/* ---------- Status / Zahlungen ---------- */
function zahlungsstatus(b, heuteIso) {
  if (b.art !== "rechnung") return b.status;
  if (b.status === "storniert" || b.status === "entwurf") return b.status;
  const s = berechne(b, b.steuer.satz);
  const gezahlt = (b.zahlungen || []).reduce((a, z) => a + Math.round(Number(z.betrag) || 0), 0);
  if (gezahlt >= s.zahlbetrag && s.zahlbetrag >= 0) return "bezahlt";
  if (gezahlt > 0) return "teilweise";
  if (b.faelligAm && (heuteIso || heute()) > b.faelligAm) return "ueberfaellig";
  return "offen";
}
function gezahlt(b) { return (b.zahlungen || []).reduce((a, z) => a + Math.round(Number(z.betrag) || 0), 0); }

/* ---------- Kunden ---------- */
function kundeId() { return "K-" + Date.now().toString(36).toUpperCase().slice(-6) + crypto.randomBytes(1).toString("hex").toUpperCase(); }
function kundeSchluessel(k) { const e = String(k.email || "").trim().toLowerCase(); if (e) return "email:" + e; return "np:" + String(k.name || "").trim().toLowerCase() + "|" + String(k.plz || "").trim(); }

/* ---------- Export ---------- */
function csvZeile(felder) { return felder.map((v) => { const s = String(v == null ? "" : v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(";"); }
function dez(c) { return (c / 100).toFixed(2).replace(".", ","); }
function exportCsv(belege) {
  const zeilen = [csvZeile(["Belegart", "Nummer", "Datum", "Leistungsdatum", "Fällig", "Kunde", "PLZ", "Ort", "Summe", "Steuersatz", "Steuer", "Gesamt", "Gezahlt", "Status", "Bezug", "Festgeschrieben", "Hash"])];
  for (const b of belege) { const s = berechne(b, b.steuer.satz); zeilen.push(csvZeile([ARTEN[b.art].titel, b.nummer || "", datumDe(b.datum), datumDe(b.leistungsdatum), datumDe(b.faelligAm), b.kunde.name, b.kunde.plz, b.kunde.ort, dez(s.summe), String(s.steuerProzent).replace(".", ","), dez(s.steuer), dez(s.gesamt), dez(gezahlt(b)), STATUS_LABEL[zahlungsstatus(b)] || b.status, (b.bezug && (b.bezug.rechnungNummer || b.bezug.abNummer || b.bezug.angebotNummer)) || "", b.festgeschrieben ? datumDe(new Date(b.festgeschrieben.wann).toISOString()) : "", (b.festgeschrieben && b.festgeschrieben.hash) || ""])); }
  return "﻿" + zeilen.join("\r\n") + "\r\n";
}
/* DATEV-Buchungsstapel (vereinfacht, EXTF-Kopf + Standardspalten): Umsatz; Soll/Haben; Konto 1200 Forderungen gegen Erlöskonto 8400/8200 */
const datevZeile = (felder) => felder.map((v) => (typeof v === "number" ? String(v) : '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"')).join(";");
function exportDatev(belege, von, bis) {
  const kopf = datevZeile(["EXTF", 700, 21, "Buchungsstapel", 12, new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 17), "", "FW", "", "", "", "", (von || "").replace(/-/g, ""), 4, (von || "").replace(/-/g, ""), (bis || "").replace(/-/g, ""), "Rechnungen", "", 1, 0, 0, "EUR"]);
  const spalten = datevZeile(["Umsatz (ohne Soll/Haben-Kz)", "Soll/Haben-Kennzeichen", "WKZ Umsatz", "Kurs", "Basis-Umsatz", "WKZ Basis-Umsatz", "Konto", "Gegenkonto (ohne BU-Schlüssel)", "BU-Schlüssel", "Belegdatum", "Belegfeld 1", "Belegfeld 2", "Skonto", "Buchungstext"]);
  const zeilen = [];
  for (const b of belege.filter((x) => (x.art === "rechnung" || x.art === "storno") && istFestgeschrieben(x))) {
    const s = berechne(b, b.steuer.satz); const d = b.datum.split("-");
    zeilen.push(datevZeile([dez(Math.abs(s.gesamt)), s.gesamt >= 0 ? "S" : "H", "EUR", "", "", "", 1200, s.steuerProzent === 19 ? 8400 : 8195, "", d[2] + d[1], b.nummer, "", "", `${ARTEN[b.art].titel} ${b.nummer} ${b.kunde.name}`.slice(0, 60)]));
  }
  return [kopf, spalten, ...zeilen].join("\r\n") + "\r\n";
}
/* ZUGFeRD/XRechnung (EN 16931): strukturierte Daten vorbereitet – XML-Erzeugung folgt, wenn der Schalter aktiv wird */
function eRechnungDaten(b) {
  const s = berechne(b, b.steuer.satz);
  return { profil: "EN16931", id: b.nummer, typ: b.art === "storno" ? "384" : "380", datum: b.datum, waehrung: "EUR", verkaeufer: { name: b.firma.name, strasse: b.firma.strasse, plz: b.firma.plz, ort: b.firma.ort, land: "DE", ustIdNr: b.firma.ustIdNr, email: b.firma.email }, kaeufer: { name: b.kunde.name, strasse: b.kunde.strasse, plz: b.kunde.plz, ort: b.kunde.ort, land: "DE", email: b.kunde.email }, zahlung: { iban: b.firma.iban, bic: b.firma.bic, faellig: b.faelligAm, verwendungszweck: b.nummer }, positionen: s.positionen.map((p) => ({ pos: p.pos, name: p.beschreibung, menge: p.menge, einheit: p.einheit, einzelpreisSumme: p.einzelpreis / 100, gesamtSumme: p.gesamt / 100, steuersatz: s.steuerProzent, steuerKategorie: s.steuerProzent ? "S" : "E", befreiungsgrund: s.steuerProzent ? null : "§ 19 UStG" })), summen: { summe: s.summe / 100, steuer: s.steuer / 100, gesamt: s.gesamt / 100, anzahlung: s.anzahlungGesamt / 100, zahlbetrag: s.zahlbetrag / 100 } };
}

module.exports = { ARTEN, EINHEITEN, STATUS_LABEL, RECHNUNGSTYPEN, rund, cent, euro, heute, datumDe, plusTage, id, berechne, anzahlungPositionen, validiere, firmaSnapshot, steuerSnapshot, muster, nummerMuster, nummerFormat, nummerVergeben, nummerStartZulaessig, neuerBeleg, ausAnfrage, abAusAngebot, rechnungAusAb, stornoAus, istFestgeschrieben, pruefeAenderbar, hashFuer, journal, zahlungsstatus, gezahlt, kundeId, kundeSchluessel, exportCsv, exportDatev, eRechnungDaten };
