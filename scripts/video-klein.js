/* Telefon-Varianten der Hintergrundvideos (lokal mit ffmpeg, eingecheckt): assets/video/<name>-klein.mp4|webm, 640 px breit,
   stärker komprimiert. js/main.js wählt sie auf schmalen Bildschirmen; bei Save-Data / prefers-reduced-data /
   prefers-reduced-motion wird gar kein Video geladen (nur das Poster). Aufruf: node scripts/video-klein.js */
"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { ffmpeg } = (() => { try { return { ffmpeg: require("./bilder-avif").ffmpeg }; } catch (e) { return { ffmpeg: () => "ffmpeg" }; } })();
const ROOT = path.join(__dirname, "..");
const DIR = path.join(ROOT, "assets", "video");
function lauf(log = console.log) {
  const bin = typeof ffmpeg === "function" ? ffmpeg() : "ffmpeg";
  let n = 0;
  for (const f of fs.readdirSync(DIR)) {
    const m = /^([a-z0-9-]+)\.mp4$/i.exec(f); if (!m || /-klein$/.test(m[1])) continue;
    const quelle = path.join(DIR, f), name = m[1];
    const mp4 = path.join(DIR, `${name}-klein.mp4`), webm = path.join(DIR, `${name}-klein.webm`);
    if (!fs.existsSync(mp4) || fs.statSync(mp4).mtimeMs < fs.statSync(quelle).mtimeMs) { execFileSync(bin, ["-y", "-loglevel", "error", "-i", quelle, "-an", "-vf", "scale=640:-2", "-c:v", "libx264", "-preset", "slow", "-crf", "30", "-profile:v", "main", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4], { stdio: "inherit" }); n++; }
    if (!fs.existsSync(webm) || fs.statSync(webm).mtimeMs < fs.statSync(quelle).mtimeMs) { execFileSync(bin, ["-y", "-loglevel", "error", "-i", quelle, "-an", "-vf", "scale=640:-2", "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "38", "-row-mt", "1", "-deadline", "good", "-cpu-used", "2", webm], { stdio: "inherit" }); n++; }
    log(`  ${name}: klein mp4 ${Math.round(fs.statSync(mp4).size / 1024)} kB (groß ${Math.round(fs.statSync(quelle).size / 1024)} kB), webm ${Math.round(fs.statSync(webm).size / 1024)} kB`);
  }
  log(`Videos: ${n} Dateien erzeugt.`);
}
if (require.main === module) lauf();
module.exports = { lauf };
