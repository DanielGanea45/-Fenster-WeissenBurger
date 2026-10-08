/* E-Mail-Versand über Brevo (kostenloser Plan, transaktionale API). Ohne BREVO_API_KEY werden Mails nur
   protokolliert (Rückgabe { ok:false, skipped:true }), damit Vorschau/Tests ohne Konto funktionieren. */
"use strict";
const Hinweise = require("../../../js/hinweise.js");
const API = "https://api.brevo.com/v3/smtp/email";

function sender(absenderName) {
  return { name: absenderName || process.env.MAIL_FROM_NAME || "Fenster-WeissenBurger Website", email: process.env.MAIL_FROM || "info@fenster-weissenburger.de" };
}
/* Simulierter Versand: unter `node --test` (Node setzt NODE_TEST_CONTEXT in jedem Testprozess) oder mit FW_MAIL_SIMULIEREN=1
   wird Brevo NIE kontaktiert – auch wenn im Build der echte BREVO_API_KEY gesetzt ist. Jede simulierte Mail landet im
   Protokoll (für Tests: Empfänger, Absender, Antwort-an, Betreff, Text). */
const protokoll = [];
function simuliert() { return !!(process.env.NODE_TEST_CONTEXT || /^(1|true|ja)$/i.test(String(process.env.FW_MAIL_SIMULIEREN || ""))); }
async function send({ to, subject, text, html, absenderName, cc, replyTo, anhaenge }) {
  const key = process.env.BREVO_API_KEY;
  if (!key) { console.log("[mail skipped] an:", to, "Betreff:", subject, anhaenge ? "Anhänge: " + anhaenge.map((a) => a.name).join(", ") : ""); return { ok: false, skipped: true }; }
  const body = { sender: sender(absenderName), to: [{ email: to }], subject, textContent: text, htmlContent: html || `<pre style="font:15px/1.5 Manrope,Arial,sans-serif;white-space:pre-wrap">${escapeHtml(text)}</pre>` };
  if (cc) body.cc = [{ email: cc }];
  if (replyTo) body.replyTo = { email: replyTo };
  if (anhaenge && anhaenge.length) body.attachment = anhaenge.map((a) => ({ name: a.name, content: Buffer.isBuffer(a.inhalt) ? a.inhalt.toString("base64") : String(a.inhalt) }));
  if (simuliert()) { protokoll.push({ to, cc: cc || "", replyTo: replyTo || "", sender: body.sender, subject, text, anhaenge: (anhaenge || []).map((a) => a.name) }); return { ok: true, simuliert: true }; }
  const r = await fetch(API, { method: "POST", headers: { "api-key": key, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) { const t = await r.text().catch(() => ""); return { ok: false, error: `Brevo ${r.status}: ${t.slice(0, 200)}` }; }
  return { ok: true };
}
function escapeHtml(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

const vorlagen = {
  reset: (link) => ({ subject: "Passwort zurücksetzen – Fenster-WeissenBurger Admin", text: `Guten Tag,\n\nüber diesen Link können Sie ein neues Passwort für den Admin-Bereich festlegen (30 Minuten gültig):\n${link}\n\nWenn Sie das nicht angefordert haben, ignorieren Sie diese E-Mail – Ihr Passwort bleibt unverändert.` }),
  emailBestaetigen: (link) => ({ subject: "Neue E-Mail-Adresse bestätigen – Fenster-WeissenBurger Admin", text: `Guten Tag,\n\nbitte bestätigen Sie Ihre neue Anmelde-E-Mail-Adresse über diesen Link (30 Minuten gültig):\n${link}\n\nErst nach der Bestätigung wird die neue Adresse aktiv.` }),
  neueAnfrage: (fields, adminUrl) => ({ subject: `Neue Anfrage: ${fields.name || "?"} · ${fields.produkt || fields.leistung || fields.ort || ""}`.trim(), text: `Neue Anfrage über die Website:\n\n${Object.entries(fields).filter(([k]) => !/^(bot-field|ts|js|form-name)$/.test(k)).map(([k, v]) => `${k}: ${v}`).join("\n")}${fields.preis_server_text || fields.preis_browser ? `\n\n${Hinweise.richtpreis.lang}` : ""}\n\nAlle Anfragen im Admin: ${adminUrl}#anfragen` }),
  neueBewertung: (fields, adminUrl) => ({ subject: `Neue Bewertung zur Prüfung: ${fields.name || "?"} · ${fields.sterne || "?"} Sterne`, text: `Eine neue Bewertung wartet auf Freigabe:\n\n${fields.name} (${fields.ort}) – ${fields.projekt} – ${fields.sterne} Sterne\n„${fields.text}“\n\nPrüfen und freigeben: ${adminUrl}#bewertungen` }),
  /* Bestätigung an den Kunden nach einer Anfrage (nur mit E-Mail-Adresse) */
  bestaetigungAnfrage: (fields, firma) => {
    const f = firma || {};
    const zeilen = [["Name", fields.name], ["Telefon", fields.telefon], ["E-Mail", fields.email], ["PLZ", fields.plz], ["Ort", fields.ort], ["Anliegen", fields.produkt || fields.leistung], ["Anzahl", fields["anzahl-fenster"] || fields["anzahl-elemente"] || fields.anzahl], ["Nachricht", fields.nachricht]].filter(([, v]) => v && String(v).trim());
    const preis = fields.preis_server_text ? `\nIhr unverbindlicher Richtpreis aus dem Konfigurator: ${fields.preis_server_text}\n` : "";
    return {
      subject: `Vielen Dank für Ihre Anfrage – ${f.name || "Fenster-WeissenBurger"}`,
      text: `Guten Tag${fields.name ? " " + fields.name : ""},\n\nvielen Dank für Ihre Anfrage – sie ist bei uns eingegangen. Wir melden uns innerhalb von zwei Werktagen bei Ihnen und vereinbaren gern einen Termin für Beratung und kostenloses Aufmaß.\n\nIhre Angaben:\n${zeilen.map(([k, v]) => `${k}: ${v}`).join("\n")}\n${preis}\nMit freundlichen Grüßen\n${f.name || "Fenster-WeissenBurger"}\n${[f.telefon, f.email, f.zeiten].filter(Boolean).join(" · ")}\n\nDiese Bestätigung wurde automatisch erstellt; Sie können einfach auf diese E-Mail antworten.`,
    };
  },
  veroeffentlicht: (ok, detail) => ({ subject: ok ? "Website veröffentlicht" : "Veröffentlichung fehlgeschlagen", text: ok ? `Die Website wurde erfolgreich neu veröffentlicht.\n${detail || ""}` : `Die Veröffentlichung ist fehlgeschlagen; die bisherige Version bleibt online.\n\n${detail || ""}` }),
};

module.exports = { send, vorlagen, escapeHtml, protokoll, simuliert };
