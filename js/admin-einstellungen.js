/* Admin → Einstellungen: Zweige links, Einstellungen als Liste rechts. Jede Speicherung ist versioniert
   (Änderungsprotokoll) und veröffentlicht die Website automatisch, wenn der Zweig sie verändert.
   Nutzt die Hilfen aus js/admin.js (window.FWAdmin). Keine Inline-Styles (CSP). */
(function () {
  "use strict";
  const A = window.FWAdmin; if (!A) return;
  const { $, $$, h, api, toast, bestaetigen, S, I, setDirty, startPoll, ladeStatus, PV, Steuer } = A;
  const klon = (o) => JSON.parse(JSON.stringify(o));
  const getP = (o, p) => p.split(".").reduce((a, k) => (a == null ? a : a[k]), o);
  const setP = (o, p, v) => { const ks = p.split("."); let a = o; for (let i = 0; i < ks.length - 1; i++) { if (a[ks[i]] == null || typeof a[ks[i]] !== "object") a[ks[i]] = {}; a = a[ks[i]]; } a[ks[ks.length - 1]] = v; };
  const TAGE = [["mo", "Mo"], ["di", "Di"], ["mi", "Mi"], ["do", "Do"], ["fr", "Fr"], ["sa", "Sa"], ["so", "So"]];
  const STATUS_LABEL = { aus: "Aus", vorschau: "Vorschau", online: "Online" };

  /* Öffnungszeiten als Text (wie auf der Website) */
  function zeitenText(oz) {
    oz = oz || {}; const g = [];
    const kurz = (t) => { const [hh, mm] = t.split(":"); return mm === "00" ? String(Number(hh)) : Number(hh) + ":" + mm; };
    TAGE.forEach(([k, l], i) => { const z = String(oz[k] || "").trim(); if (!z) return; const last = g[g.length - 1]; if (last && last.zeit === z && last.bisIdx === i - 1) { last.bis = l; last.bisIdx = i; } else g.push({ von: l, bis: l, bisIdx: i, zeit: z }); });
    if (!g.length) return "Termine nach Vereinbarung";
    return g.map((x) => (x.von === x.bis ? x.von : x.von + "–" + x.bis) + " " + x.zeit.split("-").map(kurz).join("–") + " Uhr").join(", ");
  }

  const ICON = {
    firma: I('<path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6M9 10h.01M15 10h.01M9 14h.01M15 14h.01"/>'),
    steuer: I('<path d="M4 4h16v16H4z"/><path d="M8 9h8M8 13h5M15 16l3-3"/>'),
    bank: I('<path d="M3 10l9-6 9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 20h18"/>'),
    dokumente: I('<path d="M6 3h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v6h6M9 13h6M9 17h4"/>'),
    email: I('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>'),
    bewertungen: I('<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z"/>'),
    oeffnungszeiten: I('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    konfigurator: I('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 10v10"/>'),
    website: I('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'),
    konten: I('<rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/><circle cx="12" cy="16" r="1.5"/>'),
  };

  /* Felder: p = Pfad in den Einstellungen, l = Titel, d = Beschreibung, t = Typ */
  const ZWEIGE = [
    { id: "firma", titel: "Firma & Kontakt", desc: "Eine Quelle für Impressum, Fußzeile, Kontaktkarten, Suchmaschinen-Daten und Dokumente.", bereiche: ["firma"], website: true, karten: [
      { titel: "Unternehmen", felder: [{ p: "firma.name", l: "Firmenname", d: "Ohne Rechtsform" }, { p: "firma.rechtsform", l: "Rechtsform", d: "z. B. UG (haftungsbeschränkt)" }, { p: "firma.geschaeftsfuehrer", l: "Geschäftsführer", d: "Erscheint im Impressum als Vertretungsberechtigter" }] },
      { titel: "Anschrift", felder: [{ p: "firma.strasse", l: "Straße und Hausnummer" }, { p: "firma.plz", l: "Postleitzahl", t: "text", attrs: 'inputmode="numeric" maxlength="5"' }, { p: "firma.ort", l: "Ort" }] },
      { titel: "Kontakt", felder: [{ p: "firma.telefon", l: "Telefon", d: "So, wie es auf der Website stehen soll", t: "tel" }, { p: "firma.email", l: "E-Mail", d: "Wird auf der Website vor Adress-Sammlern geschützt dargestellt", t: "email" }] },
      { titel: "Register & Umsatzsteuer-ID", felder: [{ p: "firma.registernummer", l: "Handelsregister", d: "z. B. HRB 12705" }, { p: "firma.registergericht", l: "Registergericht", d: "z. B. Amtsgericht Ingolstadt" }, { p: "firma.ustIdNr", l: "Umsatzsteuer-ID", d: "Identifikationsnummer nach § 27 a, z. B. DE123456789" }] },
    ] },
    { id: "steuer", titel: "Steuer", desc: "Kleinunternehmer-Regelung oder Regelbesteuerung – gilt für alle Preise, den Konfigurator, E-Mails und Dokumente.", bereiche: ["steuer"], website: true, custom: "steuer" },
    { id: "bank", titel: "Bank & Zahlung", desc: "Bankverbindung und Zahlungsbedingungen für Angebote und Rechnungen.", bereiche: ["bank"], website: false, hinweis: "Solange Bankdaten oder Startnummern fehlen, werden Dokumente als MUSTER gekennzeichnet.", karten: [
      { titel: "Bankverbindung", felder: [{ p: "bank.bank", l: "Bank" }, { p: "bank.kontoinhaber", l: "Kontoinhaber" }, { p: "bank.iban", l: "IBAN", d: "Wird auf Prüfsumme geprüft", t: "iban" }, { p: "bank.bic", l: "BIC", d: "8 oder 11 Zeichen" }] },
      { titel: "Zahlungsbedingungen", felder: [{ p: "bank.zahlungszielTage", l: "Zahlungsziel", d: "Tage nach Rechnungsdatum", t: "number", einheit: "Tage" }, { p: "bank.anzahlungProzent", l: "Anzahlung", d: "Anteil bei Auftragsbestätigung; 0 = keine Anzahlung", t: "number", einheit: "%" }, { p: "bank.skontoProzent", l: "Skonto", d: "Optional; 0 = kein Skonto", t: "number", einheit: "%" }, { p: "bank.skontoTage", l: "Skonto-Frist", d: "Tage, innerhalb derer Skonto gilt", t: "number", einheit: "Tage" }] },
    ] },
    { id: "dokumente", titel: "Dokumente", desc: "Nummernkreise, Gültigkeit und Standardtexte für Angebot, Auftragsbestätigung und Rechnung.", bereiche: ["dokumente"], website: false, warnung: "Die Rechnungsnummer kann nach der ersten festgeschriebenen Rechnung nicht mehr herabgesetzt werden. Nummern werden fortlaufend und lückenlos vergeben.", karten: [
      { titel: "Angebot", felder: [{ p: "dokumente.angebot.nummerStart", l: "Startnummer", d: "Format AN-2026-0001; das Jahr wechselt automatisch" }, { p: "dokumente.angebot.gueltigTage", l: "Gültigkeit", d: "Tage ab Angebotsdatum", t: "number", einheit: "Tage" }, { p: "dokumente.angebot.einleitung", l: "Einleitungstext", d: "Steht über den Positionen", t: "textarea" }, { p: "dokumente.angebot.schluss", l: "Schlusstext", d: "Steht unter den Summen", t: "textarea" }] },
      { titel: "Auftragsbestätigung", felder: [{ p: "dokumente.auftragsbestaetigung.nummerStart", l: "Startnummer", d: "Format AB-2026-0001" }, { p: "dokumente.auftragsbestaetigung.einleitung", l: "Einleitungstext", t: "textarea" }, { p: "dokumente.auftragsbestaetigung.schluss", l: "Schlusstext", t: "textarea" }] },
      { titel: "Rechnung", felder: [{ p: "dokumente.rechnung.nummerStart", l: "Startnummer", d: "Format RE-2026-0001" }, { p: "dokumente.rechnung.einleitung", l: "Einleitungstext", t: "textarea" }, { p: "dokumente.rechnung.schluss", l: "Schlusstext", t: "textarea" }] },
    ] },
    { id: "email", titel: "E-Mail & Benachrichtigungen", desc: "Wer wird bei neuen Anfragen und Bewertungen benachrichtigt, und mit welchem Absendernamen versendet die Website.", bereiche: ["email"], website: false, karten: [
      { titel: "Benachrichtigungen", felder: [{ p: "email.anfragen", l: "Anfragen an", d: "Leer = Adresse aus dem Konto", t: "email" }, { p: "email.bewertungen", l: "Bewertungen an", d: "Leer = Adresse aus dem Konto", t: "email" }] },
      { titel: "Absender", felder: [{ p: "email.absenderName", l: "Absendername", d: "So erscheint die Website im Posteingang" }] },
    ] },
    { id: "bewertungen", titel: "Bewertungen & Google", desc: "Bewertungs-Abzeichen (Startseite, Kontakt, Referenzen), Knopf „Jetzt bewerten“ und Link zu allen Google-Bewertungen. Die einzelnen Kundenstimmen pflegen Sie unter „Bewertungen“.", bereiche: ["bewertungen"], website: true, karten: [
      { titel: "Google", felder: [{ p: "bewertungen.googleNote", l: "Google-Note", d: "So, wie Google sie anzeigt, z. B. 5,0" }, { p: "bewertungen.googleAnzahl", l: "Anzahl der Google-Bewertungen", d: "Erscheint im Abzeichen: „· 4 Bewertungen“", t: "number", einheit: "Bewertungen" }, { p: "bewertungen.googleProfilLink", l: "Alle Bewertungen auf Google", d: "Ziel des Links „Alle Bewertungen auf Google ansehen“ (https://…); leer = Google-Maps-Suche nach der Firma", t: "url" }, { p: "bewertungen.googleBewertungLink", l: "Google-Bewertung schreiben", d: "Ziel des Knopfs „Jetzt bewerten“ – leer = kein Knopf (https://…)", t: "url" }] },
      { titel: "MyHammer", felder: [{ p: "bewertungen.myhammerNote", l: "MyHammer-Bewertung", d: "z. B. 5/5 – leer = kein MyHammer-Abzeichen" }, { p: "bewertungen.myhammerLink", l: "MyHammer-Profil", d: "Optional: Link zum Profil (https://…)", t: "url" }] },
    ] },
    { id: "oeffnungszeiten", titel: "Öffnungszeiten & Einsatzgebiet", desc: "Öffnungszeiten erscheinen bei Kontakt, in der Fußzeile und in den Suchmaschinen-Daten. Regionen schalten die Einsatzgebiet-Seiten frei.", bereiche: ["oeffnungszeiten", "einsatzgebiet"], website: true, custom: "zeiten" },
    { id: "konfigurator", titel: "Konfigurator", desc: "Sichtbarkeit des Online-Konfigurators – dieselbe Einstellung wie unter „Preise & Konfigurator“.", bereiche: ["konfigurator"], website: true, custom: "konfigurator" },
    { id: "konten", titel: "Konten & Zugänge", desc: "Alle Dienste hinter der Website mit Zuständigkeit und Status – für die Übergabe an den Inhaber. Keine Passwörter.", bereiche: ["konten"], website: false, custom: "konten" },
    { id: "website", titel: "Website", desc: "Wartungsmodus und ein optionales Ankündigungsbanner für alle Besucher.", bereiche: ["website"], website: true, karten: [
      { titel: "Wartungsmodus", felder: [{ p: "website.wartung", l: "Wartungsmodus", d: "Besucher sehen „Wir sind gleich wieder da“; der Admin bleibt erreichbar", t: "toggle" }, { p: "website.wartungText", l: "Text auf der Wartungsseite", t: "textarea" }] },
      { titel: "Ankündigung", felder: [{ p: "website.banner.aktiv", l: "Banner anzeigen", d: "Schmale Leiste unter dem Menü auf allen Seiten", t: "toggle" }, { p: "website.banner.text", l: "Text", d: "Kurz halten – ein Satz", t: "textarea" }, { p: "website.banner.von", l: "Anzeigen ab", d: "Leer = sofort", t: "date" }, { p: "website.banner.bis", l: "Anzeigen bis", d: "Leer = bis zum Ausschalten", t: "date" }] },
    ] },
  ];

  let E = null, O = null, fehler = {}; // E = Bearbeitungsstand, O = gespeicherter Stand

  function feld(f) {
    const v = getP(E, f.p); const err = fehler[f.p];
    const id = "e-" + f.p.replace(/\./g, "-");
    let ctl;
    if (f.t === "toggle") ctl = `<label class="switch"><input type="checkbox" id="${id}" data-pfad="${f.p}" data-typ="bool" ${v ? "checked" : ""}><span class="switch__track"></span><span class="sr-only">${h(f.l)}</span></label>`;
    else if (f.t === "textarea") ctl = `<textarea id="${id}" class="input" rows="2" data-pfad="${f.p}" data-typ="text">${h(v || "")}</textarea>`;
    else if (f.t === "number") ctl = `<span class="inline-input"><input type="text" id="${id}" class="input" inputmode="numeric" data-pfad="${f.p}" data-typ="zahl" value="${h(v == null ? "" : v)}">${f.einheit ? `<span class="einheit">${h(f.einheit)}</span>` : ""}</span>`;
    else ctl = `<input type="${f.t === "iban" ? "text" : f.t || "text"}" id="${id}" class="input" data-pfad="${f.p}" data-typ="text" ${f.attrs || ""} ${f.t === "iban" ? 'autocomplete="off" spellcheck="false"' : ""} value="${h(v == null ? "" : v)}">`;
    const block = f.t === "textarea";
    const ok = f.t === "iban" && v && !err && PV.ibanGueltig(String(v)) ? '<span class="iban-ok" data-iban-ok>✓ gültig</span>' : f.t === "iban" ? '<span class="iban-ok" data-iban-ok hidden>✓ gültig</span>' : "";
    return `<div class="set-row ${block ? "set-row--block" : ""} ${err ? "field--fehler" : ""}"><div class="set-row__text"><label class="set-row__titel" for="${id}">${h(f.l)}</label>${f.d ? `<span class="set-row__desc">${h(f.d)}</span>` : ""}</div><div class="set-row__ctl">${ctl}${ok}<span class="fehler-text">${h(err || "")}</span></div></div>`;
  }
  function karte(k) { return `<section class="card set-card"><h2>${h(k.titel)}</h2>${k.felder.map(feld).join("")}</section>`; }

  function zweigHtml(z) {
    const kopf = `<div class="page-head"><div><h1>${h(z.titel)}</h1><span class="muted">${h(z.desc)}</span></div><a class="btn btn--sm einst__zurueck" href="#einstellungen">← Alle Einstellungen</a></div>`;
    if (z.custom === "steuer") {
      const satz = Steuer.satz(E), t = Steuer.texte(satz);
      return kopf + `<section class="card set-card" id="steuer-card"><h2>${h(Steuer.SCHALTER_LABEL)}</h2>
        <div class="set-row"><div class="set-row__text"><span class="set-row__titel">Steuersatz</span><span class="set-row__desc">${h(t.adminKurz)}</span></div><div class="set-row__ctl"><div class="seg" role="radiogroup" aria-label="${h(Steuer.SCHALTER_LABEL)}" id="steuer-satz">${Steuer.optionen().map((o) => `<button type="button" role="radio" aria-checked="${satz === o.satz}" data-satz="${o.satz}">${h(o.satz === 0 ? "0 % · § 19 UStG" : o.label)}</button>`).join("")}</div></div></div>
        <p class="set-hinweis small muted">Beim Umschalten wird die Website automatisch neu veröffentlicht. Bereits erstellte Angebote, Auftragsbestätigungen und Rechnungen behalten den Steuerstatus vom Zeitpunkt ihrer Erstellung.</p><div class="set-footer"></div></section>`;
    }
    if (z.custom === "konfigurator") {
      const st = E.konfigurator.status;
      return kopf + `<section class="card set-card"><h2>Sichtbarkeit</h2>
        <div class="set-row"><div class="set-row__text"><span class="set-row__titel">Konfigurator</span><span class="set-row__desc">Aus: unsichtbar · Vorschau: nur nach Anmeldung · Online: öffentlich mit Menüpunkt und Sitemap</span></div><div class="set-row__ctl"><div class="seg" role="radiogroup" aria-label="Konfigurator-Status" id="konf-status">${Object.entries(STATUS_LABEL).map(([k, l]) => `<button type="button" role="radio" class="seg--${k}" aria-checked="${st === k}" data-status="${k}">${l}</button>`).join("")}</div></div></div>
        <p class="set-hinweis small muted"><a href="/konfigurator/fenster/" target="_blank" rel="noopener">Fenster-Konfigurator ↗</a> · <a href="/konfigurator/haustuer/" target="_blank" rel="noopener">Haustür-Konfigurator ↗</a> · Preise unter <a href="#preise">Preise &amp; Konfigurator</a>.</p><div class="set-footer"></div></section>`;
    }
    if (z.custom === "konten") return kopf + kontenHtml();
    if (z.custom === "zeiten") {
      const oz = E.oeffnungszeiten || {}, eg = E.einsatzgebiet || {};
      const zeile = ([k, l]) => { const z2 = String(oz[k] || ""); const [von, bis] = z2 ? z2.split("-") : ["", ""]; const zu = !z2; return `<span class="tag">${l}</span><input type="time" class="input" data-zeit="${k}" data-teil="von" value="${h(von)}" ${zu ? "disabled" : ""} aria-label="${l} von"><span class="bis">–</span><input type="time" class="input" data-zeit="${k}" data-teil="bis" value="${h(bis)}" ${zu ? "disabled" : ""} aria-label="${l} bis"><label class="zu"><input type="checkbox" data-zu="${k}" ${zu ? "checked" : ""}> geschlossen</label>`; };
      return kopf + `<section class="card set-card"><h2>Öffnungszeiten</h2><div class="set-row set-row--block"><div class="set-row__text"><span class="set-row__titel">Erreichbarkeit je Wochentag</span><span class="set-row__desc">Leer bzw. „geschlossen“ = kein Eintrag für diesen Tag</span></div><div class="set-row__ctl"><div class="zeiten" id="zeiten">${TAGE.map(zeile).join("")}</div>${fehler.oeffnungszeiten ? `<span class="fehler-text">${h(fehler.oeffnungszeiten)}</span>` : ""}</div></div>
        <p class="set-vorschau">So erscheint es auf der Website: <b id="zeiten-text">${h(zeitenText(oz))}</b></p></section>
        <section class="card set-card"><h2>Einsatzgebiet</h2>
        <div class="set-row"><div class="set-row__text"><span class="set-row__titel">Raum Ingolstadt</span><span class="set-row__desc">Ortsseiten veröffentlicht und in der Sitemap</span></div><div class="set-row__ctl"><label class="switch"><input type="checkbox" data-pfad="einsatzgebiet.ingolstadt" data-typ="bool" ${eg.ingolstadt ? "checked" : ""}><span class="switch__track"></span><span class="sr-only">Ingolstadt</span></label></div></div>
        <div class="set-row"><div class="set-row__text"><span class="set-row__titel">Raum Karlsruhe</span><span class="set-row__desc">Aus: Seiten sind gebaut, aber nicht in der Sitemap und für Suchmaschinen ausgeblendet</span></div><div class="set-row__ctl"><label class="switch"><input type="checkbox" data-pfad="einsatzgebiet.karlsruhe" data-typ="bool" ${eg.karlsruhe ? "checked" : ""}><span class="switch__track"></span><span class="sr-only">Karlsruhe</span></label></div></div>
        <div class="set-footer" id="set-footer"></div></section>`;
    }
    return kopf + (z.warnung ? `<div class="alert alert--warn">${h(z.warnung)}</div>` : "") + (z.hinweis ? `<div class="alert alert--info">${h(z.hinweis)}</div>` : "") + z.karten.map(karte).join("") + `<div class="set-footer" id="set-footer"></div>`;
  }

  /* Dienste-Status (nur ja/nein) kommt vom Server; Konten/Kontakte sind Einstellungen */
  let DIENSTE = null;
  const pillStatus = (ok, label) => `<span class="pill ${ok ? "pill--ok" : "pill--err"}">${ok ? "verbunden ✓" : "fehlt ✗"}${label ? " · " + h(label) : ""}</span>`;
  const linkBtn = (href, text) => `<a class="btn btn--xs" href="${h(href)}" target="_blank" rel="noopener noreferrer">${h(text)} ↗</a>`;
  function dienstKarte(o) {
    return `<section class="card set-card dienst"><div class="dienst__kopf"><h2>${h(o.titel)}</h2>${o.status === undefined ? "" : pillStatus(o.status, o.statusLabel)}</div>
      <p class="set-hinweis small muted">${h(o.text)}</p>
      <div class="row dienst__links">${o.links.map((l) => linkBtn(l[0], l[1])).join("")}</div>
      ${o.felder.map(feld).join("")}</section>`;
  }
  function kontenHtml() {
    const d = DIENSTE || {};
    const k = E.konten || {};
    const t = PV.tageBis(k.blobsTokenAblauf);
    const ablauf = t === null ? "" : t < 0 ? `<div class="alert alert--err">Der Zugriffsschlüssel für den Datenspeicher ist abgelaufen – bitte beim Hosting erneuern und das neue Datum eintragen.</div>` : t <= 30 ? `<div class="alert alert--warn">Der Zugriffsschlüssel für den Datenspeicher läuft in ${t} Tagen ab – rechtzeitig erneuern.</div>` : "";
    return `<div class="alert alert--info">Passwörter gehören in einen Passwort-Manager, nicht hierher. Hier stehen nur Zuständigkeit, Links und der technische Status (verbunden/fehlt) – nie Schlüssel oder Werte.</div>
    ${ablauf}
    ${dienstKarte({ titel: "Netlify – Hosting & Veröffentlichung", status: d.hosting, statusLabel: d.veroeffentlichung ? "Veröffentlichung eingerichtet" : "Veröffentlichung fehlt", text: "Hier läuft die Website; jede Veröffentlichung erscheint unter „Deploys“. Projekt: fensterweissenburgerdaniel.", links: [["https://app.netlify.com", "Netlify"], ["https://app.netlify.com/projects/fensterweissenburgerdaniel/deploys", "Deploys"], ["https://app.netlify.com/projects/fensterweissenburgerdaniel/configuration/env", "Umgebungsvariablen"]], felder: [{ p: "konten.netlify.konto", l: "Konto (E-Mail)", d: "Mit dieser Adresse ist das Netlify-Konto angelegt", t: "email" }, { p: "konten.blobsTokenAblauf", l: "Zugriffsschlüssel Datenspeicher läuft ab am", d: "Erinnerung erscheint 30 Tage vorher in der Übersicht. Status: " + (d.datenspeicher ? "verbunden" : "fehlt"), t: "date" }] })}
    ${dienstKarte({ titel: "GitHub – Quellcode", text: "Hier liegt der Code der Website; Änderungen werden über Pull Requests veröffentlicht.", links: [["https://github.com/DanielGanea45/-Fenster-WeissenBurger", "Repository"], ["https://github.com/DanielGanea45/-Fenster-WeissenBurger/pulls", "Pull Requests"]], felder: [{ p: "konten.github.konto", l: "Konto", d: "GitHub-Benutzername oder E-Mail" }] })}
    ${dienstKarte({ titel: "Brevo – E-Mail-Versand", status: d.mail, statusLabel: d.absender ? "Absender " + d.absender : "", text: "Versendet Benachrichtigungen zu Anfragen und Bewertungen, „Passwort vergessen“ und künftig Dokumente.", links: [["https://app.brevo.com", "Brevo"]], felder: [{ p: "konten.brevo.konto", l: "Konto (E-Mail)", t: "email" }] })}
    ${dienstKarte({ titel: "Domain / E-Mail-Postfach", text: "Registrar der Domain fenster-weissenburger.de und des E-Mail-Postfachs. Nur A- und www-Einträge zeigen auf Netlify. MX-Einträge (E-Mail) niemals ändern.", links: k.domain && k.domain.link ? [[k.domain.link, k.domain.anbieter || "Anbieter"]] : [], felder: [{ p: "konten.domain.anbieter", l: "Anbieter", d: "z. B. IONOS oder Strato" }, { p: "konten.domain.link", l: "Link zur Verwaltung", t: "url" }, { p: "konten.domain.konto", l: "Konto" }] })}
    ${dienstKarte({ titel: "Google Search Console & Unternehmensprofil", text: "Sichtbarkeit in der Google-Suche und der Eintrag mit Bewertungen, Öffnungszeiten und Fotos.", links: [["https://search.google.com/search-console", "Search Console"], ["https://business.google.com", "Unternehmensprofil"]], felder: [{ p: "konten.google.konto", l: "Konto (Google-Adresse)", t: "email" }] })}
    ${dienstKarte({ titel: "Ansprechpartner Technik", text: "Wer bei technischen Fragen zur Website hilft.", links: [], felder: [{ p: "konten.technik.name", l: "Name" }, { p: "konten.technik.email", l: "E-Mail", t: "email" }, { p: "konten.technik.telefon", l: "Telefon", t: "tel" }] })}
    <section class="card set-card"><h2>Technischer Status</h2>
      <div class="set-row"><div class="set-row__text"><span class="set-row__titel">Datenspeicher</span><span class="set-row__desc">Admin-Daten (Preise, Texte, Einstellungen) im Hosting</span></div><div class="set-row__ctl">${pillStatus(d.datenspeicher)}</div></div>
      <div class="set-row"><div class="set-row__text"><span class="set-row__titel">Automatische Veröffentlichung</span><span class="set-row__desc">Website wird nach dem Speichern neu gebaut</span></div><div class="set-row__ctl">${pillStatus(d.veroeffentlichung)}</div></div>
      <div class="set-row"><div class="set-row__text"><span class="set-row__titel">Veröffentlichungs-Status</span><span class="set-row__desc">Rückmeldung „veröffentlicht“ nach jedem Build</span></div><div class="set-row__ctl">${pillStatus(d.deployStatus)}</div></div>
      <div class="set-row"><div class="set-row__text"><span class="set-row__titel">E-Mail-Versand</span><span class="set-row__desc">Benachrichtigungen und Passwort-Links</span></div><div class="set-row__ctl">${pillStatus(d.mail)}</div></div>
      <div class="set-row"><div class="set-row__text"><span class="set-row__titel">Anmeldung</span><span class="set-row__desc">Sitzungen und Einrichtungsschlüssel des Admins</span></div><div class="set-row__ctl">${pillStatus(d.sitzungen && d.admin)}</div></div>
      <div class="set-row"><div class="set-row__text"><span class="set-row__titel">Spam-Schutz (Captcha)</span><span class="set-row__desc">Optional; derzeit ${d.captcha ? "aktiv" : "nicht eingerichtet"}</span></div><div class="set-row__ctl"><span class="pill">${d.captcha ? "aktiv" : "aus"}</span></div></div>
    </section>
    <div class="set-footer" id="set-footer"></div>`;
  }
  function istDirty(z) { return z.bereiche.some((b) => JSON.stringify(E[b]) !== JSON.stringify(O[b])); }
  function footerHtml(z) {
    if (z.custom === "steuer" || z.custom === "konfigurator") return "";
    const d = istDirty(z);
    return `<span class="small muted">${z.website ? "Nach dem Speichern wird die Website automatisch neu veröffentlicht." : "Wird gespeichert, ohne die Website neu zu veröffentlichen."}</span><span class="row"><button type="button" class="btn btn--sm" data-e="verwerfen" ${d ? "" : "disabled"}>Verwerfen</button><button type="button" class="btn btn--sm btn--primary" data-e="speichern" ${d ? "" : "disabled"}>Speichern</button></span>`;
  }

  async function speichern(z, extra) {
    const daten = {}; z.bereiche.forEach((b) => { daten[b] = klon(E[b]); if (daten[b] && typeof daten[b] === "object") { delete daten[b].hinweis; delete daten[b].statusWerte; } });
    const voll = Object.assign(klon(O), daten);
    const f = PV.validiereEinstellungen(voll);
    fehler = {}; f.forEach((x) => { if (x.feld.startsWith("oeffnungszeiten.")) fehler.oeffnungszeiten = x.meldung; else fehler[x.feld] = x.meldung; });
    if (f.length) { zeichne(z.id); toast("Bitte die markierten Felder prüfen.", "err"); return false; }
    const r = await api.post("speichern", Object.assign({ bereich: "einstellungen", daten, beschreibung: z.titel + " geändert", veroeffentlichen: !!z.website }, extra || {}));
    if (r.bestaetigen) { const ok = await bestaetigen(z.titel, r.error, "Ja, speichern"); if (!ok) return false; return speichern(z, { bestaetigt: true }); }
    if (!r.ok) { if (r.fehler) { fehler = {}; r.fehler.forEach((x) => { fehler[x.feld] = x.meldung; }); zeichne(z.id); } toast(r.error || "Speichern fehlgeschlagen.", "err"); return false; }
    z.bereiche.forEach((b) => { O[b] = klon(E[b]); });
    S.einst = klon(O); setDirty(false);
    toast(z.titel + " gespeichert.", "ok");
    if (r.veroeffentlichung) { if (r.veroeffentlichung.ok) { S.pub = r.veroeffentlichung.veroeffentlichung; startPoll(); toast("Veröffentlichung gestartet.", "ok"); } else toast(r.veroeffentlichung.error, r.veroeffentlichung.uebersprungen ? "" : "err"); }
    await ladeStatus(); zeichne(z.id);
    return true;
  }

  function lies(main) {
    $$("[data-pfad]", main).forEach((el) => {
      const p = el.dataset.pfad; let v;
      if (el.dataset.typ === "bool") v = !!el.checked;
      else if (el.dataset.typ === "zahl") { const t = String(el.value).trim().replace(",", "."); v = t === "" ? "" : Number(t); if (!isFinite(v)) v = el.value; }
      else v = String(el.value);
      setP(E, p, v);
    });
    const zt = $("#zeiten", main);
    if (zt) TAGE.forEach(([k]) => { const zu = $(`[data-zu="${k}"]`, zt).checked; const von = $(`[data-zeit="${k}"][data-teil="von"]`, zt).value, bis = $(`[data-zeit="${k}"][data-teil="bis"]`, zt).value; E.oeffnungszeiten[k] = zu || !von || !bis ? "" : von + "-" + bis; });
  }

  let MAIN = null, AKTIV = null;
  function zeichne(sub) {
    const main = MAIN; const z = ZWEIGE.find((x) => x.id === sub) || null; AKTIV = z;
    main.innerHTML = `<div class="einst ${z ? "hat-zweig" : ""}">
      <nav class="einst__nav" aria-label="Einstellungen">${ZWEIGE.map((x) => `<a href="#einstellungen/${x.id}" ${z && z.id === x.id ? 'aria-current="page"' : ""}>${ICON[x.id] || ""}<span>${h(x.titel)}</span></a>`).join("")}</nav>
      <div class="einst__inhalt">${z ? zweigHtml(z) : '<div class="page-head"><div><h1>Einstellungen</h1><span class="muted">Bitte links einen Bereich wählen.</span></div></div>'}</div></div>`;
    if (!z) { if (window.matchMedia("(min-width: 901px)").matches) { location.hash = "#einstellungen/" + ZWEIGE[0].id; } return; }
    const ft = $("#set-footer", main); if (ft) ft.innerHTML = footerHtml(z);
    main.oninput = (e) => { if (!e.target.closest(".einst__inhalt")) return; lies(main); setDirty(istDirty(z)); const ft2 = $("#set-footer", main); if (ft2) ft2.innerHTML = footerHtml(z); const zt = $("#zeiten-text", main); if (zt) zt.textContent = zeitenText(E.oeffnungszeiten); if (e.target.dataset.pfad === "bank.iban") { const ok = !e.target.value.trim() || PV.ibanGueltig(e.target.value); e.target.closest(".set-row").classList.toggle("field--fehler", !ok); $(".fehler-text", e.target.closest(".set-row")).textContent = ok ? "" : "IBAN ist ungültig (Prüfsumme)."; const io = $("[data-iban-ok]", e.target.closest(".set-row")); if (io) io.hidden = !(ok && e.target.value.trim()); } };
    main.onchange = (e) => { const zu = e.target.closest("[data-zu]"); if (zu) { const k = zu.dataset.zu; $$(`[data-zeit="${k}"]`, main).forEach((i) => { i.disabled = zu.checked; }); lies(main); setDirty(istDirty(z)); const ft2 = $("#set-footer", main); if (ft2) ft2.innerHTML = footerHtml(z); const zt = $("#zeiten-text", main); if (zt) zt.textContent = zeitenText(E.oeffnungszeiten); } };
    main.onclick = async (e) => {
      const b = e.target.closest("[data-e]");
      if (b) { if (b.dataset.e === "verwerfen") { z.bereiche.forEach((x) => { E[x] = klon(O[x]); }); fehler = {}; setDirty(false); zeichne(z.id); } else await speichern(z); return; }
      const st = e.target.closest("#steuer-satz [data-satz]");
      if (st) {
        const neu = Number(st.dataset.satz), alt = Steuer.satz(O); if (neu === alt) return;
        const ok = await bestaetigen(Steuer.TITEL + " umstellen auf " + Steuer.texte(neu).option, Steuer.texte(neu).bestaetigung, "Umstellen und veröffentlichen"); if (!ok) return;
        E.steuer = Object.assign({}, E.steuer, { satzProzent: neu });
        const r = await speichern(z, { bestaetigt: true, beschreibung: Steuer.texte(neu).beschreibung }); if (!r) E.steuer = klon(O.steuer);
        return;
      }
      const ks = e.target.closest("#konf-status [data-status]");
      if (ks) {
        const neu = ks.dataset.status, alt = O.konfigurator.status; if (neu === alt) return;
        let bestaetigt = false;
        if (neu === "online") { bestaetigt = await bestaetigen("Konfigurator online schalten", "Der Konfigurator wird für alle Besucher sichtbar: Menüpunkt, Links auf den Produktseiten, Sitemap und Suchmaschinen. Die aktuelle Preisliste wird dabei veröffentlicht.", "Online schalten"); if (!bestaetigt) return; }
        E.konfigurator = Object.assign({}, E.konfigurator, { status: neu });
        const r = await speichern(z, { bestaetigt, beschreibung: "Konfigurator: " + neu }); if (!r) E.konfigurator = klon(O.konfigurator);
      }
    };
  }

  A.VIEWS.einstellungen = async (main, sub) => {
    const [de, ds, dd] = await Promise.all([api.get("daten", { bereich: "einstellungen" }), api.get("status"), api.get("dienste")]);
    if (!de.ok) throw new Error(de.error);
    DIENSTE = dd && dd.ok ? dd.dienste : {};
    O = klon(de.daten); E = klon(de.daten); S.einst = klon(de.daten); S.pub = ds.veroeffentlichung; fehler = {};
    MAIN = main; zeichne(sub);
  };
})();
