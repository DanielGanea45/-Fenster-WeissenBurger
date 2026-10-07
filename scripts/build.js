#!/usr/bin/env node
/* Zentraler Build (npm run build), läuft bei jedem Netlify-Deploy:
     1. Admin-Daten aus Netlify Blobs holen (Preise, Einstellungen, Texte, Bilder, Bewertungen) und ins
        Repository-Abbild einsetzen (data/*.json, data-text-Bausteine, Bilder). Ohne Blobs: Repo-Dateien.
     2. Alle Tests (Preisrechner, Admin, Kontrast) ausführen – schlägt einer fehl, bricht der Build ab,
        es wird NICHTS veröffentlicht und die bisherige Version bleibt online.
     3. Konfigurator-Seiten erzeugen (scripts/build-konfigurator.js), _redirects für den Vorschau-Modus.
   Der Veröffentlichungsstatus (läuft / veröffentlicht / Fehler) wird in den Store geschrieben, damit
   der Admin-Bereich ihn anzeigen kann.
   Optionen: --ohne-blobs (nur Repo-Daten), FW_STORE_DIR (lokaler Store statt Blobs). */
"use strict";
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const LIB = path.join(__dirname, "..", "netlify", "functions", "_lib");
const env = require(path.join(LIB, "env")); // trimmt Umgebungsvariablen vor allem anderen
const store = require(path.join(LIB, "store"));
const daten = require(path.join(LIB, "daten"));
const validate = require(path.join(LIB, "validate"));
const mail = require(path.join(LIB, "mail"));

const DEFAULT_SCHRITTE = [
  { name: "Asset-Versionen (Cache-Busting per Inhalts-Hash)", cmd: "node scripts/assets-version.js" },
  { name: "Tests (Preisrechner, Admin)", cmd: "node --test tests/*.test.js" },
  { name: "Kontrastprüfung", cmd: "node scripts/kontrast-check.js" },
  { name: "Konfigurator-Seiten", cmd: "node scripts/build-konfigurator.js" },
];

function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function hash(buf) { return require("crypto").createHash("sha1").update(buf).digest("hex").slice(0, 8); }

/* ---------- Texte einsetzen ---------- */
function texteEinsetzen(root, texte) {
  let n = 0;
  const proSeite = {};
  for (const [id, b] of Object.entries(texte.bloecke || {})) if (b.geaendert) (proSeite[b.seite] = proSeite[b.seite] || []).push([id, b]);
  for (const [seite, liste] of Object.entries(proSeite)) {
    const info = texte.seiten[seite]; if (!info) continue;
    const f = path.join(root, info.datei); if (!fs.existsSync(f)) continue;
    let html = fs.readFileSync(f, "utf8");
    for (const [id, b] of liste) {
      const re = new RegExp(`(<(h1|h2|h3|p)\\b[^>]*data-text="${id}"[^>]*>)([\\s\\S]*?)(</\\2>)`);
      if (re.test(html)) { html = html.replace(re, (m, a, t, inner, z) => a + validate.sanitizeHtml(b.html) + z); n++; }
    }
    fs.writeFileSync(f, html);
  }
  return n;
}

/* ---------- Bilder einsetzen ---------- */
async function bilderEinsetzen(root, bilder, texte) {
  let n = 0;
  const outDir = path.join(root, "assets", "bilder", "admin");
  const seiten = (texte && texte.seiten) || {};
  for (const [id, b] of Object.entries(bilder.bilder || {})) {
    if (!b.geloescht && !b.blob && !b.altGeaendert) continue;
    const info = seiten[b.seite]; if (!info) continue;
    const f = path.join(root, info.datei); if (!fs.existsSync(f)) continue;
    let html = fs.readFileSync(f, "utf8");
    const srcRe = b.src.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const imgRe = new RegExp(`<img\\b[^>]*\\ssrc="/?${srcRe}"[^>]*>`);
    const m = html.match(imgRe); if (!m) continue;
    if (b.geloescht && b.loeschbar) {
      const start = html.lastIndexOf("<" + b.wrapper, m.index);
      const endTag = "</" + b.wrapper + ">";
      const end = html.indexOf(endTag, m.index);
      if (start >= 0 && end > start) { html = html.slice(0, start) + html.slice(end + endTag.length); n++; }
    } else {
      let tag = m[0];
      if (b.blob) {
        fs.mkdirSync(outDir, { recursive: true });
        const groessen = b.groessen || [800];
        const dateien = [];
        for (const g of groessen) {
          const buf = await store.getBinary(`bilder/${id}/${g}`);
          if (!buf) continue;
          const name = `${id}-${hash(buf)}-${g}.webp`;
          fs.writeFileSync(path.join(outDir, name), buf);
          dateien.push([g, "/assets/bilder/admin/" + name]);
        }
        if (dateien.length) {
          const klein = dateien[0], srcset = dateien.map(([g, p]) => `${p} ${g}w`).join(", ");
          tag = tag.replace(/\ssrc="[^"]*"/, ` src="${klein[1]}"`);
          tag = /\ssrcset="/.test(tag) ? tag.replace(/\ssrcset="[^"]*"/, ` srcset="${srcset}"`) : tag.replace("<img", `<img srcset="${srcset}"`);
          if (b.breite && b.hoehe) tag = tag.replace(/\swidth="\d+"/, ` width="${b.breite}"`).replace(/\sheight="\d+"/, ` height="${b.hoehe}"`);
          /* <picture> mit <source>-Varianten durch das neue Bild ersetzen */
          const pStart = html.lastIndexOf("<picture>", m.index), pEnd = html.indexOf("</picture>", m.index);
          if (pStart >= 0 && pEnd > pStart && !html.slice(pStart, m.index).includes("</picture>")) { html = html.slice(0, pStart) + tag + html.slice(pEnd + "</picture>".length); }
          else html = html.replace(m[0], tag);
          /* Lightbox-Link (<a href="…"> direkt vor dem Bild) auf die größte neue Datei umstellen */
          const gross = dateien[dateien.length - 1][1];
          const vor = html.slice(Math.max(0, html.indexOf(tag) - 300), html.indexOf(tag));
          const aM = vor.match(/<a href="([^"]+)">\s*$/);
          if (aM) html = html.replace(aM[0], aM[0].replace(aM[1], gross));
          n++;
          continue;
        }
      }
      if (b.alt !== undefined) { tag = tag.replace(/\salt="[^"]*"/, ` alt="${esc(b.alt)}"`); html = html.replace(m[0], tag); n++; }
    }
    fs.writeFileSync(f, html);
  }
  n += await neueBilderAnhaengen(root, bilder, seiten);
  return n;
}

/* Hochgeladene Zusatzbilder (Bereich Referenzen) werden an die Galerie auf /referenzen/ angehängt;
   als Vorlage dient das erste vorhandene Galerie-Element. */
async function neueBilderAnhaengen(root, bilder, seiten) {
  const neue = Object.entries(bilder.bilder || {}).filter(([, b]) => b.neu && b.blob && !b.geloescht && b.sektion === "referenzen");
  if (!neue.length || !seiten.referenzen) return 0;
  const f = path.join(root, seiten.referenzen.datei);
  if (!fs.existsSync(f)) return 0;
  let html = fs.readFileSync(f, "utf8");
  const gal = html.indexOf('<ul class="refs" id="gallery">');
  const ende = gal >= 0 ? html.indexOf("</ul>", gal) : -1;
  if (ende < 0) return 0;
  const vorlageM = html.slice(gal, ende).match(/<li class="ref">[\s\S]*?<\/li>/);
  if (!vorlageM) return 0;
  const outDir = path.join(root, "assets", "bilder", "admin");
  fs.mkdirSync(outDir, { recursive: true });
  let eingefuegt = "", n = 0;
  for (const [id, b] of neue) {
    const dateien = [];
    for (const g of b.groessen || []) { const buf = await store.getBinary(`bilder/${id}/${g}`); if (!buf) continue; const name = `${id}-${hash(buf)}-${g}.webp`; fs.writeFileSync(path.join(outDir, name), buf); dateien.push([g, "/assets/bilder/admin/" + name]); }
    if (!dateien.length) continue;
    const klein = dateien[0][1], gross = dateien[dateien.length - 1][1];
    let li = vorlageM[0];
    li = li.replace(/<a href="[^"]*">/, `<a href="${gross}">`);
    li = li.replace(/<img[^>]*>/, `<img src="${klein}" srcset="${dateien.map(([g, p]) => p + " " + g + "w").join(", ")}" width="${b.breite || 800}" height="${b.hoehe || 600}" alt="${esc(b.alt || b.titel || "")}" loading="lazy" decoding="async">`);
    li = li.replace(/<figcaption>[\s\S]*?<\/figcaption>/, `<figcaption><strong>${esc(b.titel || "")}</strong>${b.alt ? " – " + esc(b.alt) : ""}</figcaption>`);
    eingefuegt += "\n          " + li; n++;
  }
  if (n) { html = html.slice(0, ende) + eingefuegt + "\n        " + html.slice(ende); fs.writeFileSync(f, html); }
  return n;
}

function bewertungenSchreiben(root, liste) {
  const frei = (Array.isArray(liste) ? liste : []).filter((b) => b.status === "freigegeben" || b.status === undefined)
    .map((b) => ({ name: b.name, ort: b.ort, projekt: b.projekt || "", sterne: Number(b.sterne) || 5, text: b.text, datum: b.datum || "" }));
  fs.writeFileSync(path.join(root, "data", "bewertungen.json"), JSON.stringify(frei, null, 2) + "\n");
  return frei.length;
}
function redirectsSchreiben(root, status) {
  const kopf = "# Automatisch erzeugt von scripts/build.js – nicht von Hand bearbeiten.\n";
  const vorschau = status === "vorschau" ? "/konfigurator/*  /.netlify/functions/konfigurator-vorschau  200!\n" : "";
  fs.writeFileSync(path.join(root, "_redirects"), kopf + vorschau);
}

async function lauf(opt = {}) {
  const root = opt.root || path.join(__dirname, "..");
  const schritte = opt.schritte || DEFAULT_SCHRITTE;
  const log = opt.log || console.log;
  const hook = process.env.INCOMING_HOOK_TITLE || "";
  const start = Date.now();
  const kontext = opt.kontext || process.env.CONTEXT || "";
  const adminAktiv = opt.adminAktiv !== undefined ? opt.adminAktiv : !!process.env.ADMIN_SETUP_TOKEN;
  /* Woher kommen die Admin-Daten? Lokaler Dateistore (Tests), Blobs (Build mit SITE_ID + NETLIFY_BLOBS_TOKEN) oder gar nicht. */
  const blobs = opt.blobs || (process.env.FW_STORE_DIR ? { ok: true, art: "datei" } : store.blobsStatus());
  let mitStore = opt.mitStore !== undefined ? opt.mitStore : blobs.ok && !process.argv.includes("--ohne-blobs");
  /* Status schreiben darf den Build NIE abbrechen */
  const statusSetzen = async (s) => { if (!mitStore) return; try { await daten.setPublishStatus(s); } catch (e) { log("Warnung: Veröffentlichungsstatus nicht speicherbar (" + e.message + ")."); } };
  const fehlerMelden = async (text) => {
    log("✖ " + text);
    await statusSetzen({ status: "fehler", fehler: text, ende: Date.now(), dauerMs: Date.now() - start });
    if (mitStore && !opt.ohneMail) await benachrichtigen(false, text);
    return { ok: false, fehler: text };
  };
  /* Ohne Blobs: auf Produktion mit aktivem Admin abbrechen (sonst würde ohne Admin-Daten veröffentlicht), andernfalls Hinweis. */
  const ohneAdminDaten = (grund) => {
    if (kontext === "production" && adminAktiv) { const t = `Build abgebrochen: Der Admin-Bereich ist aktiv (ADMIN_SETUP_TOKEN gesetzt), aber die Admin-Daten sind im Build nicht erreichbar (${grund}). Bitte NETLIFY_BLOBS_TOKEN (Scope Builds) setzen – sonst würde die Website ohne die im Admin gespeicherten Preise/Texte veröffentlicht.`; log("✖ " + t); return { ok: false, fehler: t }; }
    log(`Admin-Daten nicht verfügbar – ${grund}. Build mit den Daten aus dem Repository.`);
    mitStore = false;
    redirectsSchreiben(root, daten.repoDatei("einstellungen").konfigurator.status);
    return null;
  };
  if (!mitStore && !opt.mitStore) { const abbruch = ohneAdminDaten(blobs.grund || "kein Datenspeicher"); if (abbruch) return abbruch; }

  try {
    if (mitStore) {
      await statusSetzen({ status: "laeuft", start, fehler: "", ausloeser: hook || kontext || "build" });
      /* 1) Daten holen und prüfen */
      const preise = await daten.lade("preise");
      const fp = validate.validierePreise(preise);
      if (fp.length) return await fehlerMelden("Preisliste ungültig: " + fp.map((x) => (x.feld ? x.feld + ": " : "") + x.meldung).join(" · "));
      const einst = await daten.lade("einstellungen");
      const fe = validate.validiereEinstellungen(einst);
      if (fe.length) return await fehlerMelden("Einstellungen ungültig: " + fe.map((x) => x.meldung).join(" · "));
      const texte = await daten.lade("texte");
      const bilder = await daten.lade("bilder");
      const bew = await daten.lade("bewertungen");
      const repoEinst = daten.repoDatei("einstellungen");
      repoEinst.konfigurator.status = einst.konfigurator.status;
      fs.writeFileSync(path.join(root, "data", "preise.json"), JSON.stringify(preise, null, 2) + "\n");
      fs.writeFileSync(path.join(root, "data", "einstellungen.json"), JSON.stringify(repoEinst, null, 2) + "\n");
      const nT = texteEinsetzen(root, texte);
      const nB = await bilderEinsetzen(root, bilder, texte);
      const nBew = bewertungenSchreiben(root, bew);
      redirectsSchreiben(root, einst.konfigurator.status);
      log(`Admin-Daten übernommen: Preisliste ${preise.version}, Konfigurator ${einst.konfigurator.status}, ${nT} Texte, ${nB} Bilder, ${nBew} Bewertungen.`);
    }
  } catch (e) {
    /* Zugriff verweigert (401/403)? Dann Hinweis zum Token ins Protokoll – ohne den Wert selbst. */
    if (/401|403|does not have access|unauthori|forbidden|invalid token/i.test(e.message)) log("Hinweis: " + env.blobsTokenHinweis());
    if (hook) return await fehlerMelden("Admin-Daten konnten nicht geladen werden: " + e.message);
    const abbruch = ohneAdminDaten("Zugriff fehlgeschlagen: " + e.message);
    if (abbruch) return abbruch;
  }

  /* 2)+3) Tests und Generatoren – jeder Fehler bricht ab */
  for (const s of schritte) {
    log("▶ " + s.name);
    try { execSync(s.cmd, { cwd: root, stdio: opt.still ? "pipe" : "inherit", env: process.env }); }
    catch (e) {
      const ausgabe = (e.stderr && e.stderr.toString()) || (e.stdout && e.stdout.toString()) || e.message;
      const zeile = ausgabe.split("\n").map((z) => z.trim()).filter((z) => /not ok|Error|AssertionError|fehlgeschlagen|ungültig|✖|verfehlt/i.test(z)).slice(0, 4).join(" | ") || ausgabe.trim().slice(-300);
      return await fehlerMelden(`${s.name} fehlgeschlagen: ${zeile}`);
    }
  }
  if (mitStore) {
    await statusSetzen({ status: "veroeffentlicht", ende: Date.now(), dauerMs: Date.now() - start, fehler: "", letzteVeroeffentlichung: Date.now() });
    if (!opt.ohneMail && hook) await benachrichtigen(true, `Auslöser: ${hook}`);
  }
  log("✔ Build erfolgreich.");
  return { ok: true };
}

async function benachrichtigen(ok, detail) {
  try {
    const konto = await store.getJSON("konto", null);
    if (!konto || !konto.notify || !konto.notify.email) return;
    const v = mail.vorlagen.veroeffentlicht(ok, detail);
    await mail.send({ to: konto.notify.email, subject: v.subject, text: v.text });
  } catch (e) { /* Benachrichtigung ist optional */ }
}

module.exports = { lauf, texteEinsetzen, bilderEinsetzen, bewertungenSchreiben, redirectsSchreiben, DEFAULT_SCHRITTE };

if (require.main === module) {
  lauf().then((r) => process.exit(r.ok ? 0 : 1)).catch((e) => { console.error(e); process.exit(1); });
}
