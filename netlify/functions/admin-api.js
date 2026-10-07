/* Netlify Function: alle Datenfunktionen des Admin-Bereichs. Jede Aktion prüft die Sitzung; schreibende
   Aktionen zusätzlich Origin + CSRF-Token (Header X-CSRF). Rate-Limit je IP. Alles wird protokolliert.
   GET  ?aktion=uebersicht|daten&bereich=…|versionen|version&id=…|status|anfragen|protokoll|konto
   POST { aktion: speichern|bild-hochladen|bild-loeschen|bewertung|wiederherstellen|veroeffentlichen|rechnen|
                  anfrage-status|email-aendern|passwort-aendern|benachrichtigungen|totp-start|totp-aktivieren|
                  totp-deaktivieren|ueberall-abmelden, … } */
"use strict";
const path = require("path");
const crypto = require("crypto");
const store = require("./_lib/store");
const auth = require("./_lib/auth");
const http = require("./_lib/http");
const daten = require("./_lib/daten");
const validate = require("./_lib/validate");
const mail = require("./_lib/mail");
const Preis = require(path.join(__dirname, "..", "..", "js", "preis.js"));
const Steuer = require(path.join(__dirname, "..", "..", "js", "steuer.js"));

const WOCHE = 7 * 86400000;
const MAX_BILD_BYTES = 2.5 * 1024 * 1024;

exports.handler = async (event) => {
  http.verbinde(event);
  if (!http.adminEnabled()) return http.notFound();
  const rl = await http.rateLimit(event, "api", 240);
  if (!rl.ok) return rl.response;
  const q = event.queryStringParameters || {};
  try {
    if (event.httpMethod === "GET") {
      const s = await http.requireSession(event);
      if (!s.ok) return s.response;
      return await lesen(q.aktion, q, s, event);
    }
    if (event.httpMethod !== "POST") return http.json(405, { ok: false, error: "Methode nicht erlaubt." });
    const body = http.parseBody(event);
    if (!body) return http.json(400, { ok: false, error: "Ungültige Anfrage (JSON)." });
    const s = await http.requireSession(event, { write: true });
    if (!s.ok) return s.response;
    return await schreiben(body, s, event);
  } catch (e) {
    console.error(e);
    return http.json(500, { ok: false, error: e.name === "StoreNichtVerfuegbar" ? e.message : "Interner Fehler: " + e.message });
  }
};

/* ============================ Lesen ============================ */
async function lesen(aktion, q, s, event) {
  switch (aktion) {
    case "uebersicht": {
      const keys = await store.list("anfragen/");
      const neu = keys.filter((k) => Number(k.split("/")[1].split("-")[0]) > Date.now() - WOCHE).length;
      const bew = (await daten.lade("bewertungen")) || [];
      const offen = bew.filter((b) => b.status === "offen").length;
      const status = await daten.publishStatus();
      const einst = await daten.lade("einstellungen");
      const preise = await daten.lade("preise");
      const bilder = await daten.lade("bilder");
      const protokoll = (await store.getJSON("protokoll", [])).slice(0, 8);
      const versionen = await daten.versionen(5);
      return http.json(200, { ok: true, anfragen: { gesamt: keys.length, neuDieseWoche: neu }, bewertungenOffen: offen, bilder: Object.keys(bilder.bilder).length, veroeffentlichung: await statusAktuell(status), konfigurator: einst.konfigurator.status, steuer: Steuer.satz(einst), preislisteVersion: preise.version, protokoll, versionen, name: s.account.name, kontext: store.kontext(), kontextLabel: store.kontextLabel(), store: store.storeName(), buildHook: !!buildHookFuerKontext().hook, buildHookVariable: buildHookFuerKontext().variable, deployApi: !!(process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_BLOBS_TOKEN), mail: !!process.env.BREVO_API_KEY });
    }
    case "daten": {
      const bereich = String(q.bereich || "");
      if (!daten.BEREICHE[bereich]) return http.json(400, { ok: false, error: "Unbekannter Bereich." });
      const d = await daten.lade(bereich);
      const roh = await daten.ladeRoh(bereich);
      return http.json(200, { ok: true, bereich, daten: d, geaendertGegenueberRepo: roh !== null, original: bereich === "preise" || bereich === "einstellungen" ? daten.repoDatei(bereich) : undefined });
    }
    case "versionen": return http.json(200, { ok: true, versionen: await daten.versionen(100) });
    case "version": { const v = await daten.version(String(q.id || "")); return v ? http.json(200, { ok: true, version: v }) : http.json(404, { ok: false, error: "Version nicht gefunden." }); }
    case "status": return http.json(200, { ok: true, veroeffentlichung: await statusAktuell(await daten.publishStatus()), kontext: store.kontext(), kontextLabel: store.kontextLabel() });
    case "anfragen": {
      const keys = (await store.list("anfragen/")).sort().reverse().slice(0, 200);
      const liste = [];
      for (const k of keys) { const a = await store.getJSON(k, null); if (a) liste.push(a); }
      return http.json(200, { ok: true, anfragen: liste });
    }
    case "protokoll": return http.json(200, { ok: true, protokoll: await store.getJSON("protokoll", []) });
    case "konto": {
      const a = s.account;
      return http.json(200, { ok: true, konto: { email: a.email, name: a.name, notify: a.notify, totp: !!(a.totp && a.totp.enabled), letzteAnmeldung: a.lastLogin || 0, erstellt: a.createdAt } });
    }
    default: return http.json(400, { ok: false, error: "Unbekannte Aktion." });
  }
}
const LAUF_TIMEOUT_MS = 15 * 60000;
/* Aktueller Veröffentlichungsstatus: läuft ein Build, wird – falls ein Netlify-API-Token in der Function verfügbar ist –
   der echte Deploy-Zustand abgefragt; sonst gilt nach 15 Minuten „unbekannt – bitte erneut veröffentlichen“. */
async function statusAktuell(st) {
  if (st.status !== "laeuft" || !st.start) return st;
  const echt = await deployZustand(st).catch(() => null);
  if (echt) { const neu = await daten.setPublishStatus(echt); return neu; }
  if (Date.now() - st.start > LAUF_TIMEOUT_MS) {
    return daten.setPublishStatus({ status: "unbekannt", hinweis: "Seit über 15 Minuten keine Rückmeldung vom Build – bitte erneut veröffentlichen (Deploys ggf. im Netlify-Dashboard prüfen).", ende: Date.now() });
  }
  return st;
}
/* Netlify-API: letzten Deploy dieses Kontexts seit Start der Veröffentlichung suchen. Token: NETLIFY_API_TOKEN oder
   NETLIFY_BLOBS_TOKEN (wenn deren Scope auch „Functions“ umfasst); ohne Token → null (kein Fehler). */
async function deployZustand(st, holen) {
  const token = process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_BLOBS_TOKEN, site = process.env.SITE_ID;
  if (!token || !site) return null;
  const f = holen || fetch;
  const r = await f(`https://api.netlify.com/api/v1/sites/${site}/deploys?per_page=10`, { headers: { Authorization: "Bearer " + token } });
  if (!r.ok) return null;
  const deploys = await r.json();
  const ctx = store.kontext();
  const d = deploys.find((x) => x.context === ctx && new Date(x.created_at).getTime() >= st.start - 90000);
  if (!d) return Date.now() - st.start > LAUF_TIMEOUT_MS ? { status: "unbekannt", hinweis: "Kein passender Build bei Netlify gefunden – bitte erneut veröffentlichen.", ende: Date.now() } : null;
  const laeuft = ["new", "enqueued", "pending_review", "accepted", "preparing", "prepared", "building", "processing", "uploading", "uploaded"];
  if (laeuft.includes(d.state)) return null;
  if (d.state === "ready") return { status: "veroeffentlicht", ende: Date.now(), fehler: "", letzteVeroeffentlichung: new Date(d.published_at || d.updated_at || Date.now()).getTime(), deployId: d.id };
  return { status: "fehler", fehler: `Netlify-Deploy ${d.state}: ${d.error_message || "ohne Fehlertext"}`.slice(0, 400), ende: Date.now(), deployId: d.id };
}
/* Build-Hook je Umgebung: Produktion → NETLIFY_BUILD_HOOK; alle anderen Kontexte ausschließlich NETLIFY_BUILD_HOOK_PREVIEW
   (Branch-Hook). Der Produktions-Hook wird außerhalb der Produktion NIE verwendet. */
function buildHookFuerKontext() {
  const k = store.kontext();
  if (k === "production") return { hook: process.env.NETLIFY_BUILD_HOOK || "", variable: "NETLIFY_BUILD_HOOK" };
  return { hook: process.env.NETLIFY_BUILD_HOOK_PREVIEW || "", variable: "NETLIFY_BUILD_HOOK_PREVIEW" };
}

/* ============================ Schreiben ============================ */
async function schreiben(body, s, event) {
  const wer = s.account.email;
  const log = (typ, text) => http.protokoll(event, typ, text, wer);
  switch (body.aktion) {
    /* ---- Daten speichern (mit Validierung + Version) ---- */
    case "speichern": {
      const bereich = String(body.bereich || "");
      if (!daten.BEREICHE[bereich]) return http.json(400, { ok: false, error: "Unbekannter Bereich." });
      let neu, fehler = [];
      if (bereich === "preise") {
        neu = body.daten;
        fehler = validate.validierePreise(neu);
      } else if (bereich === "einstellungen") {
        const alt = await daten.lade("einstellungen");
        const d = body.daten && typeof body.daten === "object" ? body.daten : {};
        const ZWEIGE = ["konfigurator", "steuer", "firma", "bank", "dokumente", "email", "bewertungen", "oeffnungszeiten", "einsatzgebiet", "website"];
        const unbekannt = Object.keys(d).filter((k) => !ZWEIGE.includes(k));
        if (unbekannt.length) return http.json(400, { ok: false, error: "Unbekannter Einstellungsbereich: " + unbekannt.join(", ") });
        neu = daten.tief(alt, d);
        for (const k of Object.keys(neu)) if (k.startsWith("hinweis") || (neu[k] && typeof neu[k] === "object" && "hinweis" in neu[k])) { if (k === "hinweis") delete neu[k]; else delete neu[k].hinweis; }
        if (neu.konfigurator) delete neu.konfigurator.statusWerte;
        fehler = validate.validiereEinstellungen(neu);
        if (!fehler.length && neu.steuer.satzProzent !== Steuer.satz(alt) && !body.bestaetigt) return http.json(409, { ok: false, bestaetigen: true, error: Steuer.texte(neu.steuer.satzProzent).bestaetigung });
        if (!fehler.length && neu.konfigurator.status === "online" && alt.konfigurator.status !== "online" && !body.bestaetigt) return http.json(409, { ok: false, bestaetigen: true, error: "Der Konfigurator wird damit öffentlich sichtbar (Menü, Sitemap, Suchmaschinen). Bitte bestätigen." });
      } else if (bereich === "texte") {
        const reg = daten.repoDatei("texte");
        const roh = (await daten.ladeRoh("texte")) || {};
        const aend = body.daten && typeof body.daten === "object" ? body.daten : {};
        fehler = validate.validiereTexte(Object.fromEntries(Object.entries(aend).filter(([, v]) => v !== null)), reg.bloecke);
        const geschuetzt = Object.keys(aend).filter((id) => reg.bloecke[id] && reg.bloecke[id].geschuetzt);
        if (geschuetzt.length && !body.bestaetigt) return http.json(409, { ok: false, bestaetigen: true, error: "Impressum/Datenschutz sind rechtlich relevante Texte. Änderung wirklich speichern?" });
        neu = Object.assign({}, roh);
        for (const [id, html] of Object.entries(aend)) { if (html === null || (reg.bloecke[id] && validate.sanitizeHtml(html) === reg.bloecke[id].html)) delete neu[id]; else neu[id] = validate.sanitizeHtml(html); }
      } else if (bereich === "bilder") {
        const roh = (await daten.ladeRoh("bilder")) || {};
        const aend = body.daten && typeof body.daten === "object" ? body.daten : {};
        neu = Object.assign({}, roh);
        for (const [id, meta] of Object.entries(aend)) {
          const f = validate.validiereBild(Object.assign({ sektion: "sonstiges" }, meta));
          if (f.length) fehler.push(...f.map((x) => ({ feld: id + "." + x.feld, meldung: x.meldung })));
          neu[id] = Object.assign({}, neu[id] || {}, { titel: String(meta.titel || "").slice(0, 80), alt: String(meta.alt || "").slice(0, 200), sektion: meta.sektion, altGeaendert: true });
        }
      } else if (bereich === "bewertungen") {
        neu = Array.isArray(body.daten) ? body.daten : [];
      }
      if (fehler.length) return http.json(422, { ok: false, error: "Bitte die markierten Felder prüfen.", fehler });
      const v = await daten.speichere(bereich, neu, { wer, beschreibung: String(body.beschreibung || "").slice(0, 200) });
      await log("gespeichert", `${v.titel}: ${v.aenderungen} Änderung(en)${v.beschreibung ? " – " + v.beschreibung : ""}`);
      let veroeffentlichung = null;
      if (body.veroeffentlichen) veroeffentlichung = await veroeffentlichen(s, event, `${v.titel} gespeichert`);
      return http.json(200, { ok: true, version: { id: v.id, wann: v.wann, aenderungen: v.aenderungen }, veroeffentlichung });
    }
    /* ---- Bilder ---- */
    case "bild-hochladen": {
      const id = String(body.id || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80) || ("bild-" + Date.now().toString(36));
      const meta = { titel: body.titel, alt: body.alt, sektion: body.sektion || "sonstiges" };
      const f = validate.validiereBild(meta);
      const dateien = body.dateien && typeof body.dateien === "object" ? body.dateien : {};
      const groessen = Object.keys(dateien).map(Number).filter((g) => [400, 800, 1200, 1600].includes(g)).sort((a, b) => a - b);
      if (!groessen.length) f.push({ feld: "datei", meldung: "Keine Bilddatei empfangen." });
      if (f.length) return http.json(422, { ok: false, error: "Bitte die markierten Felder prüfen.", fehler: f });
      let bytes = 0;
      const puffer = {};
      for (const g of groessen) {
        const buf = Buffer.from(String(dateien[g]).replace(/^data:image\/webp;base64,/, ""), "base64");
        if (buf.length < 12 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WEBP") return http.json(422, { ok: false, error: "Nur WebP-Daten werden angenommen (die Umwandlung erfolgt im Browser)." });
        bytes += buf.length; puffer[g] = buf;
      }
      if (bytes > MAX_BILD_BYTES) return http.json(413, { ok: false, error: "Bild zu groß (max. 2,5 MB nach Umwandlung)." });
      for (const g of groessen) await store.setBinary(`bilder/${id}/${g}`, puffer[g], "image/webp");
      const roh = (await daten.ladeRoh("bilder")) || {};
      const reg = daten.repoDatei("bilder").bilder || {};
      const neu = Object.assign({}, roh);
      neu[id] = Object.assign({}, roh[id] || {}, { blob: true, groessen, breite: Number(body.breite) || 0, hoehe: Number(body.hoehe) || 0, titel: String(meta.titel).slice(0, 80), alt: String(meta.alt).slice(0, 200), sektion: meta.sektion, hochgeladen: Date.now(), geloescht: false }, reg[id] ? {} : { neu: true, seite: "", src: "", loeschbar: true });
      const v = await daten.speichere("bilder", neu, { wer, beschreibung: `Bild ${reg[id] ? "ersetzt" : "hochgeladen"}: ${meta.titel}` });
      await log("bild", `${reg[id] ? "ersetzt" : "hochgeladen"}: ${id} (${Math.round(bytes / 1024)} KB)`);
      return http.json(200, { ok: true, id, version: v.id, bild: neu[id] });
    }
    case "bild-loeschen": {
      const id = String(body.id || "");
      const alle = await daten.lade("bilder");
      const b = alle.bilder[id];
      if (!b) return http.json(404, { ok: false, error: "Bild nicht gefunden." });
      if (!b.loeschbar) return http.json(400, { ok: false, error: "Dieses Bild ist fest in das Seitenlayout eingebaut und kann nur ersetzt, nicht gelöscht werden." });
      const roh = (await daten.ladeRoh("bilder")) || {};
      const neu = Object.assign({}, roh);
      if (b.neu) { delete neu[id]; for (const g of b.groessen || []) await store.del(`bilder/${id}/${g}`); }
      else neu[id] = Object.assign({}, roh[id] || {}, { geloescht: !body.wiederherstellen });
      const v = await daten.speichere("bilder", neu, { wer, beschreibung: `Bild ${body.wiederherstellen ? "wieder eingeblendet" : "gelöscht"}: ${b.titel || id}` });
      await log("bild", `${body.wiederherstellen ? "wiederhergestellt" : "gelöscht"}: ${id}`);
      return http.json(200, { ok: true, version: v.id });
    }
    /* ---- Bewertungen freigeben / ablehnen ---- */
    case "bewertung": {
      const liste = (await daten.lade("bewertungen")) || [];
      const b = liste.find((x) => x.id === body.id);
      if (!b) return http.json(404, { ok: false, error: "Bewertung nicht gefunden." });
      if (!["freigegeben", "abgelehnt", "offen"].includes(body.status)) return http.json(400, { ok: false, error: "Ungültiger Status." });
      b.status = body.status; b.entschieden = Date.now(); b.von = wer;
      if (body.text !== undefined) b.text = String(body.text).slice(0, 2000);
      const v = await daten.speichere("bewertungen", liste, { wer, beschreibung: `Bewertung von ${b.name}: ${b.status}` });
      await log("bewertung", `${b.name} (${b.ort}) → ${b.status}`);
      return http.json(200, { ok: true, version: v.id });
    }
    /* ---- Versionen ---- */
    case "wiederherstellen": {
      const v = await daten.wiederherstelle(String(body.id || ""), wer);
      if (!v) return http.json(404, { ok: false, error: "Version nicht gefunden." });
      await log("wiederhergestellt", `${v.titel}: ${v.beschreibung}`);
      const pub = await veroeffentlichen(s, event, v.beschreibung);
      return http.json(200, { ok: true, version: v.id, veroeffentlichung: pub });
    }
    case "veroeffentlichen": {
      const pub = await veroeffentlichen(s, event, String(body.grund || "Manuell"));
      return http.json(pub.ok ? 200 : 409, Object.assign({ ok: pub.ok }, pub));
    }
    case "status-zuruecksetzen": {
      const alt = await daten.publishStatus();
      const neu = await daten.setPublishStatus({ status: "unbekannt", hinweis: "Status manuell zurückgesetzt – bitte erneut veröffentlichen, um den aktuellen Stand sicher online zu bringen.", ende: Date.now(), fehler: "" });
      await log("status-zurueckgesetzt", `Veröffentlichungsstatus „${alt.status}“ zurückgesetzt`);
      return http.json(200, { ok: true, veroeffentlichung: neu });
    }
    /* ---- Testrechner (Server) ---- */
    case "rechnen": {
      const liste = body.preise && typeof body.preise === "object" ? body.preise : await daten.lade("preise");
      const vf = validate.validierePreise(liste);
      if (vf.length) return http.json(422, { ok: false, error: "Preisliste ungültig.", fehler: vf });
      const satz = Steuer.satz(await daten.lade("einstellungen"));
      const r = Preis.berechne(body.konfiguration || {}, liste, satz);
      return http.json(200, { ok: true, ergebnis: r, steuerProzent: satz, text: r.ok ? Steuer.preisMitZusatz(Preis.euro(r.endpreis), satz) : null });
    }
    case "anfrage-status": {
      const k = "anfragen/" + String(body.id || "").replace(/[^a-z0-9-]/gi, "");
      const a = await store.getJSON(k, null);
      if (!a) return http.json(404, { ok: false, error: "Anfrage nicht gefunden." });
      a.status = body.status === "erledigt" ? "erledigt" : "neu";
      await store.setJSON(k, a);
      return http.json(200, { ok: true });
    }
    /* ---- Konto ---- */
    case "email-aendern": {
      const email = String(body.email || "").trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return http.json(422, { ok: false, error: "Bitte eine gültige E-Mail-Adresse angeben." });
      if (!(await auth.verifyPassword(String(body.passwort || ""), s.account.passwordHash))) return http.json(401, { ok: false, error: "Das Passwort ist falsch." });
      const t = await auth.createLink("email", { email });
      const link = `${http.siteUrl(event)}/admin/?email=${t}`;
      const v = mail.vorlagen.emailBestaetigen(link);
      const m = await mail.send({ to: email, subject: v.subject, text: v.text });
      await log("email-aenderung", `Bestätigung an ${email} ${m.ok ? "gesendet" : "NICHT gesendet (" + (m.skipped ? "E-Mail-Versand nicht eingerichtet" : m.error) + ")"}`);
      if (!m.ok && http.isProduction()) return http.json(502, { ok: false, error: "E-Mail konnte nicht gesendet werden – der E-Mail-Versand ist nicht eingerichtet oder gestört." });
      return http.json(200, { ok: true, hinweis: m.ok ? `Bestätigungslink an ${email} gesendet (30 Minuten gültig). Erst nach Klick ist die neue Adresse aktiv.` : "E-Mail-Versand nicht konfiguriert – Link nur in dieser Vorschau:", link: m.ok ? undefined : link });
    }
    case "passwort-aendern": {
      const r = await auth.changePassword(String(body.aktuell || ""), String(body.neu || ""));
      await log(r.ok ? "passwort-geaendert" : "passwort-fehler", r.ok ? "Passwort geändert, alle anderen Sitzungen beendet" : r.error);
      if (!r.ok) return http.json(400, r);
      const sess = await auth.createSession(await auth.getAccount(), !!s.session.remember);
      return http.json(200, { ok: true, csrf: http.csrfFor(sess.token) }, { "Set-Cookie": auth.cookieHeader(sess.token, sess.maxAge, http.isSecure(event)) });
    }
    case "benachrichtigungen": {
      const a = await auth.getAccount();
      const email = String(body.email || a.email).trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return http.json(422, { ok: false, error: "Bitte eine gültige E-Mail-Adresse für Benachrichtigungen angeben." });
      a.notify = { email, anfragen: !!body.anfragen, bewertungen: !!body.bewertungen };
      await auth.saveAccount(a);
      await log("benachrichtigungen", `Anfragen ${a.notify.anfragen ? "an" : "aus"}, Bewertungen ${a.notify.bewertungen ? "an" : "aus"} → ${email}`);
      return http.json(200, { ok: true, notify: a.notify });
    }
    case "totp-start": {
      const a = await auth.getAccount();
      const secret = auth.newTotpSecret();
      a.totpPending = { secret, seit: Date.now() };
      await auth.saveAccount(a);
      return http.json(200, { ok: true, secret, url: auth.otpauthUrl(secret, a.email) });
    }
    case "totp-aktivieren": {
      const a = await auth.getAccount();
      if (!a.totpPending) return http.json(400, { ok: false, error: "Bitte zuerst die Einrichtung starten." });
      if (!auth.verifyTotp(a.totpPending.secret, String(body.code || ""))) return http.json(400, { ok: false, error: "Code ungültig. Bitte den aktuellen Code aus der App eingeben." });
      a.totp = { enabled: true, secret: a.totpPending.secret, seit: Date.now(), lastStep: Math.floor(Date.now() / 30000) };
      delete a.totpPending;
      await auth.saveAccount(a);
      await log("2fa", "Zwei-Faktor-Authentifizierung aktiviert");
      return http.json(200, { ok: true });
    }
    case "totp-deaktivieren": {
      const a = await auth.getAccount();
      if (!(await auth.verifyPassword(String(body.passwort || ""), a.passwordHash))) return http.json(401, { ok: false, error: "Das Passwort ist falsch." });
      a.totp = null; delete a.totpPending;
      await auth.saveAccount(a);
      await log("2fa", "Zwei-Faktor-Authentifizierung deaktiviert");
      return http.json(200, { ok: true });
    }
    case "ueberall-abmelden": {
      await auth.logoutAll();
      await log("logout-alle", "Alle Sitzungen beendet");
      return http.json(200, { ok: true }, { "Set-Cookie": auth.cookieHeader("", 0, http.isSecure(event)) });
    }
    default: return http.json(400, { ok: false, error: "Unbekannte Aktion." });
  }
}

/* ---- Veröffentlichen: Daten prüfen, Status „läuft“, Netlify Build Hook auslösen ---- */
async function veroeffentlichen(s, event, grund) {
  const preise = await daten.lade("preise");
  const fp = validate.validierePreise(preise);
  if (fp.length) return { ok: false, error: "Nicht veröffentlicht – Preisliste ungültig: " + fp.map((x) => x.meldung).join(" ") };
  const { hook, variable } = buildHookFuerKontext();
  const wer = s.account.email;
  if (!hook) {
    const vorschau = store.kontext() !== "production";
    const text = vorschau
      ? `Testumgebung (${store.kontextLabel()}): Änderungen gespeichert, aber nicht veröffentlicht – die Live-Website wird von hier aus nie verändert.`
      : "Die automatische Veröffentlichung ist noch nicht eingerichtet – Änderungen sind gespeichert, aber noch nicht auf der Website.";
    await daten.setPublishStatus({ status: vorschau ? "gespeichert" : "fehler", fehler: vorschau ? "" : text, hinweis: vorschau ? text : "", ende: Date.now() });
    await http.protokoll(event, vorschau ? "veroeffentlichung-uebersprungen" : "veroeffentlichung-fehler", vorschau ? "Testumgebung – Live-Website nicht verändert" : "Automatische Veröffentlichung nicht eingerichtet", wer);
    return { ok: false, uebersprungen: vorschau, error: vorschau ? text : "Nicht veröffentlicht: Die automatische Veröffentlichung ist noch nicht eingerichtet. Die Änderungen sind gespeichert." };
  }
  const aktuell = await statusAktuell(await daten.publishStatus());
  if (aktuell.status === "laeuft" && aktuell.start && Date.now() - aktuell.start < LAUF_TIMEOUT_MS) return { ok: false, error: "Es läuft bereits eine Veröffentlichung. Bitte warten, bis sie abgeschlossen ist (oder den Status zurücksetzen).", veroeffentlichung: aktuell };
  const titel = `Admin: ${grund} (${wer})`.slice(0, 120);
  const url = hook + (hook.includes("?") ? "&" : "?") + "trigger_title=" + encodeURIComponent(titel);
  const st = await daten.setPublishStatus({ status: "laeuft", start: Date.now(), ende: 0, fehler: "", ausloeser: titel, von: wer });
  const r = await fetch(url, { method: "POST", body: "" }).catch((e) => ({ ok: false, status: 0, statusText: e.message }));
  if (!r.ok) {
    await daten.setPublishStatus({ status: "fehler", fehler: `Build Hook antwortete mit ${r.status} ${r.statusText || ""}`.trim(), ende: Date.now() });
    await http.protokoll(event, "veroeffentlichung-fehler", "Build Hook " + r.status, wer);
    return { ok: false, error: `Nicht veröffentlicht – Fehler: Build Hook antwortete mit ${r.status}.` };
  }
  await http.protokoll(event, "veroeffentlichung", "Build ausgelöst: " + grund, wer);
  return { ok: true, veroeffentlichung: st };
}
module.exports.deployZustand = deployZustand;
module.exports.buildHookFuerKontext = buildHookFuerKontext;
module.exports.statusAktuell = statusAktuell;
