/* AVIF-Varianten für alle WebP-Bilder (lokal mit ffmpeg, Ergebnisse werden eingecheckt wie die WebP-Dateien).
   Aufruf: node scripts/bilder-avif.js [ordner …]   (Standard: assets/img assets/video assets/konfigurator assets/bilder)
   Es wird nur konvertiert, wenn die .avif fehlt oder älter als die .webp ist. Der Build (scripts/build.js, Schritt
   „Bilder: AVIF-Quellen“) ergänzt im HTML <picture><source type="image/avif"> für jede vorhandene .avif. */
"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const ROOT = path.join(__dirname, "..");

function ffmpeg() {
  if (process.env.FFMPEG && fs.existsSync(process.env.FFMPEG)) return process.env.FFMPEG;
  const kandidaten = [];
  try { const base = path.join(process.env.LOCALAPPDATA || "", "Microsoft", "WinGet", "Packages"); for (const d of fs.readdirSync(base)) if (/^Gyan\.FFmpeg/.test(d)) for (const sub of fs.readdirSync(path.join(base, d))) kandidaten.push(path.join(base, d, sub, "bin", "ffmpeg.exe")); } catch (e) { /* kein winget */ }
  for (const k of kandidaten) if (fs.existsSync(k)) return k;
  return "ffmpeg";
}
function dateien(ordner) {
  const out = [];
  (function walk(d) { if (!fs.existsSync(d)) return; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.webp$/i.test(e.name)) out.push(p); } })(ordner);
  return out;
}
function konvertiere(webp, bin, log) {
  const avif = webp.replace(/\.webp$/i, ".avif");
  if (fs.existsSync(avif) && fs.statSync(avif).mtimeMs >= fs.statSync(webp).mtimeMs) return "vorhanden";
  // Fotos: crf 32 reicht für sichtbar gleiche Qualität bei ~60–70 % der WebP-Größe; Poster/Transparenz bleiben erhalten
  execFileSync(bin, ["-y", "-loglevel", "error", "-i", webp, "-c:v", "libaom-av1", "-still-picture", "1", "-crf", "32", "-b:v", "0", "-cpu-used", "6", "-row-mt", "1", "-pix_fmt", "yuv420p", avif], { stdio: "inherit" });
  const a = fs.statSync(avif).size, w = fs.statSync(webp).size;
  if (a >= w) { fs.unlinkSync(avif); log(`  ${path.relative(ROOT, webp)}: AVIF nicht kleiner (${a} ≥ ${w}) – verworfen`); return "verworfen"; }
  return "neu";
}
function lauf(ordnerListe, log = console.log) {
  const bin = ffmpeg();
  const zaehler = { neu: 0, vorhanden: 0, verworfen: 0 };
  for (const o of ordnerListe) for (const f of dateien(path.join(ROOT, o))) { try { zaehler[konvertiere(f, bin, log)]++; } catch (e) { log(`  Fehler bei ${path.relative(ROOT, f)}: ${e.message}`); } }
  log(`AVIF: ${zaehler.neu} neu, ${zaehler.vorhanden} vorhanden, ${zaehler.verworfen} verworfen.`);
  return zaehler;
}
if (require.main === module) lauf(process.argv.slice(2).length ? process.argv.slice(2) : ["assets/img", "assets/video", "assets/konfigurator", "assets/bilder"]);
module.exports = { lauf, dateien, ffmpeg };
