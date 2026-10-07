#!/usr/bin/env node
/* Abdeckungsbericht: Für jede Kombination des Konfigurators (Fenster: Typ × Farbe × Sprossen × Rollladen,
   Haustür: Modell × Farbe) – exaktes Foto / ähnliches Foto / fehlt. Markdown nach stdout; mit --datei wird
   zusätzlich data/konfigurator-bilder-abdeckung.md geschrieben. Preisliste: data/preise.json oder Pfad als Argument. */
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const { Bilder } = require(path.join(ROOT, "js", "konfigurator-bilder.js"));

function bericht(preisePfad) {
  const liste = JSON.parse(fs.readFileSync(path.join(ROOT, "data/konfigurator-bilder.json"), "utf8"));
  const preise = JSON.parse(fs.readFileSync(preisePfad || path.join(ROOT, "data/preise.json"), "utf8"));
  const B = Bilder(liste, preise);
  const F = preise.fenster, H = preise.haustuer;
  const zeilen = [], z = { exakt: 0, aehnlich: 0, fehlt: 0 };
  for (const typ of Object.keys(F.typen)) for (const farbe of Object.keys(F.farben)) for (const sprossen of Object.keys(F.sprossen)) for (const rollladen of Object.keys(F.rollladen)) {
    const a = B.abdeckung("fenster", { typ, farbe, sprossen, rollladen }); z[a.stufe]++;
    zeilen.push(`| ${F.typen[typ].name} | ${F.farben[farbe].name} | ${F.sprossen[sprossen].name} | ${F.rollladen[rollladen].name} | ${a.stufe === "exakt" ? "✅ exakt" : a.stufe === "aehnlich" ? "🟡 ähnlich" : "❌ fehlt"} | ${a.bild ? "`" + a.bild + "`" : "–"} |`);
  }
  const zt = [], zz = { exakt: 0, aehnlich: 0, fehlt: 0 };
  for (const modell of Object.keys(H.modelle)) for (const farbe of Object.keys(H.farben)) for (const seitenteil of Object.keys(H.seitenteil)) {
    const st = { modell, farbe, seitenteil };
    const a = B.abdeckung("haustuer", st); zz[a.stufe]++;
    const sp = a.stufe === "exakt" ? B.vorschauSpiegel("haustuer", st) : B.angebotSpiegel("haustuer", st);
    zt.push(`| ${H.modelle[modell].name} | ${H.farben[farbe].name} | ${H.seitenteil[seitenteil].name} | ${a.stufe === "exakt" ? "✅ exakt" : a.stufe === "aehnlich" ? "🟡 ähnlich" : "❌ fehlt"} | ${a.bild ? "`" + a.bild + "`" + (sp ? " (gespiegelt)" : "") : "–"} |`);
  }
  const gesamt = zeilen.length;
  let md = `## Bildabdeckung Konfigurator (Preisliste ${preise.version})\n\n`;
  md += `**Fenster:** ${gesamt} Kombinationen – ✅ exakt ${z.exakt}, 🟡 ähnlich ${z.aehnlich}, ❌ fehlt ${z.fehlt}. Die Vorschau zeigt nur ✅-Kombinationen als Foto, sonst die schematische Zeichnung; Karten nutzen bei 🟡 das nächstliegende Foto.\n\n`;
  md += `<details><summary>Alle Fenster-Kombinationen</summary>\n\n| Typ | Farbe | Sprossen | Rollladen | Foto | Datei |\n|---|---|---|---|---|---|\n${zeilen.join("\n")}\n\n</details>\n\n`;
  md += `**Haustüren (Modell × Farbe × Seitenteil):** ${zt.length} Kombinationen – ✅ exakt ${zz.exakt}, 🟡 ähnlich ${zz.aehnlich}, ❌ fehlt ${zz.fehlt}. „Seitenteil links“ zeigt das Foto „rechts“ spiegelbildlich.\n\n<details><summary>Alle Haustür-Kombinationen</summary>\n\n| Modell | Farbe | Seitenteil | Foto | Datei |\n|---|---|---|---|---|\n${zt.join("\n")}\n\n</details>\n`;
  /* Fehlende exakte Fotos je Typ (für die nächste Bildserie) */
  const fehlend = {};
  for (const typ of Object.keys(F.typen)) { fehlend[typ] = 0; for (const farbe of Object.keys(F.farben)) for (const sprossen of Object.keys(F.sprossen)) for (const rollladen of Object.keys(F.rollladen)) if (B.abdeckung("fenster", { typ, farbe, sprossen, rollladen }).stufe !== "exakt") fehlend[typ]++; }
  md += `\n**Noch ohne exaktes Foto je Typ:** ${Object.entries(fehlend).map(([k, n]) => `${F.typen[k].name}: ${n}`).join(" · ")} (RAL/Wunschfarben haben bewusst kein Foto).\n`;
  return { md, z, zz, gesamt };
}

if (require.main === module) {
  const r = bericht(process.argv.find((a) => a.endsWith(".json")));
  console.log(r.md);
  if (process.argv.includes("--datei")) { fs.writeFileSync(path.join(ROOT, "data", "konfigurator-bilder-abdeckung.md"), r.md); }
}
module.exports = { bericht };
