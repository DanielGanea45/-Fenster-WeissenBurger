/* Netlify Function: Konfigurator im Modus „Vorschau“. Der Build legt dafür in _redirects eine Weiterleitung
   /konfigurator/* → diese Function an. Angemeldete Admins sehen den vollständigen Konfigurator mit dem
   Banner „Vorschau – nicht öffentlich“; alle anderen die Seite „Demnächst verfügbar“ (noindex). */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("./_lib/http");

const ROOT = path.join(__dirname, "..", "..");
function lies(rel) { const p = path.join(ROOT, rel); return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null; }

const BANNER = `<div class="vorschau-banner" role="status">Vorschau – nicht öffentlich · Dieser Konfigurator ist nur für angemeldete Administratoren sichtbar. <a href="/admin/#preise">Zum Admin</a></div>`;

exports.handler = async (event) => {
  const p = (event.path || "/konfigurator/fenster/").replace(/\/+$/, "/");
  const art = /haustuer/.test(p) ? "haustuer" : "fenster";
  const s = await http.requireSession(event);
  let html;
  if (s.ok) {
    html = lies(`konfigurator/${art}/index.html`);
    if (html) {
      if (!/noindex/.test(html)) html = html.replace("</head>", '<meta name="robots" content="noindex, nofollow"></head>');
      html = html.replace(/<body([^>]*)>/, `<body$1>${BANNER}`);
    }
  } else {
    html = lies(`konfigurator/${art}/demnaechst.html`) || lies("danke.html");
    if (html && !/noindex/.test(html)) html = html.replace("</head>", '<meta name="robots" content="noindex, nofollow"></head>');
  }
  if (!html) return http.html(404, "<h1>Demnächst verfügbar</h1>");
  return http.html(200, html, { "Cache-Control": "private, no-store" });
};
