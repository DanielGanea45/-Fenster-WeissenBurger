/* Serverseitige Validierung der Admin-Daten mit deutschen Meldungen je Feld.
   Preise: baut auf FWPreis.validiereListe() auf und ergänzt Feldpfade/Texte; Einstellungen; Texte; Bilder. */
"use strict";
const path = require("path");
const Preis = require(path.join(__dirname, "..", "..", "..", "js", "preis.js"));

const num = (x) => typeof x === "number" && isFinite(x);
const geld = (x) => num(x) && x >= 0 && Math.abs(x * 100 - Math.round(x * 100)) < 1e-6;

function validierePreise(p) {
  const f = []; // {feld, meldung}
  const add = (feld, meldung) => f.push({ feld, meldung });
  if (!p || typeof p !== "object") { add("", "Preisliste fehlt."); return f; }
  if (!p.version || typeof p.version !== "string") add("version", "Bitte eine Versionsbezeichnung angeben.");
  if (!num(p.mwstProzent) || p.mwstProzent < 0 || p.mwstProzent > 30) add("mwstProzent", "MwSt. muss zwischen 0 und 30 % liegen.");
  if (!num(p.onlineRabattProzent) || p.onlineRabattProzent < 0 || p.onlineRabattProzent > 50) add("onlineRabattProzent", "Online-Rabatt muss zwischen 0 und 50 % liegen.");
  const F = p.fenster || {}, H = p.haustuer || {};
  const g = F.grenzen || {};
  if (!(num(g.breiteMinMm) && g.breiteMinMm >= 200)) add("fenster.grenzen.breiteMinMm", "Mindestbreite: Zahl ab 200 mm.");
  if (!(num(g.breiteMaxMm) && g.breiteMaxMm > (g.breiteMinMm || 0))) add("fenster.grenzen.breiteMaxMm", "Maximalbreite muss größer als die Mindestbreite sein.");
  if (!(num(g.hoeheMinMm) && g.hoeheMinMm >= 200)) add("fenster.grenzen.hoeheMinMm", "Mindesthöhe: Zahl ab 200 mm.");
  if (!(num(g.hoeheMaxMm) && g.hoeheMaxMm > (g.hoeheMinMm || 0))) add("fenster.grenzen.hoeheMaxMm", "Maximalhöhe muss größer als die Mindesthöhe sein.");
  if (!(num(g.mindestflaecheM2) && g.mindestflaecheM2 > 0 && g.mindestflaecheM2 <= 3)) add("fenster.grenzen.mindestflaecheM2", "Mindestfläche: zwischen 0,1 und 3 m².");
  if (!(num(g.mengeMax) && g.mengeMax >= 1 && g.mengeMax <= 500)) add("fenster.grenzen.mengeMax", "Maximale Menge: 1 bis 500.");
  const sys = F.systeme || {};
  if (!Object.keys(sys).length) add("fenster.systeme", "Mindestens ein Profilsystem.");
  for (const [k, s] of Object.entries(sys)) {
    if (!s.name) add(`fenster.systeme.${k}.name`, "Name fehlt.");
    if (!(geld(s.preisProM2) && s.preisProM2 > 0 && s.preisProM2 <= 5000)) add(`fenster.systeme.${k}.preisProM2`, "Preis €/m²: positive Zahl bis 5.000, max. 2 Nachkommastellen.");
    if (!(num(s.uf) && s.uf > 0 && s.uf < 5)) add(`fenster.systeme.${k}.uf`, "Uf-Wert zwischen 0 und 5.");
    if (s.breiteMaxMm !== undefined && !(num(s.breiteMaxMm) && s.breiteMaxMm > (g.breiteMinMm || 0))) add(`fenster.systeme.${k}.breiteMaxMm`, "Breite max. muss größer als die Mindestbreite sein.");
    if (s.hoeheMaxMm !== undefined && !(num(s.hoeheMaxMm) && s.hoeheMaxMm > (g.hoeheMinMm || 0))) add(`fenster.systeme.${k}.hoeheMaxMm`, "Höhe max. muss größer als die Mindesthöhe sein.");
  }
  for (const [k, e] of Object.entries(F.typen || {})) if (!(num(e.zuschlagProzent) && e.zuschlagProzent > -100 && e.zuschlagProzent <= 100)) add(`fenster.typen.${k}.zuschlagProzent`, "Zuschlag in % zwischen −99 und 100.");
  for (const [k, e] of Object.entries(F.farben || {})) if (!(num(e.zuschlagProzent) && e.zuschlagProzent >= 0 && e.zuschlagProzent <= 100)) add(`fenster.farben.${k}.zuschlagProzent`, "Farbzuschlag in % zwischen 0 und 100.");
  for (const [k, e] of Object.entries(F.glas || {})) if (!(geld(e.zuschlagProM2) && e.zuschlagProM2 <= 1000)) add(`fenster.glas.${k}.zuschlagProM2`, "Glas-Zuschlag €/m²: 0 bis 1.000.");
  for (const [k, e] of Object.entries(F.sprossen || {})) if (!(geld(e.zuschlagProElement) && e.zuschlagProElement <= 2000)) add(`fenster.sprossen.${k}.zuschlagProElement`, "Sprossen-Zuschlag €: 0 bis 2.000.");
  for (const [k, e] of Object.entries(F.rollladen || {})) if (!(geld(e.zuschlagProM2) && e.zuschlagProM2 <= 1000)) add(`fenster.rollladen.${k}.zuschlagProM2`, "Rollladen €/m²: 0 bis 1.000.");
  for (const [k, e] of Object.entries(F.zusaetze || {})) { if (!["proElement", "proLfm"].includes(e.art)) add(`fenster.zusaetze.${k}.art`, "Art muss „proElement“ oder „proLfm“ sein."); if (!(geld(e.zuschlag) && e.zuschlag <= 5000)) add(`fenster.zusaetze.${k}.zuschlag`, "Zuschlag €: 0 bis 5.000."); }
  if (!F.montage || !geld(F.montage.montageProElement) || F.montage.montageProElement > 2000) add("fenster.montage.montageProElement", "Montage je Element: 0 bis 2.000 €.");
  if (!F.montage || !geld(F.montage.demontageEntsorgungProElement) || F.montage.demontageEntsorgungProElement > 2000) add("fenster.montage.demontageEntsorgungProElement", "Demontage/Entsorgung je Element: 0 bis 2.000 €.");
  const hg = H.grenzen || {};
  if (!(num(hg.breiteMinMm) && hg.breiteMinMm >= 500)) add("haustuer.grenzen.breiteMinMm", "Mindestbreite Tür: ab 500 mm.");
  if (!(num(hg.breiteMaxMm) && hg.breiteMaxMm > (hg.breiteMinMm || 0))) add("haustuer.grenzen.breiteMaxMm", "Maximalbreite Tür muss größer als die Mindestbreite sein.");
  if (!(num(hg.hoeheMinMm) && hg.hoeheMinMm >= 1500)) add("haustuer.grenzen.hoeheMinMm", "Mindesthöhe Tür: ab 1.500 mm.");
  if (!(num(hg.hoeheMaxMm) && hg.hoeheMaxMm > (hg.hoeheMinMm || 0))) add("haustuer.grenzen.hoeheMaxMm", "Maximalhöhe Tür muss größer als die Mindesthöhe sein.");
  if (!(num(hg.uebergroesseProzent) && hg.uebergroesseProzent >= 0 && hg.uebergroesseProzent <= 100)) add("haustuer.grenzen.uebergroesseProzent", "Übergröße in % zwischen 0 und 100.");
  if (!Object.keys(H.modelle || {}).length) add("haustuer.modelle", "Mindestens ein Türmodell.");
  for (const [k, m] of Object.entries(H.modelle || {})) if (!(geld(m.grundpreis) && m.grundpreis > 0 && m.grundpreis <= 50000)) add(`haustuer.modelle.${k}.grundpreis`, "Grundpreis: positive Zahl bis 50.000 €.");
  for (const [k, e] of Object.entries(H.farben || {})) if (!(num(e.zuschlagProzent) && e.zuschlagProzent >= 0 && e.zuschlagProzent <= 100)) add(`haustuer.farben.${k}.zuschlagProzent`, "Farbzuschlag in % zwischen 0 und 100.");
  for (const [k, e] of Object.entries(H.glas || {})) if (!(geld(e.zuschlagProElement) && e.zuschlagProElement <= 5000)) add(`haustuer.glas.${k}.zuschlagProElement`, "Glas-Zuschlag €: 0 bis 5.000.");
  for (const [k, e] of Object.entries(H.seitenteil || {})) if (!(geld(e.zuschlagProElement) && e.zuschlagProElement <= 10000)) add(`haustuer.seitenteil.${k}.zuschlagProElement`, "Seitenteil €: 0 bis 10.000.");
  for (const [k, e] of Object.entries(H.zusaetze || {})) if (!(geld(e.zuschlag) && e.zuschlag <= 10000)) add(`haustuer.zusaetze.${k}.zuschlag`, "Zuschlag €: 0 bis 10.000.");
  if (!H.montage || !geld(H.montage.montageProElement) || H.montage.montageProElement > 5000) add("haustuer.montage.montageProElement", "Montage je Tür: 0 bis 5.000 €.");
  if (!H.montage || !geld(H.montage.demontageEntsorgungProElement) || H.montage.demontageEntsorgungProElement > 5000) add("haustuer.montage.demontageEntsorgungProElement", "Demontage/Entsorgung je Tür: 0 bis 5.000 €.");
  /* Schiebetüren (optionaler Abschnitt, derselbe Aufbau wie Fenster-Systeme) */
  for (const [k, s] of Object.entries((p.schiebetuer && p.schiebetuer.systeme) || {})) if (!(geld(s.preisProM2) && s.preisProM2 > 0 && s.preisProM2 <= 5000)) add(`schiebetuer.systeme.${k}.preisProM2`, "Preis €/m²: positive Zahl bis 5.000.");
  /* Abschließend die harte Schema-Prüfung des Rechners */
  if (!f.length) { const v = Preis.validiereListe(p); if (!v.ok) v.fehler.forEach((m) => add("", "Rechner: " + m)); }
  return f;
}

const STATUS = ["aus", "vorschau", "online"];
function validiereEinstellungen(e) {
  const f = [];
  if (!e || typeof e !== "object" || !e.konfigurator) f.push({ feld: "konfigurator", meldung: "Einstellungen unvollständig." });
  else if (!STATUS.includes(e.konfigurator.status)) f.push({ feld: "konfigurator.status", meldung: "Status muss aus, vorschau oder online sein." });
  return f;
}

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

module.exports = { validierePreise, validiereEinstellungen, validiereTexte, validiereBild, sanitizeHtml, STATUS };
