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
- **Bilder:** `assets/konfigurator/` (WebP, „Abbildung beispielhaft“). Neue Fotos kommen als PNG nach `bilder-original-2/` (nicht im Repository; Namensschema `fenster-<typ>-<farbe>-<sprossen>-<rollladen>`, `tuer-<modell>-<farbe>`, `glas-<art>`, `zusatz-<art>`) und werden mit `node scripts/konfigurator-bilder.js` in 400 und 900 px umgewandelt; das Skript erzeugt zugleich `data/konfigurator-bilder.json` (Liste aller Bilder mit Maßen und deutschem Alt-Text). `js/konfigurator-bilder.js` ordnet Optionen über Schlüssel **und** Namen (Schlagwörter, auch für im Admin umbenannte Optionen) den Fotos zu: Karten zeigen jede Option in der aktuellen Kombination (ganzes Bild, weißer Hintergrund, keine zwei Karten einer Gruppe mit demselben Foto), die Vorschau rechts das exakte Foto der Kombination (Serie vollständig: 4 Typen × 4 Farben × 3 Sprossen × 3 Rollladen = 144 Fotos; nur RAL/Sonderfarben zeigen die SVG-Zeichnung), der Angebotsschritt ein großes Bild neben Zusammenfassung und Preis. Abdeckungsbericht: `node scripts/konfigurator-bilder-abdeckung.js`. `tests/konfigurator-bilder.test.js` prüft Liste ↔ Dateien und dass keine Karte ohne Bild bleibt.

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

**Texte** (Menü *Texte*): Links die Seite wählen, rechts jede Überschrift und jeden Absatz direkt bearbeiten. Erlaubt sind fett, kursiv, Links und Zeilenumbrüche (Schaltflächen über den Feldern). **Vorschau** zeigt den Text der Seite in Lesereihenfolge; „Original wiederherstellen“ setzt einen Baustein zurück. **Impressum und Datenschutzerklärung** sind geschützt: Änderungen werden erst nach einer zusätzlichen Bestätigung gespeichert. Jede Speicherung ist eine Version; unter *Änderungsprotokoll* sehen Sie wer/wann/was und können jeden Stand mit einem Klick **wiederherstellen** (wird sofort mit allen Tests veröffentlicht).

**Bewertungen** (Menü *Bewertungen*): Neue Bewertungen aus dem Formular auf `/referenzen/` warten hier auf Freigabe. **Freigeben** oder **Ablehnen**, danach **Veröffentlichen** – nur freigegebene Bewertungen erscheinen auf der Website. (Das manuelle Bearbeiten von `data/bewertungen.json` entfällt.)

**Anfragen** (Menü *Anfragen*): Alle Anfragen aus Formularen und Konfigurator mit allen Feldern; bei Konfigurator-Anfragen zusätzlich die Konfiguration, der **vom Server nachgerechnete Preis** und eine rote Warnung, falls der im Browser gezeigte Preis abweicht.

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
- **Gestaltung:** dunkles „Command Center“-Thema (Referenz `design-admin/konzept-F-command-center.png`): schmale Icon-Leiste links (auf kleinen Bildschirmen nur Icons), Kopfleiste mit Pfad und Datum, KPI-Karten, Tabellen mit Inline-Bearbeitung, Schaltern und Preisverlauf (Sparkline aus den gespeicherten Versionen), Testrechner-Karte mit Produktbild, untere Aktionsleiste „X Änderungen nicht gespeichert · Verwerfen · Speichern & veröffentlichen“. Auf dem Telefon werden Tabellen zu Karten. Alle Farben sind Variablen in `css/admin.css`; die Kontrastprüfung (`node scripts/kontrast-check.js`) enthält die Admin-Kombinationen.
- Der Admin-Code (`css/admin.css`, `js/admin.js`, Vendor-Skripte) wird ausschließlich unter `/admin/` geladen; öffentliche Seiten bleiben unverändert.
