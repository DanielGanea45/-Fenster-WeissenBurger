/* Inhaltsdaten des Admin-Bereichs: Preise, Einstellungen, Texte, Bilder, Bewertungen.
   Quelle der Wahrheit zur Laufzeit: Store (Netlify Blobs) – Rückfall auf die Dateien im Repository.
   Jede Speicherung erzeugt eine Version (wer, wann, was, Diff). Der Build (scripts/build.js) holt
   dieselben Daten ab und erzeugt daraus data/*.json sowie die Seiten. */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const store = require("./store");

const ROOT = path.join(__dirname, "..", "..", "..");
/* Bekannte Felder der Preisliste; unbekannte Felder aus älteren gespeicherten Versionen werden beim Laden verworfen */
const PREISE_FELDER = new Set(["version", "hinweis", "waehrung", "onlineRabattProzent", "rundung", "anfahrt", "fenster", "haustuer", "schiebetuer"]);
const BEREICHE = {
  preise: { datei: "data/preise.json", titel: "Preise & Konfigurator" },
  einstellungen: { datei: "data/einstellungen.json", titel: "Einstellungen" },
  texte: { datei: "data/texte.json", titel: "Texte" },
  bilder: { datei: "data/bilder.json", titel: "Bilder" },
  bewertungen: { datei: "data/bewertungen.json", titel: "Bewertungen" },
};

/* Tiefe Zusammenführung: Werte aus b überschreiben a; Objekte werden zusammengeführt, Arrays ersetzt */
function tief(a, b) {
  if (!b || typeof b !== "object" || Array.isArray(b)) return b === undefined ? a : b;
  const out = Object.assign({}, a && typeof a === "object" ? a : {});
  for (const [k, v] of Object.entries(b)) out[k] = v && typeof v === "object" && !Array.isArray(v) ? tief(out[k], v) : v;
  return out;
}
function repoDatei(bereich) {
  const p = path.join(ROOT, BEREICHE[bereich].datei);
  if (!fs.existsSync(p)) return bereich === "bewertungen" ? [] : {};
  return JSON.parse(fs.readFileSync(p, "utf8"));
}
/* Aktuelle Daten eines Bereichs (Store vor Repo). Für texte/bilder: Repo-Registry + gespeicherte Änderungen. */
async function lade(bereich) {
  if (!BEREICHE[bereich]) throw new Error("Unbekannter Bereich " + bereich);
  const gespeichert = await store.getJSON("daten/" + bereich, null);
  if (bereich === "texte") {
    const reg = repoDatei("texte");
    const ue = gespeichert || {};
    const out = { seiten: reg.seiten || {}, bloecke: {} };
    for (const [id, b] of Object.entries(reg.bloecke || {})) out.bloecke[id] = Object.assign({}, b, ue[id] !== undefined ? { html: ue[id], geaendert: true } : {});
    return out;
  }
  if (bereich === "bilder") {
    const reg = repoDatei("bilder");
    const ue = gespeichert || {};
    const out = { bilder: {} };
    for (const [id, b] of Object.entries(reg.bilder || {})) out.bilder[id] = Object.assign({}, b, ue[id] || {});
    for (const [id, b] of Object.entries(ue)) if (!out.bilder[id] && b && b.neu) out.bilder[id] = b; // hochgeladene Zusatzbilder
    return out;
  }
  if (bereich === "einstellungen") return tief(repoDatei("einstellungen"), gespeichert || {});
  const out = gespeichert === null ? repoDatei(bereich) : gespeichert;
  if (bereich === "preise" && out && typeof out === "object") for (const k of Object.keys(out)) if (!PREISE_FELDER.has(k)) delete out[k]; // Altbestand (z. B. früherer Steuersatz in der Liste) verwerfen – der Steuersatz steht in den Einstellungen
  return out;
}
/* Nur die gespeicherten Änderungen (so, wie sie im Store liegen) */
async function ladeRoh(bereich) { return store.getJSON("daten/" + bereich, null); }

/* ---------- Versionen & Diff ---------- */
function flach(obj, prefix, out) {
  out = out || {};
  if (obj === null || typeof obj !== "object") { out[prefix || ""] = obj; return out; }
  if (Array.isArray(obj)) { obj.forEach((v, i) => flach(v, prefix ? prefix + "[" + i + "]" : "[" + i + "]", out)); if (!obj.length) out[prefix] = "[]"; return out; }
  const keys = Object.keys(obj);
  if (!keys.length && prefix) out[prefix] = "{}";
  for (const k of keys) flach(obj[k], prefix ? prefix + "." + k : k, out);
  return out;
}
function diff(alt, neu) {
  const a = flach(alt), b = flach(neu), out = [];
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const va = a[k], vb = b[k];
    if (JSON.stringify(va) === JSON.stringify(vb)) continue;
    out.push({ pfad: k, alt: va === undefined ? null : va, neu: vb === undefined ? null : vb });
  }
  return out.slice(0, 400);
}
function kurzId() { return crypto.randomBytes(4).toString("hex"); }
function versionKey(ts) { return "versionen/" + String(ts).padStart(14, "0") + "-" + kurzId(); }

async function speichere(bereich, neu, { wer, beschreibung, rohAlt } = {}) {
  if (!BEREICHE[bereich]) throw new Error("Unbekannter Bereich " + bereich);
  const alt = rohAlt !== undefined ? rohAlt : await ladeRoh(bereich);
  const vergleichAlt = alt === null ? (bereich === "texte" || bereich === "bilder" ? {} : repoDatei(bereich)) : alt;
  const d = diff(vergleichAlt, neu);
  await store.setJSON("daten/" + bereich, neu);
  const ts = Date.now();
  const v = { id: null, wann: ts, wer: wer || "", bereich, titel: BEREICHE[bereich].titel, beschreibung: beschreibung || "", aenderungen: d.length, diff: d, snapshot: neu };
  const key = versionKey(ts);
  v.id = key.replace("versionen/", "");
  await store.setJSON(key, v);
  return v;
}
async function versionen(limit = 50) {
  const keys = (await store.list("versionen/")).sort().reverse().slice(0, limit);
  const out = [];
  for (const k of keys) { const v = await store.getJSON(k, null); if (v) { const { snapshot, ...rest } = v; out.push(rest); } }
  return out;
}
async function version(id) { return store.getJSON("versionen/" + id, null); }
async function wiederherstelle(id, wer) {
  const v = await version(id);
  if (!v) return null;
  return speichere(v.bereich, v.snapshot, { wer, beschreibung: `Wiederhergestellt: Version vom ${new Date(v.wann).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}` });
}

/* ---------- Veröffentlichungsstatus ---------- */
async function publishStatus() { return store.getJSON("veroeffentlichung", { status: "nie", wann: 0 }); }
async function setPublishStatus(s) { const alt = await publishStatus(); const neu = Object.assign({}, alt, s); await store.setJSON("veroeffentlichung", neu); return neu; }

module.exports = { BEREICHE, ROOT, tief, repoDatei, lade, ladeRoh, speichere, versionen, version, wiederherstelle, diff, flach, publishStatus, setPublishStatus };
