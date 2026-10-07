/* Tests: Einrichtung, Anmeldung, Sperre nach 5 Fehlversuchen, Sitzungen, Einmal-Links, TOTP, CSRF.
   Läuft gegen einen temporären Dateistore (FW_STORE_DIR) – berührt nie Netlify Blobs. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fw-admin-auth-"));
process.env.FW_STORE_DIR = dir;
process.env.ADMIN_SETUP_TOKEN = "test-setup-token-1234567890";
delete process.env.NETLIFY; delete process.env.CONTEXT; delete process.env.URL;

const auth = require("../netlify/functions/_lib/auth");
const http = require("../netlify/functions/_lib/http");
const authFn = require("../netlify/functions/admin-auth");
const apiFn = require("../netlify/functions/admin-api");

const PW = "SicheresPasswort!2026";
let ipZaehler = 0; // jede Anfrage von einer anderen Test-IP, damit nur der Rate-Limit-Test selbst das Limit erreicht
const ev = (method, body, extra = {}) => Object.assign({ httpMethod: method, path: "/.netlify/functions/admin-auth", headers: Object.assign({ host: "localhost:8888", origin: "http://localhost:8888", "x-forwarded-for": "203.0.113." + (++ipZaehler % 250) }, extra.headers || {}), body: body ? JSON.stringify(body) : null, queryStringParameters: extra.query || {} }, extra.props || {});
const parse = (r) => JSON.parse(r.body);
const cookieOf = (r) => (r.headers["Set-Cookie"] || "").split(";")[0];

test("Passwortregeln: mindestens 12 Zeichen", () => {
  assert.ok(auth.passwordProblems("kurz").length > 0);
  assert.ok(auth.passwordProblems("aaaaaaaaaaaaaaaa").length > 0);
  assert.equal(auth.passwordProblems(PW).length, 0);
});

test("Ohne Konto: Anmeldung nicht möglich, Einrichtung nur mit gültigem Token", async () => {
  let r = await authFn.handler(ev("GET"));
  assert.equal(parse(r).eingerichtet, false);
  r = await authFn.handler(ev("POST", { aktion: "anmelden", email: "a@b.de", passwort: PW }));
  assert.equal(r.statusCode, 404);
  r = await authFn.handler(ev("POST", { aktion: "einrichten", token: "falsch", email: "daniel@example.de", passwort: PW }));
  assert.equal(r.statusCode, 400);
  assert.match(parse(r).error, /Token ungültig/);
  r = await authFn.handler(ev("POST", { aktion: "einrichten", token: process.env.ADMIN_SETUP_TOKEN, email: "daniel@example.de", passwort: "zu-kurz" }));
  assert.equal(r.statusCode, 400);
  assert.match(parse(r).error, /12 Zeichen/);
});

let cookie = "", csrf = "";
test("Einrichtung mit Token legt das Konto an und meldet an; zweiter Versuch scheitert", async () => {
  let r = await authFn.handler(ev("POST", { aktion: "einrichten", token: process.env.ADMIN_SETUP_TOKEN, email: "Daniel@Example.de", passwort: PW, name: "Daniel" }));
  assert.equal(r.statusCode, 200, r.body);
  const sc = r.headers["Set-Cookie"];
  assert.match(sc, /HttpOnly/); assert.match(sc, /SameSite=Strict/);
  cookie = cookieOf(r); csrf = parse(r).csrf;
  const a = await auth.getAccount();
  assert.equal(a.email, "daniel@example.de");
  assert.notEqual(a.passwordHash, PW);
  assert.match(a.passwordHash, /^\$2[aby]\$/);
  r = await authFn.handler(ev("POST", { aktion: "einrichten", token: process.env.ADMIN_SETUP_TOKEN, email: "x@y.de", passwort: PW }));
  assert.equal(r.statusCode, 409);
});

test("Angemeldete Sitzung wird erkannt, fremde Cookies nicht", async () => {
  let r = await authFn.handler(ev("GET", null, { headers: { cookie } }));
  assert.equal(parse(r).angemeldet, true);
  r = await authFn.handler(ev("GET", null, { headers: { cookie: "fw_admin=abcdefghijklmnopqrstuvwxyz0123456789" } }));
  assert.equal(parse(r).angemeldet, false);
});

test("Sperre: nach 5 Fehlversuchen 15 Minuten gesperrt – auch mit richtigem Passwort", async () => {
  for (let i = 1; i <= 4; i++) {
    const r = await authFn.handler(ev("POST", { aktion: "anmelden", email: "daniel@example.de", passwort: "falsch-" + i }));
    assert.equal(r.statusCode, 401);
    assert.equal(parse(r).verbleibend, 5 - i);
  }
  let r = await authFn.handler(ev("POST", { aktion: "anmelden", email: "daniel@example.de", passwort: "falsch-5" }));
  assert.equal(parse(r).gesperrt, true);
  r = await authFn.handler(ev("POST", { aktion: "anmelden", email: "daniel@example.de", passwort: PW }));
  assert.equal(parse(r).gesperrt, true);
  assert.match(parse(r).error, /gesperrt/);
  const a = await auth.getAccount();
  assert.ok(a.lockedUntil > Date.now() + 14 * 60000 && a.lockedUntil <= Date.now() + 15 * 60000);
  /* Sperre abgelaufen → Anmeldung klappt wieder */
  a.lockedUntil = Date.now() - 1; await auth.saveAccount(a);
  r = await authFn.handler(ev("POST", { aktion: "anmelden", email: "daniel@example.de", passwort: PW, merken: true }));
  assert.equal(r.statusCode, 200);
  assert.match(r.headers["Set-Cookie"], /Max-Age=2592000/);
  cookie = cookieOf(r); csrf = parse(r).csrf;
});

test("Falsches Passwort verrät nicht, ob die E-Mail existiert", async () => {
  const r1 = await authFn.handler(ev("POST", { aktion: "anmelden", email: "daniel@example.de", passwort: "nein-nein-nein" }));
  const r2 = await authFn.handler(ev("POST", { aktion: "anmelden", email: "wer@anders.de", passwort: "nein-nein-nein" }));
  assert.equal(parse(r1).error, parse(r2).error);
  const a = await auth.getAccount(); a.failed = 0; await auth.saveAccount(a);
});

test("Rate-Limit greift bei zu vielen Anfragen von einer IP", async () => {
  let letzte;
  for (let i = 0; i < 35; i++) letzte = await authFn.handler(ev("POST", { aktion: "passwort-vergessen", email: "niemand@example.de" }, { headers: { "x-forwarded-for": "198.51.100.9" } }));
  assert.equal(letzte.statusCode, 429);
});

test("API: ohne Sitzung 401, ohne CSRF-Token 403, mit beidem 200", async () => {
  let r = await apiFn.handler(ev("GET", null, { query: { aktion: "konto" } }));
  assert.equal(r.statusCode, 401);
  r = await apiFn.handler(ev("GET", null, { query: { aktion: "konto" }, headers: { cookie } }));
  assert.equal(r.statusCode, 200);
  assert.equal(parse(r).konto.email, "daniel@example.de");
  r = await apiFn.handler(ev("POST", { aktion: "benachrichtigungen", anfragen: true, bewertungen: false }, { headers: { cookie } }));
  assert.equal(r.statusCode, 403);
  r = await apiFn.handler(ev("POST", { aktion: "benachrichtigungen", anfragen: true, bewertungen: false }, { headers: { cookie, "x-csrf": csrf, origin: "https://boese.example" } }));
  assert.equal(r.statusCode, 403);
  r = await apiFn.handler(ev("POST", { aktion: "benachrichtigungen", anfragen: true, bewertungen: false }, { headers: { cookie, "x-csrf": csrf } }));
  assert.equal(r.statusCode, 200);
  assert.equal(parse(r).notify.bewertungen, false);
});

test("Passwort vergessen: Link 30 Minuten gültig, einmal verwendbar, beendet alte Sitzungen", async () => {
  let r = await authFn.handler(ev("POST", { aktion: "passwort-vergessen", email: "daniel@example.de" }));
  const link = parse(r).link; // ohne BREVO_API_KEY außerhalb der Produktion zurückgegeben
  assert.ok(link && /reset=/.test(link));
  const token = link.split("reset=")[1];
  r = await authFn.handler(ev("POST", { aktion: "passwort-neu", token: "falsch", passwort: PW + "neu" }));
  assert.equal(r.statusCode, 400);
  r = await authFn.handler(ev("POST", { aktion: "passwort-neu", token, passwort: PW + "neu" }));
  assert.equal(r.statusCode, 200, r.body);
  r = await authFn.handler(ev("POST", { aktion: "passwort-neu", token, passwort: PW + "nochmal" }));
  assert.equal(r.statusCode, 400);
  /* alte Sitzung ist ungültig */
  r = await authFn.handler(ev("GET", null, { headers: { cookie } }));
  assert.equal(parse(r).angemeldet, false);
  r = await authFn.handler(ev("POST", { aktion: "anmelden", email: "daniel@example.de", passwort: PW + "neu" }));
  assert.equal(r.statusCode, 200);
  cookie = cookieOf(r); csrf = parse(r).csrf;
  /* abgelaufener Link */
  const t2 = await auth.createLink("reset", { email: "daniel@example.de" });
  const store = require("../netlify/functions/_lib/store");
  const crypto = require("crypto");
  const key = "links/" + crypto.createHash("sha256").update(t2).digest("hex");
  const rec = await store.getJSON(key); rec.expiresAt = Date.now() - 1; await store.setJSON(key, rec);
  assert.equal(await auth.consumeLink("reset", t2), null);
});

test("E-Mail-Änderung wird erst nach Bestätigung an die neue Adresse aktiv", async () => {
  let r = await apiFn.handler(ev("POST", { aktion: "email-aendern", email: "neu@example.de", passwort: PW + "neu" }, { headers: { cookie, "x-csrf": csrf } }));
  assert.equal(r.statusCode, 200, r.body);
  assert.equal((await auth.getAccount()).email, "daniel@example.de");
  const token = parse(r).link.split("email=")[1];
  r = await authFn.handler(ev("POST", { aktion: "email-bestaetigen", token }));
  assert.equal(r.statusCode, 200);
  assert.equal((await auth.getAccount()).email, "neu@example.de");
});

test("TOTP: Einrichtung, Aktivierung, Anmeldung mit Code, Wiederverwendung abgelehnt", async () => {
  let r = await apiFn.handler(ev("POST", { aktion: "totp-start" }, { headers: { cookie, "x-csrf": csrf } }));
  const { secret, url } = parse(r);
  assert.match(url, /^otpauth:\/\/totp\//);
  r = await apiFn.handler(ev("POST", { aktion: "totp-aktivieren", code: "000000" }, { headers: { cookie, "x-csrf": csrf } }));
  assert.equal(r.statusCode, 400);
  const step = Math.floor(Date.now() / 30000);
  const code = auth.totpAt(secret, step);
  r = await apiFn.handler(ev("POST", { aktion: "totp-aktivieren", code }, { headers: { cookie, "x-csrf": csrf } }));
  assert.equal(r.statusCode, 200, r.body);
  /* Anmeldung verlangt nun einen Code */
  r = await authFn.handler(ev("POST", { aktion: "anmelden", email: "neu@example.de", passwort: PW + "neu" }));
  assert.equal(parse(r).zweiFaktor, true, r.body);
  /* derselbe Code wie bei der Aktivierung darf nicht erneut gelten (Replay) */
  r = await authFn.handler(ev("POST", { aktion: "anmelden", email: "neu@example.de", passwort: PW + "neu", code }));
  assert.equal(parse(r).ok, false);
  const naechster = auth.totpAt(secret, step + 1);
  assert.equal(auth.verifyTotp(secret, naechster, step, (step + 1) * 30000), true);
  /* RFC-6238-Testvektor (SHA-1, Secret "12345678901234567890", T=59 s → Schritt 1): 287082 */
  assert.equal(auth.totpAt("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", 1), "287082");
});

test("Auf allen Geräten abmelden macht alle Sitzungen ungültig", async () => {
  const a = await auth.getAccount(); a.totp = null; await auth.saveAccount(a);
  let r = await authFn.handler(ev("POST", { aktion: "anmelden", email: "neu@example.de", passwort: PW + "neu" }));
  const c1 = cookieOf(r), x1 = parse(r).csrf;
  r = await authFn.handler(ev("POST", { aktion: "anmelden", email: "neu@example.de", passwort: PW + "neu" }));
  const c2 = cookieOf(r);
  r = await apiFn.handler(ev("POST", { aktion: "ueberall-abmelden" }, { headers: { cookie: c1, "x-csrf": x1 } }));
  assert.equal(r.statusCode, 200);
  for (const c of [c1, c2]) { r = await authFn.handler(ev("GET", null, { headers: { cookie: c } })); assert.equal(parse(r).angemeldet, false); }
});

test("Produktion ohne ADMIN_SETUP_TOKEN: Admin-Functions antworten 404; Deploy Preview nicht", async () => {
  const alt = process.env.ADMIN_SETUP_TOKEN;
  delete process.env.ADMIN_SETUP_TOKEN; process.env.CONTEXT = "production";
  assert.equal(http.adminEnabled(), false);
  let r = await authFn.handler(ev("GET"));
  assert.equal(r.statusCode, 404);
  r = await apiFn.handler(ev("GET", null, { query: { aktion: "konto" }, headers: { cookie } }));
  assert.equal(r.statusCode, 404);
  process.env.CONTEXT = "deploy-preview";
  assert.equal(http.adminEnabled(), true);
  r = await authFn.handler(ev("GET"));
  assert.equal(r.statusCode, 200);
  process.env.ADMIN_SETUP_TOKEN = alt; delete process.env.CONTEXT;
});

test.after(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* egal */ } });
