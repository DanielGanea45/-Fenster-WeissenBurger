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
const INTERNAL_FIELDS = ["ts", "js", "frc-captcha-response", "frc-captcha-solution", "form-name", "preis_browser"];
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

function json(statusCode, body) {
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

async function forwardToNetlifyForms(formName, fields, event) {
  const base = process.env.URL || process.env.DEPLOY_PRIME_URL || (event.headers && event.headers.origin);
  if (!base) throw new Error("Site-URL unbekannt");
  const params = new URLSearchParams();
  params.set("form-name", formName);
  for (const [k, v] of Object.entries(fields)) {
    if (INTERNAL_FIELDS.includes(k)) continue;
    params.set(k, Array.isArray(v) ? v.join(", ") : String(v == null ? "" : v));
  }
  const r = await fetch(base + "/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": (event.headers && event.headers["user-agent"]) || "fenster-weissenburger-anfrage" },
    body: params.toString(),
    redirect: "manual",
  });
  if (r.status >= 400) throw new Error("Netlify Forms antwortete mit " + r.status);
}

/* Anfrage/Bewertung zusätzlich im Store speichern; Bewertungen warten dort auf Freigabe im Admin. */
async function fuerAdminAblegen(formName, fields, event) {
  const id = Date.now() + "-" + crypto.randomBytes(3).toString("hex");
  const sauber = {};
  for (const [k, v] of Object.entries(fields)) if (!["bot-field", "ts", "js", "frc-captcha-response", "frc-captcha-solution", "form-name"].includes(k)) sauber[k] = Array.isArray(v) ? v.join(", ") : String(v == null ? "" : v).slice(0, 5000);
  const konto = await store.getJSON("konto", null);
  const einst = await daten.lade("einstellungen").catch(() => ({}));
  const ziel = (art) => (einst.email && einst.email[art]) || (konto && konto.notify && konto.notify[art] && konto.notify.email) || "";
  const absender = (einst.email && einst.email.absenderName) || undefined;
  const adminUrl = (process.env.URL || "") + "/admin/";
  if (formName === "bewertung") {
    const liste = await store.getJSON("daten/bewertungen", null) || [];
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
  if (ziel("anfragen")) { const v = mail.vorlagen.neueAnfrage(sauber, adminUrl); await mail.send({ to: ziel("anfragen"), subject: v.subject, text: v.text, absenderName: absender }); }
}

exports.handler = async (event) => {
  store.verbinde(event);
  if (event.httpMethod !== "POST") return json(405, { ok: false, reason: "method" });
  let payload;
  try { payload = JSON.parse(event.body || "{}"); } catch (e) { return json(400, { ok: false, reason: "json" }); }
  const formName = String(payload.form || "");
  const fields = payload.fields && typeof payload.fields === "object" ? payload.fields : {};
  if (!ALLOWED_FORMS.includes(formName)) return json(400, { ok: false, reason: "form" });

  /* 1) Honeypot: Bots füllen das unsichtbare Feld aus → still verwerfen (Antwort sieht nach Erfolg aus). */
  if (String(fields["bot-field"] || "").trim() !== "") return json(200, { ok: true, dropped: "honeypot" });

  /* 2) Mindestzeit zwischen Seitenaufruf und Absenden. */
  const minMs = (Number(process.env.SPAM_MIN_SECONDS) || 3) * 1000;
  const ts = Number(fields.ts);
  const age = Date.now() - ts;
  if (!ts || !(age >= minMs) || age > MAX_AGE_MS) return json(200, { ok: false, reason: "zeit" });

  /* 3) Friendly Captcha (nur wenn FRC_API_KEY gesetzt ist). */
  try {
    const c = await verifyCaptcha(fields["frc-captcha-response"], payload.sitekey);
    if (!c.success) return json(200, { ok: false, reason: "captcha", detail: c.error });
  } catch (e) {
    return json(502, { ok: false, reason: "captcha-service" });
  }

  /* 4) Pflichtfelder grob prüfen (echte Validierung macht der Browser; hier nur Schutz vor leeren Bot-Posts). */
  const required = formName === "bewertung" ? ["name", "ort", "text", "kunde", "datenschutz"]
    : formName === "angebot-konfigurator" ? ["name", "telefon", "email", "plz", "datenschutz", "konfiguration"]
    : ["name", "telefon", "plz", "datenschutz"];
  for (const k of required) if (!String(fields[k] || "").trim()) return json(200, { ok: false, reason: "felder", feld: k });

  /* 4b) Konfigurator: Preis serverseitig neu berechnen und mitspeichern. */
  let weiter = fields;
  if (formName === "angebot-konfigurator") {
    const k = konfiguratorNachrechnen(fields);
    if (!k.ok) return json(200, { ok: false, reason: k.reason });
    weiter = Object.assign({}, fields, k.felder);
  }

  /* 4c) Kopie für den Admin-Bereich ablegen (Anfragen-Liste bzw. Bewertungen zur Freigabe) und benachrichtigen. */
  try { await fuerAdminAblegen(formName, weiter, event); } catch (e) { console.log("Admin-Ablage fehlgeschlagen:", e.message); }

  /* 5) An Netlify Forms weiterreichen. */
  try {
    await forwardToNetlifyForms(formName, weiter, event);
  } catch (e) {
    return json(502, { ok: false, reason: "weiterleitung" });
  }
  return json(200, { ok: true });
};
