#!/usr/bin/env node
/* Konfigurator-Bilder: wandelt die Rohbilder aus bilder-original-2/ (PNG) in WebP um (400 und 900 px breit)
   nach assets/konfigurator/ und erzeugt data/konfigurator-bilder.json – die Liste aller verfügbaren Bilder
   mit Maßen, Größen und deutschem Alt-Text. Neue Dateien im Rohordner werden beim nächsten Lauf übernommen;
   vorhandene Ausgaben werden nur neu erzeugt, wenn das Original neuer ist.
   Aufruf: node scripts/konfigurator-bilder.js [--neu]   (FFMPEG=Pfad überschreibt den ffmpeg-Pfad) */
"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const QUELLE = path.join(ROOT, "bilder-original-2");
const ZIEL = path.join(ROOT, "assets", "konfigurator");
const JSON_DATEI = path.join(ROOT, "data", "konfigurator-bilder.json");
const GROESSEN = [400, 900];
const QUALITAET = 82;
const KANDIDATEN = [process.env.FFMPEG, "C:/Users/droc2/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-9.0.2-full_build/bin/ffmpeg.exe", "ffmpeg"].filter(Boolean);

/* ---------- Alt-Texte (Deutsch) aus dem Dateinamen ---------- */
const W = {
  typ: { "1fl": "einflügelig (Dreh-Kipp)", "2fl": "zweiflügelig (Stulp)", fest: "Festverglasung", balkon: "Balkontür" },
  farbe: { weiss: "Weiß", anthrazit: "Anthrazit", goldenoak: "Golden Oak", zweifarbig: "zweifarbig (außen farbig, innen weiß)", ral: "RAL-Farbe" },
  sprossen: { keine: "ohne Sprossen", innen: "mit innenliegenden Sprossen", wiener: "mit Wiener Sprossen" },
  rollladen: { kein: "ohne Rollladen", aufsatz: "mit Aufsatzrollladen", vorsatz: "mit Vorsatzrollladen" },
  modell: { voll: "modern, vollflächig", glasstreifen: "modern mit Glasstreifen", seitenteil: "modern mit Seitenteil", klassisch: "klassisch in Holzoptik" },
  glas: { "2fach": "Zweifach-Wärmeschutzglas", "3fach": "Dreifach-Wärmeschutzglas", schallschutz: "Schallschutzglas", vsg: "Sicherheitsglas (VSG)" },
  zusatz: { rc2: "Einbruchschutz RC2 – Pilzkopfverriegelung", insektenschutz: "Insektenschutz-Rahmen", rollladenmotor: "Rollladenmotor", "fensterbank-innen": "Fensterbank innen", "fensterbank-aussen": "Fensterbank außen aus Aluminium", montage: "Fachgerechte Montage", demontage: "Demontage und Entsorgung der alten Fenster" },
};
function altText(name) {
  let m;
  if ((m = name.match(/^fenster-([^-]+)-([^-]+)-([^-]+)-([^-]+)$/))) return `Fenster ${W.typ[m[1]] || m[1]} in ${W.farbe[m[2]] || m[2]}, ${W.sprossen[m[3]] || m[3]}, ${W.rollladen[m[4]] || m[4]} – Abbildung beispielhaft`;
  if ((m = name.match(/^tuer-([^-]+)-([^-]+)$/))) return `Haustür ${W.modell[m[1]] || m[1]} in ${W.farbe[m[2]] || m[2]} – Abbildung beispielhaft`;
  if ((m = name.match(/^glas-(.+)$/))) return `${W.glas[m[1]] || m[1]} – Abbildung beispielhaft`;
  if ((m = name.match(/^zusatz-(.+)$/))) return `${W.zusatz[m[1]] || m[1]} – Abbildung beispielhaft`;
  /* ältere Bilder */
  if ((m = name.match(/^profil-(.+)$/))) return `Profilschnitt ${m[1].replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())} – Abbildung beispielhaft`;
  if ((m = name.match(/^typ-(.+)$/))) return `Fenster ${m[1].replace(/-/g, " ")} – Abbildung beispielhaft`;
  if ((m = name.match(/^farbe-(.+)$/))) return `Fensterprofil in ${W.farbe[m[1].replace("-", "")] || m[1]} – Abbildung beispielhaft`;
  if ((m = name.match(/^haustuer-(.+)$/))) return `Haustür ${m[1].replace(/-/g, " ")} – Abbildung beispielhaft`;
  if (name === "rollladen-aufsatz") return "Fenster mit Aufsatzrollladen – Abbildung beispielhaft";
  if (name === "sprossen-wiener") return "Fenster mit Wiener Sprossen – Abbildung beispielhaft";
  return name.replace(/-/g, " ") + " – Abbildung beispielhaft";
}

function ffmpeg() {
  for (const k of KANDIDATEN) { try { execFileSync(k, ["-version"], { stdio: "ignore" }); return k; } catch (e) { /* nächster */ } }
  return null;
}
function masse(bin, datei) {
  const probe = bin.replace(/ffmpeg(\.exe)?$/, "ffprobe$1");
  try { const out = execFileSync(probe, ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", datei]).toString().trim(); const [w, h] = out.split(",").map(Number); return { breite: w, hoehe: h }; } catch (e) { return null; }
}
function konvertiere(bin, quelle, ziel, breite) {
  execFileSync(bin, ["-y", "-v", "error", "-i", quelle, "-vf", `scale=${breite}:-2:flags=lanczos`, "-c:v", "libwebp", "-quality", String(QUALITAET), "-compression_level", "6", ziel], { stdio: "ignore" });
}

function lauf() {
  const neu = process.argv.includes("--neu");
  fs.mkdirSync(ZIEL, { recursive: true });
  const bin = ffmpeg();
  let konvertiert = 0, uebersprungen = 0;
  if (fs.existsSync(QUELLE)) {
    if (!bin) { console.error("ffmpeg nicht gefunden – FFMPEG=<Pfad> setzen."); process.exit(1); }
    for (const f of fs.readdirSync(QUELLE).filter((x) => /\.(png|jpe?g)$/i.test(x)).sort()) {
      const name = f.replace(/\.[^.]+$/, "").toLowerCase();
      const q = path.join(QUELLE, f);
      for (const g of GROESSEN) {
        const z = path.join(ZIEL, `${name}-${g}.webp`);
        if (!neu && fs.existsSync(z) && fs.statSync(z).mtimeMs >= fs.statSync(q).mtimeMs) { uebersprungen++; continue; }
        konvertiere(bin, q, z, g); konvertiert++;
      }
    }
  } else console.log("Hinweis: bilder-original-2/ nicht vorhanden – nur die Bilderliste wird aktualisiert.");

  /* Liste aller Bilder in assets/konfigurator (auch ältere mit 400/800) */
  const dateien = fs.readdirSync(ZIEL).filter((x) => /-\d+\.webp$/.test(x));
  const bilder = {};
  for (const d of dateien) {
    const m = d.match(/^(.*)-(\d+)\.webp$/); const name = m[1], g = Number(m[2]);
    (bilder[name] = bilder[name] || { groessen: [] }).groessen.push(g);
  }
  for (const [name, b] of Object.entries(bilder)) {
    b.groessen.sort((a, c) => a - c);
    const gross = path.join(ZIEL, `${name}-${b.groessen[b.groessen.length - 1]}.webp`);
    const mm = bin ? masse(bin, gross) : null;
    if (mm) { b.breite = mm.breite; b.hoehe = mm.hoehe; }
    b.alt = altText(name);
  }
  const out = { hinweis: "Automatisch erzeugt von scripts/konfigurator-bilder.js – nicht von Hand bearbeiten. Quelle: bilder-original-2/ (nicht im Repository). Verwendet von js/konfigurator-bilder.js (Karten + Vorschau) und den Tests.", erzeugt: new Date().toISOString().slice(0, 10), groessen: GROESSEN, bilder: Object.fromEntries(Object.entries(bilder).sort(([a], [b]) => a.localeCompare(b))) };
  fs.writeFileSync(JSON_DATEI, JSON.stringify(out, null, 1) + "\n");
  console.log(`Konfigurator-Bilder: ${konvertiert} Dateien konvertiert, ${uebersprungen} aktuell, ${Object.keys(bilder).length} Bilder in data/konfigurator-bilder.json.`);
}
if (require.main === module) lauf();
module.exports = { altText, lauf };
