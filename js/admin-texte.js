/* Admin → Texte: visueller Editor ohne sichtbaren Code. Links die echte Seite als Vorschau (iframe, verkleinert);
   ein Klick auf einen Text wählt das passende Feld. Rechts die Felder je Abschnitt der Seite mit einfachen Namen.
   Felder sind kontrollierte contenteditable-Bereiche: Hervorhebung (em) blau, Fett (strong), Links unterstrichen,
   neue Zeile (br). Strukturbausteine (z. B. „01“ vor der Überschrift) und Platzhalter („Steuerhinweis (automatisch)“)
   sind gesperrte Etiketten. Das Lesen/Schreiben des Textes übernimmt js/texte-modell.js (window.FWTexte).
   Nutzt window.FWAdmin. Keine Inline-Styles per Attribut (CSP) – nur Klassen und CSSOM. */
(function () {
  "use strict";
  const A = window.FWAdmin; if (!A) return;
  const { $, $$, h, api, toast, bestaetigen, S, setDirty, startPoll, render, fmtDT, Steuer, Texte, textVisuell, wiederherstellen, pubHtml } = A;
  const ROLLEN = Texte.ROLLEN, LIMITS = Texte.LIMITS;
  const entprellt = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const ICON = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

  /* Zustand der Ansicht */
  let D = null;      // aktuelle Daten (Registry + gespeicherte Admin-Änderungen)
  let R = null;      // Original-Registry (Texte der Seite im Code)
  let MAIN = null, FRAME = null, FOKUS = null;
  let AEND = null;   // id → html | null (Sitzung, bleibt beim Seitenwechsel erhalten)
  const HIST = { liste: [], pos: 0 };
  let letzterStand = {};
  const satz = () => Steuer.satz(S.einst || {});

  /* ====================================================================
     Modell ↔ Editor-DOM
     ==================================================================== */
  function editorHtml(knoten) {
    return (knoten || []).map((n) => {
      if (n.typ === "text") return h(n.text);
      if (n.typ === "br") return "<br>";
      if (n.typ === "em" || n.typ === "strong") return `<${n.typ}>${editorHtml(n.kinder)}</${n.typ}>`;
      if (n.typ === "a") return `<a data-href="${h(n.href || "")}" data-attr="${h(n.attrRoh || "")}" title="Link: ${h(n.href || "")}">${editorHtml(n.kinder)}</a>`;
      if (n.typ === "platzhalter") return `<span class="tx-atom tx-atom--auto" contenteditable="false" data-platzhalter="${h(n.name)}" title="Wird beim Veröffentlichen automatisch eingesetzt">${h(Texte.PLATZHALTER[n.name] || n.name)}</span>`;
      return `<span class="tx-atom" contenteditable="false" data-html="${h(n.html)}" title="Fester Baustein der Seite">${h(Texte.nurText([n]).trim() || "Baustein")}</span>`;
    }).join("");
  }
  function lesen(el) {
    const walk = (node) => {
      const out = [];
      for (const c of node.childNodes) {
        if (c.nodeType === 3) { out.push({ typ: "text", text: c.nodeValue.replace(/ /g, " ") }); continue; }
        if (c.nodeType !== 1) continue;
        const tag = c.tagName;
        if (c.dataset.platzhalter) out.push({ typ: "platzhalter", name: c.dataset.platzhalter });
        else if (c.dataset.html !== undefined) out.push({ typ: "struktur", html: c.dataset.html });
        else if (tag === "BR") out.push({ typ: "br" });
        else if (tag === "EM" || tag === "I") out.push({ typ: "em", kinder: walk(c) });
        else if (tag === "STRONG" || tag === "B") out.push({ typ: "strong", kinder: walk(c) });
        else if (tag === "A") out.push({ typ: "a", href: c.dataset.href || "", attrRoh: c.dataset.attr || "", kinder: walk(c) });
        else { if (tag === "DIV" && out.length) out.push({ typ: "br" }); out.push(...walk(c)); }
      }
      return out;
    };
    /* leere Formatierungen und doppelte Zeilenumbrüche am Ende entfernen */
    const saeubern = (k) => k.filter((n) => !((n.typ === "em" || n.typ === "strong") && !Texte.nurText(n.kinder))).map((n) => (n.kinder ? Object.assign({}, n, { kinder: saeubern(n.kinder) }) : n));
    let knoten = saeubern(walk(el));
    while (knoten.length && knoten[knoten.length - 1].typ === "br") knoten.pop();
    return knoten;
  }
  const htmlVon = (el) => Texte.serialisiere(lesen(el)).trim();
  const anzahlAtome = (html) => Texte.parse(html).filter(Texte.istGesperrt).length + Texte.parse(html).filter((n) => n.kinder).reduce((a, n) => a + n.kinder.filter(Texte.istGesperrt).length, 0);

  /* ====================================================================
     Darstellung
     ==================================================================== */
  const seiteUrl = (s) => "/" + s.datei.replace(/index\.html$/, "");
  function feldHtml(id) {
    const b = D.bloecke[id], wert = aktuellerText(id), ge = istGeaendert(id);
    const rolle = b.rolle || b.tag, limit = LIMITS[rolle] || 600, n = Texte.zeichen(wert);
    return `<div class="tx-feld ${ge ? "is-geaendert" : ""}" data-feld="${h(id)}">
      <div class="tx-feld__kopf"><span class="tx-feld__rolle">${h(ROLLEN[rolle] || rolle)}</span><span class="tx-feld__status">${ge ? `<span class="tx-tag">geändert</span><button type="button" class="btn btn--link small" data-reset="${h(id)}">Zurücksetzen</button>` : ""}</span><span class="tx-zaehler ${n > limit ? "is-ueber" : ""}" data-zaehler="${h(id)}" title="Empfohlene Länge: bis ${limit} Zeichen">${n} / ${limit}</span></div>
      <div class="tx-editor tx-editor--${h(rolle)}" contenteditable="true" spellcheck="true" role="textbox" aria-multiline="true" data-id="${h(id)}" aria-label="${h((ROLLEN[rolle] || rolle) + " – " + (b.abschnittTitel || ""))}">${editorHtml(Texte.parse(wert))}</div>
      <span class="fehler-text" data-fehler="${h(id)}"></span></div>`;
  }
  function aktuellerText(id) { if (AEND[id] === null) return R.bloecke[id] ? R.bloecke[id].html : ""; if (AEND[id] !== undefined) return AEND[id]; return D.bloecke[id].html; }
  function istGeaendert(id) { if (AEND[id] === null) return false; if (AEND[id] !== undefined) return AEND[id] !== (R.bloecke[id] ? R.bloecke[id].html : ""); return !!D.bloecke[id].geaendert; }
  function anzahlOffen() { return Object.keys(AEND).length; }

  function zeichne(main) {
    MAIN = main;
    const s = D.seiten[S.seite];
    const bl = Object.entries(D.bloecke).filter(([, b]) => b.seite === S.seite);
    const abschnitte = []; bl.forEach(([id, b]) => { let a = abschnitte.find((x) => x.key === (b.abschnitt || "weitere")); if (!a) { a = { key: b.abschnitt || "weitere", titel: b.abschnittTitel || "Weitere Texte", ids: [] }; abschnitte.push(a); } a.ids.push(id); });
    const url = seiteUrl(s);
    main.innerHTML = `
      <div class="page-head"><div><h1>Texte</h1><span class="muted">Klicken Sie in der Vorschau auf einen Text oder wählen Sie rechts ein Feld. Markieren Sie Wörter und nutzen Sie die Schaltflächen für Fett, Hervorhebung und Links.</span></div>
        <div class="row tx-kopf"><label class="field tx-seitenwahl"><span class="sr-only">Seite</span><select id="txt-seite" class="input">${Object.entries(D.seiten).map(([k, x]) => `<option value="${h(k)}" ${k === S.seite ? "selected" : ""}>${h(x.titel)}${x.geschuetzt ? " (geschützt)" : ""}</option>`).join("")}</select></label><a class="btn btn--sm" href="${h(url)}" target="_blank" rel="noopener">Seite öffnen ↗</a></div></div>
      <div class="pubbar" id="pubbar">${pubHtml()}</div>
      ${s.geschuetzt ? '<div class="alert alert--warn">Impressum und Datenschutzerklärung sind rechtlich relevante Texte. Änderungen werden erst nach einer zusätzlichen Bestätigung gespeichert.</div>' : ""}
      <div class="tx-layout">
        <aside class="card tx-vorschau" id="tx-vorschau"><div class="tx-vorschau__kopf"><b>Vorschau</b><span class="small muted">So sieht die Seite aus – zum Bearbeiten einen Text anklicken</span></div><div class="tx-vorschau__rahmen" id="tx-rahmen"><iframe id="tx-frame" class="tx-frame" title="Vorschau: ${h(s.titel)}"></iframe></div></aside>
        <div class="tx-felder">
          <div class="card tx-toolbar" role="toolbar" aria-label="Textwerkzeuge">
            <div class="tx-toolbar__btns">
              <button type="button" class="btn btn--sm" data-tb="strong" title="Markierten Text fett (Strg+B)"><b>F</b><span class="lbl">Fett</span></button>
              <button type="button" class="btn btn--sm" data-tb="em" title="Markierten Text hervorheben (Strg+I)"><span class="tx-em-mark">H</span><span class="lbl">Hervorheben</span></button>
              <button type="button" class="btn btn--sm" data-tb="link" title="Link einfügen oder bearbeiten (Strg+K)">${ICON('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.5 1.5"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.5-1.5"/>')}<span class="lbl">Link</span></button>
              <button type="button" class="btn btn--sm" data-tb="br" title="Neue Zeile an der Schreibmarke (Enter)">${ICON('<path d="M20 5v6a3 3 0 0 1-3 3H5"/><path d="M9 10l-4 4 4 4"/>')}<span class="lbl">Neue Zeile</span></button>
              <span class="tx-toolbar__sep" aria-hidden="true"></span>
              <button type="button" class="btn btn--sm" data-tb="undo" title="Rückgängig (Strg+Z)" disabled>${ICON('<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>')}<span class="lbl">Rückgängig</span></button>
              <button type="button" class="btn btn--sm" data-tb="redo" title="Wiederholen (Strg+Y)" disabled>${ICON('<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>')}<span class="lbl">Wiederholen</span></button>
            </div>
            <div class="tx-toolbar__save"><span class="small muted" id="txt-stand"></span><button type="button" class="btn btn--sm" data-t="verwerfen">Änderungen verwerfen</button><button type="button" class="btn btn--sm btn--dark" data-t="speichern">Speichern</button><button type="button" class="btn btn--sm btn--primary" data-t="speichern-pub">Speichern &amp; veröffentlichen</button></div>
          </div>
          <div id="txt-fehler"></div>
          ${abschnitte.map((a) => `<section class="card tx-abschnitt" data-abschnitt="${h(a.key)}"><h2>${h(a.titel)}</h2>${a.ids.map(feldHtml).join("")}</section>`).join("")}
          <section class="card" id="txt-versionen"><h2>Frühere Versionen</h2><p class="muted small">Wird geladen …</p></section>
        </div>
      </div>`;
    letzterStand = {}; bl.forEach(([id]) => { letzterStand[id] = aktuellerText(id); });
    HIST.liste = []; HIST.pos = 0;
    aktualisiereStand();
    vorschauLaden(s);
    ladeVersionen();
  }
  function aktualisiereStand() {
    const n = anzahlOffen();
    const st = $("#txt-stand"); if (st) st.textContent = n ? `${n} ${n === 1 ? "Änderung" : "Änderungen"} nicht gespeichert` : "Alle Änderungen gespeichert";
    $$("[data-t=verwerfen]", MAIN).forEach((b) => { b.disabled = !n; });
    const u = $("[data-tb=undo]", MAIN), r = $("[data-tb=redo]", MAIN); if (u) u.disabled = HIST.pos === 0; if (r) r.disabled = HIST.pos >= HIST.liste.length;
    setDirty(n > 0);
  }
  function feldAktualisieren(id) {
    const feld = $(`[data-feld="${CSS.escape(id)}"]`, MAIN); if (!feld) return;
    const b = D.bloecke[id], wert = aktuellerText(id), ge = istGeaendert(id), rolle = b.rolle || b.tag, limit = LIMITS[rolle] || 600, n = Texte.zeichen(wert);
    feld.classList.toggle("is-geaendert", ge);
    $(".tx-feld__status", feld).innerHTML = ge ? `<span class="tx-tag">geändert</span><button type="button" class="btn btn--link small" data-reset="${h(id)}">Zurücksetzen</button>` : "";
    const z = $(".tx-zaehler", feld); z.textContent = `${n} / ${limit}`; z.classList.toggle("is-ueber", n > limit);
  }
  function feldNeuZeichnen(id) { const feld = $(`[data-feld="${CSS.escape(id)}"]`, MAIN); if (!feld) return; $(".tx-editor", feld).innerHTML = editorHtml(Texte.parse(aktuellerText(id))); feldAktualisieren(id); vorschauSetzen(id); }

  /* Änderung aus einem Editor übernehmen */
  function uebernehmen(id, el, ohneHistorie) {
    let html = htmlVon(el);
    const basis = D.bloecke[id].html, original = R.bloecke[id] ? R.bloecke[id].html : "";
    if (anzahlAtome(html) < anzahlAtome(original)) { toast("Feste Bausteine und automatische Hinweise können nicht gelöscht werden.", "err"); AEND[id] = letzterStand[id] === basis ? undefined : letzterStand[id]; if (AEND[id] === undefined) delete AEND[id]; feldNeuZeichnen(id); return; }
    if (html === basis) delete AEND[id]; else AEND[id] = html;
    if (!ohneHistorie && letzterStand[id] !== html) { HIST.liste.length = HIST.pos; HIST.liste.push({ id, vor: letzterStand[id], nach: html }); HIST.pos = HIST.liste.length; }
    letzterStand[id] = html;
    feldAktualisieren(id); aktualisiereStand(); vorschauSetzen(id);
    const f = $(`[data-fehler="${CSS.escape(id)}"]`, MAIN); if (f) f.textContent = "";
  }
  const uebernehmenSpaeter = entprellt((id, el) => uebernehmen(id, el), 350);
  function setzeText(id, html) { if (html === D.bloecke[id].html) delete AEND[id]; else AEND[id] = html; letzterStand[id] = html; feldNeuZeichnen(id); aktualisiereStand(); }
  function rueckgaengig() { if (HIST.pos === 0) return; const e = HIST.liste[--HIST.pos]; setzeText(e.id, e.vor); fokusAuf(e.id); }
  function wiederholen() { if (HIST.pos >= HIST.liste.length) return; const e = HIST.liste[HIST.pos++]; setzeText(e.id, e.nach); fokusAuf(e.id); }
  function fokusAuf(id, ohneScroll) { const ed = $(`.tx-editor[data-id="${CSS.escape(id)}"]`, MAIN); if (!ed) return; FOKUS = ed; $$(".tx-feld.is-aktiv", MAIN).forEach((x) => x.classList.remove("is-aktiv")); ed.closest(".tx-feld").classList.add("is-aktiv"); if (!ohneScroll) ed.closest(".tx-feld").scrollIntoView({ behavior: "smooth", block: "center" }); vorschauMarkieren(id); }

  /* ====================================================================
     Vorschau (iframe der echten Seite)
     ==================================================================== */
  function vorschauLaden(s) {
    FRAME = $("#tx-frame", MAIN);
    if (!FRAME || !window.matchMedia("(min-width: 901px)").matches) return;
    const rahmen = $("#tx-rahmen", MAIN);
    FRAME.addEventListener("load", () => {
      let doc; try { doc = FRAME.contentDocument; } catch (e) { doc = null; }
      if (!doc || !doc.body) { rahmen.innerHTML = '<p class="tx-vorschau__leer">Die Vorschau konnte nicht geladen werden. Die Felder rechts funktionieren trotzdem.</p>'; return; }
      const link = doc.createElement("link"); link.rel = "stylesheet"; link.href = "/css/admin-vorschau.css?v=" + Date.now(); doc.head.appendChild(link);
      doc.addEventListener("click", (e) => { if (e.__erlaubt) return; e.preventDefault(); e.stopPropagation(); const t = e.target.closest("[data-text]"); if (t && D.bloecke[t.dataset.text]) fokusAuf(t.dataset.text); }, true);
      doc.addEventListener("submit", (e) => e.preventDefault(), true);
      /* Seiteninhalt um ungespeicherte Änderungen ergänzen */
      Object.keys(AEND).forEach((id) => { if (D.bloecke[id] && D.bloecke[id].seite === S.seite) vorschauSetzen(id); });
      skalieren();
      setTimeout(skalieren, 800); setTimeout(skalieren, 2500);
    });
    FRAME.src = seiteUrl(s);
    window.addEventListener("resize", entprellt(skalieren, 150));
  }
  function skalieren() {
    if (!FRAME || !FRAME.contentDocument) return;
    const rahmen = $("#tx-rahmen", MAIN); if (!rahmen) return;
    const B = 1200, k = Math.min(1, rahmen.clientWidth / B);
    const doc = FRAME.contentDocument;
    const film = !!doc.querySelector(".film");
    const hoehe = film ? 820 : Math.max(820, doc.documentElement.scrollHeight);
    FRAME.style.width = B + "px"; FRAME.style.height = hoehe + "px"; FRAME.style.transform = `scale(${k})`;
    rahmen.style.height = Math.min(hoehe * k, window.innerHeight - 160) + "px";
    FRAME.parentElement.style.height = hoehe * k + "px";
  }
  function vorschauSetzen(id) {
    if (!FRAME || !FRAME.contentDocument) return;
    const el = FRAME.contentDocument.querySelector(`[data-text="${CSS.escape(id)}"]`); if (!el) return;
    el.innerHTML = Steuer.ersetzePlatzhalter(aktuellerText(id), satz());
  }
  function vorschauMarkieren(id) {
    if (!FRAME || !FRAME.contentDocument) return;
    const doc = FRAME.contentDocument;
    $$("[data-text].is-text-aktiv", doc).forEach((x) => x.classList.remove("is-text-aktiv"));
    const el = doc.querySelector(`[data-text="${CSS.escape(id)}"]`); if (!el) return;
    el.classList.add("is-text-aktiv");
    const scene = el.closest(".scene");
    if (scene) { const go = doc.querySelector(`[data-go="${scene.dataset.index}"]`); if (go && scene.hasAttribute("inert")) { const ev = new MouseEvent("click", { bubbles: true, cancelable: true }); ev.__erlaubt = true; go.dispatchEvent(ev); } setTimeout(() => el.scrollIntoView({ block: "center" }), 350); return; }
    const rahmen = $("#tx-rahmen", MAIN); const k = parseFloat((FRAME.style.transform.match(/scale\(([\d.]+)\)/) || [])[1] || "1");
    const top = el.getBoundingClientRect().top + doc.documentElement.scrollTop;
    rahmen.scrollTo({ top: Math.max(0, top * k - rahmen.clientHeight / 2 + 40), behavior: "smooth" });
  }

  /* ====================================================================
     Bearbeiten: Auswahl, Formatierung, Links
     ==================================================================== */
  function auswahlIm(ed) { const sel = window.getSelection(); if (!sel || !sel.rangeCount) return null; const r = sel.getRangeAt(0); if (!ed.contains(r.commonAncestorContainer)) return null; return r; }
  function beruehrtAtom(range) { if (range.cloneContents().querySelector("[data-html],[data-platzhalter]")) return true; const el = range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement; return !!(el && el.closest("[data-html],[data-platzhalter]")); }
  function formatieren(tag) {
    const ed = FOKUS; if (!ed) return toast("Bitte zuerst in ein Textfeld klicken.");
    const r = auswahlIm(ed); if (!r || r.collapsed) return toast("Bitte zuerst die Wörter markieren, die Sie formatieren möchten.");
    if (beruehrtAtom(r)) return toast("Feste Bausteine können nicht formatiert werden.", "err");
    const start = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement;
    const vorhanden = start.closest(tag);
    if (vorhanden && ed.contains(vorhanden) && vorhanden !== ed) { const eltern = vorhanden.parentNode; while (vorhanden.firstChild) eltern.insertBefore(vorhanden.firstChild, vorhanden); eltern.removeChild(vorhanden); eltern.normalize(); }
    else { const inhalt = r.extractContents(); $$(tag, inhalt).forEach((x) => { while (x.firstChild) x.parentNode.insertBefore(x.firstChild, x); x.remove(); }); const w = document.createElement(tag); w.appendChild(inhalt); r.insertNode(w); const sel = window.getSelection(); sel.removeAllRanges(); const nr = document.createRange(); nr.selectNodeContents(w); sel.addRange(nr); }
    uebernehmen(ed.dataset.id, ed);
  }
  function neueZeile() {
    const ed = FOKUS; if (!ed) return toast("Bitte zuerst in ein Textfeld klicken.");
    const r = auswahlIm(ed); if (!r) return;
    if (beruehrtAtom(r)) return;
    r.deleteContents(); const br = document.createElement("br"); r.insertNode(br); r.setStartAfter(br); r.collapse(true);
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
    uebernehmen(ed.dataset.id, ed);
  }
  function linkZiele() {
    const z = Object.entries(D.seiten).map(([k, s]) => [seiteUrl(s), s.titel]);
    z.push(["/konfigurator/fenster/", "Fenster-Konfigurator"], ["/konfigurator/haustuer/", "Haustür-Konfigurator"]);
    return z;
  }
  function formModal({ titel, text, html, ok }) {
    return new Promise((resolve) => {
      const m = $("#modal");
      m.innerHTML = `<div class="modal__box"><h2>${h(titel)}</h2>${text ? `<p class="small muted">${h(text)}</p>` : ""}<form id="modal-form" class="stack" novalidate>${html}</form><div class="modal__actions"><button type="button" class="btn" data-m="nein">Abbrechen</button><button type="button" class="btn btn--primary" data-m="ja">${h(ok || "OK")}</button></div></div>`;
      m.hidden = false;
      const schluss = (v) => { m.hidden = true; m.innerHTML = ""; document.removeEventListener("keydown", esc); resolve(v); };
      const esc = (e) => { if (e.key === "Escape") schluss(null); };
      document.addEventListener("keydown", esc);
      const werte = () => { const o = {}; new FormData($("#modal-form")).forEach((v, k) => { o[k] = v; }); return o; };
      m.onclick = (e) => { const b = e.target.closest("[data-m]"); if (!b) { if (e.target === m) schluss(null); return; } schluss(b.dataset.m === "ja" ? werte() : b.dataset.m === "entfernen" ? { entfernen: true } : null); };
      $("#modal-form").addEventListener("submit", (e) => { e.preventDefault(); schluss(werte()); });
      const f = $("#modal-form input, #modal-form select"); if (f) f.focus();
    });
  }
  async function link() {
    const ed = FOKUS; if (!ed) return toast("Bitte zuerst in ein Textfeld klicken.");
    const r = auswahlIm(ed); if (!r) return toast("Bitte zuerst den Text markieren, der verlinkt werden soll.");
    const startEl = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement;
    const vorhandener = startEl.closest("a");
    if (!vorhandener && r.collapsed) return toast("Bitte zuerst den Text markieren, der verlinkt werden soll.");
    if (beruehrtAtom(r)) return toast("Feste Bausteine können nicht verlinkt werden.", "err");
    const ziele = linkZiele(), aktuell = vorhandener ? vorhandener.dataset.href : "";
    const intern = ziele.some(([u]) => u === aktuell) ? aktuell : "";
    const w = await formModal({ titel: vorhandener ? "Link bearbeiten" : "Link einfügen", text: "Wählen Sie eine Seite dieser Website oder geben Sie eine sichere Adresse (https://…) ein.", ok: vorhandener ? "Übernehmen" : "Link einfügen", html: `<label class="field">Seite dieser Website<select class="input" name="seite"><option value="">– bitte wählen –</option>${ziele.map(([u, t]) => `<option value="${h(u)}" ${u === intern ? "selected" : ""}>${h(t)}</option>`).join("")}</select></label><label class="field">oder Adresse<input type="url" class="input" name="url" placeholder="https://…" value="${h(intern ? "" : aktuell)}"></label>${vorhandener ? '<button type="button" class="btn btn--sm btn--danger" data-m="entfernen">Link entfernen</button>' : ""}` });
    if (!w) return;
    if (w.entfernen) { if (vorhandener) { const p = vorhandener.parentNode; while (vorhandener.firstChild) p.insertBefore(vorhandener.firstChild, vorhandener); p.removeChild(vorhandener); p.normalize(); uebernehmen(ed.dataset.id, ed); } return; }
    const ziel = String(w.url || "").trim() || w.seite;
    if (!ziel) return toast("Bitte eine Seite wählen oder eine Adresse eingeben.");
    if (!/^(\/|https:\/\/)/.test(ziel) || !Texte.hrefErlaubt(ziel)) return toast("Erlaubt sind Seiten dieser Website und sichere Adressen (https://…).", "err");
    if (vorhandener) { vorhandener.dataset.href = ziel; vorhandener.title = "Link: " + ziel; }
    else { const inhalt = r.extractContents(); $$("a", inhalt).forEach((x) => { while (x.firstChild) x.parentNode.insertBefore(x.firstChild, x); x.remove(); }); const a = document.createElement("a"); a.dataset.href = ziel; a.dataset.attr = ""; a.title = "Link: " + ziel; a.appendChild(inhalt); r.insertNode(a); }
    uebernehmen(ed.dataset.id, ed);
  }

  /* ====================================================================
     Speichern, Verwerfen, Versionen
     ==================================================================== */
  async function speichern(veroeffentlichen) {
    const aend = Object.assign({}, AEND);
    if (!Object.keys(aend).length) { toast("Keine Änderungen zum Speichern."); if (veroeffentlichen) await A.api.post("veroeffentlichen", { grund: "Texte" }).then((r) => { if (r.ok) { S.pub = r.veroeffentlichung; startPoll(); toast("Veröffentlichung gestartet.", "ok"); } else toast(r.error || "Veröffentlichung nicht möglich.", r.uebersprungen ? "" : "err"); }); return; }
    /* Vorprüfung im Browser mit denselben Regeln wie auf dem Server */
    const fehler = []; for (const [id, html] of Object.entries(aend)) { if (html === null) continue; const p = Texte.pruefe(html, R.bloecke[id] ? R.bloecke[id].html : ""); if (!p.ok) fehler.push({ feld: id, meldung: p.fehler }); }
    if (fehler.length) { zeigeFehler(fehler); return; }
    const geschuetzt = Object.keys(aend).some((id) => D.bloecke[id] && D.bloecke[id].geschuetzt);
    let bestaetigt = false;
    if (geschuetzt) { bestaetigt = await bestaetigen("Rechtliche Texte ändern", "Sie ändern Impressum oder Datenschutzerklärung. Diese Texte sind rechtlich relevant – bitte nur nach Prüfung speichern.", "Ja, speichern", true); if (!bestaetigt) return; }
    const seiten = [...new Set(Object.keys(aend).map((id) => (D.seiten[D.bloecke[id].seite] || {}).titel).filter(Boolean))];
    const r = await api.post("speichern", { bereich: "texte", daten: aend, bestaetigt, beschreibung: "Texte: " + seiten.join(", "), veroeffentlichen: !!veroeffentlichen });
    if (!r.ok) { if (r.fehler && r.fehler.length) zeigeFehler(r.fehler); else toast(r.error || "Speichern fehlgeschlagen.", "err"); return; }
    Object.keys(aend).forEach((id) => delete AEND[id]);
    setDirty(false); toast(`Gespeichert (${r.version.aenderungen} Änderung(en)).`, "ok");
    if (r.veroeffentlichung) { if (r.veroeffentlichung.ok) { S.pub = r.veroeffentlichung.veroeffentlichung; startPoll(); toast("Veröffentlichung gestartet.", "ok"); } else toast(r.veroeffentlichung.error, r.veroeffentlichung.uebersprungen ? "" : "err"); }
    render();
  }
  function zeigeFehler(fehler) {
    $$("[data-fehler]", MAIN).forEach((e) => { e.textContent = ""; });
    fehler.forEach((f) => { const t = $(`[data-fehler="${CSS.escape(f.feld)}"]`, MAIN); if (t) t.textContent = f.meldung; });
    $("#txt-fehler").innerHTML = `<div class="alert alert--err">${fehler.length === 1 ? "Ein Text" : fehler.length + " Texte"} konnte${fehler.length === 1 ? "" : "n"} nicht gespeichert werden – bitte die markierten Felder prüfen.</div>`;
    const erstes = fehler[0] && $(`[data-feld="${CSS.escape(fehler[0].feld)}"]`, MAIN); if (erstes) erstes.scrollIntoView({ behavior: "smooth", block: "center" });
    toast(fehler[0] ? fehler[0].meldung : "Bitte die markierten Felder prüfen.", "err");
  }
  async function ladeVersionen() {
    const box = $("#txt-versionen", MAIN); if (!box) return;
    try {
      const v = await api.get("versionen");
      const vs = (v.versionen || []).filter((x) => x.bereich === "texte").slice(0, 8);
      if (!$("#txt-versionen", MAIN)) return;
      box.innerHTML = `<h2>Frühere Versionen</h2>${vs.length ? vs.map((x) => `<div class="version"><span>${fmtDT(x.wann)} · ${h(x.wer)} · ${x.aenderungen} Änderung(en)${x.beschreibung ? " · " + h(x.beschreibung) : ""}</span><span class="row"><button type="button" class="btn btn--xs" data-vergleich="${h(x.id)}">Vorher / Nachher</button><button type="button" class="btn btn--xs" data-restore="${h(x.id)}">Wiederherstellen</button></span></div>`).join("") : '<p class="muted small">Noch keine gespeicherten Versionen.</p>'}<a href="#versionen" class="small strong">Alle Versionen →</a>`;
    } catch (e) { box.innerHTML = "<h2>Frühere Versionen</h2><p class=\"muted small\">Konnten nicht geladen werden.</p>"; }
  }
  async function vergleich(id) {
    const v = await api.get("version", { id }); if (!v.ok) return toast(v.error, "err");
    const name = (pfad) => { const b = D.bloecke[pfad]; if (!b) return pfad; const s = D.seiten[b.seite]; return `${s ? s.titel : b.seite} · ${b.abschnittTitel || ""} · ${ROLLEN[b.rolle] || b.tag}`; };
    const zeilen = (v.version.diff || []).map((x) => `<tr><td class="name" data-th="Text">${h(name(x.pfad))}</td><td data-th="Vorher">${x.alt == null ? textVisuell(R.bloecke[x.pfad] ? R.bloecke[x.pfad].html : "") + ' <span class="small muted">(Original)</span>' : textVisuell(String(x.alt))}</td><td data-th="Nachher">${x.neu == null ? textVisuell(R.bloecke[x.pfad] ? R.bloecke[x.pfad].html : "") + ' <span class="small muted">(Original)</span>' : textVisuell(String(x.neu))}</td></tr>`).join("");
    await A.modal({ titel: "Vorher / Nachher · " + fmtDT(v.version.wann), html: `<div class="table-wrap tx-vergleich"><table class="tbl tbl--karten"><thead><tr><th>Text</th><th>Vorher</th><th>Nachher</th></tr></thead><tbody>${zeilen || "<tr><td colspan=3>Keine Textänderungen in dieser Version.</td></tr>"}</tbody></table></div>`, ok: "Schließen", abbrechen: "" });
  }

  /* ====================================================================
     Ansicht
     ==================================================================== */
  A.VIEWS.texte = async (main, sub) => {
    const [d, de] = await Promise.all([api.get("daten", { bereich: "texte" }), api.get("daten", { bereich: "einstellungen" })]);
    if (!d.ok) throw new Error(d.error);
    D = d.daten; R = d.original || { seiten: D.seiten, bloecke: D.bloecke }; S.texteRegister = R; if (de.ok) S.einst = de.daten;
    S.texteAend = S.texteAend || {}; AEND = S.texteAend;
    if (sub && D.seiten[sub]) S.seite = sub;
    if (!D.seiten[S.seite]) S.seite = Object.keys(D.seiten)[0];
    zeichne(main);
    main.addEventListener("change", (e) => { if (e.target.id === "txt-seite") { S.seite = e.target.value; history.replaceState(null, "", "#texte/" + S.seite); FOKUS = null; zeichne(main); } });
    main.addEventListener("focusin", (e) => { const ed = e.target.closest(".tx-editor"); if (ed) { FOKUS = ed; $$(".tx-feld.is-aktiv", main).forEach((x) => x.classList.remove("is-aktiv")); ed.closest(".tx-feld").classList.add("is-aktiv"); vorschauMarkieren(ed.dataset.id); } });
    main.addEventListener("input", (e) => { const ed = e.target.closest(".tx-editor"); if (ed) uebernehmenSpaeter(ed.dataset.id, ed); });
    main.addEventListener("beforeinput", (e) => {
      const ed = e.target.closest(".tx-editor"); if (!ed) return;
      if (e.inputType === "insertParagraph" || e.inputType === "insertLineBreak") { e.preventDefault(); neueZeile(); return; }
      const ranges = e.getTargetRanges ? e.getTargetRanges() : [];
      for (const sr of ranges) { const r = document.createRange(); r.setStart(sr.startContainer, sr.startOffset); r.setEnd(sr.endContainer, sr.endOffset); if (beruehrtAtom(r) && !r.collapsed) { e.preventDefault(); toast("Dieser Baustein ist fest und kann nicht geändert werden.", "err"); return; } }
      if (/^format/.test(e.inputType)) e.preventDefault();
    });
    main.addEventListener("keydown", (e) => {
      const ed = e.target.closest(".tx-editor"); if (!ed) return;
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        if (k === "b") { e.preventDefault(); formatieren("strong"); }
        else if (k === "i") { e.preventDefault(); formatieren("em"); }
        else if (k === "k") { e.preventDefault(); link(); }
        else if (k === "z" && !e.shiftKey) { e.preventDefault(); rueckgaengig(); }
        else if (k === "y" || (k === "z" && e.shiftKey)) { e.preventDefault(); wiederholen(); }
        else if (k === "s") { e.preventDefault(); speichern(false); }
        return;
      }
      if (e.key === "Enter") { e.preventDefault(); neueZeile(); }
      if (e.key === "Backspace" || e.key === "Delete") {
        const sel = window.getSelection(); if (!sel || !sel.rangeCount || !sel.isCollapsed) return;
        const r = sel.getRangeAt(0); const n = r.startContainer;
        const nachbar = (vor) => { if (n.nodeType === 3) { if (vor && r.startOffset > 0) return null; if (!vor && r.startOffset < n.nodeValue.length) return null; return vor ? n.previousSibling : n.nextSibling; } return vor ? n.childNodes[r.startOffset - 1] : n.childNodes[r.startOffset]; };
        const nb = nachbar(e.key === "Backspace");
        if (nb && nb.nodeType === 1 && (nb.dataset.html !== undefined || nb.dataset.platzhalter)) { e.preventDefault(); toast("Dieser Baustein ist fest und kann nicht gelöscht werden.", "err"); }
      }
    });
    main.addEventListener("paste", (e) => { const ed = e.target.closest(".tx-editor"); if (!ed) return; e.preventDefault(); const t = (e.clipboardData || window.clipboardData).getData("text/plain").replace(/\s*\n\s*/g, " "); const r = auswahlIm(ed); if (!r || beruehrtAtom(r)) return; r.deleteContents(); const tn = document.createTextNode(t); r.insertNode(tn); r.setStartAfter(tn); r.collapse(true); const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r); uebernehmen(ed.dataset.id, ed); });
    main.addEventListener("drop", (e) => { if (e.target.closest(".tx-editor")) e.preventDefault(); });
    main.addEventListener("click", async (e) => {
      const a = e.target.closest(".tx-editor a"); if (a) { e.preventDefault(); FOKUS = a.closest(".tx-editor"); const sel = window.getSelection(); const r = document.createRange(); r.selectNodeContents(a); sel.removeAllRanges(); sel.addRange(r); await link(); return; }
      const tb = e.target.closest("[data-tb]"); if (tb) { e.preventDefault(); const art = tb.dataset.tb; if (art === "strong" || art === "em") formatieren(art); else if (art === "link") link(); else if (art === "br") neueZeile(); else if (art === "undo") rueckgaengig(); else if (art === "redo") wiederholen(); return; }
      const rs = e.target.closest("[data-reset]"); if (rs) { const id = rs.dataset.reset; const original = R.bloecke[id] ? R.bloecke[id].html : ""; const vorher = letzterStand[id]; if (D.bloecke[id].geaendert) AEND[id] = null; else delete AEND[id]; HIST.liste.length = HIST.pos; HIST.liste.push({ id, vor: vorher, nach: original }); HIST.pos = HIST.liste.length; letzterStand[id] = original; feldNeuZeichnen(id); aktualisiereStand(); return; }
      const vg = e.target.closest("[data-vergleich]"); if (vg) return vergleich(vg.dataset.vergleich);
      const rst = e.target.closest("[data-restore]"); if (rst) return wiederherstellen(rst.dataset.restore);
      const t = e.target.closest("[data-t]"); if (!t) return;
      if (t.dataset.t === "verwerfen") { if (!(await bestaetigen("Änderungen verwerfen", `${anzahlOffen()} ungespeicherte Änderung(en) werden verworfen.`, "Verwerfen", true))) return; Object.keys(AEND).forEach((id) => delete AEND[id]); setDirty(false); zeichne(main); return; }
      await speichern(t.dataset.t === "speichern-pub");
    });
    /* Toolbar-Klicks dürfen den Fokus im Editor nicht zerstören */
    main.addEventListener("mousedown", (e) => { if (e.target.closest("[data-tb]")) e.preventDefault(); });
  };
})();
