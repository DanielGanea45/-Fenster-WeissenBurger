/* Hinweise – EIN Modul für Browser (window.FWHinweise), Netlify Functions, Build und Tests.
   Hier und NUR hier steht der Preishinweis, der überall neben Preisen erscheint: Konfigurator (Preiskasten,
   Leiste, Zusammenfassung, Schritt „Angebot“), Produktkarten mit „ab … €“, Anfrage-E-Mail.
   Die beiden Texte sind im Admin unter Texte → „Preishinweis“ als geschützte Bausteine änderbar; der Build setzt
   die gespeicherte Fassung zwischen den Markierungen ein (scripts/inhalte-registry.js, scripts/build.js). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.FWHinweise = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var RICHTPREIS_LANG = /*TEXT:hinweise-1*/"Alle Preise sind unverbindliche Richtpreise und dienen Ihrer ersten Orientierung. Ihr verbindliches Angebot erhalten Sie nach dem kostenlosen Aufmaß bei Ihnen vor Ort – oder nach Prüfung Ihrer genauen Maße, Fotos und Anforderungen."/*/TEXT*/;
  var RICHTPREIS_KURZ = /*TEXT:hinweise-2*/"Unverbindlicher Richtpreis – verbindliches Angebot nach Aufmaß"/*/TEXT*/;
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  return {
    richtpreis: { lang: RICHTPREIS_LANG, kurz: RICHTPREIS_KURZ },
    /* Fertige HTML-Zeile für die kurze Fassung (neben Preisen) und die lange Fassung (unter Preiskästen) */
    kurzHtml: function (klasse) { return '<p class="' + (klasse || "preishinweis") + '">' + esc(RICHTPREIS_KURZ) + "</p>"; },
    langHtml: function (klasse) { return '<p class="' + (klasse || "preishinweis preishinweis--lang") + '">' + esc(RICHTPREIS_LANG) + "</p>"; },
  };
});
