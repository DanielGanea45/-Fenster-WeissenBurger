/* Netlify Function: Anmeldung und Konto-Sicherheit des Admin-Bereichs.
   POST { aktion, ... } – aktionen: status, einrichten, anmelden, abmelden, passwort-vergessen,
   passwort-neu, email-bestaetigen. Sitzung = httpOnly/Secure/SameSite=Strict-Cookie.
   Auf Produktion antwortet alles mit 404, solange ADMIN_SETUP_TOKEN nicht gesetzt ist. */
"use strict";
const auth = require("./_lib/auth");
const store = require("./_lib/store");
const http = require("./_lib/http");
const mail = require("./_lib/mail");

exports.handler = async (event) => {
  http.verbinde(event);
  try { return await handler(event); }
  catch (e) { console.error("admin-auth:", e); return http.json(500, { ok: false, error: "Serverfehler – " + (e.name === "StoreNichtVerfuegbar" ? e.message : "Anfrage konnte nicht verarbeitet werden (" + e.message + ")") }); }
};

async function handler(event) {
  if (!http.adminEnabled()) return http.notFound();
  const kontoDa = await auth.accountExists();

  if (event.httpMethod === "GET") {
    /* Zustand für die Oberfläche: eingerichtet? angemeldet? */
    const s = await http.requireSession(event);
    return http.json(200, { ok: true, eingerichtet: kontoDa, angemeldet: s.ok, csrf: s.ok ? s.csrf : null, name: s.ok ? s.account.name : null, email: s.ok ? s.account.email : null, kontext: store.kontext(), kontextLabel: store.kontextLabel() });
  }
  if (event.httpMethod !== "POST") return http.json(405, { ok: false, error: "Methode nicht erlaubt." });
  const body = http.parseBody(event);
  if (!body) return http.json(400, { ok: false, error: "Ungültige Anfrage." });
  if (!http.sameOrigin(event)) return http.json(403, { ok: false, error: "Anfrage von fremder Herkunft abgelehnt." });
  const rl = await http.rateLimit(event, "auth", 30);
  if (!rl.ok) return rl.response;
  const secure = http.isSecure(event);
  const site = http.siteUrl(event);

  switch (body.aktion) {
    case "einrichten": {
      if (kontoDa) return http.json(409, { ok: false, error: "Es gibt bereits ein Konto. Bitte anmelden." });
      const r = await auth.setup({ token: String(body.token || ""), tokenRoh: body.tokenRoh !== undefined ? String(body.tokenRoh) : undefined, email: String(body.email || "").trim(), password: String(body.passwort || ""), name: String(body.name || "").trim() });
      if (!r.ok) { await http.protokoll(event, "einrichtung-fehler", r.error); return http.json(400, { ok: false, error: r.error }); }
      await http.protokoll(event, "einrichtung", "Konto angelegt: " + r.account.email, r.account.email);
      const s = await auth.createSession(r.account, false);
      return http.json(200, { ok: true, csrf: http.csrfFor(s.token) }, { "Set-Cookie": auth.cookieHeader(s.token, s.maxAge, secure) });
    }
    case "anmelden": {
      if (!kontoDa) return http.json(404, { ok: false, error: "Noch kein Konto eingerichtet." });
      const r = await auth.login({ email: String(body.email || "").trim(), password: String(body.passwort || ""), code: body.code ? String(body.code) : "", remember: !!body.merken });
      if (!r.ok) {
        await http.protokoll(event, r.locked ? "login-gesperrt" : "login-fehler", (r.error || "") + " (" + String(body.email || "").slice(0, 60) + ")");
        return http.json(r.needTotp ? 200 : 401, { ok: false, error: r.error, gesperrt: !!r.locked, zweiFaktor: !!r.needTotp, verbleibend: r.remaining });
      }
      await http.protokoll(event, "login", "Anmeldung erfolgreich", String(body.email).toLowerCase());
      return http.json(200, { ok: true, csrf: http.csrfFor(r.session.token) }, { "Set-Cookie": auth.cookieHeader(r.session.token, r.session.maxAge, secure) });
    }
    case "abmelden": {
      const token = auth.parseCookie((event.headers || {}).cookie);
      await auth.destroySession(token);
      await http.protokoll(event, "logout", "Abmeldung");
      return http.json(200, { ok: true }, { "Set-Cookie": auth.cookieHeader("", 0, secure) });
    }
    case "passwort-vergessen": {
      /* Antwort ist immer gleich, damit keine Adressen erraten werden können */
      const a = await auth.getAccount();
      const email = String(body.email || "").trim().toLowerCase();
      if (a && email === a.email) {
        const t = await auth.createLink("reset", { email });
        const link = `${site}/admin/?reset=${t}`;
        const v = mail.vorlagen.reset(link);
        const m = await mail.send({ to: a.email, subject: v.subject, text: v.text });
        await http.protokoll(event, "passwort-vergessen", m.ok ? "Link per E-Mail gesendet" : "Link erzeugt, Versand: " + (m.skipped ? "kein BREVO_API_KEY" : m.error), a.email);
        /* Ohne Mailversand (lokal/Vorschau ohne Schlüssel) wird der Link direkt zurückgegeben – nur außerhalb der Produktion */
        if (!m.ok && !http.isProduction()) return http.json(200, { ok: true, hinweis: "E-Mail-Versand nicht konfiguriert (BREVO_API_KEY). Link nur in dieser Vorschau sichtbar:", link });
      } else await http.protokoll(event, "passwort-vergessen", "unbekannte Adresse " + email.slice(0, 60));
      return http.json(200, { ok: true, hinweis: "Wenn die Adresse zu einem Konto gehört, wurde ein Link gesendet (30 Minuten gültig)." });
    }
    case "passwort-neu": {
      const r = await auth.resetPassword(String(body.token || ""), String(body.passwort || ""));
      await http.protokoll(event, r.ok ? "passwort-zurueckgesetzt" : "passwort-reset-fehler", r.ok ? "Neues Passwort gesetzt" : r.error);
      return http.json(r.ok ? 200 : 400, r);
    }
    case "email-bestaetigen": {
      const r = await auth.confirmEmail(String(body.token || ""));
      await http.protokoll(event, r.ok ? "email-geaendert" : "email-bestaetigung-fehler", r.ok ? "Neue Adresse aktiv: " + r.email : r.error);
      return http.json(r.ok ? 200 : 400, r);
    }
    default:
      return http.json(400, { ok: false, error: "Unbekannte Aktion." });
  }
}
