/* Netlify Function „assistent“ – KI-Assistent „Daniel“ (OpenAI). Aktionen (POST, JSON):
     { aktion: "start" }                       → nach „Chat starten“: signierter Sitzungs-Token (30 min), Begrüßung, Vorschläge
     { aktion: "nachricht", token, text, hp, t } → Antwort (JSON; die Darstellung streamt der Browser), Links als Knöpfe
   Ohne OPENAI_API_KEY ist die Function abgeschaltet (aktiv:false). Der Schlüssel verlässt diese Function nie.
   Schutz: Herkunft (Origin/Referer), Bot-Kennungen, Honigtopf, Mindestabstände, Rate-Limit je IP (Hash), Sperre bei Verdacht,
   Tages-/Monatslimit aus den Einstellungen (Admin → Assistent). Gespräche: höchstens 20 Nachrichten, 1.000 Zeichen je Nachricht,
   Speicherung 90 Tage, ohne IP. Kernlogik in _lib/assistent.js. */
"use strict";
const crypto = require("crypto");
const store = require("./_lib/store");
const http = require("./_lib/http");
const A = require("./_lib/assistent");

const json = (code, body) => http.json(code, body, { "Cache-Control": "no-store" });
const kontaktText = (k) => `${A.UNSICHER} Sie erreichen unser Team unter ${k.telefon || ""}${k.email ? " oder " + k.email : ""}${k.oeffnungszeiten ? " (" + k.oeffnungszeiten + ")" : ""}.`;

exports.handler = async (event) => {
  store.verbinde(event);
  if (event.httpMethod === "OPTIONS") return json(204, {});
  if (event.httpMethod !== "POST") return json(405, { ok: false, error: "Nur POST." });
  let body; try { body = JSON.parse(event.body || "{}"); } catch (e) { return json(400, { ok: false, error: "Ungültige Anfrage." }); }
  const aktion = String(body.aktion || "");

  if (!A.schluessel()) return json(200, { ok: true, aktiv: false });
  const einst = await A.einstellungen();
  const lim = A.limits(einst);
  const kontakt = async () => A.werkzeug("kontakt_anzeigen", {}, einst, {}, event);
  if (!lim.aktiv) return json(200, { ok: true, aktiv: false });

  /* Herkunft und Bots – still ablehnen (keine Details) */
  if (!A.herkunftOk(event) || A.botUa(event)) { await A.blockiert("herkunft"); return json(403, { ok: false, error: "Zugriff nicht erlaubt." }); }
  if (await A.gesperrt(event)) { await A.blockiert("sperre"); const k = await kontakt(); return json(429, { ok: false, error: "Zu viele Anfragen. " + kontaktText(k), links: k.links }); }

  /* Tages- und Monatslimit */
  const tagesStat = await A.tag(), monatsStat = await A.monatStat();
  const tagVoll = lim.tageslimit > 0 && (tagesStat.nachrichten || 0) >= lim.tageslimit;
  const monatVoll = lim.monatslimitEuro > 0 && (monatsStat.kosten || 0) >= lim.monatslimitEuro;
  if (tagVoll || monatVoll) {
    await A.blockiert("limit");
    const k = await kontakt();
    return json(200, { ok: true, aktiv: true, pause: true, antwort: `Unser digitaler Assistent macht gerade Pause (${tagVoll ? "Tageskontingent erreicht" : "Monatsbudget erreicht"}). Sie erreichen unser Team gern direkt unter ${k.telefon || ""}${k.email ? " oder " + k.email : ""}${k.oeffnungszeiten ? " (" + k.oeffnungszeiten + ")" : ""}.`, links: k.links });
  }

  if (aktion === "start") {
    if (!(await A.rateOk(event))) { await A.blockiert("rate"); const k = await kontakt(); return json(429, { ok: false, error: "Zu viele Anfragen. " + kontaktText(k), links: k.links }); }
    await A.aufraeumen();
    const id = Date.now() + "-" + crypto.randomBytes(4).toString("hex");
    const konv = { id, start: Date.now(), letzte: Date.now(), nachrichten: [], anzahl: 0, kosten: 0, tokens: 0, modell: A.modell(), seite: String(body.seite || "").slice(0, 120) };
    await A.konvSpeichern(konv);
    return json(200, { ok: true, aktiv: true, token: A.tokenErzeugen(id), name: A.NAME, begruessung: A.BEGRUESSUNG, vorschlaege: A.VORSCHLAEGE, maxNachrichten: A.MAX_NACHRICHTEN, maxZeichen: A.MAX_ZEICHEN });
  }

  if (aktion === "nachricht") {
    const id = A.tokenPruefen(body.token);
    if (!id) { await A.blockiert("token"); return json(401, { ok: false, error: "Die Sitzung ist abgelaufen. Bitte den Chat neu starten.", neustart: true }); }
    /* Honigtopf: unsichtbares Feld ausgefüllt → so tun, als wäre alles gut */
    if (String(body.hp || "").trim()) { await A.blockiert("honigtopf"); await A.sperren(event, 30); return json(200, { ok: true, antwort: "Vielen Dank für Ihre Nachricht.", links: [] }); }
    const konv = await A.konvLaden(id);
    if (!konv) return json(401, { ok: false, error: "Die Sitzung ist abgelaufen. Bitte den Chat neu starten.", neustart: true });
    const text = String(body.text || "").replace(/\s+/g, " ").trim();
    if (!text) return json(422, { ok: false, error: "Bitte eine Nachricht eingeben." });
    if (text.length > A.MAX_ZEICHEN) return json(422, { ok: false, error: `Bitte höchstens ${A.MAX_ZEICHEN} Zeichen je Nachricht.` });
    if (konv.anzahl >= A.MAX_NACHRICHTEN) { const k = await kontakt(); return json(200, { ok: true, ende: true, antwort: `Wir haben die Höchstzahl an Nachrichten für dieses Gespräch erreicht. Gern hilft Ihnen unser Team persönlich weiter: ${k.telefon || ""}${k.email ? " oder " + k.email : ""}.`, links: k.links }); }
    /* Mindestabstände und Wiederholungen → Verdacht */
    const jetzt = Date.now();
    const zuSchnell = (konv.anzahl === 0 && jetzt - konv.start < A.MIN_ABSTAND_START_MS) || (konv.anzahl > 0 && jetzt - (konv.letzteNachricht || 0) < A.MIN_ABSTAND_MS);
    const letzte = (konv.nachrichten || []).filter((m) => m.rolle === "nutzer").slice(-2).map((m) => m.text);
    const wiederholt = letzte.length === 2 && letzte.every((t) => t === text);
    if (zuSchnell || wiederholt) {
      konv.verdacht = (konv.verdacht || 0) + 1; await A.konvSpeichern(konv); await A.blockiert("verdacht");
      if (konv.verdacht >= 2) {
        /* Friendly Captcha (falls eingerichtet) als zweite Stufe, sonst kurze Sperre */
        if (process.env.FRC_API_KEY && body.captcha) { const ok = await captchaOk(body.captcha); if (ok) { konv.verdacht = 0; await A.konvSpeichern(konv); } else return json(200, { ok: false, captcha: true, error: "Bitte bestätigen Sie kurz, dass Sie kein Roboter sind." }); }
        else if (process.env.FRC_API_KEY) return json(200, { ok: false, captcha: true, error: "Bitte bestätigen Sie kurz, dass Sie kein Roboter sind." });
        else { await A.sperren(event, 10); const k = await kontakt(); return json(429, { ok: false, error: "Das ging etwas schnell. Bitte versuchen Sie es in ein paar Minuten noch einmal. " + kontaktText(k), links: k.links }); }
      } else return json(200, { ok: false, error: zuSchnell ? "Einen Moment bitte – Nachrichten können nur nacheinander gesendet werden." : "Diese Nachricht haben Sie gerade schon gesendet." });
    }
    if (!(await A.rateOk(event))) { await A.blockiert("rate"); const k = await kontakt(); return json(429, { ok: false, error: "Zu viele Anfragen. " + kontaktText(k), links: k.links }); }

    konv.letzteNachricht = jetzt;
    const r = await A.antworten(konv, text, einst, event);
    konv.nachrichten.push({ rolle: "nutzer", text, t: jetzt });
    konv.nachrichten.push({ rolle: "assistent", text: r.antwort, t: Date.now(), links: r.links });
    konv.anzahl += 1;
    await A.konvSpeichern(konv);
    const ts = await A.zaehler("assistent/tag/" + A.heute(), 1, "nachrichten");
    const ms = await A.zaehler("assistent/monat/" + A.monat(), 1, "nachrichten");
    if (r.kostenEuro) { const m2 = (await store.getJSON("assistent/monat/" + A.monat(), null)) || {}; m2.kosten = A.rund6((m2.kosten || 0) + r.kostenEuro); await store.setJSON("assistent/monat/" + A.monat(), m2); }
    await A.alarmPruefen(einst, lim, ts, ms);
    return json(200, { ok: true, antwort: r.antwort, links: r.links, zaehler: konv.anzahl, maxNachrichten: A.MAX_NACHRICHTEN, ende: konv.anzahl >= A.MAX_NACHRICHTEN });
  }

  return json(400, { ok: false, error: "Unbekannte Aktion." });
};

async function captchaOk(solution) {
  try {
    const url = (process.env.FRC_ENDPOINT || "eu") === "global" ? "https://global.frcapi.com/api/v2/captcha/siteverify" : "https://eu.frcapi.com/api/v2/captcha/siteverify";
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "X-API-Key": process.env.FRC_API_KEY }, body: JSON.stringify({ response: String(solution || ""), sitekey: process.env.FRC_SITEKEY || undefined }) });
    const j = await r.json(); return !!j.success;
  } catch (e) { return false; }
}
