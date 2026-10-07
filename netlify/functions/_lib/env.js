/* Umgebungsvariablen bereinigen: Werte, die aus PowerShell/Terminal in das Netlify-Formular kopiert werden,
   enthalten gern Leerzeichen oder Zeilenumbrüche am Ende. Alle von der Website gelesenen Variablen werden
   deshalb einmalig beim Laden getrimmt (in process.env selbst, damit jede Lesestelle den sauberen Wert sieht). */
"use strict";
const VARIABLEN = [
  "ADMIN_SETUP_TOKEN", "SESSION_SECRET", "NETLIFY_BLOBS_TOKEN", "NETLIFY_BUILD_HOOK", "BREVO_API_KEY", "MAIL_FROM", "MAIL_FROM_NAME",
  "FRC_API_KEY", "FRC_SITEKEY", "FRC_ENDPOINT", "SPAM_MIN_SECONDS", "SITE_ID", "URL", "DEPLOY_PRIME_URL", "CONTEXT", "FW_STORE_DIR",
];
function bereinige(env = process.env) {
  const geaendert = [];
  for (const k of VARIABLEN) {
    if (typeof env[k] !== "string") continue;
    const sauber = env[k].trim();
    if (sauber !== env[k]) { env[k] = sauber; geaendert.push(k); }
  }
  return geaendert;
}
/* Hinweis für das Build-Protokoll, wenn Netlify Blobs den Zugriff verweigert – ohne den Wert zu zeigen */
function blobsTokenHinweis(env = process.env) {
  const t = env.NETLIFY_BLOBS_TOKEN;
  if (t === undefined) return "NETLIFY_BLOBS_TOKEN: nicht gesetzt (Scope „Builds“ und Kontext prüfen).";
  const s = String(t).trim();
  return `NETLIFY_BLOBS_TOKEN: vorhanden, Länge ${s.length} Zeichen (nach trim)${String(t) !== s ? ", enthielt Leerraum" : ""}, beginnt mit „nfp_“: ${s.startsWith("nfp_") ? "ja" : "nein"}. Netlify-Antwort 401/403 heißt: Token ungültig, abgelaufen oder ohne Zugriff auf diese Site – neuen Personal Access Token erzeugen und als geheime Variable (Scope Builds) setzen.`;
}
const bereinigt = bereinige();
module.exports = { VARIABLEN, bereinige, blobsTokenHinweis, bereinigt };
