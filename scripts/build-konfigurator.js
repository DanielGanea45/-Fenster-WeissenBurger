#!/usr/bin/env node
/* Erzeugt /konfigurator/fenster/ und /konfigurator/haustuer/ je nach data/einstellungen.json
   (konfigurator.status = aus | vorschau | online), blendet die Konfigurator-Links in allen Seiten
   ein oder aus und pflegt die Sitemap-Einträge. Läuft bei jedem Netlify-Build (npm run build). */
"use strict";
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const SITE = "https://fenster-weissenburger.de";
const TODAY = "2026-10-07";
const einst = JSON.parse(fs.readFileSync(path.join(root, "data/einstellungen.json"), "utf8"));
const status = (einst.konfigurator && einst.konfigurator.status) || "aus";
if (!["aus", "vorschau", "online"].includes(status)) throw new Error("Ungültiger konfigurator.status: " + status);
const preise = JSON.parse(fs.readFileSync(path.join(root, "data/preise.json"), "utf8"));
const Preis = require(path.join(root, "js/preis.js"));
const listeOk = Preis.validiereListe(preise).ok;

const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const ls = indexHtml.indexOf('      <span class="brand__box">');
const le = indexHtml.indexOf("</span>\n    </a>", ls) + "</span>".length;
const LOGO = indexHtml.slice(ls, le).trim();
const v = (name) => { const m = indexHtml.match(new RegExp(name.replace(".", "\\.") + "\\?v=([\\w.-]+)")); return m ? m[1] : "1"; }; // Versionen sind Inhalts-Hashes (scripts/assets-version.js)
const V = { style: v("style.css"), ueberCss: v("uebergang.css"), ueberJs: v("uebergang.js"), main: v("main.js"), config: v("config.js") };
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const linkHidden = status === "online" ? "" : " hidden";

const PAGES = {
  fenster: { url: "/konfigurator/fenster/", title: "Fenster-Konfigurator: Preis online berechnen | Fenster-WeissenBurger", h1: "Fenster <em>konfigurieren</em> und Richtpreis sehen", desc: "Kunststoff-, Kunststoff-Aluminium- oder Aluminiumfenster online zusammenstellen: Profil, Typ, Maße, Farbe, Glas, Sprossen, Rollladen, Zusätze – mit sofortigem Richtpreis inkl. Montage.", intro: "Stellen Sie Ihr Fenster in acht Schritten zusammen. Der Richtpreis rechnet live mit – inklusive Montage, Demontage und 19 % MwSt. Verbindlich wird es nach dem kostenlosen Aufmaß.", other: { url: "/konfigurator/haustuer/", label: "Haustür konfigurieren" }, breadcrumb: "Fenster-Konfigurator" },
  haustuer: { url: "/konfigurator/haustuer/", title: "Haustür-Konfigurator: Preis online berechnen | Fenster-WeissenBurger", h1: "Haustür <em>konfigurieren</em> und Richtpreis sehen", desc: "Haustür online zusammenstellen: Modell, Maße, Farbe, Glas, Seitenteil, Sicherheit und Komfort – mit sofortigem Richtpreis inkl. Montage und Entsorgung der alten Tür.", intro: "Wählen Sie Modell, Maße und Ausstattung Ihrer Haustür. Der Richtpreis rechnet live mit – inklusive Montage und 19 % MwSt. Verbindlich wird es nach dem kostenlosen Aufmaß.", other: { url: "/konfigurator/fenster/", label: "Fenster konfigurieren" }, breadcrumb: "Haustür-Konfigurator" },
};

function header(current) {
  return `<header class="top">
    <a class="brand" href="/#home" aria-label="Fenster-WeissenBurger – Startseite">
      ${LOGO}
    </a>
    <nav class="nav nav--top" aria-label="Hauptnavigation">
      <a href="/#home">Home</a>
      <div class="nav__item">
        <a href="/#produkte">Produkte</a>
        <div class="nav__drop" aria-label="Produkte">
          <a href="/produkte/">Alle Produkte</a>
          <a href="/produkte/kunststofffenster-koemmerling/">Kunststofffenster (Kömmerling)</a>
          <a href="/produkte/aluminiumfenster-cortizo/">Aluminiumfenster (Cortizo)</a>
          <a href="/produkte/schiebetueren/">Hebe-Schiebetüren</a>
          <a href="/produkte/haustueren/">Haustüren</a>
          <a href="/produkte/holzfenster/">Holzfenster &amp; mehr</a>
        </div>
      </div>
      <a href="/leistungen/">Leistungen</a>
      <a href="/referenzen/">Referenzen</a>
      <a class="konf-link" href="/konfigurator/fenster/"${current ? ' aria-current="page"' : ""}${linkHidden}>Konfigurator</a>
      <a href="/#ueber-uns">Über uns</a>
      <a href="/#kontakt">Kontakt</a>
    </nav>
    <a class="btn btn--call" href="tel:+4917681338935">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>
      <span>Anrufen</span>
    </a>
  </header>`;
}
function head(p, noindex, extraScripts) {
  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${esc(p.title)}</title>
  <meta name="description" content="${esc(p.desc)}">
  ${noindex ? '<meta name="robots" content="noindex, follow">' : ""}
  <link rel="canonical" href="${SITE}${p.url}">
  <meta name="theme-color" content="#0B5ED7">
  <meta property="og:title" content="${esc(p.title)}">
  <meta property="og:description" content="${esc(p.desc)}">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="de_DE">
  <meta property="og:url" content="${SITE}${p.url}">
  <meta property="og:image" content="${SITE}/assets/logo/og-image.png">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/assets/logo/apple-touch-icon.png">
  <link rel="preload" href="/assets/fonts/manrope-latin.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="/css/style.css?v=${V.style}">
  <link rel="stylesheet" href="/css/uebergang.css?v=${V.ueberCss}">
  <script src="/js/uebergang.js?v=${V.ueberJs}"></script>
  <link rel="stylesheet" href="/css/leistungen.css?v=2">
  <link rel="stylesheet" href="/css/produkte.css?v=1">
  <link rel="stylesheet" href="/css/konfigurator.css?v=1">
  <script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Start", item: SITE + "/" }, { "@type": "ListItem", position: 2, name: "Produkte", item: SITE + "/produkte/" }, { "@type": "ListItem", position: 3, name: p.breadcrumb, item: SITE + p.url }] })}</script>
  ${extraScripts || ""}
</head>`;
}
function footer(barHtml) {
  return `<footer class="legal wrap">
      <a href="/#home">Startseite</a>
      <a href="/produkte/">Produkte</a>
      <a href="/leistungen/">Leistungen</a>
      <a href="/referenzen/">Referenzen</a>
      <a href="/einsatzgebiet/">Einsatzgebiet</a>
      <a href="/impressum.html">Impressum</a>
      <a href="/datenschutz.html">Datenschutzerklärung</a>
      <span>© <span id="year">2026</span> Fenster-WeissenBurger UG (haftungsbeschränkt)</span>
    </footer>
  </main>
  ${barHtml || ""}
  <script src="/js/config.js?v=${V.config}" defer></script>
  <script src="/js/main.js?v=${V.main}" defer></script>
</body>
</html>
`;
}

function pageSoon(key) {
  const p = PAGES[key];
  return `${head(p, true)}
<body class="page lp pp">
  <a class="skip" href="#inhalt">Zum Inhalt springen</a>
  ${header(false)}
  <main id="inhalt">
    <nav class="crumbs wrap" aria-label="Brotkrumen"><ol><li><a href="/">Start</a></li><li><a href="/produkte/">Produkte</a></li><li aria-current="page">${esc(p.breadcrumb)}</li></ol></nav>
    <section class="phero soon" aria-labelledby="h1">
      <div class="wrap">
        <p class="eyebrow"><span>Konfigurator</span> ${key === "fenster" ? "Fenster" : "Haustüren"}</p>
        <h1 class="title" id="h1">Demnächst <em>verfügbar.</em></h1>
        <p class="lead">Unser Online-Konfigurator für ${key === "fenster" ? "Fenster" : "Haustüren"} ist in Vorbereitung. Bis dahin erstellen wir Ihnen gern persönlich ein Angebot – rufen Sie an oder nutzen Sie das Kontaktformular.</p>
        <div class="actions" style="justify-content:center">
          <a class="btn btn--primary" href="tel:+4917681338935">0176 81338935</a>
          <a class="btn btn--ghost" href="/#kontakt">Kostenloses Aufmaß anfragen</a>
        </div>
        <p class="konf__hint">Mo–Fr 9–17 Uhr · <a href="${key === "fenster" ? "/produkte/kunststofffenster-koemmerling/" : "/produkte/haustueren/"}">Zu den ${key === "fenster" ? "Fenstern" : "Haustüren"}</a></p>
      </div>
    </section>
    ${footer('<div class="ctabar" aria-label="Schnellkontakt"><a class="btn btn--ghost" href="tel:+4917681338935">Anrufen</a><a class="btn btn--primary" href="/#kontakt">Anfrage</a></div>')}`;
}

function pageKonf(key) {
  const p = PAGES[key];
  const noindex = status !== "online";
  const scripts = `<script src="/js/preis.js?v=1" defer></script>\n  <script src="/js/konfigurator-bilder.js?v=1" defer></script>\n  <script src="/js/konfigurator.js?v=3" defer></script>`;
  return `${head(p, noindex, scripts)}
<body class="page lp pp konf-page">
  <a class="skip" href="#inhalt">Zum Inhalt springen</a>
  ${header(true)}
  <main id="inhalt">
    <nav class="crumbs wrap" aria-label="Brotkrumen"><ol><li><a href="/">Start</a></li><li><a href="/produkte/">Produkte</a></li><li aria-current="page">${esc(p.breadcrumb)}</li></ol></nav>
    <section class="konf wrap" id="konf" data-produkt="${key}" aria-labelledby="h1">
      <div class="konf__head">
        <p class="eyebrow"><span>Konfigurator</span> ${key === "fenster" ? "Fenster" : "Haustüren"} · <a href="${p.other.url}">${esc(p.other.label)}</a></p>
        <h1 class="title" id="h1">${p.h1}</h1>
        <p class="lead lead--sm">${esc(p.intro)}</p>
      </div>
      <ol class="konf__steps" aria-label="Schritte"></ol>
      <div class="konf__layout">
        <div class="konf__main">
          <div class="konf__panels" aria-live="polite"></div>

          <section class="angebot" id="angebot-form" aria-label="Angebot anfordern">
            <form class="form" name="angebot-konfigurator" method="POST" action="/danke.html" data-netlify="true" netlify-honeypot="bot-field" novalidate hidden>
              <input type="hidden" name="form-name" value="angebot-konfigurator">
              <input type="hidden" name="produkt" value="${key}">
              <input type="hidden" name="konfiguration" value="">
              <input type="hidden" name="zusammenfassung" value="">
              <input type="hidden" name="preis_brutto_browser" value="">
              <input type="hidden" name="preisliste_version" value="">
              <p class="hp"><label>Bitte leer lassen: <input name="bot-field" tabindex="-1" autocomplete="off"></label></p>
              <div class="form__grid">
                <div class="form__row"><label for="a-name">Name *</label><input id="a-name" name="name" type="text" required autocomplete="name"></div>
                <div class="form__row"><label for="a-tel">Telefon *</label><input id="a-tel" name="telefon" type="tel" required autocomplete="tel" inputmode="tel"></div>
              </div>
              <div class="form__grid">
                <div class="form__row"><label for="a-mail">E-Mail *</label><input id="a-mail" name="email" type="email" required autocomplete="email"></div>
                <div class="form__row"><label for="a-plz">PLZ *</label><input id="a-plz" name="plz" type="text" required inputmode="numeric" pattern="[0-9]{5}" maxlength="5" autocomplete="postal-code"></div>
              </div>
              <div class="form__row"><label for="a-msg">Nachricht (optional)</label><textarea id="a-msg" name="nachricht" rows="3" placeholder="z. B. Anzahl weiterer Elemente, Wunschtermin, Besonderheiten"></textarea></div>
              <div class="form__check">
                <input id="a-dsgvo" name="datenschutz" type="checkbox" required value="ja">
                <label for="a-dsgvo">Ich habe die <a href="/datenschutz.html">Datenschutzerklärung</a> gelesen und bin mit der Verarbeitung meiner Angaben und meiner Konfiguration zur Erstellung eines Angebots einverstanden. *</label>
              </div>
              <p class="form__error" role="alert" hidden>Bitte füllen Sie alle Pflichtfelder (*) aus.</p>
              <button class="btn btn--primary btn--block" type="submit">Angebot anfordern</button>
              <p class="konf__hint">Mit der Anfrage wird Ihre Konfiguration samt Richtpreis an uns übermittelt; der Preis wird serverseitig neu berechnet. Es entsteht kein Kaufvertrag.</p>
            </form>
          </section>
        </div>

        <aside class="konf__aside" aria-label="Ihre Konfiguration">
          <div class="preview"><div class="preview__media"><svg viewBox="0 0 320 300" role="img" aria-label="Schematische Vorschau Ihrer Konfiguration"></svg><img class="preview__foto" alt="" width="896" height="1200" decoding="async" hidden></div><p class="preview__masse"></p><p class="preview__note">Schematische Darstellung · Abbildung beispielhaft</p></div>
          <div class="price"><h3>Ihre Konfiguration</h3><p class="price__na">Preis wird berechnet …</p></div>
          <div class="summary"><h3>Zusammenfassung</h3><dl></dl><details class="posliste" hidden><summary>Positionen</summary><table><tbody></tbody></table></details></div>
        </aside>
      </div>
    </section>
    ${footer('<div class="konf__bar" aria-label="Preis und nächster Schritt"></div>')}`;
}

/* ---------- Seiten schreiben ---------- */
for (const key of Object.keys(PAGES)) {
  const dir = path.join(root, "konfigurator", key);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), status === "aus" ? pageSoon(key) : pageKonf(key));
  /* Für den Vorschau-Modus (netlify/functions/konfigurator-vorschau.js): Platzhalterseite immer bereithalten */
  fs.writeFileSync(path.join(dir, "demnaechst.html"), pageSoon(key));
}

/* ---------- Links in allen Seiten ein-/ausblenden ---------- */
function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".") || e.name === "node_modules" || e.name === "firma ferestre" || e.name === "bilder-original" || e.name === "assets") continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f, out); else if (e.name.endsWith(".html")) out.push(f);
  }
  return out;
}
let touched = 0;
for (const f of walk(root, [])) {
  const h = fs.readFileSync(f, "utf8");
  if (!h.includes("konf-link")) continue;
  const n = h.replace(/(<a class="(?:[^"]*\s)?konf-link(?:\s[^"]*)?"[^>]*?)(\s+hidden)?(>)/g, (m, a, hid, b) => a + (status === "online" ? "" : " hidden") + b);
  if (n !== h) { fs.writeFileSync(f, n); touched++; }
}

/* ---------- Sitemap ---------- */
const smPath = path.join(root, "sitemap-seiten.xml");
if (fs.existsSync(smPath)) {
  let sm = fs.readFileSync(smPath, "utf8");
  sm = sm.replace(/  <url><loc>[^<]*\/konfigurator\/[^<]*<\/loc>[^\n]*\n/g, "");
  if (status === "online") {
    const entries = Object.values(PAGES).map((p) => `  <url><loc>${SITE}${p.url}</loc><lastmod>${TODAY}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>\n`).join("");
    sm = sm.replace("</urlset>", entries + "</urlset>");
  }
  fs.writeFileSync(smPath, sm);
}

console.log(`Konfigurator: status=${status}, Preisliste ${listeOk ? "gültig" : "UNGÜLTIG (Preis auf Anfrage)"}, Seiten geschrieben, Links in ${touched} Dateien ${status === "online" ? "eingeblendet" : "ausgeblendet"}, Sitemap ${status === "online" ? "mit" : "ohne"} Konfigurator.`);
