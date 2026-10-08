#!/usr/bin/env node
/* Wissen des KI-Assistenten „Daniel“ – EINE Quelle, ausschließlich aus der Plattform:
     - öffentliche Texte (data/texte.json: Startseite inkl. Über uns/Kontakt, Produkte + Unterseiten, Leistungen/Fenstermontage,
       Einsatzgebiet) – im Build bereits mit den Admin-Texten befüllt
     - Firmendaten und Öffnungszeiten (data/einstellungen.json), WhatsApp-Nummer
     - Preishinweis (js/hinweise.js) und Steuertext (js/steuer.js, Satz aus den Einstellungen)
     - Optionen und Grenzen der Preisliste (data/preise.json) – ohne Preise (die liefert nur das Werkzeug preis_berechnen)
     - Einsatzgebiet: Regionen und Orte (data/orte.json, nur freigeschaltete Regionen)
     - „Wissen“ aus Admin → Assistent (data/wissen.json: Frage/Antwort)
   Ergebnis: data/assistent-wissen.json – wird der Function als Systemanweisung mitgegeben (fester Block → Prompt-Caching).
   Aufruf: node scripts/assistent-wissen.js [--pruefen]   (FW_ROOT für Kopien) */
"use strict";
const fs = require("fs");
const path = require("path");

const SEITEN = [
  { slug: "startseite", titel: "Startseite (Angebot, Über uns, Kontakt)", url: "/" },
  { slug: "produkte", titel: "Produkte – Übersicht", url: "/produkte/" },
  { slug: "kunststofffenster", titel: "Kunststofffenster (Kömmerling)", url: "/produkte/kunststofffenster-koemmerling/" },
  { slug: "kunststoff-aluminium", titel: "Kunststoff-Aluminium-Fenster", url: "/produkte/kunststoff-aluminium-fenster/" },
  { slug: "aluminiumfenster", titel: "Aluminiumfenster (Cortizo)", url: "/produkte/aluminiumfenster-cortizo/" },
  { slug: "schiebetueren", titel: "Hebe-Schiebetüren", url: "/produkte/schiebetueren/" },
  { slug: "haustueren", titel: "Haustüren", url: "/produkte/haustueren/" },
  { slug: "leistungen", titel: "Leistungen und Fenstermontage", url: "/leistungen/" },
  { slug: "einsatzgebiet", titel: "Einsatzgebiet", url: "/einsatzgebiet/" },
];

function text(html) {
  return String(html || "").replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
}
function lies(root, rel) { return JSON.parse(fs.readFileSync(path.join(root, rel), "utf8")); }
function optionen(obj, felder) {
  return Object.entries(obj || {}).map(([key, o]) => { const e = { key, name: o.name }; for (const f of felder) if (o[f] !== undefined && o[f] !== "") e[f] = o[f]; return e; });
}
function erzeuge(root) {
  const texte = lies(root, "data/texte.json");
  const einst = lies(root, "data/einstellungen.json");
  const preise = lies(root, "data/preise.json");
  const orte = lies(root, "data/orte.json");
  let wissen = []; try { wissen = lies(root, "data/wissen.json"); } catch (e) { wissen = []; }
  const firmaLib = require(path.join(root, "netlify/functions/_lib/firma.js"));
  const Hinweise = require(path.join(root, "js/hinweise.js"));
  const Steuer = require(path.join(root, "js/steuer.js"));
  const satz = Steuer.satz(einst);
  const ST = Steuer.texte(satz);
  const f = firmaLib.firma(einst);

  /* Seitentexte je Abschnitt (ohne Fußzeile/Formulare – die stehen nicht im Register) */
  const seiten = SEITEN.map((s) => {
    const abschnitte = [];
    for (const b of Object.values(texte.bloecke || {})) {
      if (b.seite !== s.slug) continue;
      const t = text(b.html); if (!t || t.length < 3) continue;
      const titel = b.abschnittTitel || "Allgemein";
      let a = abschnitte.find((x) => x.titel === titel); if (!a) { a = { titel, text: [] }; abschnitte.push(a); }
      if (!a.text.includes(t)) a.text.push(t);
    }
    return { titel: s.titel, url: s.url, abschnitte: abschnitte.map((a) => ({ titel: a.titel, text: a.text.join(" ") })) };
  });

  const regionen = Object.entries(einst.einsatzgebiet || {}).filter(([, an]) => an).map(([k]) => k);
  const orteListe = (orte.orte || []).filter((o) => o.stufe === 1 && regionen.includes(o.region)).map((o) => o.name).sort((a, b) => a.localeCompare(b, "de"));

  const F = preise.fenster, H = preise.haustuer;
  return {
    stand: new Date().toISOString().slice(0, 10),
    firma: {
      name: firmaLib.vollerName(einst), adresse: `${f.strasse}, ${f.plz} ${f.ort}`, telefon: f.telefon, telefonLink: firmaLib.telHref(f.telefon), email: f.email,
      oeffnungszeiten: firmaLib.zeitenText(einst.oeffnungszeiten), whatsapp: String((einst.website || {}).whatsapp || "").replace(/\D/g, ""),
      website: "https://fenster-weissenburger.de",
    },
    hinweise: { richtpreis: Hinweise.richtpreis.lang, richtpreisKurz: Hinweise.richtpreis.kurz, steuer: ST.lang, steuerKurz: ST.kurz, steuerProzent: satz },
    preisliste: {
      version: preise.version, onlineRabattProzent: preise.onlineRabattProzent,
      fenster: {
        grenzen: F.grenzen, systeme: optionen(F.systeme, ["material", "bautiefeMm", "kammern", "uf", "kurz", "breiteMaxMm", "hoeheMaxMm"]), typen: optionen(F.typen, []),
        farben: optionen(F.farben, []), glas: optionen(F.glas, []), sprossen: optionen(F.sprossen, []), rollladen: optionen(F.rollladen, []), zusaetze: optionen(F.zusaetze, ["nurMitRollladen"]),
      },
      haustuer: {
        grenzen: H.grenzen, modelle: optionen(H.modelle, ["kurz"]), farben: optionen(H.farben, []), glas: optionen(H.glas, []), seitenteil: optionen(H.seitenteil, []), zusaetze: optionen(H.zusaetze, []),
      },
    },
    einsatzgebiet: { regionen, orte: orteListe },
    seiten,
    wissen: (Array.isArray(wissen) ? wissen : []).filter((w) => w && w.frage && w.antwort && w.aktiv !== false).map((w) => ({ frage: String(w.frage).trim(), antwort: String(w.antwort).trim() })),
  };
}
function schreiben(root, nurPruefen) {
  const neu = erzeuge(root);
  const f = path.join(root, "data", "assistent-wissen.json");
  const alt = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null;
  /* „stand“ zählt beim Vergleich nicht – sonst wäre die Datei jeden Tag „veraltet“ */
  const gleich = alt && JSON.stringify(Object.assign({}, alt, { stand: "" })) === JSON.stringify(Object.assign({}, neu, { stand: "" }));
  if (!gleich && !nurPruefen) fs.writeFileSync(f, JSON.stringify(neu, null, 1) + "\n");
  return { geaendert: !gleich, bytes: JSON.stringify(neu).length, seiten: neu.seiten.length, orte: neu.einsatzgebiet.orte.length, wissen: neu.wissen.length };
}
module.exports = { erzeuge, schreiben, SEITEN, text };
if (require.main === module) {
  const root = process.env.FW_ROOT ? path.resolve(process.env.FW_ROOT) : path.join(__dirname, "..");
  const pruefen = process.argv.includes("--pruefen");
  const r = schreiben(root, pruefen);
  console.log(`Assistent-Wissen: ${r.seiten} Seiten, ${r.orte} Orte, ${r.wissen} Wissenseinträge, ${Math.round(r.bytes / 1024)} kB – ${pruefen ? (r.geaendert ? "veraltet (node scripts/assistent-wissen.js ausführen)" : "aktuell") : (r.geaendert ? "geschrieben" : "unverändert")}.`);
  if (pruefen && r.geaendert) process.exit(1);
}
