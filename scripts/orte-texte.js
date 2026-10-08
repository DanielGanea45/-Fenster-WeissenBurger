/* Textbausteine der Ortsseiten (/einsatzgebiet/<ort>/) – verwendet von scripts/build-orte.js.

   Warum Satzhälften? 159 Ortsseiten entstehen aus einer Vorlage. Damit keine zwei Seiten denselben Satz tragen
   (Prüfung: scripts/text-duplikate.js, Schwelle 80 % Ähnlichkeit bei Sätzen ab 8 Wörtern), wird jeder längere
   Satz aus zwei unabhängig gewählten Hälften zusammengesetzt: Hälfte A (Aussage) + Hälfte B (Folge, Zusage,
   Ergänzung – beginnt mit ihrem Satzzeichen). 13 × 14 Hälften ergeben 182 verschiedene Sätze je Baustein; jede
   Kombination wird im gesamten Lauf nur einmal vergeben. Zwei Sätze, die nur eine Hälfte teilen, liegen klar
   unter der Schwelle. Kurze Sätze unter 8 Wörtern dürfen sich wiederholen (KURZ).

   Alle Angaben stammen aus data/orte.json (Entfernung, Fahrzeit, Landkreis, Einwohner, Nachbarorte) oder aus
   den bestehenden Leistungs- und Produkttexten der Website – keine erfundenen Zahlen, Referenzen oder Kunden.
   Regionale Unterschiede: Raum Ingolstadt (hq) = Kerngebiet um den Firmensitz; Raum Karlsruhe (ka) = zweites
   Einsatzgebiet ohne eigene Niederlassung, Firmensitz bleibt Ingolstadt. */
"use strict";

/* ---------- Kurze Sätze (< 8 Wörter, dürfen sich wiederholen) ---------- */
const KURZ = {
  intro: ["Beratung, Aufmaß und Montage aus einer Hand.", "Kostenloses Aufmaß, schriftliches Angebot, eigenes Montageteam.", "Fenster, Haustüren und Schiebetüren nach Maß.", "Wir beraten bei Ihnen zu Hause.", "Alte Fenster nehmen wir gleich mit.", "Ein Ansprechpartner von Anfang bis Abnahme.", "Gefertigt von unserem Partner Helios.", "Kömmerling, Cortizo, Helios – nach Aufmaß gefertigt."],
  bedeutet: ["Muster bringen wir mit.", "Beratung und Aufmaß sind kostenlos.", "Das Angebot ist schriftlich und verbindlich.", "Alles aus einer Hand.", "Ohne Ausstellung, direkt am Objekt.", "Ein Termin, alle Fragen geklärt.", "Kein Zeitdruck, keine Überraschungen."],
  gebaeude: ["Darum beraten wir vor Ort.", "Jedes Haus bekommt seine eigene Lösung.", "Das Aufmaß entscheidet, nicht der Katalog.", "Bestand und Neubau: beides unser Alltag.", "Wir prüfen das vor Ort.", "Dreifachglas ist heute der Normalfall."],
  kaufen: ["Beratung zu Hause, Muster inklusive.", "Drei Werkstoffe, ein Anspruch.", "Nach Maß gefertigt, von uns montiert.", "Angebot mit allen Positionen.", "Sie wählen, wir kümmern uns.", "Unverbindlich und kostenlos."],
  tausch: ["Raum für Raum, besenrein.", "Die alten Fenster nehmen wir mit.", "Dicht, gedämmt, fertig.", "Meist in wenigen Stunden pro Raum.", "Montage nach RAL-Richtlinien.", "Ein Ansprechpartner für alles."],
  montage: ["Gute Fenster verdienen gute Montage.", "Innen dicht, außen schlagregendicht.", "Abends ist die Baustelle sauber.", "Jeder Flügel wird eingestellt und geprüft.", "Fensterbänke und Anschlüsse inklusive.", "Montage nach RAL-Richtlinien."],
  kunststoff: ["Pflegeleicht, farbstabil, wirtschaftlich.", "Kömmerling 70, 76 AD, 76 MD, 88.", "Einbruchschutz bis RC2 möglich.", "Weiß, Dekor oder zweifarbig.", "Vier Bautiefen, viele Farben.", "Gefertigt von unserem Partner Helios."],
  alu: ["Cortizo-Systeme, thermisch getrennt.", "Alle RAL-Farben, pulverbeschichtet.", "Schlank, stabil, wartungsarm.", "Für große Formate die erste Wahl.", "Bautiefe 60 oder 70 mm.", "Höherwertige Systeme auf Anfrage."],
  haustuer: ["Sicherheit bis RC2.", "Seitenteil und Oberlicht möglich.", "Griffe aus Edelstahl.", "Tausch meist an einem Tag.", "Füllungen in über 20 Designs.", "Farben passend zu den Fenstern."],
  schiebe: ["Bis 6,5 m Breite.", "Barrierearme Schwelle möglich.", "Auch für große Öffnungen.", "Mehr Licht, mehr Garten.", "Dreifachglas serienmäßig geplant.", "Läuft leicht, schließt dicht."],
  faqTermin: ["Beratung und Aufmaß in einem Besuch.", "Zugesagte Termine halten wir ein."],
  faqKosten: ["Beratung und Aufmaß sind kostenlos.", "Keine versteckten Kosten."],
  faqAlt: ["Das gehört bei uns dazu.", "Ausbau, Abtransport, Entsorgung – komplett."],
  faqFoerderung: ["Beträge versprechen wir nicht.", "Wir liefern die Nachweise."],
};

/* ---------- Überschriften (kurz) ---------- */
const H2_BEDEUTET = ["Beratung, die <em>zu Ihnen kommt.</em>", "Was die Nähe <em>für Sie bedeutet.</em>", "Kurze Wege, <em>feste Termine.</em>", "So läuft es in {ort} <em>ab.</em>", "Ein Termin, <em>alles geklärt.</em>", "Vom Anruf <em>bis zur Abnahme.</em>", "Beratung dort, <em>wo eingebaut wird.</em>", "Erst zuhören, <em>dann aufmessen.</em>"];
const H2_GEBAEUDE = ["Häuser in {ort}: <em>jedes anders.</em>", "Ihr Haus <em>gibt die Lösung vor.</em>", "Altbau, Neubau, <em>Bestand.</em>", "Kein Haus <em>wie das andere.</em>", "Fassade, Laibung, <em>Rollladenkasten.</em>", "Passend zum <em>Gebäude geplant.</em>"];
const H3 = {
  kaufen: ["Fenster kaufen in {ort}", "Neue Fenster für {ort}", "Fenster in {ort} kaufen – mit Beratung", "Fensterkauf mit Aufmaß in {ort}"],
  tausch: ["Fenstertausch in {ort}", "Alte Fenster raus, neue rein – in {ort}", "Fenstertausch im Bestand in {ort}", "Fenster erneuern in {ort}"],
  montage: ["Fenstermontage in {ort}", "Montage durch unser Team in {ort}", "Fachgerechte Fenstermontage in {ort}", "Einbau nach RAL-Richtlinien in {ort}"],
  kunststoff: ["Kunststofffenster (Kömmerling) für {ort}", "Kömmerling-Kunststofffenster in {ort}", "Kunststofffenster in {ort}", "Kunststofffenster nach Maß für {ort}"],
  alu: ["Aluminiumfenster (Cortizo) in {ort}", "Alufenster für {ort}", "Aluminiumfenster in {ort}", "Cortizo-Aluminiumfenster für {ort}"],
  haustuer: ["Haustüren in {ort}", "Neue Haustür für {ort}", "Haustüren für {ort}", "Haustür tauschen in {ort}"],
  schiebe: ["Schiebetüren in {ort}", "Hebe-Schiebetüren für {ort}", "Terrassen- und Schiebetüren in {ort}", "Schiebetür zum Garten in {ort}"],
};
const TOPIC_LINKS = {
  kaufen: { href: "/produkte/", link: "Alle Produkte" },
  tausch: { href: "/leistungen/", link: "Leistungen: Demontage, Montage, Entsorgung" },
  montage: { href: "/leistungen/", link: "So läuft die Montage ab" },
  kunststoff: { href: "/produkte/kunststofffenster-koemmerling/", link: "Kunststofffenster mit Kömmerling-Profilen" },
  alu: { href: "/produkte/aluminiumfenster-cortizo/", link: "Aluminiumfenster mit Cortizo-Systemen" },
  haustuer: { href: "/produkte/haustueren/", link: "Haustüren: Linien, Füllungen, Griffe" },
  schiebe: { href: "/produkte/schiebetueren/", link: "Hebe-Schiebetüren aus Kunststoff und Aluminium" },
};
const ORDERS = [
  ["kaufen", "tausch", "montage", "kunststoff", "alu", "haustuer", "schiebe"],
  ["tausch", "montage", "kaufen", "kunststoff", "haustuer", "alu", "schiebe"],
  ["kunststoff", "alu", "haustuer", "schiebe", "kaufen", "tausch", "montage"],
  ["montage", "tausch", "kunststoff", "haustuer", "schiebe", "alu", "kaufen"],
  ["haustuer", "kunststoff", "tausch", "montage", "schiebe", "kaufen", "alu"],
];
/* Überschriften mit Ortsnamen: mehrere Varianten, damit auch ähnliche, mehrteilige Ortsnamen
   (z. B. „Neuburg an der Donau“ / „Vohburg an der Donau“) keine gleichen Zeilen ergeben */
const H2_THEMEN = ["Was wir in {ort} <em>für Sie tun.</em>", "Leistungen und Produkte <em>für {ort}.</em>", "Unser Angebot <em>in {ort}.</em>", "Fenster, Türen, Montage – <em>für {ort}.</em>", "Das bieten wir <em>in {ort}.</em>", "Rund ums Fenster <em>in {ort}.</em>"];
const H2_ANFRAGE = ["Kostenloses Aufmaß in {ort} <em>anfragen.</em>", "Jetzt Aufmaß für {ort} <em>vereinbaren.</em>", "Termin in {ort} <em>anfragen.</em>", "Ihr Projekt in {ort}: <em>jetzt anfragen.</em>", "Beratung in {ort} <em>anfragen.</em>"];
/* FAQ-Fragen: kurz, je Frage mehrere Formulierungen */
const FAQ_FRAGEN = {
  kommen: ["Kommen Sie auch nach {ort}?", "Sind Sie auch in {ort} im Einsatz?", "Montieren Sie auch in {ort}?", "Fahren Sie auch nach {ort}?", "Gehört {ort} zu Ihrem Einsatzgebiet?"],
  termin: ["Wie schnell gibt es einen Aufmaß-Termin?", "Wie schnell ist ein Aufmaß-Termin möglich?", "Wann können Sie zum Aufmaß kommen?", "Wie lange dauert es bis zum Aufmaß?"],
  kosten: ["Was kostet der Fenstertausch in {ort}?", "Was kosten neue Fenster in {ort}?", "Wie teuer ist ein Fenstertausch in {ort}?", "Womit muss ich in {ort} preislich rechnen?"],
  alt: ["Nehmen Sie die alten Fenster mit?", "Entsorgen Sie die alten Fenster?", "Was passiert mit den alten Fenstern?", "Ist die Entsorgung der Altfenster inklusive?"],
  foerderung: ["Werden neue Fenster in {ort} gefördert?", "Gibt es Förderung für Fenster in {ort}?", "Welche Förderung gibt es in {ort}?", "Kann ich in {ort} Fördermittel nutzen?"],
};

/* ---------- Nachbarsatz (Hero): Einleitung × Nachbarorte ---------- */
const NACHBARN = [
  (c, n) => `Auch in ${n[0]}, ${n[1]} und ${n[2]} sind wir regelmäßig im Einsatz.`,
  (c, n) => `Zu unseren Einsatzorten in der Nachbarschaft gehören ${n[0]}, ${n[1]} und ${n[2]}.`,
  (c, n) => `Ganz in der Nähe montieren wir ebenso in ${n[0]}, ${n[1]} und ${n[2]}.`,
  (c, n) => `Von ${c.name} aus sind es nur wenige Kilometer nach ${n[0]}, ${n[1]} und ${n[2]} – auch dort sind wir für Sie da.`,
  (c, n) => `Unsere Monteure kennen auch die Nachbarorte ${n[0]}, ${n[1]} und ${n[2]}.`,
  (c, n) => `Die Nachbarorte ${n[0]}, ${n[1]} und ${n[2]} betreuen wir ebenfalls.`,
  (c, n) => `${n[0]}, ${n[1]} und ${n[2]} liegen gleich nebenan – auch dort beraten, messen und montieren wir.`,
  (c, n) => `Fenster und Türen montieren wir außerdem in ${n[0]}, ${n[1]} und ${n[2]}.`,
  (c, n) => `Ebenso gehören ${n[0]}, ${n[1]} und ${n[2]} zu unserem Einsatzgebiet.`,
  (c, n) => `In der Umgebung von ${c.name} sind wir unter anderem in ${n[0]}, ${n[1]} und ${n[2]} tätig.`,
  (c, n) => `Wer in ${n[0]}, ${n[1]} oder ${n[2]} wohnt, erreicht uns genauso unkompliziert.`,
  (c, n) => `Beratung und Aufmaß bieten wir ebenso in ${n[0]}, ${n[1]} und ${n[2]} an.`,
  (c, n) => `Auch in ${n[0]}, ${n[1]} und ${n[2]} sind wir Ansprechpartner für neue Fenster und Haustüren.`,
  (c, n) => `Nachbarorte wie ${n[0]}, ${n[1]} und ${n[2]} fahren wir ebenso an.`,
  (c, n) => `Rund um ${c.name} – etwa in ${n[0]}, ${n[1]} und ${n[2]} – sind unsere Monteure ebenfalls unterwegs.`,
  (c, n) => `${n[0]}, ${n[1]} und ${n[2]} gehören zum selben Einsatzgebiet wie ${c.name}.`,
];

/* ---------- Firmensitz Ingolstadt: eigene, einmalige Texte ---------- */
const HQ = {
  intro: `Ingolstadt ist unser Zuhause: Von unserem Firmensitz aus beraten, vermessen und montieren wir in allen Stadtteilen – vom Nordbahnhof bis zum Südufer der Donau. Eine Anfahrtspauschale für Beratung und Aufmaß fällt in der Stadt nicht an, und für Nachbesserungen oder ein zweites Aufmaß sind die Wege kurz.`,
  faqKommen: `In der ganzen Stadt – Ingolstadt ist unser Firmensitz, und die Wege in alle Stadtteile sind kurz. Beratung, Aufmaß und Montage finden bei Ihnen zu Hause statt; eine Anfahrtspauschale berechnen wir in Ingolstadt nicht.`,
};

/* ---------- Satzbausteine: Hälfte A (Aussage) + Hälfte B (beginnt mit Satzzeichen) ---------- */
const SLOTS = {
  /* Hero-Einleitung: Lage und Entfernung → was das für Kundinnen und Kunden heißt */
  intro: {
    hq: {
      A: [
        (c) => `${c.name} liegt rund ${c.km} km Luftlinie von unserem Firmensitz in Ingolstadt entfernt, etwa ${c.min} Minuten Fahrt`,
        (c) => `Von Ingolstadt nach ${c.name} brauchen wir etwa ${c.min} Minuten – rund ${c.km} km Luftlinie`,
        (c) => `Die ${c.typOrt} gehört mit rund ${c.km} km Entfernung zu unserem Kerngebiet um Ingolstadt`,
        (c) => `${c.name} (${c.pop} Einwohner, Stand ${c.popDate}) erreichen wir von Ingolstadt aus in etwa ${c.min} Minuten`,
        (c) => `Zwischen unserem Sitz in Ingolstadt und ${c.name} liegen rund ${c.km} km, also etwa ${c.min} Minuten mit dem Montagefahrzeug`,
        (c) => `${c.name} zählt ${c.pop} Einwohner (Stand ${c.popDate}) und liegt ${c.imLk}, rund ${c.km} km von Ingolstadt`,
        (c) => `Etwa ${c.min} Fahrminuten trennen ${c.name} von unserem Betrieb in Ingolstadt`,
        (c) => `Für uns ist ${c.name} ein kurzer Weg: rund ${c.km} km Luftlinie, etwa ${c.min} Minuten Fahrt ab Ingolstadt`,
        (c) => `Als Ingolstädter Fensterbetrieb sind wir in ${c.name} (${c.lk}) regelmäßig unterwegs – die Anfahrt dauert etwa ${c.min} Minuten`,
        (c) => `${c.nameLk} liegt etwa ${c.min} Autominuten von unserem Firmensitz in Ingolstadt entfernt`,
        (c) => `Rund ${c.km} km Luftlinie und etwa ${c.min} Minuten Fahrt liegen zwischen Ingolstadt und ${c.name}`,
        (c) => `${c.name} liegt ${c.imLk}${c.bl ? " in " + c.bl : ""} und damit mitten in dem Gebiet, das wir von Ingolstadt aus regelmäßig bedienen`,
        (c) => `Unser Firmensitz in Ingolstadt ist von ${c.name} rund ${c.km} km entfernt – eine Fahrt von etwa ${c.min} Minuten`,
      ],
      B: [
        () => ` – für Beratung und Aufmaß kommen wir ohne Umwege zu Ihnen`,
        /* Nähe-Aussagen nur bis 45 Fahrminuten (leere Rückgabe = Hälfte für diesen Ort nicht verfügbar) */
        (c) => (c.min <= 45 ? `, deshalb lassen sich Beratungstermine bei Ihnen kurzfristig legen` : ""),
        () => `; das Aufmaß erledigen wir beim ersten Besuch gleich mit`,
        (c) => (c.min <= 45 ? ` – kurz genug, dass unsere Monteure am Einbautag früh bei Ihnen sind` : ""),
        (c) => (c.min <= 45 ? `, und für Nachbesserungen oder ein zweites Aufmaß sind wir schnell wieder da` : ""),
        () => ` – Beratung, Aufmaß und Montage kommen bei Ihnen aus einer Hand`,
        () => `; Sie bekommen einen festen Ansprechpartner und zuverlässig gehaltene Termine`,
        () => `, sodass wir Beratung und Aufmaß gern in einem einzigen Termin erledigen`,
        () => ` – ideal, um neue Fenster oder eine Haustür ohne lange Wartezeiten zu planen`,
        (c) => (c.min <= 45 ? `, und genau diese Nähe macht Termine bei Ihnen zu Hause unkompliziert` : ""),
        () => ` – wir beraten in Ihren Räumen, messen auf und montieren mit eigenem Team`,
        () => `; Muster, Farbkarten und Aufmaßwerkzeug bringen wir gleich mit`,
        () => ` – ob Fenstertausch im Bestand oder Fenster für den Neubau, wir kommen zu Ihnen`,
        () => `; eine Anfahrtspauschale für Beratung und Aufmaß berechnen wir nicht`,
      ],
    },
    ka: {
      A: [
        (c) => `${c.name} liegt rund ${c.km} km von Karlsruhe entfernt, etwa ${c.min} Minuten Fahrt – und gehört zu unserem Einsatzgebiet im Raum Karlsruhe, das wir von unserem Sitz in Ingolstadt aus betreuen`,
        (c) => `Unser Firmensitz ist Ingolstadt, doch auch im Raum Karlsruhe sind wir für Sie im Einsatz: ${c.name} liegt rund ${c.km} km bzw. etwa ${c.min} Minuten von Karlsruhe`,
        (c) => `Die ${c.typOrt} (${c.pop} Einwohner, Stand ${c.popDate}) liegt rund ${c.km} km von Karlsruhe und zählt zu den Orten, die wir neben dem Raum Ingolstadt bedienen`,
        (c) => `Rund ${c.km} km von Karlsruhe, etwa ${c.min} Minuten Fahrt: ${c.name} gehört zu unserem zweiten Einsatzgebiet, das wir von Ingolstadt aus organisieren`,
        (c) => `Auch im Raum Karlsruhe sind wir für Sie da – ${c.name} (${c.lk}) liegt rund ${c.km} km von Karlsruhe entfernt, unser Firmensitz bleibt Ingolstadt`,
        (c) => `${c.name} zählt ${c.pop} Einwohner (Stand ${c.popDate}) und liegt etwa ${c.min} Fahrminuten von Karlsruhe; Beratung, Aufmaß und Montage planen wir dort als feste Termine von Ingolstadt aus`,
        (c) => `Von Karlsruhe nach ${c.name} sind es rund ${c.km} km, etwa ${c.min} Minuten; wir sind auch in dieser Region für Sie im Einsatz, geplant und organisiert von unserem Sitz in Ingolstadt`,
        (c) => `${c.nameLk} liegt im Raum Karlsruhe, rund ${c.km} km vom Stadtzentrum – eine Region, in der wir neben unserem Heimatmarkt Ingolstadt ebenfalls montieren`,
        (c) => `Im Raum Karlsruhe sind wir ebenso für Sie im Einsatz wie rund um unseren Sitz in Ingolstadt; ${c.name} liegt etwa ${c.min} Minuten von Karlsruhe`,
      ],
      B: [
        () => ` – für Beratung und Aufmaß kommen wir ohne Umwege zu Ihnen`,
        () => `; das Aufmaß erledigen wir beim ersten Besuch gleich mit`,
        () => ` – Beratung, Aufmaß und Montage kommen bei Ihnen aus einer Hand`,
        () => `; Sie bekommen einen festen Ansprechpartner und zuverlässig gehaltene Termine`,
        () => `, sodass wir Beratung und Aufmaß gern in einem einzigen Termin erledigen`,
        () => ` – wir beraten in Ihren Räumen, messen auf und montieren mit eigenem Team`,
        () => `; Muster, Farbkarten und Aufmaßwerkzeug bringen wir gleich mit`,
        () => ` – ob Fenstertausch im Bestand oder Fenster für den Neubau, wir kommen zu Ihnen`,
        () => ` – Anfahrt und Termin stimmen wir individuell mit Ihnen ab`,
        () => `; die Fertigung übernimmt unser Partner Helios, die Montage unser eigenes Team`,
      ],
    },
  },

  /* „Was die Nähe für Sie bedeutet“: Ablauf des Vor-Ort-Termins → was folgt */
  bedeutet: {
    A: [
      (c) => `Statt Ausstellung und Katalog schauen wir uns Ihre Fenster und Türen in ${c.name} direkt vor Ort an`,
      (c) => `Beim Termin bei Ihnen in ${c.name} bringen wir Profilmuster und Farbkarten mit`,
      (c) => `Beratung und Aufmaß legen wir bei Ihnen zu Hause in ${c.name} auf einen einzigen Termin`,
      (c) => `Wir nehmen uns beim Besuch in ${c.name} Zeit, hören zu und messen jedes Element einzeln auf`,
      (c) => `Öffnungsarten, Verglasung, Farben und Sicherheit besprechen wir in ${c.name} dort, wo die Fenster später eingebaut werden`,
      (c) => `Ein Vor-Ort-Termin in ${c.name} lässt sich bei uns verbindlich planen – wir kommen zur vereinbarten Zeit`,
      (c) => `Sie rufen an oder schreiben uns, wir vereinbaren einen Beratungstermin bei Ihnen in ${c.name}`,
      (c) => `Beim Besuch in ${c.name} erklären wir, was beim Einbau in Ihrem Haus zu beachten ist, und messen kostenlos auf`,
      (c) => `Welche Fenster zu Ihrem Haus in ${c.name} passen, klären wir am besten vor Ort und nicht am Telefon`,
      (c) => `Unsere Beratung findet in Ihren Räumen in ${c.name} statt – mit Blick auf Laibungen, Fensterbänke und Rollladenkästen`,
      (c) => `In ${c.name} beraten wir Sie zu Hause, zeigen Muster zum Anfassen und nehmen die Maße direkt mit`,
      (c) => `Beratung heißt für uns in ${c.name}: zuhören, Varianten vorlegen, ehrlich empfehlen, aufmessen`,
      (c) => `Für den Beratungstermin in ${c.name} brauchen Sie nichts vorzubereiten – wir sehen uns die Elemente gemeinsam an`,
    ],
    B: [
      () => `; anschließend erhalten Sie ein schriftliches Angebot mit allen Positionen`,
      () => ` – das Angebot folgt schriftlich, der Montagetag wird fest zugesagt`,
      () => `, und nach Ihrer Freigabe fertigt unser Partner Helios die Elemente nach Maß`,
      () => `; am Montagetag kommen die alten Fenster raus, die neuen rein, und wir nehmen die Altelemente mit`,
      () => ` – sollte später eine Einstellung nötig sein, sind wir ohne großen Aufwand wieder da`,
      () => `, damit im Angebot wirklich jede Position stimmt und keine Überraschungen folgen`,
      () => ` – so wissen Sie vor der Bestellung genau, was eingebaut wird und was es kostet`,
      () => `; zum Schluss gehen wir die fertige Montage gemeinsam mit Ihnen durch`,
      () => `, und Sie entscheiden in Ruhe, wenn Angebot und Muster vorliegen`,
      () => ` – unverbindlich, kostenlos und ohne Zeitdruck`,
      () => `; von der Freigabe bis zur Abnahme bleibt derselbe Ansprechpartner zuständig`,
      () => ` – mit Demontage und Entsorgung der alten Elemente als Teil des Auftrags`,
      () => `, denn ein gutes Angebot entsteht am Objekt und nicht am Schreibtisch`,
      () => ` – und was wir Ihnen zusagen, steht hinterher auch so im Angebot`,
    ],
  },

  /* „Häuser in X: jedes anders“: Gebäudesituation → unsere Antwort */
  gebaeude: {
    A: [
      (c) => `Reihenhaus, freistehendes Einfamilienhaus, Mehrfamilienhaus oder Gewerbe: In ${c.name} ist jede Aufgabe anders`,
      (c) => `Ältere Fenster in ${c.name} haben oft nur Zweifachglas und undichte Rahmen`,
      (c) => `Wie überall in der Region stehen in ${c.name} Häuser aus ganz unterschiedlichen Baujahren nebeneinander`,
      (c) => `Ob Altbau, Doppelhaushälfte oder Neubau in ${c.name} – Fassade, Laibung und Rollladenkasten geben die Lösung vor`,
      (c) => `Jedes Gebäude in ${c.name} bringt eigene Voraussetzungen mit: verputzte Fassade oder Klinker, Standardmaße oder Sonderformen`,
      (c) => `Bei Bestandsgebäuden in ${c.name} prüfen wir zuerst, ob Laibungen und Rollladenkästen für Dreifachglas geeignet sind`,
      () => `Moderne Profile mit Dreifachverglasung senken den Wärmeverlust gegenüber alten Fenstern deutlich`,
      (c) => `Welche Bautiefe und welches Profil für Ihr Haus in ${c.name} sinnvoll sind, hängt von Fassade, Budget und Energieziel ab`,
      (c) => `Fenster für ein Haus in ${c.name} planen wir nie nach Schema, sondern nach dem, was Mauerwerk und Fassade hergeben`,
      (c) => `Beim Termin in ${c.name} sehen wir uns Laibungen, Fensterbänke und Rollladenkästen genau an`,
      (c) => `Sanierung im bewohnten Haus, Fenstertausch im Mehrfamilienhaus oder Erstausstattung im Neubau – in ${c.name} begleiten wir alle drei Fälle`,
      (c) => `Zugige Rahmen und beschlagene Scheiben sind in älteren Häusern in ${c.name} ein typischer Anlass für den Fenstertausch`,
      (c) => `Nicht jedes Haus in ${c.name} braucht das dickste Profil – oft reicht eine schlankere Bautiefe mit Dreifachglas`,
    ],
    B: [
      () => ` – deshalb planen wir die Montage passend zum Gebäude und nicht nach Schema`,
      () => `; das Aufmaß vor Ort gibt den Ausschlag, nicht der Katalog`,
      () => ` – für jeden Fall gibt es das passende Profil, vom wirtschaftlichen Fenstertausch bis zum Passivhaus-Niveau`,
      () => ` – das klären wir gemeinsam beim Termin vor Ort`,
      () => `; wir sagen Ihnen offen, was beim Einbau in Ihrem Haus zu beachten ist`,
      () => ` – Kömmerling-Profile in mehreren Bautiefen und Cortizo-Aluminium decken alle Anforderungen ab`,
      () => `, damit das neue Fenster zur Fassade passt und die Fuge dauerhaft dicht bleibt`,
      () => `; Sondermaße und große Festverglasungen fertigt unser Partner Helios nach Aufmaß`,
      () => ` – wir beraten Sie, ob Zweifach- oder Dreifachglas, Anschlag- oder Mitteldichtung sinnvoller ist`,
      () => ` – ein sauber geplanter Einbau spart später Nacharbeit und Heizkosten`,
      () => ` – unsere Monteure kennen die typischen Anschlusssituationen in Alt- und Neubau`,
      () => `; auf Wunsch rechnen wir Ihnen zwei oder drei Varianten mit Werten und Preisen vor`,
      () => ` – Fensterbänke, Anschlussarbeiten und kleinere Putzausbesserungen gehören zur Montage dazu`,
      () => `; genau dafür nehmen wir uns beim Aufmaß die nötige Zeit`,
    ],
  },

  /* Themen */
  kaufen: {
    A: [
      () => `Bei uns kaufen Sie Fenster nicht von der Stange, sondern nach Aufmaß gefertigt – aus Kunststoff, Kunststoff-Aluminium oder Aluminium`,
      (c) => `Fenster kaufen heißt in ${c.name} bei uns: Beratung zu Hause, Aufmaß, schriftliches Angebot, Fertigung nach Maß und Montage`,
      (c) => `Sie möchten in ${c.name} neue Fenster kaufen und wissen noch nicht, welcher Werkstoff passt`,
      (c) => `Von der ersten Idee bis zum eingebauten Fenster begleiten wir Sie in ${c.name} durch Auswahl, Aufmaß und Montage`,
      (c) => `Welches Fenster zu Ihrem Haus in ${c.name} passt, entscheiden Fassade, Budget und Energieziel`,
      () => `Die Preise richten sich nach Größe, Verglasung und Ausstattung Ihrer Fenster`,
      (c) => `Kunststofffenster von Kömmerling, Aluminiumfenster von Cortizo oder die Kombination aus beidem – in ${c.name} haben Sie die Wahl`,
      (c) => `Beim Fensterkauf in ${c.name} zählen Uw-Wert, Dichtungssystem, Beschlag und Farbe mehr als der Katalogpreis`,
      (c) => `Neue Fenster für ${c.name} planen wir mit Ihnen am Küchentisch, nicht im Showroom`,
      (c) => `Wir legen Ihnen für Ihr Haus in ${c.name} zwei oder drei Fenstervarianten vor – mit Werten, Farben und Preisen`,
      (c) => `Ein Fensterkauf ist eine Entscheidung für Jahrzehnte, deshalb nehmen wir uns in ${c.name} Zeit für die Auswahl`,
      () => `Gefertigt werden Ihre Fenster von unserem Partner Helios mit Profilen von Kömmerling und Cortizo`,
      (c) => `Für Privatkunden, Bauträger und Hausverwaltungen in ${c.name} liefern und montieren wir Fenster in allen gängigen Öffnungsarten`,
    ],
    B: [
      (c) => ` – die Beratung findet bei Ihnen in ${c.name} statt, mit Mustern zum Anfassen`,
      () => `; wir erklären Uf- und Uw-Werte und empfehlen, was zu Haus und Budget passt`,
      () => ` – alle Kosten rechnen wir transparent im Angebot vor`,
      () => `; Sie wählen in Ruhe, wir fertigen nach Maß und montieren mit eigenem Team`,
      () => ` – unverbindlich, kostenlos und ohne Verkaufsdruck`,
      () => `; Dreifachglas, Sicherheitsbeschläge und Farben wählen Sie nach Bedarf dazu`,
      () => ` – Kömmerling-Profile für Kunststoff, Cortizo-Systeme für Aluminium, AluClip für die Kombination`,
      () => `; am Ende steht ein Angebot, in dem jede Position nachvollziehbar ist`,
      () => ` – vom wirtschaftlichen Fenstertausch bis zum Passivhaus-Niveau`,
      () => `; Fertigung nach Maß durch unseren Partner Helios, Montage durch unser Team`,
      () => ` – und wir sagen Ihnen auch, wenn die günstigere Variante für Ihr Haus reicht`,
      () => `; der Montagetermin wird nach Ihrer Freigabe fest zugesagt`,
      () => ` – wir beraten bei Ihnen zu Hause und nehmen das Aufmaß gleich mit`,
      () => `; Öffnungsart, Glas und Farbe legen wir gemeinsam am Muster fest`,
    ],
  },
  tausch: {
    A: [
      (c) => `Beim Fenstertausch in ${c.name} bauen wir die alten Fenster aus, setzen die neuen fachgerecht ein und dichten ab`,
      (c) => `Zugige Rahmen, beschlagene Scheiben, hohe Heizkosten – ein Fenstertausch in ${c.name} lohnt sich oft schon nach wenigen Jahren`,
      () => `Fenstertausch bedeutet mehr als neue Scheiben: Wir prüfen Laibung, Fensterbank und Rollladenkasten`,
      (c) => `Für den Fenstertausch im bestehenden Haus in ${c.name} empfehlen wir meist Kömmerling 76 (AD oder MD)`,
      (c) => `Wir tauschen Fenster in ${c.name} Raum für Raum, damit das Haus bewohnbar bleibt`,
      (c) => `Beim Fenstertausch in ${c.name} ist ein Raum in der Regel nach wenigen Stunden wieder nutzbar`,
      (c) => `Alte Fenster raus, neue rein, Fugen abgedichtet, Baustelle besenrein – so läuft der Fenstertausch in ${c.name}`,
      () => `Der Fenstertausch im Bestand verlangt schlanke Rahmen, die in vorhandene Öffnungen passen`,
      (c) => `Wer in ${c.name} Fenster aus den 1980er- oder 1990er-Jahren hat, gewinnt mit Dreifachglas spürbar Wärmeschutz`,
      (c) => `Den Fenstertausch planen wir in ${c.name} so, dass Sie während der Arbeiten im Haus bleiben können`,
      (c) => `Beim Austausch alter Fenster in ${c.name} achten wir auf den Anschluss an Putz, Dämmung und Rollladenführung`,
      (c) => `Ein Fenstertausch ist in ${c.name} meist an einem oder wenigen Tagen erledigt – je nach Anzahl der Elemente`,
      (c) => `Fenstertausch heißt bei uns in ${c.name}: Demontage, Montage, Abdichtung und Entsorgung aus einer Hand`,
    ],
    B: [
      () => ` – die Altelemente nehmen wir mit und entsorgen sie fachgerecht`,
      () => `; morgens Ausbau, mittags Einbau und Abdichtung, abends ist alles dicht`,
      () => ` – montiert nach RAL-Richtlinien, übergeben besenrein`,
      () => `; Dreifachglas sorgt dabei für spürbar weniger Wärmeverlust`,
      () => ` – wir decken Böden ab und arbeiten Raum für Raum`,
      () => `; die Fuge wird innen dampfdicht und außen schlagregendicht ausgeführt`,
      () => ` – kleinere Putzausbesserungen und Fensterbänke gehören dazu`,
      (c) => `; so bleibt Ihr Haus in ${c.name} während der Arbeiten bewohnbar`,
      () => ` – Kömmerling 76 mit schlanken Ansichten passt in die meisten vorhandenen Öffnungen`,
      () => `; welche Bautiefe passt, prüfen wir beim kostenlosen Aufmaß`,
      () => ` – inklusive Einstellen der Beschläge und Prüfung jedes Flügels`,
      () => `; das Angebot nennt Demontage, Montage und Entsorgung als eigene Positionen`,
      () => ` – und am Ende gehen wir alle Fenster gemeinsam durch`,
      () => `; Rollladenkästen und Fensterbänke prüfen wir gleich mit`,
    ],
  },
  montage: {
    A: [
      (c) => `Unsere Monteure setzen in ${c.name} jedes Element lot- und waagerecht, verschrauben es fachgerecht und dichten ab`,
      (c) => `Die Fenstermontage in ${c.name} übernimmt unser eigenes Team – kein Subunternehmer, den Sie nicht kennen`,
      () => `Gute Fenster brauchen eine gute Montage: Erst Abdichtung, Fugendämmung und saubere Anschlüsse machen ein Fenster dicht`,
      (c) => `Montage heißt bei uns in ${c.name}: Befestigung im Mauerwerk, dreistufige Fugenabdichtung, Einstellen der Beschläge`,
      (c) => `Unser Montageteam kommt nach ${c.name} mit allem, was es braucht – Dichtbänder, Montageschaum, Fensterbänke, Werkzeug`,
      (c) => `Wir montieren in ${c.name} nach RAL-Montagerichtlinien – innen dampfdicht, außen schlagregendicht`,
      (c) => `Eine saubere Baustelle am Abend ist in ${c.name} für uns Teil der Montage`,
      () => `Das beste Profil nützt wenig, wenn die Montagefuge undicht bleibt`,
      (c) => `Bei der Fenstermontage in ${c.name} prüfen wir am Ende jeden Flügel auf Gang, Dichtheit und Schließdruck`,
      (c) => `Fensterbänke, Rollladenanschlüsse und kleinere Putzausbesserungen erledigen wir in ${c.name} in einem Zug`,
      (c) => `Unsere Monteure arbeiten in ${c.name} Raum für Raum und decken Böden und Möbel ab`,
      (c) => `Fachgerechte Montage in ${c.name} heißt für uns: Befestigung, Dämmung und Abdichtung als System, nicht nur Montageschaum`,
      (c) => `Mit der Montage durch unser Team bekommen Sie in ${c.name} Fenster und Einbau aus einer Hand – und einen Ansprechpartner für beides`,
    ],
    B: [
      () => ` – Fensterbänke, Anschlussarbeiten und kleinere Putzausbesserungen gehören dazu`,
      () => `; wir decken Böden ab, arbeiten Raum für Raum und nehmen den Bauschutt mit`,
      () => ` – genau so arbeiten wir, nach RAL-Montagerichtlinien`,
      () => `; auch Fensterbänke und Rollladenanschlüsse erledigen wir in einem Zug`,
      () => ` – mit dem Anspruch, am Abend eine saubere Baustelle zu hinterlassen`,
      () => `; am Ende stellen wir die Beschläge ein und prüfen jeden Flügel`,
      () => ` – dieselben Monteure, die Sie schon vom Aufmaß kennen`,
      () => `; die Fuge wird dreistufig abgedichtet: innen dicht, mittig gedämmt, außen schlagregendicht`,
      () => ` – damit aus einem guten Fenster ein dauerhaft dichtes Fenster wird`,
      () => `; Demontage und Entsorgung der alten Elemente sind Teil des Auftrags`,
      () => ` – zum Schluss gehen wir die Montage gemeinsam mit Ihnen durch`,
      () => `; so sitzt jedes Element lot- und waagerecht und schließt sauber`,
      () => ` – kein Subunternehmer, sondern unser eigenes Team`,
      () => `; Werkzeug, Dichtbänder und Fensterbänke haben wir dabei`,
    ],
  },
  kunststoff: {
    A: [
      () => `Unsere Kunststofffenster werden mit Kömmerling-Profilen gefertigt: 70 und 76 mm für Sanierung und Fenstertausch, 88 mm für Neubau und Energiesparhaus`,
      () => `Kunststofffenster sind die meistgewählte Lösung beim Fenstertausch: gute Dämmung, kein Streichen, faire Preise`,
      () => `Kömmerling-Profile gibt es in vier Bautiefen, auf Wunsch außen mit Aluminium-Deckschale (AluClip) in RAL-Farbe`,
      (c) => `Weiß, Anthrazit, Golden Oak oder zweifarbig: Kunststofffenster mit Kömmerling-Profilen passen sich der Fassade in ${c.name} an`,
      () => `Anschlag- oder Mitteldichtung, fünf, sechs oder sieben Kammern – hinter Kömmerling 70, 76 AD, 76 MD und 88 stecken klare Unterschiede`,
      (c) => `Für Häuser in ${c.name} mit Energieziel empfehlen wir Kömmerling 76 MD oder 88 mit Dreifachglas`,
      () => `Kunststofffenster von Kömmerling sind pflegeleicht, in vielen Dekoren erhältlich und bis RC2 einbruchhemmend ausführbar`,
      () => `Kömmerling 88 mit sieben Kammern erreicht Werte, die auch für Förderprogramme interessant sind`,
      (c) => `Mit Kömmerling 76 MD erhalten Sie in ${c.name} eine Mitteldichtung und sehr gute Dämmwerte bei schlanker Ansicht`,
      (c) => `Kunststofffenster für ${c.name} liefern wir in Weiß, in Dekorfolien wie Eichenoptik oder Anthrazit und zweifarbig innen/außen`,
      () => `Das Kömmerling-Programm reicht vom wirtschaftlichen 70-mm-Profil bis zum 88-mm-System auf Passivhaus-Niveau`,
      () => `Beim Kunststofffenster entscheidet das Profil über Dämmung, Stabilität und Preis`,
      () => `Kunststofffenster mit Kömmerling-Kern und Aluminium-Deckschale (AluClip) verbinden Dämmung mit moderner Optik`,
    ],
    B: [
      () => ` – pflegeleicht, viele Dekore, Einbruchschutz bis RC2`,
      (c) => `; welche Bautiefe für Ihr Haus in ${c.name} sinnvoll ist, klären wir beim Aufmaß`,
      (c) => ` – wir erklären Ihnen die Unterschiede in ${c.name} am Muster`,
      () => `; mit Dreifachglas erreichen Sie Werte, die auch für Förderprogramme interessant sind`,
      () => ` – gefertigt von unserem Partner Helios nach Ihrem Aufmaß`,
      (c) => `; so verbinden Sie in ${c.name} Kunststoff-Dämmung mit moderner Optik`,
      () => ` – ohne Streichen und ohne besondere Pflege`,
      () => `; Anschlag- oder Mitteldichtung wählen wir passend zu Haus und Budget`,
      (c) => ` – Farben und Dekore zeigen wir Ihnen in ${c.name} an Originalmustern`,
      () => `; Sicherheitsbeschläge und abschließbare Griffe sind auf Wunsch dabei`,
      () => ` – vom Fenstertausch im Altbau bis zum Energiesparhaus`,
      () => `; wir empfehlen das Profil, das zu Ihrem Haus passt, nicht das teuerste`,
      () => ` – mehr Kammern und mehr Bautiefe bedeuten bessere Dämmung`,
      () => `; die passende Verglasung legen wir gemeinsam fest`,
    ],
  },
  alu: {
    A: [
      (c) => `Für große Glasflächen, schmale Rahmen und moderne Architektur in ${c.name}: Aluminiumfenster mit thermisch getrennten Cortizo-Profilen`,
      () => `Aluminium ist formstabil und wartungsarm – ideal für raumhohe Elemente, Terrassentüren und Wintergärten`,
      (c) => `Wenn Fenster in ${c.name} besonders groß oder besonders schlank sein sollen, ist Aluminium die richtige Wahl`,
      (c) => `Aluminiumfenster sind die Wahl für Bauherren in ${c.name}, die klare Linien und dunkle Farben wollen`,
      (c) => `Für Gewerbe, Verwaltung oder große Wohnhäuser in ${c.name} liefern wir Aluminiumfenster, die auch bei Elementen von 1,6 × 2,6 m formstabil bleiben`,
      () => `Cortizo-Profile mit 35 mm thermischer Trennung und Dreifachglas sorgen beim Aluminiumfenster für die nötige Dämmung`,
      () => `Aluminiumfenster werden pulverbeschichtet in allen RAL-Farben geliefert – wetterfest und recyclingfähig`,
      (c) => `Mit Cortizo-Systemen in 60 und 70 mm Bautiefe realisieren wir in ${c.name} schlanke Ansichten bei großen Formaten`,
      (c) => `Dunkle Rahmen, schmale Profile, viel Glas: Aluminiumfenster passen zu moderner Architektur – auch in ${c.name}`,
      () => `Aluminium braucht keine Pflege und verzieht sich nicht, auch bei großen Flügeln nicht`,
      (c) => `Höherwertige Cortizo-Systeme bieten wir auf Anfrage an, auch in ${c.name}`,
      (c) => `Für Terrassenfronten und Festverglasungen in ${c.name} sind Aluminiumprofile von Cortizo oft die stabilste Lösung`,
      (c) => `Aluminiumfenster kombinieren wir in ${c.name} gern mit Kunststofffenstern im selben Farbton – außen einheitlich, innen wirtschaftlich`,
    ],
    B: [
      () => ` – pulverbeschichtet in allen RAL-Farben`,
      () => `; die thermische Trennung sorgt für zuverlässige Dämmung`,
      () => ` – die Oberfläche braucht keine Pflege`,
      (c) => `; wir zeigen Ihnen in ${c.name} Profilmuster und Farbkarten`,
      () => ` – 60 oder 70 mm Bautiefe, je nach Anforderung`,
      () => `; Dreifachglas gehört dazu, Sicherheitsausstattung nach Bedarf`,
      () => ` – wetterfest, formstabil, recyclingfähig`,
      () => `; gefertigt von unserem Partner Helios auf Cortizo-Basis`,
      () => ` – schlank im Rahmen, stabil im Flügel`,
      (c) => `; Beratung und Aufmaß erfolgen bei Ihnen vor Ort in ${c.name}`,
      () => ` – klare Linien, die zu moderner Architektur passen`,
      () => `; Terrassentüren und Festverglasungen planen wir im selben System`,
      () => ` – ideal, wenn Fenster groß, schlank und dunkel sein sollen`,
      () => `; die Farbe wählen Sie aus der RAL-Palette`,
    ],
  },
  haustuer: {
    A: [
      () => `Haustüren aus Kunststoff, Kunststoff-Aluminium oder Aluminium, mit Seitenteil und Oberlicht, Sicherheit bis RC2 und Füllungen nach Wunsch`,
      (c) => `Die Haustür ist das Erste, was man von Ihrem Haus in ${c.name} sieht`,
      () => `Von der wirtschaftlichen Nebeneingangstür bis zur flächenbündigen Premium-Haustür decken die Linien unseres Partners Helios alles ab`,
      (c) => `Ein Haustürtausch in ${c.name} ist meist an einem Tag erledigt: alte Tür raus, neue rein, Anschlüsse abgedichtet`,
      (c) => `Sicher und warm: Unsere Haustüren für ${c.name} verbinden Mehrfachverriegelung, Sicherheitsglas und gedämmte Füllungen`,
      (c) => `Eine neue Haustür in ${c.name} planen wir mit Ihnen: Füllung, Glas, Griff, Farbe, Seitenteil`,
      (c) => `Griffe aus Edelstahl, Füllungen in über 20 Designs, Farben passend zu den Fenstern – so individuell wird Ihre Haustür in ${c.name}`,
      () => `Moderne Haustüren dämmen wie ein gutes Fenster und schließen mit Mehrfachverriegelung`,
      (c) => `Ob flächenbündig in Anthrazit oder klassisch in Eichenoptik – die Haustür für Ihr Haus in ${c.name} wählen Sie aus vielen Linien`,
      (c) => `Barrierearme Schwelle, automatische Verriegelung, Seitenteil mit Glas: Komfort und Sicherheit gehören bei Haustüren für ${c.name} zusammen`,
      (c) => `Beim Haustürtausch in ${c.name} passen wir die Schwelle an, dichten die Anschlüsse ab und nehmen die alte Tür mit`,
      () => `Eine Haustür muss Wind, Wetter und ungebetenen Gästen standhalten – und dabei gut aussehen`,
      (c) => `Haustüren für ${c.name} fertigt unser Partner Helios nach Aufmaß, in Kunststoff, Kunststoff-Aluminium oder Aluminium`,
    ],
    B: [
      (c) => ` – wir montieren Ihre neue Haustür in ${c.name} inklusive Ausbau der alten`,
      (c) => `; Muster und Füllungsdesigns zeigen wir beim Termin in ${c.name}`,
      () => ` – auf Wunsch mit barrierearmer Schwelle und automatischer Verriegelung`,
      () => `; Mehrfachverriegelung und gedämmte Füllung sorgen für Sicherheit und Wärmeschutz`,
      () => ` – Griffe aus Edelstahl, Füllungen in über 20 Designs, Farben passend zu den Fenstern`,
      () => `; meist ist der Tausch an einem Tag erledigt`,
      () => ` – mit Seitenteil und Oberlicht, wenn der Eingang mehr Licht braucht`,
      () => `; Sicherheit bis RC2 ist möglich`,
      () => ` – gefertigt nach Aufmaß von unserem Partner Helios`,
      () => `; wir beraten Sie bei Ihnen zu Hause und messen die Öffnung genau auf`,
      () => ` – von der Nebeneingangstür bis zur flächenbündigen Premium-Tür`,
      () => `; Farbe und Dekor stimmen wir auf Ihre Fenster ab`,
      () => ` – die alte Tür nehmen wir mit und entsorgen sie fachgerecht`,
      () => `; Glas, Griff und Füllung wählen Sie am Muster`,
    ],
  },
  schiebe: {
    A: [
      () => `Hebe-Schiebetüren öffnen Wohnräume zum Garten – bis 6,5 m Breite, barrierearm und mit Dreifachglas`,
      (c) => `Mehr Licht, mehr Garten: Eine Schiebetür ersetzt in ${c.name} die klassische Terrassentür und braucht keinen Platz zum Aufschwenken`,
      () => `Ob zweiflügelige Terrassentür oder sechsflügelige Glasfront – Schiebesysteme planen wir passend zu Öffnung, Bodenaufbau und Rollladen`,
      () => `Eine Hebe-Schiebetür ist die großzügigste Verbindung zwischen Wohnraum und Garten`,
      () => `Schiebetüren laufen auf Edelstahlschienen, schließen dicht und lassen sich auch mit schweren Dreifachglas-Flügeln leicht bewegen`,
      (c) => `Aus Kunststoff (Versatil, Robust) oder Aluminium (Visuell): Hebe-Schiebetüren liefern wir in ${c.name} in beiden Werkstoffen`,
      (c) => `Wo heute eine zweiflügelige Terrassentür steht, passt in ${c.name} oft eine Hebe-Schiebetür mit deutlich mehr Glas`,
      (c) => `Für ${c.name} planen wir Hebe-Schiebetüren mit niedriger Schwelle, damit der Übergang zur Terrasse ohne Stufe gelingt`,
      () => `Große Glasflächen zum Garten brauchen stabile Profile und einen durchdachten Bodenanschluss`,
      (c) => `Eine Schiebetür verändert den Wohnraum in ${c.name} mehr als jedes andere Fensterelement: mehr Tageslicht, mehr Weite`,
      () => `Hebe-Schiebetüren aus Aluminium (Visuell) tragen besonders breite Flügel bei schlanker Ansicht`,
      () => `Mit der Hebe-Schiebe-Technik wird der Flügel zum Öffnen angehoben und gleitet dann leicht zur Seite`,
      (c) => `Terrassen- und Schiebetüren für ${c.name} fertigt unser Partner Helios nach Aufmaß – mit Dreifachglas und auf Wunsch barrierearmer Schwelle`,
    ],
    B: [
      (c) => ` – montiert von uns in ${c.name} inklusive Anschluss an Boden und Fassade`,
      () => `; wir beraten zu Bauart, Schwelle und Sonnenschutz`,
      (c) => ` – wir prüfen in ${c.name} Sturz, Bodenaufbau und Schwelle vor Ort`,
      () => `; welche Linie passt – Kunststoff oder Aluminium –, sagen wir Ihnen nach dem Aufmaß`,
      () => ` – bis 6,5 m Breite, mit Dreifachglas`,
      () => `; die Flügel laufen auf Edelstahlschienen und schließen dicht`,
      () => ` – Rollladen und Sonnenschutz planen wir gleich mit ein`,
      () => `; barrierearme Schwellen sind möglich`,
      () => ` – aus Kunststoff (Versatil, Robust) oder Aluminium (Visuell)`,
      () => `; gefertigt nach Aufmaß von unserem Partner Helios`,
      () => ` – auch als Ersatz für eine alte zweiflügelige Terrassentür`,
      (c) => `; Beratung und Aufmaß finden bei Ihnen in ${c.name} statt`,
      () => ` – für Neubau und Bestand gleichermaßen`,
      () => `; Öffnungsrichtung und Flügelzahl planen wir passend zum Raum`,
    ],
  },

  /* FAQ-Antworten */
  faqKommen: {
    hq: {
      A: [
        (c) => `Ja – ${c.name} liegt rund ${c.km} km von unserem Sitz in Ingolstadt entfernt und gehört zu unserem regulären Einsatzgebiet`,
        (c) => `Selbstverständlich, von Ingolstadt nach ${c.name} sind es etwa ${c.min} Minuten Fahrt`,
        (c) => `Ja, ${c.nameLk} liegt in unserem Kerngebiet um Ingolstadt`,
        (c) => `Natürlich – die Anfahrt nach ${c.name} dauert von Ingolstadt aus etwa ${c.min} Minuten`,
        (c) => `Ja, ${c.name} gehört fest zu den Orten, in denen wir beraten, aufmessen und montieren`,
        (c) => `Ja, und zwar regelmäßig: ${c.name} liegt rund ${c.km} km Luftlinie von unserem Firmensitz entfernt`,
        (c) => `Ja – mit etwa ${c.min} Fahrminuten ab Ingolstadt zählt ${c.name} zu unseren nahen Einsatzorten`,
        (c) => `Ja, ${c.name} (${c.lk}) liegt gut erreichbar in unserem Einsatzgebiet rund um Ingolstadt`,
        (c) => `Selbstverständlich kommen wir nach ${c.name} – rund ${c.km} km, etwa ${c.min} Minuten von Ingolstadt`,
        (c) => `Ja, für uns als Ingolstädter Betrieb ist ${c.name} ein ganz normaler Einsatzort`,
        (c) => `Ja – ${c.name} erreichen wir von unserem Sitz in Ingolstadt in etwa ${c.min} Minuten`,
        (c) => `Ja, ${c.name} liegt rund ${c.km} km von Ingolstadt und damit mitten in unserem Einsatzgebiet`,
        (c) => `Natürlich, ${c.nameLk} fahren wir regelmäßig an`,
      ],
      B: [
        () => `; Beratung, Aufmaß und Montage finden bei Ihnen vor Ort statt`,
        () => ` – wir beraten bei Ihnen zu Hause, messen auf und montieren mit unserem eigenen Team`,
        () => `; den Termin stimmen wir individuell mit Ihnen ab`,
        () => ` – Sie müssen nirgendwohin fahren, wir kommen zu Ihnen`,
        () => `; für Beratung und Aufmaß vereinbaren wir einen Termin bei Ihnen`,
        () => ` – Muster und Farbkarten bringen wir mit`,
        () => `; die Montage übernimmt dasselbe Team, das auch das Aufmaß macht`,
        () => ` – vom ersten Gespräch bis zur Abnahme sind wir bei Ihnen vor Ort`,
        () => `; Beratung und Aufmaß erledigen wir in einem Besuch`,
        () => ` – rufen Sie an oder schreiben Sie uns, wir schlagen Termine vor`,
        () => `; Anfahrt und Zeitplan organisieren wir, Sie nennen uns nur den Wunschtermin`,
        () => ` – Fenster, Haustüren und Schiebetüren inklusive Montage und Entsorgung`,
        () => `; wir kennen die Wege und planen die Montagetermine entsprechend`,
        () => ` – eine Anfahrtspauschale für Beratung und Aufmaß berechnen wir nicht`,
      ],
    },
    ka: {
      A: [
        (c) => `Ja – wir sind auch im Raum Karlsruhe für Sie im Einsatz; ${c.name} liegt rund ${c.km} km von Karlsruhe entfernt`,
        (c) => `Ja, ${c.name} gehört zu unserem Einsatzgebiet im Raum Karlsruhe (rund ${c.km} km von Karlsruhe); eine lokale Niederlassung haben wir dort nicht`,
        (c) => `Ja, ${c.nameLk} liegt in unserem Einsatzgebiet Raum Karlsruhe, das wir von Ingolstadt aus organisieren`,
        (c) => `Ja – unser Firmensitz ist Ingolstadt, aber auch ${c.name} und den Raum Karlsruhe bedienen wir`,
        (c) => `Ja, auch nach ${c.name} kommen wir – der Raum Karlsruhe ist unser zweites Einsatzgebiet neben Ingolstadt`,
        (c) => `Ja, ${c.name} (rund ${c.km} km von Karlsruhe, etwa ${c.min} Minuten) zählt zu den Orten, die wir im Raum Karlsruhe betreuen`,
        (c) => `Ja – im Raum Karlsruhe sind wir ebenso für Sie da wie rund um Ingolstadt, und ${c.name} gehört dazu`,
        (c) => `Selbstverständlich, ${c.nameLk} liegt in unserem Einsatzgebiet im Raum Karlsruhe`,
        (c) => `Ja, ${c.name} liegt etwa ${c.min} Fahrminuten von Karlsruhe und damit in der Region, die wir neben Ingolstadt betreuen`,
      ],
      B: [
        () => `; Beratung, Aufmaß und Montage finden bei Ihnen vor Ort statt`,
        () => ` – wir beraten bei Ihnen zu Hause, messen auf und montieren mit unserem eigenen Team`,
        () => `; den Termin stimmen wir individuell mit Ihnen ab`,
        () => ` – Sie müssen nirgendwohin fahren, wir kommen zu Ihnen`,
        () => `; für Beratung und Aufmaß vereinbaren wir einen Termin bei Ihnen`,
        () => ` – Muster und Farbkarten bringen wir mit`,
        () => `; die Montage übernimmt dasselbe Team, das auch das Aufmaß macht`,
        () => ` – vom ersten Gespräch bis zur Abnahme sind wir bei Ihnen vor Ort`,
        () => `; Beratung und Aufmaß erledigen wir in einem Besuch`,
        () => ` – rufen Sie an oder schreiben Sie uns, wir schlagen Termine vor`,
        () => ` – Fenster, Haustüren und Schiebetüren inklusive Montage und Entsorgung`,
        () => `; Anfahrt und Termin planen wir mit Ihnen gemeinsam`,
      ],
    },
  },
  faqTermin: {
    A: [
      () => `Das hängt von der aktuellen Auslastung und der Saison ab`,
      () => `Wir melden uns innerhalb von zwei Werktagen auf Ihre Anfrage`,
      () => `Einen festen Zeitraum versprechen wir nicht pauschal, weil er von der Auftragslage abhängt`,
      () => `Schreiben Sie uns kurz, worum es geht – Anzahl der Fenster, Haus oder Wohnung, gewünschter Zeitraum`,
      (c) => `Rufen Sie an oder schreiben Sie uns, dann nennen wir Ihnen den nächsten freien Termin in ${c.name}`,
      (c) => `Für ${c.name} schlagen wir Ihnen nach Ihrer Anfrage konkrete Termine vor`,
      () => `In der Regel finden wir zeitnah einen Termin, genaue Zusagen machen wir aber erst am Telefon`,
      () => `Wie schnell es geht, sagen wir Ihnen ehrlich – je nach Auftragslage`,
      (c) => `Ihre Anfrage beantworten wir innerhalb von zwei Werktagen mit einem Terminvorschlag für ${c.name}`,
      () => `Der Termin richtet sich nach unserer Auslastung und Ihrem Kalender`,
      (c) => `Nach Ihrer Anfrage rufen wir zurück und finden gemeinsam einen Termin in ${c.name}`,
      () => `Je nach Saison sind freie Termine unterschiedlich schnell verfügbar`,
      () => `Wir nennen Ihnen am Telefon den nächsten freien Termin und halten ihn verbindlich ein`,
    ],
    B: [
      () => `; Beratung und Aufmaß erledigen wir in einem Besuch`,
      () => ` – einen zugesagten Termin halten wir verbindlich ein`,
      () => `; Sie erreichen uns telefonisch oder über das Formular unten auf dieser Seite`,
      () => ` – je genauer Ihre Angaben, desto schneller können wir planen`,
      () => `; wir melden uns innerhalb von zwei Werktagen`,
      () => ` – wir bemühen uns, Ihren Wunschzeitraum zu berücksichtigen`,
      () => `; so bleibt für Sie alles planbar`,
      () => ` – ohne Pauschalversprechen, aber mit klarer Aussage`,
      () => `; beim Termin nehmen wir gleich alle Elemente auf`,
      () => ` – nennen Sie uns dabei am besten Anzahl der Fenster und gewünschten Zeitraum`,
      (c) => `; wir kommen zum vereinbarten Termin nach ${c.name}`,
      () => ` – lieber ein realistischer Termin als eine Zusage, die nicht hält`,
      () => `; das Aufmaß ist kostenlos und unverbindlich`,
      () => ` – und was wir zusagen, halten wir`,
    ],
  },
  faqKosten: {
    A: [
      () => `Der Preis hängt von Anzahl, Größe, Werkstoff, Verglasung und Ausstattung ab`,
      () => `Pauschalpreise gibt es bei uns nicht, weil jedes Fenster nach Maß gefertigt wird`,
      (c) => `Das Angebot entsteht nach dem kostenlosen Aufmaß in ${c.name}`,
      () => `Ein seriöser Preis braucht Maße: Erst nach dem Aufmaß können wir Profile, Glas und Montageaufwand genau kalkulieren`,
      () => `Die Kosten richten sich nach Profil, Glas, Farbe, Sicherheitsausstattung sowie Demontage, Montage und Entsorgung`,
      () => `Ohne Aufmaß wäre jede Zahl geraten – deshalb nennen wir den Preis im schriftlichen Angebot`,
      (c) => `Jedes Projekt in ${c.name} wird einzeln kalkuliert: Werkstoff, Größe, Verglasung, Montageaufwand`,
      (c) => `Der Preis für den Fenstertausch in ${c.name} ergibt sich aus den gewählten Profilen, der Verglasung und dem Aufwand vor Ort`,
      () => `Wir rechnen nach Aufmaß, nicht nach Pauschale`,
      () => `Was der Fenstertausch kostet, steht nach Beratung und Aufmaß schwarz auf weiß im Angebot`,
      () => `Größe, Anzahl, Profil, Glas und Ausstattung bestimmen den Preis – und die kennen wir erst nach dem Aufmaß`,
      () => `Ein Kunststofffenster mit Dreifachglas kostet weniger als ein Aluminiumfenster gleicher Größe; die genauen Zahlen liefert das Angebot`,
      (c) => `Den konkreten Preis für Ihr Haus in ${c.name} nennen wir Ihnen nach dem kostenlosen Aufmaß`,
    ],
    B: [
      () => ` – darin stehen alle Positionen, inklusive Demontage und Entsorgung`,
      () => `; versteckte Kosten gibt es nicht`,
      () => ` – schriftlich, verbindlich und kostenlos`,
      () => `; Beratung und Aufmaß kosten Sie nichts`,
      () => ` – jede Position ist nachvollziehbar aufgeführt`,
      () => `; so vergleichen Sie Varianten auf einer klaren Grundlage`,
      () => ` – auf Wunsch mit zwei oder drei Varianten zum Vergleich`,
      () => `; das Angebot bleibt unverbindlich, bis Sie es freigeben`,
      () => ` – inklusive Montage, Demontage und Entsorgung der alten Elemente`,
      () => `; Richtwerte nennen wir gern beim Beratungstermin`,
      () => ` – ohne Lockangebot und ohne Nachforderungen`,
      () => `; Fördermöglichkeiten sprechen wir dabei gleich mit an`,
      () => ` – damit Sie in Ruhe entscheiden können`,
      () => `; Werkstoff und Verglasung machen dabei den größten Unterschied`,
    ],
  },
  faqAlt: {
    A: [
      () => `Ja – Demontage und fachgerechte Entsorgung der alten Fenster und Türen gehören zu unserem Rundum-Service`,
      () => `Selbstverständlich, wir bauen die Altelemente aus, nehmen sie mit und entsorgen sie fachgerecht`,
      () => `Ja, das ist Teil des Auftrags: Ausbau, Abtransport und Entsorgung der alten Fenster übernehmen wir`,
      () => `Ja – Demontage und Entsorgung sind im Angebot enthalten`,
      (c) => `Natürlich, die alten Fenster und Türen aus ${c.name} nehmen wir am Montagetag direkt mit`,
      () => `Ja, Glas, Rahmen und Beschläge werden getrennt und fachgerecht entsorgt`,
      () => `Ja, Sie müssen nichts organisieren – Ausbau und Entsorgung sind bei uns Standard`,
      (c) => `Ja, die Altelemente verlassen Ihr Haus in ${c.name} mit unserem Montagefahrzeug`,
      () => `Ja, Demontage, Abtransport und Entsorgung gehören bei uns zu jedem Fenstertausch`,
      () => `Selbstverständlich – nach der Montage bleibt bei Ihnen kein altes Fenster zurück`,
      () => `Ja, auch die Entsorgung übernehmen wir, inklusive kleinerer Ausbesserungen an der Laibung`,
      () => `Ja, wir nehmen die alten Fenster mit und führen Glas, Rahmen und Metall getrennt der Entsorgung zu`,
      () => `Ja – das gehört für uns zum Auftrag wie Aufmaß und Montage`,
    ],
    B: [
      () => ` – Sie müssen sich um nichts kümmern`,
      () => `; die Baustelle übergeben wir besenrein`,
      () => ` – ebenso kleinere Ausbesserungen an der Laibung`,
      () => `; Sie müssen nichts organisieren`,
      () => ` – kein Container, kein Weg zum Wertstoffhof für Sie`,
      () => `; das steht so auch im Angebot`,
      () => ` – am Ende des Montagetags ist alles weg`,
      () => `; die Trennung von Glas, Rahmen und Beschlägen übernehmen wir`,
      () => ` – auch alte Rollläden oder Fensterbänke, wenn sie erneuert werden`,
      () => `; der Abtransport ist Teil der Montage`,
      () => ` – ohne Zusatzaufwand für Sie`,
      (c) => `; so bleibt Ihr Haus in ${c.name} nach dem Einbau sofort nutzbar`,
      () => ` – inklusive Bauschutt und Verpackungsmaterial`,
      () => `; das gilt für Fenster, Haustüren und Terrassentüren gleichermaßen`,
    ],
  },
  faqFoerderung: {
    A: [
      () => `Für energetische Sanierungen gibt es staatliche Programme, zum Beispiel über BAFA und KfW`,
      () => `Möglich ist das, wenn die neuen Fenster bestimmte Dämmwerte erreichen`,
      () => `Fördermöglichkeiten hängen vom Programm und Ihrem Vorhaben ab`,
      () => `Ob und wie viel gefördert wird, entscheidet das jeweilige Programm – nicht wir`,
      () => `Förderfähig sind in der Regel Fenster mit sehr guten Uw-Werten, etwa mit Dreifachglas`,
      () => `Staatliche Förderung für neue Fenster gibt es im Rahmen der energetischen Sanierung`,
      () => `Eine Förderung ist je nach Programm möglich, Beträge versprechen wir aber nicht`,
      () => `Wir informieren Sie über die aktuellen Möglichkeiten und die nötigen Unterlagen`,
      () => `Fördermittel beantragen Sie bzw. ein Energieberater – wir liefern die technischen Nachweise`,
      (c) => `Für Häuser in ${c.name} gelten dieselben Förderprogramme wie überall in Deutschland (z. B. BAFA, KfW)`,
      () => `Welche Fenster förderfähig sind, hängt von Uw-Wert und Programm ab`,
      () => `Die Förderlandschaft ändert sich regelmäßig; wir geben Ihnen beim Beratungstermin den aktuellen Stand`,
      () => `Ja, unter bestimmten Voraussetzungen – entscheidend sind die Dämmwerte der neuen Fenster und das gewählte Programm`,
    ],
    B: [
      () => `; den Antrag stellen Sie bzw. ein Energieberater`,
      () => ` – wir nennen Ihnen die zuständigen Stellen, ohne Beträge zu versprechen`,
      (c) => `; beim Beratungstermin in ${c.name} geben wir Ihnen einen Überblick`,
      () => ` – wir liefern die Unterlagen zu Uw-Werten und Einbau`,
      () => `; welche Profile und Verglasungen infrage kommen, sagen wir Ihnen`,
      () => ` – Kömmerling 76 MD oder 88 mit Dreifachglas erreichen Werte, die dafür interessant sind`,
      () => `; Beträge und Bedingungen legt das Programm fest, nicht wir`,
      () => ` – fragen Sie uns einfach beim Aufmaß danach`,
      () => `; die technischen Nachweise für den Antrag bekommen Sie von uns`,
      () => ` – wir beraten Sie, versprechen aber keine Fördersummen`,
      (c) => `; der Energieberater prüft, was für Ihr Haus in ${c.name} infrage kommt`,
      () => ` – ein Blick auf die aktuellen Programme lohnt sich vor der Bestellung`,
      () => `; wir sagen Ihnen, welche Unterlagen Sie brauchen`,
      () => ` – wichtig ist, den Antrag vor der Beauftragung zu stellen`,
    ],
  },
};

/* ---------- Auswahl: jede Kombination (A, B) eines Bausteins wird im Lauf nur einmal vergeben ---------- */
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const PRIMZAHLEN = [7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97];

/* Wörter, die in beiden Hälften stehen dürfen (Thema des Bausteins), alles andere ab 7 Buchstaben gilt als Wiederholung */
const ALLGEMEIN = new Set(["fenster", "fenstern", "haustür", "haustüren", "aufmaß", "montage", "beratung", "angebot", "ingolstadt", "karlsruhe", "kömmerling", "cortizo", "unserem", "unseren", "unserer", "unseres", "zwischen", "während", "deshalb", "außerdem", "ebenfalls", "einbauen", "eingebaut", "kunststoff", "aluminium"]);
function inhaltswoerter(text, c) {
  const ort = c.name.toLowerCase().split(/[^a-zäöüß]+/).filter(Boolean);
  return new Set(text.toLowerCase().split(/[^a-zäöüß]+/).filter((w) => w.length >= 7 && !ALLGEMEIN.has(w) && !ort.includes(w)));
}
function wiederholtInhalt(a, b, c) {
  if (a.includes(c.name) && b.includes(c.name)) return true; // Ortsname nicht zweimal im selben Satz
  const wa = [...inhaltswoerter(a, c)];
  for (const w of inhaltswoerter(b, c)) if (wa.some((x) => x === w || x.includes(w) || w.includes(x))) return true; // auch Teilwörter („Montagerichtlinien“ / „Richtlinien“)
  return false;
}
/* Verbindung der Hälften: B bringt ihr Satzzeichen mit; steht in A schon ein Gedankenstrich bzw. Semikolon, wird B
   mit dem jeweils anderen Zeichen angeschlossen (kein doppelter Gedankenstrich im Satz). */
function fuge(a, b) {
  if (b.startsWith(" – ") && a.includes(" – ")) return "; " + b.slice(3);
  if (b.startsWith("; ") && a.includes("; ")) return " – " + b.slice(2);
  return b;
}

class Baukasten {
  constructor() { this.vergeben = new Map(); } // Bausteinschlüssel → Set("a,b")
  static variante(slot, c) { return slot.A ? slot : c.hq ? slot.hq : slot.ka; }
  /* Liefert den ersten freien Satz des Bausteins, der laut `pruefung(text)` zulässig ist (z. B. kein Konflikt im
     Satzindex). Reihenfolge der Kombinationen: deterministisch aus Ort, Baustein und Seed. */
  satz(key, c, seed, pruefung) {
    const slot = SLOTS[key];
    const v = Baukasten.variante(slot, c);
    const vk = key + (slot.A ? "" : c.hq ? ":hq" : ":ka");
    const used = this.vergeben.get(vk) || new Set();
    const nA = v.A.length, nB = v.B.length, n = nA * nB;
    const h = hash(`${c.slug}|${key}|${seed}`);
    const start = h % n;
    const schritt = PRIMZAHLEN.filter((p) => n % p !== 0)[h % 7];
    let letzterGrund = "";
    /* Durchgang 1: nur Kombinationen, deren Hälften kein Inhaltswort wiederholen (liest sich besser);
       Durchgang 2 (Rückfall): auch solche. */
    for (const streng of [true, false]) {
      for (let k = 0; k < n; k++) {
        const idx = (start + k * schritt) % n;
        const a = Math.floor(idx / nB), b = idx % nB;
        const kombi = a + "," + b;
        if (used.has(kombi)) continue;
        const ta = v.A[a](c), tb = v.B[b](c);
        if (!ta || !tb) continue; // Hälfte für diesen Ort nicht verfügbar (z. B. Nähe-Aussage bei großer Entfernung)
        if (streng && wiederholtInhalt(ta, tb, c)) continue;
        const text = ta + fuge(ta, tb) + ".";
        if (pruefung) { const grund = pruefung(text); if (grund) { letzterGrund = grund; continue; } }
        return { text, key: vk, kombi };
      }
    }
    throw new Error(`Textbaustein „${key}“: keine freie Variante für ${c.slug} (${used.size}/${n} vergeben${letzterGrund ? "; zuletzt: " + letzterGrund : ""})`);
  }
  festlegen(picks) { for (const p of picks) { if (!this.vergeben.has(p.key)) this.vergeben.set(p.key, new Set()); this.vergeben.get(p.key).add(p.kombi); } }
}

module.exports = { KURZ, H2_BEDEUTET, H2_GEBAEUDE, H2_THEMEN, H2_ANFRAGE, H3, TOPIC_LINKS, ORDERS, FAQ_FRAGEN, NACHBARN, HQ, SLOTS, Baukasten, hash, wiederholtInhalt };
