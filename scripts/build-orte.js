#!/usr/bin/env node
/* Erzeugt die Ortsseiten /einsatzgebiet/<ort>/, die Übersicht /einsatzgebiet/ und die Sitemaps
   aus data/orte.json.  Aufruf: node scripts/build-orte.js  [--report]
   - Veröffentlicht werden nur Orte mit "stufe": 1, deren Region "veroeffentlicht": true hat.
   - Orte einer nicht veröffentlichten Region werden trotzdem gebaut (noindex, nicht in Sitemap/Übersicht).
   - Textbausteine (scripts/orte-texte.js): Jeder längere Satz wird aus zwei Hälften zusammengesetzt, jede Kombination
     nur einmal vergeben und mit scripts/text-duplikate.js gegen alle anderen Seiten geprüft – keine zwei Seiten
     teilen einen Satz ab 8 Wörtern (> 80 % Ähnlichkeit). Zusätzlich bleibt die Überschneidung (5-Wort-Schindeln)
     zu allen bisher erzeugten Seiten unter 50 % (Bericht data/orte-report.json). */
"use strict";
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const firmaLib = require(path.join(root, "netlify/functions/_lib/firma"));
const td = require(path.join(__dirname, "text-duplikate.js")); // Satzvergleich (dieselbe Messung wie der Test)
const T = require(path.join(__dirname, "orte-texte.js")); // Textbausteine (Satzhälften)
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

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "<").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const num = (n) => Math.round(n).toLocaleString("de-DE");
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function pick(arr, seed, salt) { return arr[(hash(seed + ":" + salt) + 0) % arr.length]; }
function dist(a, b) { const R = 6371, t = (x) => (x * Math.PI) / 180; const dLat = t(b.lat - a.lat), dLon = t(b.lon - a.lon); const s = Math.sin(dLat / 2) ** 2 + Math.cos(t(a.lat)) * Math.cos(t(b.lat)) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(s)); }

const orte = data.orte.filter((o) => o.stufe === 1);
const bySlug = Object.fromEntries(orte.map((o) => [o.slug, o]));
const published = (o) => !!regions[o.region].veroeffentlicht;

/* ---------- Textbausteine ----------
   Die Sätze kommen aus scripts/orte-texte.js: Jeder längere Satz besteht aus zwei Hälften, jede Kombination wird im
   gesamten Lauf nur einmal vergeben, und jeder Satz wird vor der Verwendung mit scripts/text-duplikate.js gegen alle
   bereits erzeugten Seiten (und die übrigen öffentlichen Seiten) geprüft – so trägt keine Ortsseite den Satz einer
   anderen Seite (Schwelle 80 % Ähnlichkeit bei Sätzen ab 8 Wörtern; tests/text-duplikate.test.js). */
function ctx(o) {
  const r = regions[o.region];
  const hq = o.region === "ingolstadt";
  const isHQ = o.slug === "ingolstadt";
  const kreisfrei = o.landkreis === "kreisfreie Stadt";
  const lk = kreisfrei ? "kreisfreie Stadt" : o.landkreis;
  const km = Math.round(o.distanceKm), min = o.drivingMinutes;
  const bl = o.bundesland || (hq ? "Bayern" : "");
  const typ = kreisfrei || o.isCity ? "Stadt" : "Gemeinde";
  return {
    r, hq, isHQ, lk, km, min, bl, typ, slug: o.slug, name: o.name, pop: num(o.population), popDate: "31.12.2025", zentrum: r.center,
    imLk: kreisfrei ? "als kreisfreie Stadt" : `im ${o.landkreis}`,
    nameLk: kreisfrei ? `${o.name} (kreisfreie Stadt)` : `${o.name} im ${o.landkreis}`,
    typOrt: kreisfrei ? `kreisfreie Stadt ${o.name}` : `${typ} ${o.name} im ${o.landkreis}`,
  };
}

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
  <script src="/js/main.js?v=${V.main}" defer></script>
</body>
</html>
`;
}
const PROVIDER = firmaLib.jsonLdFirma(einst, SITE);

function form(o, s) {
  return `<section class="sec sec--alt" id="anfrage" aria-labelledby="anfrage-title">
      <div class="wrap two two--form">
        <div>
          <p class="eyebrow"><span>→</span> Anfrage</p>
          <h2 class="h2" id="anfrage-title">${pick(T.H2_ANFRAGE, s, "anfrageh2").replace("{ort}", esc(o.name))}</h2>
          <p class="lead lead--sm">Rückmeldung innerhalb von zwei Werktagen. Beratung und Aufmaß bei Ihnen zu Hause.</p>
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

function buildOrt(o, seed, baukasten, pruefung) {
  const c = ctx(o);
  const s = o.slug + "#" + seed;
  const picks = [];
  const satz = (key) => { const p = baukasten.satz(key, c, seed, pruefung); picks.push(p); return p.text; };
  /* Kurzer Nachsatz (< 8 Wörter): erste Variante ab Hash-Position, die kein Inhaltswort des langen Satzes wiederholt */
  const kurz = (key, lang) => { const l = T.KURZ[key], st = hash(s + "kurz" + key) % l.length; for (let i = 0; i < l.length; i++) { const k = l[(st + i) % l.length]; if (!T.wiederholtInhalt(lang, k, c)) return k; } return l[st]; };
  const mit = (key) => { const t = satz(key); return `${t} ${kurz(key, t)}`; };
  const nb = neighbors(o);
  const nbNamen = nb.slice(0, 3).map((n) => esc(n.x.name));
  const intro = c.isHQ ? T.HQ.intro : mit("intro");
  const nbSentence = nb.length >= 3 ? pick(T.NACHBARN, s, "nb")(c, nbNamen) : "";
  const bedeutet = `<h2 class="h2">${pick(T.H2_BEDEUTET, s, "bedh2").replace("{ort}", esc(o.name))}</h2><p>${mit("bedeutet")}</p>`;
  const gebaeudeH2 = pick(T.H2_GEBAEUDE, s, "gebh2").replace("{ort}", esc(o.name));
  const gebaeude = `<p>${mit("gebaeude")}</p>`;
  const order = pick(T.ORDERS, s, "order");
  const topics = order.map((k) => Object.assign({ key: k, h: pick(T.H3[k], s, "h" + k).replace("{ort}", o.name), text: mit(k) }, T.TOPIC_LINKS[k]));
  const faqKeys = ["kommen", "termin", "kosten", "alt", "foerderung"];
  const faqIdx = [0, 1, 2, 3, 4].filter((i) => i < 2 || hash(s + "faq" + i) % 3 !== 0).slice(0, 4);
  const faqs = faqIdx.map((i) => {
    const k = faqKeys[i], slotKey = "faq" + k[0].toUpperCase() + k.slice(1);
    const a = c.isHQ && k === "kommen" ? T.HQ.faqKommen : T.KURZ[slotKey] ? mit(slotKey) : satz(slotKey);
    const q = c.isHQ && k === "kommen" ? "Wo in Ingolstadt sind Sie im Einsatz?" : pick(T.FAQ_FRAGEN[k], s, "q" + k).replace("{ort}", o.name);
    return { q, a };
  });
  const url = `/einsatzgebiet/${o.slug}/`;
  const titleVar = pick([
    `Fenster & Türen in ${o.name} – Beratung, Aufmaß, Montage | Fenster-WeissenBurger`,
    `Fenstertausch & Fenstermontage in ${o.name} | Fenster-WeissenBurger`,
    `Fenster, Haustüren & Montage in ${o.name} (${c.lk}) | Fenster-WeissenBurger`,
  ], s, "title");
  const descVar = c.isHQ ? "Fenster-WeissenBurger in Ingolstadt: Kömmerling-Kunststofffenster, Cortizo-Alufenster, Haustüren und Schiebetüren – Beratung bei Ihnen zu Hause, kostenloses Aufmaß und Montage mit eigenem Team, direkt vom Firmensitz." : pick([
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
    c.isHQ ? "Unser Firmensitz" : `${c.km} km Luftlinie, ca. ${c.min} Min. Fahrt`,
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
        <div><h2 class="h2">${gebaeudeH2}</h2>${gebaeude}
          <p class="more-links"><a href="/leistungen/">Alle Leistungen</a> · <a href="/produkte/">Alle Produkte</a></p></div>
      </div>
    </section>

    <section class="sec sec--alt" aria-labelledby="themen-title">
      <div class="wrap">
        <p class="eyebrow"><span>01</span> Leistungen &amp; Produkte</p>
        <h2 class="h2" id="themen-title">${pick(T.H2_THEMEN, s, "themenh2").replace("{ort}", esc(o.name))}</h2>
        <div class="themen">
${topics.map((t) => `          <article class="thema">
            <h3>${esc(t.h)}</h3>
            <p>${t.text}</p>
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

    ${form(o, s)}`;
  const html = `${head(o, meta)}
<body class="page lp pp ort">${firmaLib.bannerBlock(einst)}
  <a class="skip" href="#inhalt">Zum Inhalt springen</a>
  ${header()}
  <main id="inhalt">${body}
    ${footer()}`;
  return { html, picks };
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
    PROVIDER,
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
/* lastmod je Seite: Datum der letzten Änderung der Datei laut Git (deterministisch, auch im Netlify-Build verfügbar);
   ohne Git-Historie das Datum der Preisliste/Daten (TODAY). Rechtsseiten (noindex) gehören nicht in die Sitemap. */
function lastmodVon(datei) {
  try { const d = require("child_process").execFileSync("git", ["log", "-1", "--format=%cs", "--", datei], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d; } catch (e) { /* kein Git */ }
  return TODAY;
}
function sitemaps() {
  const seiten = ["/", "/leistungen/", "/referenzen/", "/produkte/", "/produkte/kunststofffenster-koemmerling/", "/produkte/aluminiumfenster-cortizo/", "/produkte/schiebetueren/", "/produkte/haustueren/", "/produkte/kunststoff-aluminium-fenster/", "/einsatzgebiet/"];
  const datei = (loc) => loc.endsWith("/") ? loc.slice(1) + "index.html" : loc.slice(1);
  const u = (loc, prio, freq) => `  <url><loc>${SITE}${loc}</loc><lastmod>${lastmodVon(datei(loc))}</lastmod><changefreq>${freq}</changefreq><priority>${prio}</priority></url>`;
  const xmlHead = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
  const seitenXml = xmlHead + seiten.map((l) => u(l, l === "/" ? "1.0" : "0.8", "monthly")).join("\n") + "\n</urlset>\n";
  const pub = orte.filter(published);
  const orteXml = xmlHead + pub.map((o) => u(`/einsatzgebiet/${o.slug}/`, "0.6", "monthly")).join("\n") + "\n</urlset>\n";
  const neuestes = (xml) => [...xml.matchAll(/<lastmod>([^<]+)/g)].map((m) => m[1]).sort().pop() || TODAY;
  const idx = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <sitemap><loc>${SITE}/sitemap-seiten.xml</loc><lastmod>${neuestes(seitenXml)}</lastmod></sitemap>\n  <sitemap><loc>${SITE}/sitemap-orte.xml</loc><lastmod>${neuestes(orteXml)}</lastmod></sitemap>\n</sitemapindex>\n`;
  fs.writeFileSync(path.join(root, "sitemap-seiten.xml"), seitenXml);
  fs.writeFileSync(path.join(root, "sitemap-orte.xml"), orteXml);
  fs.writeFileSync(path.join(root, "sitemap-index.xml"), idx);
  return pub.length;
}

/* ---------- Lauf ---------- */
/* Satzindex: zuerst alle übrigen öffentlichen Seiten (Startseite, Leistungen, Produkte, Konfigurator, Übersicht),
   damit keine Ortsseite deren Sätze wiederholt; dann wächst er mit jeder fertigen Ortsseite. */
const index = new td.SatzIndex();
for (const f of td.seitenFinden(root)) {
  if (/^einsatzgebiet\//.test(f) || /^(impressum|datenschutz)\.html$/.test(f)) continue;
  for (const satz of td.seiteAnalysieren(fs.readFileSync(path.join(root, f), "utf8")).lang) index.add(f, satz);
}
const overviewHtml = buildOverview();
for (const satz of td.seiteAnalysieren(overviewHtml).lang) index.add("einsatzgebiet/index.html", satz);

const baukasten = new T.Baukasten();
const report = [];
const built = []; // {slug, sh}
const order = orte.slice().sort((a, b) => (a.region === b.region ? a.distanceKm - b.distanceKm : a.region === "ingolstadt" ? -1 : 1));
const SEEDS = 40;
for (const o of order) {
  const seite = `einsatzgebiet/${o.slug}/index.html`;
  const pruefung = (text) => { const k = index.konflikte(seite, [text]); return k.length ? `„${text.slice(0, 70)}…“ ähnelt ${k[0].seite} (${Math.round(k[0].sim * 100)} %)` : ""; };
  let best = null, letzterGrund = "";
  for (let seed = 0; seed < SEEDS; seed++) {
    let html, picks;
    try { ({ html, picks } = buildOrt(o, seed, baukasten, pruefung)); } catch (e) { letzterGrund = e.message; continue; }
    const lang = td.seiteAnalysieren(html).lang;
    const konflikte = index.konflikte(seite, lang); // ganze Seite: auch Überschriften, Nachbarsatz, kurze Bausteine mit langen Ortsnamen
    if (konflikte.length) { letzterGrund = konflikte.slice(0, 3).map((k) => `„${k.satz}“ ↔ ${k.seite} (${Math.round(k.sim * 100)} %)`).join("; "); continue; }
    const sh = shingles(mainText(html));
    let max = 0, maxSlug = "";
    for (const b of built) { const ov = overlap(sh, b.sh); if (ov > max) { max = ov; maxSlug = b.slug; } }
    if (!best || max < best.max) best = { html, picks, lang, sh, max, maxSlug, seed };
    if (max < 0.38) break;
  }
  if (!best) throw new Error(`Ortsseite ${o.slug}: in ${SEEDS} Versuchen kein Text ohne Duplikat. Zuletzt: ${letzterGrund}`);
  const dir = path.join(root, "einsatzgebiet", o.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), best.html);
  baukasten.festlegen(best.picks);
  for (const satz of best.lang) index.add(seite, satz);
  built.push({ slug: o.slug, sh: best.sh });
  report.push({ slug: o.slug, region: o.region, max: +best.max.toFixed(3), with: best.maxSlug, seed: best.seed, words: best.sh.size });
}
fs.mkdirSync(path.join(root, "einsatzgebiet"), { recursive: true });
fs.writeFileSync(path.join(root, "einsatzgebiet", "index.html"), overviewHtml);
const pubCount = sitemaps();
fs.writeFileSync(path.join(root, "data", "orte-report.json"), JSON.stringify(report, null, 1));
const maxAll = Math.max(...report.map((r) => r.max));
const avg = report.reduce((s, r) => s + r.max, 0) / report.length;
const paare = index.paare().filter((p) => /^einsatzgebiet\//.test(p.a) || /^einsatzgebiet\//.test(p.b));
console.log(`Ortsseiten: ${report.length} (veröffentlicht/in Sitemap: ${pubCount}); Überschneidung max ${(maxAll * 100).toFixed(1)} %, Ø ${(avg * 100).toFixed(1)} %, >50 %: ${report.filter((r) => r.max >= 0.5).length}; doppelte Sätze (> ${Math.round(td.SCHWELLE * 100)} %, ≥ ${td.MIN_WOERTER} Wörter) zu anderen Seiten: ${paare.length}`);
if (process.argv.includes("--report")) for (const r of report) console.log(`${r.slug}\t${(r.max * 100).toFixed(0)}%\t${r.with}\tseed ${r.seed}`);
