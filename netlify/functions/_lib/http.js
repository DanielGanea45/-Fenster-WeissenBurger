/* Gemeinsame HTTP-Hilfen für die Admin-Functions: Antworten, Produktions-Schalter (Admin aus, solange
   ADMIN_SETUP_TOKEN fehlt), Sitzungsprüfung, CSRF, Rate-Limit, Zugriffsprotokoll. */
"use strict";
const crypto = require("crypto");
const store = require("./store");
const auth = require("./auth");

const NO_STORE = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };

function json(statusCode, body, extraHeaders) {
  return { statusCode, headers: Object.assign({ "Content-Type": "application/json; charset=utf-8" }, NO_STORE, extraHeaders || {}), body: JSON.stringify(body) };
}
function html(statusCode, body, extraHeaders) {
  return { statusCode, headers: Object.assign({ "Content-Type": "text/html; charset=utf-8" }, NO_STORE, extraHeaders || {}), body };
}
function notFound() { return html(404, "<!doctype html><meta charset=utf-8><title>404</title><h1>404 – Seite nicht gefunden</h1>"); }

function isProduction() { const k = store.kontext(); return k === "production"; }
function isSecure(event) { const h = event.headers || {}; return (h["x-forwarded-proto"] || "").includes("https") || !!process.env.URL; }
function siteUrl(event) {
  if (!isProduction() && process.env.DEPLOY_PRIME_URL) return process.env.DEPLOY_PRIME_URL;
  if (process.env.URL) return process.env.URL;
  const h = event.headers || {};
  return (h.origin) || ("http://" + (h.host || "localhost"));
}
/* Admin ist auf Produktion AUS, solange ADMIN_SETUP_TOKEN fehlt. Deploy Previews laufen immer. */
function adminEnabled() { return !isProduction() || !!process.env.ADMIN_SETUP_TOKEN; }

function clientIp(event) {
  const h = event.headers || {};
  return h["x-nf-client-connection-ip"] || (h["x-forwarded-for"] || "").split(",")[0].trim() || "lokal";
}
function parseBody(event) {
  if (!event.body) return {};
  const raw = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
  try { return JSON.parse(raw); } catch (e) { return null; }
}
function sameOrigin(event) {
  const h = event.headers || {};
  const origin = h.origin || (h.referer ? h.referer.replace(/^(https?:\/\/[^/]+).*$/, "$1") : "");
  if (!origin) return false;
  const host = h["x-forwarded-host"] || h.host || "";
  return origin.replace(/^https?:\/\//, "") === host;
}

/* Rate-Limit: Zähler je IP und Minute im Store (nur ein Admin → geringe Last). */
async function rateLimit(event, bucket, maxPerMinute) {
  const ip = clientIp(event);
  const minute = Math.floor(Date.now() / 60000);
  const key = `rate/${bucket}/${crypto.createHash("sha256").update(ip).digest("hex").slice(0, 16)}/${minute}`;
  const n = (await store.getJSON(key, 0)) + 1;
  await store.setJSON(key, n);
  if (n > maxPerMinute) return { ok: false, response: json(429, { ok: false, error: "Zu viele Anfragen. Bitte kurz warten." }) };
  return { ok: true };
}

/* Zugriffsprotokoll: eine Liste, die letzten 500 Einträge. */
async function protokoll(event, typ, text, wer) {
  const list = await store.getJSON("protokoll", []);
  list.unshift({ wann: Date.now(), typ, text: String(text || "").slice(0, 300), wer: wer || "", ip: maskIp(clientIp(event)) });
  await store.setJSON("protokoll", list.slice(0, 500));
}
function maskIp(ip) { if (!ip || ip === "lokal") return ip; if (ip.includes(".")) return ip.replace(/\.\d+$/, ".x"); return ip.split(":").slice(0, 3).join(":") + ":…"; }

/* CSRF-Token: HMAC aus Sitzungstoken (kein Zustand nötig); Client sendet es im Header X-CSRF. */
function csrfFor(sessionToken) {
  const secret = process.env.SESSION_SECRET || process.env.ADMIN_SETUP_TOKEN || "fw-admin-csrf";
  return crypto.createHmac("sha256", secret).update("csrf:" + sessionToken).digest("base64url");
}

/* Sitzung aus Cookie laden; für schreibende Aufrufe zusätzlich Origin + CSRF prüfen. */
async function requireSession(event, { write = false } = {}) {
  const token = auth.parseCookie((event.headers || {}).cookie);
  const s = await auth.getSession(token);
  if (!s) return { ok: false, response: json(401, { ok: false, error: "Nicht angemeldet.", anmelden: true }) };
  if (write) {
    if (!sameOrigin(event)) return { ok: false, response: json(403, { ok: false, error: "Anfrage von fremder Herkunft abgelehnt." }) };
    const hdr = (event.headers || {})["x-csrf"] || "";
    if (hdr !== csrfFor(token)) return { ok: false, response: json(403, { ok: false, error: "Sicherheits-Token ungültig. Bitte Seite neu laden." }) };
  }
  return { ok: true, token, account: s.account, session: s.session, csrf: csrfFor(token) };
}

module.exports = { json, html, notFound, isProduction, isSecure, siteUrl, adminEnabled, clientIp, parseBody, sameOrigin, rateLimit, protokoll, csrfFor, requireSession, NO_STORE };
