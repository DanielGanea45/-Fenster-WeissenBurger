#!/usr/bin/env node
/* Admin-Smoke-Test: Jede Admin-Seite wird in Chrome (headless) geöffnet – Übersicht, Bilder, Texte, Produkte,
   Bewertungen, Preise (alle Reiter), Anfragen, Angebote & Rechnungen, Kunden, Einstellungen (alle Zweige),
   Änderungs- und Zugriffsprotokoll, Konto, Anmeldung. Der Test schlägt fehl bei Konsolenfehlern, JavaScript-Fehlern,
   fehlgeschlagenen Dateien/Anfragen oder einer Ansicht, die nur „Fehler“ bzw. gar keinen Inhalt zeigt.
   Läuft im Netlify-Build NACH der Minimierung gegen die fertigen Dateien (eigener kleiner Server mit Dateispeicher
   und Testkonto) – schlägt er fehl, wird nicht veröffentlicht.
   Aufruf: node scripts/admin-smoke.js            → eigener Server + Testkonto (Repo-Daten)
           node scripts/admin-smoke.js --base http://localhost:8899 --email … --passwort …   → vorhandener Server
   Chrome: CHROME_PATH, sonst bekannte Pfade, sonst @sparticuz/chromium bzw. der Chrome aus dem puppeteer-Cache. */
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const ROOT = path.join(__dirname, "..");
const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i > 0 ? process.argv[i + 1] : d; };
const SEITEN = ["uebersicht", "bilder", "texte", "texte/einsatzgebiet", "produkte", "bewertungen", "preise", "preise/haustuer", "preise/schiebetuer", "preise/allgemein", "anfragen", "angebote", "kunden", "einstellungen/firma", "einstellungen/steuer", "einstellungen/bank", "einstellungen/dokumente", "einstellungen/email", "einstellungen/bewertungen", "einstellungen/oeffnungszeiten", "einstellungen/konfigurator", "einstellungen/konten", "einstellungen/website", "versionen", "protokoll", "konto"];
const WARTEN_AUF = { uebersicht: ".kpi:not(.skeleton)", texte: ".tx-editor", "texte/einsatzgebiet": ".tx-editor", angebote: "#bel-tabelle table, #bel-tabelle .bel-leer", kunden: "#ku-tabelle table, #ku-tabelle .bel-leer, #ku-tabelle .alert", preise: "#calc .preis-gross, #calc .err" };

/* ---------- eigener Testserver (statische Dateien + Functions mit Dateispeicher) ---------- */
const HeadersLib = require(path.join(__dirname, "headers.js"));
function starteServer() {
  const store = fs.mkdtempSync(path.join(os.tmpdir(), "fw-smoke-"));
  process.env.FW_STORE_DIR = store;
  process.env.ADMIN_SETUP_TOKEN = process.env.ADMIN_SETUP_TOKEN || "smoke-setup-token-1234567890";
  process.env.SESSION_SECRET = process.env.SESSION_SECRET || "smoke-session-secret-0123456789abcdefghijklmnop";
  for (const k of ["NETLIFY", "CONTEXT", "URL", "DEPLOY_PRIME_URL", "NETLIFY_BLOBS_TOKEN", "NETLIFY_BUILD_HOOK", "BREVO_API_KEY", "AWS_LAMBDA_FUNCTION_NAME"]) delete process.env[k];
  const FN = {};
  for (const f of ["admin-auth", "admin-api", "admin-seite", "admin-bild", "konfigurator-vorschau", "anfrage", "belege"]) FN[f] = require(path.join(ROOT, "netlify/functions", f + ".js")).handler;
  const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".webp": "image/webp", ".avif": "image/avif", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".mp4": "video/mp4", ".xml": "application/xml", ".txt": "text/plain" };
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, "http://localhost");
    let fn = null; const m = u.pathname.match(/^\/\.netlify\/functions\/([a-z-]+)/);
    if (m && FN[m[1]]) fn = m[1]; else if (/^\/admin(\/|$)/.test(u.pathname)) fn = "admin-seite";
    if (fn) {
      const chunks = []; for await (const c of req) chunks.push(c);
      const headers = {}; for (const [k, v] of Object.entries(req.headers)) headers[k.toLowerCase()] = v; headers["x-forwarded-for"] = "127.0.0.1";
      let out; try { out = await FN[fn]({ httpMethod: req.method, path: u.pathname, headers, body: Buffer.concat(chunks).toString("utf8") || null, isBase64Encoded: false, queryStringParameters: Object.fromEntries(u.searchParams) }); } catch (e) { out = { statusCode: 500, body: String(e.stack) }; }
      res.writeHead(out.statusCode, out.headers || {}); res.end(out.isBase64Encoded ? Buffer.from(out.body, "base64") : out.body); return;
    }
    let p = path.join(ROOT, decodeURIComponent(u.pathname));
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, "index.html");
    if (!fs.existsSync(p)) { res.writeHead(404); res.end("404"); return; }
    const kopf = { "Content-Type": MIME[path.extname(p)] || "application/octet-stream", "Cache-Control": "no-store" };
    if (p.endsWith(".html")) kopf["Content-Security-Policy"] = HeadersLib.csp({ chat: u.searchParams.get("chat") === "1" }); // wie Netlify aus _headers
    res.writeHead(200, kopf); fs.createReadStream(p).pipe(res);
  });
  return new Promise((res) => server.listen(0, "127.0.0.1", () => res({ server, base: "http://127.0.0.1:" + server.address().port, store })));
}

/* ---------- Live-Chat: Zwei-Klick-Lösung, Kopfzeilen, keine Fremdanfrage vor dem Klick ----------
   Ohne Kennung (Repo-Stand) darf nichts erscheinen; mit Kennung (hier per Anfrage-Umleitung in js/chat.js eingesetzt) erscheint
   nur unser Knopf, erst „Chat laden“ fordert client.crisp.chat/l.js an (die Anfrage wird abgefangen – kein echter Netzverkehr). */
async function chatPruefung(browser, base, befunde) {
  const TEST_ID = "0123456789abcdef-0123-4567-89ab-cdef01234567";
  const quelle = fs.readFileSync(path.join(ROOT, "js", "chat.js"), "utf8");
  const mitKonfig = (cfg) => quelle.replace(/\/\*CHAT\*\/[\s\S]*?\/\*\/CHAT\*\//, "/*CHAT*/" + JSON.stringify(cfg) + "/*/CHAT*/");
  const warte = (ms) => new Promise((r) => setTimeout(r, ms));
  const seiteOeffnen = async (cfg, chatKopf) => {
    const p = await browser.newPage(); await p.setViewport({ width: 1366, height: 900 });
    const extern = [], konsole = [];
    p.on("console", (m) => { if (m.type() === "error") konsole.push(m.text().slice(0, 200)); });
    p.on("pageerror", (e) => konsole.push("JavaScript-Fehler: " + e.message));
    await p.setRequestInterception(true);
    p.on("request", (r) => {
      const u = r.url();
      if (/^(data|blob):/.test(u)) return r.continue(); // eingebettete Bilder (CSS) sind keine Fremdanfragen
      if (u.startsWith(base)) {
        if (/\/js\/chat\.js(\?|$)/.test(u)) return r.respond({ status: 200, contentType: "text/javascript", body: mitKonfig(cfg) });
        return r.continue();
      }
      extern.push(u);
      if (/^https:\/\/client\.crisp\.chat\/l\.js/.test(u)) return r.respond({ status: 200, contentType: "text/javascript", body: "window.__crispGeladen = true;" });
      return r.abort();
    });
    await p.goto(base + "/?chat=" + (chatKopf ? "1" : "0"), { waitUntil: "networkidle0", timeout: 60000 });
    await warte(500);
    return { p, extern, konsole };
  };
  /* a) ohne Kennung / Schalter aus: nichts */
  let { p, extern, konsole } = await seiteOeffnen({ id: "", aktiv: false, whatsapp: "" }, false);
  if (await p.$(".chat-fab")) befunde.push("live-chat: Knopf erscheint, obwohl der Chat aus ist");
  if (extern.length) befunde.push("live-chat (aus): Fremdanfragen: " + extern.slice(0, 3).join(", "));
  for (const k of konsole) if (!/favicon/.test(k)) befunde.push("live-chat (aus): Konsole: " + k);
  await p.close();
  /* b) an: Knopf, Hinweis, keine Fremdanfrage vor dem Klick, nach „Chat laden“ genau das Crisp-Skript, keine CSP-Meldung */
  ({ p, extern, konsole } = await seiteOeffnen({ id: TEST_ID, aktiv: true, whatsapp: "4917681338935" }, true));
  if (!(await p.$(".chat-fab"))) befunde.push("live-chat: Knopf „Chat starten“ fehlt");
  if (extern.length) befunde.push("live-chat: Fremdanfragen VOR dem Klick: " + extern.slice(0, 3).join(", "));
  const vorher = await p.evaluate(() => ({ cookies: document.cookie, merker: sessionStorage.getItem("fw-chat-ok"), skripte: [...document.scripts].map((s) => s.src).filter((s) => /crisp/.test(s)).length }));
  if (vorher.cookies || vorher.merker || vorher.skripte) befunde.push("live-chat: vor dem Klick bereits Cookie/Merker/Skript: " + JSON.stringify(vorher));
  await p.click(".chat-fab"); await warte(300);
  const panel = await p.evaluate(() => { const d = document.querySelector(".chat-panel"); return d && !d.hidden ? { text: d.textContent, wa: !!d.querySelector('a[href^="https://wa.me/4917681338935"]'), ds: !!d.querySelector('a[href="/datenschutz.html#live-chat"]') } : null; });
  if (!panel) befunde.push("live-chat: Hinweis öffnet sich nicht");
  else { if (!/Crisp IM SAS, Frankreich/.test(panel.text)) befunde.push("live-chat: Hinweistext fehlt"); if (!panel.wa) befunde.push("live-chat: WhatsApp-Link fehlt"); if (!panel.ds) befunde.push("live-chat: Link zur Datenschutzerklärung fehlt"); }
  if (extern.length) befunde.push("live-chat: Fremdanfragen nach Öffnen des Hinweises: " + extern.slice(0, 3).join(", "));
  await p.click(".chat-panel .btn--ghost"); await warte(200);
  if (await p.evaluate(() => !document.querySelector(".chat-panel").hidden)) befunde.push("live-chat: „Abbrechen“ schließt den Hinweis nicht");
  if (extern.length) befunde.push("live-chat: Fremdanfragen nach „Abbrechen“: " + extern.slice(0, 3).join(", "));
  await p.click(".chat-fab"); await warte(200);
  await p.click(".chat-panel .btn--primary"); await warte(1200);
  const nachher = await p.evaluate(() => ({ merker: sessionStorage.getItem("fw-chat-ok"), geladen: !!window.__crispGeladen, id: window.CRISP_WEBSITE_ID, locale: window.CRISP_RUNTIME_CONFIG && window.CRISP_RUNTIME_CONFIG.locale }));
  if (nachher.merker !== "1") befunde.push("live-chat: Merker im Sitzungsspeicher fehlt nach „Chat laden“");
  if (!extern.some((u) => /^https:\/\/client\.crisp\.chat\/l\.js/.test(u))) befunde.push("live-chat: Crisp-Skript wird nach „Chat laden“ nicht angefordert (CSP?) – Anfragen: " + extern.join(", "));
  if (!nachher.geladen) befunde.push("live-chat: Crisp-Skript nicht ausgeführt (Kopfzeile blockiert?)");
  if (nachher.id !== TEST_ID || nachher.locale !== "de") befunde.push("live-chat: Crisp-Konfiguration (Kennung/Sprache) fehlt: " + JSON.stringify(nachher));
  const fremd = extern.filter((u) => !/^https:\/\/client\.crisp\.chat\//.test(u));
  if (fremd.length) befunde.push("live-chat: unerwartete Fremdanfragen: " + fremd.slice(0, 3).join(", "));
  for (const k of konsole) if (/Content Security Policy|Refused to/.test(k)) befunde.push("live-chat: CSP-Meldung: " + k);
  for (const k of konsole) if (/JavaScript-Fehler/.test(k)) befunde.push("live-chat: " + k);
  await p.close();
}

/* ---------- Chrome finden ---------- */
async function chromePfad() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return { pfad: process.env.CHROME_PATH, args: ["--no-sandbox"] };
  const bekannt = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"];
  for (const p of bekannt) if (fs.existsSync(p)) return { pfad: p, args: ["--no-sandbox"] };
  /* Mitgelieferter Chromium (Lambda-Paket): die beigelegten Bibliotheken werden nur in einer Lambda-ähnlichen Umgebung
     entpackt – deshalb vor dem Laden markieren, dann läuft er auch im Build-Image ohne Systembibliotheken */
  if (!process.env.AWS_EXECUTION_ENV) process.env.AWS_EXECUTION_ENV = "AWS_Lambda_nodejs20.x";
  try { const m = require("@sparticuz/chromium"); const chromium = m && m.default ? m.default : m; const pfad = await chromium.executablePath(); if (pfad && fs.existsSync(pfad)) return { pfad, args: (chromium.args || []).concat(["--no-sandbox"]) }; console.error("Admin-Smoke-Test: @sparticuz/chromium lieferte keinen Pfad."); } catch (e) { console.error("Admin-Smoke-Test: @sparticuz/chromium nicht nutzbar:", e.message); }
  try { const pp = require("puppeteer"); return { pfad: pp.executablePath(), args: ["--no-sandbox"] }; } catch (e) { /* nicht installiert */ }
  return null;
}

if (!process.env.NETLIFY && !process.argv.includes("--erzwingen") && !arg("base")) { console.log("Admin-Smoke-Test: nur im Netlify-Build (lokal: --erzwingen oder --base URL)."); process.exit(0); }
(async () => {
  const puppeteer = require("puppeteer-core");
  const chrome = await chromePfad();
  if (!chrome) { console.error("Admin-Smoke-Test: kein Chrome gefunden (CHROME_PATH setzen oder @sparticuz/chromium installieren)."); process.exit(2); }
  let base = arg("base"), eigener = null, email = arg("email", "smoke@example.de"), passwort = arg("passwort", "Smoke-Test-Passwort-2026!");
  if (!base) { eigener = await starteServer(); base = eigener.base; }
  const befunde = [];
  const browser = await puppeteer.launch({ executablePath: chrome.pfad, headless: true, args: chrome.args, protocolTimeout: 120000 });
  const p = await browser.newPage(); await p.setViewport({ width: 1366, height: 900 });
  let seite = "start";
  p.on("pageerror", (e) => befunde.push(`${seite}: JavaScript-Fehler: ${e.message}`));
  p.on("console", (m) => { if (m.type() === "error") befunde.push(`${seite}: Konsole: ${m.text().slice(0, 200)}`); });
  p.on("requestfailed", (r) => { const f = r.failure() && r.failure().errorText; if (!/favicon/.test(r.url()) && !(f === "net::ERR_ABORTED" && /\.(webm|mp4)(\?|$)/.test(r.url()))) befunde.push(`${seite}: Datei nicht geladen: ${r.url()} (${r.failure() && r.failure().errorText})`); });
  p.on("response", (r) => { const u = r.url(); if (r.status() >= 400 && !/favicon/.test(u) && !/admin-auth$/.test(u)) befunde.push(`${seite}: HTTP ${r.status()}: ${u.replace(base, "")}`); });
  p.on("dialog", (d) => d.dismiss());
  try {
    /* Anmelden bzw. Testkonto anlegen */
    seite = "anmeldung";
    await p.goto(base + "/admin/" + (eigener ? "?token=" + process.env.ADMIN_SETUP_TOKEN : ""), { waitUntil: "networkidle0", timeout: 60000 });
    if (await p.$("#f-setup")) { await p.type("#f-setup [name=email]", email); await p.type("#f-setup [name=p1]", passwort); await p.type("#f-setup [name=p2]", passwort); await p.click("#f-setup button[type=submit]"); }
    else if (await p.$("#f-login")) { await p.type("#f-login [name=email]", email); await p.type("#f-login [name=passwort]", passwort); await p.click("#f-login button[type=submit]"); }
    else befunde.push("anmeldung: weder Anmelde- noch Einrichtungsformular sichtbar: " + (await p.evaluate(() => document.body.innerText.slice(0, 160))));
    await p.waitForSelector("#app:not([hidden])", { timeout: 30000 }).catch(() => befunde.push("anmeldung: Verwaltung erscheint nach der Anmeldung nicht"));
    let nr = 0;
    for (const s of SEITEN) {
      seite = s; nr++;
      /* jede Seite frisch laden (eigene Abfrage-Kennung), damit Fehler einer Seite nicht in die nächste tragen */
      await p.goto(base + "/admin/?smoke=" + nr + "#" + s, { waitUntil: "load", timeout: 60000 });
      await p.waitForSelector("#app:not([hidden]) #main", { timeout: 30000 }).catch(() => {});
      const sel = WARTEN_AUF[s] || "#main .card, #main .page-head, #main table";
      await p.waitForSelector(sel, { timeout: 30000 }).catch(() => {});
      await new Promise((r) => setTimeout(r, 400));
      const m = await p.evaluate(() => ({ text: document.querySelector("#main").innerText.trim(), fehler: !!document.querySelector("#main > .alert--err"), skelett: !!document.querySelector("#main .skelett") }));
      if (m.skelett) befunde.push(`${s}: Ansicht bleibt beim Platzhalter (lädt nicht)`);
      if (!m.text) befunde.push(`${s}: Ansicht ist leer`);
      if (m.fehler || /^Fehler\b/.test(m.text) || /konnte nicht geladen werden/.test(m.text.split("\n")[0] || "")) befunde.push(`${s}: Ansicht zeigt eine Fehlermeldung: ${m.text.split("\n").slice(0, 2).join(" ").slice(0, 200)}`);
    }
    /* Live-Chat (Crisp, Zwei-Klick) auf der Startseite – mit der Kopfzeile wie in Produktion */
    seite = "live-chat"; await chatPruefung(browser, base, befunde);
  } catch (e) { befunde.push(`${seite}: Abbruch: ${e.message}`); }
  await browser.close();
  if (eigener) { eigener.server.close(); try { fs.rmSync(eigener.store, { recursive: true, force: true }); } catch (e) { /* egal */ } }
  if (befunde.length) { console.error(`Admin-Smoke-Test: ${befunde.length} Befund(e):\n - ` + befunde.join("\n - ")); process.exit(1); }
  console.log(`Admin-Smoke-Test: ${SEITEN.length} Admin-Seiten ohne Fehler geladen, Live-Chat (Zwei-Klick, Kopfzeilen) geprüft (${base}).`);
  process.exit(0);
})().catch((e) => { console.error("Admin-Smoke-Test abgebrochen:", e); process.exit(1); });
