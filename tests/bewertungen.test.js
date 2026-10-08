/* Tests: Kundenbewertungen (Google, MyHammer, Website) – Modul netlify/functions/_lib/bewertungen.js, Einsetzen in die
   Seiten (scripts/bewertungen-einsetzen.js), Repo-Stand, Admin-API (anlegen/bearbeiten/löschen), Einstellungen,
   keine Bewertungs-Strukturdaten (aggregateRating/Review) auf irgendeiner Seite. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fw-bewertungen-"));
process.env.FW_STORE_DIR = dir;
process.env.ADMIN_SETUP_TOKEN = "test-setup-token-1234567890";
delete process.env.NETLIFY; delete process.env.CONTEXT; delete process.env.NETLIFY_BUILD_HOOK; delete process.env.INCOMING_HOOK_TITLE;

const ROOT = path.join(__dirname, "..");
const B = require("../netlify/functions/_lib/bewertungen");
const einsetzen = require("../scripts/bewertungen-einsetzen");
const PV = require("../js/preis-validate.js");
const lies = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const repoListe = () => JSON.parse(lies("data/bewertungen.json"));
const repoEinst = () => JSON.parse(lies("data/einstellungen.json"));

/* ---------- Modul ---------- */
test("oeffentlich: nur freigegebene, ohne E-Mail, neueste zuerst, Quelle immer gesetzt", () => {
  const l = B.oeffentlich([
    { status: "offen", name: "A", text: "x", datum: "2026-09" },
    { status: "freigegeben", name: "B", text: "b", datum: "2025-10", quelle: "Google", email: "b@example.de" },
    { status: "abgelehnt", name: "C", text: "c", datum: "2026-01" },
    { status: "freigegeben", name: "D", text: "d", datum: "2026-03", quelle: "Unbekannt" },
  ]);
  assert.deepEqual(l.map((b) => b.name), ["D", "B"]);
  assert.equal(l[0].quelle, "Website"); assert.equal(l[1].quelle, "Google");
  assert.ok(!("email" in l[1]));
});
test("formatDatum: Monat als „ca.“, Tagesdatum genau", () => {
  assert.equal(B.formatDatum("2025-10", true), "ca. Oktober 2025");
  assert.equal(B.formatDatum("2026-03"), "ca. März 2026");
  assert.equal(B.formatDatum("2026-03-05"), "März 2026");
  assert.equal(B.formatDatum(""), "");
});
test("badgeHtml: Google-Note, Sterne, Anzahl, MyHammer, Link „Alle Bewertungen auf Google ansehen“ – leer ohne Noten", () => {
  const e = { bewertungen: { googleNote: "5,0", googleAnzahl: 4, myhammerNote: "5/5", googleProfilLink: "https://www.google.com/maps/search/?api=1&query=Fenster-WeissenBurger+UG+Ingolstadt" } };
  const h = B.badgeHtml(e);
  assert.ok(h.includes("<strong>Google</strong>") && h.includes("5,0") && h.includes("★★★★★") && h.includes("· 4 Bewertungen"));
  assert.ok(h.includes("<strong>MyHammer</strong>") && h.includes("5/5"));
  assert.ok(h.includes(">Alle Bewertungen auf Google ansehen</a>") && h.includes('rel="noopener noreferrer"'));
  assert.ok(!/style=/.test(h), "keine Inline-Styles (CSP)");
  assert.equal(B.badgeHtml({ bewertungen: {} }), "");
  assert.ok(!B.kartenHtml([{ status: "freigegeben", name: "A", text: "a", sterne: 5 }], e, { alle: 0 }).includes("Alle Bewertungen"), "Option alle=0 unterdrückt den Profil-Link");
  assert.ok(!B.badgeHtml({ bewertungen: { googleNote: "4,8", googleProfilLink: "http://unsicher.example" } }).includes("http://"), "nur https-Links");
  assert.ok(B.badgeHtml({ bewertungen: { googleNote: "4,8", googleProfilLink: "" } }).includes(`href="${B.esc(B.GOOGLE_PROFIL_STANDARD)}"`), "leeres Feld (ältere Einstellungen) → Vorgabe Maps-Suche");
  assert.ok(!B.badgeHtml({ bewertungen: { googleNote: "4,8", googleProfilLink: "http://unsicher.example" } }).includes("Alle Bewertungen"), "ungültiger Link → kein Link");
});
test("kartenHtml: Karte je Bewertung, „Mehr lesen“ nur bei langen Texten, Quelle mit Logo, Datum, Knopf „Jetzt bewerten“ nur mit Link", () => {
  const kurz = { status: "freigegeben", name: "Kurz K.", text: "Alles gut gelaufen.", sterne: 5, quelle: "MyHammer", datum: "2026-07" };
  const lang = { status: "freigegeben", name: "Lang L.", text: "Sehr ".repeat(40) + "zufrieden.", sterne: 4, quelle: "Google", datum: "2026-02", projekt: "Haustür" };
  let h = B.kartenHtml([kurz, lang], { bewertungen: {} });
  assert.equal((h.match(/<li class="stimme">/g) || []).length, 2);
  assert.equal((h.match(/data-mehr/g) || []).length, 1, "nur der lange Text bekommt „Mehr lesen“");
  assert.ok(h.includes('class="stimme__text is-lang" id="stimme-2"') && h.includes('aria-controls="stimme-2"'));
  assert.ok(h.includes("quelle-logo--google") && h.includes("quelle-logo--myhammer"));
  assert.ok(h.includes("ca. Juli 2026") && h.includes("ca. Februar 2026") && h.includes("· Haustür"));
  assert.ok(h.includes('aria-label="4 von 5 Sternen"') && h.includes("★★★★☆"));
  assert.ok(!h.includes("Jetzt bewerten"), "ohne Bewertungslink kein Knopf „Jetzt bewerten“");
  assert.ok(h.includes(`href="${B.esc(B.GOOGLE_PROFIL_STANDARD)}"`), "ohne eigenen Profil-Link: Vorgabe Maps-Suche");
  h = B.kartenHtml([kurz], { bewertungen: { googleBewertungLink: "https://g.page/r/abc/review", googleProfilLink: "https://maps.google.com/?cid=1" } });
  assert.ok(h.includes('href="https://g.page/r/abc/review"') && h.includes(">Jetzt bewerten</a>") && h.includes(">Alle Bewertungen auf Google ansehen</a>"));
  assert.ok(B.kartenHtml([], {}).includes("Noch keine Bewertungen"));
  assert.ok(B.kartenHtml([kurz, lang], {}, { max: 1 }).match(/<li class="stimme">/g).length === 1, "max begrenzt");
  const boese = B.kartenHtml([{ status: "freigegeben", name: "<img src=x onerror=alert(1)>", text: "<script>alert(1)</script> toll", sterne: 5 }], {});
  assert.ok(!boese.includes("<img") && !boese.includes("<script>"), "Nutzertexte werden maskiert");
});
test("einsetzen: Markierungen werden gefüllt, Optionen (max) gelesen, Lauf ist idempotent", () => {
  const liste = [{ status: "freigegeben", name: "A", text: "a", sterne: 5 }, { status: "freigegeben", name: "B", text: "b", sterne: 5 }];
  const e = { bewertungen: { googleNote: "5,0", googleAnzahl: 2 } };
  const seite = "<main><!--bewertungen-badge-->alt<!--/bewertungen-badge--><!--bewertungen-karten:max=1-->alt<!--/bewertungen-karten--></main>";
  const r1 = B.einsetzen(seite, liste, e);
  assert.equal(r1.n, 2);
  assert.ok(r1.html.includes('<div class="badge-bew"') && r1.html.match(/<li class="stimme">/g).length === 1);
  assert.ok(r1.html.includes("<!--bewertungen-karten:max=1-->") && r1.html.includes("<!--/bewertungen-karten-->"), "Markierungen bleiben erhalten");
  assert.equal(B.einsetzen(r1.html, liste, e).html, r1.html, "idempotent");
});

/* ---------- Repo-Stand ---------- */
/* Hinweis: Im Netlify-Build stehen in data/*.json die ADMIN-Daten (Produktion kann andere Bewertungen und
   Einstellungen haben) – die Tests leiten die Erwartungen deshalb aus den Dateien ab statt feste Werte anzunehmen. */
test("Repo-Daten: freigegebene Bewertungen vollständig (Name, Text, Sterne 1–5, Quelle, Monat), ohne E-Mail; Einstellungen gültig", () => {
  const alle = repoListe();
  assert.ok(Array.isArray(alle));
  for (const b of alle) {
    assert.ok(b.id && b.name && typeof b.text === "string", JSON.stringify(b).slice(0, 80));
    assert.ok(!("email" in b), "keine E-Mail im öffentlichen Abbild");
    if (b.status === "freigegeben" || b.status === undefined) { assert.ok(b.sterne >= 1 && b.sterne <= 5); assert.ok(B.QUELLEN.includes(b.quelle || "Website")); if (b.datum) assert.match(b.datum, /^\d{4}-\d{2}(-\d{2})?$/); }
  }
  const e = repoEinst();
  assert.deepEqual(PV.validiereEinstellungen(e).filter((f) => f.feld.startsWith("bewertungen.")), []);
});
test("Repo-Vorgaben (Git-Stand): fünf übernommene Bewertungen – 4× Google, 1× MyHammer – und Abzeichen-Werte", () => {
  /* Der Git-Stand ist unabhängig von den Admin-Daten; fehlt git (z. B. Kopie ohne .git), wird übersprungen */
  let json; try { json = require("child_process").execFileSync("git", ["show", "HEAD:data/bewertungen.json"], { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString(); } catch (e) { return; }
  const pub = B.oeffentlich(JSON.parse(json));
  assert.equal(pub.filter((b) => b.quelle === "Google").length, 4);
  assert.equal(pub.filter((b) => b.quelle === "MyHammer").length, 1);
  for (const n of ["Serkan G.", "Larissa R.", "Jenny S.", "Abel D.", "Kunde über MyHammer"]) assert.ok(pub.some((b) => b.name === n), n);
  for (const b of pub) { assert.match(b.datum, /^\d{4}-\d{2}$/); assert.equal(b.sterne, 5); }
  let e; try { e = JSON.parse(require("child_process").execFileSync("git", ["show", "HEAD:data/einstellungen.json"], { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString()); } catch (err) { return; }
  assert.equal(e.bewertungen.googleNote, "5,0"); assert.equal(e.bewertungen.googleAnzahl, 4); assert.equal(e.bewertungen.myhammerNote, "5/5");
  assert.equal(e.bewertungen.googleProfilLink, B.GOOGLE_PROFIL_STANDARD);
});
test("Seiten: Start- und Referenzenseite tragen Abzeichen und Karten passend zu den Daten (Prüflauf ändert nichts)", () => {
  const r = einsetzen.lauf(ROOT, null, null, true);
  assert.equal(r.geaendert, 0, "node scripts/bewertungen-einsetzen.js ausführen");
  assert.ok(r.marker >= 5);
  const pub = B.oeffentlich(repoListe()), e = repoEinst();
  const badge = B.badgeHtml(e) ? 1 : 0;
  const start = lies("index.html"), ref = lies("referenzen/index.html");
  const karten = (h) => (h.match(/<li class="stimme">/g) || []).length;
  assert.equal((start.match(/<div class="badge-bew"/g) || []).length, 2 * badge, "Startseite: Abzeichen im Hero und bei Kontakt");
  assert.ok(start.includes("Das sagen unsere Kunden"));
  assert.equal(karten(start), Math.min(3, pub.length), "Startseite: die drei neuesten");
  assert.equal((ref.match(/<div class="badge-bew"/g) || []).length, badge);
  assert.equal(karten(ref), pub.length, "Referenzen: alle freigegebenen");
  if (!pub.length) assert.ok(ref.includes("Noch keine Bewertungen"));
  assert.equal((ref.match(/Alle Bewertungen auf Google ansehen/g) || []).length, badge ? 1 : 0, "Referenzen: Link nur einmal (im Abzeichen)");
  assert.ok(!ref.includes('id="reviews"'), "keine Nachlade-Liste mehr");
  assert.ok(!lies("js/referenzen.js").includes("fetch("), "Referenzen-Skript lädt keine Bewertungen mehr nach");
});
test("Keine Bewertungs-Strukturdaten: kein aggregateRating/Review in JSON-LD auf irgendeiner Seite", () => {
  const seiten = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) { if (!/^(node_modules|\.|design-)/.test(e.name) && e.name !== "admin") walk(f); } else if (e.name.endsWith(".html")) seiten.push(f); } };
  walk(ROOT);
  assert.ok(seiten.length > 150);
  for (const f of seiten) {
    const html = fs.readFileSync(f, "utf8");
    const ld = (html.match(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g) || []).join("\n");
    assert.ok(!/aggregateRating|"@type"\s*:\s*"Review"/.test(ld), path.relative(ROOT, f));
  }
});
test("Einstellungen: Noten, Anzahl und Links werden geprüft", () => {
  const e = repoEinst();
  e.bewertungen.googleNote = "6"; e.bewertungen.googleAnzahl = "vier"; e.bewertungen.myhammerNote = "super"; e.bewertungen.myhammerLink = "http://x";
  const felder = PV.validiereEinstellungen(e).map((f) => f.feld);
  for (const f of ["bewertungen.googleNote", "bewertungen.googleAnzahl", "bewertungen.myhammerNote", "bewertungen.myhammerLink"]) assert.ok(felder.includes(f), f);
});

/* ---------- Admin-API ---------- */
test("Admin-API: Bewertung anlegen (mit Quelle/Monat), bearbeiten, löschen – mit Validierung und Version", async () => {
  const auth = require("../netlify/functions/_lib/auth");
  const daten = require("../netlify/functions/_lib/daten");
  const apiFn = require("../netlify/functions/admin-api");
  const r0 = await auth.setup({ token: process.env.ADMIN_SETUP_TOKEN, email: "daniel@example.de", password: "SicheresPasswort!2026" });
  assert.ok(r0.ok, r0.error);
  const s = await auth.createSession(r0.account, false);
  const cookie = "fw_admin=" + s.token, csrf = require("../netlify/functions/_lib/http").csrfFor(s.token);
  const ev = (body) => ({ httpMethod: "POST", path: "/.netlify/functions/admin-api", headers: { host: "fensterweissenburger.netlify.app", origin: "https://fensterweissenburger.netlify.app", cookie, "x-csrf": csrf }, body: JSON.stringify(body), queryStringParameters: {} });
  const call = async (body) => JSON.parse((await apiFn.handler(ev(body))).body);
  let r = await call({ aktion: "bewertung-bearbeiten", daten: { name: "X", sterne: 7, text: "zu", quelle: "Google" } });
  assert.equal(r.ok, false); assert.deepEqual(r.fehler.map((f) => f.feld).sort(), ["name", "sterne", "text"]);
  r = await call({ aktion: "bewertung-bearbeiten", daten: { name: "Test T.", sterne: "5", text: "Schnelle Montage, freundliches Team.", quelle: "MyHammer", datum: "2026-07", ort: "", projekt: "Balkontür" } });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.bewertung.status, "freigegeben"); assert.equal(r.bewertung.quelle, "MyHammer"); assert.equal(r.bewertung.datum, "2026-07");
  const id = r.bewertung.id;
  let liste = await daten.lade("bewertungen");
  assert.equal(liste.length, repoListe().length + 1, "Repo-Vorgaben bleiben erhalten, neue Bewertung kommt dazu");
  r = await call({ aktion: "bewertung-bearbeiten", id, daten: { name: "Test T.", sterne: 4, text: "Schnelle Montage, freundliches Team. Gern wieder.", quelle: "Unbekannt", datum: "falsch" } });
  assert.equal(r.ok, true); assert.equal(r.bewertung.sterne, 4); assert.equal(r.bewertung.quelle, "Website"); assert.equal(r.bewertung.datum, "");
  r = await call({ aktion: "bewertung-bearbeiten", id: "gibt-es-nicht", daten: { name: "A B", sterne: 5, text: "Text lang genug" } });
  assert.equal(r.ok, false);
  r = await call({ aktion: "bewertung-loeschen", id });
  assert.equal(r.ok, true);
  liste = await daten.lade("bewertungen");
  assert.ok(!liste.find((b) => b.id === id));
  const v = (await daten.versionen(3))[0];
  assert.equal(v.bereich, "bewertungen"); assert.match(v.beschreibung, /gelöscht/);
  r = await call({ aktion: "bewertung-loeschen", id });
  assert.equal(r.ok, false);
});
