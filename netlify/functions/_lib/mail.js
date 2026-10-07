/* E-Mail-Versand über Brevo (kostenloser Plan, transaktionale API). Ohne BREVO_API_KEY werden Mails nur
   protokolliert (Rückgabe { ok:false, skipped:true }), damit Vorschau/Tests ohne Konto funktionieren. */
"use strict";
const API = "https://api.brevo.com/v3/smtp/email";

function sender(absenderName) {
  return { name: absenderName || process.env.MAIL_FROM_NAME || "Fenster-WeissenBurger Website", email: process.env.MAIL_FROM || "info@fenster-weissenburger.de" };
}
async function send({ to, subject, text, html, absenderName, cc, replyTo, anhaenge }) {
  const key = process.env.BREVO_API_KEY;
  if (!key) { console.log("[mail skipped] an:", to, "Betreff:", subject, anhaenge ? "Anhänge: " + anhaenge.map((a) => a.name).join(", ") : ""); return { ok: false, skipped: true }; }
  const body = { sender: sender(absenderName), to: [{ email: to }], subject, textContent: text, htmlContent: html || `<pre style="font:15px/1.5 Manrope,Arial,sans-serif;white-space:pre-wrap">${escapeHtml(text)}</pre>` };
  if (cc) body.cc = [{ email: cc }];
  if (replyTo) body.replyTo = { email: replyTo };
  if (anhaenge && anhaenge.length) body.attachment = anhaenge.map((a) => ({ name: a.name, content: Buffer.isBuffer(a.inhalt) ? a.inhalt.toString("base64") : String(a.inhalt) }));
  const r = await fetch(API, { method: "POST", headers: { "api-key": key, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) { const t = await r.text().catch(() => ""); return { ok: false, error: `Brevo ${r.status}: ${t.slice(0, 200)}` }; }
  return { ok: true };
}
function escapeHtml(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

const vorlagen = {
  reset: (link) => ({ subject: "Passwort zurücksetzen – Fenster-WeissenBurger Admin", text: `Guten Tag,\n\nüber diesen Link können Sie ein neues Passwort für den Admin-Bereich festlegen (30 Minuten gültig):\n${link}\n\nWenn Sie das nicht angefordert haben, ignorieren Sie diese E-Mail – Ihr Passwort bleibt unverändert.` }),
  emailBestaetigen: (link) => ({ subject: "Neue E-Mail-Adresse bestätigen – Fenster-WeissenBurger Admin", text: `Guten Tag,\n\nbitte bestätigen Sie Ihre neue Anmelde-E-Mail-Adresse über diesen Link (30 Minuten gültig):\n${link}\n\nErst nach der Bestätigung wird die neue Adresse aktiv.` }),
  neueAnfrage: (fields, adminUrl) => ({ subject: `Neue Anfrage: ${fields.name || "?"} · ${fields.produkt || fields.leistung || fields.ort || ""}`.trim(), text: `Neue Anfrage über die Website:\n\n${Object.entries(fields).filter(([k]) => !/^(bot-field|ts|js|form-name)$/.test(k)).map(([k, v]) => `${k}: ${v}`).join("\n")}\n\nAlle Anfragen im Admin: ${adminUrl}#anfragen` }),
  neueBewertung: (fields, adminUrl) => ({ subject: `Neue Bewertung zur Prüfung: ${fields.name || "?"} · ${fields.sterne || "?"} Sterne`, text: `Eine neue Bewertung wartet auf Freigabe:\n\n${fields.name} (${fields.ort}) – ${fields.projekt} – ${fields.sterne} Sterne\n„${fields.text}“\n\nPrüfen und freigeben: ${adminUrl}#bewertungen` }),
  veroeffentlicht: (ok, detail) => ({ subject: ok ? "Website veröffentlicht" : "Veröffentlichung fehlgeschlagen", text: ok ? `Die Website wurde erfolgreich neu veröffentlicht.\n${detail || ""}` : `Die Veröffentlichung ist fehlgeschlagen; die bisherige Version bleibt online.\n\n${detail || ""}` }),
};

module.exports = { send, vorlagen, escapeHtml };
