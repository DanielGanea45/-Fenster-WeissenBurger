#!/usr/bin/env node
/* Formular-Smoke-Test: jedes Anfrageformular im echten Chrome bei 390 px Breite absenden – MIT JavaScript (Versand über die
   Function, Weiterleitung per JavaScript) und OHNE JavaScript (klassischer Versand, Function antwortet mit 303) – und prüfen,
   dass der Besucher auf der Dankeseite (HTTP 200, „Vielen Dank“) landet, die Anfrage im Speicher liegt und Benachrichtigung
   + Bestätigung erzeugt wurden. Hintergrund: Auf Produktion endete das Absenden auf der 404-Seite (Netlify Forms nahm die
   POSTs nicht an). Zusätzlich: jedes action/data-danke-Ziel aller Formulare existiert.
   Läuft im Netlify-Build (nach dem Admin-Smoke-Test); lokal mit --erzwingen. Chrome wie beim Admin-Smoke-Test. */
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const ROOT = path.join(__dirname, "..");

if (!process.env.NETLIFY && !process.argv.includes("--erzwingen")) { console.log("Formular-Smoke-Test: nur im Netlify-Build (lokal: --erzwingen)."); process.exit(0); }

/* Eigene, isolierte Umgebung: Dateistore, simulierter Mailversand, kurze Mindestzeit; keine echten Schlüssel */
for (const k of ["NETLIFY", "CONTEXT", "URL", "DEPLOY_PRIME_URL", "NETLIFY_BLOBS_TOKEN", "NETLIFY_BLOBS_CONTEXT", "SITE_ID", "FRC_API_KEY", "AWS_LAMBDA_FUNCTION_NAME", "LAMBDA_TASK_ROOT"]) delete process.env[k];
process.env.FW_STORE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "fw-formular-smoke-"));
process.env.FW_MAIL_SIMULIEREN = "1"; process.env.BREVO_API_KEY = "xkeysib-SMOKE-nicht-echt"; process.env.MAIL_FROM = "firma@example.de";
process.env.SPAM_MIN_SECONDS = "1";
const HeadersLib = require(path.join(__dirname, "headers.js"));
const store = require(path.join(ROOT, "netlify/functions/_lib/store"));
const mail = require(path.join(ROOT, "netlify/functions/_lib/mail"));
const anfrage = require(path.join(ROOT, "netlify/functions/anfrage.js")).handler;
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".webp": "image/webp", ".avif": "image/avif", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon", ".woff2": "font/woff2", ".xml": "application/xml", ".txt": "text/plain" };
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

function server() {
  const s = http.createServer(async (req, res) => {
    const u = new URL(req.url, "http://localhost");
    if (/^\/\.netlify\/functions\/anfrage/.test(u.pathname)) {
      const chunks = []; for await (const c of req) chunks.push(c);
      const headers = {}; for (const [k, v] of Object.entries(req.headers)) headers[k.toLowerCase()] = v; headers["x-forwarded-for"] = "127.0.0.1";
      let out; try { out = await anfrage({ httpMethod: req.method, path: u.pathname, headers, body: Buffer.concat(chunks).toString("utf8") || null, isBase64Encoded: false }); } catch (e) { out = { statusCode: 500, body: "Function-Fehler: " + e.message }; }
      res.writeHead(out.statusCode, out.headers || {}); res.end(out.body || ""); return;
    }
    let p = path.join(ROOT, decodeURIComponent(u.pathname));
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, "index.html");
    if (!fs.existsSync(p)) { res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" }); res.end(fs.readFileSync(path.join(ROOT, "404.html"))); return; }
    const kopf = { "Content-Type": MIME[path.extname(p)] || "application/octet-stream", "Cache-Control": "no-store" };
    if (p.endsWith(".html")) kopf["Content-Security-Policy"] = HeadersLib.csp();
    res.writeHead(200, kopf); fs.createReadStream(p).pipe(res);
  });
  return new Promise((r) => s.listen(0, "127.0.0.1", () => r({ s, base: "http://127.0.0.1:" + s.address().port })));
}
async function chromePfad() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return { pfad: process.env.CHROME_PATH, args: ["--no-sandbox"] };
  const bekannt = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"];
  for (const p of bekannt) if (fs.existsSync(p)) return { pfad: p, args: ["--no-sandbox"] };
  if (!process.env.AWS_EXECUTION_ENV) process.env.AWS_EXECUTION_ENV = "AWS_Lambda_nodejs20.x";
  try { const m = require("@sparticuz/chromium"); const chromium = m && m.default ? m.default : m; const pfad = await chromium.executablePath(); if (pfad && fs.existsSync(pfad)) return { pfad, args: (chromium.args || []).concat(["--no-sandbox"]) }; } catch (e) { /* nicht installiert */ }
  try { const pp = require("puppeteer"); return { pfad: pp.executablePath(), args: ["--no-sandbox"] }; } catch (e) { /* nicht installiert */ }
  return null;
}

/* Statische Prüfung: alle Formulare zeigen auf die Function, jedes Erfolgsziel existiert, kein data-netlify mehr */
function zieleStatisch(befunde) {
  const dateien = [];
  (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (/^(node_modules|\.git|admin|docs)$/.test(e.name)) continue; const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (f.endsWith(".html")) dateien.push(f); } })(ROOT);
  let formulare = 0;
  for (const f of dateien) {
    const h = fs.readFileSync(f, "utf8"); const rel = path.relative(ROOT, f).split(path.sep).join("/");
    for (const m of h.matchAll(/<form\b[^>]*>/g)) {
      const tag = m[0]; if (!/data-anfrage|data-netlify|name="(kontakt|anfrage-[a-z]+|bewertung|angebot-konfigurator)"/.test(tag)) continue;
      formulare++;
      if (/data-netlify/.test(tag)) befunde.push(`${rel}: data-netlify noch vorhanden (${tag.slice(0, 80)})`);
      const action = (tag.match(/action="([^"]*)"/) || [])[1] || "";
      if (action !== "/.netlify/functions/anfrage") befunde.push(`${rel}: action „${action}“ zeigt nicht auf die Function`);
      const danke = (tag.match(/data-danke="([^"]*)"/) || [])[1] || "";
      if (!danke || !fs.existsSync(path.join(ROOT, danke))) befunde.push(`${rel}: Zielseite „${danke}“ existiert nicht`);
    }
  }
  for (const seite of ["danke.html", "anfrage-fehler.html"]) { const p = path.join(ROOT, seite); if (!fs.existsSync(p)) befunde.push(seite + " fehlt"); else if (!/noindex/.test(fs.readFileSync(p, "utf8"))) befunde.push(seite + " ohne noindex"); }
  return formulare;
}

(async () => {
  const befunde = [];
  const formulare = zieleStatisch(befunde);
  await store.setJSON("daten/einstellungen", { email: { anfragen: "firma@example.de", bewertungen: "firma@example.de", absenderName: "Fenster-WeissenBurger" } });
  const puppeteer = require("puppeteer-core");
  const chrome = await chromePfad();
  if (!chrome) { console.error("Formular-Smoke-Test: kein Chrome gefunden (CHROME_PATH setzen oder @sparticuz/chromium installieren)."); process.exit(2); }
  const { s, base } = await server();
  const browser = await puppeteer.launch({ executablePath: chrome.pfad, headless: true, args: chrome.args });
  const ergebnisse = [];
  const SZENEN = [
    { name: "Start (kontakt)", url: "/#kontakt", form: "form[name=kontakt]" },
    { name: "Leistungen", url: "/leistungen/#anfrage", form: "form[name=anfrage-leistungen]" },
    { name: "Produkte (Übersicht)", url: "/produkte/#anfrage", form: "form[name=anfrage-produkte]" },
    { name: "Produktseite Haustüren", url: "/produkte/haustueren/#anfrage", form: "form[name=anfrage-produkte]" },
    { name: "Ortsseite Ingolstadt", url: "/einsatzgebiet/ingolstadt/#anfrage", form: "form[name=anfrage-einsatzgebiet]" },
    { name: "Bewertung (Referenzen)", url: "/referenzen/#bewertung", form: "form[name=bewertung]", bewertung: true },
    { name: "Konfigurator Fenster", url: "/konfigurator/fenster/", form: "form[name=angebot-konfigurator]", konfigurator: true, nurJs: true },
    { name: "Konfigurator Haustür", url: "/konfigurator/haustuer/", form: "form[name=angebot-konfigurator]", konfigurator: true, nurJs: true },
  ];
  for (const sz of SZENEN) {
    for (const js of [true, false]) {
      if (!js && sz.nurJs) continue; // der Konfigurator braucht JavaScript (Preis, Schritte); klassischer Versand wird in tests/kontakt-email.test.js geprüft
      const seitePfad = path.join(ROOT, sz.url.replace(/#.*$/, ""), "index.html");
      if (!fs.existsSync(seitePfad) || !fs.readFileSync(seitePfad, "utf8").includes(sz.form.replace("form[name=", 'name="').replace("]", '"'))) { ergebnisse.push(`${sz.name}: übersprungen (Seite/Formular nicht vorhanden – z. B. Konfigurator offline)`); break; }
      const vorherEintraege = (await store.list("anfragen/")).length;
      const vorherBewertungen = ((await store.getJSON("daten/bewertungen", null)) || []).filter((b) => b.name === "Smoke Test" && b.status === "offen").length;
      mail.protokoll.length = 0;
      const p = await browser.newPage(); await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
      await p.setJavaScriptEnabled(js);
      const fehlerJs = []; p.on("pageerror", (e) => fehlerJs.push(e.message.slice(0, 160)));
      let statusDanke = null; p.on("response", (r) => { if (r.request().resourceType() === "document" && /danke\.html$/.test(new URL(r.url()).pathname)) statusDanke = r.status(); });
      try {
        await p.goto(base + sz.url, { waitUntil: "load", timeout: 60000 });
        if (sz.konfigurator) { for (let i = 0; i < 12; i++) { const r = await p.evaluate(() => { const f = document.querySelector("form[name=angebot-konfigurator]"); if (f && !f.hidden) return "offen"; const b = [...document.querySelectorAll("button,a")].find((x) => /Weiter|Angebot anfordern/.test(x.textContent) && x.offsetParent); if (b) b.click(); return "klick"; }); await warte(500); if (r === "offen") break; } }
        const F = sz.form; const tippe = async (sel, text) => { const el = await p.$(F + " " + sel); if (!el) throw new Error("Feld fehlt: " + sel); await el.click({ clickCount: 3 }); await el.type(text); };
        const haken = async (sel) => {
          const el = await p.$(F + " " + sel); if (!el) throw new Error("Feld fehlt: " + sel);
          await el.evaluate((e) => e.scrollIntoView({ block: "center" })).catch(() => {}); await el.click();
          /* Liegt auf der Startseite die feste Leiste über dem Feld, trifft der Klick daneben – dann direkt setzen (wie ein Tipp aufs Feld) */
          const gesetzt = await el.evaluate((e) => e.checked).catch(() => true);
          if (gesetzt === false) await el.evaluate((e) => { e.checked = true; e.dispatchEvent(new Event("change", { bubbles: true })); });
        };
        await tippe("input[name=name]", "Smoke Test");
        if (sz.bewertung) {
          await tippe("input[name=ort]", "Ingolstadt"); await tippe("textarea[name=text]", "Sehr zufrieden mit Beratung, Aufmaß und Montage – alles pünktlich und sauber.");
          await tippe("input[name=email]", "smoke@example.de"); await haken("input[name=kunde]");
          /* Projekt (Auswahl) und Sterne (Optionsfelder hinter Symbolen) direkt setzen – funktioniert mit und ohne Seitenskripte */
          await p.evaluate((F) => { const f = document.querySelector(F); const sel = f.querySelector("select[name=projekt]"); if (sel) { const o = [...sel.options].find((x) => x.value); if (o) sel.value = o.value; } const st = f.querySelector("input[name=sterne][value='5']"); if (st) st.checked = true; }, F);
        } else {
          await tippe("input[name=plz]", "85049"); await tippe("input[name=email]", "smoke@example.de");
          if (js) await p.select(F + " select[name=anliegen]", "Haustür").catch(() => {});
          const msg = await p.$(F + " textarea[name=nachricht]"); if (msg) { await msg.click(); await msg.type("Smoke-Test " + (js ? "mit" : "ohne") + " JavaScript"); }
        }
        await haken("input[name=datenschutz]");
        if (js) await warte(3300); // Mindestzeit im Browser (js/config.js: 3 s)
        const nav = p.waitForNavigation({ waitUntil: "load", timeout: 20000 });
        await p.evaluate((F) => { const b = document.querySelector(F + " button[type=submit]"); b.scrollIntoView({ block: "center" }); b.click(); }, F); // click() löst den Versand aus – mit Skripten über main.js, ohne Skripte klassisch
        try { await nav; } catch (e) {
          const meldung = await p.evaluate((F) => { const x = document.querySelector(F + " .form__error"); return x && !x.hidden ? x.textContent : "(keine Meldung)"; }, F).catch(() => "?");
          throw new Error("keine Weiterleitung nach dem Absenden – Formularmeldung: " + meldung);
        }
        const url = new URL(p.url());
        let h1 = ""; try { h1 = await p.evaluate(() => (document.querySelector("h1") || {}).textContent || ""); } catch (e) { h1 = ((await p.content()).match(/<h1>([^<]*)/) || [])[1] || ""; }
        /* Ablage: Anfragen als eigene Einträge; Bewertungen in der Liste (beim ersten Eintrag werden die mitgelieferten Bewertungen übernommen → nur den neuesten prüfen) */
        let abgelegt;
        if (sz.bewertung) { const liste = (await store.getJSON("daten/bewertungen", null)) || []; abgelegt = liste.filter((b) => b.name === "Smoke Test" && b.status === "offen").length - vorherBewertungen; }
        else abgelegt = (await store.list("anfragen/")).length - vorherEintraege;
        const mails = mail.protokoll.map((m) => m.to);
        const ok = url.pathname === "/danke.html" && statusDanke === 200 && /Vielen Dank/.test(h1) && abgelegt === 1 && (sz.bewertung ? mails.includes("firma@example.de") : mails.includes("firma@example.de") && mails.includes("smoke@example.de"));
        ergebnisse.push(`${sz.name} ${js ? "mit JS" : "ohne JS"}: ${ok ? "✓" : "✗"} → ${url.pathname}${url.hash} (HTTP ${statusDanke}), H1 „${h1.trim()}“, abgelegt ${abgelegt}, Mails an ${mails.join(", ") || "–"}${fehlerJs.length ? ", JS-Fehler: " + fehlerJs.join(" | ") : ""}`);
        if (!ok) befunde.push(`${sz.name} ${js ? "mit" : "ohne"} JavaScript: nicht auf der Dankeseite gelandet oder Ablage/Mails fehlen`);
      } catch (e) {
        befunde.push(`${sz.name} ${js ? "mit" : "ohne"} JavaScript: ${e.message.slice(0, 200)}`);
        ergebnisse.push(`${sz.name} ${js ? "mit JS" : "ohne JS"}: ✗ ${e.message.slice(0, 160)}`);
      }
      await p.close();
    }
  }
  /* Klassischer Versand mit fehlender E-Mail: Fehlerseite mit Grund, nie 404 */
  {
    const p = await browser.newPage(); await p.setViewport({ width: 390, height: 844, isMobile: true }); await p.setJavaScriptEnabled(false);
    await p.goto(base + "/#kontakt", { waitUntil: "load" });
    const F = "form[name=kontakt]"; const el = await p.$(F + " input[name=name]"); await el.type("Ohne Mail"); await (await p.$(F + " input[name=plz]")).type("85049");
    /* Datenschutz sicher setzen (ein Klick kann unter der festen Leiste der Startseite danebentreffen); der Grund muss trotzdem „email“ lauten – die Function prüft die E-Mail zuerst */
    const ds = await p.$(F + " input[name=datenschutz]"); await ds.click(); if ((await ds.evaluate((e) => e.checked)) === false) await ds.evaluate((e) => { e.checked = true; });
    const nav = p.waitForNavigation({ waitUntil: "load", timeout: 20000 }); await (await p.$(F + " button[type=submit]")).click(); await nav;
    const u = new URL(p.url()); const sichtbar = await p.evaluate(() => { const e = document.getElementById("email"); return e ? getComputedStyle(e).display : "fehlt"; });
    const ok = u.pathname === "/anfrage-fehler.html" && u.hash === "#email" && sichtbar === "block";
    ergebnisse.push(`Start ohne JS, ohne E-Mail: ${ok ? "✓" : "✗"} → ${u.pathname}${u.hash}, Hinweis E-Mail sichtbar: ${sichtbar}`);
    if (!ok) befunde.push("Klassischer Versand ohne E-Mail landet nicht auf der Fehlerseite mit Grund #email");
    await p.close();
  }
  await browser.close(); s.close();
  console.log(ergebnisse.map((z) => "  " + z).join("\n"));
  if (befunde.length) { console.error("Formular-Smoke-Test: FEHLER\n" + befunde.map((b) => "  – " + b).join("\n")); process.exit(1); }
  console.log(`Formular-Smoke-Test: ${formulare} Formulare zeigen auf die Function, ${ergebnisse.length} Versand-Szenarien bei 390 px ohne 404 (Dankeseite HTTP 200, Ablage, Benachrichtigung + Bestätigung).`);
})().catch((e) => { console.error("Formular-Smoke-Test abgebrochen:", e.message); process.exit(1); });
