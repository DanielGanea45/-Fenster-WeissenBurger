/* Admin → Angebote & Rechnungen (+ Kunden). Kette Angebot → Auftragsbestätigung → Rechnung; Positionseditor mit
   Live-Summen (Anzeige – verbindlich rechnet immer der Server), PDF-Vorschau, Versand per E-Mail, Festschreiben,
   Stornorechnung, Zahlungen, Filter/Suche/Sortierung, Kundenliste, Export für den Steuerberater.
   Firmen-/Bank-/Steuerdaten kommen aus den Einstellungen; Steuertexte stehen nur im Beleg-Snapshot (js/steuer.js).
   Nutzt window.FWAdmin. Keine Inline-Styles (CSP). */
(function () {
  "use strict";
  const A = window.FWAdmin; if (!A) return;
  const { $, $$, h, call, toast, bestaetigen, S, VIEWS, setDirty, render, fmtDT } = A;
  const URL_B = "/.netlify/functions/belege";
  const get = (aktion, q) => call(URL_B, { query: Object.assign({ aktion }, q || {}) });
  const post = (aktion, body) => call(URL_B, { method: "POST", body: Object.assign({ aktion }, body || {}) });
  const eur = (c) => (Math.round(Number(c) || 0) / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
  const dez = (c) => (Math.round(Number(c) || 0) / 100).toFixed(2).replace(".", ",");
  const centAus = (s) => Math.round(Number(String(s == null ? "" : s).replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "")) * 100) || 0;
  const dDe = (iso) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(8, 10) + "." + iso.slice(5, 7) + "." + iso.slice(0, 4) : "–");
  const heute = () => new Date().toISOString().slice(0, 10);
  const ART = { angebot: "Angebot", ab: "Auftragsbestätigung", rechnung: "Rechnung", storno: "Stornorechnung" };
  const ART_KURZ = { angebot: "Angebot", ab: "AB", rechnung: "Rechnung", storno: "Storno" };
  const STATUS = { entwurf: ["Entwurf", "pill--grey"], gesendet: ["Gesendet", ""], angenommen: ["Angenommen", "pill--ok"], abgelehnt: ["Abgelehnt", "pill--err"], abgelaufen: ["Abgelaufen", "pill--warn"], erledigt: ["Erledigt", "pill--ok"], offen: ["Offen", "pill--warn"], teilweise: ["Teilweise bezahlt", "pill--warn"], bezahlt: ["Bezahlt", "pill--ok"], ueberfaellig: ["Überfällig", "pill--err"], storniert: ["Storniert", "pill--err"], festgeschrieben: ["Festgeschrieben", "pill--ok"] };
  const pill = (st) => { const x = STATUS[st] || [st, ""]; return `<span class="pill pill--xs ${x[1]}">${h(x[0])}</span>`; };
  const EINHEITEN = ["Stk.", "m²", "lfm", "pauschal", "Std."];
  const FILTER = [["alle", "Alle"], ["entwurf", "Entwürfe"], ["angebot", "Angebote"], ["ab", "Auftragsbestätigungen"], ["offen", "Rechnungen offen"], ["bezahlt", "Bezahlt"], ["storniert", "Storniert"]];
  const pdfUrl = (id, download) => `${URL_B}?aktion=pdf&id=${encodeURIComponent(id)}${download ? "&download=1" : ""}`;
  const entprellt = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  /* Modal mit mehreren Feldern → Objekt der Werte oder null */
  function formModal({ titel, text, html, ok, gefaehrlich }) {
    return new Promise((resolve) => {
      const m = $("#modal");
      m.innerHTML = `<div class="modal__box"><h2>${h(titel)}</h2>${text ? `<p>${h(text)}</p>` : ""}<form id="modal-form" class="stack" novalidate>${html}</form><div class="modal__actions"><button type="button" class="btn" data-m="nein">Abbrechen</button><button type="button" class="btn ${gefaehrlich ? "btn--danger" : "btn--primary"}" data-m="ja">${h(ok || "OK")}</button></div></div>`;
      m.hidden = false;
      const schluss = (v) => { m.hidden = true; m.innerHTML = ""; document.removeEventListener("keydown", esc); resolve(v); };
      const esc = (e) => { if (e.key === "Escape") schluss(null); };
      document.addEventListener("keydown", esc);
      const werte = () => { const o = {}; new FormData($("#modal-form")).forEach((v, k) => { o[k] = v; }); $$("#modal-form input[type=checkbox]").forEach((c) => { o[c.name] = c.checked; }); return o; };
      m.onclick = (e) => { const b = e.target.closest("[data-m]"); if (!b) { if (e.target === m) schluss(null); return; } schluss(b.dataset.m === "ja" ? werte() : null); };
      $("#modal-form").addEventListener("submit", (e) => { e.preventDefault(); schluss(werte()); });
      const f = $("#modal-form input, #modal-form textarea, #modal-form select"); if (f) f.focus();
    });
  }
  const musterBanner = (m) => (m && m.muster ? `<div class="alert alert--warn bel-muster"><b>Dokumente erscheinen als MUSTER.</b> In den Einstellungen fehlen: ${h(m.fehlt.join(", "))}. Festschreiben und Versenden sind bis dahin gesperrt. <a href="#einstellungen/bank">Bank &amp; Zahlung</a> · <a href="#einstellungen/dokumente">Dokumente</a></div>` : "");

  /* ====================================================================
     Liste
     ==================================================================== */
  const L = { filter: "alle", suche: "", sort: "datum", richtung: "ab", seite: 1 };
  async function liste(main) {
    main.innerHTML = `<div class="page-head"><div><h1>Angebote &amp; Rechnungen</h1><span class="muted">Angebot → Auftragsbestätigung → Rechnung, mit einem Klick weiter. Entwürfe werden beim Tippen gespeichert.</span></div>
        <div class="row"><a class="btn btn--sm" href="#kunden">Kunden</a><a class="btn btn--sm btn--primary" href="#angebote/neu">+ Neues Angebot</a></div></div>
      <div id="bel-muster"></div>
      <div class="kpis" id="bel-kpis">${[1, 2, 3, 4].map(() => '<div class="card kpi skeleton"><span class="kpi__head">&nbsp;</span><span class="value">&nbsp;</span></div>').join("")}</div>
      <div class="card bel-liste">
        <div class="bel-toolbar"><div class="chips" id="bel-filter" role="tablist" aria-label="Filter">${FILTER.map(([k, l]) => `<button type="button" class="chip" role="tab" aria-selected="${k === L.filter}" data-f="${k}">${l}</button>`).join("")}</div>
          <div class="row bel-suche"><input type="search" class="input" id="bel-suche" placeholder="Nummer, Kunde, Betreff …" aria-label="Suchen" value="${h(L.suche)}"><select class="input" id="bel-sort" aria-label="Sortierung">${[["datum", "Datum"], ["nummer", "Nummer"], ["kunde", "Kunde"], ["gesamt", "Betrag"], ["status", "Status"]].map(([k, l]) => `<option value="${k}" ${L.sort === k ? "selected" : ""}>${l}</option>`).join("")}</select><button type="button" class="btn btn--xs" id="bel-richtung" title="Richtung umkehren" aria-label="Sortierrichtung umkehren">${L.richtung === "ab" ? "↓" : "↑"}</button></div></div>
        <div class="bel-tabelle-wrap" id="bel-tabelle"><p class="loading">Wird geladen …</p></div>
        <div class="row row--between bel-foot"><span class="small muted">Rechnungen werden beim Festschreiben nummeriert und sind danach nicht mehr änderbar (GoBD). Korrekturen erfolgen per Stornorechnung. Nummern laufen fortlaufend ohne Lücken.</span><span class="row" id="bel-seiten"></span></div>
      </div>
      <div class="card bel-export"><h2>Export für den Steuerberater</h2><div class="row"><label class="field small">von<input type="date" class="input" id="exp-von" value="${new Date().getFullYear()}-01-01"></label><label class="field small">bis<input type="date" class="input" id="exp-bis" value="${heute()}"></label><span class="row bel-export__btns"><a class="btn btn--xs" id="exp-csv" href="#" download>CSV (alle Belege)</a><a class="btn btn--xs" id="exp-datev" href="#" download>DATEV-Buchungsstapel</a><a class="btn btn--xs" id="exp-zip" href="#" download>ZIP mit Rechnungs-PDFs</a></span></div><p class="small muted">Rechnungen und Stornorechnungen des Zeitraums; das ZIP enthält die festgeschriebenen PDFs samt Prüfsummen-Index.</p></div>`;
    const exportLinks = () => { const q = `&von=${$("#exp-von").value}&bis=${$("#exp-bis").value}`; $("#exp-csv").href = `${URL_B}?aktion=export&format=csv${q}`; $("#exp-datev").href = `${URL_B}?aktion=export&format=datev${q}`; $("#exp-zip").href = `${URL_B}?aktion=export&format=zip${q}`; };
    exportLinks(); $("#exp-von").addEventListener("change", exportLinks); $("#exp-bis").addEventListener("change", exportLinks);
    get("kpis").then((k) => { if (!k.ok) return; const x = k.kpis; $("#bel-kpis").innerHTML = [["Offene Rechnungen", eur(x.offen), x.offen ? "" : "value--ink"], ["Überfällig", eur(x.ueberfaellig), x.ueberfaellig ? "value--err" : "value--ink"], ["Umsatz diesen Monat", eur(x.umsatzMonat), "value--ok"], ["Umsatz dieses Jahr", eur(x.umsatzJahr), "value--ok"]].map(([t, v, c]) => `<div class="card kpi"><span class="kpi__head">${t}</span><span class="value ${c}">${v}</span></div>`).join(""); });
    const lade = async () => {
      const q = { suche: L.suche, sort: L.sort, richtung: L.richtung === "ab" ? "ab" : "auf", seite: L.seite, proSeite: 25 };
      if (["angebot", "ab"].includes(L.filter)) q.art = L.filter; else if (L.filter !== "alle") q.status = L.filter;
      if (L.filter === "offen" || L.filter === "bezahlt" || L.filter === "storniert") q.art = "rechnung";
      const d = await get("liste", q); if (!d.ok) { $("#bel-tabelle").innerHTML = `<div class="alert alert--err">${h(d.error)}</div>`; return; }
      if (d.muster) $("#bel-muster").innerHTML = musterBanner(d.muster);
      $("#bel-tabelle").innerHTML = d.belege.length ? `<table class="tbl bel-tabelle"><thead><tr><th>Nummer</th><th>Kunde</th><th>Betreff</th><th>Datum</th><th class="num">Betrag</th><th>Status</th><th class="num">Aktionen</th></tr></thead><tbody>${d.belege.map((b) => `<tr data-id="${h(b.id)}"><td class="name" data-l="Nummer"><a href="#angebote/${h(b.id)}">${h(b.nummer || "Entwurf")}</a><span class="sub">${h(ART_KURZ[b.art])}${b.rechnungstyp && b.rechnungstyp !== "voll" ? " · " + (b.rechnungstyp === "anzahlung" ? "Anzahlung" : "Schlussrechnung") : ""}</span></td><td data-l="Kunde">${h(b.kunde)}</td><td class="bel-betreff" data-l="Betreff">${h(b.betreff)}</td><td data-l="Datum" class="nowrap">${dDe(b.datum)}${b.art === "rechnung" && b.faelligAm && ["offen", "teilweise", "ueberfaellig"].includes(b.status) ? `<span class="sub small muted">fällig ${dDe(b.faelligAm)}</span>` : ""}</td><td class="num strong" data-l="Betrag">${eur(b.art === "storno" ? b.gesamt : b.zahlbetrag)}</td><td data-l="Status">${pill(b.status)}</td><td class="num nowrap" data-l=""><a class="btn btn--xs" href="#angebote/${h(b.id)}">Öffnen</a> ${b.nummer ? `<a class="btn btn--xs" href="${pdfUrl(b.id)}" target="_blank" rel="noopener">PDF</a>` : ""}</td></tr>`).join("")}</tbody></table>` : '<p class="muted bel-leer">Keine Belege für diesen Filter.</p>';
      const seiten = Math.max(1, Math.ceil(d.gesamt / d.proSeite));
      $("#bel-seiten").innerHTML = seiten > 1 ? `<button type="button" class="btn btn--xs" data-seite="${L.seite - 1}" ${L.seite <= 1 ? "disabled" : ""}>‹</button><span class="small">Seite ${L.seite} von ${seiten} · ${d.gesamt} Belege</span><button type="button" class="btn btn--xs" data-seite="${L.seite + 1}" ${L.seite >= seiten ? "disabled" : ""}>›</button>` : `<span class="small muted">${d.gesamt} ${d.gesamt === 1 ? "Beleg" : "Belege"}</span>`;
    };
    $("#bel-filter").addEventListener("click", (e) => { const b = e.target.closest("[data-f]"); if (!b) return; L.filter = b.dataset.f; L.seite = 1; $$("#bel-filter .chip").forEach((c) => c.setAttribute("aria-selected", c === b)); lade(); });
    $("#bel-suche").addEventListener("input", entprellt((e) => { L.suche = e.target.value.trim(); L.seite = 1; lade(); }, 250));
    $("#bel-sort").addEventListener("change", (e) => { L.sort = e.target.value; lade(); });
    $("#bel-richtung").addEventListener("click", (e) => { L.richtung = L.richtung === "ab" ? "auf" : "ab"; e.currentTarget.textContent = L.richtung === "ab" ? "↓" : "↑"; lade(); });
    main.addEventListener("click", (e) => { const b = e.target.closest("[data-seite]"); if (!b) return; L.seite = Number(b.dataset.seite); lade(); });
    await lade();
  }

  /* ====================================================================
     Editor / Detail
     ==================================================================== */
  let E = null; // { beleg, summen, kette, folge, muster, aenderbar }
  let autosave = null, letzteSicherung = "";
  function summenLokal(b) {
    const pos = (b.positionen || []).map((p) => ({ gesamt: Math.round((Number(String(p.menge).replace(",", ".")) || 0) * (Math.round(Number(p.einzelpreis) || 0))) }));
    const zw = pos.reduce((a, p) => a + p.gesamt, 0);
    const r = b.rabatt || {}; let rabatt = r.prozent ? Math.round(zw * Number(r.prozent) / 100) : Math.round(Number(r.betrag) || 0); rabatt = Math.min(Math.max(rabatt, 0), zw);
    const summe = zw - rabatt, steuer = Math.round(summe * (b.steuer.satz || 0) / 100), gesamt = summe + steuer;
    const anz = b.anzahlung && b.anzahlung.verrechnet ? Number(b.anzahlung.verrechnet) : 0;
    return { zwischensumme: zw, rabatt, summe, steuer, gesamt, anzahlungGesamt: anz, zahlbetrag: gesamt - anz };
  }
  function summenHtml(b, s) {
    const z = [];
    if (s.rabatt) { z.push(["Zwischensumme", eur(s.zwischensumme)]); z.push([b.rabatt.prozent ? `Rabatt ${String(b.rabatt.prozent).replace(".", ",")} %` : "Rabatt", "− " + eur(s.rabatt)]); }
    if (b.steuer.satz || s.rabatt) z.push([b.steuer.belegSumme || "Summe", eur(s.summe)]);
    if (b.steuer.satz && b.steuer.belegSteuer) z.push([b.steuer.belegSteuer, eur(s.steuer)]);
    let out = z.map(([l, v]) => `<div class="bel-summen__zeile"><span>${h(l)}</span><span>${v}</span></div>`).join("");
    out += `<div class="bel-summen__gesamt"><span>${b.art === "storno" ? "Gutschriftbetrag" : s.anzahlungGesamt ? "Rechnungsbetrag" : "Gesamtbetrag"}</span><span>${eur(s.gesamt)}</span></div>`;
    if (s.anzahlungGesamt) out += `<div class="bel-summen__zeile"><span>abzüglich Anzahlung</span><span>− ${eur(s.anzahlungGesamt)}</span></div><div class="bel-summen__zeile strong"><span>Noch zu zahlen</span><span>${eur(s.zahlbetrag)}</span></div>`;
    if (!b.steuer.satz && b.steuer.pdfHinweis) out += `<p class="small muted">${h(b.steuer.pdfHinweis)}</p>`;
    return out;
  }
  function posHtml(p, i, ro) {
    const dis = ro ? "disabled" : "";
    return `<li class="bel-pos ${p.art === "arbeit" ? "bel-pos--arbeit" : ""}" draggable="${!ro}" data-i="${i}">
      <span class="bel-pos__nr">${ro ? "" : '<span class="bel-pos__griff" title="Ziehen zum Sortieren" aria-hidden="true">⋮⋮</span>'}${i + 1}</span>
      <div class="bel-pos__text"><input type="text" class="input" data-p="beschreibung" data-i="${i}" value="${h(p.beschreibung || "")}" placeholder="Bezeichnung" aria-label="Bezeichnung Position ${i + 1}" ${dis}><textarea class="input" rows="2" data-p="details" data-i="${i}" placeholder="Details (Maße, Farbe, Verglasung …)" aria-label="Details Position ${i + 1}" ${dis}>${h(p.details || "")}</textarea>${ro ? "" : `<label class="small bel-pos__art"><input type="checkbox" data-p="art" data-i="${i}" ${p.art === "arbeit" ? "checked" : ""}> Arbeitsleistung (§ 35a EStG, erscheint auf der Rechnung)</label>`}</div>
      <input type="text" class="input bel-pos__menge" inputmode="decimal" data-p="menge" data-i="${i}" value="${h(String(p.menge == null ? 1 : p.menge).replace(".", ","))}" aria-label="Menge" ${dis}>
      <select class="input bel-pos__einheit" data-p="einheit" data-i="${i}" aria-label="Einheit" ${dis}>${EINHEITEN.map((e) => `<option ${p.einheit === e ? "selected" : ""}>${e}</option>`).join("")}</select>
      <span class="inline-input bel-pos__preis"><input type="text" class="input" inputmode="decimal" data-p="einzelpreis" data-i="${i}" value="${dez(p.einzelpreis)}" aria-label="Einzelpreis in Euro" ${dis}><span class="einheit">€</span></span>
      <span class="bel-pos__gesamt num strong" data-gesamt="${i}">${eur(Math.round((Number(String(p.menge).replace(",", ".")) || 0) * (Number(p.einzelpreis) || 0)))}</span>
      ${ro ? "" : `<button type="button" class="btn btn--xs btn--danger bel-pos__del" data-del="${i}" aria-label="Position ${i + 1} entfernen">×</button>`}
    </li>`;
  }
  function ketteHtml(b, kette, folge) {
    const schritt = (art, k, aktiv) => `<div class="bel-kette__schritt ${k ? "is-da" : ""} ${aktiv ? "is-aktiv" : ""}">${k ? `<a href="#angebote/${h(k.id)}"><b>${h(ART[art])}</b><span>${h(k.nummer || "Entwurf")} · ${dDe(k.datum)}</span>${pill(k.status)}</a>` : `<span class="bel-kette__leer"><b>${h(ART[art])}</b><span>noch nicht erstellt</span></span>`}</div>`;
    const eigen = { id: b.id, nummer: b.nummer, datum: b.datum, status: b.status };
    const an = b.art === "angebot" ? eigen : kette.angebot, ab = b.art === "ab" ? eigen : kette.ab || folge.find((f) => f.art === "ab");
    const re = b.art === "rechnung" ? eigen : kette.rechnung || folge.find((f) => f.art === "rechnung");
    const weitere = folge.filter((f) => f.id !== (ab && ab.id) && f.id !== (re && re.id));
    return `<div class="bel-kette">${schritt("angebot", an, b.art === "angebot")}<span class="bel-kette__pfeil" aria-hidden="true">→</span>${schritt("ab", ab, b.art === "ab")}<span class="bel-kette__pfeil" aria-hidden="true">→</span>${schritt("rechnung", re, b.art === "rechnung" || b.art === "storno")}</div>${weitere.length ? `<div class="row small bel-folge">Weitere Belege: ${weitere.map((f) => `<a href="#angebote/${h(f.id)}">${h(ART_KURZ[f.art])} ${h(f.nummer || "Entwurf")}</a>`).join(" · ")}</div>` : ""}`;
  }
  function aktionenHtml(b, ro) {
    const btn = (k, label, cls, extra) => `<button type="button" class="btn btn--sm ${cls || ""}" data-ak="${k}" ${extra || ""}>${label}</button>`;
    const out = [];
    if (b.nummer) out.push(`<a class="btn btn--sm" href="${pdfUrl(b.id)}" target="_blank" rel="noopener">PDF ansehen</a>`);
    if (b.art !== "storno" && !(b.art === "rechnung" && !b.festgeschrieben)) out.push(btn("senden", b.gesendet ? "Erneut senden" : "Per E-Mail senden", "btn--primary"));
    if (b.art === "angebot") { out.push(btn("ab", "Auftragsbestätigung erstellen", b.status === "angenommen" ? "btn--primary" : "")); if (!["angenommen", "abgelehnt"].includes(b.status) && b.nummer) out.push(btn("status:angenommen", "Als angenommen markieren"), btn("status:abgelehnt", "Als abgelehnt markieren")); }
    if (b.art === "ab") out.push(btn("rechnung", "Rechnung erstellen", "btn--primary"));
    if (b.art === "rechnung" && !b.festgeschrieben) out.push(btn("festschreiben", "Rechnung festschreiben", "btn--primary"));
    if (b.art === "rechnung" && b.festgeschrieben && b.status !== "storniert") { if (b.status !== "bezahlt") out.push(btn("zahlung", "Zahlung erfassen")); out.push(btn("storno", "Stornieren", "btn--danger")); }
    if (b.art === "rechnung" && b.status === "storniert" && b.bezug && b.bezug.abId) out.push(`<a class="btn btn--sm" href="#angebote/${h(b.bezug.abId)}">Neue Rechnung aus der AB</a>`);
    return out.join("");
  }
  function journalHtml(b) {
    const z = (b.verlauf || []).slice().reverse().map((v) => `<div><span class="small muted nowrap">${fmtDT(v.wann)}</span><span><b>${h(v.was)}</b>${v.details ? " – " + h(v.details) : ""}${v.wer ? ` <span class="muted small">(${h(v.wer)})</span>` : ""}</span></div>`).join("");
    const zahl = (b.zahlungen || []).length ? `<h3>Zahlungen</h3><div class="list list--kompakt">${b.zahlungen.map((z) => `<div><span>${dDe(z.datum)}${z.notiz ? " · " + h(z.notiz) : ""}</span><b>${eur(z.betrag)}</b></div>`).join("")}</div>` : "";
    const fest = b.festgeschrieben ? `<p class="small muted">Festgeschrieben am ${fmtDT(b.festgeschrieben.wann)} · Prüfsumme <code>${h(String(b.festgeschrieben.hash).slice(0, 20))}…</code> · Das PDF ist unveränderlich archiviert.</p>` : "";
    return `<details class="card bel-journal"><summary><b>Verlauf</b> <span class="muted small">(${(b.verlauf || []).length} Einträge)</span></summary>${fest}${zahl}<div class="list list--kompakt">${z}</div></details>`;
  }
  function kopfHtml(b, ro) {
    return `<div class="page-head bel-kopf"><div><a class="small" href="#angebote">← Alle Belege</a><h1><span class="badge bel-badge">${h(ART[b.art])}</span> ${h(b.nummer || "Entwurf")} ${pill(b.status)}${b.festgeschrieben ? '<span class="pill pill--xs pill--grey" title="Unveränderlich (GoBD)">🔒 festgeschrieben</span>' : ""}</h1><span class="muted">${h(b.kunde.name || "Kunde noch nicht erfasst")}${b.betreff ? " · " + h(b.betreff) : ""}${b.gesendet ? ` · gesendet ${fmtDT(b.gesendet.wann)} an ${h(b.gesendet.an)}` : ""}</span></div><div class="row bel-aktionen">${aktionenHtml(b, ro)}</div></div>`;
  }
  function formHtml(b, ro, kunden) {
    const dis = ro ? "disabled" : "";
    const f = (name, label, val, typ, extra) => `<label class="field small ${E.fehler && E.fehler.some((x) => x.feld === name) ? "field--fehler" : ""}">${label}<input type="${typ || "text"}" class="input" data-f="${name}" value="${h(val == null ? "" : val)}" ${extra || ""} ${dis}></label>`;
    const k = b.kunde;
    const datumFelder = [f("datum", "Belegdatum", b.datum, "date")];
    if (b.art === "angebot") datumFelder.push(f("gueltigBis", "Gültig bis", b.gueltigBis, "date"));
    if (b.art === "ab") datumFelder.push(f("liefertermin", "Liefer-/Montagetermin (ca.)", b.liefertermin, "date"));
    if (b.art === "rechnung") datumFelder.push(f("faelligAm", "Zahlbar bis", b.faelligAm, "date"));
    datumFelder.push(f("leistungsdatum", "Leistungsdatum / Beginn", b.leistungsdatum, "date"), f("leistungsende", "Leistungsende (Zeitraum)", b.leistungsende, "date"));
    return `<div class="card bel-form">
      <div class="bel-form__kopf"><h2>Kunde</h2>${ro || !kunden ? "" : `<select class="input bel-kundenwahl" id="bel-kundenwahl" aria-label="Vorhandenen Kunden übernehmen"><option value="">Vorhandenen Kunden übernehmen …</option>${kunden.map((x) => `<option value="${h(x.id)}">${h(x.name)}${x.firma ? " · " + h(x.firma) : ""}${x.ort ? " · " + h(x.ort) : ""}</option>`).join("")}</select>`}</div>
      <div class="bel-grid bel-grid--kunde">
        <label class="field small">Anrede<select class="input" data-f="kunde.anrede" ${dis}>${["", "Herrn", "Frau"].map((a) => `<option value="${a}" ${k.anrede === a ? "selected" : ""}>${a || "–"}</option>`).join("")}</select></label>
        ${f("kunde.name", "Name *", k.name)}${f("kunde.firma", "Firma (optional)", k.firma)}
        ${f("kunde.strasse", "Straße, Nr. *", k.strasse)}${f("kunde.plz", "PLZ *", k.plz, "text", 'inputmode="numeric" maxlength="5"')}${f("kunde.ort", "Ort *", k.ort)}
        ${f("kunde.email", "E-Mail", k.email, "email")}${f("kunde.telefon", "Telefon", k.telefon, "tel")}
      </div>
      <h2>Beleg</h2>
      <div class="bel-grid">${f("betreff", "Betreff *", b.betreff, "text", 'class="input bel-betreff-input"')}</div>
      <div class="bel-grid bel-grid--daten">${datumFelder.join("")}</div>
      <label class="field small">Einleitung<textarea class="input" rows="2" data-f="einleitung" placeholder="Leer = Standardtext" ${dis}>${h(b.einleitung || "")}</textarea></label>
      <h2>Positionen</h2>
      <div class="bel-pos-kopf" aria-hidden="true"><span>Pos.</span><span>Bezeichnung &amp; Details</span><span>Menge</span><span>Einh.</span><span>Einzelpreis</span><span class="num">Gesamt</span><span></span></div>
      <ol class="bel-positionen" id="bel-positionen">${b.positionen.map((p, i) => posHtml(p, i, ro)).join("")}</ol>
      ${ro ? "" : '<div class="row"><button type="button" class="btn btn--xs" data-ak="pos-neu">+ Position</button><button type="button" class="btn btn--xs" data-ak="pos-montage">+ Montage (Arbeitsleistung)</button></div>'}
      <div class="bel-unten">
        <div class="bel-rabatt"><label class="field small">Rabatt in %<input type="text" class="input" inputmode="decimal" data-f="rabatt.prozent" value="${h(String(b.rabatt.prozent || "").replace(".", ","))}" ${dis}></label><label class="field small">oder Rabatt in €<input type="text" class="input" inputmode="decimal" data-f="rabatt.betrag" value="${b.rabatt.betrag ? dez(b.rabatt.betrag) : ""}" ${dis}></label></div>
        <div class="bel-summen" id="bel-summen">${summenHtml(b, E.summen || summenLokal(b))}</div>
      </div>
      <label class="field small">Schlusstext<textarea class="input" rows="2" data-f="schluss" ${dis}>${h(b.schluss || "")}</textarea></label>
      ${ro ? "" : `<div class="set-footer"><span class="small muted" id="bel-save-status">${letzteSicherung ? "Gespeichert " + letzteSicherung : "Änderungen werden automatisch gespeichert."}</span><span class="row"><button type="button" class="btn btn--sm btn--primary" data-ak="speichern">Speichern &amp; prüfen</button></span></div>`}
      ${E.fehler && E.fehler.length ? `<div class="alert alert--err"><b>Bitte prüfen:</b><ul>${E.fehler.map((x) => `<li>${h(x.text)}</li>`).join("")}</ul></div>` : ""}
    </div>`;
  }

  async function editor(main, id) {
    const d = await get("beleg", { id }); if (!d.ok) throw new Error(d.error);
    E = d; E.fehler = []; letzteSicherung = "";
    const b = E.beleg, ro = !E.aenderbar || (b.art === "rechnung" && b.status !== "entwurf") || b.art === "storno";
    let kunden = null; if (!ro) { const dk = await get("kunden"); if (dk.ok) kunden = dk.kunden; }
    const zeichne = () => { main.innerHTML = `${kopfHtml(b, ro)}${musterBanner(E.muster)}${ketteHtml(b, E.kette || {}, E.folge || [])}${formHtml(b, ro, kunden)}${journalHtml(b)}`; };
    zeichne();
    const aktualisiereSummen = () => { const s = summenLokal(b); $("#bel-summen").innerHTML = summenHtml(b, s); b.positionen.forEach((p, i) => { const el = $(`[data-gesamt="${i}"]`); if (el) el.textContent = eur(Math.round((Number(String(p.menge).replace(",", ".")) || 0) * (Number(p.einzelpreis) || 0))); }); };
    const sichern = async (pruefen) => {
      if (ro) return;
      const daten = { kunde: b.kunde, betreff: b.betreff, einleitung: b.einleitung, schluss: b.schluss, positionen: b.positionen, rabatt: b.rabatt, datum: b.datum, leistungsdatum: b.leistungsdatum, leistungsende: b.leistungsende, gueltigBis: b.gueltigBis, liefertermin: b.liefertermin, faelligAm: b.faelligAm };
      const st = $("#bel-save-status"); if (st) st.textContent = "Wird gespeichert …";
      const r = await post("speichern", { id: b.id, daten, nurEntwurf: !pruefen });
      if (r.ok) { E.summen = r.summen; E.fehler = pruefen ? (r.fehler || []) : []; letzteSicherung = new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }); setDirty(false); if (st) st.textContent = "Gespeichert " + letzteSicherung; if (pruefen) { Object.assign(b, r.beleg); zeichne(); bind(); if (!E.fehler.length) toast("Gespeichert – alle Angaben vollständig.", "ok"); } else $("#bel-summen").innerHTML = summenHtml(b, r.summen); }
      else if (r.status === 422) { E.fehler = r.fehler || []; zeichne(); bind(); toast(r.error, "err"); }
      else { if (st) st.textContent = "Nicht gespeichert: " + (r.error || ""); toast(r.error || "Speichern fehlgeschlagen.", "err"); }
    };
    autosave = entprellt(() => sichern(false), 1200);
    const setzeFeld = (pfad, wert) => { const [a, c] = pfad.split("."); if (c) { b[a] = b[a] || {}; b[a][c] = wert; } else b[a] = wert; };
    function bind() {
      main.oninput = (e) => {
        const t = e.target; if (ro) return;
        if (t.dataset.f) { let v = t.value; if (t.dataset.f === "rabatt.prozent") { v = Number(v.replace(",", ".")) || 0; if (v) b.rabatt.betrag = 0; } else if (t.dataset.f === "rabatt.betrag") { v = centAus(v); if (v) b.rabatt.prozent = 0; } setzeFeld(t.dataset.f, v); if (t.dataset.f.startsWith("rabatt")) aktualisiereSummen(); setDirty(true); autosave(); }
        if (t.dataset.p) { const p = b.positionen[Number(t.dataset.i)]; if (!p) return; if (t.dataset.p === "einzelpreis") p.einzelpreis = centAus(t.value); else if (t.dataset.p === "menge") p.menge = Number(t.value.replace(",", ".")) || 0; else if (t.dataset.p === "art") p.art = t.checked ? "arbeit" : "ware"; else p[t.dataset.p] = t.value; aktualisiereSummen(); setDirty(true); autosave(); }
      };
      main.onfocus = null;
      main.addEventListener("focusin", (e) => { const t = e.target; if (t.matches && t.matches("[data-p='menge'],[data-p='einzelpreis'],[data-f^='rabatt']")) t.select(); });
      main.onchange = (e) => { const t = e.target; if (t.id === "bel-kundenwahl" && t.value) { const k = kunden.find((x) => x.id === t.value); if (k) { b.kunde = { anrede: k.anrede || "", name: k.name, firma: k.firma || "", strasse: k.strasse, plz: k.plz, ort: k.ort, email: k.email || "", telefon: k.telefon || "" }; zeichne(); bind(); setDirty(true); autosave(); } } if (t.dataset.p === "einheit" || t.dataset.f === "kunde.anrede" || (t.type === "date" && t.dataset.f)) { main.oninput(e); } if (t.dataset.p === "einzelpreis") t.value = dez(b.positionen[Number(t.dataset.i)].einzelpreis); };
      main.onclick = async (e) => {
        const d = e.target.closest("[data-del]"); if (d && !ro) { b.positionen.splice(Number(d.dataset.del), 1); zeichne(); bind(); setDirty(true); autosave(); return; }
        const a = e.target.closest("[data-ak]"); if (!a) return; const ak = a.dataset.ak;
        if (ak === "pos-neu" || ak === "pos-montage") { b.positionen.push(ak === "pos-montage" ? { beschreibung: "Montage inkl. Abdichtung (Arbeitsleistung)", details: "Einbau nach Stand der Technik, innen und außen abgedichtet", menge: 1, einheit: "pauschal", einzelpreis: 0, art: "arbeit" } : { beschreibung: "", details: "", menge: 1, einheit: "Stk.", einzelpreis: 0, art: "ware" }); zeichne(); bind(); const inputs = $$("#bel-positionen [data-p=beschreibung]"); if (inputs.length) inputs[inputs.length - 1].focus(); setDirty(true); autosave(); return; }
        if (ak === "speichern") { await sichern(true); return; }
        if (ak.startsWith("status:")) { const r = await post("status", { id: b.id, status: ak.split(":")[1] }); if (r.ok) { toast("Status geändert.", "ok"); render(); } else toast(r.error, "err"); return; }
        if (ak === "ab") { await sichern(true); if (E.fehler.length) return; const w = await formModal({ titel: "Auftragsbestätigung erstellen", text: "Alle Positionen werden übernommen; das Angebot gilt als angenommen.", html: `<label class="field small">Voraussichtlicher Liefer-/Montagetermin<input type="date" class="input" name="liefertermin"></label>`, ok: "AB erstellen" }); if (!w) return; const r = await post("ab-erstellen", { id: b.id, liefertermin: w.liefertermin }); if (r.ok) { toast("Auftragsbestätigung " + r.beleg.nummer + " erstellt.", "ok"); location.hash = "#angebote/" + r.beleg.id; } else toast(r.error, "err"); return; }
        if (ak === "rechnung") { await sichern(true); if (E.fehler.length) return; const anz = (S.einst && S.einst.bank && Number(S.einst.bank.anzahlungProzent)) || 0; const w = await formModal({ titel: "Rechnung erstellen", text: "Die Rechnung entsteht als Entwurf und erhält ihre Nummer erst beim Festschreiben.", html: `<label class="field small">Art<select class="input" name="typ"><option value="voll">Gesamtrechnung</option>${anz ? `<option value="anzahlung">Anzahlungsrechnung (${anz} %)</option>` : ""}<option value="schluss">Schlussrechnung (abzüglich Anzahlung)</option></select></label><label class="field small">Leistungsdatum<input type="date" class="input" name="leistungsdatum" value="${heute()}"></label>`, ok: "Rechnung erstellen" }); if (!w) return; const r = await post("rechnung-erstellen", { id: b.id, typ: w.typ, leistungsdatum: w.leistungsdatum }); if (r.ok) { toast("Rechnungsentwurf erstellt.", "ok"); location.hash = "#angebote/" + r.beleg.id; } else toast(r.error, "err"); return; }
        if (ak === "festschreiben") { await sichern(true); if (E.fehler.length) return; const ok = await bestaetigen("Rechnung festschreiben", "Die Rechnung erhält die nächste fortlaufende Rechnungsnummer, wird als PDF archiviert und ist danach nicht mehr änderbar. Korrekturen sind nur noch per Stornorechnung möglich.", "Jetzt festschreiben"); if (!ok) return; const r = await post("festschreiben", { id: b.id }); if (r.ok) { toast("Rechnung " + r.beleg.nummer + " festgeschrieben.", "ok"); render(); } else toast(r.error, "err"); return; }
        if (ak === "storno") { const w = await formModal({ titel: "Rechnung stornieren", text: "Es entsteht eine Stornorechnung mit eigener Nummer, die alle Positionen negativ ausweist. Die Rechnung selbst bleibt unverändert archiviert.", html: `<label class="field small">Grund (erscheint im Verlauf)<input type="text" class="input" name="grund" maxlength="300"></label>`, ok: "Stornorechnung erstellen", gefaehrlich: true }); if (!w) return; const r = await post("stornieren", { id: b.id, grund: w.grund }); if (r.ok) { toast("Stornorechnung " + r.storno.nummer + " erstellt.", "ok"); location.hash = "#angebote/" + r.storno.id; } else toast(r.error, "err"); return; }
        if (ak === "zahlung") { const rest = (E.summen ? E.summen.zahlbetrag : 0) - (b.zahlungen || []).reduce((x, z) => x + z.betrag, 0); const w = await formModal({ titel: "Zahlung erfassen", html: `<label class="field small">Betrag in €<input type="text" class="input" inputmode="decimal" name="betrag" value="${dez(rest)}"></label><label class="field small">Zahlungsdatum<input type="date" class="input" name="datum" value="${heute()}"></label><label class="field small">Notiz (optional)<input type="text" class="input" name="notiz" maxlength="200"></label>`, ok: "Zahlung speichern" }); if (!w) return; const r = await post("zahlung", { id: b.id, betrag: centAus(w.betrag), datum: w.datum, notiz: w.notiz }); if (r.ok) { toast("Zahlung erfasst – Status: " + (STATUS[r.beleg.status] || [r.beleg.status])[0], "ok"); render(); } else toast(r.error, "err"); return; }
        if (ak === "senden") { if (!ro) { await sichern(true); if (E.fehler.length) return; } await sendenDialog(b); return; }
      };
      // Drag & Drop der Positionen
      const ol = $("#bel-positionen"); if (!ol || ro) return; let von = null;
      ol.addEventListener("dragstart", (e) => { const li = e.target.closest(".bel-pos"); if (!li) return; von = Number(li.dataset.i); li.classList.add("is-drag"); e.dataTransfer.effectAllowed = "move"; });
      ol.addEventListener("dragover", (e) => { e.preventDefault(); });
      ol.addEventListener("drop", (e) => { e.preventDefault(); const li = e.target.closest(".bel-pos"); if (!li || von === null) return; const zu = Number(li.dataset.i); if (zu === von) return; const [p] = b.positionen.splice(von, 1); b.positionen.splice(zu, 0, p); von = null; zeichne(); bind(); setDirty(true); autosave(); });
      ol.addEventListener("dragend", () => { $$(".bel-pos.is-drag").forEach((x) => x.classList.remove("is-drag")); von = null; });
    }
    bind();
  }
  async function sendenDialog(b) {
    const firmaMail = (b.firma && b.firma.email) || "";
    const standard = `Guten Tag ${b.kunde.name},\n\nanbei erhalten Sie ${b.art === "angebot" ? "unser Angebot" : b.art === "rechnung" ? "unsere Rechnung" : "unsere Auftragsbestätigung"} ${b.nummer} als PDF.\n\nMit freundlichen Grüßen\n${b.firma.geschaeftsfuehrer}\n${b.firma.name}\n${b.firma.telefon} · ${firmaMail}`;
    const w = await formModal({ titel: `${ART[b.art]} ${b.nummer} per E-Mail senden`, html: `<p class="small"><a href="${pdfUrl(b.id)}" target="_blank" rel="noopener">PDF-Vorschau öffnen ↗</a> – bitte vor dem Senden prüfen.</p><label class="field small">An<input type="email" class="input" name="an" value="${h(b.kunde.email || "")}" required></label><label class="field small">Betreff<input type="text" class="input" name="betreff" value="${h(`${ART[b.art]} ${b.nummer} – ${b.firma.kurzname}`)}"></label><label class="field small">Text<textarea class="input" rows="8" name="text">${h(standard)}</textarea></label><label class="small"><input type="checkbox" name="cc" checked> Kopie an ${h(firmaMail || "die Firma")}</label>`, ok: "Jetzt senden" });
    if (!w) return;
    const r = await post("senden", { id: b.id, an: w.an, betreff: w.betreff, text: w.text, cc: !!w.cc });
    if (r.ok) { toast(r.uebersprungen ? "E-Mail-Versand ist noch nicht eingerichtet – der Vorgang wurde nur protokolliert." : "E-Mail gesendet.", r.uebersprungen ? "" : "ok"); render(); } else toast(r.error, "err");
  }

  /* ====================================================================
     Anlegen (neu, aus Kunde, aus Anfrage)
     ==================================================================== */
  async function anlegen(main, sub) {
    const teile = String(sub).split(":"); const body = {};
    if (teile[1] === "anfrage") body.anfrageId = teile[2]; else if (teile[1]) body.kundeId = teile[1];
    main.innerHTML = '<p class="loading">Angebot wird angelegt …</p>';
    const r = await post("anlegen", body);
    if (!r.ok) { main.innerHTML = `<div class="alert alert--err">${h(r.error)}</div><p><a class="btn btn--sm" href="#angebote">Zurück</a></p>`; return; }
    location.replace("#angebote/" + r.beleg.id);
  }

  VIEWS.angebote = async (main, sub) => { if (!sub) return liste(main); if (sub.startsWith("neu")) return anlegen(main, sub); return editor(main, sub); };

  /* ====================================================================
     Kunden
     ==================================================================== */
  VIEWS.kunden = async (main, sub) => {
    if (sub) return kunde(main, sub);
    main.innerHTML = `<div class="page-head"><div><h1>Kunden</h1><span class="muted">Werden automatisch aus Anfragen und Belegen angelegt; hier können Adressen gepflegt werden.</span></div><div class="row"><button type="button" class="btn btn--sm btn--primary" id="ku-neu">+ Neuer Kunde</button></div></div>
      <div class="card bel-liste"><div class="bel-toolbar"><input type="search" class="input" id="ku-suche" placeholder="Name, Firma, Ort, E-Mail …" aria-label="Kunden suchen"></div><div id="ku-tabelle"><p class="loading">Wird geladen …</p></div></div>`;
    let seite = 1, letzteSuche = "";
    const lade = async (suche, mehr) => { if (!mehr) seite = 1; letzteSuche = suche || ""; const d = await get("kunden", { suche: letzteSuche, seite, proSeite: 50 }); if (!d.ok) { $("#ku-tabelle").innerHTML = `<div class="alert alert--err">${h(d.error)}</div>`; return; }
      if (mehr && $("#ku-tabelle tbody")) { $("#ku-tabelle tbody").insertAdjacentHTML("beforeend", d.kunden.map(kundeZeile).join("")); $("#ku-mehr").hidden = seite * d.proSeite >= d.gesamt; return; }
      $("#ku-tabelle").innerHTML = d.kunden.length ? `<table class="tbl bel-tabelle"><thead><tr><th>Name</th><th>Firma</th><th>Adresse</th><th>E-Mail</th><th>Telefon</th><th class="num">Belege</th><th class="num">Umsatz</th><th class="num"></th></tr></thead><tbody>${d.kunden.map(kundeZeile).join("")}</tbody></table><button type="button" class="btn btn--sm mehr-laden" id="ku-mehr" ${seite * d.proSeite >= d.gesamt ? "hidden" : ""}>Weitere Kunden laden</button>` : '<p class="muted bel-leer">Noch keine Kunden.</p>'; };
    const kundeZeile = (k) => `<tr><td class="name" data-l="Name"><a href="#kunden/${h(k.id)}">${h(k.name)}</a></td><td data-l="Firma">${h(k.firma || "–")}</td><td data-l="Adresse">${h([k.strasse, [k.plz, k.ort].filter(Boolean).join(" ")].filter(Boolean).join(", "))}</td><td data-l="E-Mail">${k.email ? `<a href="mailto:${h(k.email)}">${h(k.email)}</a>` : "–"}</td><td data-l="Telefon">${k.telefon ? `<a href="tel:${h(k.telefon)}">${h(k.telefon)}</a>` : "–"}</td><td class="num" data-l="Belege">${k.belege}</td><td class="num" data-l="Umsatz">${eur(k.umsatz)}</td><td class="num nowrap"><a class="btn btn--xs" href="#kunden/${h(k.id)}">Öffnen</a> <a class="btn btn--xs" href="#angebote/neu:${h(k.id)}">Angebot</a></td></tr>`;
    $("#ku-suche").addEventListener("input", entprellt((e) => lade(e.target.value.trim()), 250));
    main.addEventListener("click", (e) => { if (e.target.closest("#ku-mehr")) { seite++; lade(letzteSuche, true); } });
    $("#ku-neu").addEventListener("click", async () => { const w = await kundeModal({ anrede: "", name: "", firma: "", strasse: "", plz: "", ort: "", email: "", telefon: "", notizen: "" }, "Neuer Kunde"); if (!w) return; const r = await post("kunde-speichern", { kunde: w }); if (r.ok) { toast("Kunde angelegt.", "ok"); location.hash = "#kunden/" + r.kunde.id; } else toast(r.error, "err"); });
    await lade("");
  };
  function kundeModal(k, titel) {
    const f = (n, l, t, extra) => `<label class="field small">${l}<input type="${t || "text"}" class="input" name="${n}" value="${h(k[n] || "")}" ${extra || ""}></label>`;
    return formModal({ titel, html: `<div class="bel-grid bel-grid--kunde"><label class="field small">Anrede<select class="input" name="anrede">${["", "Herrn", "Frau"].map((a) => `<option value="${a}" ${k.anrede === a ? "selected" : ""}>${a || "–"}</option>`).join("")}</select></label>${f("name", "Name *")}${f("firma", "Firma")}${f("strasse", "Straße, Nr.")}${f("plz", "PLZ", "text", 'maxlength="5" inputmode="numeric"')}${f("ort", "Ort")}${f("email", "E-Mail", "email")}${f("telefon", "Telefon", "tel")}</div><label class="field small">Notizen<textarea class="input" rows="2" name="notizen">${h(k.notizen || "")}</textarea></label>`, ok: "Speichern" });
  }
  async function kunde(main, id) {
    const d = await get("kunde", { id }); if (!d.ok) throw new Error(d.error);
    const k = d.kunde;
    main.innerHTML = `<div class="page-head"><div><a class="small" href="#kunden">← Alle Kunden</a><h1>${h(k.name)}${k.firma ? ` <span class="muted">· ${h(k.firma)}</span>` : ""}</h1><span class="muted">${h([k.strasse, [k.plz, k.ort].filter(Boolean).join(" ")].filter(Boolean).join(", "))}${k.email ? " · " + h(k.email) : ""}${k.telefon ? " · " + h(k.telefon) : ""}</span></div><div class="row"><button type="button" class="btn btn--sm" id="ku-bearbeiten">Bearbeiten</button><a class="btn btn--sm btn--primary" href="#angebote/neu:${h(k.id)}">+ Neues Angebot</a></div></div>
      ${k.notizen ? `<div class="card"><h2>Notizen</h2><p class="small">${h(k.notizen)}</p></div>` : ""}
      <div class="card bel-liste"><h2>Belege</h2>${d.belege.length ? `<table class="tbl bel-tabelle"><thead><tr><th>Nummer</th><th>Betreff</th><th>Datum</th><th class="num">Betrag</th><th>Status</th><th class="num"></th></tr></thead><tbody>${d.belege.map((b) => `<tr><td class="name" data-l="Nummer"><a href="#angebote/${h(b.id)}">${h(b.nummer || "Entwurf")}</a><span class="sub">${h(ART_KURZ[b.art])}</span></td><td data-l="Betreff">${h(b.betreff)}</td><td data-l="Datum">${dDe(b.datum)}</td><td class="num strong" data-l="Betrag">${eur(b.zahlbetrag)}</td><td data-l="Status">${pill(b.status)}</td><td class="num nowrap"><a class="btn btn--xs" href="#angebote/${h(b.id)}">Öffnen</a> ${b.nummer ? `<a class="btn btn--xs" href="${pdfUrl(b.id)}" target="_blank" rel="noopener">PDF</a>` : ""}</td></tr>`).join("")}</tbody></table>` : '<p class="muted">Noch keine Belege.</p>'}<p class="small muted">Quelle: ${h(k.quelle || "–")} · angelegt ${fmtDT(k.erstellt)}</p></div>`;
    $("#ku-bearbeiten").addEventListener("click", async () => { const w = await kundeModal(k, "Kunde bearbeiten"); if (!w) return; const r = await post("kunde-speichern", { id: k.id, kunde: w }); if (r.ok) { toast("Gespeichert.", "ok"); render(); } else toast(r.error, "err"); });
  }
})();
