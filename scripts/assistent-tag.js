/* KI-Assistent: EIN <script>-Tag für alle öffentlichen Seiten – Konfiguration als data-Attribute (kein Inline-Skript, CSP bleibt
   streng, das Skript selbst bleibt minimierbar). Aktiv nur mit OpenAI-Schlüssel (nur „vorhanden ja/nein“, nie der Wert)
   UND Schalter in Admin → Assistent. Genutzt von den Seitengeneratoren und von scripts/build.js (statische Seiten).
     data-aktiv    "1" | "0"
     data-whatsapp Nummer für „Lieber per WhatsApp?“ (nur Ziffern) oder leer
     data-css      Pfad des eigenen Stylesheets (Versionskennung setzt scripts/assets-version.js wie bei allen Assets) */
"use strict";
function aktiv(einst, schluesselVorhanden) {
  const vorhanden = schluesselVorhanden === undefined ? !!String(process.env.OPENAI_API_KEY || "").trim() : !!schluesselVorhanden;
  return vorhanden && !!(einst && einst.assistent && einst.assistent.aktiv !== false);
}
function whatsapp(einst) { return String(einst && einst.website && einst.website.whatsapp || "").replace(/\D/g, ""); }
/* prefix: "" für Seiten im Wurzelverzeichnis (relative Pfade wie index.html), "/" für absolute Pfade (Unterseiten, Generatoren) */
function tag(einst, prefix, versionJs, versionCss, schluesselVorhanden) {
  return `<script src="${prefix}js/assistent.js?v=${versionJs || 1}" defer data-aktiv="${aktiv(einst, schluesselVorhanden) ? "1" : "0"}" data-whatsapp="${whatsapp(einst)}" data-css="${prefix}css/assistent.css?v=${versionCss || 1}"></script>`;
}
const RE = /<script src="(\/?)js\/assistent\.js\?v=([a-z0-9]+)" defer(?: data-aktiv="[01]")?(?: data-whatsapp="[^"]*")?(?: data-css="[^"]*css\/assistent\.css\?v=([a-z0-9]+)")?><\/script>/;
/* Vorhandenen Tag in einer HTML-Datei auf die aktuelle Konfiguration bringen (Versionskennungen bleiben erhalten) */
function einsetzen(html, einst, schluesselVorhanden) {
  return html.replace(RE, (m, prefix, vJs, vCss) => tag(einst, prefix, vJs, vCss || 1, schluesselVorhanden));
}
module.exports = { aktiv, whatsapp, tag, einsetzen, RE };
