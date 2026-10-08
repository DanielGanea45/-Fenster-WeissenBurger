/* Netlify Function: serverseitiger Spam-Schutz für alle Formulare.
   Ablauf: Browser (main.js) schickt die Formularfelder als JSON hierher → Prüfungen
   (Honeypot, Mindestzeit, optional Friendly Captcha) → Weiterleitung an Netlify Forms
   per klassischem POST, damit die Anfrage wie gewohnt im Netlify-Dashboard und per
   E-Mail-Benachrichtigung ankommt. Ohne JavaScript geht das Formular direkt an Netlify
   Forms (nur Honeypot) – so bleibt es für alle nutzbar.

   Umgebungsvariablen (Netlify → Site configuration → Environment variables):
     FRC_API_KEY   – API-Key von Friendly Captcha (nur nötig, wenn das Captcha aktiviert ist)
     FRC_SITEKEY   – Sitekey (optional, zusätzliche Prüfung)
     FRC_ENDPOINT  – "eu" (Standard) oder "global"
     SPAM_MIN_SECONDS – Mindestzeit in Sekunden (Standard 3) */
"use strict";

const ALLOWED_FORMS = ["kontakt", "anfrage-leistungen", "anfrage-produkte", "anfrage-einsatzgebiet", "bewertung", "angebot-konfigurator"];
const path = require("path");
const fs = require("fs");
const Preis = require("../../js/preis.js");
const Hinweise = require("../../js/hinweise.js");
const Steuer = require("../../js/steuer.js");
const daten = require("./_lib/daten");
const store = require("./_lib/store");
const mail = require("./_lib/mail");
const crypto = require("crypto");
let PREISLISTE = null;
function preisliste() {
  if (PREISLISTE) return PREISLISTE;
  const p = path.join(__dirname, "..", "..", "data", "preise.json");
  PREISLISTE = JSON.parse(fs.readFileSync(p, "utf8"));
  return PREISLISTE;
}
/* Steuersatz zum Zeitpunkt der Anfrage (data/einstellungen.json wird im Build aus dem Admin-Speicher geschrieben) */
function steuersatz() {
  try { return Steuer.satz(JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "data", "einstellungen.json"), "utf8"))); } catch (e) { return Steuer.STANDARD; }
}
/* Konfigurator-Anfrage: Konfiguration prüfen, Preis NEU berechnen (dem Browser wird nicht vertraut),
   Ergebnis + Preislistenversion als Felder an Netlify Forms übergeben. */
function konfiguratorNachrechnen(fields) {
  let cfg;
  try { cfg = JSON.parse(String(fields.konfiguration || "")); } catch (e) { return { ok: false, reason: "konfiguration" }; }
  if (!cfg || typeof cfg !== "object") return { ok: false, reason: "konfiguration" };
  let liste;
  try { liste = preisliste(); } catch (e) { return { ok: false, reason: "preisliste" }; }
  const satz = steuersatz();
  const r = Preis.berechne(cfg, liste, satz);
  const out = {};
  out.konfiguration = JSON.stringify(cfg);
  out.preisliste_version = String(liste.version || "");
  out.steuersatz_prozent = String(satz);
  out.preis_browser = String(fields.preis_browser || "");
  if (r.ok) {
    out.preis_server = String(r.endpreis);
    out.preis_server_text = Steuer.preisMitZusatz(Preis.euro(r.endpreis), satz) + " (" + Hinweise.richtpreis.kurz + "; Liste " + liste.version + ")";
    out.preis_abweichung = String(fields.preis_browser || "") === String(r.endpreis) ? "nein" : "JA – Browserpreis weicht ab";
    out.positionen = r.positionen.map((p) => p.name + ": " + Preis.euro(p.betrag)).join(" | ");
  } else {
    out.preis_server = "";
    out.preis_server_text = "Preis auf Anfrage (" + r.fehler.join(", ") + ")";
    out.preis_abweichung = "n/a";
  }
  return { ok: true, felder: out };
}
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

function jsonAntwort(statusCode, body) {
  return { statusCode, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }, body: JSON.stringify(body) };
}

async function verifyCaptcha(response, sitekey) {
  const key = process.env.FRC_API_KEY;
  if (!key) return { skipped: true, success: true };
  if (!response) return { success: false, error: "response_missing" };
  const endpoint = (process.env.FRC_ENDPOINT || "eu") === "global"
    ? "https://global.frcapi.com/api/v2/captcha/siteverify"
    : "https://eu.frcapi.com/api/v2/captcha/siteverify";
  const body = { response };
  if (sitekey || process.env.FRC_SITEKEY) body.sitekey = sitekey || process.env.FRC_SITEKEY;
  const r = await fetch(endpoint, { method: "POST", headers: { "X-API-Key": key, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  let data = {};
  try { data = await r.json(); } catch (e) { /* leer */ }
  return { success: !!data.success, error: data.error && data.error.error_code };
}

/* Klassischer Versand (ohne JavaScript): der Browser schickt application/x-www-form-urlencoded direkt an diese Function.
   Antwort ist dann eine Weiterleitung (303) auf die Dankeseite bzw. auf die Fehlerseite mit dem Grund als Anker –
   nie eine JSON-Antwort und nie ein 404. Netlify Forms wird nicht mehr genutzt (die Anfrage liegt im Admin-Speicher,
   Benachrichtigung und Bestätigung gehen per E-Mail). */
const DANKE_SEITE = "/danke.html", FEHLER_SEITE = "/anfrage-fehler.html";
function klassisch(event) {
  const h = (event && event.headers) || {};
  const ct = String(h["content-type"] || h["Content-Type"] || "").toLowerCase();
  return ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data");
}
function formularFelder(event) {
  let body = event.body || "";
  if (event.isBase64Encoded) body = Buffer.from(body, "base64").toString("utf8");
  const fields = {};
  for (const [k, v] of new URLSearchParams(body)) fields[k] = fields[k] === undefined ? v : [].concat(fields[k], v);
  const form = String(fields["form-name"] || ""); delete fields["form-name"];
  return { form, fields };
}
function umleitung(ziel) {
  return { statusCode: 303, headers: { Location: ziel, "Cache-Control": "no-store" }, body: "" };
}

/* Anfrage/Bewertung zusätzlich im Store speichern; Bewertungen warten dort auf Freigabe im Admin. */
let letzteKennung = 0; // Kennungen strikt steigend, auch bei zwei Anfragen in derselben Millisekunde
function neueKennung() { const t = Math.max(Date.now(), letzteKennung + 1); letzteKennung = t; return t + "-" + crypto.randomBytes(3).toString("hex"); }
async function fuerAdminAblegen(formName, fields, event) {
  const id = neueKennung();
  const sauber = {};
  for (const [k, v] of Object.entries(fields)) if (!["bot-field", "ts", "js", "frc-captcha-response", "frc-captcha-solution", "form-name"].includes(k)) sauber[k] = Array.isArray(v) ? v.join(", ") : String(v == null ? "" : v).slice(0, 5000);
  const konto = await store.getJSON("konto", null);
  const einst = await daten.lade("einstellungen").catch(() => ({}));
  const ziel = (art) => (einst.email && einst.email[art]) || (konto && konto.notify && konto.notify[art] && konto.notify.email) || "";
  const absender = (einst.email && einst.email.absenderName) || undefined;
  const adminUrl = (process.env.URL || "") + "/admin/";
  if (formName === "bewertung") {
    /* Liste aus dem Speicher – oder, solange dort noch nichts liegt, die mitgelieferten Bewertungen (data/bewertungen.json),
       damit die ersten eingehenden Bewertungen die vorhandenen (Google/MyHammer) nicht verdrängen */
    const liste = (await daten.lade("bewertungen").catch(() => null)) || []; // gespeicherte Liste + übernommene Vorgaben
    liste.unshift({ id, status: "offen", eingegangen: Date.now(), name: sauber.name, ort: sauber.ort, projekt: sauber.projekt || "", sterne: Number(sauber.sterne) || 0, text: sauber.text, email: sauber.email || "", kunde: sauber.kunde || "", datum: new Date().toISOString().slice(0, 7) });
    await store.setJSON("daten/bewertungen", liste);
    if (ziel("bewertungen")) { const v = mail.vorlagen.neueBewertung(sauber, adminUrl); await mail.send({ to: ziel("bewertungen"), subject: v.subject, text: v.text, absenderName: absender }); }
    return;
  }
  const eintrag = { id, formular: formName, eingegangen: Date.now(), felder: sauber };
  if (formName === "angebot-konfigurator") {
    try { eintrag.konfiguration = JSON.parse(sauber.konfiguration || "{}"); } catch (e) { eintrag.konfiguration = null; }
    eintrag.preisServer = Number(sauber.preis_server) || null;
    eintrag.preisBrowser = Number(sauber.preis_browser) || null;
    eintrag.steuerProzent = Number(sauber.steuersatz_prozent); // Steuerstatus zum Zeitpunkt der Anfrage bleibt erhalten
    eintrag.abweichung = sauber.preis_abweichung || "";
    eintrag.preislisteVersion = sauber.preisliste_version || "";
  }
  await store.setJSON("anfragen/" + id, eintrag);
  if (ziel("anfragen")) { const v = mail.vorlagen.neueAnfrage(sauber, adminUrl); await mail.send({ to: ziel("anfragen"), subject: v.subject, text: v.text, absenderName: absender, replyTo: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(sauber.email || "") ? sauber.email : undefined }); }
  /* Bestätigung an den Kunden – die E-Mail-Adresse ist Pflicht, der Kunde erhält sie also immer (Prüfung bleibt als Schutz) */
  if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(sauber.email || "")) {
    const firmaLib = require("./_lib/firma");
    const fi = firmaLib.firma(einst);
    const v = mail.vorlagen.bestaetigungAnfrage(sauber, { name: firmaLib.vollerName(einst), telefon: fi.telefon, email: fi.email, zeiten: firmaLib.zeitenText(einst.oeffnungszeiten) });
    try { await mail.send({ to: sauber.email, subject: v.subject, text: v.text, absenderName: absender, replyTo: fi.email || undefined }); } catch (e) { console.log("Bestätigung nicht gesendet:", e.message); }
  }
}

exports.handler = async (event) => {
  store.verbinde(event);
  if (event.httpMethod !== "POST") return json(405, { ok: false, reason: "method" });
  const ohneJs = klassisch(event);
  let payload;
  if (ohneJs) payload = formularFelder(event);
  else { try { payload = JSON.parse(event.body || "{}"); } catch (e) { return json(400, { ok: false, reason: "json" }); } }
  const formName = String(payload.form || "");
  const fields = payload.fields && typeof payload.fields === "object" ? payload.fields : {};
  /* Antwort je Versandart: JSON für den Browser mit JavaScript, Weiterleitung für den klassischen Versand */
  const json = (statusCode, body) => {
    if (!ohneJs) return jsonAntwort(statusCode, body);
    if (body.ok) return umleitung(DANKE_SEITE);
    const grund = body.feld === "email" ? "email" : body.reason === "felder" ? "felder" : body.reason === "zeit" ? "zeit" : body.reason === "captcha" ? "captcha" : "technik";
    return umleitung(FEHLER_SEITE + "#" + grund);
  };
  if (!ALLOWED_FORMS.includes(formName)) return json(400, { ok: false, reason: "form" });

  /* 1) Honeypot: Bots füllen das unsichtbare Feld aus → still verwerfen (Antwort sieht nach Erfolg aus). */
  if (String(fields["bot-field"] || "").trim() !== "") return json(200, { ok: true, dropped: "honeypot" });

  /* 2) Mindestzeit zwischen Seitenaufruf und Absenden (den Zeitstempel setzt js/main.js; beim klassischen Versand ohne
        JavaScript gibt es ihn nicht – dann bleiben Honigtopf und Pflichtfelder als Schutz). */
  const minMs = (Number(process.env.SPAM_MIN_SECONDS) || 3) * 1000;
  const ts = Number(fields.ts);
  const age = Date.now() - ts;
  if (!(ohneJs && !fields.ts) && (!ts || !(age >= minMs) || age > MAX_AGE_MS)) return json(200, { ok: false, reason: "zeit" });

  /* 3) Friendly Captcha (nur wenn FRC_API_KEY gesetzt ist). */
  try {
    const c = await verifyCaptcha(fields["frc-captcha-response"], payload.sitekey);
    if (!c.success) return json(200, { ok: false, reason: "captcha", detail: c.error });
  } catch (e) {
    return json(502, { ok: false, reason: "captcha-service" });
  }

  /* 4) Pflichtfelder grob prüfen (echte Validierung macht der Browser; hier nur Schutz vor leeren Bot-Posts). */
  const required = formName === "bewertung" ? ["name", "ort", "text", "kunde", "datenschutz"]
    : formName === "angebot-konfigurator" ? ["name", "plz", "datenschutz", "konfiguration"]
    : ["name", "plz", "datenschutz"];
  for (const k of required) if (!String(fields[k] || "").trim()) return json(200, { ok: false, reason: "felder", feld: k });
  /* E-Mail ist Pflicht (Telefon freiwillig) – ohne gültige Adresse wird nichts gespeichert und nichts gesendet */
  if (formName !== "bewertung") {
    const mailAdr = String(fields.email || "").trim();
    if (!mailAdr) return json(200, { ok: false, reason: "felder", feld: "email", meldung: "Bitte geben Sie Ihre E-Mail-Adresse ein." });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mailAdr)) return json(200, { ok: false, reason: "felder", feld: "email", meldung: "Bitte geben Sie eine gültige E-Mail-Adresse ein." });
  }

  /* 4b) Konfigurator: Preis serverseitig neu berechnen und mitspeichern. */
  let weiter = fields;
  if (formName === "angebot-konfigurator") {
    const k = konfiguratorNachrechnen(fields);
    if (!k.ok) return json(200, { ok: false, reason: k.reason });
    weiter = Object.assign({}, fields, k.felder);
  }

  /* 5) Anfrage im Admin-Bereich ablegen (Anfragen-Liste bzw. Bewertungen zur Freigabe), Firma benachrichtigen, Kunden bestätigen.
        Schlägt die Ablage fehl, bekommt der Besucher einen klaren Fehler statt einer stillen Erfolgsmeldung. */
  try { await fuerAdminAblegen(formName, weiter, event); } catch (e) { console.log("Admin-Ablage fehlgeschlagen:", e.message); return json(500, { ok: false, reason: "technik" }); }
  return json(200, { ok: true });
};
