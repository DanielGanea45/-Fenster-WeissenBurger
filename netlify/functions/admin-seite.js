/* Netlify Function: liefert die Admin-Oberfläche (admin/index.html) aus – /admin/* wird per Rewrite
   hierher geleitet. So kann der Zugang zur Laufzeit abgeschaltet werden: auf Produktion ohne
   ADMIN_SETUP_TOKEN antwortet alles mit 404 (kein Rebuild nötig, sobald die Variable gesetzt ist). */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("./_lib/http");

let HTML = null;
function seite() {
  if (HTML) return HTML;
  const kandidaten = [path.join(__dirname, "..", "..", "admin", "index.html"), path.join(process.cwd(), "admin", "index.html")];
  for (const k of kandidaten) if (fs.existsSync(k)) { HTML = fs.readFileSync(k, "utf8"); return HTML; }
  throw new Error("admin/index.html nicht gefunden");
}

exports.handler = async (event) => {
  http.verbinde(event);
  if (!http.adminEnabled()) return http.notFound();
  const p = event.path || "/admin/";
  if (!/^\/admin(\/|$)/.test(p) && !/admin-seite/.test(p)) return http.notFound();
  let html;
  try { html = seite(); } catch (e) { return http.html(500, "<h1>Admin-Oberfläche nicht gefunden</h1>"); }
  return http.html(200, html, { "X-Frame-Options": "DENY" });
};
