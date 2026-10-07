/* Netlify Function: liefert ein im Admin hochgeladenes Bild aus dem Store (nur für angemeldete Admins,
   zur Vorschau in der Oberfläche). Öffentlich erscheinen die Bilder erst nach „Speichern & veröffentlichen“
   als Dateien unter /assets/bilder/admin/. GET ?id=<bild-id>&g=<breite> */
"use strict";
const store = require("./_lib/store");
const http = require("./_lib/http");

exports.handler = async (event) => {
  http.verbinde(event);
  if (!http.adminEnabled()) return http.notFound();
  const s = await http.requireSession(event);
  if (!s.ok) return s.response;
  const q = event.queryStringParameters || {};
  const id = String(q.id || "").replace(/[^a-zA-Z0-9_-]/g, "");
  const g = String(q.g || "800").replace(/\D/g, "") || "800";
  if (!id) return http.notFound();
  const buf = await store.getBinary(`bilder/${id}/${g}`);
  if (!buf) return http.notFound();
  return { statusCode: 200, headers: { "Content-Type": "image/webp", "Cache-Control": "private, max-age=300", "X-Robots-Tag": "noindex" }, body: buf.toString("base64"), isBase64Encoded: true };
};
