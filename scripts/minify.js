/* Build-Schritt „CSS/JS minimieren“: esbuild verkleinert css/*.css und js/*.js an Ort und Stelle (Quellen im Repository
   bleiben lesbar – der Schritt läuft nur im Netlify-Build oder mit --erzwingen). js/vendor/* (bereits minimiert) und
   Admin-Dateien werden gleich behandelt; die Logik bleibt identisch, nur Leerraum/Kommentare/Namen lokaler Variablen ändern sich.
   Danach läuft assets-version.js, damit die ?v=-Hashes zum minimierten Inhalt passen. */
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");

function dateien(root) {
  const out = [];
  for (const [ordner, re] of [["css", /\.css$/], ["js", /\.js$/]]) {
    const d = path.join(root, ordner); if (!fs.existsSync(d)) continue;
    /* js/chat.js bleibt unverändert (≈5 kB): seine Markierung /*CHAT*\/…/*\/CHAT*\/ trägt die Konfiguration und wird vom
       Admin-Smoke-Test für die Prüfung mit/ohne Chat gebraucht – die Minimierung würde den Kommentar entfernen */
    for (const f of fs.readdirSync(d)) if (re.test(f) && !/\.min\./.test(f) && f !== "chat.js") out.push(path.join(d, f));
  }
  return out;
}
async function lauf(root, { log = console.log } = {}) {
  let esbuild;
  try { esbuild = require("esbuild"); } catch (e) { log("CSS/JS minimieren: esbuild nicht installiert – übersprungen."); return { dateien: 0, vorher: 0, nachher: 0 }; }
  let vorher = 0, nachher = 0, n = 0;
  for (const f of dateien(root)) {
    const quelle = fs.readFileSync(f, "utf8");
    const css = f.endsWith(".css");
    const r = await esbuild.transform(quelle, { loader: css ? "css" : "js", minify: true, charset: "utf8", target: css ? undefined : ["es2017"], legalComments: "none" });
    let code = r.code;
    if (!css) code = "/* " + path.basename(f) + " – minimiert im Build; Quelle im Repository */\n" + code;
    vorher += Buffer.byteLength(quelle); nachher += Buffer.byteLength(code); n++;
    fs.writeFileSync(f, code);
  }
  log(`CSS/JS minimieren: ${n} Dateien, ${Math.round(vorher / 1024)} kB → ${Math.round(nachher / 1024)} kB.`);
  return { dateien: n, vorher, nachher };
}
if (require.main === module) {
  if (!process.env.NETLIFY && !process.argv.includes("--erzwingen")) { console.log("CSS/JS minimieren: nur im Netlify-Build (lokal: --erzwingen in einer Kopie)."); process.exit(0); }
  lauf(ROOT).catch((e) => { console.error(e); process.exit(1); });
}
module.exports = { lauf, dateien };
