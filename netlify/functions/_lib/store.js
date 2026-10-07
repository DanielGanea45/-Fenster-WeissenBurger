/* Datenspeicher für den Admin-Bereich: Netlify Blobs (Produktion/Preview) oder – lokal und in Tests –
   ein Verzeichnis im Dateisystem (FW_STORE_DIR, Standard .netlify-blobs-local/). Gleiche API in beiden Fällen. */
"use strict";
const fs = require("fs");
const path = require("path");

/* Deploy-Kontext: Produktion nutzt den Store „admin“, Deploy Previews/Branch-Deploys eigene Stores,
   damit Tests in der Vorschau die Produktionsdaten nicht berühren. */
function kontext() {
  if (process.env.CONTEXT) return process.env.CONTEXT;
  const d = process.env.DEPLOY_PRIME_URL || "";
  if (/deploy-preview-d+--/.test(d)) return "deploy-preview";
  if (process.env.URL && d && d !== process.env.URL) return "branch-deploy";
  return process.env.NETLIFY ? "production" : "lokal";
}
function storeName() { const k = kontext(); return k === "production" ? "admin" : "admin-" + k.replace(/[^a-z0-9-]/gi, "-"); }
let blobsStore = null;

/* Zugriffsarten:
   – Functions: Netlify konfiguriert Blobs automatisch (NETLIFY_BLOBS_CONTEXT ist gesetzt).
   – Build (scripts/build.js): KEINE automatische Konfiguration → explizit mit SITE_ID (von Netlify gesetzt)
     und NETLIFY_BLOBS_TOKEN (Personal Access Token, als geheime Variable im Scope „Builds“).
   – Lokal/Tests: FW_STORE_DIR → Dateisystem. */
function blobsStatus() {
  if (process.env.FW_STORE_DIR) return { ok: false, art: "datei", grund: "FW_STORE_DIR gesetzt (lokaler Dateistore)" };
  if (process.env.NETLIFY_BLOBS_CONTEXT) return { ok: true, art: "automatisch" };
  if (process.env.SITE_ID && process.env.NETLIFY_BLOBS_TOKEN) return { ok: true, art: "token" };
  if (!process.env.NETLIFY) return { ok: false, art: "keine", grund: "nicht in einer Netlify-Umgebung" };
  return { ok: false, art: "keine", grund: process.env.SITE_ID ? "NETLIFY_BLOBS_TOKEN fehlt" : "SITE_ID und NETLIFY_BLOBS_TOKEN fehlen" };
}
function useBlobs() {
  if (process.env.FW_STORE_DIR) return false;
  return blobsStatus().ok || !!process.env.NETLIFY; // in Netlify-Umgebungen nie still auf Dateien ausweichen
}
function getBlobs() {
  if (blobsStore) return blobsStore;
  const { getStore } = require("@netlify/blobs");
  const st = blobsStatus();
  if (st.art === "token") blobsStore = getStore({ name: storeName(), siteID: process.env.SITE_ID, token: process.env.NETLIFY_BLOBS_TOKEN, consistency: "strong" });
  else blobsStore = getStore({ name: storeName(), consistency: "strong" });
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

module.exports = { getJSON, setJSON, del, getBinary, setBinary, list, useBlobs, blobsStatus, kontext, storeName };
