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
