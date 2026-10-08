/* Visueller Texte-Editor: verlustfreie Umwandlung HTML ↔ Modell für alle Textbausteine, Speicherregeln (nur
   em/strong/a/br), gesperrte Platzhalter und Strukturbausteine, Registry mit Abschnitten und Rollen, Einbindung. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const T = require("../js/texte-modell.js");
const validate = require("../netlify/functions/_lib/validate.js");
const texte = JSON.parse(fs.readFileSync(path.join(ROOT, "data/texte.json"), "utf8"));
const bloecke = Object.entries(texte.bloecke);

test("Alle Textbausteine der Website lassen sich verlustfrei lesen und wieder schreiben", () => {
  assert.ok(bloecke.length > 300, "Registry enthält die Texte");
  const kaputt = [];
  for (const [id, b] of bloecke) {
    const out = T.serialisiere(T.parse(b.html));
    if (out !== b.html) kaputt.push(id);
    const p = T.pruefe(b.html, b.html);
    assert.ok(p.ok && p.html === b.html, `Originaltext wird angenommen: ${id}`);
  }
  assert.deepEqual(kaputt, [], "Bausteine mit Abweichung nach Lesen/Schreiben");
});
test("Entities, Formatierung und Links bleiben erhalten; geänderte Texte werden korrekt geschrieben", () => {
  const html = 'Fenster &amp; Türen <em>montiert.</em> <strong>Fett</strong><br><a class="inline-link" href="produkte/">Alle Produkte</a>';
  const k = T.parse(html);
  assert.equal(k[0].text, "Fenster & Türen ");
  assert.equal(T.serialisiere(k), html);
  k[0].text = "Fenster & Haustüren "; // bearbeitet → neu kodiert
  assert.equal(T.serialisiere(k).slice(0, 28), "Fenster &amp; Haustüren <em>");
  const l = k.find((x) => x.typ === "a"); l.href = "/leistungen/";
  assert.match(T.serialisiere(k), /<a class="inline-link" href="\/leistungen\/">Alle Produkte<\/a>$/);
  assert.equal(T.zeichen(html), "Fenster & Türen montiert. Fett\nAlle Produkte".replace(/\s+/g, " ").length);
});
test("Platzhalter und Strukturbausteine sind gesperrte Knoten und werden unverändert zurückgeschrieben", () => {
  const html = "<span>01</span> Preise ab 300 € {steuerhinweis} – <span class=\"mail\" data-u=\"info\" data-d=\"beispiel.de\">info [at] beispiel.de</span>";
  const k = T.parse(html);
  assert.equal(k[0].typ, "struktur"); assert.equal(k[0].html, "<span>01</span>"); assert.ok(T.istGesperrt(k[0]));
  const ph = k.find((x) => x.typ === "platzhalter"); assert.equal(ph.name, "steuerhinweis"); assert.ok(T.istGesperrt(ph));
  assert.equal(T.PLATZHALTER.steuerhinweis, "Steuerhinweis (automatisch)");
  assert.equal(k[k.length - 1].typ, "struktur");
  assert.equal(T.serialisiere(k), html);
  /* Eyebrow: der Benutzer kann nur den Text hinter dem Baustein ändern */
  const eyebrow = texte.bloecke["startseite-1"];
  assert.equal(eyebrow.rolle, "eyebrow");
  const e = T.parse(eyebrow.html); assert.equal(e[0].typ, "struktur");
  e[1].text = " Fenster, Türen & Service"; delete e[1].raw;
  assert.equal(T.serialisiere(e), "<span>01</span> Fenster, Türen &amp; Service");
});
test("Speicherregel: nur em, strong, a (sichere Ziele) und br – alles andere wird mit einfacher Meldung abgelehnt", () => {
  const original = texte.bloecke["startseite-1"].html;
  const ok = (s, o) => T.pruefe(s, o === undefined ? original : o);
  assert.equal(ok("<span>01</span> Neu <strong>fett</strong> <em>blau</em><br><a href=\"/produkte/\">Produkte</a>").ok, true);
  assert.equal(ok("<a href=\"https://example.de\">x</a>").html, '<a href="https://example.de" rel="noopener noreferrer" target="_blank">x</a>');
  for (const schlecht of ["Hallo <script>alert(1)</script>", "<div>Block</div>", "<span>02</span> anderer Baustein", "<a href=\"javascript:alert(1)\">x</a>", "<a href=\"/x\" onclick=\"y\">x</a>", "<img src=x onerror=y>", "<a class=\"fremd\" href=\"/x\">x</a>", "<ul><li>Liste</li></ul>", "{steuerhinweis}<span class=\"x\">y</span>"]) {
    const r = ok(schlecht); assert.equal(r.ok, false, schlecht); assert.equal(r.fehler, "Dieser Text enthält Zeichen, die nicht erlaubt sind.");
  }
  /* Serverseitig dieselbe Regel */
  const f = validate.validiereTexte({ "startseite-1": "<span>01</span> Hallo <div>x</div>" }, texte.bloecke);
  assert.equal(f.length, 1); assert.equal(f[0].feld, "startseite-1"); assert.equal(f[0].meldung, T.MELDUNG);
  assert.equal(validate.validiereTexte({ "startseite-1": "<span>01</span> Neuer <em>Text</em>" }, texte.bloecke).length, 0);
  assert.equal(validate.validiereTexte({ "startseite-1": "   " }, texte.bloecke)[0].meldung, "Dieser Text darf nicht leer sein.");
  assert.equal(validate.textNormalisieren("Hallo  <b>Welt</b>", ""), "Hallo  <strong>Welt</strong>");
  /* Bereits gespeicherte Texte im alten Format bleiben lesbar (keine Migration): unbekannte Tags werden als fester Baustein geführt */
  const alt = T.parse("Zeile <b>fett</b> <ul><li>Punkt</li></ul>");
  assert.equal(alt[1].typ, "strong"); assert.equal(alt[3].typ, "struktur"); assert.equal(T.serialisiere(alt), "Zeile <strong>fett</strong> <ul><li>Punkt</li></ul>");
});
test("Registry: jeder Baustein hat Abschnitt und Rolle mit einfachen Namen; Startseite beginnt mit „Oben auf der Seite“", () => {
  for (const [id, b] of bloecke) { assert.ok(b.abschnitt && b.abschnittTitel, "Abschnitt fehlt: " + id); assert.ok(T.ROLLEN[b.rolle], "Rolle fehlt: " + id + " " + b.rolle); }
  const start = bloecke.filter(([, b]) => b.seite === "startseite").map(([, b]) => b.abschnittTitel);
  assert.equal(start[0], "Oben auf der Seite");
  assert.ok(start.includes("Produkte") && start.includes("Leistungen") && start.includes("Kontakt"));
  assert.equal(texte.bloecke["startseite-2"].rolle, "h1");
  assert.equal(T.ROLLEN.h1, "Große Überschrift"); assert.equal(T.ROLLEN.eyebrow, "Kleine Zeile über der Überschrift"); assert.equal(T.ROLLEN.p, "Absatz"); assert.equal(T.ROLLEN.button, "Button-Text");
  assert.ok(bloecke.some(([, b]) => b.rolle === "button"), "Button-Text erkannt");
  const imp = bloecke.filter(([, b]) => b.seite === "impressum").map(([, b]) => b.abschnittTitel);
  assert.equal(imp[0], "Oben auf der Seite");
  /* Registry ist aktuell (Seiten unverändert) */
  const { execFileSync } = require("child_process");
  const out = execFileSync(process.execPath, [path.join(ROOT, "scripts/inhalte-registry.js"), "--pruefen"], { encoding: "utf8" });
  assert.match(out, /Gesamt: \d+ Textbausteine/);
});
test("Admin: Texte-Editor als nachladbares Modul, Modell eingebunden, Vorschau-Stylesheet vorhanden, Seiten dürfen sich selbst einbetten", () => {
  const html = fs.readFileSync(path.join(ROOT, "admin/index.html"), "utf8");
  assert.match(html, /type="fw\/modul" data-modul="texte" src="\/js\/admin-texte\.js/);
  assert.match(html, /<script src="\/js\/texte-modell\.js/);
  const js = fs.readFileSync(path.join(ROOT, "js/admin.js"), "utf8");
  assert.match(js, /texte: "texte"/, "Modulzuordnung");
  assert.ok(!/<textarea[^>]*data-id=/.test(js), "alter Code-Editor entfernt");
  const modul = fs.readFileSync(path.join(ROOT, "js/admin-texte.js"), "utf8");
  for (const s of ["contenteditable", "Hervorheben", "Fett", "Link einfügen", "Neue Zeile", "Rückgängig", "Wiederholen", "Änderungen verwerfen", "Vorher / Nachher", "data-text"]) assert.ok(modul.includes(s), "fehlt im Modul: " + s);
  assert.ok(!/\{steuerhinweis\}|Platzhalter <code>/.test(modul), "keine technischen Platzhalter-Hinweise in der Oberfläche");
  assert.ok(fs.existsSync(path.join(ROOT, "css/admin-vorschau.css")));
  const toml = fs.readFileSync(path.join(ROOT, "netlify.toml"), "utf8");
  assert.match(toml, /X-Frame-Options = "SAMEORIGIN"/); assert.match(toml, /frame-ancestors 'self'/);
  assert.ok(!/frame-ancestors 'none'/.test(toml.split("[[headers]]")[1] || ""), "öffentliche Seiten erlauben die eigene Einbettung");
});
test("Preishinweis: Baustein im Modul js/hinweise.js ist registriert, geschützt und wird beim Build als reiner Text eingesetzt", () => {
  const Hinweise = require("../js/hinweise.js");
  assert.match(Hinweise.richtpreis.lang, /unverbindliche Richtpreise/); assert.match(Hinweise.richtpreis.kurz, /^Unverbindlicher Richtpreis/);
  const b1 = texte.bloecke["hinweise-1"], b2 = texte.bloecke["hinweise-2"];
  assert.ok(b1 && b2 && b1.geschuetzt && b2.geschuetzt && texte.seiten.hinweise && texte.seiten.hinweise.modul, "Modul-Bausteine in der Registry");
  assert.equal(T.decode(b1.html), Hinweise.richtpreis.lang);
  const build = require("../scripts/build.js");
  const os = require("os"); const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fw-hinweis-")); fs.mkdirSync(path.join(dir, "js"));
  fs.copyFileSync(path.join(ROOT, "js/hinweise.js"), path.join(dir, "js/hinweise.js")); fs.copyFileSync(path.join(ROOT, "js/texte-modell.js"), path.join(dir, "js/texte-modell.js"));
  const reg = JSON.parse(JSON.stringify(texte)); reg.bloecke["hinweise-2"] = Object.assign({}, reg.bloecke["hinweise-2"], { html: "Richtpreis &amp; <em>unverbindlich</em> – Angebot nach Aufmaß", geaendert: true });
  const n = build.texteEinsetzen(dir, reg, 0);
  assert.equal(n, 1);
  const neu = fs.readFileSync(path.join(dir, "js/hinweise.js"), "utf8");
  assert.match(neu, /\/\*TEXT:hinweise-2\*\/"Richtpreis & unverbindlich – Angebot nach Aufmaß"\/\*\/TEXT\*\//, "nur reiner Text zwischen den Markierungen");
  const m = { exports: {} }; new Function("module", neu)(m);
  assert.equal(m.exports.richtpreis.kurz, "Richtpreis & unverbindlich – Angebot nach Aufmaß"); assert.equal(m.exports.richtpreis.lang, Hinweise.richtpreis.lang);
  fs.rmSync(dir, { recursive: true, force: true });
  /* Hinweis erscheint überall neben Preisen */
  const produkte = require("../netlify/functions/_lib/produkte.js");
  const karte = produkte.startHtml({ karten: [{ id: "x", titel: "T", kurz: "K", link: "/produkte/", abPreis: 100, sichtbar: true }] }, { steuer: { satzProzent: 0 } }, "");
  assert.ok(karte.includes('<p class="price__hinweis">' + Hinweise.richtpreis.kurz + "</p>"), "Produktkarte");
  const konf = fs.readFileSync(path.join(ROOT, "js/konfigurator.js"), "utf8");
  assert.ok(/HW\.kurz/.test(konf) && /HW\.lang/.test(konf) && /FWHinweise/.test(konf), "Konfigurator nutzt das Modul");
  assert.match(fs.readFileSync(path.join(ROOT, "scripts/build-konfigurator.js"), "utf8"), /js\/hinweise\.js\?v=/, "Konfigurator-Seiten laden das Modul");
  const mail = require("../netlify/functions/_lib/mail.js").vorlagen.neueAnfrage({ name: "A", preis_server_text: "1 €" }, "https://x/admin/");
  assert.ok(mail.text.includes(Hinweise.richtpreis.lang), "Anfrage-E-Mail");
  assert.match(fs.readFileSync(path.join(ROOT, "netlify.toml"), "utf8"), /"js\/hinweise\.js"/);
});
