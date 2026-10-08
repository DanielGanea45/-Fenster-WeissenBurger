/* Produktkarten (Startseite, /produkte/) aus data/produkte.json – gepflegt im Admin → Produkte.
   EIN Modul für Build, Generatoren und Tests. Ganze Karte ist ein Link; Preiszeile nur mit gesetztem Preis;
   Steuerhinweis ausschließlich aus js/steuer.js. Keine Inline-Styles (CSP). */
"use strict";
const Steuer = require("../../../js/steuer.js");
const Hinweise = require("../../../js/hinweise.js");

function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function karten(daten, wo) {
  const liste = ((daten && daten.karten) || []).filter((k) => k && k.sichtbar !== false);
  return wo === "startseite" ? liste.filter((k) => k.startseite !== false) : liste;
}
function euro(betrag) { return Number(betrag).toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + " €"; }
function pfad(p, basis) { p = String(p || ""); if (/^https?:\/\//.test(p)) return p; return (basis || "") + p.replace(/^\//, ""); }
function bildHtml(k, basis, eager) {
  const b = k.bild || {};
  if (!b.src) return "";
  const srcset = b.srcset ? b.srcset.split(",").map((t) => { const [u, w] = t.trim().split(/\s+/); return pfad(u, basis) + (w ? " " + w : ""); }).join(", ") : "";
  return `<img src="${esc(pfad(b.src, basis))}"${srcset ? ` srcset="${esc(srcset)}"` : ""} sizes="(min-width: 900px) 22vw, 70vw"${b.breite ? ` width="${b.breite}"` : ""}${b.hoehe ? ` height="${b.hoehe}"` : ""} alt="${esc(b.alt || k.titel)}"${eager ? "" : ' loading="lazy"'} decoding="async">`;
}
function preisHtml(k, satz) {
  const p = Number(k.abPreis);
  if (!(p > 0)) return "";
  return `<p class="price">ab <strong>${esc(euro(p))}</strong> <small>${esc(Steuer.texte(satz).kurz)}</small></p><p class="price__hinweis">${esc(Hinweise.richtpreis.kurz)}</p>`;
}
/* Startseite: scrollbare Kartenreihe, ganze Karte verlinkt */
function startHtml(daten, einst, basis) {
  const satz = Steuer.satz(einst);
  const liste = karten(daten, "startseite");
  return `<ul class="products">\n${liste.map((k, i) => `              <li class="product" data-produkt="${esc(k.id)}">
                <a class="product__link" href="${esc(pfad(k.link, basis))}">
                  ${bildHtml(k, basis, false)}
                  <h3>${esc(k.titel)}</h3>
                  <p>${esc(k.kurz)}</p>
                  ${preisHtml(k, satz)}
                  <span class="product__more" aria-hidden="true">Mehr erfahren</span>
                </a>
              </li>`).join("\n")}\n            </ul>`;
}
/* Produktübersicht: Kategorie-Karten im Raster */
function uebersichtHtml(daten, einst) {
  const satz = Steuer.satz(einst);
  return `<ul class="cards cards--grid">\n${karten(daten, "alle").map((k) => `          <li class="card" data-produkt="${esc(k.id)}">
            <a class="card__link" href="${esc(pfad(k.link, "/"))}">
              ${bildHtml(k, "/", false)}
              <div class="card__body">
                <h3>${esc(k.titel)}</h3>
                ${k.untertitel ? `<p class="sub">${esc(k.untertitel)}</p>` : ""}
                <p>${esc(k.kurz)}</p>
                ${preisHtml(k, satz)}
                <span class="link">Mehr erfahren</span>
              </div>
            </a>
          </li>`).join("\n")}\n        </ul>`;
}
/* Block zwischen <!--produkte-karten--> … <!--/produkte-karten--> ersetzen */
function einsetzen(html, daten, einst, basis) {
  const re = /<!--produkte-karten-->[\s\S]*?<!--\/produkte-karten-->/;
  if (!re.test(html)) return { html, n: 0 };
  return { html: html.replace(re, `<!--produkte-karten-->\n            ${startHtml(daten, einst, basis)}\n            <!--/produkte-karten-->`), n: 1 };
}
function jsonLd(daten, site) {
  return { "@context": "https://schema.org", "@type": "ItemList", name: "Produkte von Fenster-WeissenBurger", itemListElement: karten(daten, "alle").map((k, i) => ({ "@type": "ListItem", position: i + 1, name: k.titel, url: site.replace(/\/$/, "") + pfad(k.link, "/") })) };
}
module.exports = { karten, startHtml, uebersichtHtml, einsetzen, jsonLd, bildHtml, preisHtml, euro, esc };
