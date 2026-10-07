/* Authentifizierung für den Admin-Bereich: ein Konto, bcrypt-Passwort, Sitzungen (httpOnly-Cookie),
   Sperre nach 5 Fehlversuchen für 15 Minuten, Einmal-Links (Passwort vergessen, E-Mail bestätigen),
   optional TOTP (2FA). Alles ohne Fremddienste. */
"use strict";
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const store = require("./store");

const LOCK_AFTER = 5;
const LOCK_MINUTES = 15;
const SESSION_HOURS = 8;
const SESSION_REMEMBER_DAYS = 30;
const LINK_MINUTES = 30;
const MIN_PASSWORD = 12;
const COOKIE = "fw_admin";

const now = () => Date.now();
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const rnd = (n = 32) => crypto.randomBytes(n).toString("base64url");

/* ---------- Konto ---------- */
async function getAccount() { return store.getJSON("konto", null); }
async function saveAccount(a) { await store.setJSON("konto", a); }
async function accountExists() { return !!(await getAccount()); }

function passwordProblems(pw) {
  const p = [];
  if (typeof pw !== "string" || pw.length < MIN_PASSWORD) p.push(`Mindestens ${MIN_PASSWORD} Zeichen.`);
  if (/^(.)\1+$/.test(pw || "")) p.push("Nicht nur ein wiederholtes Zeichen.");
  if (/^(password|passwort|12345|qwert)/i.test(pw || "")) p.push("Zu leicht zu erraten.");
  return p;
}
async function hashPassword(pw) { return bcrypt.hash(pw, 12); }
async function verifyPassword(pw, hash) { try { return await bcrypt.compare(pw, hash); } catch (e) { return false; } }

/* Erstes Konto über Einrichtungs-Token (nur einmal) */
async function setup({ token, email, password, name }) {
  const expected = process.env.ADMIN_SETUP_TOKEN;
  if (!expected) return { ok: false, error: "Einrichtung nicht aktiviert (ADMIN_SETUP_TOKEN fehlt)." };
  if (await accountExists()) return { ok: false, error: "Es gibt bereits ein Konto. Der Einrichtungslink ist verbraucht." };
  if (!token || token.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))) return { ok: false, error: "Einrichtungs-Token ungültig." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email || "")) return { ok: false, error: "Bitte eine gültige E-Mail-Adresse angeben." };
  const pp = passwordProblems(password);
  if (pp.length) return { ok: false, error: "Passwort: " + pp.join(" ") };
  const account = { email: email.toLowerCase(), name: (name || "Daniel").slice(0, 60), passwordHash: await hashPassword(password), createdAt: now(), failed: 0, lockedUntil: 0, totp: null, notify: { email: email.toLowerCase(), anfragen: true, bewertungen: true }, sessionsEpoch: now() };
  await saveAccount(account);
  return { ok: true, account };
}

/* ---------- Login mit Sperre ---------- */
async function login({ email, password, code, remember }) {
  const a = await getAccount();
  const generic = { ok: false, error: "E-Mail oder Passwort falsch." };
  if (!a) return { ok: false, error: "Kein Konto vorhanden." };
  if (a.lockedUntil && a.lockedUntil > now()) {
    const min = Math.ceil((a.lockedUntil - now()) / 60000);
    return { ok: false, locked: true, error: `Zugang gesperrt. Bitte in ${min} Minute${min === 1 ? "" : "n"} erneut versuchen.` };
  }
  const okMail = (email || "").toLowerCase() === a.email;
  const okPw = okMail && (await verifyPassword(password || "", a.passwordHash));
  if (!okPw) {
    a.failed = (a.failed || 0) + 1;
    if (a.failed >= LOCK_AFTER) { a.lockedUntil = now() + LOCK_MINUTES * 60000; a.failed = 0; await saveAccount(a); return { ok: false, locked: true, error: `Nach ${LOCK_AFTER} Fehlversuchen ist der Zugang für ${LOCK_MINUTES} Minuten gesperrt.` }; }
    await saveAccount(a);
    return Object.assign({}, generic, { remaining: LOCK_AFTER - a.failed });
  }
  if (a.totp && a.totp.enabled) {
    if (!code) return { ok: false, needTotp: true, error: "Bitte den 6-stelligen Code aus Ihrer Authenticator-App eingeben." };
    if (!verifyTotp(a.totp.secret, code, a.totp.lastStep)) { return { ok: false, needTotp: true, error: "Code ungültig oder abgelaufen." }; }
    a.totp.lastStep = Math.floor(now() / 30000);
  }
  a.failed = 0; a.lockedUntil = 0; a.lastLogin = now();
  await saveAccount(a);
  const session = await createSession(a, !!remember);
  return { ok: true, session };
}

/* ---------- Sitzungen ---------- */
async function createSession(account, remember) {
  const token = rnd(32);
  const ttl = remember ? SESSION_REMEMBER_DAYS * 86400000 : SESSION_HOURS * 3600000;
  const rec = { createdAt: now(), expiresAt: now() + ttl, remember: !!remember, epoch: account.sessionsEpoch || 0 };
  await store.setJSON("sessions/" + sha(token), rec);
  return { token, expiresAt: rec.expiresAt, maxAge: Math.floor(ttl / 1000) };
}
async function getSession(token) {
  if (!token || token.length < 20) return null;
  const rec = await store.getJSON("sessions/" + sha(token), null);
  if (!rec || rec.expiresAt < now()) return null;
  const a = await getAccount();
  if (!a || (a.sessionsEpoch || 0) > (rec.epoch || 0)) return null; // „Auf allen Geräten abmelden“
  return { account: a, session: rec };
}
async function destroySession(token) { if (token) await store.del("sessions/" + sha(token)); }
async function logoutAll() { const a = await getAccount(); if (!a) return; a.sessionsEpoch = now(); await saveAccount(a); }

function cookieHeader(token, maxAge, secure) {
  const parts = [`${COOKIE}=${token}`, "Path=/", "HttpOnly", "SameSite=Strict", `Max-Age=${maxAge}`];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}
function parseCookie(header) {
  const m = (header || "").match(new RegExp("(?:^|;\\s*)" + COOKIE + "=([^;]+)"));
  return m ? m[1] : null;
}

/* ---------- Einmal-Links ---------- */
async function createLink(kind, payload) {
  const token = rnd(32);
  await store.setJSON("links/" + sha(token), { kind, payload, expiresAt: now() + LINK_MINUTES * 60000 });
  return token;
}
async function consumeLink(kind, token) {
  if (!token) return null;
  const key = "links/" + sha(token);
  const rec = await store.getJSON(key, null);
  if (!rec || rec.kind !== kind || rec.expiresAt < now()) return null;
  await store.del(key);
  return rec.payload || {};
}

async function changePassword(current, next) {
  const a = await getAccount();
  if (!a) return { ok: false, error: "Kein Konto." };
  if (!(await verifyPassword(current || "", a.passwordHash))) return { ok: false, error: "Das aktuelle Passwort ist falsch." };
  const pp = passwordProblems(next);
  if (pp.length) return { ok: false, error: "Neues Passwort: " + pp.join(" ") };
  a.passwordHash = await hashPassword(next);
  a.sessionsEpoch = now();
  await saveAccount(a);
  return { ok: true };
}
async function resetPassword(token, next) {
  const payload = await consumeLink("reset", token);
  if (!payload) return { ok: false, error: "Der Link ist ungültig oder abgelaufen (30 Minuten)." };
  const pp = passwordProblems(next);
  if (pp.length) return { ok: false, error: "Passwort: " + pp.join(" ") };
  const a = await getAccount();
  a.passwordHash = await hashPassword(next); a.failed = 0; a.lockedUntil = 0; a.sessionsEpoch = now();
  await saveAccount(a);
  return { ok: true };
}
async function confirmEmail(token) {
  const payload = await consumeLink("email", token);
  if (!payload || !payload.email) return { ok: false, error: "Der Bestätigungslink ist ungültig oder abgelaufen." };
  const a = await getAccount();
  a.email = payload.email;
  await saveAccount(a);
  return { ok: true, email: a.email };
}

/* ---------- TOTP (RFC 6238, SHA-1, 30 s, 6 Stellen) ---------- */
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32Encode(buf) { let bits = "", out = ""; for (const b of buf) bits += b.toString(2).padStart(8, "0"); for (let i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)]; return out; }
function base32Decode(s) { let bits = ""; for (const c of s.toUpperCase().replace(/=+$/, "")) { const v = B32.indexOf(c); if (v < 0) continue; bits += v.toString(2).padStart(5, "0"); } const out = []; for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(out); }
function totpAt(secretB32, step) {
  const key = base32Decode(secretB32);
  const msg = Buffer.alloc(8); msg.writeUInt32BE(Math.floor(step / 0x100000000), 0); msg.writeUInt32BE(step >>> 0, 4);
  const h = crypto.createHmac("sha1", key).update(msg).digest();
  const o = h[19] & 0xf;
  const code = ((h[o] & 0x7f) << 24 | h[o + 1] << 16 | h[o + 2] << 8 | h[o + 3]) % 1000000;
  return String(code).padStart(6, "0");
}
function verifyTotp(secretB32, code, lastStep, t = now()) {
  const step = Math.floor(t / 30000);
  const c = String(code || "").replace(/\s+/g, "");
  for (const d of [0, -1, 1]) { const s = step + d; if (lastStep && s <= lastStep) continue; if (totpAt(secretB32, s) === c) return true; }
  return false;
}
function newTotpSecret() { return base32Encode(crypto.randomBytes(20)); }
function otpauthUrl(secret, email) { return `otpauth://totp/Fenster-WeissenBurger%20Admin:${encodeURIComponent(email)}?secret=${secret}&issuer=Fenster-WeissenBurger&algorithm=SHA1&digits=6&period=30`; }

module.exports = { COOKIE, LOCK_AFTER, LOCK_MINUTES, MIN_PASSWORD, getAccount, saveAccount, accountExists, setup, login, createSession, getSession, destroySession, logoutAll, cookieHeader, parseCookie, createLink, consumeLink, changePassword, resetPassword, confirmEmail, passwordProblems, hashPassword, verifyPassword, totpAt, verifyTotp, newTotpSecret, otpauthUrl, base32Decode };
