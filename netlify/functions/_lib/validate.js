/* Serverseitige Validierung der Admin-Daten mit deutschen Meldungen je Feld.
   Preise: baut auf FWPreis.validiereListe() auf und ergänzt Feldpfade/Texte; Einstellungen; Texte; Bilder. */
"use strict";
const path = require("path");

const PV = require(path.join(__dirname, "..", "..", "..", "js", "preis-validate.js"));
const validierePreise = PV.validierePreise;
const validiereEinstellungen = PV.validiereEinstellungen;
const validiereProdukte = PV.validiereProdukte;
const STATUS = PV.STATUS;

/* Texte: nur einfache Auszeichnung erlauben */
function sanitizeHtml(html) {
  let s = String(html || "");
  s = s.replace(/<\s*(script|style|iframe|object|embed|form|input|textarea|button|svg|math)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "");
  s = s.replace(/<\s*(script|style|iframe|object|embed|img|video|audio|source|link|meta)[^>]*>/gi, "");
  s = s.replace(/<([a-zA-Z0-9]+)([^>]*)>/g, (m, tag, attrs) => {
    const t = tag.toLowerCase();
    if (!["b", "strong", "i", "em", "a", "ul", "ol", "li", "br", "p", "h2", "h3", "span"].includes(t)) return "";
    if (t === "a") { const href = (attrs.match(/href\s*=\s*"([^"]*)"/i) || [])[1] || ""; if (!/^(https?:\/\/|\/|mailto:|tel:|#)/i.test(href)) return "<a>"; return `<a href="${href.replace(/"/g, "")}"${/^https?:/i.test(href) ? ' rel="noopener noreferrer" target="_blank"' : ""}>`; }
    return `<${t}>`;
  });
  s = s.replace(/<\/([a-zA-Z0-9]+)>/g, (m, tag) => (["b", "strong", "i", "em", "a", "ul", "ol", "li", "p", "h2", "h3", "span"].includes(tag.toLowerCase()) ? `</${tag.toLowerCase()}>` : ""));
  s = s.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  return s.trim();
}
function validiereTexte(t, schema) {
  const f = [];
  if (!t || typeof t !== "object") return [{ feld: "", meldung: "Texte fehlen." }];
  for (const [k, v] of Object.entries(t)) {
    if (schema && !schema[k]) { f.push({ feld: k, meldung: "Unbekannter Textbaustein." }); continue; }
    if (typeof v !== "string") f.push({ feld: k, meldung: "Text muss eine Zeichenkette sein." });
    else if (v.length > 20000) f.push({ feld: k, meldung: "Text zu lang (max. 20.000 Zeichen)." });
    else if (!v.trim() && schema && schema[k] && schema[k].pflicht) f.push({ feld: k, meldung: "Dieser Text darf nicht leer sein." });
  }
  return f;
}
function validiereBild(meta) {
  const f = [];
  if (!meta || typeof meta !== "object") return [{ feld: "", meldung: "Bilddaten fehlen." }];
  if (!meta.titel || String(meta.titel).trim().length < 2) f.push({ feld: "titel", meldung: "Bitte einen Titel angeben." });
  if (!meta.alt || String(meta.alt).trim().length < 5) f.push({ feld: "alt", meldung: "Bitte eine Bildbeschreibung (mind. 5 Zeichen) angeben." });
  if (!["startseite", "referenzen", "produkte", "leistungen", "ueber-uns", "konfigurator", "sonstiges"].includes(meta.sektion)) f.push({ feld: "sektion", meldung: "Bitte einen Bereich wählen." });
  return f;
}

module.exports = { validierePreise, validiereEinstellungen, validiereProdukte, validiereTexte, validiereBild, sanitizeHtml, STATUS };
