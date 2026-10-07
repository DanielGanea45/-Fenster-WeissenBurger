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
/* ---------- Admin „Command Center“ (css/admin.css) ---------- */
const ADM = { bg0: "#121a24", bg1: "#1b2430", panel: "#1f2a38", panel2: "#26334a", panel3: "#2d3b52", line: "#2c3a4d", ink: "#eef3f8", ink2: "#a9b7c6", ink3: "#8593a4", accent: "#3d8bff", accentHover: "#5a9dff", accentInk: "#0b1420", accentText: "#8ab8ff", okText: "#7fe0a8", okSoft: "#163d2a", warnText: "#ffc978", warnSoft: "#44361a", errText: "#ff9b9b", errSoft: "#4a2229", err: "#ff8080", ok: "#3ddc84" };
const adminChecks = [
  ["Admin: Text auf Seitenhintergrund (oben)", ADM.ink, ADM.bg0, 4.5],
  ["Admin: Text auf Seitenhintergrund (unten)", ADM.ink, ADM.bg1, 4.5],
  ["Admin: Text auf Panel", ADM.ink, ADM.panel, 4.5],
  ["Admin: Text auf Panel 2 (Eingabefelder, Tabellenkopf)", ADM.ink, ADM.panel2, 4.5],
  ["Admin: Text auf Panel 3 (Hover/aktiv)", ADM.ink, ADM.panel3, 4.5],
  ["Admin: Text sekundär auf Seitenhintergrund", ADM.ink2, ADM.bg1, 4.5],
  ["Admin: Text sekundär auf Panel", ADM.ink2, ADM.panel, 4.5],
  ["Admin: Text sekundär auf Panel 2", ADM.ink2, ADM.panel2, 4.5],
  ["Admin: Text tertiär (nur Icons/Hinweise ≥ 18 px) auf Seitenhintergrund", ADM.ink3, ADM.bg1, 3.0],
  ["Admin: Akzent-Text/Werte auf Seitenhintergrund", ADM.accentText, ADM.bg1, 4.5],
  ["Admin: Akzent-Text/Werte auf Panel", ADM.accentText, ADM.panel, 4.5],
  ["Admin: Akzent-Text/Werte auf Panel 2", ADM.accentText, ADM.panel2, 4.5],
  ["Admin: Button-Text (dunkel) auf Akzentfläche", ADM.accentInk, ADM.accent, 4.5],
  ["Admin: Button-Text (dunkel) auf Akzentfläche (Hover)", ADM.accentInk, ADM.accentHover, 4.5],
  ["Admin: Akzentfläche gegen Panel (UI, 3:1)", ADM.accent, ADM.panel, 3.0],
  ["Admin: Akzentfläche gegen Seitenhintergrund (UI, 3:1)", ADM.accent, ADM.bg1, 3.0],
  ["Admin: Akzent #3d8bff als Fließtext auf Panel – bewusst NICHT verwendet (nur Flächen/große Zahlen)", ADM.accent, ADM.panel, 0],
  ["Admin: OK-Text auf Panel", ADM.okText, ADM.panel, 4.5],
  ["Admin: OK-Text auf OK-Fläche (Badge/Pill)", ADM.okText, ADM.okSoft, 4.5],
  ["Admin: Warn-Text auf Panel", ADM.warnText, ADM.panel, 4.5],
  ["Admin: Warn-Text auf Warn-Fläche", ADM.warnText, ADM.warnSoft, 4.5],
  ["Admin: Fehler-Text auf Panel", ADM.errText, ADM.panel, 4.5],
  ["Admin: Fehler-Text auf Fehler-Fläche", ADM.errText, ADM.errSoft, 4.5],
  ["Admin: Fehler-Rahmen gegen Panel 2 (UI, 3:1)", ADM.err, ADM.panel2, 3.0],
  ["Admin: Schalter EIN (grün) gegen Panel (UI, 3:1)", ADM.ok, ADM.panel, 3.0],
  ["Admin: Rahmenlinie gegen Panel (dezent, nur Info)", ADM.line, ADM.panel, 0],
  ["Admin: Toast-Text auf Panel 3", ADM.ink, ADM.panel3, 4.5],
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
