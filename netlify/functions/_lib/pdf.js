/* PDF-Erzeugung für Belege (pdfkit, A4) nach dem freigegebenen Design (design-belege/): weißer Hintergrund, blaues
   Logo, DIN-5008-Anschriftfeld, Positionstabelle mit dunklem Kopf, Summen, blaue Gesamtbetrag-Zeile, Fußzeile mit
   Firmen- und Bankdaten, dezentes Wasserzeichen; „MUSTER – nicht gültig“, solange Bank-/Dokumentdaten fehlen.
   Schrift Manrope (aus assets/fonts, als TTF eingebettet). Alle Texte deutsch; Steuertexte aus js/steuer.js (Snapshot). */
"use strict";
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const B = require("./belege");

const FONT = path.join(__dirname, "fonts", "manrope.ttf");
const C = { ink: "#1b2430", ink2: "#4f5b68", line: "#d6dfe8", accent: "#0B5ED7", white: "#ffffff", rot: "#c0392b" };
const S = 0.75; // Design 794 px → 595 pt
const M = { l: 56 * S, r: 56 * S, t: 44 * S };
const W = 595.28, H = 841.89, INNEN = W - M.l - M.r;

function fmtDatum(iso) { return B.datumDe(iso); }
function fett(doc, text, x, y, opt) { opt = opt || {}; doc.save(); doc.lineWidth(opt.staerke || 0.45).strokeColor(opt.color || C.ink).fillColor(opt.color || C.ink); doc.text(text, x, y, Object.assign({}, opt, { fill: true, stroke: true })); doc.restore(); }
function normal(doc, text, x, y, opt) { opt = opt || {}; doc.fillColor(opt.color || C.ink).text(text, x, y, opt); }

function logo(doc, x, y, h) {
  const k = h / 56;
  doc.save().translate(x, y).scale(k);
  doc.polygon([16, 7], [44, 1], [44, 43], [16, 47]).fill(C.accent);
  doc.polygon([5, 9], [31, 15], [31, 53], [5, 49]).lineWidth(2.8).stroke(C.ink);
  doc.restore();
}
function wasserzeichen(doc, text, muster) {
  doc.save();
  doc.rotate(-32, { origin: [W / 2, H / 2] });
  doc.fontSize(72 * S); let tw = doc.widthOfString(text);
  doc.fillColor(C.accent).opacity(0.05).text(text, (W - tw) / 2, H / 2 - 36 * S, { lineBreak: false });
  if (muster) { doc.fontSize(44); tw = doc.widthOfString("MUSTER – nicht gültig"); doc.opacity(0.16).fillColor(C.rot).text("MUSTER – nicht gültig", (W - tw) / 2, H / 2 + 40, { lineBreak: false }); }
  doc.restore(); doc.opacity(1);
}
function kopf(doc, b) {
  logo(doc, M.l, M.t - 2, 47 * S);
  doc.font("M").fontSize(20 * S);
  fett(doc, b.firma.kurzname || "Fenster-WeissenBurger", M.l + 52 * S, M.t + 4, { lineBreak: false, staerke: 0.6 });
  doc.fontSize(12.5 * S);
  normal(doc, "Fenster & Türen · " + (b.firma.ort || ""), M.l + 52 * S, M.t + 28 * S, { color: C.ink2, lineBreak: false });
  doc.fontSize(12 * S);
  const rechts = [b.firma.strasse, `${b.firma.plz} ${b.firma.ort}`, "Tel. " + b.firma.telefon, b.firma.email].filter(Boolean);
  rechts.forEach((z, i) => normal(doc, z, M.l, M.t + i * 15 * S, { width: INNEN, align: "right", color: C.ink2, lineBreak: false }));
  doc.rect(M.l, M.t + 68 * S, INNEN, 3 * S).fill(C.accent);
}
function anschrift(doc, b, y) {
  doc.fontSize(10.5 * S).fillColor(C.ink2);
  const absender = `${b.firma.kurzname} UG · ${b.firma.strasse} · ${b.firma.plz} ${b.firma.ort}`;
  doc.text(absender, M.l, y, { width: 390 * S, underline: true, lineBreak: false });
  doc.fontSize(14 * S).fillColor(C.ink);
  const k = b.kunde; const zeilen = [k.anrede, k.firma, k.name, k.strasse, `${k.plz} ${k.ort}`].filter(Boolean);
  zeilen.forEach((z, i) => doc.text(z, M.l, y + 26 * S + i * 17 * S, { width: 330 * S, lineBreak: false }));
}
function metaBlock(doc, b, y, s) {
  const art = B.ARTEN[b.art]; const x = M.l + 400 * S, w = INNEN - 400 * S;
  doc.save().roundedRect(x, y - 2, doc.widthOfString(art.badge, { characterSpacing: 0.5 }) * 0.9 + 22, 16, 8).fill("#e3edff").restore();
  doc.fontSize(10.5 * S); fett(doc, art.badge, x + 10, y + 1, { color: C.accent, characterSpacing: 0.5, lineBreak: false });
  doc.fontSize(30 * S); fett(doc, art.titel, x, y + 22 * S, { staerke: 0.7, lineBreak: false });
  const rows = [];
  rows.push([art.titel.replace("Auftragsbestätigung", "AB") + "s-Nr.", b.nummer || "– Entwurf –"]);
  rows.push([b.art === "rechnung" || b.art === "storno" ? "Rechnungsdatum" : "Datum", fmtDatum(b.datum)]);
  if (b.leistungsdatum) rows.push([b.leistungsende ? "Leistungszeitraum" : "Leistungsdatum", b.leistungsende ? `${fmtDatum(b.leistungsdatum)} – ${fmtDatum(b.leistungsende)}` : fmtDatum(b.leistungsdatum)]);
  if (b.kundeId) rows.push(["Kunden-Nr.", b.kundeId]);
  if (b.art === "angebot" && b.gueltigBis) rows.push(["Gültig bis", fmtDatum(b.gueltigBis)]);
  if (b.art === "ab" && b.liefertermin) rows.push(["Liefertermin (ca.)", fmtDatum(b.liefertermin)]);
  if (b.bezug && (b.bezug.abNummer || b.bezug.angebotNummer || b.bezug.rechnungNummer)) rows.push(["Bezug", b.bezug.rechnungNummer || b.bezug.abNummer || b.bezug.angebotNummer]);
  if (b.art === "rechnung" && b.faelligAm) rows.push(["Zahlbar bis", fmtDatum(b.faelligAm)]);
  doc.fontSize(12.5 * S);
  rows.forEach(([l, v], i) => { const yy = y + 62 * S + i * 17.5 * S; normal(doc, l, x, yy, { color: C.ink2, lineBreak: false }); fett(doc, v, x, yy, { width: w, align: "right", lineBreak: false }); });
  return y + 62 * S + rows.length * 17.5 * S;
}
const SPALTEN = [["Pos.", 40, "left"], ["Bezeichnung", 0, "left"], ["Menge", 56, "right"], ["Einh.", 66, "right"], ["Einzelpreis", 92, "right"], ["Gesamt", 96, "right"]];
function spaltenX() { const fix = SPALTEN.filter((s) => s[1]).reduce((a, s) => a + s[1] * S, 0); const bw = INNEN - fix; let x = M.l; return SPALTEN.map((s) => { const w = s[1] ? s[1] * S : bw; const o = { x, w, align: s[2], name: s[0] }; x += w; return o; }); }
function tabellenKopf(doc, y) {
  doc.rect(M.l, y, INNEN, 24 * S).fill(C.ink);
  doc.fontSize(12.5 * S);
  spaltenX().forEach((c) => fett(doc, c.name, c.x + 6 * S, y + 6.5 * S, { width: c.w - 12 * S, align: c.align, color: C.white, lineBreak: false }));
  return y + 24 * S;
}
function fuss(doc, b, seite, seiten) {
  const y = H - 92 * S; const colX = [M.l, M.l + INNEN * 0.37, M.l + INNEN * 0.68]; const colW = [INNEN * 0.35, INNEN * 0.29, INNEN * 0.32];
  doc.moveTo(M.l, y).lineTo(W - M.r, y).lineWidth(0.5).stroke(C.line);
  doc.fontSize(10.5 * S).fillColor(C.ink2);
  const f = b.firma;
  const sp = [[f.name, f.strasse, `${f.plz} ${f.ort}`, "Geschäftsführer: " + f.geschaeftsfuehrer], [`${f.registergericht}, ${f.registernummer}`, "Umsatzsteuer-ID: " + f.ustIdNr, "Tel. " + f.telefon, f.email], ["Bank: " + (f.bank || "[BANK]"), "IBAN: " + (f.iban || "[IBAN]"), "BIC: " + (f.bic || "[BIC]"), f.web]];
  sp.forEach((z, i) => { z.forEach((t, j) => { if (j === 0 && i === 0) fett(doc, t, colX[i], y + 10 + j * 12, { width: colW[i], color: C.ink2, lineBreak: false }); else normal(doc, t, colX[i], y + 10 + j * 12, { width: colW[i], color: C.ink2, lineBreak: false }); }); });
  if (seiten > 1) normal(doc, `Seite ${seite} von ${seiten}`, M.l, y - 14, { width: INNEN, align: "right", color: C.ink2, lineBreak: false });
}

function erzeuge(beleg, opt) {
  opt = opt || {};
  return new Promise((resolve, reject) => {
    const b = beleg; const s = B.berechne(b, b.steuer.satz);
    const doc = new PDFDocument({ size: "A4", margin: 0, bufferPages: true, info: { Title: `${B.ARTEN[b.art].titel} ${b.nummer || "Entwurf"}`, Author: b.firma.name, Subject: b.betreff, Creator: "Fenster-WeissenBurger Admin" } });
    const chunks = []; doc.on("data", (c) => chunks.push(c)); doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject);
    doc.registerFont("M", fs.existsSync(FONT) ? FONT : "Helvetica");
    doc.font("M");
    const seiteNeu = (erste) => { if (!erste) doc.addPage(); wasserzeichen(doc, b.firma.kurzname || "Fenster-WeissenBurger", opt.muster); kopf(doc, b); };
    seiteNeu(true);
    let y = M.t + 100 * S;
    anschrift(doc, b, y);
    const yMeta = metaBlock(doc, b, y, s);
    y = Math.max(y + 130 * S, yMeta + 20 * S);
    // Betreff + Einleitung
    doc.fontSize(15 * S); fett(doc, b.betreff, M.l, y, { width: INNEN, staerke: 0.5 }); y = doc.y + 6 * S;
    const anrede = b.kunde.anrede === "Frau" ? "Sehr geehrte Frau " : b.kunde.anrede === "Herrn" ? "Sehr geehrter Herr " : "Guten Tag ";
    doc.fontSize(13 * S); const nachname = b.kunde.anrede ? b.kunde.name.split(" ").pop() : b.kunde.name;
    const standard = anrede + nachname + (b.art === "rechnung" ? ", für die ausgeführten Leistungen berechnen wir Ihnen:" : b.art === "ab" ? ", hiermit bestätigen wir Ihren Auftrag mit folgenden Positionen:" : ", vielen Dank für Ihre Anfrage. Gerne unterbreiten wir Ihnen folgendes Angebot:");
    normal(doc, (b.einleitung && b.einleitung.trim()) ? b.einleitung : standard, M.l, y, { width: INNEN }); y = doc.y + 10 * S;
    // Tabelle
    const cols = spaltenX();
    y = tabellenKopf(doc, y);
    const grenze = H - 150 * S;
    for (const p of s.positionen) {
      doc.fontSize(12.5 * S);
      const hBez = doc.heightOfString(p.beschreibung, { width: cols[1].w - 12 * S });
      doc.fontSize(11.5 * S);
      const hDet = p.details ? doc.heightOfString(p.details, { width: cols[1].w - 12 * S }) : 0;
      const hRow = Math.max(hBez + (hDet ? hDet + 2 : 0) + 18 * S, 30 * S);
      if (y + hRow > grenze) { fuss(doc, b, 0, 0); seiteNeu(false); y = M.t + 100 * S; y = tabellenKopf(doc, y); }
      doc.fontSize(12.5 * S);
      normal(doc, String(p.pos), cols[0].x + 6 * S, y + 9 * S, { width: cols[0].w - 12 * S, color: C.accent, lineBreak: false });
      fett(doc, p.beschreibung, cols[1].x + 6 * S, y + 9 * S, { width: cols[1].w - 12 * S });
      if (p.details) { doc.fontSize(11.5 * S); normal(doc, p.details, cols[1].x + 6 * S, y + 9 * S + hBez + 2, { width: cols[1].w - 12 * S, color: C.ink2 }); doc.fontSize(12.5 * S); }
      normal(doc, String(p.menge).replace(".", ","), cols[2].x + 6 * S, y + 9 * S, { width: cols[2].w - 12 * S, align: "right", color: C.accent, lineBreak: false });
      normal(doc, p.einheit, cols[3].x + 6 * S, y + 9 * S, { width: cols[3].w - 12 * S, align: "right", color: C.accent, lineBreak: false });
      normal(doc, B.euro(p.einzelpreis), cols[4].x + 6 * S, y + 9 * S, { width: cols[4].w - 12 * S, align: "right", lineBreak: false });
      fett(doc, B.euro(p.gesamt), cols[5].x + 6 * S, y + 9 * S, { width: cols[5].w - 12 * S, align: "right", lineBreak: false });
      y += hRow;
      doc.moveTo(M.l, y).lineTo(W - M.r, y).lineWidth(0.5).stroke(C.line);
    }
    // Summen
    const sumZeilen = [];
    if (s.rabatt) { sumZeilen.push(["Zwischensumme", B.euro(s.zwischensumme)]); sumZeilen.push([s.rabattProzent ? `Rabatt ${String(s.rabattProzent).replace(".", ",")} %` : "Rabatt", "− " + B.euro(s.rabatt)]); }
    if (b.steuer.satz || s.rabatt) sumZeilen.push([b.steuer.belegSumme || "Summe", B.euro(s.summe)]);
    if (b.steuer.satz && b.steuer.belegSteuer) sumZeilen.push([b.steuer.belegSteuer, B.euro(s.steuer)]);
    const sumH = sumZeilen.length * 16 * S + 44 * S + (s.anzahlungGesamt ? 36 * S : 0);
    if (y + sumH > grenze) { fuss(doc, b, 0, 0); seiteNeu(false); y = M.t + 100 * S; }
    y += 10 * S;
    const sx = W - M.r - 300 * S, sw = 300 * S;
    doc.fontSize(13 * S);
    sumZeilen.forEach(([l, v]) => { normal(doc, l, sx, y, { width: sw / 2, lineBreak: false }); normal(doc, v, sx, y, { width: sw, align: "right", lineBreak: false }); y += 16 * S; });
    const gesamtLabel = s.anzahlungGesamt ? "Rechnungsbetrag" : (b.art === "storno" ? "Gutschriftbetrag" : "Gesamtbetrag");
    doc.save().roundedRect(sx, y + 2, sw, 30 * S, 6).fill(C.accent).restore();
    doc.fontSize(16 * S); fett(doc, gesamtLabel, sx + 10, y + 8.5 * S, { color: C.white, lineBreak: false, staerke: 0.5 }); fett(doc, B.euro(s.gesamt), sx, y + 8.5 * S, { width: sw - 10, align: "right", color: C.white, lineBreak: false, staerke: 0.5 });
    y += 36 * S;
    if (s.anzahlungGesamt) {
      doc.fontSize(12.5 * S);
      normal(doc, `abzüglich Anzahlung (${(b.anzahlung && b.anzahlung.rechnungNummer) || "Anzahlungsrechnung"})`, sx, y, { width: sw / 1.5, lineBreak: false }); normal(doc, "− " + B.euro(s.anzahlungGesamt), sx, y, { width: sw, align: "right", lineBreak: false }); y += 16 * S;
      fett(doc, "Noch zu zahlen", sx, y, { lineBreak: false }); fett(doc, B.euro(s.zahlbetrag), sx, y, { width: sw, align: "right", lineBreak: false }); y += 20 * S;
    }
    // Hinweise / Texte
    doc.fontSize(12.5 * S);
    const texte = [];
    if (b.steuer.pdfHinweis) texte.push(b.steuer.pdfHinweis);
    if (b.art === "rechnung" || b.art === "storno") {
      if (b.art === "rechnung") texte.push(`Zahlbar bis ${fmtDatum(b.faelligAm)} ohne Abzug auf das unten genannte Konto. Verwendungszweck: ${b.nummer || "Rechnungsnummer"}.`);
      if (s.arbeitSumme) texte.push(`Im Rechnungsbetrag enthaltene Arbeitskosten gem. § 35a EStG: ${String(b.steuer.belegArbeit || "{gesamt}").replace("{summe}", B.euro(s.arbeitSumme)).replace("{steuer}", B.euro(s.arbeitGesamt - s.arbeitSumme)).replace("{gesamt}", B.euro(s.arbeitGesamt))}.`);
      if (!b.kunde.firma) texte.push("Hinweis gem. § 14 Abs. 4 Nr. 9 UStG: Als Privatperson sind Sie verpflichtet, diese Rechnung zwei Jahre lang aufzubewahren.");
    }
    if (b.art === "angebot") texte.push(`Dieses Angebot ist gültig bis ${fmtDatum(b.gueltigBis)}. Die endgültigen Maße werden beim kostenlosen Aufmaß vor Ort ermittelt.${b.firma.anzahlungProzent ? ` Zahlungsbedingungen: ${b.firma.anzahlungProzent} % Anzahlung bei Auftrag, Restbetrag nach Montage.` : ""}`);
    if (b.art === "ab") texte.push(`Vielen Dank für Ihren Auftrag. Voraussichtlicher Liefer-/Montagetermin: ${b.liefertermin ? fmtDatum(b.liefertermin) : "nach Absprache"}.${b.firma.anzahlungProzent ? ` Vereinbarte Anzahlung: ${b.firma.anzahlungProzent} % – die Anzahlungsrechnung erhalten Sie gesondert.` : ""}`);
    if (b.schluss && b.schluss.trim()) texte.push(b.schluss);
    for (const t of texte) { const hT = doc.heightOfString(t, { width: INNEN }); if (y + hT > grenze) { fuss(doc, b, 0, 0); seiteNeu(false); y = M.t + 100 * S; } normal(doc, t, M.l, y, { width: INNEN }); y = doc.y + 5 * S; }
    if (b.art === "angebot") {
      if (y + 50 > grenze) { fuss(doc, b, 0, 0); seiteNeu(false); y = M.t + 100 * S; }
      y += 28 * S; const lw = (INNEN - 40 * S) / 2;
      [["Ort, Datum", M.l], ["Angebot angenommen – Unterschrift Kunde", M.l + lw + 40 * S]].forEach(([t, x]) => { doc.moveTo(x, y).lineTo(x + lw, y).lineWidth(0.6).stroke(C.ink); doc.fontSize(11 * S); normal(doc, t, x, y + 4, { width: lw, color: C.ink2, lineBreak: false }); });
    }
    // Fußzeilen mit Seitenzahlen
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) { doc.switchToPage(i); fuss(doc, b, i + 1, range.count); }
    doc.end();
  });
}
module.exports = { erzeuge };
