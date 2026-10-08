/* Kundenbewertungen (Google, MyHammer, Website) – EIN Modul für Build, Tests und Admin-Function:
     oeffentlich(liste)     – freigegebene Bewertungen in der Form, die data/bewertungen.json und die Seiten nutzen
     badgeHtml(einst)       – „Google 5,0 ★★★★★ · 4 Bewertungen“ + „MyHammer 5/5“ + Link zu allen Google-Bewertungen
     kartenHtml(liste, e)   – Karten „Das sagen unsere Kunden“ (Sterne, Text mit „Mehr lesen“, Name, Quelle, Datum),
                              auf dem Telefon als Schieber; Knopf „Jetzt bewerten“ nur mit Google-Bewertungslink
     einsetzen(html, …)     – füllt die Markierungen <!--bewertungen-badge--> und <!--bewertungen-karten--> einer Seite
   Kein aggregateRating/Review in den strukturierten Daten (Google erlaubt kein Bewertungs-Markup für die eigene Firma).
   Keine Inline-Styles (CSP). */
"use strict";
const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const QUELLEN = ["Website", "Google", "MyHammer"];
/* Vorgabe für „Alle Bewertungen auf Google ansehen“, solange in den Einstellungen kein eigener Link steht (auch bei
   älteren gespeicherten Einstellungen, in denen das Feld leer ist) */
const GOOGLE_PROFIL_STANDARD = "https://www.google.com/maps/search/?api=1&query=Fenster-WeissenBurger+UG+Ingolstadt";
function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function sterne(n) { n = Math.max(1, Math.min(5, Math.round(Number(n) || 0))); return `<span class="sterne" role="img" aria-label="${n} von 5 Sternen">${"★".repeat(n)}${"☆".repeat(5 - n)}</span>`; }
/* „2025-10“ → „ca. Oktober 2025“, „2026-03-05“ → „März 2026“ */
function formatDatum(d, ungefaehr) {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(String(d || "")); if (!m) return "";
  const t = MONATE[Number(m[2]) - 1] + " " + m[1];
  return (ungefaehr || !m[3]) ? "ca. " + t : t;
}
function quelleLogo(q) {
  if (q === "Google") return '<span class="quelle-logo quelle-logo--google" aria-hidden="true">G</span>';
  if (q === "MyHammer") return '<span class="quelle-logo quelle-logo--myhammer" aria-hidden="true">M</span>';
  return '<span class="quelle-logo quelle-logo--website" aria-hidden="true">F</span>';
}
function quelleName(q) { return QUELLEN.includes(q) ? q : "Website"; }
/* Freigegebene Bewertungen für Seiten und data/bewertungen.json (ohne E-Mail, ohne interne Felder) */
function oeffentlich(liste) {
  return (Array.isArray(liste) ? liste : []).filter((b) => b && b.text && (b.status === "freigegeben" || b.status === undefined))
    .map((b) => ({ name: String(b.name || ""), ort: String(b.ort || ""), projekt: String(b.projekt || ""), sterne: Math.max(1, Math.min(5, Number(b.sterne) || 5)), text: String(b.text), datum: String(b.datum || ""), quelle: quelleName(b.quelle) }))
    .sort((a, b) => String(b.datum).localeCompare(String(a.datum)));
}
function werte(e) {
  const bw = (e && e.bewertungen) || {};
  return {
    googleNote: String(bw.googleNote || "").trim(), googleAnzahl: Math.max(0, Math.round(Number(bw.googleAnzahl) || 0)),
    myhammerNote: String(bw.myhammerNote || "").trim(),
    profilLink: !String(bw.googleProfilLink || "").trim() ? GOOGLE_PROFIL_STANDARD : (/^https:\/\//.test(String(bw.googleProfilLink)) ? String(bw.googleProfilLink) : ""),
    bewertenLink: /^https:\/\//.test(String(bw.googleBewertungLink || "")) ? String(bw.googleBewertungLink) : "",
    myhammerLink: /^https:\/\//.test(String(bw.myhammerLink || "")) ? String(bw.myhammerLink) : "",
  };
}
function noteZahl(s) { const n = parseFloat(String(s).replace(",", ".")); return isFinite(n) ? n : 0; }
function badgeHtml(e) {
  const w = werte(e);
  if (!w.googleNote && !w.myhammerNote) return "";
  const teile = [];
  if (w.googleNote) {
    const inner = `${quelleLogo("Google")}<span class="badge-bew__text"><strong>Google</strong> <span class="badge-bew__note">${esc(w.googleNote)}</span> ${sterne(noteZahl(w.googleNote))}${w.googleAnzahl ? ` <span class="badge-bew__anzahl">· ${w.googleAnzahl} ${w.googleAnzahl === 1 ? "Bewertung" : "Bewertungen"}</span>` : ""}</span>`;
    teile.push(w.profilLink ? `<a class="badge-bew__eintrag" href="${esc(w.profilLink)}" target="_blank" rel="noopener noreferrer">${inner}</a>` : `<span class="badge-bew__eintrag">${inner}</span>`);
  }
  if (w.myhammerNote) {
    const inner = `${quelleLogo("MyHammer")}<span class="badge-bew__text"><strong>MyHammer</strong> <span class="badge-bew__note">${esc(w.myhammerNote)}</span></span>`;
    teile.push(w.myhammerLink ? `<a class="badge-bew__eintrag" href="${esc(w.myhammerLink)}" target="_blank" rel="noopener noreferrer">${inner}</a>` : `<span class="badge-bew__eintrag">${inner}</span>`);
  }
  if (w.profilLink) teile.push(`<a class="badge-bew__alle" href="${esc(w.profilLink)}" target="_blank" rel="noopener noreferrer">Alle Bewertungen auf Google ansehen</a>`);
  return `<div class="badge-bew" aria-label="Kundenbewertungen">${teile.join("")}</div>`;
}
const KURZ = 150;
function karteHtml(b, i) {
  const lang = b.text.length > KURZ;
  const id = "stimme-" + (i + 1);
  return `<li class="stimme">
          <div class="stimme__kopf">${sterne(b.sterne)}<span class="stimme__quelle">${quelleLogo(b.quelle)}${esc(b.quelle)}</span></div>
          <blockquote class="stimme__text${lang ? " is-lang" : ""}" id="${id}">${esc(b.text)}</blockquote>${lang ? `<button type="button" class="stimme__mehr" data-mehr aria-expanded="false" aria-controls="${id}">Mehr lesen</button>` : ""}
          <p class="stimme__wer"><strong>${esc(b.name)}</strong>${b.ort ? `, ${esc(b.ort)}` : ""}${b.projekt ? ` <span>· ${esc(b.projekt)}</span>` : ""}${b.datum ? ` <span>· ${esc(formatDatum(b.datum, b.quelle !== "Website"))}</span>` : ""}</p>
        </li>`;
}
function kartenHtml(liste, e, opts) {
  opts = opts || {};
  const pub = oeffentlich(liste).slice(0, opts.max || 12);
  const w = werte(e);
  if (!pub.length) return `<p class="stimmen__leer">Noch keine Bewertungen – seien Sie die/der Erste!</p>`;
  const bewerten = w.bewertenLink ? `<a class="btn btn--primary" href="${esc(w.bewertenLink)}" target="_blank" rel="noopener noreferrer">Jetzt bewerten</a>` : "";
  const alle = (opts.ohneLinks || opts.alle === 0) ? "" : (w.profilLink ? `<a class="btn btn--ghost" href="${esc(w.profilLink)}" target="_blank" rel="noopener noreferrer">Alle Bewertungen auf Google ansehen</a>` : "");
  return `<div class="stimmen">
        <ul class="stimmen__liste">
        ${pub.map(karteHtml).join("\n        ")}
        </ul>${bewerten || alle ? `\n        <div class="stimmen__aktionen">${bewerten}${alle}</div>` : ""}
      </div>`;
}
/* Markierungen einer Seite füllen; gibt { html, n } zurück */
function einsetzen(html, liste, e) {
  let n = 0;
  html = html.replace(/<!--bewertungen-badge-->[\s\S]*?<!--\/bewertungen-badge-->/g, () => { n++; return `<!--bewertungen-badge-->${badgeHtml(e)}<!--/bewertungen-badge-->`; });
  html = html.replace(/<!--bewertungen-karten(?::([a-z0-9=,]*))?-->[\s\S]*?<!--\/bewertungen-karten-->/g, (m, opt) => { n++; const o = {}; (opt || "").split(",").forEach((p) => { const [k, v] = p.split("="); if (k) o[k] = v === undefined ? true : (isNaN(Number(v)) ? v : Number(v)); }); return `<!--bewertungen-karten${opt ? ":" + opt : ""}-->${kartenHtml(liste, e, o)}<!--/bewertungen-karten-->`; });
  return { html, n };
}
module.exports = { QUELLEN, GOOGLE_PROFIL_STANDARD, formatDatum, oeffentlich, badgeHtml, kartenHtml, einsetzen, esc };
