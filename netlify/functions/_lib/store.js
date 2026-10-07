/* Datenspeicher für den Admin-Bereich: Netlify Blobs (Produktion/Preview) oder – lokal und in Tests –
   ein Verzeichnis im Dateisystem (FW_STORE_DIR, Standard .netlify-blobs-local/). Gleiche API in beiden Fällen. */
"use strict";
require("./env"); // trimmt alle gelesenen Umgebungsvariablen (Leerraum aus Copy & Paste)
const fs = require("fs");
const path = require("path");

/* Deploy-Kontext: Produktion nutzt den Store „admin“, Deploy Previews/Branch-Deploys eigene Stores,
   damit Tests in der Vorschau die Produktionsdaten nicht berühren. */
/* In der Functions-Laufzeit sind CONTEXT und NETLIFY NICHT gesetzt – der Kontext wird deshalb je Anfrage aus den
   Netlify-Headern bestimmt (x-nf-deploy-context bzw. Host: deploy-preview-N--site / branch--site). Im Build gilt CONTEXT. */
let kontextAnfrage = null;
function kontextAusEvent(event) {
  const h = (event && event.headers) || {};
  const dc = String(h["x-nf-deploy-context"] || "").toLowerCase();
  if (["production", "deploy-preview", "branch-deploy", "dev"].includes(dc)) return dc;
  const host = String(h["x-forwarded-host"] || h.host || "").toLowerCase().split(":")[0];
  if (/^deploy-preview-\d+--[^.]+\.netlify\.app$/.test(host)) return "deploy-preview";
  if (/^[^.]+--[^.]+\.netlify\.app$/.test(host)) return "branch-deploy";
  if (/\.netlify\.app$/.test(host) || (host && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(host) && (process.env.LAMBDA_TASK_ROOT || process.env.NETLIFY))) return "production";
  return null;
}
function kontext() {
  if (kontextAnfrage) return kontextAnfrage;
  if (process.env.CONTEXT) return process.env.CONTEXT;
  const d = process.env.DEPLOY_PRIME_URL || "";
  if (/deploy-preview-\d+--/.test(d)) return "deploy-preview";
  if (process.env.URL && d && d !== process.env.URL) return "branch-deploy";
  if (process.env.NETLIFY || process.env.LAMBDA_TASK_ROOT) return "production";
  return "lokal";
}
function kontextLabel(k) { k = k || kontext(); return { production: "Produktion", "deploy-preview": "Deploy Preview", "branch-deploy": "Branch-Deploy", dev: "Netlify Dev", lokal: "lokal" }[k] || k; }
function setzeKontext(k) { k = k || null; if (k !== kontextAnfrage) { kontextAnfrage = k; blobsStore = null; } }
function storeName() { const k = kontext(); return k === "production" ? "admin" : "admin-" + k.replace(/[^a-z0-9-]/gi, "-"); }
let blobsStore = null;

/* Zugriffsarten:
   – Functions: Netlify konfiguriert Blobs automatisch (NETLIFY_BLOBS_CONTEXT ist gesetzt).
   – Build (scripts/build.js): KEINE automatische Konfiguration → explizit mit SITE_ID (von Netlify gesetzt)
     und NETLIFY_BLOBS_TOKEN (Personal Access Token, als geheime Variable im Scope „Builds“).
   – Lokal/Tests: FW_STORE_DIR → Dateisystem. */
/* Netlify-Umgebung? (Build: NETLIFY=true; Functions: Lambda-Variablen) – dort gibt es KEINEN stillen Dateisystem-Rückfall. */
function inNetlify() { return !!(process.env.NETLIFY || process.env.LAMBDA_TASK_ROOT || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY_DEV); }
function blobsStatus() {
  if (process.env.FW_STORE_DIR) return { ok: false, art: "datei", grund: "FW_STORE_DIR gesetzt (lokaler Dateistore)" };
  if (process.env.NETLIFY_BLOBS_CONTEXT || globalThis.netlifyBlobsContext) return { ok: true, art: "automatisch" };
  if (process.env.SITE_ID && process.env.NETLIFY_BLOBS_TOKEN) return { ok: true, art: "token" };
  if (!inNetlify()) return { ok: false, art: "keine", grund: "nicht in einer Netlify-Umgebung" };
  return { ok: false, art: "keine", grund: process.env.LAMBDA_TASK_ROOT ? "Blobs-Kontext der Function fehlt (connectLambda)" : process.env.SITE_ID ? "NETLIFY_BLOBS_TOKEN fehlt" : "SITE_ID und NETLIFY_BLOBS_TOKEN fehlen" };
}
/* Functions mit klassischem handler(event): Netlify liefert den Blobs-Kontext in event.blobs – muss vor dem
   ersten getStore() verbunden werden. Ohne diesen Schritt gäbe es keinen Zugriff auf den Datenspeicher. */
function verbinde(event) {
  setzeKontext(kontextAusEvent(event)); // zuerst der Kontext → bestimmt den Store-Namen (admin / admin-deploy-preview / …)
  if (!event || !event.blobs || process.env.NETLIFY_BLOBS_CONTEXT) return;
  try {
    /* Wie connectLambda() aus @netlify/blobs, zusätzlich mit der ungecachten Edge-URL (nötig für „strong“-Lesen). */
    const data = JSON.parse(Buffer.from(String(event.blobs), "base64").toString("utf8"));
    const h = event.headers || {};
    const ctx = { edgeURL: data.url, uncachedEdgeURL: data.url_uncached || data.uncached_url || data.uncachedURL || undefined, token: data.token, siteID: h["x-nf-site-id"] || process.env.SITE_ID, deployID: h["x-nf-deploy-id"] || process.env.DEPLOY_ID };
    process.env.NETLIFY_BLOBS_CONTEXT = Buffer.from(JSON.stringify(ctx), "utf8").toString("base64");
    blobsStore = null; // falls zuvor ohne Kontext erzeugt
  } catch (e) { console.error("Blobs-Kontext aus event.blobs nicht lesbar:", e.message); }
}
/* „strong“ (lesen nach schreiben sofort sichtbar) nur, wenn der Kontext eine ungecachte Edge-URL hat; der
   API-Zugriff per Token kennt die Einschränkung nicht. Sonst „eventual“ statt eines harten Fehlers. */
function konsistenz() {
  const st = blobsStatus();
  if (st.art === "token") return "strong";
  try { const ctx = JSON.parse(Buffer.from(process.env.NETLIFY_BLOBS_CONTEXT || "", "base64").toString("utf8") || "{}"); if (!ctx.edgeURL || ctx.uncachedEdgeURL) return "strong"; } catch (e) { /* unten */ }
  return "eventual";
}
class StoreNichtVerfuegbar extends Error { constructor(grund) { super("Datenspeicher (Netlify Blobs) nicht verfügbar: " + grund); this.name = "StoreNichtVerfuegbar"; } }
function useBlobs() {
  if (process.env.FW_STORE_DIR) return false;
  const st = blobsStatus();
  if (st.ok) return true;
  if (inNetlify()) throw new StoreNichtVerfuegbar(st.grund); // nie still auf das (flüchtige) Dateisystem ausweichen
  return false;
}
function getBlobs() {
  if (blobsStore) return blobsStore;
  const { getStore } = require("@netlify/blobs");
  const st = blobsStatus();
  if (st.art === "token") blobsStore = getStore({ name: storeName(), siteID: process.env.SITE_ID, token: process.env.NETLIFY_BLOBS_TOKEN, consistency: "strong" });
  else blobsStore = getStore({ name: storeName(), consistency: konsistenz() });
  return blobsStore;
}
function localDir() {
  const d = process.env.FW_STORE_DIR || path.join(process.cwd(), ".netlify-blobs-local");
  fs.mkdirSync(d, { recursive: true });
  return d;
}
function localPath(key) {
  const safe = key.replace(/[^a-zA-Z0-9/_.-]/g, "_");
  const p = path.join(localDir(), safe);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  return p;
}

async function getJSON(key, fallback) {
  if (useBlobs()) {
    const v = await getBlobs().get(key, { type: "json" });
    return v === null || v === undefined ? fallback : v;
  }
  const p = localPath(key) + ".json";
  if (!fs.existsSync(p)) return fallback;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}
async function setJSON(key, value) {
  if (useBlobs()) { await getBlobs().setJSON(key, value); return; }
  fs.writeFileSync(localPath(key) + ".json", JSON.stringify(value, null, 1));
}
async function del(key) {
  if (useBlobs()) { await getBlobs().delete(key); return; }
  for (const p of [localPath(key) + ".json", localPath(key) + ".bin"]) if (fs.existsSync(p)) fs.unlinkSync(p);
}
async function getBinary(key) {
  if (useBlobs()) { const ab = await getBlobs().get(key, { type: "arrayBuffer" }); return ab ? Buffer.from(ab) : null; }
  const p = localPath(key) + ".bin";
  return fs.existsSync(p) ? fs.readFileSync(p) : null;
}
async function setBinary(key, buffer, contentType) {
  if (useBlobs()) { await getBlobs().set(key, buffer, { metadata: { contentType } }); return; }
  fs.writeFileSync(localPath(key) + ".bin", buffer);
}
async function list(prefix) {
  if (useBlobs()) {
    const { blobs } = await getBlobs().list({ prefix });
    return blobs.map((b) => b.key);
  }
  const base = localDir();
  const out = [];
  (function walk(d) {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f);
      else out.push(path.relative(base, f).split(path.sep).join("/").replace(/\.(json|bin)$/, ""));
    }
  })(base);
  return [...new Set(out)].filter((k) => k.startsWith(prefix)).sort();
}

module.exports = { getJSON, setJSON, del, getBinary, setBinary, list, useBlobs, blobsStatus, verbinde, inNetlify, StoreNichtVerfuegbar, kontext, kontextAusEvent, kontextLabel, setzeKontext, storeName };
