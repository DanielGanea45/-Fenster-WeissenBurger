/* Tests: Live-Chat (Crisp) mit Zwei-Klick-Lösung – Konfiguration im Build, Sicherheits-Kopfzeilen (_headers), Einbindung
   auf allen öffentlichen Seiten (nicht im Admin), Rechtstexte, Einstellungen. Keine festen Admin-Datenwerte (der Build
   schreibt vor den Tests die Admin-Daten) – Erwartungen folgen aus den Dateien bzw. der Umgebung. Der Browser-Teil (Knopf,
   Hinweis, keine Fremdanfrage vor dem Klick, Skript nach dem Klick, CSP) läuft in scripts/admin-smoke.js. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const H = require("../scripts/headers");
const build = require("../scripts/build");
const PV = require("../js/preis-validate.js");
const lies = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const TEST_ID = "0123456789abcdef-0123-4567-89ab-cdef01234567";

test("CSP: streng ohne Chat (Hash, keine Fremd-Domänen); mit Chat nur die Crisp-Domänen in den passenden Richtlinien", () => {
  const s = H.csp({ chat: false }), c = H.csp({ chat: true });
  assert.ok(!/crisp/.test(s) && s.includes(H.LOGO_STIL_HASH) && !/unsafe-inline/.test(s));
  for (const d of ["script-src", "connect-src", "img-src", "font-src", "style-src", "worker-src", "media-src"]) assert.ok(new RegExp(d + "[^;]*client\\.crisp\\.chat|" + d + "[^;]*image\\.crisp\\.chat").test(c), d);
  assert.match(c, /connect-src[^;]*wss:\/\/client\.relay\.crisp\.chat/);
  assert.match(c, /connect-src[^;]*https:\/\/storage\.crisp\.chat/);
  assert.match(c, /img-src[^;]*https:\/\/image\.crisp\.chat/);
  assert.ok(/style-src[^;]*'unsafe-inline'/.test(c) && !c.includes(H.LOGO_STIL_HASH), "mit Chat: unsafe-inline statt Hash (sonst ignoriert der Browser unsafe-inline)");
  assert.ok(!/frame-src/.test(c) && !/assets\.crisp\.chat|stream\.relay/.test(c), "nur, was der Chat braucht");
  for (const t of [s, c]) { assert.match(t, /default-src 'self'/); assert.match(t, /frame-ancestors 'self'/); assert.match(t, /form-action 'self'/); assert.ok(!/script-src[^;]*unsafe/.test(t)); }
});
test("netlify.toml enthält keine CSP mehr für /* – die Quelle ist _headers (streng im Repository-Stand)", () => {
  const toml = lies("netlify.toml");
  const block = toml.slice(toml.indexOf('for = "/*"'), toml.indexOf('for = "/admin/*"'));
  assert.ok(!/^\s*Content-Security-Policy\s*=/m.test(block), "CSP für /* nur in _headers");
  const h = lies("_headers");
  assert.ok(h.startsWith("# Automatisch erzeugt von scripts/headers.js"));
  assert.ok(h.includes("/*\n  Content-Security-Policy: "));
  /* Repo-Stand: ohne Kennung immer streng – unabhängig vom Schalter */
  if (!process.env.CRISP_WEBSITE_ID) assert.equal(h, H.text({ chat: false }));
});
test("chatAktiv: nur mit gültiger Kennung UND Schalter an", () => {
  assert.equal(H.chatAktiv({ website: { liveChat: true } }, TEST_ID), true);
  assert.equal(H.chatAktiv({ website: { liveChat: false } }, TEST_ID), false);
  assert.equal(H.chatAktiv({ website: { liveChat: true } }, ""), false);
  assert.equal(H.chatAktiv({ website: { liveChat: true } }, "<script>"), false);
  assert.equal(H.chatAktiv({}, TEST_ID), false);
});
test("Build: chatEinsetzen schreibt Konfiguration in js/chat.js und passende _headers; ohne Kennung oder Schalter aus bleibt alles leer/streng", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fw-chat-"));
  fs.mkdirSync(path.join(tmp, "js")); fs.copyFileSync(path.join(ROOT, "js/chat.js"), path.join(tmp, "js/chat.js"));
  const alt = process.env.CRISP_WEBSITE_ID;
  try {
    process.env.CRISP_WEBSITE_ID = TEST_ID;
    let cfg = build.chatEinsetzen(tmp, { website: { liveChat: true, whatsapp: "+49 176 81338935" } });
    assert.deepEqual(cfg, { id: TEST_ID, aktiv: true, whatsapp: "4917681338935" });
    let js = fs.readFileSync(path.join(tmp, "js/chat.js"), "utf8");
    assert.ok(js.includes('/*CHAT*/{"id":"' + TEST_ID + '","aktiv":true,"whatsapp":"4917681338935"}/*/CHAT*/'));
    assert.equal(fs.readFileSync(path.join(tmp, "_headers"), "utf8"), H.text({ chat: true }));
    assert.ok(!/<script|<\/script/.test(js), "kein Inline-Skript");
    cfg = build.chatEinsetzen(tmp, { website: { liveChat: false, whatsapp: "4917681338935" } });
    assert.equal(cfg.aktiv, false); assert.equal(cfg.id, "");
    assert.equal(fs.readFileSync(path.join(tmp, "_headers"), "utf8"), H.text({ chat: false }));
    process.env.CRISP_WEBSITE_ID = "";
    cfg = build.chatEinsetzen(tmp, { website: { liveChat: true } });
    assert.equal(cfg.aktiv, false);
    js = fs.readFileSync(path.join(tmp, "js/chat.js"), "utf8");
    assert.ok(js.includes('/*CHAT*/{"id":"","aktiv":false,"whatsapp":""}/*/CHAT*/'));
    /* idempotent */
    const vorher = fs.readFileSync(path.join(tmp, "_headers"), "utf8");
    build.chatEinsetzen(tmp, { website: { liveChat: true } });
    assert.equal(fs.readFileSync(path.join(tmp, "_headers"), "utf8"), vorher);
  } finally { if (alt === undefined) delete process.env.CRISP_WEBSITE_ID; else process.env.CRISP_WEBSITE_ID = alt; }
});
test("js/chat.js: Markierung vorhanden, tut ohne Kennung nichts, lädt Crisp nur von client.crisp.chat, meidet /admin/, merkt sich die Wahl nur im Sitzungsspeicher", () => {
  const js = lies("js/chat.js");
  assert.match(js, /\/\*CHAT\*\/\{[^]*?\}\/\*\/CHAT\*\//);
  assert.ok(js.includes("if (!CFG || !CFG.aktiv || !CFG.id) return;"));
  assert.ok(js.includes('"https://client.crisp.chat/l.js"'));
  assert.deepEqual((js.match(/https?:\/\/[a-z0-9.\-]+/g) || []).filter((u) => !/client\.crisp\.chat|wa\.me|www\.w3\.org/.test(u)), [], "keine weiteren Fremdadressen");
  assert.ok(js.includes("sessionStorage") && !js.includes("localStorage") && !/document\.cookie\s*=/.test(js));
  assert.ok(js.includes('/^\\/admin(\\/|$)/'));
  assert.ok(js.includes('locale: "de"'));
  assert.ok(js.includes("Crisp (Crisp IM SAS, Frankreich) geladen. Dabei werden Daten an Crisp übertragen."));
  assert.ok(js.includes('"Chat laden"') && js.includes('"Abbrechen"') && js.includes("Lieber per WhatsApp?"));
  assert.ok(!/style="/.test(js) && !/setAttribute\("style"/.test(js), "keine Inline-Stile (CSP)");
});
test("Einbindung: jede öffentliche Seite lädt js/chat.js (mit Versionskennung), der Admin nicht; keine neuen Inline-Skripte", () => {
  const seiten = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) { if (!/^(node_modules|\.|design-|admin|netlify|tests|scripts|docs)/.test(e.name) && !/\s/.test(e.name)) walk(f); } else if (e.name.endsWith(".html")) seiten.push(f); } };
  walk(ROOT);
  assert.ok(seiten.length > 150);
  for (const f of seiten) {
    const html = fs.readFileSync(f, "utf8");
    const rel = path.relative(ROOT, f);
    assert.match(html, /<script src="\/?js\/chat\.js\?v=[a-z0-9]+" defer><\/script>/, rel + ": chat.js fehlt");
    assert.equal((html.match(/js\/chat\.js/g) || []).length, 1, rel + ": chat.js mehrfach");
    const inline = (html.match(/<script(?![^>]*\bsrc=)(?![^>]*type="application\/ld\+json")[^>]*>/g) || []);
    assert.deepEqual(inline, [], rel + ": Inline-Skript");
  }
  assert.ok(!lies("admin/index.html").includes("chat.js"), "kein Chat im Admin");
  for (const g of ["scripts/build-orte.js", "scripts/build-konfigurator.js", "scripts/build-produkte.js"]) assert.ok(lies(g).includes("/js/chat.js?v="), g);
});
test("Rechtstexte: Datenschutzerklärung (Anbieter, Zweck, Daten, Einwilligung, Auftragsverarbeitung, Crisp-Link, WhatsApp) und Cookie-Richtlinie (Crisp-Cookies, Merker)", () => {
  const ds = lies("datenschutz.html");
  assert.ok(ds.includes('id="live-chat"'));
  for (const t of ["Crisp IM SAS", "Nantes, Frankreich", "Art. 6 Abs. 1 lit. a DSGVO", "§ 25 Abs. 1 TDDDG", "Art. 28 DSGVO", "https://crisp.chat/de/privacy/", "WhatsApp Ireland Limited", "https://www.whatsapp.com/legal/privacy-policy-eea", "fw-chat-ok", "Chat laden"]) assert.ok(ds.includes(t), "Datenschutz: " + t);
  const ck = lies("cookies.html");
  for (const t of ["fw-chat-ok", "crisp-client/", "datenschutz.html#live-chat", "Chat laden"]) assert.ok(ck.includes(t), "Cookies: " + t);
  assert.ok(!/Alle drei Einträge/.test(ck));
});
test("Einstellungen → Website: Schalter und WhatsApp-Nummer vorhanden, geprüft; Admin-Texte ohne technische Begriffe", () => {
  const e = JSON.parse(lies("data/einstellungen.json"));
  assert.equal(typeof e.website.liveChat, "boolean");
  assert.ok("whatsapp" in e.website);
  assert.deepEqual(PV.validiereEinstellungen(e).filter((f) => f.feld.startsWith("website.")), []);
  const k = JSON.parse(JSON.stringify(e)); k.website.liveChat = "ja"; k.website.whatsapp = "abc";
  const felder = PV.validiereEinstellungen(k).map((f) => f.feld);
  assert.ok(felder.includes("website.liveChat") && felder.includes("website.whatsapp"));
  const ui = lies("js/admin-einstellungen.js");
  assert.ok(ui.includes('p: "website.liveChat"') && ui.includes('p: "website.whatsapp"'));
  const block = ui.slice(ui.indexOf('titel: "Live-Chat"'), ui.indexOf("]", ui.indexOf('titel: "Live-Chat"')));
  assert.ok(!/CRISP_WEBSITE_ID|\.env|netlify\.toml|_headers/.test(block), "keine technischen Begriffe im Admin-Text");
});
test("Smoke-Test enthält die Chat-Prüfung (Zwei-Klick, Kopfzeilen, keine Fremdanfrage vor dem Klick); Minimierung lässt js/chat.js (Markierung) aus", () => {
  const s = lies("scripts/admin-smoke.js");
  assert.ok(s.includes("async function chatPruefung") && s.includes("Fremdanfragen VOR dem Klick") && s.includes("HeadersLib.csp("));
  /* Die Markierung /*CHAT*\/ muss den Build überleben: der Smoke-Test setzt darüber seine Testkonfiguration ein */
  assert.ok(lies("scripts/minify.js").includes('"chat.js"'), "minify.js: chat.js ausnehmen");
});
