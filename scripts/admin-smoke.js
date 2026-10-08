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
const SEITEN = ["uebersicht", "bilder", "texte", "texte/einsatzgebiet", "produkte", "bewertungen", "preise", "preise/haustuer", "preise/schiebetuer", "preise/allgemein", "anfragen", "angebote", "kunden", "assistent", "einstellungen/firma", "einstellungen/steuer", "einstellungen/bank", "einstellungen/dokumente", "einstellungen/email", "einstellungen/bewertungen", "einstellungen/oeffnungszeiten", "einstellungen/konfigurator", "einstellungen/konten", "einstellungen/website", "versionen", "protokoll", "konto"];
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
  for (const f of ["admin-auth", "admin-api", "admin-seite", "admin-bild", "konfigurator-vorschau", "anfrage", "belege", "assistent"]) FN[f] = require(path.join(ROOT, "netlify/functions", f + ".js")).handler;
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
    if (p.endsWith(".html")) kopf["Content-Security-Policy"] = HeadersLib.csp(); // wie Netlify aus _headers
    res.writeHead(200, kopf); fs.createReadStream(p).pipe(res);
  });
  return new Promise((res) => server.listen(0, "127.0.0.1", () => res({ server, base: "http://127.0.0.1:" + server.address().port, store })));
}

/* ---------- KI-Assistent: Zwei-Klick, keine Anfrage vor dem Start, Gespräch mit Preisberechnung (OpenAI simuliert) ----------
   Ohne Schlüssel (Repo-Stand) darf nichts erscheinen. Für den Gesprächstest bekommt die Function in diesem Prozess einen
   Test-Schlüssel und eine simulierte OpenAI-Antwort (setFetch); der Browser erhält die Startseite mit aktivem data-aktiv am Skript-Tag. */
async function assistentPruefung(browser, base, befunde) {
  const As = require(path.join(ROOT, "netlify/functions/_lib/assistent"));
  const Tag = require(path.join(__dirname, "assistent-tag.js"));
  const startseite = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const mitKonfig = (cfg) => Tag.einsetzen(startseite, { assistent: { aktiv: !!cfg.aktiv }, website: { whatsapp: cfg.whatsapp || "" } }, !!cfg.aktiv);
  const warte = (ms) => new Promise((r) => setTimeout(r, ms));
  const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
  const seiteOeffnen = async (cfg) => {
    const p = await browser.newPage(); await p.setViewport({ width: 1366, height: 900 }); await p.setUserAgent(UA);
    const extern = [], eigene = [], konsole = [];
    p.on("console", (m) => { if (m.type() === "error") konsole.push(m.text().slice(0, 200)); });
    p.on("pageerror", (e) => konsole.push("JavaScript-Fehler: " + e.message));
    await p.setRequestInterception(true);
    p.on("request", (r) => {
      const u = r.url();
      if (/^(data|blob):/.test(u)) return r.continue();
      if (u.startsWith(base)) { if (u === base + "/" || u === base + "/index.html") return r.respond({ status: 200, contentType: "text/html; charset=utf-8", headers: { "Content-Security-Policy": HeadersLib.csp() }, body: mitKonfig(cfg) }); if (/\/\.netlify\/functions\/assistent/.test(u)) eigene.push(u); return r.continue(); }
      extern.push(u); return r.abort();
    });
    await p.goto(base + "/", { waitUntil: "networkidle0", timeout: 60000 });
    await warte(500);
    return { p, extern, eigene, konsole };
  };
  /* a) aus: nichts */
  let { p, extern, eigene, konsole } = await seiteOeffnen({ aktiv: false, whatsapp: "" });
  if (await p.$(".ki-fab")) befunde.push("assistent: Knopf erscheint, obwohl der Assistent aus ist");
  if (extern.length || eigene.length) befunde.push("assistent (aus): Anfragen: " + extern.concat(eigene).slice(0, 3).join(", "));
  await p.close();
  /* b) an: Test-Schlüssel + simulierte OpenAI-Antworten in diesem Prozess */
  const altKey = process.env.OPENAI_API_KEY; process.env.OPENAI_API_KEY = "sk-smoke-test";
  const altFetch = As.setFetch;
  let aufrufe = 0;
  As.setFetch(async (url, opt) => {
    aufrufe++;
    const body = JSON.parse(opt.body);
    const letzte = body.messages[body.messages.length - 1];
    const antwort = (o) => ({ ok: true, status: 200, json: async () => o, text: async () => JSON.stringify(o) });
    const usage = { prompt_tokens: 1200, completion_tokens: 80, prompt_tokens_details: { cached_tokens: 1000 } };
    if (letzte.role === "tool") { const t = JSON.parse(letzte.content); return antwort({ choices: [{ message: { role: "assistant", content: t.ok ? `Ihr unverbindlicher Richtpreis: ${t.endpreis} (${t.steuerKurz}). ${t.preishinweis}.` : As.UNSICHER + " Soll ich Ihre Anfrage an unser Team weiterleiten?" } }], usage }); }
    if (/preis|kostet/i.test(letzte.content || "")) return antwort({ choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "call_1", type: "function", function: { name: "preis_berechnen", arguments: JSON.stringify({ produkt: "fenster", breiteMm: 1200, hoeheMm: 1400 }) } }] } }], usage });
    return antwort({ choices: [{ message: { role: "assistant", content: "Gern – wir fertigen Fenster aus Kunststoff, Kunststoff-Aluminium und Aluminium." } }], usage });
  });
  try {
    ({ p, extern, eigene, konsole } = await seiteOeffnen({ aktiv: true, whatsapp: "4917681338935" }));
    if (!(await p.$(".ki-fab"))) befunde.push("assistent: Knopf fehlt");
    if (eigene.length || extern.length) befunde.push("assistent: Anfragen VOR dem Start: " + eigene.concat(extern).slice(0, 3).join(", "));
    await p.click(".ki-fab"); await warte(300);
    const panel = await p.evaluate(() => { const d = document.querySelector(".ki-panel"); return d && !d.hidden ? { text: d.textContent, wa: !!d.querySelector('a[href^="https://wa.me/4917681338935"]'), ds: !!d.querySelector('a[href="/datenschutz.html#ki-assistent"]'), ki: !!d.querySelector(".ki-badge") } : null; });
    if (!panel) befunde.push("assistent: Hinweis öffnet sich nicht");
    else { if (!/an OpenAI übertragen/.test(panel.text)) befunde.push("assistent: Hinweistext fehlt"); if (!panel.wa) befunde.push("assistent: WhatsApp-Link fehlt"); if (!panel.ds) befunde.push("assistent: Datenschutz-Link fehlt"); if (!panel.ki) befunde.push("assistent: KI-Etikett fehlt"); }
    if (eigene.length || extern.length) befunde.push("assistent: Anfragen nach Öffnen des Hinweises: " + eigene.concat(extern).slice(0, 3).join(", "));
    await p.click(".ki-panel .btn--primary");
    await p.waitForSelector(".ki-dialog:not([hidden])", { timeout: 15000 }).catch(() => befunde.push("assistent: Chatfenster erscheint nach „Chat starten“ nicht"));
    await warte(800);
    const begr = await p.evaluate(() => { const m = document.querySelector(".ki-msg--assistent .ki-msg__text"); return m ? m.textContent : ""; });
    if (!/digitale Assistent von Fenster-WeissenBurger \(KI\)/.test(begr)) befunde.push("assistent: Begrüßung fehlt oder falsch: " + begr.slice(0, 80));
    if (!(await p.$(".ki-dialog .ki-badge"))) befunde.push("assistent: KI-Etikett im Chatfenster fehlt");
    if (eigene.length !== 1) befunde.push("assistent: nach dem Start erwartet genau eine eigene Anfrage (start), gezählt " + eigene.length);
    if (extern.length) befunde.push("assistent: Fremdanfragen aus dem Browser: " + extern.slice(0, 3).join(", "));
    /* Nachricht mit Preisfrage (Mindestabstand 2 s nach Start beachten) */
    await warte(2100);
    await p.type(".ki-dialog__eingabe", "Was kostet ein Fenster 1200 x 1400 mm?");
    await p.click(".ki-dialog__senden");
    await p.waitForFunction(() => document.querySelectorAll(".ki-msg--assistent:not(.ki-msg--warte)").length >= 2, { timeout: 20000 }).catch(() => befunde.push("assistent: keine Antwort auf die Preisfrage"));
    await warte(1500);
    const antw = await p.evaluate(() => { const m = [...document.querySelectorAll(".ki-msg--assistent:not(.ki-msg--warte)")].pop(); return m ? { text: m.querySelector(".ki-msg__text").textContent, links: [...m.querySelectorAll(".ki-msg__links a")].map((a) => a.getAttribute("href")) } : null; });
    if (!antw || !/Richtpreis/.test(antw.text) || !/€/.test(antw.text)) befunde.push("assistent: Preisantwort fehlt: " + JSON.stringify(antw).slice(0, 160));
    if (!antw || !antw.links.some((l) => /^\/konfigurator\/fenster\/#/.test(l))) befunde.push("assistent: Link zum vorausgefüllten Konfigurator fehlt");
    if (aufrufe < 2) befunde.push("assistent: Werkzeugaufruf (preis_berechnen) hat nicht stattgefunden");
    for (const k of konsole) if (/Content Security Policy|Refused to|JavaScript-Fehler/.test(k)) befunde.push("assistent: " + k);
    /* Esc schließt, Knopf kommt zurück */
    await p.keyboard.press("Escape"); await warte(200);
    if (await p.evaluate(() => !document.querySelector(".ki-dialog").hidden)) befunde.push("assistent: Esc schließt das Chatfenster nicht");
    await p.close();
  } finally {
    As.setFetch(null);
    if (altKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = altKey;
    void altFetch;
  }
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
    /* KI-Assistent (Zwei-Klick) auf der Startseite – mit der Kopfzeile wie in Produktion */
    seite = "assistent"; await assistentPruefung(browser, base, befunde);
  } catch (e) { befunde.push(`${seite}: Abbruch: ${e.message}`); }
  await browser.close();
  if (eigener) { eigener.server.close(); try { fs.rmSync(eigener.store, { recursive: true, force: true }); } catch (e) { /* egal */ } }
  if (befunde.length) { console.error(`Admin-Smoke-Test: ${befunde.length} Befund(e):\n - ` + befunde.join("\n - ")); process.exit(1); }
  console.log(`Admin-Smoke-Test: ${SEITEN.length} Admin-Seiten ohne Fehler geladen, KI-Assistent (Zwei-Klick, Gespräch) geprüft (${base}).`);
  process.exit(0);
})().catch((e) => { console.error("Admin-Smoke-Test abgebrochen:", e); process.exit(1); });
