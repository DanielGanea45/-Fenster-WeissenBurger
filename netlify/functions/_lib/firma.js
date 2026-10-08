/* Firmendaten, Öffnungszeiten, Bank, Dokumente, Website-Schalter – EINE Quelle: data/einstellungen.json
   (im Admin unter „Einstellungen“ gepflegt). Wird vom Build (Seiten, JSON-LD, Impressum, Fußzeilen, Wartung,
   Ankündigungsbanner), von den Generatoren und von den Functions (E-Mails, Belege) genutzt. */
"use strict";

const TAGE = ["mo", "di", "mi", "do", "fr", "sa", "so"];
const TAG_KURZ = { mo: "Mo", di: "Di", mi: "Mi", do: "Do", fr: "Fr", sa: "Sa", so: "So" };
const TAG_SCHEMA = { mo: "Monday", di: "Tuesday", mi: "Wednesday", do: "Thursday", fr: "Friday", sa: "Saturday", so: "Sunday" };

function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function firma(e) { return (e && e.firma) || {}; }
function vollerName(e) { const f = firma(e); return [f.name, f.rechtsform].filter(Boolean).join(" ").trim(); }
function adresseZeilen(e) { const f = firma(e); return [f.strasse, [f.plz, f.ort].filter(Boolean).join(" ")].filter(Boolean); }
function adresseHtml(e) { return adresseZeilen(e).map(esc).join("<br>"); }
/* Telefon: Anzeige wie eingegeben, tel:-Link international (+49) */
function telHref(telefon) {
  let t = String(telefon || "").replace(/[^\d+]/g, "");
  if (t.startsWith("00")) t = "+" + t.slice(2);
  else if (t.startsWith("0")) t = "+49" + t.slice(1);
  return t ? "tel:" + t : "";
}
function telInternational(telefon) { const h = telHref(telefon).replace("tel:", ""); return h ? h.replace(/^(\+49)(\d{3})(\d+)$/, "$1 $2 $3") : ""; }
function mailSpan(email, marker) {
  const [u, d] = String(email || "").split("@");
  if (!u || !d) return "";
  return `<span class="mail" data-u="${esc(u)}" data-d="${esc(d)}"${marker ? ' data-firma="mail"' : ""}>${esc(u)} [at] ${esc(d)}</span>`;
}

/* ---------- Öffnungszeiten ---------- */
function zeitOk(z) { return z === "" || /^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/.test(z); }
function kurzZeit(hhmm) { const [h, m] = hhmm.split(":"); return m === "00" ? String(Number(h)) : Number(h) + ":" + m; }
/* Gruppen aufeinanderfolgender Tage mit gleicher Zeit: [{von:"mo", bis:"fr", zeit:"09:00-17:00"}] */
function zeitenGruppen(oz) {
  oz = oz || {}; const g = [];
  for (const t of TAGE) {
    const z = String(oz[t] || "").trim(); if (!z) continue;
    const last = g[g.length - 1];
    if (last && last.zeit === z && TAGE.indexOf(last.bis) === TAGE.indexOf(t) - 1) last.bis = t; else g.push({ von: t, bis: t, zeit: z });
  }
  return g;
}
function zeitenText(oz) {
  const g = zeitenGruppen(oz);
  if (!g.length) return "Termine nach Vereinbarung";
  return g.map((x) => (x.von === x.bis ? TAG_KURZ[x.von] : TAG_KURZ[x.von] + "–" + TAG_KURZ[x.bis]) + " " + x.zeit.split("-").map(kurzZeit).join("–") + " Uhr").join(", ");
}
function zeitenSpec(oz) {
  return zeitenGruppen(oz).map((x) => {
    const tage = TAGE.slice(TAGE.indexOf(x.von), TAGE.indexOf(x.bis) + 1).map((t) => TAG_SCHEMA[t]);
    const [opens, closes] = x.zeit.split("-");
    return { "@type": "OpeningHoursSpecification", dayOfWeek: tage, opens, closes };
  });
}

/* ---------- JSON-LD ---------- */
/* Einsatzgebiet (Einstellungen → Einsatzgebiet): nur freigeschaltete Regionen als areaServed – Ingolstadt immer, Karlsruhe erst nach dem Schalter */
const REGIONEN = { ingolstadt: { name: "Ingolstadt", region: "Bayern" }, karlsruhe: { name: "Karlsruhe", region: "Baden-Württemberg" } };
function areaServed(e) {
  const eg = (e && e.einsatzgebiet) || {};
  const liste = Object.keys(REGIONEN).filter((k) => eg[k] === true || (k === "ingolstadt" && eg[k] === undefined)).map((k) => ({ "@type": "City", name: REGIONEN[k].name, containedInPlace: { "@type": "State", name: REGIONEN[k].region } }));
  return liste.length ? liste : undefined;
}
function jsonLdFirma(e, site) {
  const f = firma(e), s = (site || "https://fenster-weissenburger.de").replace(/\/$/, "");
  const out = {
    "@type": "LocalBusiness", "@id": s + "/#firma", name: vollerName(e), url: s + "/",
    telephone: telInternational(f.telefon), email: f.email || undefined,
    image: s + "/assets/logo/og-image.png", logo: s + "/assets/logo/og-image.png",
    address: { "@type": "PostalAddress", streetAddress: f.strasse, postalCode: f.plz, addressLocality: f.ort, addressRegion: "Bayern", addressCountry: "DE" },
    openingHoursSpecification: zeitenSpec(e && e.oeffnungszeiten),
    areaServed: areaServed(e),
    vatID: f.ustIdNr || undefined, priceRange: "€€",
  };
  Object.keys(out).forEach((k) => out[k] === undefined && delete out[k]);
  return out;
}
/* Aktualisiert LocalBusiness-Knoten in einem JSON-LD-Text (@graph oder einzeln); unbekannte Felder bleiben erhalten */
function jsonLdAktualisieren(text, e, site) {
  let j; try { j = JSON.parse(text); } catch (x) { return text; }
  const neu = jsonLdFirma(e, site);
  /* alle LocalBusiness-Knoten, auch verschachtelt (z. B. provider/seller) */
  const patch = (n) => {
    if (!n || typeof n !== "object") return n;
    if (Array.isArray(n)) { n.forEach(patch); return n; }
    if (n["@type"] === "LocalBusiness") for (const k of ["name", "telephone", "email", "address", "openingHoursSpecification", "vatID", "areaServed"]) { if (k in n || k === "name" || k === "telephone" || k === "address" || k === "areaServed") { if (neu[k] === undefined) delete n[k]; else n[k] = neu[k]; } }
    Object.values(n).forEach(patch);
    return n;
  };
  patch(j);
  return JSON.stringify(j, null, text.includes("\n  ") ? 2 : 0);
}

/* ---------- Bausteine für Seiten ---------- */
function kontaktKarteHtml(e) {
  const f = firma(e);
  return `<address class="contact__card">
            <strong data-firma="name">${esc(vollerName(e))}</strong><br>
            <span data-firma="adresse">${adresseHtml(e)}</span><br>
            <a href="${telHref(f.telefon)}" data-firma="tel">${esc(f.telefon)}</a><br>
            ${mailSpan(f.email, true)}<br>
            <span class="muted" data-firma="zeiten">${esc(zeitenText(e && e.oeffnungszeiten))}</span>
          </address>`;
}
/* Impressum/Datenschutz-Bausteine */
function anbieterHtml(e) { const f = firma(e); return `<strong>${esc(vollerName(e))}</strong><br>\n      ${adresseHtml(e)}<br>\n      Deutschland`; }
function gfHtml(e) { return `Geschäftsführer: ${esc(firma(e).geschaeftsfuehrer)}`; }
function kontaktHtml(e) { const f = firma(e); return `Telefon: <a href="${telHref(f.telefon)}">${esc(f.telefon)}</a><br>\n    E-Mail: ${mailSpan(f.email)}<br>\n    Erreichbarkeit: ${esc(zeitenText(e && e.oeffnungszeiten))}`; }
function registerHtml(e) { const f = firma(e); return `Eintragung im Handelsregister<br>\n    Registergericht: ${esc(f.registergericht)}<br>\n    Registernummer: ${esc(f.registernummer)}`; }
function ustIdHtml(e) { return `Umsatzsteuer-Identifikationsnummer gemäß § 27 a Umsatzsteuergesetz:<br>${esc(firma(e).ustIdNr)}`; }
function verantwortlichHtml(e) { return `${esc(firma(e).geschaeftsfuehrer)}<br>${adresseHtml(e)}`; }
function verantwortlicherDsgvoHtml(e) { const f = firma(e); return `<strong>${esc(vollerName(e))}</strong><br>\n      vertreten durch den Geschäftsführer ${esc(f.geschaeftsfuehrer)}<br>\n      ${adresseHtml(e)}<br>\n      Telefon: <a href="${telHref(f.telefon)}">${esc(f.telefon)}</a><br>\n      E-Mail: ${mailSpan(f.email)}`; }

/* Straßenname ohne Hausnummer („Richard-Strauß-Straße 21“ → „Richard-Strauß-Straße“) */
function strassenName(e) { return String(firma(e).strasse || "").replace(/\s+\d[\w\s\/-]*$/, "").trim(); }
const BAUSTEINE = { "strasse-name": (e) => esc(strassenName(e)), wartungstext: (e) => esc((e && e.website && e.website.wartungText) || ""), name: (e) => esc(vollerName(e)), adresse: adresseHtml, zeiten: (e) => esc(zeitenText(e && e.oeffnungszeiten)), anbieter: anbieterHtml, gf: gfHtml, kontakt: kontaktHtml, register: registerHtml, ustid: ustIdHtml, verantwortlich: verantwortlichHtml, "verantwortlicher-dsgvo": verantwortlicherDsgvoHtml };

/* Setzt alle data-firma-Marker einer HTML-Seite aus den Einstellungen; gibt { html, n } zurück */
function einsetzen(html, e, site) {
  let n = 0;
  const f = firma(e);
  // Inhalte: <tag … data-firma="X" …>…</tag> (kein gleicher Tag verschachtelt)
  html = html.replace(/<(strong|span|p|a|div|address)\b([^>]*?)\sdata-firma="([a-z-]+)"([^>]*)>([\s\S]*?)<\/\1>/g, (m, tag, vor, art, nach, inner) => {
    let attrs = vor + ' data-firma="' + art + '"' + nach;
    if (art === "tel" || art === "tel-href") {
      attrs = attrs.replace(/\shref="tel:[^"]*"/, ' href="' + telHref(f.telefon) + '"');
      if (!/href=/.test(attrs)) attrs = ' href="' + telHref(f.telefon) + '"' + attrs;
      n++; return `<${tag}${attrs}>${art === "tel" ? esc(f.telefon) : inner}</${tag}>`;
    }
    if (art === "mail") { n++; return mailSpan(f.email, true); }
    if (BAUSTEINE[art]) { n++; return `<${tag}${attrs}>${BAUSTEINE[art](e)}</${tag}>`; }
    return m;
  });
  // Google-Bewertungslink (Einstellungen → Bewertungen & Google): Button nur mit Link sichtbar
  html = html.replace(/<a\b([^>]*?)\sdata-firma="google-review"([^>]*)>/g, (m, vor, nach) => {
    const link = (e && e.bewertungen && e.bewertungen.googleBewertungLink) || "";
    let attrs = (vor + nach).replace(/\shref="[^"]*"/, "").replace(/\shidden\b/, "");
    n++; return `<a href="${link ? esc(link) : "#"}"${attrs} data-firma="google-review"${link ? "" : " hidden"}>`;
  });
  // JSON-LD
  html = html.replace(/(<script type="application\/ld\+json"[^>]*data-firma="jsonld"[^>]*>)([\s\S]*?)(<\/script>)/g, (m, a, body, z) => { n++; return a + jsonLdAktualisieren(body, e, site) + z; });
  return { html, n };
}

/* ---------- Ankündigungsbanner ---------- */
/* Zeitraum: leer = bis zum Ausschalten; mit „bis“ in der Vergangenheit wird das Banner schon im Build weggelassen (der Browser
   prüft zusätzlich jeden Tag, damit es im Zeitraum von selbst erscheint und danach verschwindet) */
function bannerAktiv(b, heute) {
  if (!b || !b.aktiv || !String(b.text || "").trim()) return false;
  const h = heute || new Date().toISOString().slice(0, 10);
  if (b.bis && /^\d{4}-\d{2}-\d{2}$/.test(b.bis) && b.bis < h) return false;
  return true;
}
function bannerHtml(e) {
  const b = (e && e.website && e.website.banner) || {};
  if (!bannerAktiv(b)) return "";
  return `<div class="ankuendigung" data-von="${esc(b.von || "")}" data-bis="${esc(b.bis || "")}" role="status" hidden><p>${esc(b.text)}</p><button type="button" class="ankuendigung__zu" aria-label="Hinweis schließen">×</button></div>`;
}
function bannerBlock(e) { const neu = bannerHtml(e); return neu ? `<!--ankuendigung-->${neu}<!--/ankuendigung-->` : ""; }
function bannerEinsetzen(html, e) {
  const block = bannerBlock(e);
  /* vorhandenen Block ersetzen – Zeilenumbruch davor so lassen, wie er ist (Generatoren setzen den Block direkt nach <body>; idempotent) */
  if (/<!--ankuendigung-->[\s\S]*?<!--\/ankuendigung-->/.test(html)) return html.replace(/(\n?)<!--ankuendigung-->[\s\S]*?<!--\/ankuendigung-->/, (m, nl) => (block ? nl + block : ""));
  if (!block) return html;
  return html.replace(/(<body\b[^>]*>)/, "$1\n" + block);
}

/* ---------- Agentur-Hinweis im Footer (eine Quelle für alle öffentlichen Seiten) ----------
   Logo + Text bilden einen Link; nur auf Seiten mit dem Marker <!--agentur--> (statische Seiten) bzw. über agenturBlock() in den
   Generatoren (Produkte, Konfigurator, Einsatzgebiet-Übersicht). Ortsseiten, wartung.html und Admin bekommen den Block nicht.
   Nicht im Textregister (kein data-text), nicht im Assistent-Wissen (Fußzeile wird dort nicht gelesen), kein JSON-LD. */
const AGENTUR = { name: "CristianWeb", url: "https://cristianweb.de", logo: "/assets/logo/cristianweb.webp", text: "Website erstellt von" };
function agenturHtml() {
  return `<p class="legal__agentur"><a href="${AGENTUR.url}" target="_blank" rel="noopener"><img src="${AGENTUR.logo}" width="40" height="40" alt="${AGENTUR.name}" loading="lazy" decoding="async">${AGENTUR.text} ${AGENTUR.name}</a></p>`;
}
function agenturBlock() { return `<!--agentur-->${agenturHtml()}<!--/agentur-->`; }
function agenturEinsetzen(html) {
  if (!/<!--agentur-->[\s\S]*?<!--\/agentur-->/.test(html)) return html;
  return html.replace(/<!--agentur-->[\s\S]*?<!--\/agentur-->/g, agenturBlock());
}

/* ---------- Wartungsmodus (_redirects) ---------- */
function wartungRedirects(e) {
  if (!(e && e.website && e.website.wartung)) return "";
  return [
    "# Wartungsmodus (Admin → Einstellungen → Website): Besucher sehen /wartung.html, der Admin bleibt erreichbar",
    "/admin/*  /.netlify/functions/admin-seite  200!",
    "/wartung.html  /wartung.html  200",
    "/assets/*  /assets/:splat  200",
    "/css/*  /css/:splat  200",
    "/js/*  /js/:splat  200",
    "/*  /wartung.html  200!",
    "",
  ].join("\n");
}

/* ---------- Bank / Dokumente ---------- */
function ibanGueltig(iban) {
  const s = String(iban || "").replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
  const um = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rest = 0; for (const ch of um) rest = (rest * 10 + Number(ch)) % 97;
  return rest === 1;
}
function ibanFormat(iban) { return String(iban || "").replace(/\s+/g, "").toUpperCase().replace(/(.{4})/g, "$1 ").trim(); }
function bicGueltig(bic) { return /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(String(bic || "").trim().toUpperCase()); }
function nummerGueltig(n) { return /^[A-Z]{1,5}-\d{4}-\d{3,6}$/.test(String(n || "")); }
/* Fehlen Bank- oder Dokumentdaten, erscheinen Belege als MUSTER */
function dokumenteMuster(e) {
  const b = (e && e.bank) || {}, d = (e && e.dokumente) || {};
  const fehlt = [];
  if (!b.kontoinhaber) fehlt.push("Kontoinhaber"); if (!ibanGueltig(b.iban)) fehlt.push("IBAN"); if (!bicGueltig(b.bic)) fehlt.push("BIC"); if (!b.bank) fehlt.push("Bank");
  for (const [k, l] of [["angebot", "Angebotsnummer"], ["auftragsbestaetigung", "AB-Nummer"], ["rechnung", "Rechnungsnummer"]]) if (!d[k] || !nummerGueltig(d[k].nummerStart)) fehlt.push(l + " (Startnummer)");
  return { muster: fehlt.length > 0, fehlt };
}

module.exports = { AGENTUR, agenturHtml, agenturBlock, agenturEinsetzen, bannerAktiv, TAGE, TAG_KURZ, esc, firma, vollerName, strassenName, adresseZeilen, adresseHtml, telHref, telInternational, mailSpan, zeitOk, zeitenGruppen, zeitenText, zeitenSpec, jsonLdFirma, jsonLdAktualisieren, kontaktKarteHtml, BAUSTEINE, einsetzen, bannerHtml, bannerBlock, bannerEinsetzen, wartungRedirects, ibanGueltig, ibanFormat, bicGueltig, nummerGueltig, dokumenteMuster };
