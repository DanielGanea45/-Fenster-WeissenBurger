/* Netlify Function: Angebote, Auftragsbestätigungen, Rechnungen, Stornorechnungen, Kunden, Export.
   Nur für angemeldete Admins (Sitzung), POST zusätzlich CSRF + Origin; Rate-Limit. Alle Summen werden hier berechnet,
   Browserwerte werden nie übernommen. GoBD: festgeschriebene Belege sind unveränderlich, nichts wird gelöscht.
   GET  ?aktion=liste|beleg&id|kunden|kunde&id|kpis|pdf&id|export&format=csv|datev|zip&von&bis
   POST { aktion: anlegen|speichern|status|ab-erstellen|rechnung-erstellen|festschreiben|stornieren|zahlung|senden|kunde-speichern } */
"use strict";
const store = require("./_lib/store");
const http = require("./_lib/http");
const daten = require("./_lib/daten");
const mail = require("./_lib/mail");
const B = require("./_lib/belege");
const PDF = require("./_lib/pdf");
const Steuer = require("../../js/steuer.js");

exports.handler = async (event) => {
  http.verbinde(event);
  if (!http.adminEnabled()) return http.notFound();
  const rl = await http.rateLimit(event, "belege", 180);
  if (!rl.ok) return rl.response;
  const q = event.queryStringParameters || {};
  try {
    if (event.httpMethod === "GET") {
      const s = await http.requireSession(event);
      if (!s.ok) return s.response;
      return await lesen(q, s, event);
    }
    if (event.httpMethod !== "POST") return http.json(405, { ok: false, error: "Methode nicht erlaubt." });
    const body = http.parseBody(event);
    if (!body) return http.json(400, { ok: false, error: "Ungültige Anfrage (JSON)." });
    const s = await http.requireSession(event, { write: true });
    if (!s.ok) return s.response;
    return await schreiben(body, s, event);
  } catch (e) {
    if (e && e.code === 409) return http.json(409, { ok: false, error: e.message });
    if (e && e.code === 422) return http.json(422, { ok: false, error: e.message, fehler: e.fehler || [] });
    console.error(e);
    return http.json(500, { ok: false, error: e.name === "StoreNichtVerfuegbar" ? e.message : "Interner Fehler: " + e.message });
  }
};

/* ---------- Hilfen ---------- */
const sid = (x) => String(x || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 60);
async function ladeBeleg(id) { const b = await store.getJSON("belege/" + sid(id), null); if (!b) throw Object.assign(new Error("Beleg nicht gefunden."), { code: 409 }); return b; }
async function speichereBeleg(b) { b.geaendert = Date.now(); await store.setJSON("belege/" + b.id, b); return b; }
async function alleBelege() { const keys = await store.list("belege/"); const out = []; for (const k of keys) { const b = await store.getJSON(k, null); if (b) out.push(b); } return out; }
function kurz(b) {
  const s = B.berechne(b, b.steuer.satz);
  return { id: b.id, art: b.art, nummer: b.nummer, status: b.art === "rechnung" ? B.zahlungsstatus(b) : b.status, datum: b.datum, faelligAm: b.faelligAm || null, gueltigBis: b.gueltigBis || null, kunde: b.kunde.name, kundeId: b.kundeId, betreff: b.betreff, gesamt: s.gesamt, summe: s.summe, zahlbetrag: s.zahlbetrag, gezahlt: B.gezahlt(b), festgeschrieben: B.istFestgeschrieben(b), gesendet: b.gesendet ? b.gesendet.wann : null, bezug: b.bezug || {}, rechnungstyp: b.rechnungstyp || null, erstellt: b.erstellt, geaendert: b.geaendert, steuerSatz: b.steuer.satz };
}
function sicherKunde(k) { k = k || {}; const s = (x, n) => String(x == null ? "" : x).trim().slice(0, n || 120); return { anrede: ["Herrn", "Frau", ""].includes(k.anrede) ? k.anrede : "", name: s(k.name), firma: s(k.firma), strasse: s(k.strasse), plz: s(k.plz, 5), ort: s(k.ort), email: s(k.email), telefon: s(k.telefon, 40) }; }
function sicherPositionen(liste) {
  return (Array.isArray(liste) ? liste : []).slice(0, 200).map((p) => ({ beschreibung: String(p.beschreibung || "").trim().slice(0, 300), details: String(p.details || "").trim().slice(0, 600), menge: Number(String(p.menge).replace(",", ".")) || 0, einheit: String(p.einheit || "Stk."), einzelpreis: Math.round(Number(p.einzelpreis) || 0), art: p.art === "arbeit" ? "arbeit" : "ware", bild: p.bild && typeof p.bild === "string" ? p.bild.slice(0, 200) : null }));
}
function uebernehmeEntwurf(b, d) {
  const str = (x, n) => String(x == null ? "" : x).trim().slice(0, n || 2000);
  if (d.kunde) b.kunde = sicherKunde(d.kunde);
  if (d.positionen) b.positionen = sicherPositionen(d.positionen);
  if (d.rabatt) b.rabatt = { prozent: Number(d.rabatt.prozent) || 0, betrag: Math.round(Number(d.rabatt.betrag) || 0) };
  for (const f of ["betreff", "einleitung", "schluss"]) if (d[f] !== undefined) b[f] = str(d[f], f === "betreff" ? 160 : 2000);
  for (const f of ["datum", "leistungsdatum", "leistungsende", "gueltigBis", "liefertermin", "faelligAm"]) if (d[f] !== undefined) b[f] = /^\d{4}-\d{2}-\d{2}$/.test(String(d[f])) ? String(d[f]) : "";
  if (d.bild !== undefined) b.bild = d.bild ? String(d.bild).slice(0, 200) : null;
  if (d.bildImAngebot !== undefined) b.bildImAngebot = !!d.bildImAngebot;
}
function pruefeOderWerfe(b) { const f = B.validiere(b); if (f.length) throw Object.assign(new Error("Bitte die markierten Felder prüfen."), { code: 422, fehler: f }); }
async function kundeAblegen(b, wer) {
  const k = b.kunde; if (!k || !k.name) return null;
  const schl = B.kundeSchluessel(k);
  const idx = await store.getJSON("kunden-index", {});
  let kid = idx[schl];
  let kunde = kid ? await store.getJSON("kunden/" + kid, null) : null;
  if (!kunde) { kid = B.kundeId(); kunde = { id: kid, erstellt: Date.now(), quelle: (b.quelle && b.quelle.anfrageId) ? "Anfrage " + b.quelle.anfrageId : "Beleg", notizen: "" }; idx[schl] = kid; await store.setJSON("kunden-index", idx); }
  Object.assign(kunde, { anrede: k.anrede, name: k.name, firma: k.firma, strasse: k.strasse, plz: k.plz, ort: k.ort, email: k.email, telefon: k.telefon, geaendert: Date.now() });
  await store.setJSON("kunden/" + kid, kunde);
  b.kundeId = kid; return kid;
}
async function pdfFuer(b, einst) {
  if (B.istFestgeschrieben(b)) { const pdf = await store.getBinary("belege-pdf/" + b.id); if (pdf) return pdf; }
  const m = B.muster(einst || (await daten.lade("einstellungen")));
  return PDF.erzeuge(b, { muster: m.muster || !b.nummer });
}
function dateiname(b) { return `${B.ARTEN[b.art].titel.replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue")}_${b.nummer || "Entwurf-" + b.id}.pdf`; }

/* ============================ Lesen ============================ */
async function lesen(q, s, event) {
  switch (q.aktion) {
    case "liste": {
      const einst = await daten.lade("einstellungen");
      let liste = (await alleBelege()).map(kurz);
      const art = sid(q.art), status = sid(q.status), suche = String(q.suche || "").trim().toLowerCase();
      if (art && art !== "alle") liste = liste.filter((b) => b.art === art);
      if (status === "offen") liste = liste.filter((b) => ["offen", "teilweise", "ueberfaellig"].includes(b.status));
      else if (status && status !== "alle") liste = liste.filter((b) => b.status === status);
      if (q.kundeId) liste = liste.filter((b) => b.kundeId === sid(q.kundeId));
      if (suche) liste = liste.filter((b) => [b.nummer, b.kunde, b.betreff].some((x) => String(x || "").toLowerCase().includes(suche)));
      const sort = String(q.sort || "datum"), richtung = q.richtung === "auf" ? 1 : -1;
      liste.sort((a, b) => { const va = a[sort] != null ? a[sort] : "", vb = b[sort] != null ? b[sort] : ""; return (va > vb ? 1 : va < vb ? -1 : (b.erstellt - a.erstellt)) * richtung; });
      const seite = Math.max(1, Number(q.seite) || 1), proSeite = Math.min(100, Math.max(10, Number(q.proSeite) || 25));
      return http.json(200, { ok: true, gesamt: liste.length, seite, proSeite, belege: liste.slice((seite - 1) * proSeite, seite * proSeite), muster: B.muster(einst) });
    }
    case "beleg": {
      const b = await ladeBeleg(q.id);
      const einst = await daten.lade("einstellungen");
      const kette = {};
      for (const [k, key] of [["angebot", "angebotId"], ["ab", "abId"], ["rechnung", "rechnungId"]]) if (b.bezug && b.bezug[key]) { const x = await store.getJSON("belege/" + sid(b.bezug[key]), null); if (x) kette[k] = kurz(x); }
      const folge = (await alleBelege()).filter((x) => x.bezug && (x.bezug.angebotId === b.id || x.bezug.abId === b.id || x.bezug.rechnungId === b.id)).map(kurz);
      return http.json(200, { ok: true, beleg: b, summen: B.berechne(b, b.steuer.satz), kette, folge, muster: B.muster(einst), einheiten: B.EINHEITEN, aenderbar: !B.istFestgeschrieben(b) });
    }
    case "kpis": {
      const alle = await alleBelege(); const jetzt = new Date(); const jahr = jetzt.toISOString().slice(0, 4), monat = jetzt.toISOString().slice(0, 7);
      let offen = 0, ueberfaellig = 0, umsatzMonat = 0, umsatzJahr = 0, entwuerfe = 0, angeboteOffen = 0;
      for (const b of alle) {
        const s = B.berechne(b, b.steuer.satz);
        if (b.status === "entwurf") entwuerfe++;
        if (b.art === "angebot" && b.status === "gesendet") angeboteOffen++;
        if (b.art === "rechnung" && B.istFestgeschrieben(b)) {
          const st = B.zahlungsstatus(b); const rest = s.zahlbetrag - B.gezahlt(b);
          if (["offen", "teilweise", "ueberfaellig"].includes(st)) { offen += rest; if (st === "ueberfaellig") ueberfaellig += rest; }
          // Umsatz: Rechnung zählt positiv, die Stornorechnung (unten) negativ – stornierte Vorgänge heben sich so auf
          if (b.datum.startsWith(monat)) umsatzMonat += s.summe; if (b.datum.startsWith(jahr)) umsatzJahr += s.summe;
        }
        if (b.art === "storno" && b.datum.startsWith(jahr)) { umsatzJahr += s.summe; if (b.datum.startsWith(monat)) umsatzMonat += s.summe; }
      }
      return http.json(200, { ok: true, kpis: { offen, ueberfaellig, umsatzMonat, umsatzJahr, entwuerfe, angeboteOffen, gesamt: alle.length } });
    }
    case "kunden": {
      const keys = await store.list("kunden/"); const liste = [];
      const belege = (await alleBelege()).map(kurz);
      for (const k of keys) { const ku = await store.getJSON(k, null); if (!ku) continue; const eigene = belege.filter((b) => b.kundeId === ku.id); liste.push(Object.assign({}, ku, { belege: eigene.length, umsatz: eigene.filter((b) => b.art === "rechnung" && b.festgeschrieben).reduce((a, b) => a + b.gesamt, 0), letzter: eigene.map((b) => b.datum).sort().pop() || "" })); }
      const suche = String(q.suche || "").trim().toLowerCase();
      const out = suche ? liste.filter((k) => [k.name, k.firma, k.ort, k.email].some((x) => String(x || "").toLowerCase().includes(suche))) : liste;
      out.sort((a, b) => String(b.letzter || "").localeCompare(String(a.letzter || "")) || b.erstellt - a.erstellt);
      return http.json(200, { ok: true, kunden: out });
    }
    case "kunde": {
      const ku = await store.getJSON("kunden/" + sid(q.id), null); if (!ku) return http.json(404, { ok: false, error: "Kunde nicht gefunden." });
      const belege = (await alleBelege()).filter((b) => b.kundeId === ku.id).map(kurz).sort((a, b) => b.erstellt - a.erstellt);
      return http.json(200, { ok: true, kunde: ku, belege });
    }
    case "pdf": {
      const b = await ladeBeleg(q.id);
      const pdf = await pdfFuer(b);
      return { statusCode: 200, headers: Object.assign({ "Content-Type": "application/pdf", "Content-Disposition": `${q.download ? "attachment" : "inline"}; filename="${dateiname(b)}"`, "X-Robots-Tag": "noindex" }, http.NO_STORE), body: pdf.toString("base64"), isBase64Encoded: true };
    }
    case "export": {
      const von = /^\d{4}-\d{2}-\d{2}$/.test(String(q.von)) ? q.von : "0000-01-01", bis = /^\d{4}-\d{2}-\d{2}$/.test(String(q.bis)) ? q.bis : "9999-12-31";
      const alle = (await alleBelege()).filter((b) => b.datum >= von && b.datum <= bis && b.nummer).sort((a, b) => a.datum.localeCompare(b.datum) || String(a.nummer).localeCompare(String(b.nummer)));
      const format = sid(q.format) || "csv";
      if (format === "datev") return { statusCode: 200, headers: Object.assign({ "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="DATEV_Buchungsstapel_${von}_${bis}.csv"` }, http.NO_STORE), body: B.exportDatev(alle.filter((b) => b.art === "rechnung" || b.art === "storno"), von, bis) };
      if (format === "zip") {
        const JSZip = require("jszip"); const zip = new JSZip();
        const rechnungen = alle.filter((b) => (b.art === "rechnung" || b.art === "storno") && B.istFestgeschrieben(b));
        zip.file(`Rechnungen_${von}_${bis}.csv`, B.exportCsv(rechnungen));
        for (const b of rechnungen) { const pdf = await pdfFuer(b); zip.file(dateiname(b), pdf); }
        zip.file("INDEX.json", JSON.stringify(rechnungen.map((b) => ({ nummer: b.nummer, art: b.art, datum: b.datum, hash: b.festgeschrieben.hash, datei: dateiname(b) })), null, 1));
        const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
        return { statusCode: 200, headers: Object.assign({ "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="Rechnungen_${von}_${bis}.zip"` }, http.NO_STORE), body: buf.toString("base64"), isBase64Encoded: true };
      }
      return { statusCode: 200, headers: Object.assign({ "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="Belege_${von}_${bis}.csv"` }, http.NO_STORE), body: B.exportCsv(alle) };
    }
    default: return http.json(400, { ok: false, error: "Unbekannte Aktion." });
  }
}

/* ============================ Schreiben ============================ */
async function schreiben(body, s, event) {
  const wer = (s.account && s.account.email) || "";
  const log = (typ, text) => http.protokoll(event, typ, text, wer);
  const einst = await daten.lade("einstellungen");
  switch (body.aktion) {
    case "anlegen": {
      let basis = {};
      if (body.anfrageId) { const a = await store.getJSON("anfragen/" + sid(body.anfrageId), null); if (!a) return http.json(404, { ok: false, error: "Anfrage nicht gefunden." }); basis = B.ausAnfrage(a, einst); }
      if (body.kundeId) { const ku = await store.getJSON("kunden/" + sid(body.kundeId), null); if (ku) { basis.kundeId = ku.id; basis.kunde = sicherKunde(ku); } }
      const b = B.neuerBeleg("angebot", einst, basis);
      if (body.daten) uebernehmeEntwurf(b, body.daten);
      b.nummer = await B.nummerVergeben("angebot", einst, b.datum);
      await kundeAblegen(b, wer);
      B.journal(b, wer, "angelegt", basis.quelle ? "aus Anfrage " + basis.quelle.anfrageId : "manuell");
      await speichereBeleg(b);
      await log("beleg", `Angebot ${b.nummer} angelegt`);
      return http.json(200, { ok: true, beleg: b, summen: B.berechne(b, b.steuer.satz) });
    }
    case "speichern": {
      const b = await ladeBeleg(body.id); B.pruefeAenderbar(b);
      if (b.art === "rechnung" && b.status !== "entwurf") throw Object.assign(new Error("Diese Rechnung ist kein Entwurf mehr."), { code: 409 });
      uebernehmeEntwurf(b, body.daten || {});
      if (!body.nurEntwurf) pruefeOderWerfe(b);
      await kundeAblegen(b, wer);
      B.journal(b, wer, "gespeichert", body.notiz || "");
      await speichereBeleg(b);
      return http.json(200, { ok: true, beleg: b, summen: B.berechne(b, b.steuer.satz), fehler: B.validiere(b) });
    }
    case "status": {
      const b = await ladeBeleg(body.id);
      const neu = sid(body.status);
      if (!B.ARTEN[b.art].status.includes(neu)) return http.json(400, { ok: false, error: "Ungültiger Status." });
      if (b.art === "rechnung" && ["offen", "teilweise", "bezahlt", "ueberfaellig", "storniert"].includes(neu)) return http.json(400, { ok: false, error: "Der Rechnungsstatus ergibt sich aus Festschreibung, Zahlungen und Storno." });
      if (B.istFestgeschrieben(b) && b.art !== "angebot" && b.art !== "ab") B.pruefeAenderbar(b);
      B.journal(b, wer, "status", `${B.STATUS_LABEL[b.status]} → ${B.STATUS_LABEL[neu]}`); b.status = neu;
      await speichereBeleg(b); await log("beleg", `${B.ARTEN[b.art].titel} ${b.nummer}: ${B.STATUS_LABEL[neu]}`);
      return http.json(200, { ok: true, beleg: b });
    }
    case "ab-erstellen": {
      const a = await ladeBeleg(body.id); if (a.art !== "angebot") return http.json(400, { ok: false, error: "Nur aus einem Angebot." });
      pruefeOderWerfe(a);
      const b = B.abAusAngebot(a, einst); if (body.liefertermin && /^\d{4}-\d{2}-\d{2}$/.test(body.liefertermin)) b.liefertermin = body.liefertermin;
      b.nummer = await B.nummerVergeben("ab", einst, b.datum);
      B.journal(b, wer, "angelegt", "aus Angebot " + a.nummer); await kundeAblegen(b, wer); await speichereBeleg(b);
      if (a.status !== "angenommen") { B.journal(a, wer, "status", `${B.STATUS_LABEL[a.status]} → Angenommen`); a.status = "angenommen"; } a.bezug = Object.assign({}, a.bezug, { abId: b.id, abNummer: b.nummer }); await speichereBeleg(a);
      await log("beleg", `AB ${b.nummer} aus Angebot ${a.nummer}`);
      return http.json(200, { ok: true, beleg: b });
    }
    case "rechnung-erstellen": {
      const ab = await ladeBeleg(body.id); if (ab.art !== "ab") return http.json(400, { ok: false, error: "Nur aus einer Auftragsbestätigung." });
      pruefeOderWerfe(ab);
      const typ = B.RECHNUNGSTYPEN.includes(body.typ) ? body.typ : "voll";
      let anz = null;
      if (typ === "schluss") { const alle = await alleBelege(); anz = alle.find((x) => x.art === "rechnung" && x.rechnungstyp === "anzahlung" && x.bezug && x.bezug.abId === ab.id && B.istFestgeschrieben(x) && x.status !== "storniert") || null; if (!anz) return http.json(409, { ok: false, error: "Für eine Schlussrechnung muss zuerst eine festgeschriebene Anzahlungsrechnung vorliegen." }); }
      if (typ === "anzahlung" && !(Number((einst.bank || {}).anzahlungProzent) > 0)) return http.json(409, { ok: false, error: "Anzahlung ist in den Einstellungen (Bank & Zahlung) nicht gesetzt." });
      const b = B.rechnungAusAb(ab, einst, typ, anz);
      if (body.leistungsdatum && /^\d{4}-\d{2}-\d{2}$/.test(body.leistungsdatum)) b.leistungsdatum = body.leistungsdatum;
      B.journal(b, wer, "angelegt", `aus AB ${ab.nummer} (${typ})`); await kundeAblegen(b, wer); await speichereBeleg(b);
      ab.bezug = Object.assign({}, ab.bezug, { rechnungId: b.id }); if (typ !== "anzahlung" && ab.status !== "erledigt") { ab.status = "erledigt"; } await speichereBeleg(ab);
      await log("beleg", `Rechnung (${typ}) aus AB ${ab.nummer} angelegt`);
      return http.json(200, { ok: true, beleg: b });
    }
    case "festschreiben": {
      const b = await ladeBeleg(body.id);
      if (b.art !== "rechnung") return http.json(400, { ok: false, error: "Festgeschrieben werden Rechnungen." });
      if (B.istFestgeschrieben(b)) return http.json(409, { ok: false, error: "Diese Rechnung ist bereits festgeschrieben." });
      pruefeOderWerfe(b);
      const m = B.muster(einst); if (m.muster) return http.json(409, { ok: false, error: "Festschreiben nicht möglich – in den Einstellungen fehlen: " + m.fehlt.join(", ") + ". Bis dahin erscheinen Dokumente als MUSTER." });
      if (!b.leistungsdatum) b.leistungsdatum = b.datum;
      b.nummer = await B.nummerVergeben("rechnung", einst, b.datum);
      b.firma = B.firmaSnapshot(einst); b.faelligAm = b.faelligAm || B.plusTage(b.datum, (einst.bank || {}).zahlungszielTage || 14);
      const pdf = await PDF.erzeuge(b, { muster: false });
      const hash = B.hashFuer(b, pdf);
      await store.setBinary("belege-pdf/" + b.id, pdf, "application/pdf");
      b.festgeschrieben = { wann: Date.now(), wer, hash, pdfBytes: pdf.length, verfahren: "SHA-256 über PDF + Belegdaten" };
      b.status = "offen"; B.journal(b, wer, "festgeschrieben", `Nummer ${b.nummer}, Hash ${hash.slice(0, 16)}…`);
      await speichereBeleg(b); await log("beleg", `Rechnung ${b.nummer} festgeschrieben`);
      return http.json(200, { ok: true, beleg: b });
    }
    case "stornieren": {
      const r = await ladeBeleg(body.id);
      if (r.art !== "rechnung" || !B.istFestgeschrieben(r)) return http.json(409, { ok: false, error: "Nur festgeschriebene Rechnungen können storniert werden; Entwürfe werden einfach nicht festgeschrieben." });
      if (r.status === "storniert") return http.json(409, { ok: false, error: "Diese Rechnung ist bereits storniert." });
      const st = B.stornoAus(r, einst, String(body.grund || "").slice(0, 300));
      st.nummer = await B.nummerVergeben("storno", einst, st.datum);
      const pdf = await PDF.erzeuge(st, { muster: false }); const hash = B.hashFuer(st, pdf);
      await store.setBinary("belege-pdf/" + st.id, pdf, "application/pdf");
      st.festgeschrieben = { wann: Date.now(), wer, hash, pdfBytes: pdf.length, verfahren: "SHA-256 über PDF + Belegdaten" }; st.status = "festgeschrieben";
      B.journal(st, wer, "festgeschrieben", `Storno zu ${r.nummer}`); await speichereBeleg(st);
      r.status = "storniert"; r.bezug = Object.assign({}, r.bezug, { stornoId: st.id, stornoNummer: st.nummer }); B.journal(r, wer, "storniert", `durch ${st.nummer}${body.grund ? " – " + body.grund : ""}`); await speichereBeleg(r);
      await log("beleg", `Rechnung ${r.nummer} storniert durch ${st.nummer}`);
      return http.json(200, { ok: true, storno: st, rechnung: r });
    }
    case "zahlung": {
      const b = await ladeBeleg(body.id);
      if (b.art !== "rechnung" || !B.istFestgeschrieben(b)) return http.json(409, { ok: false, error: "Zahlungen nur auf festgeschriebene Rechnungen." });
      const betrag = Math.round(Number(body.betrag)); const datum = /^\d{4}-\d{2}-\d{2}$/.test(String(body.datum)) ? body.datum : B.heute();
      if (!(betrag > 0)) return http.json(400, { ok: false, error: "Betrag in Cent, größer 0." });
      b.zahlungen = b.zahlungen || []; b.zahlungen.push({ datum, betrag, wer, erfasst: Date.now(), notiz: String(body.notiz || "").slice(0, 200) });
      b.status = B.zahlungsstatus(b); B.journal(b, wer, "zahlung", `${B.euro(betrag)} am ${B.datumDe(datum)} → ${B.STATUS_LABEL[b.status]}`);
      await speichereBeleg(b); await log("beleg", `Zahlung ${B.euro(betrag)} zu ${b.nummer}`);
      return http.json(200, { ok: true, beleg: b });
    }
    case "senden": {
      const b = await ladeBeleg(body.id);
      const m = B.muster(einst); if (m.muster) return http.json(409, { ok: false, error: "Senden nicht möglich – in den Einstellungen fehlen: " + m.fehlt.join(", ") + "." });
      if (b.art === "rechnung" && !B.istFestgeschrieben(b)) return http.json(409, { ok: false, error: "Bitte die Rechnung zuerst festschreiben." });
      pruefeOderWerfe(b);
      const an = String(body.an || b.kunde.email || "").trim(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(an)) return http.json(400, { ok: false, error: "E-Mail-Adresse des Empfängers fehlt." });
      const pdf = await pdfFuer(b, einst);
      const betreff = String(body.betreff || `${B.ARTEN[b.art].titel} ${b.nummer} – ${b.firma.kurzname}`).slice(0, 160);
      const text = String(body.text || `Guten Tag ${b.kunde.name},\n\nanbei erhalten Sie ${B.ARTEN[b.art].titel === "Angebot" ? "unser Angebot" : B.ARTEN[b.art].titel === "Rechnung" ? "unsere Rechnung" : "unsere " + B.ARTEN[b.art].titel} ${b.nummer} als PDF.\n\nMit freundlichen Grüßen\n${b.firma.geschaeftsfuehrer}\n${b.firma.name}\n${b.firma.telefon} · ${b.firma.email}`).slice(0, 5000);
      const r = await mail.send({ to: an, subject: betreff, text, cc: body.cc ? (einst.email && einst.email.anfragen) || b.firma.email : undefined, replyTo: b.firma.email, absenderName: (einst.email && einst.email.absenderName) || b.firma.kurzname, anhaenge: [{ name: dateiname(b), inhalt: pdf }] });
      if (!r.ok && !r.skipped) return http.json(502, { ok: false, error: "E-Mail konnte nicht gesendet werden: " + (r.error || "") });
      b.gesendet = { wann: Date.now(), an, wer, betreff, uebersprungen: !!r.skipped };
      if (b.status === "entwurf" || (b.art === "angebot" && b.status === "entwurf")) b.status = b.art === "rechnung" ? b.status : "gesendet";
      if (b.art === "angebot" || b.art === "ab") b.status = b.status === "entwurf" ? "gesendet" : b.status;
      B.journal(b, wer, "gesendet", `an ${an}${r.skipped ? " (E-Mail-Versand nicht eingerichtet – nur protokolliert)" : ""}`);
      await speichereBeleg(b); await log("beleg", `${B.ARTEN[b.art].titel} ${b.nummer} an ${an} gesendet`);
      return http.json(200, { ok: true, beleg: b, uebersprungen: !!r.skipped });
    }
    case "kunde-speichern": {
      const k = sicherKunde(body.kunde); if (!k.name) return http.json(422, { ok: false, error: "Name fehlt." });
      let ku = body.id ? await store.getJSON("kunden/" + sid(body.id), null) : null;
      if (!ku) { ku = { id: B.kundeId(), erstellt: Date.now(), quelle: "manuell", notizen: "" }; const idx = await store.getJSON("kunden-index", {}); idx[B.kundeSchluessel(k)] = ku.id; await store.setJSON("kunden-index", idx); }
      Object.assign(ku, k, { notizen: String(body.kunde && body.kunde.notizen || ku.notizen || "").slice(0, 2000), geaendert: Date.now() });
      await store.setJSON("kunden/" + ku.id, ku);
      return http.json(200, { ok: true, kunde: ku });
    }
    default: return http.json(400, { ok: false, error: "Unbekannte Aktion." });
  }
}
