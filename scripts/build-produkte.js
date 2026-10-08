#!/usr/bin/env node
/* Erzeugt die Produktseiten unter /produkte/ aus den Daten in diesem Skript.
   Aufruf: node scripts/build-produkte.js   (im Projektordner) */
"use strict";
const fs = require("fs");
const path = require("path");
const root = process.env.FW_ROOT ? path.resolve(process.env.FW_ROOT) : path.join(__dirname, ".."); // FW_ROOT: Tests bauen in einer Kopie
const firmaLib = require(path.join(root, "netlify/functions/_lib/firma"));
const produkteLib = require(path.join(root, "netlify/functions/_lib/produkte"));
const produkte = JSON.parse(fs.readFileSync(path.join(root, "data/produkte.json"), "utf8"));
const einst = JSON.parse(fs.readFileSync(path.join(root, "data/einstellungen.json"), "utf8"));
const ASSISTENT_TAG = require(path.join(__dirname, "assistent-tag.js")).tag(einst, "/", 3, 1);
const SITE = "https://fenster-weissenburger.de";
/* Partner- und Tabellenhinweis je Seite mit eigener Formulierung (Text-Duplikate zwischen Seiten vermeiden, scripts/text-duplikate.js) */
const PARTNER = {
  index: "Gefertigt von unserem Partner Helios mit Profilen von Kömmerling und Cortizo.",
  "kunststofffenster-koemmerling": "Gefertigt von unserem Partner Helios auf Basis der Kömmerling-Profile 70, 76 und 88.",
  "kunststoff-aluminium-fenster": "Unser Partner Helios fertigt die AluClip-Fenster mit Kömmerling-Kern und Aluminium-Deckschale nach Ihrem Aufmaß.",
  "aluminiumfenster-cortizo": "Gefertigt von unserem Partner Helios mit thermisch getrennten Cortizo-Systemen.",
  schiebetueren: "Hebe-Schiebetüren aus der Fertigung unseres Partners Helios – in Kunststoff oder Aluminium, nach Ihrem Aufmaß.",
  haustueren: "Unser Partner Helios fertigt jede Haustür nach Aufmaß – in Kunststoff, Kunststoff-Aluminium oder Aluminium.",
};
const NOTE = {
  index: "Herstellerangaben. Die Werte Ihres Fensters hängen von Größe, Verglasung und Ausstattung ab – wir berechnen sie im Angebot.",
  "kunststofffenster-koemmerling": "Herstellerangaben. Welchen Uw-Wert Ihr Fenster erreicht, hängt von Maß, Verglasung und Ausstattung ab – das Angebot nennt ihn genau.",
  "kunststoff-aluminium-fenster": "Herstellerangaben. Der Wert Ihres Fensters ergibt sich aus Größe, Glasaufbau und Ausstattung; wir weisen ihn im Angebot aus.",
  "aluminiumfenster-cortizo": "Herstellerangaben. Uf und Uw Ihres Aluminiumfensters richten sich nach Elementgröße, Verglasung und Ausführung – im Angebot stehen die konkreten Werte.",
  schiebetueren: "Herstellerangaben. Bei Schiebetüren bestimmen Flügelgröße, Glasaufbau und Schwelle die tatsächlichen Werte – wir rechnen sie für Ihr Angebot aus.",
  haustueren: "Herstellerangaben. Der Ud-Wert Ihrer Haustür hängt von Füllung, Glasanteil und Maß ab und wird für Ihr Angebot berechnet.",
};
/* Einleitung über dem Anfrageformular, je Seite anders formuliert */
const FORM_LEAD = {
  index: "Wir beraten Sie zu Hause, messen kostenlos auf und erstellen ein schriftliches Angebot.",
  "kunststofffenster-koemmerling": "Welches Kömmerling-Profil zu Ihrem Haus passt, klären wir bei Ihnen vor Ort – mit kostenlosem Aufmaß und schriftlichem Angebot.",
  "kunststoff-aluminium-fenster": "Sie möchten außen Aluminium und innen Kunststoff? Wir zeigen Ihnen die AluClip-Varianten bei Ihnen zu Hause, messen auf und schreiben Ihnen ein Angebot.",
  "aluminiumfenster-cortizo": "Für große Elemente und schlanke Profile beraten wir Sie direkt am Objekt, nehmen das Aufmaß und kalkulieren Ihr Aluminiumfenster schriftlich.",
  schiebetueren: "Ob Hebe-Schiebetür in Kunststoff oder Aluminium: Wir prüfen Öffnung, Sturz und Schwelle vor Ort und erstellen Ihnen ein Angebot nach Aufmaß.",
  haustueren: "Ihre neue Haustür planen wir bei Ihnen zu Hause – Füllung, Glas, Griff und Farbe am Muster, Aufmaß inklusive, Angebot schriftlich.",
};
const partnerSatz = (slug) => PARTNER[slug] || PARTNER.index;
const noteSatz = (slug) => NOTE[slug] || NOTE.index;

/* Logo aus index.html übernehmen (Inline-SVG, identisch auf allen Seiten) */
const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const ls = indexHtml.indexOf('      <span class="brand__box">');
const le = indexHtml.indexOf("</span>\n    </a>", ls) + "</span>".length;
const LOGO = indexHtml.slice(ls, le).trim();
if (!LOGO.includes("brand__svg")) throw new Error("Logo nicht gefunden");

const PRODUCTS = [
  { slug: "kunststofffenster-koemmerling", short: "Kunststofffenster", menu: "Kunststofffenster (Kömmerling)" },
  { slug: "kunststoff-aluminium-fenster", short: "Kunststoff-Aluminium-Fenster", menu: "Kunststoff-Aluminium-Fenster" },
  { slug: "aluminiumfenster-cortizo", short: "Aluminiumfenster", menu: "Aluminiumfenster (Cortizo)" },
  { slug: "schiebetueren", short: "Schiebetüren", menu: "Hebe-Schiebetüren" },
  { slug: "haustueren", short: "Haustüren", menu: "Haustüren" },
];

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "<").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const jsonStr = (s) => JSON.stringify(s);

function head(p) {
  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${esc(p.title)}</title>
  <meta name="description" content="${esc(p.description)}">
  <link rel="canonical" href="${SITE}${p.url}">
  <meta name="theme-color" content="#0B5ED7">
  <meta property="og:title" content="${esc(p.ogTitle || p.title)}">
  <meta property="og:description" content="${esc(p.description)}">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="de_DE">
  <meta property="og:url" content="${SITE}${p.url}">
  <meta property="og:image" content="${SITE}${p.image.src1200}">
  <meta property="og:image:alt" content="${esc(p.image.alt)}">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/assets/logo/apple-touch-icon.png">
  <link rel="preload" href="/assets/fonts/manrope-latin.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="/css/style.css?v=5">
  <link rel="stylesheet" href="/css/uebergang.css?v=2">
  <script src="/js/uebergang.js?v=2"></script>
  <link rel="stylesheet" href="/css/leistungen.css?v=2">
  <link rel="stylesheet" href="/css/produkte.css?v=1">
${p.jsonld.map((o) => `  <script type="application/ld+json">${JSON.stringify(o)}</script>`).join("\n")}
  <script type="application/ld+json" data-firma="jsonld">${JSON.stringify(Object.assign({ "@context": "https://schema.org" }, firmaLib.jsonLdFirma(einst, SITE)))}</script>
</head>`;
}

function navDrop(current) {
  return `<div class="nav__item">
        <a href="/#produkte"${current === "produkte" ? ' aria-current="page"' : ""}>Produkte</a>
        <div class="nav__drop" aria-label="Produkte">
          <a href="/produkte/">Alle Produkte</a>
${PRODUCTS.map((x) => `          <a href="/produkte/${x.slug}/"${current === x.slug ? ' aria-current="page"' : ""}>${x.menu}</a>`).join("\n")}
        </div>
      </div>`;
}

function header(current) {
  return `<body class="page lp pp">${firmaLib.bannerBlock(einst)}
  <a class="skip" href="#inhalt">Zum Inhalt springen</a>
  <header class="top">
    <a class="brand" href="/#home" aria-label="Fenster-WeissenBurger – Startseite">
      ${LOGO}
    </a>
    <nav class="nav nav--top" id="hauptnav" aria-label="Hauptnavigation">
      <a href="/#home">Home</a>
      ${navDrop(current)}
      <a href="/leistungen/">Leistungen</a>
      <a href="/referenzen/">Referenzen</a>
      <div class="nav__item nav__item--konf konf-link" hidden>
        <a href="/konfigurator/fenster/" aria-haspopup="true" aria-expanded="false">Konfigurator</a>
        <div class="nav__drop nav__drop--konf" aria-label="Konfigurator">
          <a href="/konfigurator/haustuer/"><img class="nav__thumb" src="/assets/img/menu/konfigurator-haustuer-80.webp" width="40" height="40" alt="Moderne Haustür in Anthrazit" loading="lazy" decoding="async"><span>Haustür konfigurieren</span></a>
          <a href="/konfigurator/fenster/"><img class="nav__thumb" src="/assets/img/menu/konfigurator-fenster-80.webp" width="40" height="40" alt="Einflügeliges Fenster in Anthrazit" loading="lazy" decoding="async"><span>Fenster konfigurieren</span></a>
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
  </header>
  <main id="inhalt">`;
}

function breadcrumb(items) {
  return `<nav class="crumbs wrap" aria-label="Brotkrumen"><ol>${items
    .map((it, i) => (i === items.length - 1 ? `<li aria-current="page">${esc(it.name)}</li>` : `<li><a href="${it.url}">${esc(it.name)}</a></li>`))
    .join("")}</ol></nav>`;
}

function hero(p) {
  return `<section class="phero" aria-labelledby="h1">
      <div class="wrap phero__grid">
        <div class="phero__text">
          <p class="eyebrow"><span>${esc(p.eyebrowNo)}</span> ${esc(p.eyebrow)}</p>
          <h1 class="title" id="h1">${p.h1}</h1>
          <p class="lead">${p.intro}</p>
          <p class="partner">${partnerSatz(p.slug)}</p>
          <div class="actions">
            <a class="btn btn--primary" href="#anfrage">Kostenloses Aufmaß anfragen</a>
            <a class="btn btn--ghost" href="${firmaLib.telHref(einst.firma.telefon)}" data-firma="tel-href">Anrufen</a>
            <a class="btn btn--ghost konf-link" href="${p.slug === "haustueren" ? "/konfigurator/haustuer/" : "/konfigurator/fenster/"}" hidden>Online konfigurieren</a>
          </div>
        </div>
        <figure class="phero__fig">
          <img src="${p.image.src640}" srcset="${p.image.src640} 640w, ${p.image.src1200} ${p.image.w1200}w" sizes="(min-width: 900px) 40vw, 92vw" width="${p.image.w}" height="${p.image.h}" alt="${esc(p.image.alt)}" fetchpriority="high" decoding="async">
        </figure>
      </div>
    </section>`;
}

function checks(items) {
  return `<ul class="checks">${items.map((t) => `<li>${t}</li>`).join("")}</ul>`;
}

function table(t) {
  return `<div class="tbl-wrap"><table class="tbl">
          <caption>${esc(t.caption)}</caption>
          <thead><tr>${t.head.map((h) => `<th scope="col">${esc(h)}</th>`).join("")}</tr></thead>
          <tbody>${t.rows.map((r) => `<tr>${r.map((c, i) => (i === 0 ? `<th scope="row">${c}</th>` : `<td>${c}</td>`)).join("")}</tr>`).join("")}</tbody>
        </table></div>`;
}

/* Ratgeber „Fachbegriffe kurz erklärt“: je Produktseite die passenden Begriffe mit eigener Erklärung
   (keine Seite wiederholt den Text einer anderen – geprüft von scripts/text-duplikate.js). */
const RATGEBER = {
  index: [
    ["Uf / Ug / Uw / Ud", "Wärmedurchgang des Rahmens (f), des Glases (g), des ganzen Fensters (w) bzw. der ganzen Tür (d) in W/(m²K). Je kleiner der Wert, desto besser die Dämmung."],
    ["Bautiefe", "Tiefe des Rahmens in Millimetern. Mehr Bautiefe bedeutet meist bessere Dämmung und Platz für dickere Verglasung."],
    ["Kammern", "Hohlräume im Kunststoffprofil. Sie trennen innen und außen thermisch – mehr Kammern, bessere Dämmung."],
    ["AD / MD", "AD = Anschlagdichtung mit zwei Dichtungsebenen, bewährt und wirtschaftlich. MD = zusätzliche Mitteldichtung für bessere Dämmung und Dichtheit, empfehlenswert bei Neubau und Energiesparhaus."],
    ["RC1 / RC2", "Widerstandsklassen gegen Einbruch nach DIN EN 1627. RC2 ist der empfohlene Standard für Wohnhäuser."],
    ["Förderung", "Energetische Sanierung wird staatlich gefördert (z. B. BAFA, KfW); welche Fenster dafür infrage kommen und welche Nachweise Sie brauchen, besprechen wir beim Beratungstermin."],
  ],
  "kunststofffenster-koemmerling": [
    ["Uf / Uw", "Uf beschreibt den Wärmedurchgang des Rahmens, Uw den des kompletten Fensters samt Glas – angegeben in W/(m²K), niedriger ist besser."],
    ["Bautiefe", "Die Tiefe des Profils in Millimetern: 70, 76 oder 88 mm bei Kömmerling. Tiefere Profile dämmen besser und nehmen dickere Gläser auf."],
    ["Kammern", "Luftgefüllte Hohlräume im Profilquerschnitt, die den Wärmefluss von innen nach außen bremsen – Kömmerling 88 hat sieben davon."],
    ["AD / MD", "Die Anschlagdichtung (AD) arbeitet mit zwei Dichtungsebenen; die Mitteldichtung (MD) ergänzt eine dritte in der Profilmitte und verbessert Wärmeschutz und Schlagregendichtheit."],
    ["RC2", "Widerstandsklasse nach DIN EN 1627: Pilzkopfzapfen, abschließbarer Griff und Sicherheitsglas halten Gelegenheitseinbrecher mit einfachem Werkzeug ab."],
    ["Förderung", "Programme von BAFA und KfW unterstützen die energetische Sanierung; wir stellen Ihnen die Nachweise zu den Uw-Werten zusammen, den Antrag stellen Sie oder ein Energieberater."],
  ],
  "kunststoff-aluminium-fenster": [
    ["AluClip", "Eine Aluminium-Deckschale, die außen auf das Kunststoffprofil geklipst wird – innen bleibt der pflegeleichte Kunststoff, außen entsteht die Optik eines Aluminiumfensters."],
    ["Flächenbündig", "Bei den Pro-Varianten liegen Rahmen und Flügel außen in einer Ebene – ein glattes, modernes Fensterbild ohne vorspringenden Flügel."],
    ["RAL-Farbe", "Die Aluminiumschale wird pulverbeschichtet; so lässt sich die Außenseite in jeder RAL-Farbe gestalten, innen bleibt Weiß oder ein Dekor."],
    ["Uf-Wert", "Der Wärmedurchgang des Rahmens in W/(m²K) – die Werte der AluClip-Profile stehen in der Tabelle oben, den Uw-Wert Ihres Fensters berechnen wir im Angebot."],
    ["Mitteldichtung", "Eine dritte Dichtungsebene in der Profilmitte, die Dichtheit und Wärmeschutz verbessert – die Tabelle oben zeigt, welche AluClip-Variante sie hat."],
    ["Förderung", "Auch Kunststoff-Aluminium-Fenster können bei einer energetischen Sanierung gefördert werden (z. B. BAFA, KfW); maßgeblich ist der Uw-Wert, die Nachweise liefern wir."],
  ],
  "aluminiumfenster-cortizo": [
    ["Thermische Trennung", "Ein Kunststoffsteg zwischen Innen- und Außenschale unterbricht den Wärmefluss durch das Metall – bei Cortizo 35 mm breit, und je breiter, desto besser die Dämmung."],
    ["Uf / Uw", "Rahmen- und Fensterwert in W/(m²K); bei Aluminium hängt der Uf-Wert vor allem von der Breite der thermischen Trennung ab."],
    ["Pulverbeschichtung", "Farbpulver wird elektrostatisch aufgetragen und eingebrannt – eine harte, wetterfeste Oberfläche in jeder RAL-Farbe, die nie gestrichen werden muss."],
    ["Bautiefe", "Bei Cortizo 60 oder 70 mm; das tiefere System nimmt dickere Gläser auf und erreicht die besseren Dämmwerte."],
    ["Formstabilität", "Aluminium verzieht sich auch bei großen Flügeln nicht – darum eignet es sich für Elemente bis 1,6 × 2,6 m und raumhohe Verglasungen."],
    ["Förderung", "Aluminiumfenster mit Dreifachglas können in Förderprogrammen wie BAFA oder KfW berücksichtigt werden – entscheidend ist der Uw-Wert des Elements, den wir Ihnen ausweisen."],
  ],
  schiebetueren: [
    ["Hebe-Schiebetür", "Zum Öffnen wird der Flügel über den Griff angehoben und gleitet dann auf Rollen zur Seite; abgesenkt presst er sich fest in die Dichtungen."],
    ["Barrierearme Schwelle", "Eine flache Schwelle am Übergang zur Terrasse – ohne hohe Stufe, bequem auch mit Kinderwagen oder Rollator."],
    ["Uw-Wert", "Der Wärmedurchgang der gesamten Schiebetür in W/(m²K); bei großen Glasflächen zählt vor allem das Glas, deshalb empfehlen wir Dreifachverglasung."],
    ["Flügelbreite", "Hebe-Schiebetüren sind bis 6,5 m Gesamtbreite möglich; wie breit ein einzelner Flügel werden darf, hängt vom Werkstoff und vom Glasgewicht ab."],
    ["Sonnenschutz", "Rollladen oder außenliegender Sonnenschutz werden bei Schiebetüren am besten gleich mitgeplant, damit Kasten und Führungen passen."],
    ["Förderung", "Terrassen- und Schiebetüren zählen bei der energetischen Sanierung zu den Fenstern; mit Dreifachglas können sie in Programmen wie BAFA oder KfW berücksichtigt werden."],
  ],
  haustueren: [
    ["Ud-Wert", "Der Wärmedurchgang der kompletten Haustür in W/(m²K) – je kleiner, desto weniger Wärme geht über die Tür verloren."],
    ["Mehrfachverriegelung", "Mehrere Riegel und Schwenkhaken schließen beim Abschließen gleichzeitig über die ganze Türhöhe – das erschwert das Aufhebeln deutlich."],
    ["RC2", "Widerstandsklasse nach DIN EN 1627; eine RC2-Haustür kombiniert geprüftes Türblatt, Verriegelung, Sicherheitsglas und Schutzbeschlag."],
    ["Automatische Verriegelung", "Die Tür verriegelt beim Zuziehen von selbst, ohne Schlüsseldrehen – praktisch mit vollen Händen und sicherer als eine nur ins Schloss gefallene Tür."],
    ["Förderung", "Auch der Haustürtausch kann als Teil einer energetischen Sanierung gefördert werden (z. B. BAFA, KfW) – maßgeblich ist der Ud-Wert der neuen Tür."],
  ],
};
function ratgeber(slug, extra) {
  const items = (RATGEBER[slug] || RATGEBER.index).concat(extra || []);
  return `<aside class="ratgeber" aria-labelledby="ratgeber-title">
        <p class="eyebrow"><span>?</span> Ratgeber</p>
        <h2 class="h3" id="ratgeber-title">Fachbegriffe kurz erklärt</h2>
        <dl>${items.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join("")}</dl>
      </aside>`;
}

function faq(items) {
  return `<div class="faq">${items.map((q) => `<details><summary>${esc(q.q)}</summary><p>${q.a}</p></details>`).join("")}</div>`;
}
function faqJsonLd(items) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((q) => ({ "@type": "Question", name: q.q, acceptedAnswer: { "@type": "Answer", text: q.a.replace(/<[^>]+>/g, "") } })),
  };
}
function breadcrumbJsonLd(items) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: SITE + it.url })),
  };
}
function productJsonLd(p) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.productName,
    description: p.description,
    image: SITE + p.image.src1200,
    category: p.category,
    brand: p.brand ? { "@type": "Brand", name: p.brand } : undefined,
    url: SITE + p.url,
    offers: {
      "@type": "Offer",
      availability: "https://schema.org/InStock",
      priceCurrency: "EUR",
      price: "0",
      priceSpecification: { "@type": "PriceSpecification", priceCurrency: "EUR", description: "Preis auf Anfrage – individuelles Angebot nach kostenlosem Aufmaß" },
      seller: { "@type": "LocalBusiness", name: firmaLib.vollerName(einst), url: SITE + "/" },
    },
  };
}

function form(p) {
  const opts = [
    "Kunststofffenster (Kömmerling)",
    "Kunststoff-Aluminium-Fenster (AluClip)",
    "Aluminiumfenster (Cortizo)",
    "Hebe-Schiebetür",
    "Haustür",
    "Beratung – noch unentschieden",
  ];
  return `<section class="sec sec--alt" id="anfrage" aria-labelledby="anfrage-title">
      <div class="wrap two two--form">
        <div>
          <p class="eyebrow"><span>→</span> Anfrage</p>
          <h2 class="h2" id="anfrage-title">Kostenloses Aufmaß <em>anfragen.</em></h2>
          <p class="lead lead--sm">${FORM_LEAD[p.slug] || FORM_LEAD.index} Wir melden uns innerhalb von zwei Werktagen.</p>
          ${firmaLib.kontaktKarteHtml(einst)}
          <p class="more-links"><a href="/produkte/">Alle Produkte</a> · <a href="/leistungen/">Unsere Leistungen: Beratung, Aufmaß, Montage</a></p>
        </div>
        <form class="form" name="anfrage-produkte" method="POST" action="/danke.html" data-netlify="true" netlify-honeypot="bot-field" novalidate>
          <input type="hidden" name="form-name" value="anfrage-produkte">
          <p class="hp"><label>Bitte leer lassen: <input name="bot-field" tabindex="-1" autocomplete="off"></label></p>
          <div class="form__row">
            <label for="f-produkt">Produkt</label>
            <select id="f-produkt" name="produkt">
${opts.map((o) => `              <option${o === p.formValue ? " selected" : ""}>${esc(o)}</option>`).join("\n")}
            </select>
          </div>
          <div class="form__row">
            <label for="f-name">Name *</label>
            <input id="f-name" name="name" type="text" required autocomplete="name">
          </div>
          <div class="form__grid form__grid--kontakt">
            <div class="form__row">
              <label for="f-tel">Telefon</label>
              <input id="f-tel" name="telefon" type="tel" autocomplete="tel" inputmode="tel">
            </div>
            <div class="form__row">
              <label for="f-mail">E-Mail</label>
              <input id="f-mail" name="email" type="email" autocomplete="email" inputmode="email">
            </div>
          </div>
          <p class="form__hint">Telefon oder E-Mail – mindestens eine Angabe, damit wir uns bei Ihnen melden können.</p>
          <div class="form__row">
            <label for="f-plz">PLZ *</label>
            <input id="f-plz" name="plz" type="text" required inputmode="numeric" pattern="[0-9]{5}" maxlength="5" autocomplete="postal-code">
          </div>
          <div class="form__row">
            <label for="f-anzahl">Anzahl Elemente</label>
            <select id="f-anzahl" name="anzahl-fenster">
              <option value="">Bitte wählen</option>
              <option>1–3</option>
              <option>4–8</option>
              <option>9–15</option>
              <option>mehr als 15</option>
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

function otherProducts(current) {
  return `<section class="sec" aria-labelledby="weitere-title">
      <div class="wrap">
        <p class="eyebrow"><span>+</span> Weitere Produkte</p>
        <h2 class="h2" id="weitere-title">Das passt <em>dazu.</em></h2>
        <ul class="plinks">
          <li><a href="/produkte/">Alle Produkte im Überblick</a></li>
${PRODUCTS.filter((x) => x.slug !== current).map((x) => `          <li><a href="/produkte/${x.slug}/">${x.menu}</a></li>`).join("\n")}
          <li><a href="/leistungen/">Leistungen: Beratung, Aufmaß, Montage</a></li>
        </ul>
      </div>
    </section>`;
}

function footer() {
  return `<footer class="legal wrap">
  <nav class="legal__nav" aria-label="Seiten"><a href="/#home">Startseite</a><a href="/produkte/">Produkte</a><a href="/leistungen/">Leistungen</a><a href="/referenzen/">Referenzen</a><a href="/einsatzgebiet/">Einsatzgebiet</a><a class="konf-link" href="/konfigurator/fenster/" hidden>Konfigurator</a></nav>
  <nav class="legal__recht" aria-label="Rechtliches"><a href="/impressum.html">Impressum</a><a href="/datenschutz.html">Datenschutzerklärung</a><a href="/cookies.html">Cookie-Richtlinie</a></nav>
  <p class="legal__copy">© <span id="year">2026</span> <span data-firma="name">${firmaLib.esc(firmaLib.vollerName(einst))}</span></p>
</footer>
  </main>
  <div class="ctabar" aria-label="Schnellkontakt">
    <a class="btn btn--ghost" href="${firmaLib.telHref(einst.firma.telefon)}" data-firma="tel-href">Anrufen</a>
    <a class="btn btn--primary" href="#anfrage">Anfrage</a>
  </div>
  <script src="/js/config.js?v=1" defer></script>
  <script src="/js/main.js?v=3" defer></script>
  ${ASSISTENT_TAG}
</body>
</html>
`;
}

/* ------------------------------------------------------------------ */
/* Seiteninhalte                                                        */
/* ------------------------------------------------------------------ */

const IMG = {
  kunststoff: { src640: "/assets/img/kunststofffenster-464.webp", src1200: "/assets/img/kunststofffenster-928.webp", w1200: 928, w: 928, h: 1152, alt: "Profilschnitt eines Kunststofffensters in Anthrazit mit Dreifachverglasung" },
  alu: { src640: "/assets/img/aluminiumfenster-464.webp", src1200: "/assets/img/aluminiumfenster-928.webp", w1200: 928, w: 928, h: 1152, alt: "Aluminiumfenster mit schmalem schwarzem Rahmen" },
  haustuer: { src640: "/assets/img/leistungen/haustuere-modern-eichenoptik-640.webp", src1200: "/assets/img/leistungen/haustuere-modern-eichenoptik-1200.webp", w1200: 635, w: 635, h: 996, alt: "Moderne Haustür in Eichenoptik mit Edelstahl-Stangengriff, von uns montiert" },
  kunstalu: { src640: "/assets/konfigurator/profil-76-aluclip-400.webp", src1200: "/assets/konfigurator/profil-76-aluclip-800.webp", w1200: 800, w: 800, h: 800, alt: "Profilschnitt Kunststoff-Aluminium-Fenster Kömmerling 76 AluClip mit Aluminium-Deckschale außen" },
  schiebe: { src640: "/assets/img/leistungen/kunststofftueren-doppelt-einbau-640.webp", src1200: "/assets/img/leistungen/kunststofftueren-doppelt-einbau-1200.webp", w1200: 787, w: 787, h: 866, alt: "Zweiflügelige Kunststofftür in Eichenoptik zur Terrasse, von uns eingebaut" },
  montage: { src640: "/assets/img/leistungen/kunststofffenster-braun-montage-rohbau-640.webp", src1200: "/assets/img/leistungen/kunststofffenster-braun-montage-rohbau-1200.webp", w1200: 1056, w: 1056, h: 722, alt: "Neu montierte Kunststofffenster in Eichenoptik in einem Rohbau" },
};

const pages = [];

/* ---------- Kunststofffenster (Kömmerling) ---------- */
{
  const faqs = [
    { q: "Was bedeuten Uf und Uw?", a: "Uf ist der Wärmedurchgang des Rahmens, Uw der des gesamten Fensters inklusive Glas. Beide werden in W/(m²K) angegeben – je kleiner, desto besser dämmt das Fenster. Für Ihr Angebot berechnen wir den Uw-Wert aus Profil, Verglasung und Größe." },
    { q: "AD oder MD – was brauche ich?", a: "Bei der Anschlagdichtung (AD) dichten zwei Dichtungsebenen – bewährt und wirtschaftlich, ideal für Sanierung und Fenstertausch. Die Mitteldichtung (MD) ergänzt eine dritte Dichtung in der Profilmitte und verbessert Wärmedämmung und Schlagregendichtheit. Für Neubau und Energiesparhäuser empfehlen wir MD." },
    { q: "Gibt es die Fenster auch farbig?", a: "Ja. Neben Weiß sind Dekore (z. B. Golden Oak in Eichenoptik, Anthrazit, Mahagoni), Grautöne und zweifarbige Ausführungen möglich – innen weiß, außen farbig. Bei den AluClip-Varianten ist die Außenseite aus Aluminium in RAL-Farben." },
    { q: "Kann ich Einbruchschutz nachrüsten?", a: "Sicherheitsbeschläge mit Pilzkopfzapfen, abschließbare Griffe und Sicherheitsglas lassen sich bei neuen Fenstern direkt mitbestellen; bei vielen bestehenden Fenstern ist eine Nachrüstung der Beschläge möglich. Wir beraten Sie vor Ort, welche Widerstandsklasse (RC1/RC2) für Ihr Haus sinnvoll ist." },
  ];
  const crumbs = [{ name: "Start", url: "/" }, { name: "Produkte", url: "/produkte/" }, { name: "Kunststofffenster", url: "/produkte/kunststofffenster-koemmerling/" }];
  const p = {
    slug: "kunststofffenster-koemmerling",
    url: "/produkte/kunststofffenster-koemmerling/",
    title: "Kunststofffenster mit Kömmerling-Profilen – Ingolstadt | Fenster-WeissenBurger",
    ogTitle: "Kunststofffenster mit Kömmerling-Profilen – gefertigt von Helios",
    description: "Kunststofffenster mit Kömmerling-Profilen 70, 76 AD/MD und 88 sowie Kunststoff-Aluminium-Fenster (AluClip). Beratung, kostenloses Aufmaß und Montage in Ingolstadt.",
    image: IMG.kunststoff,
    productName: "Kunststofffenster mit Kömmerling-Profilen",
    category: "Kunststofffenster",
    brand: "Kömmerling",
    formValue: "Kunststofffenster (Kömmerling)",
    eyebrowNo: "01",
    eyebrow: "Kunststofffenster",
    h1: "Kunststofffenster mit <em>Kömmerling-Profilen</em> – gefertigt von Helios",
    intro: "Kömmerling steht seit 1897 für Kunststoff-Fenstersysteme aus Deutschland. Unsere Fenster werden mit Kömmerling-Profilen in vier Bautiefen gefertigt – von der wirtschaftlichen Lösung für den Fenstertausch bis zum Passivhaus-Niveau für den Neubau.",
    jsonld: [],
    body: "",
  };
  p.jsonld = [productJsonLd(p), breadcrumbJsonLd(crumbs), faqJsonLd(faqs)];
  p.body = `
    ${breadcrumb(crumbs)}
    ${hero(p)}

    <section class="sec" aria-labelledby="vorteile-title">
      <div class="wrap two">
        <div>
          <p class="eyebrow"><span>02</span> Vorteile</p>
          <h2 class="h2" id="vorteile-title">Warum Kunststofffenster <em>von Kömmerling?</em></h2>
          ${checks([
            "<strong>Sehr gute Wärmedämmung</strong> – von Uf 1,2 W/(m²K) beim 70er-Profil bis 0,95 W/(m²K) beim 88er mit Passivhaus-Niveau.",
            "<strong>Schlanke Ansichten</strong> und viele Öffnungsarten: Dreh-Kipp, Festverglasung, Rundbogen, Stulp.",
            "<strong>Pflegeleicht</strong> – kein Streichen, Reinigung mit Wasser und mildem Reiniger.",
            "<strong>Farben und Dekore</strong> – Weiß, Dekore in Eichenoptik, Grau- und Anthrazittöne, zweifarbig innen/außen.",
            "<strong>Einbruchschutz</strong> – Sicherheitsbeschläge und Sicherheitsglas bis RC2 möglich.",
            "<strong>Dreifachverglasung</strong> bis 52 mm Glasstärke, Schallschutz- und Sonnenschutzglas auf Wunsch.",
          ])}
        </div>
        <div>
          <p class="eyebrow"><span>03</span> AD oder MD?</p>
          <h2 class="h2" id="admd-title">Zwei Dichtungssysteme, <em>ein Unterschied.</em></h2>
          <div class="infobox">
            <p><strong>AD – Anschlagdichtung:</strong> zwei Dichtungsebenen außen und innen. Bewährt, wirtschaftlich, die Standardlösung für Sanierung und Fenstertausch.</p>
            <p><strong>MD – Mitteldichtung:</strong> eine dritte Dichtung in der Profilmitte trennt den Beschlagraum vom Außenklima. Ergebnis: bessere Wärmedämmung, höhere Schlagregendichtheit. Unsere Empfehlung für Neubau und Energiesparhaus.</p>
          </div>
        </div>
      </div>
    </section>

    <section class="sec sec--alt" aria-labelledby="modelle-title">
      <div class="wrap">
        <p class="eyebrow"><span>04</span> Profile</p>
        <h2 class="h2" id="modelle-title">Unsere Kömmerling-Systeme <em>im Überblick.</em></h2>
        <p class="lead lead--sm">Die Helios-Produktlinien und die zugrunde liegenden Kömmerling-Profile. Alle Werte sind Herstellerangaben.</p>
        ${table({
          caption: "Kunststofffenster – Kömmerling-Profile",
          head: ["Profil / Produktlinie", "Bautiefe", "Kammern", "Dichtung", "Verglasung", "Uf-Wert"],
          rows: [
            ["<strong>Kömmerling 70</strong><br><span class='sub'>Linie Praktik 70</span>", "70 mm", "5", "AD, 2 Dichtungen", "bis 38 mm, 2- oder 3-fach", "bis zu 1,2 W/(m²K)"],
            ["<strong>Kömmerling 76 AD</strong><br><span class='sub'>Linie Komfort 76</span>", "76 mm", "5", "AD, 2+1 Dichtungen", "bis 48 mm, 3-fach", "bis zu 1,1 W/(m²K)"],
            ["<strong>Kömmerling 76 MD</strong><br><span class='sub'>Linie Komfort 76 Plus</span>", "76 mm", "6", "MD, 3+1 Dichtungen", "bis 48 mm, 3-fach", "bis zu 1,0 W/(m²K)"],
            ["<strong>Kömmerling 88</strong><br><span class='sub'>Linie Performance 88</span>", "88 mm", "7", "MD, 3+1 Dichtungen", "bis 52 mm, 3-fach", "bis zu 0,95 W/(m²K)"],
          ],
        })}
        <p class="tbl-note">${noteSatz(p.slug)}</p>

        <h3 class="h3" id="aluclip-title">Kunststoff-Aluminium: außen Aluminium, innen Kunststoff</h3>
        <p class="lead lead--sm">Die AluClip-Varianten tragen außen eine Aluminium-Vorsatzschale: witterungsbeständig, in jeder RAL-Farbe lackierbar, bei den Pro-Varianten flächenbündig – Rahmen und Flügel liegen außen in einer Ebene.</p>
        ${table({
          caption: "Kunststoff-Aluminium-Fenster – Kömmerling AluClip",
          head: ["Profil / Produktlinie", "Bautiefe", "Kammern", "Verglasung", "Uf-Wert", "Besonderheit"],
          rows: [
            ["<strong>Kömmerling 76 AluClip</strong><br><span class='sub'>Linie Elegant 76</span>", "81,5 mm", "5", "bis 48 mm, 3-fach", "bis zu 1,2 W/(m²K)", "Aluminium-Deckschale außen"],
            ["<strong>Kömmerling 76 AluClip Pro</strong><br><span class='sub'>Linie Elegant 76 Premium</span>", "81,5 mm", "6", "bis 48 mm, 3-fach", "bis zu 1,1 W/(m²K)", "flächenbündig, Mitteldichtung"],
            ["<strong>Kömmerling 88 AluClip Pro</strong><br><span class='sub'>Linie Performance 88 Premium</span>", "93,5 mm", "7", "bis 52 mm, 3-fach", "bis zu 0,95 W/(m²K)", "flächenbündig, Premium, optional Dämmkern"],
          ],
        })}
        <p class="tbl-note">${noteSatz(p.slug)}</p>
        <!-- [MIT KUNDE KLÄREN] Zusatzsystem AluClip Zero (Alu-Optik außen) und Hebe-Schiebetür PremiDoor: Lieferumfang beim Kunden bestätigen, daher hier nicht aufgeführt. -->
      </div>
    </section>

    <section class="sec" aria-labelledby="fuerwen-title">
      <div class="wrap two">
        <div>
          <p class="eyebrow"><span>05</span> Für wen geeignet?</p>
          <h2 class="h2" id="fuerwen-title">Das passende Profil <em>für Ihr Projekt.</em></h2>
          ${checks([
            "<strong>Fenstertausch im Altbau:</strong> Kömmerling 70 oder 76 AD – schlanke Rahmen, gutes Preis-Leistungs-Verhältnis, passt in bestehende Laibungen.",
            "<strong>Sanierung mit Energieziel:</strong> Kömmerling 76 MD – Mitteldichtung und Dreifachglas für spürbar niedrigere Heizkosten.",
            "<strong>Neubau und Energiesparhaus:</strong> Kömmerling 88 – sieben Kammern, Verglasung bis 52 mm, Passivhaus-Niveau.",
            "<strong>Moderne Fassade:</strong> AluClip-Varianten mit Aluminium außen in RAL-Farbe, innen pflegeleichter Kunststoff.",
          ])}
        </div>
        ${ratgeber(p.slug)}
      </div>
    </section>

    <section class="sec sec--alt" aria-labelledby="faq-title">
      <div class="wrap wrap--narrow">
        <p class="eyebrow"><span>06</span> Häufige Fragen</p>
        <h2 class="h2" id="faq-title">Fragen zu <em>Kunststofffenstern.</em></h2>
        ${faq(faqs)}
      </div>
    </section>

    ${form(p)}
    ${otherProducts(p.slug)}`;
  pages.push(p);
}

/* ---------- Aluminiumfenster (Cortizo) ---------- */
{
  const faqs = [
    { q: "Sind Aluminiumfenster nicht kalt?", a: "Moderne Aluminiumprofile sind thermisch getrennt: Ein Kunststoffsteg zwischen Außen- und Innenschale unterbricht den Wärmefluss. Bei Cortizo 70 ist diese thermische Trennung 35 mm breit, dazu kommt Dreifachverglasung bis 48 mm. So erreichen Aluminiumfenster Dämmwerte, die für Neubau und Sanierung geeignet sind." },
    { q: "Aluminium oder Kunststoff?", a: "Aluminium ist steifer und erlaubt größere Elemente mit schmaleren Rahmen – ideal für große Glasflächen und moderne Architektur. Kunststoff dämmt bei gleicher Bautiefe etwas besser und ist günstiger. Ein guter Kompromiss sind Kunststoff-Aluminium-Fenster (AluClip): innen Kunststoff, außen Aluminium." },
    { q: "Welche Farben gibt es?", a: "Aluminiumprofile werden pulverbeschichtet und sind in praktisch allen RAL-Farben erhältlich, matt, glänzend oder strukturiert, außerdem in Dekoren mit Eichenoptik und zweifarbig innen/außen." },
    { q: "Was ist ein verdeckter Flügel?", a: "Beim verdeckten Flügel ist der Flügelrahmen von außen nicht sichtbar – man sieht nur Glas und den schmalen Blendrahmen. Das ergibt eine besonders ruhige Fassade. Solche Systeme bieten wir auf Anfrage an." },
  ];
  const crumbs = [{ name: "Start", url: "/" }, { name: "Produkte", url: "/produkte/" }, { name: "Aluminiumfenster", url: "/produkte/aluminiumfenster-cortizo/" }];
  const p = {
    slug: "aluminiumfenster-cortizo",
    url: "/produkte/aluminiumfenster-cortizo/",
    title: "Aluminiumfenster mit Cortizo-Systemen – Ingolstadt | Fenster-WeissenBurger",
    ogTitle: "Aluminiumfenster mit Cortizo-Systemen",
    description: "Aluminiumfenster mit thermisch getrennten Cortizo-Profilen (60 und 70 mm): schlanke Rahmen, große Glasflächen, RAL-Farben. Beratung, Aufmaß und Montage in Ingolstadt.",
    image: IMG.alu,
    productName: "Aluminiumfenster mit Cortizo-Systemen",
    category: "Aluminiumfenster",
    brand: "Cortizo",
    formValue: "Aluminiumfenster (Cortizo)",
    eyebrowNo: "01",
    eyebrow: "Aluminiumfenster",
    h1: "Aluminiumfenster mit <em>Cortizo-Systemen</em>",
    intro: "Cortizo ist einer der großen europäischen Hersteller von Aluminium-Systemen für Fenster, Türen und Fassaden. Aluminium ist formstabil und langlebig und erlaubt schmale Profile mit großen Glasflächen – die richtige Wahl für moderne Architektur, Terrassentüren und Wintergärten.",
    jsonld: [],
    body: "",
  };
  p.jsonld = [productJsonLd(p), breadcrumbJsonLd(crumbs), faqJsonLd(faqs)];
  p.body = `
    ${breadcrumb(crumbs)}
    ${hero(p)}

    <section class="sec" aria-labelledby="vorteile-title">
      <div class="wrap two">
        <div>
          <p class="eyebrow"><span>02</span> Vorteile</p>
          <h2 class="h2" id="vorteile-title">Warum Aluminiumfenster <em>von Cortizo?</em></h2>
          ${checks([
            "<strong>Schlanke Rahmen, große Glasflächen</strong> – Elemente bis 1600 × 2600 mm bei Cortizo 70.",
            "<strong>Formstabil</strong> auch bei großen und schweren Elementen; kein Verziehen, kein Quellen.",
            "<strong>Thermisch getrennt</strong> – Kunststoffstege von 24 mm (Cortizo 60) bzw. 35 mm (Cortizo 70) unterbrechen den Wärmefluss.",
            "<strong>Pflegeleicht und langlebig</strong> – pulverbeschichtete Oberflächen, wetterfest, korrosionsbeständig.",
            "<strong>Alle RAL-Farben</strong>, matt, glänzend, strukturiert oder in Dekor-Optik, auch zweifarbig.",
            "<strong>Recyclingfähig</strong> – Aluminium lässt sich ohne Qualitätsverlust wiederverwerten.",
          ])}
        </div>
        <div>
          <p class="eyebrow"><span>03</span> Thermische Trennung</p>
          <h2 class="h2">So dämmt <em>Aluminium.</em></h2>
          <div class="infobox">
            <p>Aluminium leitet Wärme gut – deshalb bestehen moderne Fensterprofile aus zwei Aluminiumschalen, die durch Stege aus glasfaserverstärktem Kunststoff verbunden sind. Je breiter diese thermische Trennung, desto besser der Uf-Wert. Dazu kommen Dichtungen auf drei Ebenen und Dreifachverglasung.</p>
          </div>
        </div>
      </div>
    </section>

    <section class="sec sec--alt" aria-labelledby="modelle-title">
      <div class="wrap">
        <p class="eyebrow"><span>04</span> Systeme</p>
        <h2 class="h2" id="modelle-title">Unsere Cortizo-Systeme <em>im Überblick.</em></h2>
        ${table({
          caption: "Aluminiumfenster – Cortizo-Profile (Standardsortiment)",
          head: ["Profil / Produktlinie", "Bautiefe", "Thermische Trennung", "Verglasung", "Uf-Wert", "Max. Flügelmaß"],
          rows: [
            ["<strong>Cortizo 60</strong><br><span class='sub'>Linie Dauerhaft 60</span>", "60 mm", "24 mm", "24 mm 2-fach, optional 3-fach bis 40 mm", "bis zu 2,1 W/(m²K)", "1400 × 2600 mm"],
            ["<strong>Cortizo 70</strong><br><span class='sub'>Linie Dauerhaft 70</span>", "70 mm", "35 mm", "bis 48 mm, 2- oder 3-fach", "bis zu 1,9 W/(m²K)", "1600 × 2600 mm"],
          ],
        })}
        <p class="tbl-note">${noteSatz(p.slug)}</p>
        <h3 class="h3">Auf Anfrage: hochwärmegedämmte Cortizo-Systeme</h3>
        <p class="lead lead--sm">Für besondere Anforderungen – sehr große Glasflächen, verdeckte Flügel oder Passivhaus-Standard – bieten wir auf Anfrage weitere Cortizo-Systeme an, etwa die Cor-70- und Cor-80-Industrial-Reihe mit Uf-Werten ab 0,94 W/(m²K) oder Schiebesysteme der Cor-Vision-Reihe. Sprechen Sie uns an, wir prüfen Machbarkeit und Lieferzeit für Ihr Projekt.</p>
        <!-- [MIT KUNDE KLÄREN] Cor 70/80 Industrial, Cor 80 Verdeckter Flügel, Passivhaus-Variante, Cor Vision: nur „auf Anfrage“, kein Standardsortiment laut helios-sortiment.md. -->
      </div>
    </section>

    <section class="sec" aria-labelledby="fuerwen-title">
      <div class="wrap two">
        <div>
          <p class="eyebrow"><span>05</span> Für wen geeignet?</p>
          <h2 class="h2" id="fuerwen-title">Aluminium ist richtig, <em>wenn …</em></h2>
          ${checks([
            "<strong>… die Architektur modern ist:</strong> schmale Ansichten, klare Linien, dunkle oder metallische Farben.",
            "<strong>… die Elemente groß sind:</strong> raumhohe Verglasungen, Terrassentüren, Wintergärten, Eckfenster.",
            "<strong>… Gewerbe und Verwaltung</strong> robuste, wartungsarme Fenster brauchen.",
            "<strong>… die Außenseite besonders beansprucht wird:</strong> Wetterseite, exponierte Lagen, farbige Fassaden.",
          ])}
          <p class="lead lead--sm">Sie möchten die Dämmwerte von Kunststoff mit der Optik von Aluminium? Dann sind unsere <a href="/produkte/kunststofffenster-koemmerling/#aluclip-title">Kunststoff-Aluminium-Fenster (AluClip)</a> eine Alternative.</p>
        </div>
        ${ratgeber(p.slug)}
      </div>
    </section>

    <section class="sec sec--alt" aria-labelledby="faq-title">
      <div class="wrap wrap--narrow">
        <p class="eyebrow"><span>06</span> Häufige Fragen</p>
        <h2 class="h2" id="faq-title">Fragen zu <em>Aluminiumfenstern.</em></h2>
        ${faq(faqs)}
      </div>
    </section>

    ${form(p)}
    ${otherProducts(p.slug)}`;
  pages.push(p);
}

/* ---------- Schiebetüren ---------- */
{
  const faqs = [
    { q: "Hebe-Schiebetür oder Parallel-Schiebe-Kipp-Tür?", a: "Bei der Hebe-Schiebetür wird der Flügel über den Griff leicht angehoben und gleitet dann auf Laufrollen – das erlaubt sehr große und schwere Flügel und eine barrierearme Schwelle. Parallel-Schiebe-Kipp-Türen sind leichter und günstiger, lassen sich zusätzlich kippen, sind aber auf kleinere Flügel begrenzt. Wir empfehlen je nach Öffnungsbreite und Nutzung." },
    { q: "Wie groß kann eine Schiebetür werden?", a: "Das hängt vom System ab: Versatil 70 bis 3500 × 2400 mm, Robust 76 und Robust 76 Premium bis 6500 × 2600 mm, die Aluminium-Linie Visuell 160 bis 6400 × 3000 mm – jeweils als zweiflügelige Tür. Drei- bis sechsflügelige Anlagen sind möglich." },
    { q: "Ist die Schwelle barrierearm?", a: "Hebe-Schiebetüren lassen sich mit flacher Bodenschwelle planen, die mit Rollstuhl oder Kinderwagen überfahrbar ist. Wir klären die Details beim Aufmaß, da Bodenaufbau und Abdichtung dafür vorbereitet sein müssen." },
    { q: "Kann ich Rollläden oder Sonnenschutz kombinieren?", a: "Ja. Aufsatz- und Vorsatzrollläden sowie Raffstores sind für alle Linien möglich und können gleich mit der Tür geplant und montiert werden." },
  ];
  const crumbs = [{ name: "Start", url: "/" }, { name: "Produkte", url: "/produkte/" }, { name: "Schiebetüren", url: "/produkte/schiebetueren/" }];
  const p = {
    slug: "schiebetueren",
    url: "/produkte/schiebetueren/",
    title: "Hebe-Schiebetüren aus Kunststoff und Aluminium – Ingolstadt | Fenster-WeissenBurger",
    ogTitle: "Hebe-Schiebetüren aus Kunststoff und Aluminium",
    description: "Hebe-Schiebetüren für Terrasse und Garten: Kunststoff-Linien Versatil 70, Robust 76 und Robust 76 Premium, Aluminium-Linien Visuell 60, 116 und 160. Beratung, Aufmaß und Montage in Ingolstadt.",
    image: IMG.schiebe,
    productName: "Hebe-Schiebetüren aus Kunststoff und Aluminium",
    category: "Schiebetüren",
    brand: null,
    formValue: "Hebe-Schiebetür",
    eyebrowNo: "01",
    eyebrow: "Schiebetüren",
    h1: "Hebe-Schiebetüren – <em>großzügig zur Terrasse.</em>",
    intro: "Schiebetüren öffnen Wohnräume zum Garten, ohne dass ein Flügel in den Raum schwenkt. Wir liefern Hebe-Schiebe- und Schiebesysteme aus Kunststoff und Aluminium – von der zweiflügeligen Terrassentür bis zur sechsflügeligen Glasfront.",
    jsonld: [],
    body: "",
  };
  p.jsonld = [productJsonLd(p), breadcrumbJsonLd(crumbs), faqJsonLd(faqs)];
  p.body = `
    ${breadcrumb(crumbs)}
    ${hero(p)}

    <section class="sec" aria-labelledby="vorteile-title">
      <div class="wrap two">
        <div>
          <p class="eyebrow"><span>02</span> Vorteile</p>
          <h2 class="h2" id="vorteile-title">Mehr Licht, mehr Raum, <em>mehr Garten.</em></h2>
          ${checks([
            "<strong>Große Glasflächen</strong> – zweiflügelige Türen bis 6,5 m Breite, Glasflächen bis 14 m².",
            "<strong>Kein Platzbedarf im Raum</strong> – die Flügel gleiten parallel zur Wand.",
            "<strong>Leichtgängig</strong> – Laufrollen auf Edelstahlschienen, auch bei schweren Flügeln.",
            "<strong>Barrierearm planbar</strong> – flache Schwellen zum Überfahren.",
            "<strong>Sicher</strong> – Mehrpunktverriegelung, Sicherheitsglas und RC-Beschläge möglich.",
            "<strong>Dreifachverglasung</strong> bis 48 mm bei den 76er- und 160er-Linien.",
          ])}
        </div>
        <div>
          <p class="eyebrow"><span>03</span> Bauarten</p>
          <h2 class="h2">Hebe-Schiebe <em>oder Schiebe?</em></h2>
          <div class="infobox">
            <p><strong>Hebe-Schiebetür (HST):</strong> Der Flügel wird per Griffdrehung einige Millimeter angehoben und gleitet dann fast ohne Widerstand. Sehr dicht im geschlossenen Zustand, geeignet für große, schwere Flügel.</p>
            <p><strong>Schiebetür mit Bürstendichtung:</strong> leichtere, wirtschaftliche Bauart (z. B. Versatil 70, Visuell 60) für Terrassen, Balkone und Nebenräume.</p>
          </div>
        </div>
      </div>
    </section>

    <section class="sec sec--alt" aria-labelledby="modelle-title">
      <div class="wrap">
        <p class="eyebrow"><span>04</span> Linien</p>
        <h2 class="h2" id="modelle-title">Unsere Schiebetür-Linien <em>im Überblick.</em></h2>
        ${table({
          caption: "Schiebetüren aus Kunststoff (Kömmerling-Profile)",
          head: ["Produktlinie", "Profil", "Bautiefe", "Verglasung", "Max. Maß (2-flügelig)", "Besonderheit"],
          rows: [
            ["<strong>Versatil 70</strong>", "Kunststoff, 5 Kammern", "70 / 80 mm", "24 mm, 2-fach", "3500 × 2400 mm", "Schiebetür mit Bürstendichtung, 2- bis 4-flügelig"],
            ["<strong>Robust 76</strong>", "Kunststoff, 5 Kammern", "179 mm (Rahmen)", "bis 48 mm, 2- oder 3-fach", "6500 × 2600 mm", "Hebe-Schiebetür, Glasfläche bis 14 m²"],
            ["<strong>Robust 76 Premium</strong>", "Kunststoff-Aluminium, 5 Kammern", "189,5 mm (Rahmen)", "48 mm, 3-fach", "6500 × 2600 mm", "Hebe-Schiebetür, Aluminium außen"],
          ],
        })}
        ${table({
          caption: "Schiebetüren aus Aluminium (Cortizo-Profile)",
          head: ["Produktlinie", "Profil", "Bautiefe", "Verglasung", "Max. Maß (2-flügelig)", "Besonderheit"],
          rows: [
            ["<strong>Visuell 60</strong>", "Aluminium, thermisch getrennt", "60 / 80 / 106 / 126 mm", "bis 24 mm, 2-fach", "4400 × 2600 mm", "2- bis 6-flügelig, optional 3 Laufbahnen"],
            ["<strong>Visuell 116</strong>", "Aluminium, thermisch getrennt", "115,8 / 182 mm", "bis 30 mm, 2- oder 3-fach", "4400 × 3000 mm", "Premium-Beschläge, optional 3 Laufbahnen"],
            ["<strong>Visuell 160</strong>", "Aluminium, thermisch getrennt", "160 / 251 mm", "bis 48 mm, 2- oder 3-fach", "6400 × 3000 mm", "2- bis 6-flügelig, Mehrpunktverriegelung"],
          ],
        })}
        <p class="tbl-note">${noteSatz(p.slug)}</p>
        <!-- [MIT KUNDE KLÄREN] Linien Robust 88 / Robust 88 Premium und Select 76 stehen in helios-sortiment.md, sind auf fensterhelios.de (DE) aber nicht gelistet – nicht aufgeführt. -->
      </div>
    </section>

    <section class="sec" aria-labelledby="fuerwen-title">
      <div class="wrap two">
        <div>
          <p class="eyebrow"><span>05</span> Für wen geeignet?</p>
          <h2 class="h2" id="fuerwen-title">Die passende Linie <em>für Ihre Öffnung.</em></h2>
          ${checks([
            "<strong>Terrassentür im Bestand:</strong> Versatil 70 – wirtschaftlich, in Standardmaßen, Dekore wie die Fenster.",
            "<strong>Große Glasfront zum Garten:</strong> Robust 76 – Hebe-Schiebetür bis 6,5 m, Dreifachglas.",
            "<strong>Moderne Fassade in RAL-Farbe:</strong> Robust 76 Premium oder die Aluminium-Linien Visuell 116/160.",
            "<strong>Mehrflügelige Anlagen, Wintergarten, Gewerbe:</strong> Visuell 60 bis 160 mit bis zu sechs Flügeln.",
          ])}
        </div>
        ${ratgeber(p.slug)}
      </div>
    </section>

    <section class="sec sec--alt" aria-labelledby="faq-title">
      <div class="wrap wrap--narrow">
        <p class="eyebrow"><span>06</span> Häufige Fragen</p>
        <h2 class="h2" id="faq-title">Fragen zu <em>Schiebetüren.</em></h2>
        ${faq(faqs)}
      </div>
    </section>

    ${form(p)}
    ${otherProducts(p.slug)}`;
  pages.push(p);
}

/* ---------- Haustüren ---------- */
{
  const faqs = [
    { q: "Was bedeutet RC2?", a: "RC2 ist eine Widerstandsklasse nach DIN EN 1627. Eine RC2-Tür hält dem Versuch stand, sie mit einfachen Werkzeugen wie Schraubendreher oder Zange aufzuhebeln. Dafür greifen Mehrfachverriegelung, Sicherheitsglas, Bandseitensicherung und ein geprüfter Schließzylinder ineinander. RC2 ist der empfohlene Standard für Wohnhäuser." },
    { q: "Was ist der Ud-Wert?", a: "Der Ud-Wert beschreibt den Wärmedurchgang der gesamten Tür in W/(m²K) – Rahmen, Flügel, Füllung und Glas zusammen. Je kleiner, desto weniger Wärme geht verloren. Hochgedämmte Haustüren mit flügelüberdeckender Füllung erreichen je nach Modell und Glasanteil Werte unter 1,0 W/(m²K)." },
    { q: "Welche Füllung ist die richtige?", a: "Für klassische Fassaden und knappe Budgets die eingesetzte Füllung; für eine moderne, flächenbündige Außenansicht die einseitig flügelüberdeckende; wenn innen und außen glatt sein sollen und die beste Dämmung zählt, die beidseitig flügelüberdeckende Füllung. Wir zeigen Ihnen die Varianten gern vor Ort." },
    { q: "Kann ich meine Haustür einbruchsicher machen?", a: "Bei einer neuen Tür planen wir RC2 direkt ein. Bestehende Türen lassen sich oft mit Mehrfachverriegelung, Sicherheitsbeschlag und Zylinder nachrüsten – ob das sinnvoll ist, beurteilen wir beim Termin vor Ort." },
  ];
  const crumbs = [{ name: "Start", url: "/" }, { name: "Produkte", url: "/produkte/" }, { name: "Haustüren", url: "/produkte/haustueren/" }];
  const p = {
    slug: "haustueren",
    url: "/produkte/haustueren/",
    title: "Haustüren aus Aluminium und Kunststoff – Ingolstadt | Fenster-WeissenBurger",
    ogTitle: "Haustüren aus Kunststoff, Kunststoff-Aluminium und Aluminium",
    description: "Haustüren aus Kunststoff, Kunststoff-Aluminium und Aluminium mit Türfüllungen, Seitenteilen und Sicherheit bis RC2. Beratung, Aufmaß und Montage in Ingolstadt.",
    image: IMG.haustuer,
    productName: "Haustüren aus Kunststoff, Kunststoff-Aluminium und Aluminium",
    category: "Haustüren",
    brand: null,
    formValue: "Haustür",
    eyebrowNo: "01",
    eyebrow: "Haustüren",
    h1: "Haustüren aus <em>Kunststoff, Kunststoff-Aluminium und Aluminium</em>",
    intro: "Die Haustür ist Visitenkarte und Schutz zugleich. Wir planen sie mit Ihnen: Werkstoff, Füllung, Glas, Seitenteile, Griff und Sicherheitsausstattung – und montieren sie fachgerecht, inklusive Ausbau der alten Tür.",
    jsonld: [],
    body: "",
  };
  p.jsonld = [productJsonLd(p), breadcrumbJsonLd(crumbs), faqJsonLd(faqs)];
  p.body = `
    ${breadcrumb(crumbs)}
    ${hero(p)}

    <section class="sec" aria-labelledby="vorteile-title">
      <div class="wrap two">
        <div>
          <p class="eyebrow"><span>02</span> Vorteile</p>
          <h2 class="h2" id="vorteile-title">Was unsere Haustüren <em>auszeichnet.</em></h2>
          ${checks([
            "<strong>Wärmedämmung</strong> – gedämmte Füllungen, Dreifachglas und Mitteldichtung; Ud-Werte je nach Modell unter 1,0 W/(m²K).",
            "<strong>Sicherheit bis RC2</strong> – Mehrfachverriegelung mit Bolzen und Haken, Sicherheitsglas, Bandseitensicherung.",
            "<strong>Gestaltung</strong> – über 20 Füllungsdesigns, Glasausschnitte, Seitenteile, Oberlichter, Weiß, Dekore in Eichenoptik oder RAL-Farben.",
            "<strong>Griffe</strong> – Stoßgriff, Griffleiste oder Drücker in Edelstahl, Schwarz oder Aluminium.",
            "<strong>Komfort</strong> – barrierearme Schwelle, auf Wunsch automatische Verriegelung.",
            "<strong>Alles aus einer Hand</strong> – Beratung, Aufmaß, Montage und Entsorgung der alten Tür.",
          ])}
        </div>
        <div>
          <p class="eyebrow"><span>03</span> Füllungsarten</p>
          <h2 class="h2">Eingesetzt oder <em>flügelüberdeckend?</em></h2>
          <div class="infobox">
            <p><strong>Eingesetzte Füllung:</strong> Die Füllung sitzt im Türflügel, der Flügelrahmen bleibt rundum sichtbar – klassisch und preiswert.</p>
            <p><strong>Einseitig flügelüberdeckend:</strong> Außen überdeckt die Füllung den Flügelrahmen – flächenbündige, moderne Optik von der Straße aus.</p>
            <p><strong>Beidseitig flügelüberdeckend:</strong> Außen und innen glatt, kein sichtbarer Flügelrahmen – Premium-Optik und meist die beste Wärmedämmung.</p>
          </div>
        </div>
      </div>
    </section>

    <section class="sec sec--alt" aria-labelledby="modelle-title">
      <div class="wrap">
        <p class="eyebrow"><span>04</span> Linien</p>
        <h2 class="h2" id="modelle-title">Unsere Haustür-Linien <em>im Überblick.</em></h2>
        ${table({
          caption: "Haustüren aus Kunststoff und Kunststoff-Aluminium (Kömmerling-Profile)",
          head: ["Produktlinie", "Profil", "Bautiefe", "Füllung / Verglasung", "Dichtungen", "Besonderheit"],
          rows: [
            ["<strong>Praktik 70</strong>", "Kunststoff, 4 Kammern", "70 mm", "bis 38 mm", "2", "wirtschaftliche Nebeneingangs- und Haustür"],
            ["<strong>Komfort 76</strong>", "Kunststoff, 5 Kammern", "76 mm", "bis 48 mm", "2+1", "Verriegelung mit Bolzen und Haken, Oberlicht und Seitenteile möglich"],
            ["<strong>Elegant 76</strong>", "Kunststoff-Aluminium, 5 Kammern", "81,5 mm", "bis 48 mm", "2+1", "Aluminium außen, optional automatische Verriegelung"],
            ["<strong>Elegant 76 Premium</strong>", "Kunststoff-Aluminium, 5 Kammern", "81,5 mm", "71–91 mm (flügelüberdeckende Füllung)", "2+1", "flächenbündig außen"],
            ["<strong>Performance 88</strong>", "Kunststoff, 6 Kammern", "88 mm", "bis 52 mm", "2+1", "beste Dämmung der Kunststoff-Linien"],
            ["<strong>Performance 88 Premium</strong>", "Kunststoff-Aluminium, 6 Kammern", "93,5 mm", "bis 52 mm", "2+1", "flächenbündig, optional automatische Verriegelung"],
          ],
        })}
        ${table({
          caption: "Haustüren aus Aluminium (Cortizo-Profile)",
          head: ["Produktlinie", "Profil", "Bautiefe", "Füllung / Verglasung", "Max. Flügelmaß", "Besonderheit"],
          rows: [
            ["<strong>Dauerhaft 60</strong>", "Aluminium, thermisch getrennt", "60 mm", "bis 38 mm, Aluminium-Füllungen", "1300 × 2650 mm", "Mehrpunktverriegelung, optional Zutrittsautomatik"],
            ["<strong>Dauerhaft 70 Premium</strong>", "Aluminium, thermisch getrennt, flächenbündig", "70 mm", "bis 48 mm, Aluminium-Füllungen", "1500 × 2900 mm", "verdeckte Sicherheitsbeschläge möglich"],
          ],
        })}
        <p class="tbl-note">${noteSatz(p.slug)}</p>

        <h3 class="h3">Türfüllungen und Griffe</h3>
        <p class="lead lead--sm">Zur Auswahl stehen Füllungen aus Kunststoff (Designs D 1, D 2, D 3, D 6, D 7, D 9, D 1420, Celia, Ella, Marta, Rebeca) und aus Aluminium (D 1404, D 1411, D 1413, D 1415, D 1420, D 1422, D 1434, D 1436), jeweils mit oder ohne Glasausschnitt und in den Farben der Tür. Griffe: Stoßgriffe in mehreren Längen, Griffleisten, Drücker und Schutzbeschläge in Edelstahl, Schwarz, Weiß, Bronze oder Aluminium. Muster zeigen wir Ihnen beim Beratungstermin.</p>
      </div>
    </section>

    <section class="sec" aria-labelledby="fuerwen-title">
      <div class="wrap two">
        <div>
          <p class="eyebrow"><span>05</span> Für wen geeignet?</p>
          <h2 class="h2" id="fuerwen-title">Die passende Tür <em>für Ihr Haus.</em></h2>
          ${checks([
            "<strong>Haustürtausch im Bestand:</strong> Komfort 76 oder Elegant 76 – Standardmaße, viele Dekore, gute Dämmung.",
            "<strong>Neubau mit Energiekonzept:</strong> Performance 88 oder Performance 88 Premium mit Dreifachglas und gedämmter Füllung.",
            "<strong>Moderne, flächenbündige Fassade:</strong> Elegant 76 Premium, Performance 88 Premium oder Dauerhaft 70 Premium in RAL-Farbe.",
            "<strong>Nebeneingang, Keller, Garage:</strong> Praktik 70 oder Dauerhaft 60.",
          ])}
        </div>
        ${ratgeber(p.slug, [["Flügelüberdeckend", "Die Füllung überdeckt den Flügelrahmen – außen (einseitig) oder außen und innen (beidseitig). Ergibt eine glatte Türfläche ohne sichtbaren Rahmen."]])}
      </div>
    </section>

    <section class="sec sec--alt" aria-labelledby="faq-title">
      <div class="wrap wrap--narrow">
        <p class="eyebrow"><span>06</span> Häufige Fragen</p>
        <h2 class="h2" id="faq-title">Fragen zu <em>Haustüren.</em></h2>
        ${faq(faqs)}
      </div>
    </section>

    ${form(p)}
    ${otherProducts(p.slug)}`;
  pages.push(p);
}

/* ---------- Kunststoff-Aluminium-Fenster (Kömmerling AluClip) ---------- */
{
  const faqs = [
    { q: "Was ist ein Kunststoff-Aluminium-Fenster?", a: "Ein Kunststofffenster mit einer außen aufgesetzten Aluminium-Deckschale (AluClip). Innen bleibt der wärmedämmende, pflegeleichte Kunststoff; außen schützt und gestaltet Aluminium – wetterfest, farbstabil und in jeder RAL-Farbe lackierbar." },
    { q: "Wie unterscheidet es sich von einem reinen Aluminiumfenster?", a: "Es dämmt wie ein Kunststofffenster (Uf bis 0,95 W/(m²K)) und ist günstiger als ein thermisch getrenntes Aluminiumfenster. Reines Aluminium erlaubt dafür noch größere Elemente mit schmaleren Ansichten." },
    { q: "Welche Farben sind außen möglich?", a: "Praktisch alle RAL-Farben, matt, glänzend oder strukturiert, außerdem Dekore in Eichenoptik. Innen bleibt das Fenster in der Regel Weiß – auf Wunsch auch farbig." },
    { q: "Was heißt flächenbündig?", a: "Bei den Pro-Varianten liegen Rahmen und Flügel außen in einer Ebene. Das ergibt eine ruhige, moderne Fassadenansicht ohne vorstehende Flügel." },
  ];
  const crumbs = [{ name: "Start", url: "/" }, { name: "Produkte", url: "/produkte/" }, { name: "Kunststoff-Aluminium-Fenster", url: "/produkte/kunststoff-aluminium-fenster/" }];
  const p = {
    slug: "kunststoff-aluminium-fenster",
    url: "/produkte/kunststoff-aluminium-fenster/",
    title: "Kunststoff-Aluminium-Fenster (Kömmerling AluClip) – Ingolstadt | Fenster-WeissenBurger",
    ogTitle: "Kunststoff-Aluminium-Fenster – innen Kunststoff, außen Aluminium",
    description: "Kunststoff-Aluminium-Fenster mit Kömmerling AluClip, 76 AluClip Pro und 88 AluClip Pro: wärmedämmend wie Kunststoff, wetterfest und farbig wie Aluminium. Beratung, kostenloses Aufmaß und Montage in Ingolstadt.",
    image: IMG.kunstalu,
    productName: "Kunststoff-Aluminium-Fenster mit Kömmerling AluClip",
    category: "Kunststoff-Aluminium-Fenster",
    brand: "Kömmerling",
    formValue: "Kunststoff-Aluminium-Fenster (AluClip)",
    eyebrowNo: "01",
    eyebrow: "Kunststoff-Aluminium",
    h1: "Kunststoff-Aluminium-Fenster – <em>innen Kunststoff, außen Aluminium.</em>",
    intro: "Die AluClip-Systeme von Kömmerling verbinden zwei Werkstoffe: Innen der wärmedämmende, pflegeleichte Kunststoffrahmen, außen eine Aluminium-Deckschale, die Wind und Wetter trotzt und sich in jeder RAL-Farbe lackieren lässt. Gefertigt von unserem Partner Helios, montiert von uns in Ingolstadt und der Region.",
    jsonld: [],
    body: "",
  };
  p.jsonld = [productJsonLd(p), breadcrumbJsonLd(crumbs), faqJsonLd(faqs)];
  p.body = `
    ${breadcrumb(crumbs)}
    ${hero(p)}

    <section class="sec" aria-labelledby="vorteile-title">
      <div class="wrap two">
        <div>
          <p class="eyebrow"><span>02</span> Vorteile</p>
          <h2 class="h2" id="vorteile-title">Das Beste aus <em>zwei Werkstoffen.</em></h2>
          ${checks([
            "<strong>Wärmedämmung wie Kunststoff</strong> – Uf-Werte von 1,2 bis 0,95 W/(m²K), Dreifachverglasung bis 52 mm.",
            "<strong>Wetterfest wie Aluminium</strong> – die Deckschale außen ist UV- und farbstabil, kein Streichen, kein Verziehen.",
            "<strong>Farbe nach Wunsch</strong> – außen jede RAL-Farbe oder Eichenoptik, innen pflegeleichtes Weiß.",
            "<strong>Flächenbündig</strong> bei den Pro-Varianten: Rahmen und Flügel in einer Ebene für moderne Fassaden.",
            "<strong>Preisvorteil</strong> gegenüber reinen Aluminiumfenstern bei vergleichbarer Optik.",
            "<strong>Einbruchschutz</strong> – Sicherheitsbeschläge und Sicherheitsglas bis RC2 möglich.",
          ])}
        </div>
        <div>
          <p class="eyebrow"><span>03</span> So funktioniert es</p>
          <h2 class="h2" id="aufbau-title">Kunststoffprofil plus <em>Aluminium-Deckschale.</em></h2>
          <div class="infobox">
            <p><strong>Innen:</strong> Kömmerling-Mehrkammerprofil aus Kunststoff – Wärmedämmung, Schallschutz, pflegeleichte Oberfläche.</p>
            <p><strong>Außen:</strong> eine aufgeklipste Aluminiumschale – stabil, witterungsbeständig, pulverbeschichtet in der gewünschten Farbe. Sie schützt das Profil und bestimmt die Ansicht von der Straße.</p>
          </div>
        </div>
      </div>
    </section>

    <section class="sec sec--alt" aria-labelledby="modelle-title">
      <div class="wrap">
        <p class="eyebrow"><span>04</span> Profile</p>
        <h2 class="h2" id="modelle-title">Die AluClip-Systeme <em>im Überblick.</em></h2>
        <p class="lead lead--sm">Alle Werte sind Herstellerangaben für die von Helios verwendeten Ausführungen.</p>
        ${table({
          caption: "Kunststoff-Aluminium-Fenster – Kömmerling AluClip",
          head: ["Profil / Produktlinie", "Bautiefe", "Kammern", "Verglasung", "Uf-Wert", "Besonderheit"],
          rows: [
            ["<strong>Kömmerling 76 AluClip</strong><br><span class='sub'>Linie Elegant 76</span>", "81,5 mm", "5", "bis 48 mm, 3-fach", "bis zu 1,2 W/(m²K)", "Aluminium-Deckschale außen"],
            ["<strong>Kömmerling 76 AluClip Pro</strong><br><span class='sub'>Linie Elegant 76 Premium</span>", "81,5 mm", "6", "bis 48 mm, 3-fach", "bis zu 1,1 W/(m²K)", "flächenbündig, Mitteldichtung"],
            ["<strong>Kömmerling 88 AluClip Pro</strong><br><span class='sub'>Linie Performance 88 Premium</span>", "93,5 mm", "7", "bis 52 mm, 3-fach", "bis zu 0,95 W/(m²K)", "flächenbündig, Premium"],
          ],
        })}
        <p class="tbl-note">${noteSatz(p.slug)}</p>
      </div>
    </section>

    <section class="sec" aria-labelledby="fuerwen-title">
      <div class="wrap two">
        <div>
          <p class="eyebrow"><span>05</span> Für wen geeignet?</p>
          <h2 class="h2" id="fuerwen-title">Wann sich Kunststoff-Aluminium <em>lohnt.</em></h2>
          ${checks([
            "<strong>Moderne Fassade in Farbe:</strong> Anthrazit, Schwarz oder jede andere RAL-Farbe außen – ohne Aufpreis für Vollaluminium.",
            "<strong>Wetterseite und Hanglage:</strong> die Aluminiumschale schützt dauerhaft vor Regen, Sonne und Temperaturwechsel.",
            "<strong>Energetische Sanierung:</strong> 76 AluClip Pro mit Mitteldichtung oder 88 AluClip Pro auf Passivhaus-Niveau.",
            "<strong>Neubau mit ruhiger Ansicht:</strong> flächenbündige Pro-Varianten für gerade Linien.",
          ])}
        </div>
        ${ratgeber(p.slug)}
      </div>
    </section>

    <section class="sec sec--alt" aria-labelledby="faq-title">
      <div class="wrap wrap--narrow">
        <p class="eyebrow"><span>06</span> Häufige Fragen</p>
        <h2 class="h2" id="faq-title">Fragen zu <em>Kunststoff-Aluminium-Fenstern.</em></h2>
        ${faq(faqs)}
      </div>
    </section>

    ${form(p)}
    ${otherProducts(p.slug)}`;
  pages.push(p);
}

/* ---------- Übersicht /produkte/ ---------- */
{
  const crumbs = [{ name: "Start", url: "/" }, { name: "Produkte", url: "/produkte/" }];
  const p = {
    slug: "index",
    url: "/produkte/",
    title: "Fenster, Haustüren und Schiebetüren – Produkte | Fenster-WeissenBurger Ingolstadt",
    ogTitle: "Unsere Produkte: Fenster, Haustüren, Schiebetüren",
    description: "Kunststofffenster mit Kömmerling-Profilen, Aluminiumfenster mit Cortizo-Systemen, Hebe-Schiebetüren, Haustüren und Kunststoff-Aluminium-Fenster – gefertigt von Helios, montiert in Ingolstadt und Umgebung.",
    image: IMG.montage,
    jsonld: [],
    body: "",
  };
  p.jsonld = [
    breadcrumbJsonLd(crumbs),
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: "Produkte von Fenster-WeissenBurger",
      itemListElement: produkteLib.jsonLd(produkte, SITE).itemListElement,
    },
  ];
  p.body = `
    ${breadcrumb(crumbs)}
    <section class="phero" aria-labelledby="h1">
      <div class="wrap phero__grid">
        <div class="phero__text">
          <p class="eyebrow"><span>Produkte</span> Fenster · Türen · Schiebetüren</p>
          <h1 class="title" id="h1">Fenster und Türen – <em>nach Maß für Ihr Zuhause.</em></h1>
          <p class="lead">Kunststoff, Kunststoff-Aluminium oder Aluminium: Wir beraten Sie zu Hause, messen kostenlos auf und montieren Ihre neuen Fenster, Haustüren und Schiebetüren in Ingolstadt und der Region.</p>
          <p class="partner">${partnerSatz(p.slug)}</p>
          <div class="actions">
            <a class="btn btn--primary" href="#anfrage">Kostenloses Aufmaß anfragen</a>
            <a class="btn btn--ghost" href="/leistungen/">Unsere Leistungen</a>
          </div>
        </div>
        <figure class="phero__fig">
          <img src="${IMG.montage.src640}" srcset="${IMG.montage.src640} 640w, ${IMG.montage.src1200} 1056w" sizes="(min-width: 900px) 40vw, 92vw" width="${IMG.montage.w}" height="${IMG.montage.h}" alt="${esc(IMG.montage.alt)}" fetchpriority="high" decoding="async">
        </figure>
      </div>
    </section>

    <section class="sec" aria-labelledby="kat-title">
      <div class="wrap">
        <p class="eyebrow"><span>01</span> Kategorien</p>
        <h2 class="h2" id="kat-title">Unsere <em>Produktgruppen.</em></h2>
        <!--produkte-karten-->
        ${produkteLib.uebersichtHtml(produkte, einst)}
        <!--/produkte-karten-->
      </div>
    </section>

    <section class="sec sec--alt" id="aluplast" aria-labelledby="aluplast-title">
      <div class="wrap">
        <p class="eyebrow"><span>02</span> aluplast</p>
        <h2 class="h2" id="aluplast-title">Kunststoff-Fenstersysteme <em>von aluplast.</em></h2>
        <p class="lead lead--sm">Neben den Kömmerling-Profilen bieten wir Fenster mit Systemen des deutschen Herstellers aluplast an. Die Serien unterscheiden sich in Bautiefe, Kammerzahl und Ausstattung:</p>
        ${table({
          caption: "aluplast-Fenstersysteme (Herstellerangaben)",
          head: ["System", "Bautiefe", "Merkmale"],
          rows: [
            ["<strong>IDEAL 4000</strong>", "70 mm", "Mehrkammerprofil, gute Schalldämmung, viele Farben und Designvarianten (Round-, Soft-, Classic-Line); wirtschaftlicher Einstieg für Sanierung und Fenstertausch"],
            ["<strong>IDEAL 5000</strong>", "70 mm", "sehr gute Wärmedämmung, optional Mitteldichtung „safetec inside“ für mehr Dichtheit und Sicherheit, Aluminium-Vorsatzschalen (Aluskin) möglich"],
            ["<strong>IDEAL 7000</strong>", "85 mm", "Mehrkammertechnik, Verglasung bis 51 mm, sehr gute Wärmedämmung, optional Aluminiumschalen"],
            ["<strong>IDEAL 8000</strong>", "85 mm", "6-Kammer-Technik, sehr guter Wärme- und Schallschutz, verschiedene Verglasungsstärken und Designvarianten"],
            ["<strong>energeto neo</strong>", "76 mm", "schlanke Ansichten für große Glasflächen, optional „powerdur inside“ (Verstärkung ohne Stahl) und „bonding inside“ (verklebte Verglasung) für Dämmung und Stabilität"],
          ],
        })}
        <p class="tbl-note">${noteSatz(p.slug)}</p>
        <!-- [MIT KUNDE KLÄREN] aluplast: Herstellerbilder und Broschüren (IDEAL-Serie, energeto neo) von der alten Website nur mit Freigabe übernehmen; Lieferant/Fertiger der aluplast-Fenster bestätigen. -->
      </div>
    </section>

    <section class="sec" aria-labelledby="warum-title">
      <div class="wrap two">
        <div>
          <p class="eyebrow"><span>03</span> Gemeinsam für alle Produkte</p>
          <h2 class="h2" id="warum-title">Was immer <em>dazugehört.</em></h2>
          ${checks([
            "<strong>Beratung vor Ort</strong> mit Mustern – Werkstoff, Öffnungsarten, Verglasung, Farben.",
            "<strong>Kostenloses Aufmaß</strong> durch unsere Monteure, schriftliches Angebot mit allen Positionen.",
            "<strong>Fachgerechte Montage</strong> nach RAL-Richtlinien, Abdichtung, Fensterbänke, Rollläden.",
            "<strong>Demontage und Entsorgung</strong> der alten Elemente, besenreine Übergabe.",
            "<strong>Hinweise zu Fördermöglichkeiten</strong> für energetische Sanierung (z. B. BAFA, KfW).",
          ])}
          <p class="lead lead--sm"><a href="/leistungen/">Alle Leistungen im Detail →</a></p>
        </div>
        ${ratgeber(p.slug)}
      </div>
    </section>

    ${form({ formValue: "Beratung – noch unentschieden" })}`;
  pages.push(p);
}

/* ------------------------------------------------------------------ */
for (const p of pages) {
  const out = p.slug === "index" ? path.join(root, "produkte", "index.html") : path.join(root, "produkte", p.slug, "index.html");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const html = `${head(p)}
${header(p.slug)}
${p.body}
    ${footer()}`.replace(/\n[ \t]*<!-- \[MIT KUNDE KLÄREN\][\s\S]*?-->/g, "");
  fs.writeFileSync(out, html);
  console.log("geschrieben:", path.relative(root, out), html.length, "Bytes");
}
