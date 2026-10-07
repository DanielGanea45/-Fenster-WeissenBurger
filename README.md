# Fenster-WeissenBurger

Statische Website der Fenster-WeissenBurger UG (haftungsbeschränkt), Ingolstadt.

- Reines HTML/CSS/JS, keine Build-Abhängigkeiten
- Durchgehender Video-Hintergrund mit fünf Szenen (Home, Produkte, Leistungen, Über uns, Kontakt)
- Hosting: Netlify (Formular über Netlify Forms)

Lokal testen: beliebigen statischen Server im Projektordner starten, z. B. `npx serve .`

## Kundenstimmen pflegen

Bewertungen erscheinen **nicht automatisch**. Das Formular „Bewertung abgeben“ (Seite `/referenzen/`) sendet die Bewertung über Netlify Forms (Formular `bewertung`) an die Firma. Nach der Prüfung (Auftrag tatsächlich ausgeführt?) wird eine freigegebene Bewertung von Hand in `data/bewertungen.json` eingetragen:

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
  Nach dem Umschalten `node scripts/build-konfigurator.js` ausführen (passiert bei jedem Netlify-Build automatisch) und committen.
- **Preise ausschließlich in `data/preise.json`** – keine Zahl im Code. Die aktuellen Werte sind **BEISPIELWERTE** (`version: 2026-10-07-beispiel`) zur Abnahme; vor dem Status `online` durch echte Preise ersetzen und `version` ändern. Struktur: €/m² je System, Mindestfläche, Min-/Max-Maße (Systemgrenzen überschreiben die allgemeinen), Zuschläge (Typ %, Farbe %, Glas €/m², Sprossen €/Element, Rollladen €/m², Zusätze €/Element oder €/lfm), Montage/Demontage je Element, Online-Rabatt %, MwSt %. Haustüren: Grundpreis je Modell, Übergröße %, Farbe %, Glas, Seitenteil, Zusätze. Die Datei ist so aufgebaut, dass ein späteres Admin-Panel sie direkt bearbeiten kann (flache Schlüssel, ein Objekt je Option).
- **Ein Rechner für alles:** `js/preis.js` läuft im Browser (`window.FWPreis`), in der Netlify Function und in den Tests. Rechenweg in ganzen Cent, kaufmännische Rundung nach jedem Schritt in fester Reihenfolge: Basis → Zuschläge (einzeln) → Elementpreis × Menge → Online-Rabatt (nur Produkt) → Montage/Demontage → Netto → MwSt → Brutto. Anzeige: „Preis ohne Online-Rabatt → Online-Rabatt → Ihr Preis“, „inkl. 19 % MwSt.“, „unverbindlicher Richtpreis“.
- **Schema-Prüfung:** `FWPreis.validiereListe()` lehnt negative, leere, unplausible Werte (z. B. MwSt > 30 %, Rabatt > 50 %, mehr als 2 Nachkommastellen) ab. Ist die Liste ungültig, zeigt der Konfigurator „Preis auf Anfrage“ statt eines falschen Preises.
- **Serverseitige Nachrechnung:** Beim „Angebot anfordern“ sendet der Browser Konfiguration + Browserpreis an `netlify/functions/anfrage.js` (Formular `angebot-konfigurator`). Die Function rechnet mit derselben Liste neu und speichert in der Netlify-Forms-Einsendung: `konfiguration` (JSON), `preis_server_brutto`/`_netto`, `preis_server_text`, `preis_browser_brutto`, `preis_abweichung`, `preisliste_version`, `positionen`, `zusammenfassung`.
- **Tests:** `npm test` (`tests/preis.test.js`, 45 Tests: 36 handgerechnete Fälle inkl. Mindestfläche, Systemgrenzen, alle Optionen, Menge 10/50, Schema-Fehler; 4 Eigenschaftstests: monoton in Breite/Höhe, nie negativ, linear in der Menge, Festverglasung günstiger). Der Netlify-Build (`npm run build`) führt die Tests aus; schlägt einer fehl, bricht der Build ab und es wird nichts veröffentlicht.
- Bilder: `assets/konfigurator/*-400.webp` / `*-800.webp` (KI-generierte Beispieldarstellungen, Hinweis „Abbildung beispielhaft“ auf der Seite).
