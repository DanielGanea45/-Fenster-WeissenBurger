#!/usr/bin/env node
/* WCAG-AA-Kontrastprüfung der Farbpalette (Text/Hintergrund-Kombinationen, wie sie auf der Website vorkommen).
   Aufruf: node scripts/kontrast-check.js   → Tabelle; Exit-Code 1, wenn eine Kombination AA verfehlt. */
"use strict";
const PAL = {
  bg: "#e9eef3", surface: "#ffffff", line: "#d6dfe8", ink: "#1b2430", ink2: "#4f5b68",
  accent: "#0B5ED7", accentInk: "#ffffff", accentHover: "#0A4FB5", footerBg: "#dce3ea", footerInk: "#4f5b68",
  dark: "#1b2430", onDark: "#ffffff", onDark2: "rgba(255,255,255,.84)", accentOnDark: "#8ab8ff",
  overlayOnMid: null, // Video-Overlay: #1b2430 55 % über einem mittleren Videoton
  badgeGreen: "#14612f", error: "#a93226",
};
function parse(c) {
  if (c.startsWith("rgba")) { const m = c.match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m[3] }; }
  const h = c.replace("#", ""); return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: 1 };
}
function blend(fg, bg) { const a = fg.a == null ? 1 : fg.a; return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 }; }
function lum({ r, g, b }) { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); }
function ratio(fg, bg) { const a = blend(parse(fg), parse(bg)); const l1 = lum(a), l2 = lum(parse(bg)); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); }
/* Overlay-Hintergrund: #1b2430 mit 55 % über einem hellen Videoton (#b9b2a8, worst case) */
const hex = (o) => "#" + [o.r, o.g, o.b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
const overlayWorst = hex(blend({ ...parse("#1b2430"), a: 0.55 }, parse("#b9b2a8")));
/* Textzone: zusätzlich der Verlauf (55 %) hinter dem Text (unten auf dem Telefon, links auf dem Desktop ≥ 45 %) */
const overlayText = hex(blend({ ...parse("#1b2430"), a: 0.45 }, parse(overlayWorst)));

const checks = [
  ["Text auf Seitenhintergrund", PAL.ink, PAL.bg, 4.5],
  ["Text auf Karte/Fläche", PAL.ink, PAL.surface, 4.5],
  ["Text sekundär auf Seitenhintergrund", PAL.ink2, PAL.bg, 4.5],
  ["Text sekundär auf Karte", PAL.ink2, PAL.surface, 4.5],
  ["Link/Akzenttext auf Seitenhintergrund", PAL.accent, PAL.bg, 4.5],
  ["Link/Akzenttext auf Karte", PAL.accent, PAL.surface, 4.5],
  ["Button-Text auf Akzent", PAL.accentInk, PAL.accent, 4.5],
  ["Button-Text auf Akzent (Hover)", PAL.accentInk, PAL.accentHover, 4.5],
  ["Fußzeile Text auf Fußzeile", PAL.footerInk, PAL.footerBg, 4.5],
  ["Fußzeile Link (Hover, Akzent) auf Fußzeile", PAL.accent, PAL.footerBg, 4.5],
  ["Weißer Text auf Video-Overlay (hellster Videoton)", PAL.onDark, overlayWorst, 4.5],
  ["Weißer Text 84 % auf Video-Overlay (hellster Videoton)", PAL.onDark2, overlayWorst, 4.5],
  ["Akzent-Tint auf Video-Overlay in der Textzone (Overlay + Verlauf, hellster Videoton)", PAL.accentOnDark, overlayText, 4.5],
  ["Akzent-Tint auf Video-Overlay ohne Verlauf (nur Info, kommt hinter Text nicht vor)", PAL.accentOnDark, overlayWorst, 0],
  ["Akzent-Tint auf Dunkel (#1b2430)", PAL.accentOnDark, PAL.dark, 4.5],
  ["Badge Uf: Weiß auf Grün", "#ffffff", PAL.badgeGreen, 4.5],
  ["Badge Bester Preis: Weiß auf Akzent", "#ffffff", PAL.accent, 4.5],
  ["Fehlertext auf Karte", PAL.error, PAL.surface, 4.5],
  ["Rahmen/Linie auf Seitenhintergrund (nicht-Text, 3:1)", PAL.line, PAL.bg, 1.0],
  ["Akzent (Buttonfläche) gegen Seitenhintergrund (UI, 3:1)", PAL.accent, PAL.bg, 3.0],
  ["Akzent (Buttonfläche) gegen Karte (UI, 3:1)", PAL.accent, PAL.surface, 3.0],
  ["Dunkles Akzentblau (reiner Akzenttext) auf Dunkel – bewusst NICHT verwendet", PAL.accent, PAL.dark, 0],
];
/* ---------- Admin „Stone & Ink“ (css/admin.css) ---------- */
const ADM = {
  bg: "#f1ede6", panel: "#fbf9f5", panel2: "#f4efe7", panel3: "#ebe4d8", line: "#e4ddd1", lineStrong: "#cfc4b3", paper: "#ffffff",
  ink: "#1f2630", ink2: "#5d6470", ink3: "#868c96",
  railBg: "#16202c", railInk: "#e9edf2", railInk2: "#a9b3bf", railActive: "#1f2b39", accentOnDark: "#d9ad66",
  accent: "#b5803f", accentHover: "#a27234", accentText: "#845a26", accentStrong: "#8a5f2a", accentInk: "#ffffff",
  ok: "#5c7350", okText: "#3d6b3a", okSoft: "#e4ebdd", err: "#8c2f39", errSoft: "#f3e3e4", grey: "#6a6f78", greySoft: "#e9e5de",
};
const accentSoft = hex(blend({ ...parse("#b5803f"), a: 0.12 }, parse(ADM.panel)));       // --accent-soft auf Karte
const accentSoftBg = hex(blend({ ...parse("#b5803f"), a: 0.12 }, parse(ADM.bg)));        // --accent-soft auf Seitenhintergrund
const adminChecks = [
  ["Admin: Text auf Seitenhintergrund", ADM.ink, ADM.bg, 4.5],
  ["Admin: Text auf Karte", ADM.ink, ADM.panel, 4.5],
  ["Admin: Text auf Fläche 2 (Eingabefelder, Tabellenkopf)", ADM.ink, ADM.panel2, 4.5],
  ["Admin: Text auf Fläche 3 (Hover/aktiv)", ADM.ink, ADM.panel3, 4.5],
  ["Admin: Text auf Papier (Eingaben)", ADM.ink, ADM.paper, 4.5],
  ["Admin: Text sekundär auf Seitenhintergrund", ADM.ink2, ADM.bg, 4.5],
  ["Admin: Text sekundär auf Karte", ADM.ink2, ADM.panel, 4.5],
  ["Admin: Text sekundär auf Fläche 2", ADM.ink2, ADM.panel2, 4.5],
  ["Admin: Text tertiär (nur Icons/Platzhalter) auf Karte", ADM.ink3, ADM.panel, 3.0],
  ["Admin: Akzent-Text (Links, Werte, Überschrift Übersicht) auf Seitenhintergrund", ADM.accentText, ADM.bg, 4.5],
  ["Admin: Akzent-Text auf Karte", ADM.accentText, ADM.panel, 4.5],
  ["Admin: Akzent-Text auf Akzent-Tint (Karte)", ADM.accentText, accentSoft, 4.5],
  ["Admin: Akzent-Text auf Akzent-Tint (Seitenhintergrund)", ADM.accentText, accentSoftBg, 4.5],
  ["Admin: Weißer Text auf gefüllter Akzentfläche (Pille offen, Reiter aktiv, Button Akzent)", ADM.accentInk, ADM.accentStrong, 4.5],
  ["Admin: Akzent #b5803f als Fließtext – bewusst NICHT verwendet (nur Schalter, Balken, Linien)", ADM.accent, ADM.panel, 0],
  ["Admin: Schalter EIN / Balken / aktive Linie (Messing) gegen Karte (UI, 3:1)", ADM.accent, ADM.panel, 3.0],
  ["Admin: Messing gegen Seitenhintergrund – nur Info (Schalter und Balken liegen immer auf Karten)", ADM.accent, ADM.bg, 0],
  ["Admin: Eingabe-Rahmen gegen Papier (UI, 3:1)", ADM.lineStrong, ADM.paper, 1.0],
  ["Admin: Seitenleiste Text auf Dunkel", ADM.railInk, ADM.railBg, 4.5],
  ["Admin: Seitenleiste Text sekundär auf Dunkel", ADM.railInk2, ADM.railBg, 4.5],
  ["Admin: Seitenleiste aktiver Eintrag (Messing hell) auf Dunkel", ADM.accentOnDark, ADM.railBg, 4.5],
  ["Admin: Seitenleiste aktiver Eintrag (Messing hell) auf aktiver Fläche", ADM.accentOnDark, ADM.railActive, 4.5],
  ["Admin: Primär-Button (Messing hell auf Dunkel)", ADM.accentOnDark, ADM.railBg, 4.5],
  ["Admin: Speichern-Button Einstellungen (Weiß auf Dunkel)", "#ffffff", ADM.railBg, 4.5],
  ["Admin: Toast (Text hell auf Dunkel)", ADM.railInk, ADM.railBg, 4.5],
  ["Admin: Pille bezahlt (Weiß auf gedämpftem Grün)", "#ffffff", ADM.ok, 4.5],
  ["Admin: Pille überfällig (Weiß auf dunklem Rot)", "#ffffff", ADM.err, 4.5],
  ["Admin: Pille Entwurf (Weiß auf Grau)", "#ffffff", ADM.grey, 4.5],
  ["Admin: Pille neutral (Text sekundär auf Grau hell)", ADM.ink2, ADM.greySoft, 4.5],
  ["Admin: OK-Text auf Karte", ADM.okText, ADM.panel, 4.5],
  ["Admin: OK-Text auf OK-Fläche (Badge/Hinweis)", ADM.okText, ADM.okSoft, 4.5],
  ["Admin: Fehler-Text auf Karte", ADM.err, ADM.panel, 4.5],
  ["Admin: Fehler-Text auf Fehler-Fläche", ADM.err, ADM.errSoft, 4.5],
  ["Admin: Fehler-Rahmen gegen Papier (UI, 3:1)", ADM.err, ADM.paper, 3.0],
  ["Admin: Rahmenlinie gegen Karte (dezent, nur Info)", ADM.line, ADM.panel, 0],
];
let fail = 0;
const rows = checks.concat(adminChecks).map(([name, fg, bg, min]) => {
  const r = ratio(fg, bg);
  const ok = min === 0 ? "– (Info)" : r >= min ? "✅" : "❌";
  if (min > 0 && r < min) fail++;
  return `| ${name} | ${fg} | ${bg} | ${r.toFixed(2)}:1 | ${min ? min + ":1" : "–"} | ${ok} |`;
});
console.log("| Kombination | Vordergrund | Hintergrund | Kontrast | Mindestwert | AA |\n|---|---|---|---|---|---|\n" + rows.join("\n"));
console.log(`\nOverlay-Worst-Case (55 % #1b2430 über #b9b2a8): ${overlayWorst}. ${fail ? fail + " Kombination(en) verfehlen AA." : "Alle geprüften Kombinationen erfüllen WCAG AA."}`);
process.exit(fail ? 1 : 0);
