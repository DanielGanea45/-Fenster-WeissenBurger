# Fenster-WeissenBurger

Statische Website der Fenster-WeissenBurger UG (haftungsbeschränkt), Ingolstadt.

- Reines HTML/CSS/JS, keine Build-Abhängigkeiten
- Durchgehender Video-Hintergrund mit fünf Szenen (Home, Produkte, Leistungen, Über uns, Kontakt)
- Hosting: Netlify (Formular über Netlify Forms)

Lokal testen: beliebigen statischen Server im Projektordner starten, z. B. `npx serve .`

## Kundenstimmen pflegen

Bewertungen erscheinen **nicht automatisch**. Das Formular „Bewertung abgeben“ (Seite `/referenzen/`) sendet die Bewertung über Netlify Forms (Formular `bewertung`) an die Firma. Nach der Prüfung (Auftrag tatsächlich ausgeführt?) wird eine Bewertung freigegeben – am einfachsten im Admin-Bereich unter *Bewertungen* (siehe unten); alternativ von Hand in `data/bewertungen.json`:

```json
[
  {
    "name": "M. K.",
    "ort": "Ingolstadt",
    "projekt": "Fenstertausch",
    "sterne": 5,
    "text": "Wortlaut der Bewertung, unverändert.",
    "datum": "2026-10"
  }
]
```

- `name`: Name oder Initialen, wie von der Kundin/dem Kunden angegeben
- `ort`: Ort
- `projekt`: Art des Projekts (wie im Formular gewählt)
- `sterne`: 1–5
- `text`: Bewertungstext unverändert (auch negative Bewertungen werden veröffentlicht)
- `datum`: Jahr-Monat (`JJJJ-MM`); die Seite zeigt Monat und Jahr und sortiert absteigend

Die Datei muss gültiges JSON bleiben (Kommas zwischen den Einträgen, keine Kommas nach dem letzten). Solange die Liste leer ist (`[]`), zeigt die Seite „Noch keine Bewertungen – seien Sie die/der Erste!“. Löschwünsche: Eintrag entfernen und neu deployen.

Google-Bewertungslink: in `referenzen/index.html` beim Link `id="google-review"` die URL eintragen und das Attribut `hidden` entfernen.

## Einsatzgebiet (Ortsseiten)

- Datenbasis: `data/orte.json` (Wikidata/OSM: Name, Landkreis, Koordinaten, Entfernung, Fahrzeit-Schätzung, Einwohner). `stufe: 1` = Seite wird erzeugt, `stufe: 2` = später.
- Erzeugen: `node scripts/build-orte.js` schreibt `/einsatzgebiet/<ort>/index.html`, die Übersicht `/einsatzgebiet/index.html` sowie `sitemap-seiten.xml`, `sitemap-orte.xml` und `sitemap-index.xml`. Der Bericht zur Textüberschneidung liegt in `data/orte-report.json` (`--report` druckt ihn).
- **Veröffentlichungsschalter pro Region:** in `data/orte.json` unter `regions[].veroeffentlicht` (`true`/`false`). Eine Region mit `false` wird gebaut, aber mit `noindex`, ohne Eintrag in `sitemap-orte.xml` und ohne Abschnitt auf `/einsatzgebiet/`.
  - Raum Karlsruhe freischalten: `"veroeffentlicht": true` setzen, `node scripts/build-orte.js` ausführen, committen, deployen. Mehr ist nicht nötig.
- Textbausteine stehen im Generator; neue Varianten dort ergänzen, dann neu bauen.

## Spam-Schutz der Formulare

Alle Formulare (`kontakt`, `anfrage-leistungen`, `anfrage-produkte`, `anfrage-einsatzgebiet`, `bewertung`) sind dreifach geschützt:

1. **Honeypot** (`netlify-honeypot="bot-field"`): unsichtbares Feld, das nur Bots ausfüllen – Netlify verwirft solche Einsendungen.
2. **Mindestzeit**: `js/main.js` schreibt beim Laden einen Zeitstempel (`ts`) in jedes Formular. Wird es schneller als `spam.minSeconds` (Standard 3 s, `js/config.js`) abgeschickt, blockiert der Browser mit Hinweis. Mit JavaScript gehen die Daten als JSON an die Netlify Function `netlify/functions/anfrage.js`, die Honeypot, Mindestzeit (auch Alter > 24 h) und Pflichtfelder serverseitig prüft und die Anfrage erst dann an Netlify Forms weiterreicht. Ist die Function nicht erreichbar (z. B. lokal), fällt der Browser auf den klassischen Versand zurück; ohne JavaScript greift der Honeypot allein.
3. **Friendly Captcha (vorbereitet, standardmäßig aus)** – DSGVO-freundlich, ohne Cookies, Verarbeitung auf EU-Servern. Kein Google reCAPTCHA (bräuchte in Deutschland eine Cookie-Einwilligung).

Außerdem wird die E-Mail-Adresse auf allen Seiten erst im Browser zusammengesetzt (`<span class="mail" data-u data-d>`); ohne JavaScript steht lesbar „info [at] fenster-weissenburger.de“.

### Friendly Captcha aktivieren (Entscheidung des Kunden)

Konto und Kosten (Stand Oktober 2026, friendlycaptcha.com/#pricing):

| Plan | Preis | Umfang |
|---|---|---|
| Free | 0 € | nur nicht-kommerzielle Nutzung – für die Firma **nicht** zulässig |
| **Starter** | **9 €/Monat** | 1 Domain, 1.000 Anfragen/Monat – passend für diese Website |
| Growth | 39 €/Monat | 5 Domains, 5.000 Anfragen/Monat |

Jeder Plan hat 30 Tage kostenlose Testphase. „Anfrage“ = ein gelöstes Captcha, also etwa ein Formularaufruf mit Interaktion.

Schritte:
1. Konto unter friendlycaptcha.com/signup anlegen (Firmendaten), Plan **Starter** wählen, AV-Vertrag im Dashboard akzeptieren.
2. Im Dashboard eine **Application** für `fenster-weissenburger.de` anlegen (Endpoint: **EU**) → **Sitekey** kopieren; unter „API Keys“ einen **API-Key** erzeugen.
3. Netlify → Site configuration → Environment variables: `FRC_API_KEY` = API-Key, optional `FRC_SITEKEY` = Sitekey, `FRC_ENDPOINT` = `eu`. **Den API-Key niemals ins Repository schreiben.**
4. `js/config.js`: `friendlyCaptcha.enabled = true`, `sitekey = "<Sitekey>"` (der Sitekey ist öffentlich und darf ins Repo).
5. `datenschutz.html`: den auskommentierten Abschnitt „Spam-Schutz mit Friendly Captcha“ einkommentieren und die Nummerierung anpassen.
6. Deployen, Formular testen (Widget erscheint vor dem Absenden-Button; Lösung läuft im Hintergrund).

Das Widget-Skript liegt selbst gehostet unter `js/vendor/friendly-captcha-sdk-1.0.2.min.js` (MPL-2.0); die CSP erlaubt bereits `eu.frcapi.com`/`global.frcapi.com`.

## Konfigurator (Fenster & Haustüren)

- **Schalter:** `data/einstellungen.json` → `konfigurator.status`:
  - `aus` (Standard): kein Menüpunkt, keine Links, nicht in der Sitemap; `/konfigurator/fenster/` und `/konfigurator/haustuer/` zeigen „Demnächst verfügbar“ mit `noindex`.
  - `vorschau`: Konfigurator unter beiden URLs nutzbar (zum Testen für den Kunden), aber `noindex`, kein Menüpunkt, nicht in der Sitemap.
  - `online`: öffentlich, Menüpunkt „Konfigurator“, Buttons „Online konfigurieren“ auf den Produktseiten, Sitemap, indexierbar.
  Im Admin-Bereich (*Preise & Konfigurator*) wird der Schalter direkt gesetzt und veröffentlicht; die Datei ist nur noch der Rückfall ohne Admin-Daten.
- **Preise ausschließlich in `data/preise.json`** – keine Zahl im Code. Die aktuellen Werte sind **BEISPIELWERTE** (`version: 2026-10-07-beispiel`) zur Abnahme; vor dem Status `online` durch echte Preise ersetzen und `version` ändern. Struktur: €/m² je System, Mindestfläche, Min-/Max-Maße (Systemgrenzen überschreiben die allgemeinen), Zuschläge (Typ %, Farbe %, Glas €/m², Sprossen €/Element, Rollladen €/m², Zusätze €/Element oder €/lfm), Montage/Demontage je Element, Online-Rabatt %, MwSt %. Haustüren: Grundpreis je Modell, Übergröße %, Farbe %, Glas, Seitenteil, Zusätze. Die Datei ist so aufgebaut, dass ein späteres Admin-Panel sie direkt bearbeiten kann (flache Schlüssel, ein Objekt je Option).
- **Ein Rechner für alles:** `js/preis.js` läuft im Browser (`window.FWPreis`), in der Netlify Function und in den Tests. Rechenweg in ganzen Cent, kaufmännische Rundung nach jedem Schritt in fester Reihenfolge: Basis → Zuschläge (einzeln) → Elementpreis × Menge → Online-Rabatt (nur Produkt) → Montage/Demontage → Netto → MwSt → Brutto. Anzeige: „Preis ohne Online-Rabatt → Online-Rabatt → Ihr Preis“, „inkl. 19 % MwSt.“, „unverbindlicher Richtpreis“.
- **Schema-Prüfung:** `FWPreis.validiereListe()` lehnt negative, leere, unplausible Werte (z. B. MwSt > 30 %, Rabatt > 50 %, mehr als 2 Nachkommastellen) ab. Ist die Liste ungültig, zeigt der Konfigurator „Preis auf Anfrage“ statt eines falschen Preises.
- **Serverseitige Nachrechnung:** Beim „Angebot anfordern“ sendet der Browser Konfiguration + Browserpreis an `netlify/functions/anfrage.js` (Formular `angebot-konfigurator`). Die Function rechnet mit derselben Liste neu und speichert in der Netlify-Forms-Einsendung: `konfiguration` (JSON), `preis_server_brutto`/`_netto`, `preis_server_text`, `preis_browser_brutto`, `preis_abweichung`, `preisliste_version`, `positionen`, `zusammenfassung`.
- **Tests:** `npm test` (`tests/preis.test.js`, 45 Tests: 36 handgerechnete Fälle inkl. Mindestfläche, Systemgrenzen, alle Optionen, Menge 10/50, Schema-Fehler; 4 Eigenschaftstests: monoton in Breite/Höhe, nie negativ, linear in der Menge, Festverglasung günstiger). Der Netlify-Build (`npm run build`) führt die Tests aus; schlägt einer fehl, bricht der Build ab und es wird nichts veröffentlicht.
- **Bilder:** `assets/konfigurator/` (WebP, „Abbildung beispielhaft“). Neue Fotos kommen als PNG nach `bilder-original-2/` (nicht im Repository; Namensschema `fenster-<typ>-<farbe>-<sprossen>-<rollladen>`, `tuer-<modell>-<farbe>`, `glas-<art>`, `zusatz-<art>`) und werden mit `node scripts/konfigurator-bilder.js` in 400 und 900 px umgewandelt; das Skript erzeugt zugleich `data/konfigurator-bilder.json` (Liste aller Bilder mit Maßen und deutschem Alt-Text). `js/konfigurator-bilder.js` ordnet Optionen über Schlüssel **und** Namen (Schlagwörter, auch für im Admin umbenannte Optionen) den Fotos zu: Karten zeigen jede Option in der aktuellen Kombination (ganzes Bild, weißer Hintergrund, keine zwei Karten einer Gruppe mit demselben Foto), die Vorschau rechts das exakte Foto der Kombination (Serie vollständig: 4 Typen × 4 Farben × 3 Sprossen × 3 Rollladen = 144 Fotos; nur RAL/Sonderfarben zeigen die SVG-Zeichnung), der Angebotsschritt ein großes Bild neben Zusammenfassung und Preis. RAL/Wunschfarben: Karte mit Farbfächer (`karte-ral`), Vorschau und Angebotsbild zeigen die Form in Weiß mit dem Etikett „Farbe nach Wahl (RAL)“. Zusätze sind Bildkarten (Lightbox per Klick aufs Bild, Esc schließt); „Rollladenmotor“ ist ohne gewählten Rollladen gesperrt. Haustür-Seitenteil: `tuer-<modell>-<farbe>-seitenteil-<rechts|beidseitig>`, „links“ = Foto „rechts“ spiegelbildlich. Abdeckungsbericht: `node scripts/konfigurator-bilder-abdeckung.js`. `tests/konfigurator-bilder.test.js` prüft Liste ↔ Dateien und dass keine Karte ohne Bild bleibt.

### Steuer: Kleinunternehmer (§ 19 UStG) oder 19 % – ein Schalter für alles

- Die Firma ist zurzeit **Kleinunternehmer (§ 19 UStG)**: Es wird **keine Umsatzsteuer** ausgewiesen. Standard in `data/einstellungen.json` → `steuer.satzProzent: 0`.
- **Umschalten:** Admin → **Einstellungen → Steuer** → „Umsatzsteuer: 0 % (Kleinunternehmer, § 19 UStG) | 19 %“. Nach der Bestätigung wird die Einstellung versioniert gespeichert (Änderungsprotokoll mit Datum) und die Website **automatisch neu veröffentlicht** – ohne weitere Schritte.
- **Eine Quelle:** `js/steuer.js` (Browser `window.FWSteuer`, Functions, Build, E-Mails, künftige PDFs) liefert `satz(einstellungen)` und alle Texte: bei 0 % „Endpreis – gemäß § 19 UStG wird keine Umsatzsteuer berechnet.“ (kurz „Endpreis gem. § 19 UStG“), bei 19 % „inkl. 19 % MwSt.“ samt Steuerzeile. **Nirgends sonst steht ein Steuertext im Code.**
- **Rechner:** `FWPreis.berechne(konfiguration, preisliste, steuersatz)` – bei 0 % ist der Endpreis die Summe (keine Steuerzeile), bei 19 % wird die Steuer auf die Summe aufgeschlagen. Online-Rabatt, Montage usw. unverändert. Ergebnisfelder: `summe`, `steuerProzent`, `steuer`, `endpreis`, `ohneRabatt`, `ersparnis`.
- **Admin-Texte:** Der Platzhalter `{steuerhinweis}` wird beim Veröffentlichen (und in der Vorschau) durch den aktuellen Hinweis ersetzt.
- **Vorgänge behalten ihren Status:** Jede Konfigurator-Anfrage speichert den Steuersatz zum Zeitpunkt der Anfrage (`steuerProzent`); bereits erstellte Angebote/AB/Rechnungen ändern sich durch das Umschalten nicht.
- **Sperrtest:** `tests/steuer-audit.test.js` durchsucht alle veröffentlichten HTML-, JS- und JSON-Dateien (einschließlich der im Build aus dem Admin-Speicher geschriebenen Texte) nach „MwSt“, „Mehrwertsteuer“, „USt“, „Umsatzsteuer“, „19 %“, „brutto“, „netto“ sowie „inkl.“/„zzgl.“ in Verbindung mit einer Steuerangabe („inkl. 19 % MwSt.“ – „inkl. Montage“ bleibt erlaubt). Erlaubt sind nur die Texte aus `js/steuer.js` und die USt-IdNr im Impressum. Jeder andere Treffer lässt den Build scheitern – die Website wird dann nicht veröffentlicht. Bei 19 % prüft der Test zusätzlich, dass die 19-%-Texte auf allen Seiten mit Preisen stehen.

## Verwaltung (Admin-Bereich unter `/admin/`)

Der Admin-Bereich läuft komplett auf Netlify (Functions + Blobs), ohne Fremddienste außer dem kostenlosen Brevo-Plan für E-Mails. Alles, was dort gespeichert wird (Preise, Konfigurator-Schalter, Texte, Bilder, freigegebene Bewertungen), landet in Netlify Blobs; **„Speichern & veröffentlichen“** stößt einen Netlify-Build an, der die Daten holt, **alle Tests** ausführt (Preisrechner, Admin, Kontrast) und erst dann die Website neu erzeugt. Schlägt ein Test fehl, wird nichts veröffentlicht – die bisherige Version bleibt online, der Admin zeigt „Nicht veröffentlicht – Fehler: …“.

### So melden Sie sich an

1. **Einmalige Einrichtung** (macht in der Regel der Entwickler, Sie können es aber auch selbst): In Netlify unter *Site configuration → Environment variables* die Variable `ADMIN_SETUP_TOKEN` mit einer langen Zufallszeichenfolge (mind. 24 Zeichen) anlegen. Danach die Seite einmal neu deployen (*Deploys → Trigger deploy*), damit die Variable für die Functions gilt.
2. Im Browser `https://fenster-weissenburger.de/admin/?token=IHR-TOKEN` öffnen (den Wert aus Schritt 1 einsetzen). Dort Name, E-Mail und ein Passwort mit **mindestens 12 Zeichen** eingeben → „Konto anlegen“. Der Einrichtungslink funktioniert nur ein einziges Mal; danach gibt es genau ein Konto.
3. Ab dann: `https://fenster-weissenburger.de/admin/` → E-Mail und Passwort. „Angemeldet bleiben“ hält die Sitzung 30 Tage, sonst 8 Stunden. Nach **5 Fehlversuchen** ist der Zugang **15 Minuten** gesperrt.
4. **Passwort vergessen?** Link unter dem Anmeldeformular → Sie erhalten eine E-Mail mit einem Link, der 30 Minuten gültig ist (setzt `BREVO_API_KEY` voraus).
5. Empfohlen: Unter *Konto → Sicherheit* die **Zwei-Faktor-Anmeldung** einschalten (QR-Code mit einer Authenticator-App scannen). Dort finden Sie auch „Auf allen Geräten abmelden“.

Solange `ADMIN_SETUP_TOKEN` auf Produktion **nicht** gesetzt ist, antworten `/admin/` und alle Admin-Functions mit **404** – der Admin ist dann schlicht nicht vorhanden. Auf Deploy Previews ist er immer aktiv (mit eigenem, getrenntem Datenspeicher).

### So ändern Sie Bilder und Texte

**Bilder** (Menü *Bilder*): Oben die Bereiche filtern (Startseite, Referenzen, Produkte, Leistungen …). Ein Bild anklicken → rechts Titel, Bildbeschreibung und Bereich bearbeiten, **Ersetzen** lädt ein neues Foto an dieselbe Stelle, **Löschen** entfernt Galeriebilder (fest im Layout verbaute Bilder lassen sich nur ersetzen). **+ Bilder hochladen** bzw. der gestrichelte Bereich nehmen Fotos vom Computer oder direkt vom Handy an (JPG, PNG, HEIC); sie werden im Browser verkleinert (800/1600 px), in WebP umgewandelt und von EXIF/GPS-Daten befreit. Neue Fotos im Bereich „Referenzen“ erscheinen nach dem Veröffentlichen automatisch in der Galerie auf `/referenzen/`. Zum Schluss **Speichern & veröffentlichen**.

**Texte** (Menü *Texte*): Oben die Seite wählen. Links erscheint die echte Seite als Vorschau – ein Klick auf einen Text wählt das passende Feld; rechts stehen die Felder je Abschnitt der Seite („Oben auf der Seite“, „Produkte“, „Kontakt“ …) mit einfachen Namen (Kleine Zeile über der Überschrift, Große Überschrift, Überschrift, Zwischenüberschrift, Einleitung, Absatz, Button-Text). Es wird nie Code angezeigt: **Fett**, **Hervorheben** (blau, wie auf der Website), **Link** (Seiten dieser Website oder sichere https-Adressen) und **Neue Zeile** gibt es als Schaltflächen; feste Bausteine (z. B. die Nummer „01“ vor einer Überschrift) und automatische Hinweise (Steuerhinweis) erscheinen als gesperrte Etiketten und können weder gelöscht noch verändert werden. Jedes Feld zeigt die Zeichenzahl mit empfohlener Länge und „geändert“ mit **Zurücksetzen** auf den Originaltext; **Rückgängig/Wiederholen**, **Änderungen verwerfen**, **Speichern** und **Speichern & veröffentlichen** stehen in der Werkzeugleiste. Beim Speichern prüft der Server mit denselben Regeln (nur Fett, Hervorhebung, Links, neue Zeile; feste Bausteine nur unverändert) – anderes wird mit „Dieser Text enthält Zeichen, die nicht erlaubt sind.“ abgelehnt. Gespeichert wird weiterhin das bisherige HTML-Format (keine Migration). **Impressum und Datenschutzerklärung** sind geschützt: Änderungen werden erst nach einer zusätzlichen Bestätigung gespeichert. Jede Speicherung ist eine Version; „Vorher / Nachher“ zeigt die Unterschiede lesbar, unter *Änderungsprotokoll* lässt sich jeder Stand **wiederherstellen** (wird sofort mit allen Tests veröffentlicht). Technisch: `js/texte-modell.js` (Browser, Functions, Tests) liest und schreibt die Bausteine verlustfrei; `scripts/inhalte-registry.js` liefert Abschnitt und Rolle je Baustein; die Vorschau bindet die Seite per iframe ein (dafür `X-Frame-Options: SAMEORIGIN` / `frame-ancestors 'self'` auf den öffentlichen Seiten) und lädt `css/admin-vorschau.css` zur Markierung.

**Bewertungen** (Menü *Bewertungen*): Neue Bewertungen aus dem Formular auf `/referenzen/` warten hier auf Freigabe. **Freigeben** oder **Ablehnen**, danach **Veröffentlichen** – nur freigegebene Bewertungen erscheinen auf der Website. (Das manuelle Bearbeiten von `data/bewertungen.json` entfällt.)

**Anfragen** (Menü *Anfragen*): Alle Anfragen aus Formularen und Konfigurator mit allen Feldern; bei Konfigurator-Anfragen zusätzlich die Konfiguration, der **vom Server nachgerechnete Preis** und eine rote Warnung, falls der im Browser gezeigte Preis abweicht.

### Produkte (Admin → Produkte)

Die Produktkarten auf der Startseite („Drei Werkstoffe. Ein Anspruch.“) und auf `/produkte/` kommen aus `data/produkte.json` (Admin → Inhalte → Produkte): Titel, Untertitel, Kurztext, Bild (Website-Bild oder Upload), optional „ab Preis“ (Steuerhinweis automatisch aus `js/steuer.js`; ohne Preis keine Preiszeile), Link-Ziel, Sichtbar, Startseite, Reihenfolge per Drag & Drop. Speichern ist versioniert und veröffentlicht automatisch. Die ganze Karte ist ein Link (ein Link je Karte, Fokus sichtbar). Technisch: `netlify/functions/_lib/produkte.js` rendert die Karten; der Build setzt sie zwischen `<!--produkte-karten-->`-Markern in `index.html` ein und erzeugt die Produktseiten (`scripts/build-produkte.js` läuft im Build). Es gibt **keine Produkte aus Holz**: `tests/inhalt-audit.test.js` lässt den Build scheitern, sobald „Holz“ oder ein Platzhalter wie `[PREIS]` in veröffentlichten Dateien oder Dateinamen auftaucht. Golden Oak bleibt als Dekorfolie („Eichenoptik“).

### Performance (Bilder, Videos, Build, Cache)

- **Bilder**: Jede WebP-Datei hat eine AVIF-Variante (`node scripts/bilder-avif.js`, lokal mit ffmpeg; Ergebnisse werden eingecheckt). Der Build (Schritt „Bilder: AVIF-Quellen“, `scripts/bilder-picture.js`) hüllt jedes `<img>` mit vorhandener `.avif` in `<picture><source type="image/avif">` – WebP bleibt Rückfall, `width/height/loading/srcset/sizes` bleiben am `<img>`. Im Repository stehen weiter einfache `<img>`-Tags; neue Bilder: WebP ablegen, Skript laufen lassen, AVIF mit einchecken (Test `performance-budget` prüft das für `assets/img` und `assets/video`).
- **Videos**: `node scripts/video-klein.js` erzeugt `assets/video/<name>-klein.mp4` (640 px). `js/main.js` startet das Hintergrundvideo erst nach `load`, wählt unter 700 px die kleine Datei und lädt bei Datensparmodus, `prefers-reduced-data` oder `prefers-reduced-motion` gar kein Video (Poster bleibt). Videos stehen mit `preload="none"` und `data-klein` im HTML – nie `autoplay`/`preload="auto"`.
- **Build**: `scripts/minify.js` minimiert `css/*.css` und `js/*.js` mit esbuild – nur im Netlify-Build (`NETLIFY` gesetzt) bzw. mit `--erzwingen` in einer Kopie; die Quellen im Repository bleiben lesbar. Danach schreibt `assets-version.js` die `?v=`-Hashes. Lokal `npm run build:lokal` verändert deshalb weder CSS/JS noch `<img>`-Tags.
- **Cache**: `/assets/*`, `/css/*`, `/js/*` ein Jahr `immutable` (alle Referenzen tragen Inhalts-Hashes, der Build prüft das); HTML und `/data/*` `must-revalidate`. Unterseiten werden beim Zeigen/Berühren eines Links per `<link rel="prefetch">` vorgeladen.
- **Admin**: Die Bereiche Einstellungen, Produkte und Angebote & Rechnungen/Kunden liegen als `<script type="fw/modul">` im HTML und werden erst beim ersten Aufruf nachgeladen; bis eine Ansicht steht, zeigt der Admin Skelett-Platzhalter. Anfragen, Änderungsprotokoll, Zugriffsprotokoll und Kunden laden seitenweise vom Server (Suche/Filter serverseitig); Belege nutzen einen Kurzindex (`belege-index`). Functions halten Einstellungen/Preise/Texte 15 s im Speicher der Instanz (`_lib/daten.js`, nur in Netlify Functions, nie in Tests oder im Build).
- **Admin-Smoke-Test im Build:** `scripts/admin-smoke.js` lädt nach der Minimierung jede Admin-Seite (Übersicht, Bilder, Texte, Produkte, Bewertungen, Preise mit allen Reitern, Anfragen, Angebote & Rechnungen, Kunden, alle Einstellungs-Zweige, Protokolle, Konto) in Chrome headless (`@sparticuz/chromium` + `puppeteer-core`, lokal der installierte Chrome; `--erzwingen` zum lokalen Lauf) gegen einen eigenen kleinen Server mit Dateispeicher und Testkonto. Konsolenfehler, JavaScript-Fehler, fehlgeschlagene Dateien oder eine Ansicht mit Fehlermeldung lassen den Build scheitern – es wird nichts veröffentlicht. Ladefehler zeigt der Admin nie mehr als leeres „Fehler:“, sondern „Diese Seite konnte nicht geladen werden. Bitte Seite neu laden.“ mit Knopf; technische Details stehen nur in der Browser-Konsole.
- **Functions-Bündel:** Alles, was die Functions aus dem Repo laden (`js/preis.js`, `js/steuer.js`, `js/preis-validate.js`, `js/texte-modell.js`, `data/*.json`, `admin/index.html`, Schriften), muss in `netlify.toml` → `included_files` stehen; `tests/functions-bundle.test.js` prüft das automatisch (fehlt eine Datei, startet die Function auf Netlify nicht).
- **Budget**: `tests/performance-budget.test.js` begrenzt je Seite JS (110 kB), CSS (80 kB), sofort geladene Bilder (450 kB), alle Bilder (1 MB) und HTML (120 kB) – gemessen an den unminimierten Quellen – und prüft Laderegeln (lazy + Maße, höchstens ein `fetchpriority="high"`, keine ungehashten CSS/JS-Referenzen, Admin-Startbündel ≤ 170 kB).
- Messung: Lighthouse auf Produktion (Mobil + Desktop) für Start, Produkte, Produktseite, Einsatzgebiet, beide Konfiguratoren – Tabelle im PR „performance“.

### Angebote & Rechnungen (Admin → Verkauf)

Vollständiger Ablauf **Kunde → Angebot (AN) → Auftragsbestätigung (AB) → Rechnung (RE)**, dazu Stornorechnungen (ST), Kundenliste und Export für den Steuerberater. Alles läuft serverseitig in der Function `netlify/functions/belege.js` (Fachlogik `_lib/belege.js`, PDF `_lib/pdf.js`), Daten liegen in Netlify Blobs (`belege/<id>`, `belege-pdf/<id>`, `kunden/<id>`, `belege-nummern`).

- **Angebot anlegen**: „+ Neues Angebot“, aus einem Kunden (Kunden → „Angebot“) oder direkt aus einer Anfrage (Anfragen → „Angebot erstellen“; Konfiguration und Serverpreis werden als Position übernommen). Positionen mit Bezeichnung, Details, Menge, Einheit (Stk./m²/lfm/pauschal/Std.), Einzelpreis; Reihenfolge per Ziehen; Rabatt in % oder €; Montage als „Arbeitsleistung“ (erscheint auf der Rechnung als § 35a-EStG-Betrag). Entwürfe werden beim Tippen gespeichert, „Speichern & prüfen“ zeigt fehlende Pflichtangaben.
- **Summen rechnet immer der Server** (in Cent); Werte aus dem Browser werden nie übernommen. Steuer gemäß Einstellungen → Steuer: bei 0 % keine Steuerzeile und der § 19-Hinweis, bei 19 % Summe/Steuer/Gesamt. Jeder Beleg speichert Steuerstatus und Firmen-/Bankdaten zum Zeitpunkt der Erstellung.
- **Nummernkreise** je Belegart (`AN-2026-0001`, `AB-…`, `RE-…`, `ST-…`) aus Einstellungen → Dokumente, lückenlos (Compare-and-Set im Store, auch bei gleichzeitigen Zugriffen), Jahreswechsel automatisch. Angebote und ABs erhalten ihre Nummer sofort, **Rechnungen erst beim Festschreiben**.
- **Festschreiben (GoBD)**: vergibt die RE-Nummer, erzeugt das PDF, archiviert es und speichert eine SHA-256-Prüfsumme über PDF + Daten. Danach ist die Rechnung unveränderlich; Korrekturen nur per **Stornorechnung** (eigene Nummer, alle Positionen negativ, Verweis auf die Rechnung) und neue Rechnung aus der AB. Nichts wird gelöscht; jeder Beleg führt einen Verlauf.
- **Status**: Angebote Entwurf/Gesendet/Angenommen/Abgelehnt/Abgelaufen; Rechnungen Offen/Teilweise bezahlt/Bezahlt/Überfällig/Storniert (ergibt sich aus Zahlungen und Fälligkeit, „Zahlung erfassen“ mit Datum und Betrag). Liste mit Filtern, Suche, Sortierung, Seiten; Kennzahlen offene Summe, überfällig, Umsatz Monat/Jahr.
- **Anzahlung**: Ist in Bank & Zahlung ein Prozentsatz gesetzt, gibt es aus der AB eine Anzahlungsrechnung und später eine Schlussrechnung, die die festgeschriebene Anzahlung abzieht.
- **PDF** (A4, Manrope eingebettet, Logo, Wasserzeichen) mit allen Pflichtangaben nach § 14 UStG: Rechnungsnummer, Datum, Leistungsdatum/-zeitraum, Anschriften, Umsatzsteuer-ID, Zahlungsziel „zahlbar bis … ohne Abzug“, IBAN/BIC, Verwendungszweck = Rechnungsnummer, § 35a-EStG-Arbeitskosten, Aufbewahrungshinweis für Privatkunden. Fehlen Bankdaten oder Startnummern, tragen alle PDFs „MUSTER – nicht gültig“ und Festschreiben/Versand sind gesperrt (die Meldung nennt, was in den Einstellungen fehlt).
- **Versand** per Brevo mit PDF-Anhang, bearbeitbarem Text, optionaler Kopie an die Firma; Vorschau-Link vor dem Senden; Status „gesendet“ mit Datum. Ohne `BREVO_API_KEY` wird der Vorgang nur protokolliert.
- **Kunden** (Menü Kunden): werden aus Anfragen/Belegen automatisch angelegt (Schlüssel E-Mail, sonst Name + PLZ), mit Beleghistorie, bearbeitbar.
- **Export**: CSV aller Belege eines Zeitraums, vereinfachter DATEV-Buchungsstapel (EXTF, Konten 1200/8195 bzw. 8400) und ZIP mit allen festgeschriebenen Rechnungs-PDFs plus `INDEX.json` (Prüfsummen).
- **E-Rechnung**: Kleinunternehmer sind nicht verpflichtet; die Datenstruktur nach EN 16931 (`eRechnungDaten`) ist vorbereitet, der Schalter `eRechnung.aktiv` bleibt aus.
- Tests: `tests/belege.test.js` (Nummern inkl. Nebenläufigkeit, Unveränderlichkeit, Storno, 0 %/19 %, Anzahlung/Schluss, PDF-Pflichtangaben, MUSTER, Export, Zugriffsschutz).

### Einstellungen (Admin → Einstellungen)

Zentrale Schalter und Stammdaten der Website, links nach Bereichen gegliedert. Jede Speicherung wird versioniert (Änderungsprotokoll) und veröffentlicht die Website automatisch neu, wenn der Bereich sie verändert.

- **Firma & Kontakt** – Firmenname, Rechtsform, Anschrift, Telefon, E-Mail, Handelsregister, Geschäftsführer, Umsatzsteuer-ID. Eine Quelle für Impressum, Datenschutzerklärung, Fußzeile, Kontaktkarten, Telefon-Buttons, Wartungsseite und die Suchmaschinen-Daten (JSON-LD). Technisch: `data/einstellungen.json` → `firma`; die Seiten tragen `data-firma`-Marker, die `scripts/firma-einsetzen.js` (im Build automatisch) aus den Einstellungen füllt; die Generatoren lesen die Einstellungen direkt. Firmenblöcke sind deshalb bewusst **nicht** im Texte-Editor.
- **Steuer** – 0 % (§ 19 UStG) oder 19 %, siehe oben.
- **Bank & Zahlung** – Bank, Kontoinhaber, IBAN (Prüfsumme), BIC, Zahlungsziel, Anzahlung, Skonto. Fehlen Bankdaten oder Startnummern, werden Belege als „MUSTER“ gekennzeichnet (`firma.dokumenteMuster`).
- **Dokumente** – Startnummern (Format `AN-2026-0001`, `AB-…`, `RE-…`), Angebotsgültigkeit, Standardtexte je Belegart. Die Rechnungsnummer kann nach der ersten festgeschriebenen Rechnung nicht mehr herabgesetzt werden.
- **E-Mail & Benachrichtigungen** – Zieladressen für Anfragen und Bewertungen (Rückfall: Konto), Absendername.
- **Bewertungen & Google** – Links „Google-Bewertung schreiben“ und Unternehmensprofil.
- **Öffnungszeiten & Einsatzgebiet** – Zeiten je Wochentag (`09:00-17:00` oder leer); erscheinen als Text („Mo–Fr 9–17 Uhr“) und als `openingHoursSpecification`. Regionen-Schalter Ingolstadt/Karlsruhe steuern Sitemap und `noindex` der Einsatzgebiet-Seiten (`scripts/build-orte.js` läuft im Build).
- **Konfigurator** – Aus/Vorschau/Online (dieselbe Einstellung wie unter Preise).
- **Konten & Zugänge** – Übergabeliste für den Inhaber: Netlify (Hosting, Deploys, Umgebungsvariablen), GitHub, Brevo, Domain/E-Mail-Postfach (Registrar editierbar; MX-Einträge nie ändern), Google Search Console/Unternehmensprofil, Ansprechpartner Technik. Je Dienst Konto (E-Mail) und Status „verbunden ✓ / fehlt ✗“ aus `aktion=dienste` (nur ja/nein, nie Werte). Ablaufdatum des Blobs-Zugriffsschlüssels (`konten.blobsTokenAblauf`, Standard 2027-10-01) – Warnung in der Übersicht 30 Tage vorher. Keine Passwörter im Admin.
- **Website** – Wartungsmodus (`_redirects` leitet alle Besucher auf `wartung.html`, der Admin bleibt erreichbar) und Ankündigungsbanner mit Zeitraum (wird in alle Seiten eingesetzt, `js/main.js` zeigt es nur im Zeitraum).

Der Admin-Speicher enthält nur geänderte Werte; beim Laden werden sie tief mit den Standardwerten aus `data/einstellungen.json` zusammengeführt (`daten.lade("einstellungen")`). Validierung aller Bereiche: `js/preis-validate.js` → `validiereEinstellungen` (Browser und Server identisch).

### So ändern Sie Preise und schalten den Konfigurator online

Menü *Preise & Konfigurator*:

1. **Reiter** Fenster · Haustüren · Hebe-Schiebetüren · Montage & Allgemein. Jede Zahl aus `data/preise.json` ist dort ein Feld (Preis €/m² je Profilsystem, Maximalmaße, Zuschläge in % oder €, Montage, Online-Rabatt, MwSt., Versionsbezeichnung). Ungültige Eingaben (negativ, leer, min > max, unplausible Prozente) werden sofort am Feld und in einer Liste oben gemeldet – **Speichern ist erst möglich, wenn alles stimmt**; der Server prüft dieselben Regeln noch einmal. Mit dem Häkchen „Aktiv“ lassen sich Systeme/Optionen ausblenden, ohne sie zu löschen.
2. **Testrechner** (rechts): Konfiguration wählen, jede Rechenzeile und **„Kunde sieht: … €“** werden live mit den gerade eingegebenen (auch ungespeicherten) Werten berechnet – mit demselben Rechner wie auf der Website und auf dem Server („Vom Server nachrechnen lassen“ bestätigt das). **Mit eigenem Angebot vergleichen:** Ihren realen Angebotspreis eintragen → Abweichung in € und %.
3. **Speichern** legt eine Version an (mit Notiz), **Speichern & veröffentlichen** startet zusätzlich den Build. Der Status (läuft / veröffentlicht / Fehler) und das Datum der letzten Veröffentlichung stehen oben in der Statusleiste.
4. **Schalter „Konfigurator auf der Website“:** *Aus* (Besucher sehen „Demnächst verfügbar“), *Vorschau* (nur Sie nach Anmeldung, mit Banner „Vorschau – nicht öffentlich“, nicht für Suchmaschinen), *Online* (für alle, mit Menüpunkt und Sitemap – wird vor dem Umschalten noch einmal bestätigt). Der Schalter speichert und veröffentlicht sofort. Das manuelle Bearbeiten von `data/einstellungen.json` entfällt.

Wichtig: Die ausgelieferten Preise sind **Beispielwerte**. Vor „Online“ bitte echte Preise eintragen und die Versionsbezeichnung ändern.

### Umgebungsvariablen (Netlify → Site configuration → Environment variables)

Beim Anlegen jeder Variable in Netlify: **Scopes** auf *Builds* und/oder *Functions* beschränken (siehe Spalte), **Contexts** wie angegeben wählen, und bei „geheim: ja“ die Option **„Contains secret values“** aktivieren. Nach dem Anlegen oder Ändern einmal neu deployen (*Deploys → Trigger deploy → Deploy site*). Keiner dieser Werte gehört ins Repository. Leerzeichen oder Zeilenumbrüche am Anfang/Ende (typisch beim Kopieren aus PowerShell) werden beim Einlesen entfernt. Verweigert Netlify Blobs im Build den Zugriff (401/403), steht im Build-Protokoll ein Hinweis mit Länge und Präfix des Tokens – nie der Wert selbst; dann einen neuen Personal Access Token erzeugen.

| Variable | Zweck | Netlify-Kontext | Scope | Geheim | Woher |
|---|---|---|---|---|---|
| `ADMIN_SETUP_TOKEN` | Hauptschalter des Admin-Bereichs und einmaliger Einrichtungslink `/admin/?token=…`. Fehlt sie auf Produktion, antworten `/admin/*` und alle Admin-Functions mit 404. Im Build entscheidet sie zusammen mit `NETLIFY_BLOBS_TOKEN`, ob ohne Admin-Daten veröffentlicht werden darf (siehe unten). | **Production** (Pflicht); Deploy Previews optional – dort läuft der Admin auch ohne sie | Functions **und** Builds | ja | Selbst erzeugen, mind. 24 Zeichen, z. B. `openssl rand -hex 24` oder ein Passwort-Manager |
| `NETLIFY_BLOBS_TOKEN` | Lesezugriff des **Builds** auf Netlify Blobs (dort liegen die Admin-Daten). In Functions konfiguriert Netlify Blobs automatisch; im Build nicht – daher dieser Token zusammen mit der von Netlify gesetzten `SITE_ID`. Ohne ihn baut die Website mit den Repository-Daten und meldet „Admin-Daten nicht verfügbar – NETLIFY_BLOBS_TOKEN fehlt“; **auf Produktion mit gesetztem `ADMIN_SETUP_TOKEN` bricht der Build dann ab** (damit nie ohne die Admin-Daten veröffentlicht wird). | **Production** (Pflicht, sobald der Admin aktiv ist); Deploy Previews / Branch deploys empfohlen, damit „Veröffentlichen“ dort testbar ist | Builds | ja | Netlify → *User settings → Applications → Personal access tokens → New access token* (Name z. B. „Build Blobs“, ohne Ablauf oder mit Erinnerung) |
| `SESSION_SECRET` | Geheimnis für die CSRF-Token der Admin-Sitzungen (ohne Angabe wird `ADMIN_SETUP_TOKEN` verwendet). | alle Kontexte | Functions | ja | Selbst erzeugen (wie oben) |
| `NETLIFY_BUILD_HOOK` | URL, die „Speichern & veröffentlichen“ **auf Produktion** aufruft (Production-Build von `main`). Ohne sie werden Änderungen gespeichert, aber nicht veröffentlicht (klare Meldung im Admin). Außerhalb der Produktion wird dieser Hook **nie** verwendet. | **Production** | Functions | ja (die URL ist ein Geheimnis) | Netlify → *Site configuration → Build & deploy → Continuous deployment → Build hooks → Add build hook* (Branch `main`) |
| `NETLIFY_BUILD_HOOK_PREVIEW` | Optionaler Branch-Hook für Test-Veröffentlichungen aus einem Deploy Preview / Branch-Deploy heraus (URL mit `?trigger_branch=<branch>`). Fehlt er, speichert „Veröffentlichen“ in der Vorschau nur und zeigt einen Hinweis – es wird kein Build ausgelöst. | Deploy Previews / Branch deploys | Functions | ja | Zweiter Build Hook auf dem jeweiligen Branch; der Branch muss unter *Branches and deploy contexts* zum Bauen freigegeben sein |
| `NETLIFY_API_TOKEN` | Optional: lässt den Admin den echten Zustand eines laufenden Deploys bei Netlify abfragen (läuft / fertig / Fehler mit Meldung). Ohne Token gilt nach 15 Minuten ohne Rückmeldung „unbekannt – bitte erneut veröffentlichen“; der Status lässt sich im Admin auch manuell zurücksetzen. Alternativ reicht es, `NETLIFY_BLOBS_TOKEN` zusätzlich mit Scope *Functions* zu versehen. | alle Kontexte | Functions | ja | Personal Access Token (wie `NETLIFY_BLOBS_TOKEN`) |
| `BREVO_API_KEY` | E-Mail-Versand: Passwort-vergessen-Link, Bestätigung bei E-Mail-Änderung, Benachrichtigung über neue Anfragen/Bewertungen, Ergebnis einer Veröffentlichung. Ohne Schlüssel keine Mails; auf Deploy Previews zeigt der Admin die Links dann direkt an. | **Production** (Pflicht); Deploy Previews optional | Functions **und** Builds (der Build meldet das Ergebnis per Mail) | ja | Brevo (kostenloser Plan) → *SMTP & API → API-Schlüssel → Neuen API-Schlüssel erstellen*. Absenderadresse in Brevo als Absender bestätigen |
| `MAIL_FROM`, `MAIL_FROM_NAME` | Absenderadresse/-name der Mails (Standard `info@fenster-weissenburger.de` / „Fenster-WeissenBurger Website“). | alle Kontexte | Functions **und** Builds | nein | Eigene, in Brevo bestätigte Adresse |
| `SITE_ID` | Von Netlify automatisch gesetzt (Site-ID); wird nur zusammen mit `NETLIFY_BLOBS_TOKEN` benötigt. Nicht anlegen. | – | – | – | automatisch |
| `FRC_API_KEY`, `FRC_SITEKEY`, `FRC_ENDPOINT`, `SPAM_MIN_SECONDS` | Friendly Captcha / Spam-Schutz der Formulare, siehe Abschnitt *Spam-Schutz* (unverändert, optional). | alle Kontexte | Functions | `FRC_API_KEY`: ja, Rest: nein | Friendly-Captcha-Konto |

Minimalausstattung für den Start auf Produktion: `ADMIN_SETUP_TOKEN`, `NETLIFY_BLOBS_TOKEN`, `NETLIFY_BUILD_HOOK`, `BREVO_API_KEY` (+ `SESSION_SECRET` empfohlen).

### Technik (für Entwickler)

- **Functions:** `netlify/functions/admin-auth.js` (Einrichtung, Login mit Sperre 5/15 min, Abmelden, Passwort-Links, E-Mail-Bestätigung), `admin-api.js` (alle Daten: Speichern mit Validierung + Version, Bilder, Bewertungen, Anfragen, Veröffentlichen, Testrechner, Konto, 2FA), `admin-seite.js` (liefert `admin/index.html`; `/admin/*` wird per Rewrite hierher geleitet, 404-Schalter), `admin-bild.js` (Bildvorschau aus Blobs, nur angemeldet), `konfigurator-vorschau.js` (Modus „Vorschau“: Sitzungsprüfung + Banner, sonst „Demnächst verfügbar“; aktiviert über die vom Build erzeugte `_redirects`). Gemeinsame Bausteine in `netlify/functions/_lib/` (Store mit Blobs/Dateisystem-Rückfall, Auth/bcrypt/TOTP, HTTP/CSRF/Rate-Limit/Protokoll, Daten/Versionen/Diff, Validierung, Mail).
- **Sicherheit:** Sitzung = zufälliges Token (SHA-256 im Store) im Cookie `fw_admin` (HttpOnly, Secure, SameSite=Strict); schreibende Aufrufe prüfen Origin + Header `X-CSRF` (HMAC aus Sitzungstoken); Rate-Limit je IP (Auth 30/min, API 240/min); Passwörter bcrypt (Kosten 12, mind. 12 Zeichen); 2FA TOTP (RFC 6238) mit Replay-Schutz; Zugriffsprotokoll (letzte 500 Einträge) unter *Zugriffsprotokoll*. Store-Namen sind je Deploy-Kontext getrennt (`admin` auf Produktion, `admin-deploy-preview`, `admin-branch-deploy`). In der Functions-Laufzeit setzt Netlify weder `CONTEXT` noch `NETLIFY`; der Kontext wird deshalb **je Anfrage** aus `x-nf-deploy-context` bzw. dem Host (`deploy-preview-N--…`, `branch--…`) bestimmt (`store.verbinde(event)`), im Build aus `CONTEXT` – beide ergeben denselben Store-Namen.
- **Build:** `npm run build` = `scripts/build.js`: Admin-Daten aus Blobs → `data/*.json`, Textbausteine (`data-text="…"`, Register `data/texte.json`) und Bilder (Register `data/bilder.json`, Dateien nach `assets/bilder/admin/`) in die Seiten einsetzen → Tests (`tests/*.test.js`, darunter `admin-auth.test.js` und `admin-daten.test.js`) → `scripts/kontrast-check.js` → `scripts/build-konfigurator.js`. Der Status wird unter `veroeffentlichung` im Store abgelegt (läuft/veröffentlicht/fehler + Meldung); das Schreiben des Status kann den Build nie abbrechen. Blobs im Build: explizit über `SITE_ID` + `NETLIFY_BLOBS_TOKEN` (in Functions automatisch). Lokal ohne Blobs: `npm run build:lokal`. Register neu erzeugen (nach Änderungen an den Seiten): `node scripts/inhalte-registry.js`.
- **Blobs in Functions:** Netlify übergibt klassischen `handler(event)`-Functions den Blobs-Kontext in `event.blobs`; jede Function ruft deshalb zuerst `http.verbinde(event)` auf (setzt `NETLIFY_BLOBS_CONTEXT`, inkl. ungecachter Edge-URL für konsistentes Lesen nach Schreiben). In Netlify-Umgebungen gibt es **keinen** stillen Rückfall auf das Dateisystem: ohne Kontext antwortet die Function mit einem klaren Fehler („Datenspeicher (Netlify Blobs) nicht verfügbar“), der im Formular angezeigt wird. Der Test `tests/admin-blobs.test.js` fährt den Ablauf „erstes Konto anlegen“ mit der echten Bibliothek gegen einen lokalen Nachbau der Blobs-Edge-API.
- **Cache-Busting:** `scripts/assets-version.js` (erster Build-Schritt, auch von Hand ausführbar) setzt an jede CSS/JS-Referenz in allen HTML-Dateien `?v=<Inhalts-Hash>`. Ändert sich eine Datei, ändert sich ihre URL – alte Browser-Caches (auch aus der Zeit mit 7-Tage-Cache) können keine veralteten Styles mehr ausliefern. Versionsnummern müssen nicht mehr von Hand erhöht werden; der Test `tests/assets-version.test.js` schlägt an, wenn Referenzen im Repository veraltet sind.
- **Validierung** teilen sich Browser und Server: `js/preis-validate.js` (UMD), serverseitig über `netlify/functions/_lib/validate.js`.
- **Platzhalter:** Das Modul „Angebote & Rechnungen“ ist als versteckter Menüpunkt vorbereitet (`#angebote`; sichtbar mit `localStorage.setItem("fw-modul-angebote","an")`).
- **Gestaltung:** helles Thema „Stone & Ink“ (Referenzen `design-admin/stone-ink-*.png`): Steinhintergrund `#f1ede6`, Karten `#fbf9f5` mit 1-px-Rahmen und feinem Schatten, dunkle Seitenleiste `#16202c` (220 px, unter 1200 px 64 px nur Icons, auf dem Telefon Schublade) mit Messinglinie am aktiven Eintrag, Akzent Kupfer/Messing `#b5803f` für Schalter, Balken und Markierungen (als Text die AA-sichere Variante `#845a26`), Serif-Überschriften (Playfair Display, lokal als woff2) und Manrope für die Oberfläche. Übersicht mit Begrüßung, vier Kennzahlen (Anfragen, offene Angebote, offene Rechnungen, Monatsumsatz mit Trend), Einnahmen-Diagramm je Monat aus den Belegen (eigenes SVG, Daten zusätzlich als Tabelle für Screenreader), letzte Anfragen und Konfigurator-Karte; Preise mit Reitern, Preistabellen mit Schaltern und Testrechner-Karte; Angebote & Rechnungen mit Kennzahlen, Reitern, Tabelle mit Status-Pillen (offen = Messing, bezahlt = Grün, überfällig = Rot, Entwurf = Grau) und PDF-Vorschau samt Aktionen in der rechten Spalte; Einstellungen mit Zweig-Liste links und Einstellungszeilen rechts. Alle Farben sind Variablen in `css/admin.css`; die Kontrastprüfung (`node scripts/kontrast-check.js`) enthält alle Admin-Kombinationen.
- Der Admin-Code (`css/admin.css`, `js/admin.js`, Vendor-Skripte) wird ausschließlich unter `/admin/` geladen; öffentliche Seiten bleiben unverändert.

## Suchmaschinen (Google Search Console) – Schritte für Daniel

1. **Search Console öffnen** (https://search.google.com/search-console) und mit dem Google-Konto der Firma anmelden.
2. **Property anlegen:** „Domain“ wählen und `fenster-weissenburger.de` eintragen (nicht „URL-Präfix“). Google zeigt dann einen **TXT-Eintrag** (beginnt mit `google-site-verification=`).
3. **TXT-Eintrag beim Domain-Anbieter** (Registrar, z. B. IONOS/Strato) in der DNS-Verwaltung anlegen: Typ TXT, Name/Host „@“ (bzw. leer), Wert = die angezeigte Zeichenkette. **Nichts anderes ändern – vor allem keine MX-Einträge** (sonst kommt keine E-Mail mehr an). Nach einigen Minuten bis Stunden in der Search Console auf „Bestätigen“ klicken.
4. **Sitemap einreichen:** in der Search Console links „Sitemaps“ → `https://fenster-weissenburger.de/sitemap-index.xml` eintragen. Der Index verweist auf `sitemap-seiten.xml` (Hauptseiten) und `sitemap-orte.xml` (veröffentlichte Ortsseiten); Rechtsseiten, Admin, Danke-Seite und nicht veröffentlichte Regionen (Karlsruhe, solange ausgeschaltet) sind bewusst nicht enthalten. `robots.txt` verweist auf den Index.
5. **Alternative Bestätigung per Meta-Tag** (nur falls der TXT-Eintrag nicht möglich ist): in Netlify → Site configuration → Environment variables die Variable `GOOGLE_SITE_VERIFICATION` mit dem Code aus dem Google-Meta-Tag (nur der Wert von `content`) anlegen und einmal „Veröffentlichen“ im Admin anstoßen. Der Build setzt dann `<meta name="google-site-verification">` in den Kopf jeder öffentlichen Seite; ohne die Variable steht nichts im Code. Empfohlen bleibt der TXT-Eintrag.
6. **Nach dem Domain-Umzug** (sobald `fenster-weissenburger.de` auf Netlify zeigt und dort als primäre Domain eingetragen ist): in Netlify die Variable `DOMAIN_LIVE=1` setzen und veröffentlichen. Dann leitet der Build `fensterweissenburgerdaniel.netlify.app` dauerhaft (301) auf die Domain um; `www.fenster-weissenburger.de` → ohne www ist in `netlify.toml` bereits hinterlegt und greift automatisch, sobald die Domain auf Netlify zeigt. Vorher darf `DOMAIN_LIVE` nicht gesetzt sein, sonst wäre die bisher genutzte Netlify-Adresse (auch der Admin) nicht mehr erreichbar.

Technisch geprüft von `tests/seo.test.js`: canonical und og:url auf jeder Seite = finale Domain + eigene Adresse, keine doppelten Titel/Beschreibungen, gültige strukturierte Daten (LocalBusiness, BreadcrumbList), Sitemap nur mit indexierbaren Seiten und gültigen lastmod-Daten (Datum der letzten Änderung laut Git), Cookie-Richtlinie im Fußbereich.

## Cookies & Datenschutz

Die öffentliche Website setzt **keine Cookies** und nutzt keine Analyse- oder Marketing-Dienste; deshalb gibt es **kein Cookie-Banner** (§ 25 Abs. 2 Nr. 2 TDDDG). Es gibt nur zwei technische Merker im Sitzungsspeicher des Browsers (`fw-banner-zu`: Ankündigung geschlossen; `fw-transition`: Seitenübergang) und im Admin das technisch notwendige Sitzungs-Cookie `fw_admin` (HttpOnly, SameSite=Strict, bis zum Abmelden bzw. 30 Tage mit „Angemeldet bleiben“). Die Seite `cookies.html` (Cookie-Richtlinie, im Fußbereich neben Impressum und Datenschutzerklärung verlinkt, im Admin → Texte als geschützte Seite) erklärt Namen, Zweck, Dauer und das Löschen im Browser; die Datenschutzerklärung enthält den Abschnitt zu Cookies/lokaler Speicherung und zur Google Search Console (nur Bestätigung der Inhaberschaft, keine Cookies auf der Website). Wer künftig einen Dienst einbindet, der Cookies setzt (z. B. Analyse), muss vorher ein Einwilligungs-Banner ergänzen – `tests/seo.test.js` prüft, dass die öffentlichen Skripte weiterhin keine Cookies und keinen dauerhaften Speicher nutzen.

## Preishinweis (eine Quelle)

`js/hinweise.js` (Browser `window.FWHinweise`, Functions, Build, Tests) enthält den Preishinweis in langer Fassung („Alle Preise sind unverbindliche Richtpreise …“) und kurzer Fassung („Unverbindlicher Richtpreis – verbindliches Angebot nach Aufmaß“). Er erscheint überall neben Preisen: Konfigurator (Preiskasten, Leiste, Einzelpositionen, Schritt „Angebot“, Zusammenfassung der Anfrage), Produktkarten mit „ab … €“ (Startseite und Produktübersicht) und in der Anfrage-E-Mail mit Serverpreis. Im Admin → Texte steht er unter „Preishinweis (bei allen Preisen)“ als geschützter Baustein; der Build setzt die gespeicherte Fassung zwischen den Markierungen `/*TEXT:hinweise-1*/…/*/TEXT*/` ein (nur reiner Text).
