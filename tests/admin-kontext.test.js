/* Tests: Deploy-Kontext je Anfrage (Header/Host) und daraus abgeleitete Store-Namen – Functions und Build müssen für
   denselben Kontext denselben Store verwenden; Produktion „admin“, Deploy Preview „admin-deploy-preview“.
   Außerdem: Build-Hook je Umgebung (Produktions-Hook nie in der Vorschau), Timeout/Reset des Veröffentlichungsstatus,
   Deploy-Zustand über die Netlify-API (gemockt). */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fw-admin-kontext-"));
process.env.FW_STORE_DIR = dir;
process.env.ADMIN_SETUP_TOKEN = "test-setup-token-1234567890";
delete process.env.NETLIFY; delete process.env.CONTEXT; delete process.env.NETLIFY_BUILD_HOOK; delete process.env.NETLIFY_BUILD_HOOK_PREVIEW; delete process.env.NETLIFY_API_TOKEN; delete process.env.NETLIFY_BLOBS_TOKEN; delete process.env.DEPLOY_PRIME_URL; delete process.env.URL;

const store = require("../netlify/functions/_lib/store");
const auth = require("../netlify/functions/_lib/auth");
const daten = require("../netlify/functions/_lib/daten");
const httpLib = require("../netlify/functions/_lib/http");
const apiFn = require("../netlify/functions/admin-api");

const PW = "SicheresPasswort!2026";
let cookie = "", csrf = "";
const ev = (method, body, extra = {}) => ({ httpMethod: method, path: "/.netlify/functions/admin-api", headers: Object.assign({ host: extra.host || "fensterweissenburger.netlify.app", origin: "https://" + (extra.host || "fensterweissenburger.netlify.app"), cookie, "x-csrf": csrf, "x-forwarded-for": "203.0.113.9" }, extra.headers || {}), body: body ? JSON.stringify(body) : null, queryStringParameters: extra.query || {} });
const parse = (r) => JSON.parse(r.body);

test.before(async () => {
  const r = await auth.setup({ token: process.env.ADMIN_SETUP_TOKEN, email: "daniel@example.de", password: PW });
  assert.ok(r.ok, r.error);
  const s = await auth.createSession(r.account, false);
  cookie = "fw_admin=" + s.token; csrf = httpLib.csrfFor(s.token);
});
test.afterEach(() => { store.setzeKontext(null); });

/* ---------- Kontext aus der Anfrage ---------- */
test("Kontext aus Headern: Produktions-Host, Custom Domain, Deploy Preview, Branch-Deploy, x-nf-deploy-context, lokal", () => {
  process.env.LAMBDA_TASK_ROOT = "/var/task";
  try {
    const k = (headers) => store.kontextAusEvent({ headers });
    assert.equal(k({ host: "fensterweissenburger.netlify.app" }), "production");
    assert.equal(k({ host: "fenster-weissenburger.de" }), "production");
    assert.equal(k({ host: "www.fenster-weissenburger.de", "x-forwarded-host": "fenster-weissenburger.de" }), "production");
    assert.equal(k({ host: "deploy-preview-14--fensterweissenburger.netlify.app" }), "deploy-preview");
    assert.equal(k({ host: "admin--fensterweissenburger.netlify.app" }), "branch-deploy");
    assert.equal(k({ host: "fensterweissenburger.netlify.app", "x-nf-deploy-context": "deploy-preview" }), "deploy-preview", "expliziter Header gewinnt");
    assert.equal(k({ host: "localhost:8888" }), null);
  } finally { delete process.env.LAMBDA_TASK_ROOT; }
});
test("Store-Namen: Produktion „admin“, Preview „admin-deploy-preview“ – in Functions (Header) wie im Build (CONTEXT)", () => {
  store.setzeKontext(store.kontextAusEvent({ headers: { host: "fensterweissenburger.netlify.app" } }));
  assert.equal(store.kontext(), "production"); assert.equal(store.storeName(), "admin"); assert.equal(store.kontextLabel(), "Produktion");
  store.setzeKontext(store.kontextAusEvent({ headers: { host: "deploy-preview-14--fensterweissenburger.netlify.app" } }));
  assert.equal(store.storeName(), "admin-deploy-preview"); assert.equal(store.kontextLabel(), "Deploy Preview");
  store.setzeKontext(null);
  process.env.CONTEXT = "deploy-preview"; assert.equal(store.storeName(), "admin-deploy-preview", "Build mit CONTEXT=deploy-preview");
  process.env.CONTEXT = "production"; assert.equal(store.storeName(), "admin", "Build mit CONTEXT=production");
  delete process.env.CONTEXT;
  assert.equal(store.kontext(), "lokal"); assert.equal(store.storeName(), "admin-lokal");
});
test("Functions ohne CONTEXT/NETLIFY-Variablen (Lambda) melden nicht mehr „lokal“", () => {
  process.env.LAMBDA_TASK_ROOT = "/var/task";
  try { store.setzeKontext(null); assert.equal(store.kontext(), "production"); } finally { delete process.env.LAMBDA_TASK_ROOT; }
});
test("verbinde(event) setzt den Kontext je Anfrage; die Übersicht liefert Label und Store", async () => {
  const r = await apiFn.handler(ev("GET", null, { query: { aktion: "uebersicht" }, host: "deploy-preview-14--fensterweissenburger.netlify.app" }));
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(parse(r).kontext, "deploy-preview"); assert.equal(parse(r).kontextLabel, "Deploy Preview"); assert.equal(parse(r).store, "admin-deploy-preview");
  const r2 = await apiFn.handler(ev("GET", null, { query: { aktion: "status" }, host: "fensterweissenburger.netlify.app" }));
  assert.equal(parse(r2).kontext, "production"); assert.equal(parse(r2).kontextLabel, "Produktion");
});

/* ---------- Build-Hook je Umgebung ---------- */
test("Vorschau: „Veröffentlichen“ nutzt NIE den Produktions-Hook – ohne Vorschau-Hook nur Hinweis, kein Build", async () => {
  process.env.NETLIFY_BUILD_HOOK = "https://api.netlify.com/build_hooks/PRODUKTION";
  const orig = global.fetch; const aufrufe = [];
  global.fetch = async (url) => { aufrufe.push(String(url)); return { ok: true, status: 200 }; };
  try {
    const r = await apiFn.handler(ev("POST", { aktion: "veroeffentlichen", grund: "Test" }, { host: "deploy-preview-14--fensterweissenburger.netlify.app" }));
    assert.equal(r.statusCode, 409);
    assert.equal(parse(r).uebersprungen, true);
    assert.match(parse(r).error, /kein Build ausgelöst/);
    assert.match(parse(r).error, /NETLIFY_BUILD_HOOK_PREVIEW/);
    assert.deepEqual(aufrufe, [], "kein Hook aufgerufen");
    assert.equal((await daten.publishStatus()).status, "gespeichert");
    /* mit Vorschau-Hook: genau dieser wird aufgerufen */
    process.env.NETLIFY_BUILD_HOOK_PREVIEW = "https://api.netlify.com/build_hooks/VORSCHAU?trigger_branch=admin";
    const r2 = await apiFn.handler(ev("POST", { aktion: "veroeffentlichen", grund: "Test" }, { host: "deploy-preview-14--fensterweissenburger.netlify.app" }));
    assert.equal(r2.statusCode, 200, r2.body);
    assert.equal(aufrufe.length, 1); assert.match(aufrufe[0], /VORSCHAU\?trigger_branch=admin&trigger_title=/); assert.ok(!aufrufe[0].includes("PRODUKTION"));
  } finally { global.fetch = orig; delete process.env.NETLIFY_BUILD_HOOK; delete process.env.NETLIFY_BUILD_HOOK_PREVIEW; await daten.setPublishStatus({ status: "nie", start: 0 }); }
});
test("Produktion: „Veröffentlichen“ nutzt NETLIFY_BUILD_HOOK, nicht den Vorschau-Hook", async () => {
  process.env.NETLIFY_BUILD_HOOK = "https://api.netlify.com/build_hooks/PRODUKTION";
  process.env.NETLIFY_BUILD_HOOK_PREVIEW = "https://api.netlify.com/build_hooks/VORSCHAU";
  const orig = global.fetch; const aufrufe = [];
  global.fetch = async (url) => { aufrufe.push(String(url)); return { ok: true, status: 200 }; };
  try {
    const r = await apiFn.handler(ev("POST", { aktion: "veroeffentlichen", grund: "Test" }, { host: "fensterweissenburger.netlify.app" }));
    assert.equal(r.statusCode, 200, r.body);
    assert.match(aufrufe[0], /PRODUKTION\?trigger_title=/);
  } finally { global.fetch = orig; delete process.env.NETLIFY_BUILD_HOOK; delete process.env.NETLIFY_BUILD_HOOK_PREVIEW; }
});

/* ---------- Timeout, Reset, Netlify-API ---------- */
test("Status „läuft“ älter als 15 Minuten wird zu „unbekannt – bitte erneut veröffentlichen“ und gibt die Sperre frei", async () => {
  await daten.setPublishStatus({ status: "laeuft", start: Date.now() - 16 * 60000, ende: 0, fehler: "" });
  const r = await apiFn.handler(ev("GET", null, { query: { aktion: "status" } }));
  assert.equal(parse(r).veroeffentlichung.status, "unbekannt");
  assert.match(parse(r).veroeffentlichung.hinweis, /15 Minuten.*erneut veröffentlichen/);
  assert.equal((await daten.publishStatus()).status, "unbekannt", "dauerhaft gespeichert");
  /* 10 Minuten alt bleibt „läuft“ */
  await daten.setPublishStatus({ status: "laeuft", start: Date.now() - 10 * 60000 });
  const r2 = await apiFn.handler(ev("GET", null, { query: { aktion: "status" } }));
  assert.equal(parse(r2).veroeffentlichung.status, "laeuft");
});
test("Status manuell zurücksetzen", async () => {
  await daten.setPublishStatus({ status: "laeuft", start: Date.now() });
  const r = await apiFn.handler(ev("POST", { aktion: "status-zuruecksetzen" }));
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(parse(r).veroeffentlichung.status, "unbekannt");
  assert.match(parse(r).veroeffentlichung.hinweis, /manuell zurückgesetzt/);
  const p = await store.getJSON("protokoll", []);
  assert.equal(p[0].typ, "status-zurueckgesetzt");
});
test("Deploy-Zustand über Netlify-API (gemockt): ready → veröffentlicht, error → fehler, building → weiter läuft", async () => {
  process.env.NETLIFY_API_TOKEN = "nfp_test"; process.env.SITE_ID = "site-1";
  store.setzeKontext("production");
  const start = Date.now() - 60000;
  const mock = (deploys) => async (url, opt) => { assert.match(String(url), /\/sites\/site-1\/deploys/); assert.equal(opt.headers.Authorization, "Bearer nfp_test"); return { ok: true, json: async () => deploys }; };
  const jetzt = new Date().toISOString();
  try {
    let z = await apiFn.deployZustand({ status: "laeuft", start }, mock([{ id: "d1", context: "production", state: "ready", created_at: jetzt, published_at: jetzt }]));
    assert.equal(z.status, "veroeffentlicht"); assert.equal(z.deployId, "d1");
    z = await apiFn.deployZustand({ status: "laeuft", start }, mock([{ id: "d2", context: "production", state: "error", created_at: jetzt, error_message: "Tests fehlgeschlagen" }]));
    assert.equal(z.status, "fehler"); assert.match(z.fehler, /Tests fehlgeschlagen/);
    z = await apiFn.deployZustand({ status: "laeuft", start }, mock([{ id: "d3", context: "production", state: "building", created_at: jetzt }]));
    assert.equal(z, null, "läuft weiter");
    z = await apiFn.deployZustand({ status: "laeuft", start }, mock([{ id: "d4", context: "deploy-preview", state: "ready", created_at: jetzt }]));
    assert.equal(z, null, "Deploy eines anderen Kontexts zählt nicht (innerhalb des Timeouts)");
    delete process.env.NETLIFY_API_TOKEN;
    z = await apiFn.deployZustand({ status: "laeuft", start }, mock([]));
    assert.equal(z, null, "ohne Token keine Abfrage");
  } finally { delete process.env.NETLIFY_API_TOKEN; delete process.env.SITE_ID; }
});

test.after(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* egal */ } });
