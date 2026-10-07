#!/usr/bin/env node
/* Erzeugt die Ortsseiten /einsatzgebiet/<ort>/, die Übersicht /einsatzgebiet/ und die Sitemaps
   aus data/orte.json.  Aufruf: node scripts/build-orte.js  [--report]
   - Veröffentlicht werden nur Orte mit "stufe": 1, deren Region "veroeffentlicht": true hat.
   - Orte einer nicht veröffentlichten Region werden trotzdem gebaut (noindex, nicht in Sitemap/Übersicht).
   - Textbausteine werden je Seite aus mehreren Varianten gewählt; die Wahl wird so getroffen, dass die
     Überschneidung (5-Wort-Schindeln) zu allen bisher erzeugten Seiten unter 50 % bleibt. */
"use strict";
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const firmaLib = require(path.join(root, "netlify/functions/_lib/firma"));
const einst = JSON.parse(fs.readFileSync(path.join(root, "data/einstellungen.json"), "utf8"));
const SITE = "https://fenster-weissenburger.de";
const TODAY = "2026-10-07";
const data = JSON.parse(fs.readFileSync(path.join(root, "data/orte.json"), "utf8"));
const regions = Object.fromEntries(data.regions.map((r) => [r.key, r]));
/* Veröffentlichung je Region aus Admin → Einstellungen → Öffnungszeiten & Einsatzgebiet (überschreibt data/orte.json) */
{ const eg = (JSON.parse(fs.readFileSync(path.join(root, "data/einstellungen.json"), "utf8")).einsatzgebiet) || {}; for (const r of data.regions) if (typeof eg[r.key] === "boolean") r.veroeffentlicht = eg[r.key]; }

/* ---------- Gemeinsame Bausteine aus index.html (Logo, Asset-Versionen) ---------- */
const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const ls = indexHtml.indexOf('      <span class="brand__box">');
const le = indexHtml.indexOf("</span>\n    </a>", ls) + "</span>".length;
const LOGO = indexHtml.slice(ls, le).trim();
const v = (name) => { const m = indexHtml.match(new RegExp(name.replace(".", "\\.") + "\\?v=([\\w.-]+)")); return m ? m[1] : "1"; }; // Versionen sind Inhalts-Hashes (scripts/assets-version.js)
const V = { style: v("style.css"), ueberCss: v("uebergang.css"), ueberJs: v("uebergang.js"), main: v("main.js") };

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const num = (n) => Math.round(n).toLocaleString("de-DE");
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function pick(arr, seed, salt) { return arr[(hash(seed + ":" + salt) + 0) % arr.length]; }
function dist(a, b) { const R = 6371, t = (x) => (x * Math.PI) / 180; const dLat = t(b.lat - a.lat), dLon = t(b.lon - a.lon); const s = Math.sin(dLat / 2) ** 2 + Math.cos(t(a.lat)) * Math.cos(t(b.lat)) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(s)); }

const orte = data.orte.filter((o) => o.stufe === 1);
const bySlug = Object.fromEntries(orte.map((o) => [o.slug, o]));
const published = (o) => !!regions[o.region].veroeffentlicht;

/* ---------- Textvarianten ---------- */
function ctx(o) {
  const r = regions[o.region];
  const hq = o.region === "ingolstadt";
  const isHQ = o.slug === "ingolstadt";
  const lk = o.landkreis === "kreisfreie Stadt" ? "kreisfreie Stadt" : o.landkreis;
  const lkIn = o.landkreis === "kreisfreie Stadt" ? `die kreisfreie Stadt ${o.name}` : `${o.name} im ${o.landkreis}`;
  const km = Math.round(o.distanceKm), min = o.drivingMinutes;
  const bl = o.bundesland || (o.region === "ingolstadt" ? "Bayern" : "");
  const typ = o.landkreis === "kreisfreie Stadt" ? "Stadt" : o.isCity ? "Stadt" : "Gemeinde";
  return { r, hq, isHQ, lk, lkIn, km, min, bl, typ, name: o.name, pop: num(o.population), popDate: "31.12.2025" };
}

const INTRO = [
  (c) => c.isHQ
    ? `Ingolstadt ist unser Zuhause: Von der <span data-firma="strasse-name">${firmaLib.esc(firmaLib.strassenName(einst))}</span> aus beraten, vermessen und montieren wir in allen Stadtteilen – ohne Anfahrtspauschale und mit kurzen Wegen für Nachbesserungen oder ein zweites Aufmaß.`
    : c.hq
      ? `${c.lkIn.charAt(0).toUpperCase() + c.lkIn.slice(1)} liegt rund ${c.km} km Luftlinie von unserem Firmensitz in Ingolstadt entfernt – etwa ${c.min} Minuten Fahrt. Für Beratung und Aufmaß kommen wir ohne Umwege zu Ihnen, und auch am Montagetag ist das Team schnell vor Ort.`
      : `${c.name} liegt rund ${c.km} km von Karlsruhe entfernt, etwa ${c.min} Minuten Fahrt. Wir sind auch im Raum Karlsruhe für Sie im Einsatz: Beratung, Aufmaß und Montage führen wir vor Ort durch, Anfahrt und Termin stimmen wir individuell mit Ihnen ab.`,
  (c) => c.isHQ
    ? `Als Ingolstädter Betrieb kennen wir die Stadt vom Nordbahnhof bis zum Südufer der Donau. Beratung bei Ihnen zu Hause, kostenloses Aufmaß und Montage kommen aus einer Hand – kurze Wege inklusive.`
    : c.hq
      ? `Mit rund ${c.km} km Luftlinie (ca. ${c.min} Minuten Fahrt) gehört ${c.name} zu unserem Kerngebiet um Ingolstadt. Das heißt für Sie: Beratungstermine lassen sich kurzfristig legen, das Aufmaß erledigen wir beim selben Besuch, und die Monteure sind am Einbautag früh bei Ihnen.`
      : `Rund ${c.km} km trennen ${c.name} von Karlsruhe – etwa ${c.min} Minuten Fahrt. Unser Firmensitz ist Ingolstadt, wir sind aber auch im Raum Karlsruhe für Sie im Einsatz und planen Beratung, Aufmaß und Montage dort als feste Termine.`,
  (c) => c.isHQ
    ? `Fenster-WeissenBurger sitzt in Ingolstadt (${c.pop} Einwohner, Stand ${c.popDate}). Wer in der Stadt neue Fenster oder eine Haustür braucht, bekommt bei uns alles aus einer Hand – von der ersten Beratung über das Aufmaß bis zur Entsorgung der alten Elemente.`
    : c.hq
      ? `${c.name} (${c.lk}, ${c.pop} Einwohner, Stand ${c.popDate}) erreichen wir von Ingolstadt aus in etwa ${c.min} Minuten – rund ${c.km} km Luftlinie. Ob Fenstertausch im Bestand oder Fenster für den Neubau: Wir beraten bei Ihnen zu Hause, messen kostenlos auf und montieren mit eigenem Team.`
      : `${c.name} (${c.lk}, ${c.pop} Einwohner, Stand ${c.popDate}) liegt rund ${c.km} km von Karlsruhe. Wir sind auch im Raum Karlsruhe für Sie im Einsatz – mit Beratung vor Ort, kostenlosem Aufmaß und Montage durch unser Team; unser Firmensitz bleibt Ingolstadt.`,
  (c) => c.isHQ
    ? `In Ingolstadt sind wir zu Hause. Darum können wir hier besonders flexibel sein: Beratung auch am späten Nachmittag, Aufmaß meist innerhalb weniger Tage und ein Montageteam, das keine lange Anfahrt hat.`
    : c.hq
      ? `Von Ingolstadt nach ${c.name} sind es rund ${c.km} km Luftlinie, also etwa ${c.min} Minuten mit dem Auto. ${c.name} gehört zum ${c.lk}${c.bl ? " in " + c.bl : ""} – und zu dem Gebiet, in dem wir regelmäßig Fenster und Türen montieren.`
      : `${c.name} im Raum Karlsruhe (${c.lk}) ist rund ${c.km} km bzw. etwa ${c.min} Minuten von Karlsruhe entfernt. Wir sind auch im Raum Karlsruhe für Sie im Einsatz; Beratung, Aufmaß und Einbau erfolgen bei Ihnen vor Ort, organisiert von unserem Sitz in Ingolstadt.`,
  (c) => c.isHQ
    ? `Unser Firmensitz liegt in Ingolstadt, mitten im Einsatzgebiet. Für Ingolstädter Kundinnen und Kunden bedeutet das: schnelle Beratungstermine, kostenloses Aufmaß vor Ort und ein Montageteam aus der Nachbarschaft.`
    : c.hq
      ? `Die ${c.typ} ${c.name} zählt ${c.pop} Einwohner (Stand ${c.popDate}) und liegt im ${c.lk}, rund ${c.km} km von Ingolstadt. Die Fahrt dauert etwa ${c.min} Minuten – kurz genug, dass wir Beratung und Aufmaß gern in einem Termin erledigen.`
      : `Die ${c.typ} ${c.name} zählt ${c.pop} Einwohner (Stand ${c.popDate}) und liegt im ${c.lk}, rund ${c.km} km von Karlsruhe. Wir sind auch im Raum Karlsruhe für Sie im Einsatz und kommen für Beratung und Aufmaß zu Ihnen.`,
  (c) => c.isHQ
    ? `Ingolstadt ist der Ausgangspunkt für alles, was wir tun. Von hier aus betreuen wir Privatkunden, Bauträger und Hausverwaltungen – und in der Stadt selbst sind die Wege am kürzesten.`
    : c.hq
      ? `${c.name} liegt im ${c.lk}, etwa ${c.min} Fahrminuten (rund ${c.km} km Luftlinie) von unserem Sitz in Ingolstadt. Für Sie heißt das: ein Ansprechpartner, kurze Reaktionszeiten und Montagetermine, die wir zuverlässig halten können.`
      : `Rund ${c.km} km von Karlsruhe, etwa ${c.min} Minuten Fahrt: ${c.name} liegt im ${c.lk}. Wir sind auch im Raum Karlsruhe für Sie im Einsatz – Beratung und Aufmaß vor Ort, Fertigung durch unseren Partner Helios, Montage durch unser Team.`,
];

const BEDEUTET = [
  (c) => `<h2 class="h2">Beratung, die <em>zu Ihnen kommt.</em></h2><p>Statt Ausstellung und Katalog: Wir schauen uns Ihre Fenster und Türen in ${c.name} direkt an, bringen Muster mit und besprechen Öffnungsarten, Verglasung, Farben und Sicherheit dort, wo sie später eingebaut werden.</p>`,
  (c) => `<h2 class="h2">Was die Nähe <em>für Sie bedeutet.</em></h2><p>Beratung und Aufmaß legen wir auf einen Termin bei Ihnen zu Hause${c.hq ? " – die Anfahrt aus Ingolstadt ist kurz" : ""}. Am Montagetag kommen die alten Fenster raus, die neuen rein, und wir nehmen die Altelemente gleich mit. Sollte später eine Einstellung nötig sein, sind wir ohne großen Aufwand wieder da.</p>`,
  (c) => `<h2 class="h2">Kurze Wege, <em>feste Termine.</em></h2><p>Ein Vor-Ort-Termin in ${c.name} lässt sich bei uns gut planen: Wir kommen zur vereinbarten Zeit, besprechen Werkstoff, Öffnungsarten und Verglasung und nehmen das Aufmaß gleich mit. Das schriftliche Angebot folgt, der Montagetag wird fest zugesagt.</p>`,
  (c) => `<h2 class="h2">So läuft es in ${esc(c.name)} <em>ab.</em></h2><p>Sie rufen an oder schreiben uns. Wir vereinbaren einen Beratungstermin bei Ihnen, messen kostenlos auf und schicken Ihnen ein Angebot mit allen Positionen. Nach Ihrer Freigabe fertigt unser Partner Helios die Elemente, dann montieren wir – inklusive Demontage und Entsorgung der alten Fenster.</p>`,
  (c) => `<h2 class="h2">Ein Termin, <em>alles geklärt.</em></h2><p>Beim Besuch in ${c.name} nehmen wir uns Zeit: Wir hören zu, zeigen Profilmuster und Farben, messen jedes Element auf und erklären, was beim Einbau in Ihrem Haus zu beachten ist. Danach bekommen Sie ein Angebot, das alle Positionen enthält – ohne Überraschungen.</p>`,
  (c) => `<h2 class="h2">Vom Anruf <em>bis zur Abnahme.</em></h2><p>Erst Beratung bei Ihnen in ${c.name}, dann Aufmaß und Angebot, dann Fertigung nach Maß. Am Montagetag arbeiten wir Raum für Raum, dichten fachgerecht ab und nehmen die alten Elemente mit. Zum Schluss gehen wir alles gemeinsam durch.</p>`,
];

const GEBAEUDE = [
  (c) => `<p>Reihenhaus, freistehendes Einfamilienhaus, Mehrfamilienhaus oder Gewerbe: In ${c.name} ist jede Aufgabe anders. Wir prüfen beim Termin, ob Laibungen und Rollladenkästen für Dreifachglas geeignet sind, und planen die Montage passend zum Gebäude.</p>`,
  (c) => `<p>Ältere Fenster in ${c.name} haben oft nur Zweifachglas und undichte Rahmen. Moderne Profile mit Dreifachverglasung senken den Wärmeverlust deutlich – welche Bautiefe sinnvoll ist, hängt vom Haus ab und wird beim Aufmaß festgelegt.</p>`,
  (c) => `<p>Wie überall in der Region treffen wir in ${c.name} auf sehr unterschiedliche Häuser: Einfamilienhäuser aus den Nachkriegsjahrzehnten mit ersten Isolierglasfenstern, Siedlungshäuser der 1970er- bis 1990er-Jahre, Mehrfamilienhäuser und Neubaugebiete. Für jeden Fall gibt es das passende Profil – vom wirtschaftlichen Fenstertausch bis zum Passivhaus-Niveau.</p>`,
  (c) => `<p>Ob Altbau mit alten Fenstern, Doppelhaushälfte aus den 80ern oder Neubau: Welche Lösung in ${c.name} sinnvoll ist, hängt vom Haus, der Fassade und Ihren Zielen ab. Genau deshalb beraten wir vor Ort und nicht am Telefon.</p>`,
  (c) => `<p>Jedes Gebäude ist anders – Bestand und Neubau, verputzte Fassade oder Klinker, Standardmaße oder Sonderformen. Beim Termin in ${c.name} sehen wir uns Laibungen, Fensterbänke und Rollladenkästen an und sagen Ihnen, was beim Einbau zu beachten ist.</p>`,
];

/* Themen-Abschnitte: je 3–4 Textvarianten; Links zu Produkt-/Leistungsseiten */
const TOPICS = [
  { key: "kaufen", h: ["Fenster kaufen in {ort}", "Neue Fenster für {ort}", "Fenster in {ort} kaufen – mit Beratung"], href: "/produkte/", link: "Alle Produkte", t: [
    (c) => `Bei uns kaufen Sie Fenster nicht von der Stange: Jedes Element wird nach Aufmaß gefertigt – aus Kunststoff, Kunststoff-Aluminium oder Aluminium. Die Beratung findet bei Ihnen in ${c.name} statt, mit Mustern zum Anfassen.`,
    (c) => `Fenster kaufen heißt bei uns: Beratung zu Hause in ${c.name}, Aufmaß, schriftliches Angebot, Fertigung nach Maß und Montage aus einer Hand. Preise richten sich nach Größe, Verglasung und Ausstattung – wir rechnen sie transparent im Angebot vor.`,
    (c) => `Sie möchten in ${c.name} neue Fenster kaufen? Wir zeigen Ihnen die Unterschiede zwischen den Werkstoffen, erklären Uf- und Uw-Werte und empfehlen, was zu Haus und Budget passt – unverbindlich.`,
    (c) => `Von der ersten Idee bis zum eingebauten Fenster: In ${c.name} begleiten wir Sie durch Auswahl, Aufmaß und Montage. Gefertigt wird von unserem Partner Helios mit Profilen von Kömmerling und Cortizo.`,
    (c) => `Welches Fenster passt zu Ihrem Haus in ${c.name}? Das entscheiden Fassade, Budget und Energieziel. Wir legen Ihnen zwei oder drei Varianten vor – mit Werten, Farben und Preisen – und Sie wählen in Ruhe.`,
  ] },
  { key: "tausch", h: ["Fenstertausch in {ort}", "Alte Fenster raus, neue rein – in {ort}", "Fenstertausch im Bestand in {ort}"], href: "/leistungen/", link: "Leistungen: Demontage, Montage, Entsorgung", t: [
    (c) => `Beim Fenstertausch in ${c.name} bauen wir die alten Fenster aus, setzen die neuen fachgerecht ein, dichten ab und entsorgen die Altelemente. In der Regel ist ein Raum nach wenigen Stunden wieder nutzbar.`,
    (c) => `Zugige Rahmen, beschlagene Scheiben, hohe Heizkosten? Ein Fenstertausch lohnt sich oft schon nach wenigen Jahren. Wir planen ihn in ${c.name} so, dass Sie während der Arbeiten im Haus bleiben können.`,
    (c) => `Fenstertausch bedeutet mehr als neue Scheiben: Wir prüfen Laibung, Fensterbank und Rollladenkasten, montieren nach RAL-Richtlinien und übergeben besenrein – auch in ${c.name}.`,
    (c) => `Für den Fenstertausch im bestehenden Haus in ${c.name} empfehlen wir meist Kömmerling 76 (AD oder MD): schlanke Rahmen, die in vorhandene Öffnungen passen, und Dreifachglas für spürbar weniger Wärmeverlust.`,
    (c) => `Wir tauschen Fenster in ${c.name} Raum für Raum, damit das Haus bewohnbar bleibt: morgens Ausbau, mittags Einbau und Abdichtung, abends ist alles dicht und besenrein. Die alten Elemente nehmen wir mit.`,
  ] },
  { key: "montage", h: ["Fenstermontage in {ort}", "Montage durch unser Team in {ort}", "Fachgerechte Fenstermontage in {ort}"], href: "/leistungen/", link: "So läuft die Montage ab", t: [
    (c) => `Unsere Monteure setzen jedes Element lot- und waagerecht, verschrauben es fachgerecht und dichten innen dampfdicht, außen schlagregendicht ab. Fensterbänke, Anschlussarbeiten und kleinere Putzausbesserungen gehören in ${c.name} dazu.`,
    (c) => `Die Fenstermontage in ${c.name} übernimmt unser eigenes Team – kein Subunternehmer, den Sie nicht kennen. Wir decken Böden ab, arbeiten Raum für Raum und nehmen den Bauschutt mit.`,
    (c) => `Gute Fenster brauchen eine gute Montage: Erst Abdichtung, Dämmung der Fuge und saubere Anschlüsse machen aus einem Fenster ein dichtes Fenster. Genau so arbeiten wir in ${c.name} – nach RAL-Montagerichtlinien.`,
    (c) => `Montage heißt bei uns: Befestigung im Mauerwerk, dreistufige Fugenabdichtung, Einstellen der Beschläge und Prüfung jedes Flügels. Auch Fensterbänke und Rollladenanschlüsse erledigen wir in ${c.name} in einem Zug.`,
    (c) => `Unser Montageteam kommt mit allem, was es braucht, nach ${c.name}: Dichtbänder und Montageschaum, Fensterbänke, Werkzeug für Putzausbesserungen – und mit dem Anspruch, am Abend eine saubere Baustelle zu hinterlassen.`,
  ] },
  { key: "kunststoff", h: ["Kunststofffenster (Kömmerling) für {ort}", "Kömmerling-Kunststofffenster in {ort}", "Kunststofffenster in {ort}"], href: "/produkte/kunststofffenster-koemmerling/", link: "Kunststofffenster mit Kömmerling-Profilen", t: [
    (c) => `Unsere Kunststofffenster werden mit Kömmerling-Profilen gefertigt: 70 und 76 mm für Sanierung und Fenstertausch, 88 mm mit sieben Kammern für Neubau und Energiesparhaus. Pflegeleicht, viele Dekore, Einbruchschutz bis RC2.`,
    (c) => `Kunststofffenster sind in ${c.name} die meistgewählte Lösung: gute Dämmung, kein Streichen, faire Preise. Mit Kömmerling 76 MD oder 88 erreichen Sie Werte, die auch für Förderprogramme interessant sind.`,
    (c) => `Kömmerling-Profile in vier Bautiefen, auf Wunsch außen mit Aluminium-Deckschale (AluClip) in RAL-Farbe – so verbinden Sie in ${c.name} Kunststoff-Dämmung mit moderner Optik.`,
    (c) => `Weiß, Anthrazit, Golden Oak oder zweifarbig: Kunststofffenster mit Kömmerling-Profilen passen sich der Fassade an. Welche Bautiefe für Ihr Haus in ${c.name} sinnvoll ist, klären wir beim Aufmaß.`,
    (c) => `Anschlag- oder Mitteldichtung, fünf, sechs oder sieben Kammern: Hinter den Kömmerling-Bezeichnungen 70, 76 AD, 76 MD und 88 stecken klare Unterschiede bei Dämmung und Preis. Wir erklären sie Ihnen in ${c.name} am Muster.`,
  ] },
  { key: "alu", h: ["Aluminiumfenster (Cortizo) in {ort}", "Alufenster für {ort}", "Aluminiumfenster in {ort}"], href: "/produkte/aluminiumfenster-cortizo/", link: "Aluminiumfenster mit Cortizo-Systemen", t: [
    (c) => `Für große Glasflächen, schmale Rahmen und moderne Architektur in ${c.name}: Aluminiumfenster mit thermisch getrennten Cortizo-Profilen (60 und 70 mm), pulverbeschichtet in allen RAL-Farben.`,
    (c) => `Aluminium ist formstabil und wartungsarm – ideal für raumhohe Elemente, Terrassentüren und Wintergärten. Höherwertige Cortizo-Systeme bieten wir auf Anfrage an, auch in ${c.name}.`,
    (c) => `Wenn Fenster in ${c.name} besonders groß oder besonders schlank sein sollen, ist Aluminium die richtige Wahl. Cortizo-Profile mit 35 mm thermischer Trennung und Dreifachglas sorgen für die nötige Dämmung.`,
    (c) => `Aluminiumfenster sind in ${c.name} die Wahl für Bauherren, die klare Linien und dunkle Farben wollen. Dank thermischer Trennung dämmen moderne Cortizo-Profile zuverlässig; die Oberfläche braucht keine Pflege.`,
    (c) => `Für Gewerbe, Verwaltung oder große Wohnhäuser in ${c.name} liefern wir Aluminiumfenster, die auch bei Elementen von 1,6 × 2,6 m formstabil bleiben – pulverbeschichtet, wetterfest, recyclingfähig.`,
  ] },
  { key: "haustuer", h: ["Haustüren in {ort}", "Neue Haustür für {ort}", "Haustüren für {ort}"], href: "/produkte/haustueren/", link: "Haustüren: Linien, Füllungen, Griffe", t: [
    (c) => `Haustüren aus Kunststoff, Kunststoff-Aluminium oder Aluminium, mit Seitenteil und Oberlicht, Sicherheit bis RC2 und Füllungen nach Wunsch. Wir montieren Ihre neue Haustür in ${c.name} inklusive Ausbau der alten.`,
    (c) => `Die Haustür ist das erste, was man von Ihrem Haus in ${c.name} sieht. Wir planen sie mit Ihnen: Füllung, Glas, Griff, Farbe – und sorgen mit Mehrfachverriegelung und gedämmter Füllung für Sicherheit und Wärmeschutz.`,
    (c) => `Von der wirtschaftlichen Nebeneingangstür bis zur flächenbündigen Premium-Haustür: Die Linien unseres Partners Helios decken alles ab. Muster und Füllungsdesigns zeigen wir beim Termin in ${c.name}.`,
    (c) => `Haustür tauschen in ${c.name}? Meist ist das an einem Tag erledigt: alte Tür raus, neue rein, Anschlüsse abgedichtet, Schwelle angepasst. Auf Wunsch mit barrierearmer Schwelle und automatischer Verriegelung.`,
    (c) => `Sicher und warm: Unsere Haustüren für ${c.name} verbinden Mehrfachverriegelung, Sicherheitsglas und gedämmte Füllungen. Griffe aus Edelstahl, Füllungen in über 20 Designs, Farben passend zu den Fenstern.`,
  ] },
  { key: "schiebe", h: ["Schiebetüren in {ort}", "Hebe-Schiebetüren für {ort}", "Terrassen- und Schiebetüren in {ort}"], href: "/produkte/schiebetueren/", link: "Hebe-Schiebetüren aus Kunststoff und Aluminium", t: [
    (c) => `Hebe-Schiebetüren öffnen Wohnräume zum Garten – bis 6,5 m Breite, barrierearm und mit Dreifachglas. Aus Kunststoff (Versatil, Robust) oder Aluminium (Visuell), montiert von uns in ${c.name}.`,
    (c) => `Mehr Licht, mehr Garten: Eine Schiebetür ersetzt in ${c.name} die klassische Terrassentür und braucht keinen Platz zum Aufschwenken. Wir beraten zu Bauart, Schwelle und Sonnenschutz.`,
    (c) => `Ob zweiflügelige Terrassentür oder sechsflügelige Glasfront: Schiebesysteme planen wir in ${c.name} passend zu Öffnung, Bodenaufbau und Rollladen.`,
    (c) => `Eine Hebe-Schiebetür ist die großzügigste Verbindung zwischen Wohnraum und Garten. Wir prüfen in ${c.name} Sturz, Bodenaufbau und Schwelle und sagen Ihnen, welche Linie – Kunststoff oder Aluminium – zu Ihrem Haus passt.`,
    (c) => `Schiebetüren laufen auf Edelstahlschienen, schließen dicht und lassen sich auch mit schweren Dreifachglas-Flügeln leicht bewegen. In ${c.name} montieren wir sie inklusive Anschluss an Boden und Fassade.`,
  ] },
];
const ORDERS = [
  ["kaufen", "tausch", "montage", "kunststoff", "alu", "haustuer", "schiebe"],
  ["tausch", "montage", "kaufen", "kunststoff", "haustuer", "alu", "schiebe"],
  ["kunststoff", "alu", "haustuer", "schiebe", "kaufen", "tausch", "montage"],
  ["montage", "tausch", "kunststoff", "haustuer", "schiebe", "alu", "kaufen"],
];

const FAQ = [
  { q: (c) => `Kommen Sie auch nach ${c.name}?`, a: [
    (c) => c.hq ? `Ja. ${c.name} liegt rund ${c.km} km von unserem Sitz in Ingolstadt entfernt und gehört zu unserem regulären Einsatzgebiet. Beratung, Aufmaß und Montage finden bei Ihnen vor Ort statt.` : `Ja. Wir sind auch im Raum Karlsruhe für Sie im Einsatz; ${c.name} liegt rund ${c.km} km von Karlsruhe entfernt. Beratung, Aufmaß und Montage finden bei Ihnen vor Ort statt, organisiert von unserem Firmensitz in Ingolstadt.`,
    (c) => c.hq ? `Selbstverständlich. Von Ingolstadt nach ${c.name} sind es etwa ${c.min} Minuten Fahrt. Wir beraten bei Ihnen zu Hause, messen auf und montieren mit unserem eigenen Team.` : `Ja – ${c.name} gehört zu unserem Einsatzgebiet im Raum Karlsruhe (rund ${c.km} km von Karlsruhe). Eine lokale Niederlassung haben wir dort nicht; Beratung, Aufmaß und Montage kommen aber zu Ihnen.`,
    (c) => c.hq ? `Ja, ${c.name} im ${c.lk} liegt in unserem Kerngebiet. Die Anfahrt aus Ingolstadt dauert etwa ${c.min} Minuten; eine Anfahrtspauschale für Beratung und Aufmaß berechnen wir nicht.` : `Ja. ${c.name} im ${c.lk} liegt in unserem Einsatzgebiet Raum Karlsruhe. Für Beratung und Aufmaß kommen wir zu Ihnen; den Termin stimmen wir individuell ab.`,
  ] },
  { q: (c) => `Wie schnell ist ein Aufmaß-Termin in ${c.name} möglich?`, a: [
    (c) => `Das hängt von der aktuellen Auslastung ab. Rufen Sie an oder schreiben Sie uns – wir nennen Ihnen den nächsten freien Termin und halten ihn verbindlich ein. Beratung und Aufmaß erledigen wir in einem Besuch.`,
    (c) => `Wir melden uns innerhalb von zwei Werktagen auf Ihre Anfrage und schlagen Ihnen Termine vor. Wie schnell es konkret geht, sagen wir Ihnen ehrlich am Telefon – je nach Saison und Auftragslage.`,
    (c) => `Einen festen Zeitraum versprechen wir nicht pauschal, weil er von der Auftragslage abhängt. Fragen Sie an: Sie bekommen zeitnah einen konkreten Terminvorschlag für ${c.name}.`,
    (c) => `Schreiben Sie uns kurz, worum es geht – Anzahl der Fenster, Haus oder Wohnung, gewünschter Zeitraum. Wir rufen zurück und finden gemeinsam einen Termin in ${c.name}, der Ihnen passt.`,
  ] },
  { q: (c) => `Was kostet der Fenstertausch in ${c.name}?`, a: [
    (c) => `Der Preis hängt von Anzahl, Größe, Werkstoff, Verglasung und Ausstattung ab – deshalb nennen wir ihn nach dem kostenlosen Aufmaß im schriftlichen Angebot. Darin stehen alle Positionen, inklusive Demontage und Entsorgung.`,
    (c) => `Pauschalpreise gibt es bei uns nicht, weil jedes Fenster nach Maß gefertigt wird. Nach Beratung und Aufmaß in ${c.name} erhalten Sie ein Angebot mit allen Posten; versteckte Kosten gibt es nicht.`,
    (c) => `Das Angebot entsteht nach dem Aufmaß: Es berücksichtigt Profil, Glas, Farben, Sicherheitsausstattung sowie Demontage, Montage und Entsorgung. Beratung und Aufmaß sind kostenlos.`,
    (c) => `Ein seriöser Preis braucht Maße: Erst nach dem Aufmaß in ${c.name} können wir Profile, Glas und Montageaufwand genau kalkulieren. Das Angebot ist schriftlich, verbindlich und kostenlos.`,
  ] },
  { q: (c) => `Nehmen Sie die alten Fenster in ${c.name} mit?`, a: [
    (c) => `Ja. Demontage und fachgerechte Entsorgung der alten Fenster und Türen gehören zu unserem Rundum-Service – Sie müssen sich um nichts kümmern.`,
    (c) => `Selbstverständlich. Wir bauen die Altelemente aus, nehmen sie mit und entsorgen sie fachgerecht. Die Baustelle übergeben wir besenrein.`,
    (c) => `Ja, das ist Teil des Auftrags: Ausbau, Abtransport und Entsorgung der alten Fenster übernehmen wir, ebenso kleinere Ausbesserungen an der Laibung.`,
    (c) => `Ja – Demontage und Entsorgung sind im Angebot enthalten. Glas, Rahmen und Beschläge werden getrennt und fachgerecht entsorgt; Sie müssen nichts organisieren.`,
  ] },
  { q: (c) => `Gibt es Förderung für neue Fenster in ${c.name}?`, a: [
    (c) => `Für energetische Sanierungen gibt es staatliche Programme (z. B. BAFA, KfW). Wir informieren Sie über die aktuellen Möglichkeiten und welche Unterlagen Sie brauchen; den Antrag stellen Sie bzw. ein Energieberater.`,
    (c) => `Möglich ist das, wenn die neuen Fenster bestimmte Dämmwerte erreichen. Wir sagen Ihnen, welche Profile und Verglasungen dafür infrage kommen, und nennen Ihnen die zuständigen Stellen – ohne Beträge zu versprechen.`,
    (c) => `Fördermöglichkeiten hängen vom Programm und Ihrem Vorhaben ab. Wir geben Ihnen beim Beratungstermin in ${c.name} einen Überblick und die nötigen technischen Nachweise für den Antrag.`,
    (c) => `Ob und wie viel gefördert wird, entscheidet das jeweilige Programm – nicht wir. Wir liefern die Unterlagen zu Uw-Werten und Einbau und nennen Ihnen die Anlaufstellen für den Antrag.`,
  ] },
];

/* ---------- Seitenbau ---------- */
function neighbors(o) {
  return orte.filter((x) => x.region === o.region && x.slug !== o.slug)
    .map((x) => ({ x, d: dist(o, x) })).sort((a, b) => a.d - b.d).slice(0, 7);
}

function header() {
  return `<header class="top">
    <a class="brand" href="/#home" aria-label="Fenster-WeissenBurger – Startseite">
      ${LOGO}
    </a>
    <nav class="nav nav--top" id="hauptnav" aria-label="Hauptnavigation">
      <a href="/#home">Home</a>
      <div class="nav__item">
        <a href="/#produkte">Produkte</a>
        <div class="nav__drop" aria-label="Produkte">
          <a href="/produkte/">Alle Produkte</a>
          <a href="/produkte/kunststofffenster-koemmerling/">Kunststofffenster (Kömmerling)</a>
          <a href="/produkte/kunststoff-aluminium-fenster/">Kunststoff-Aluminium-Fenster</a>
          <a href="/produkte/aluminiumfenster-cortizo/">Aluminiumfenster (Cortizo)</a>
          <a href="/produkte/schiebetueren/">Hebe-Schiebetüren</a>
          <a href="/produkte/haustueren/">Haustüren</a>
        </div>
      </div>
      <a href="/leistungen/">Leistungen</a>
      <a href="/referenzen/">Referenzen</a>
      <div class="nav__item nav__item--konf konf-link" hidden>
        <a href="/konfigurator/fenster/" aria-haspopup="true" aria-expanded="false">Konfigurator</a>
        <div class="nav__drop nav__drop--konf" aria-label="Konfigurator">
          <a href="/konfigurator/haustuer/"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M9 3v18M9 7h7M9 11h7M9 15h7"/><circle cx="14.5" cy="12" r=".9" fill="currentColor"/></svg><span>Haustür konfigurieren</span></a>
          <a href="/konfigurator/fenster/"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="1.5"/><path d="M12 3.5v17M3.5 12h17"/></svg><span>Fenster konfigurieren</span></a>
        </div>
      </div>
      <a href="/#ueber-uns">Über uns</a>
      <a href="/#kontakt">Kontakt</a>
    </nav>
    <a class="btn btn--call" href="${firmaLib.telHref(einst.firma.telefon)}" data-firma="tel-href">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>
      <span>Anrufen</span>
    </a>
    <button type="button" class="menu-btn" aria-label="Menü öffnen" aria-expanded="false" aria-controls="hauptnav"><span class="menu-btn__i" aria-hidden="true"></span></button>
  </header>`;
}
function head(o, meta) {
  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${esc(meta.title)}</title>
  <meta name="description" content="${esc(meta.description)}">
  ${meta.noindex ? '<meta name="robots" content="noindex, follow">' : ""}
  <link rel="canonical" href="${SITE}${meta.url}">
  <meta name="theme-color" content="#0B5ED7">
  <meta property="og:title" content="${esc(meta.title)}">
  <meta property="og:description" content="${esc(meta.description)}">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="de_DE">
  <meta property="og:url" content="${SITE}${meta.url}">
  <meta property="og:image" content="${SITE}/assets/img/leistungen/kunststofffenster-braun-montage-rohbau-1200.webp">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/assets/logo/apple-touch-icon.png">
  <link rel="preload" href="/assets/fonts/manrope-latin.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="/css/style.css?v=${V.style}">
  <link rel="stylesheet" href="/css/uebergang.css?v=${V.ueberCss}">
  <script src="/js/uebergang.js?v=${V.ueberJs}"></script>
  <link rel="stylesheet" href="/css/leistungen.css?v=2">
  <link rel="stylesheet" href="/css/produkte.css?v=1">
  <link rel="stylesheet" href="/css/orte.css?v=1">
${meta.jsonld.map((j) => `  <script type="application/ld+json"${JSON.stringify(j).includes('"LocalBusiness"') ? ' data-firma="jsonld"' : ""}>${JSON.stringify(j)}</script>`).join("\n")}
</head>`;
}
function footer() {
  return `<footer class="legal wrap">
      <a href="/#home">Startseite</a>
      <a href="/produkte/">Produkte</a>
      <a href="/leistungen/">Leistungen</a>
      <a href="/referenzen/">Referenzen</a>
      <a href="/einsatzgebiet/">Einsatzgebiet</a>
      <a href="/impressum.html">Impressum</a>
      <a href="/datenschutz.html">Datenschutzerklärung</a>
      <span>© <span id="year">2026</span> <span data-firma="name">${firmaLib.esc(firmaLib.vollerName(einst))}</span></span>
    </footer>
  </main>
  <div class="ctabar" aria-label="Schnellkontakt">
    <a class="btn btn--ghost" href="${firmaLib.telHref(einst.firma.telefon)}" data-firma="tel-href">Anrufen</a>
    <a class="btn btn--primary" href="#anfrage">Anfrage</a>
  </div>
  <script src="/js/config.js?v=1" defer></script>
  <script src="/js/main.js?v=${V.main}" defer></script>
</body>
</html>
`;
}
const PROVIDER = firmaLib.jsonLdFirma(einst, SITE);

function form(o) {
  return `<section class="sec sec--alt" id="anfrage" aria-labelledby="anfrage-title">
      <div class="wrap two two--form">
        <div>
          <p class="eyebrow"><span>→</span> Anfrage</p>
          <h2 class="h2" id="anfrage-title">Kostenloses Aufmaß in ${esc(o.name)} <em>anfragen.</em></h2>
          <p class="lead lead--sm">Wir melden uns innerhalb von zwei Werktagen und vereinbaren einen Termin bei Ihnen in ${esc(o.name)}.</p>
          ${firmaLib.kontaktKarteHtml(einst)}
        </div>
        <form class="form" name="anfrage-einsatzgebiet" method="POST" action="/danke.html" data-netlify="true" netlify-honeypot="bot-field" novalidate>
          <input type="hidden" name="form-name" value="anfrage-einsatzgebiet">
          <input type="hidden" name="region" value="${esc(regions[o.region].center)}">
          <p class="hp"><label>Bitte leer lassen: <input name="bot-field" tabindex="-1" autocomplete="off"></label></p>
          <div class="form__grid">
            <div class="form__row">
              <label for="f-ort">Ort</label>
              <input id="f-ort" name="ort" type="text" value="${esc(o.name)}" autocomplete="address-level2">
            </div>
            <div class="form__row">
              <label for="f-plz">PLZ *</label>
              <input id="f-plz" name="plz" type="text" required inputmode="numeric" pattern="[0-9]{5}" maxlength="5" autocomplete="postal-code">
            </div>
          </div>
          <div class="form__row">
            <label for="f-name">Name *</label>
            <input id="f-name" name="name" type="text" required autocomplete="name">
          </div>
          <div class="form__row">
            <label for="f-tel">Telefon *</label>
            <input id="f-tel" name="telefon" type="tel" required autocomplete="tel" inputmode="tel">
          </div>
          <div class="form__row">
            <label for="f-produkt">Worum geht es?</label>
            <select id="f-produkt" name="produkt">
              <option>Fenstertausch</option>
              <option>Fenster für Neubau</option>
              <option>Haustür</option>
              <option>Hebe-Schiebetür / Terrassentür</option>
              <option>Beratung – noch unentschieden</option>
            </select>
          </div>
          <div class="form__row">
            <label for="f-msg">Nachricht</label>
            <textarea id="f-msg" name="nachricht" rows="3"></textarea>
          </div>
          <div class="form__check">
            <input id="f-dsgvo" name="datenschutz" type="checkbox" required value="ja">
            <label for="f-dsgvo">Ich habe die <a href="/datenschutz.html">Datenschutzerklärung</a> gelesen und bin mit der Verarbeitung meiner Angaben zur Bearbeitung meiner Anfrage einverstanden. *</label>
          </div>
          <p class="form__error" role="alert" hidden>Bitte füllen Sie alle Pflichtfelder (*) aus.</p>
          <button class="btn btn--primary btn--block" type="submit">Anfrage senden</button>
        </form>
      </div>
    </section>`;
}

function buildOrt(o, seed) {
  const c = ctx(o);
  const s = o.slug + "#" + seed;
  const intro = pick(INTRO, s, "intro")(c);
  const bedeutet = pick(BEDEUTET, s, "bed")(c);
  const gebaeude = pick(GEBAEUDE, s, "geb")(c);
  const order = pick(ORDERS, s, "order");
  const topics = order.map((k) => TOPICS.find((t) => t.key === k));
  const faqIdx = [0, 1, 2, 3, 4].filter((i) => i < 2 || hash(s + "faq" + i) % 3 !== 0).slice(0, 4);
  const faqs = faqIdx.map((i) => ({ q: FAQ[i].q(c), a: pick(FAQ[i].a, s, "fa" + i)(c) }));
  const nb = neighbors(o);
  const nbSentence = nb.length ? `In der Nähe von ${esc(o.name)} sind wir auch in ${nb.slice(0, 3).map((n) => esc(n.x.name) + " (" + Math.round(n.d) + " km)").join(", ")} und weiteren Orten im Einsatz.` : "";
  const url = `/einsatzgebiet/${o.slug}/`;
  const titleVar = pick([
    `Fenster & Türen in ${o.name} – Beratung, Aufmaß, Montage | Fenster-WeissenBurger`,
    `Fenstertausch & Fenstermontage in ${o.name} | Fenster-WeissenBurger`,
    `Fenster, Haustüren & Montage in ${o.name} (${c.lk}) | Fenster-WeissenBurger`,
  ], s, "title");
  const descVar = pick([
    `Neue Fenster und Haustüren in ${o.name}: Beratung vor Ort, kostenloses Aufmaß, Montage mit Entsorgung der alten Fenster. ${c.hq ? "Rund " + c.km + " km von Ingolstadt." : "Auch im Raum Karlsruhe für Sie im Einsatz."}`,
    `Fenstertausch, Kunststoff-, Kunststoff-Aluminium- und Aluminiumfenster, Haustüren und Schiebetüren in ${o.name} (${c.lk}). ${c.hq ? "Etwa " + c.min + " Minuten von unserem Sitz in Ingolstadt." : "Wir sind auch im Raum Karlsruhe für Sie da."} Jetzt Aufmaß anfragen.`,
    `Fenster-WeissenBurger in ${o.name}: Kömmerling-Kunststofffenster, Cortizo-Alufenster, Haustüren – Beratung, Aufmaß und Montage aus einer Hand.`,
  ], s, "desc");
  const meta = { title: titleVar, description: descVar, url, noindex: !published(o), jsonld: [] };
  meta.jsonld = [
    { "@context": "https://schema.org", "@type": "Service", "@id": SITE + url + "#service", name: `Fenster- und Türenmontage in ${o.name}`, serviceType: "Fenstertausch, Fenstermontage, Haustürmontage", description: descVar, url: SITE + url, provider: PROVIDER, areaServed: { "@type": "City", name: o.name, containedInPlace: { "@type": "AdministrativeArea", name: o.landkreis === "kreisfreie Stadt" ? (o.bundesland || "Deutschland") : o.landkreis } } },
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Start", item: SITE + "/" },
      { "@type": "ListItem", position: 2, name: "Einsatzgebiet", item: SITE + "/einsatzgebiet/" },
      { "@type": "ListItem", position: 3, name: o.name, item: SITE + url }] },
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
  ];
  const h1 = `Fenster &amp; Türen in ${esc(o.name)} – <em>Beratung, Aufmaß und Montage</em>`;
  const facts = [
    o.landkreis === "kreisfreie Stadt" ? `Kreisfreie Stadt${c.bl ? " in " + esc(c.bl) : ""}` : esc(o.landkreis) + (c.bl ? ", " + esc(c.bl) : ""),
    c.isHQ ? "Unser Firmensitz" : `Rund ${c.km} km von ${esc(regions[o.region].center)}, ca. ${c.min} Min.`,
    `${c.pop} Einwohner (Stand ${c.popDate})`,
  ];
  const body = `
    <nav class="crumbs wrap" aria-label="Brotkrumen"><ol><li><a href="/">Start</a></li><li><a href="/einsatzgebiet/">Einsatzgebiet</a></li><li aria-current="page">${esc(o.name)}</li></ol></nav>
    <section class="phero" aria-labelledby="h1">
      <div class="wrap">
        <p class="eyebrow"><span>${c.hq ? "Raum Ingolstadt" : "Raum Karlsruhe"}</span> ${esc(c.lk)}</p>
        <h1 class="title" id="h1">${h1}</h1>
        <p class="lead">${intro}</p>
        <ul class="facts" aria-label="Eckdaten">${facts.map((f) => `<li>${f}</li>`).join("")}</ul>
        <p class="lead lead--sm">${nbSentence}</p>
        <div class="actions">
          <a class="btn btn--primary" href="#anfrage">Kostenloses Aufmaß anfragen</a>
          <a class="btn btn--ghost" href="${firmaLib.telHref(einst.firma.telefon)}" data-firma="tel-href">Anrufen</a>
        </div>
      </div>
    </section>

    <section class="sec" aria-label="Ablauf und Gebäude">
      <div class="wrap two">
        <div>${bedeutet}</div>
        <div><h2 class="h2">Häuser in ${esc(o.name)}: <em>jedes anders.</em></h2>${gebaeude}
          <p class="more-links"><a href="/leistungen/">Alle Leistungen</a> · <a href="/produkte/">Alle Produkte</a></p></div>
      </div>
    </section>

    <section class="sec sec--alt" aria-labelledby="themen-title">
      <div class="wrap">
        <p class="eyebrow"><span>01</span> Leistungen &amp; Produkte</p>
        <h2 class="h2" id="themen-title">Was wir in ${esc(o.name)} <em>für Sie tun.</em></h2>
        <div class="themen">
${topics.map((t, i) => `          <article class="thema">
            <h3>${esc(pick(t.h, s, "h" + t.key).replace("{ort}", o.name))}</h3>
            <p>${pick(t.t, s, "t" + t.key)(c)}</p>
            <a class="link" href="${t.href}">${esc(t.link)}</a>
          </article>`).join("\n")}
        </div>
      </div>
    </section>

    <section class="sec" aria-labelledby="faq-title">
      <div class="wrap wrap--narrow">
        <p class="eyebrow"><span>02</span> Häufige Fragen</p>
        <h2 class="h2" id="faq-title">Fragen aus <em>${esc(o.name)}.</em></h2>
        <div class="faq">${faqs.map((f) => `<details><summary>${esc(f.q)}</summary><p>${f.a}</p></details>`).join("")}</div>
      </div>
    </section>

    <section class="sec sec--alt" aria-labelledby="nahe-title">
      <div class="wrap">
        <p class="eyebrow"><span>03</span> Orte in der Nähe</p>
        <h2 class="h2" id="nahe-title">Auch hier <em>im Einsatz.</em></h2>
        <ul class="plinks plinks--orte">
${nb.map((n) => `          <li><a href="/einsatzgebiet/${n.x.slug}/">${esc(n.x.name)} <span class="sub">${Math.round(n.d)} km</span></a></li>`).join("\n")}
          <li><a href="/einsatzgebiet/">Gesamtes Einsatzgebiet</a></li>
        </ul>
      </div>
    </section>

    ${form(o)}`;
  const html = `${head(o, meta)}
<body class="page lp pp ort">${firmaLib.bannerBlock(einst)}
  <a class="skip" href="#inhalt">Zum Inhalt springen</a>
  ${header()}
  <main id="inhalt">${body}
    ${footer()}`;
  return html;
}

/* ---------- Überschneidung (5-Wort-Schindeln über <main>) ---------- */
function mainText(html) {
  const m = html.slice(html.indexOf("<main"), html.indexOf("</main>"));
  return m.replace(/<form[\s\S]*?<\/form>/g, " ").replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ").toLowerCase().replace(/[^a-zäöüß0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
}
function shingles(words, k = 5) { const s = new Set(); for (let i = 0; i + k <= words.length; i++) s.add(words.slice(i, i + k).join(" ")); return s; }
function overlap(a, b) { let n = 0; for (const x of a) if (b.has(x)) n++; return n / Math.min(a.size, b.size); }

/* ---------- Übersicht /einsatzgebiet/ ---------- */
function mapSvg(list, center) {
  const lat0 = center.lat, lon0 = center.lon;
  const kx = 111.32 * Math.cos((lat0 * Math.PI) / 180), ky = 110.57;
  const pts = list.map((o) => ({ o, x: (o.lon - lon0) * kx, y: -(o.lat - lat0) * ky }));
  const R = Math.max(...pts.map((p) => Math.hypot(p.x, p.y)), 10) * 1.12;
  const W = 600, H = 600, sc = (W / 2 - 24) / R;
  const X = (x) => (W / 2 + x * sc).toFixed(1), Y = (y) => (H / 2 + y * sc).toFixed(1);
  const rings = [10, 20, 30, 40, 50, 60, 70].filter((r) => r < R);
  return `<svg class="map" viewBox="0 0 ${W} ${H}" role="img" aria-label="Karte: Orte im Raum ${esc(center.center)} (Luftlinie, schematisch)">
  <rect width="${W}" height="${H}" rx="16" fill="#ffffff"/>
  ${rings.map((r) => `<circle cx="${W / 2}" cy="${H / 2}" r="${(r * sc).toFixed(1)}" fill="none" stroke="rgba(27,36,48,.18)" stroke-dasharray="3 5"/><text x="${(W / 2 + r * sc + 2).toFixed(1)}" y="${H / 2 - 4}" fill="#4f5b68" font-size="11">${r} km</text>`).join("")}
  ${pts.map((p) => `<a href="/einsatzgebiet/${p.o.slug}/"><circle cx="${X(p.x)}" cy="${Y(p.y)}" r="${p.o.population > 20000 ? 6 : 3.5}" fill="${p.o.slug === center.key ? "#0B5ED7" : "#1b2430"}"><title>${esc(p.o.name)} – ${Math.round(p.o.distanceKm)} km</title></circle>${p.o.population > 20000 || p.o.slug === center.key ? `<text x="${(+X(p.x) + 8).toFixed(1)}" y="${(+Y(p.y) + 4).toFixed(1)}" fill="#1b2430" font-size="12" font-weight="700">${esc(p.o.name)}</text>` : ""}</a>`).join("")}
</svg>`;
}
function buildOverview() {
  const regs = data.regions.filter((r) => r.veroeffentlicht);
  const url = "/einsatzgebiet/";
  const meta = { title: "Einsatzgebiet: Fenster & Türen im Raum Ingolstadt" + (regs.some((r) => r.key === "karlsruhe") ? " und Karlsruhe" : "") + " | Fenster-WeissenBurger", description: "Alle Orte, in denen Fenster-WeissenBurger Fenster und Haustüren berät, aufmisst und montiert – nach Landkreis sortiert, mit Entfernung vom Firmensitz Ingolstadt.", url, noindex: false, jsonld: [
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Start", item: SITE + "/" }, { "@type": "ListItem", position: 2, name: "Einsatzgebiet", item: SITE + url }] },
  ] };
  const sections = regs.map((r) => {
    const list = orte.filter((o) => o.region === r.key);
    const by = {};
    for (const o of list) (by[o.landkreis] || (by[o.landkreis] = [])).push(o);
    const groups = Object.entries(by).sort((a, b) => Math.min(...a[1].map((o) => o.distanceKm)) - Math.min(...b[1].map((o) => o.distanceKm)));
    return `<section class="sec${r.key === "karlsruhe" ? " sec--alt" : ""}" id="raum-${r.key}" aria-labelledby="raum-${r.key}-title">
      <div class="wrap">
        <p class="eyebrow"><span>${r.key === "ingolstadt" ? "01" : "02"}</span> Raum ${esc(r.center)}</p>
        <h2 class="h2" id="raum-${r.key}-title">${r.key === "ingolstadt" ? "Rund um unseren Sitz <em>in Ingolstadt.</em>" : "Auch im Raum Karlsruhe <em>für Sie im Einsatz.</em>"}</h2>
        <p class="lead lead--sm">${r.key === "ingolstadt" ? `${list.length} Orte bis ${r.radiusKm} km Luftlinie um Ingolstadt. Entfernungen und Fahrzeiten sind Richtwerte vom Firmensitz.` : `${list.length} Orte bis ${r.radiusKm} km um Karlsruhe. Unser Firmensitz bleibt Ingolstadt; Beratung, Aufmaß und Montage führen wir auch hier vor Ort durch.`}</p>
        <div class="map-wrap">${mapSvg(list, r)}</div>
        <div class="lk-grid">
${groups.map(([lk, os]) => `          <div class="lk">
            <h3>${esc(lk === "kreisfreie Stadt" ? "Kreisfreie Städte" : lk)}</h3>
            <ul>${os.sort((a, b) => a.distanceKm - b.distanceKm).map((o) => `<li><a href="/einsatzgebiet/${o.slug}/">${esc(o.name)}</a> <span class="sub">${Math.round(o.distanceKm)} km</span></li>`).join("")}</ul>
          </div>`).join("\n")}
        </div>
      </div>
    </section>`;
  }).join("\n");
  const html = `${head(null, meta)}
<body class="page lp pp ort">${firmaLib.bannerBlock(einst)}
  <a class="skip" href="#inhalt">Zum Inhalt springen</a>
  ${header()}
  <main id="inhalt">
    <nav class="crumbs wrap" aria-label="Brotkrumen"><ol><li><a href="/">Start</a></li><li aria-current="page">Einsatzgebiet</li></ol></nav>
    <section class="phero" aria-labelledby="h1">
      <div class="wrap">
        <p class="eyebrow"><span>Einsatzgebiet</span> Beratung · Aufmaß · Montage</p>
        <h1 class="title" id="h1">Wo wir <em>für Sie im Einsatz sind.</em></h1>
        <p class="lead">Von unserem Firmensitz in Ingolstadt aus beraten, vermessen und montieren wir in der ganzen Region${regs.some((r) => r.key === "karlsruhe") ? " – und auch im Raum Karlsruhe" : ""}. Wählen Sie Ihren Ort: Dort finden Sie Entfernung, Ablauf und das Anfrageformular mit vorausgefülltem Ort.</p>
        <div class="actions">
          <a class="btn btn--primary" href="/#kontakt">Kostenloses Aufmaß anfragen</a>
          <a class="btn btn--ghost" href="/leistungen/">Unsere Leistungen</a>
        </div>
      </div>
    </section>
    ${sections}
    ${footer().replace(`<a class="btn btn--primary" href="#anfrage">Anfrage</a>`, `<a class="btn btn--primary" href="/#kontakt">Anfrage</a>`)}`;
  return html;
}

/* ---------- Sitemaps ---------- */
function sitemaps() {
  const seiten = ["/", "/leistungen/", "/referenzen/", "/produkte/", "/produkte/kunststofffenster-koemmerling/", "/produkte/aluminiumfenster-cortizo/", "/produkte/schiebetueren/", "/produkte/haustueren/", "/produkte/kunststoff-aluminium-fenster/", "/einsatzgebiet/", "/impressum.html", "/datenschutz.html"];
  const u = (loc, prio, freq) => `  <url><loc>${SITE}${loc}</loc><lastmod>${TODAY}</lastmod><changefreq>${freq}</changefreq><priority>${prio}</priority></url>`;
  const xmlHead = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
  const seitenXml = xmlHead + seiten.map((l) => u(l, l === "/" ? "1.0" : /impressum|datenschutz/.test(l) ? "0.2" : "0.8", /impressum|datenschutz/.test(l) ? "yearly" : "monthly")).join("\n") + "\n</urlset>\n";
  const pub = orte.filter(published);
  const orteXml = xmlHead + pub.map((o) => u(`/einsatzgebiet/${o.slug}/`, "0.6", "monthly")).join("\n") + "\n</urlset>\n";
  const idx = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <sitemap><loc>${SITE}/sitemap-seiten.xml</loc><lastmod>${TODAY}</lastmod></sitemap>\n  <sitemap><loc>${SITE}/sitemap-orte.xml</loc><lastmod>${TODAY}</lastmod></sitemap>\n</sitemapindex>\n`;
  fs.writeFileSync(path.join(root, "sitemap-seiten.xml"), seitenXml);
  fs.writeFileSync(path.join(root, "sitemap-orte.xml"), orteXml);
  fs.writeFileSync(path.join(root, "sitemap-index.xml"), idx);
  return pub.length;
}

/* ---------- Lauf ---------- */
const report = [];
const built = []; // {slug, sh}
const order = orte.slice().sort((a, b) => (a.region === b.region ? a.distanceKm - b.distanceKm : a.region === "ingolstadt" ? -1 : 1));
for (const o of order) {
  let best = null;
  for (let seed = 0; seed < 40; seed++) {
    const html = buildOrt(o, seed);
    const sh = shingles(mainText(html));
    let max = 0, maxSlug = "";
    for (const b of built) { const ov = overlap(sh, b.sh); if (ov > max) { max = ov; maxSlug = b.slug; } }
    if (!best || max < best.max) best = { html, sh, max, maxSlug, seed };
    if (max < 0.38) break;
  }
  const dir = path.join(root, "einsatzgebiet", o.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), best.html);
  built.push({ slug: o.slug, sh: best.sh });
  report.push({ slug: o.slug, region: o.region, max: +best.max.toFixed(3), with: best.maxSlug, seed: best.seed, words: best.sh.size });
}
fs.mkdirSync(path.join(root, "einsatzgebiet"), { recursive: true });
fs.writeFileSync(path.join(root, "einsatzgebiet", "index.html"), buildOverview());
const pubCount = sitemaps();
fs.writeFileSync(path.join(root, "data", "orte-report.json"), JSON.stringify(report, null, 1));
const maxAll = Math.max(...report.map((r) => r.max));
const avg = report.reduce((s, r) => s + r.max, 0) / report.length;
console.log(`Ortsseiten: ${report.length} (veröffentlicht/in Sitemap: ${pubCount}); Überschneidung max ${(maxAll * 100).toFixed(1)} %, Ø ${(avg * 100).toFixed(1)} %, >50 %: ${report.filter((r) => r.max >= 0.5).length}`);
if (process.argv.includes("--report")) for (const r of report) console.log(`${r.slug}\t${(r.max * 100).toFixed(0)}%\t${r.with}\tseed ${r.seed}`);
