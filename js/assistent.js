/* „Daniel – Ihr digitaler Assistent“ (KI) – Oberfläche mit Zwei-Klick-Start.
   Vor „Chat starten“: keine Anfrage an irgendwen (auch nicht an die eigene Function), kein Cookie, kein Speicher.
   Danach spricht die Seite ausschließlich mit /.netlify/functions/assistent (gleiche Herkunft); OpenAI wird nur vom Server
   aufgerufen. Die Konfiguration steht als data-Attribute am eigenen <script>-Tag (setzt der Build: aktiv nur mit Schlüssel + Schalter in Admin → Assistent).
   Zugänglich: Dialog mit Fokus, Esc schließt, Antworten per aria-live; auf dem Telefon bildschirmfüllend.
   Keine Inline-Stile (CSP): Abstände über CSS-Variablen per CSSOM. */
(function () {
  "use strict";
  var TAG = document.currentScript;
  var CFG = TAG ? { aktiv: TAG.getAttribute("data-aktiv") === "1", whatsapp: TAG.getAttribute("data-whatsapp") || "", css: TAG.getAttribute("data-css") || "/css/assistent.css" } : null;
  if (!CFG || !CFG.aktiv) return;
  if (/^\/admin(\/|$)/.test(location.pathname)) return;
  var URL_FN = "/.netlify/functions/assistent";
  var MERKER = "fw-ki-ok";
  var fab, panel, dialog, liste, eingabe, senden, chips, hinweisZeile, statusZeile, hp;
  var token = null, anzahl = 0, max = 20, maxZeichen = 1000, beschaeftigt = false, geoeffnet = false, letzterFokus = null, startZeit = 0, letzteSendung = 0, ende = false;

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; }
  function merker() { try { return sessionStorage.getItem(MERKER) === "1"; } catch (e) { return false; } }
  function merken() { try { sessionStorage.setItem(MERKER, "1"); } catch (e) { /* privater Modus */ } }
  function waLink() { var n = String(CFG.whatsapp || "").replace(/\D/g, ""); return n ? "https://wa.me/" + n : ""; }

  /* Abstand zu festen Leisten unten (Telefon-Navigation, Kontaktleiste, Konfigurator-Leiste) */
  function abstand() {
    var h = 0;
    ["nav--bottom", "ctabar", "konf__bar"].forEach(function (c) {
      var b = document.querySelector("." + c); if (!b) return;
      var cs = getComputedStyle(b); if (cs.display === "none" || cs.position !== "fixed") return;
      h = Math.max(h, b.getBoundingClientRect().height);
    });
    document.documentElement.style.setProperty("--ki-unten", h ? h + "px" : "0px");
  }
  function abstandSpaeter() { abstand(); setTimeout(abstand, 800); setTimeout(abstand, 2500); }

  /* ---------- Knopf + Hinweis (Zwei-Klick) ---------- */
  function baueKnopf() {
    fab = el("button", "ki-fab"); fab.type = "button"; fab.setAttribute("aria-haspopup", "dialog"); fab.setAttribute("aria-expanded", "false");
    fab.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.4 3.3A.75.75 0 0 1 4.4 18.7V16A2.5 2.5 0 0 1 4 13.5v-8Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8.5 9.5h7M8.5 12.5h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg><span class="ki-fab__lang">Fragen? Unser Assistent hilft</span><span class="ki-fab__kurz">Fragen?</span>';
    fab.addEventListener("click", function () { if (geoeffnet) { schliesseDialog(); return; } if (merker() && token) { oeffneDialog(); return; } if (panel && !panel.hidden) schliessePanel(); else oeffnePanel(); });

    panel = el("div", "ki-panel"); panel.hidden = true; panel.setAttribute("role", "dialog"); panel.setAttribute("aria-labelledby", "ki-panel-titel");
    var kopf = el("div", "ki-panel__kopf");
    var titel = el("h2", "ki-panel__titel", "Daniel – Ihr digitaler Assistent "); titel.id = "ki-panel-titel"; titel.appendChild(el("span", "ki-badge", "KI"));
    var zu = el("button", "ki-panel__zu"); zu.type = "button"; zu.setAttribute("aria-label", "Schließen"); zu.innerHTML = "&times;"; zu.addEventListener("click", schliessePanel);
    kopf.appendChild(titel); kopf.appendChild(zu);
    var text = el("p", "ki-panel__text", "Daniel ist ein digitaler KI-Assistent. Ihre Fragen werden zur Beantwortung an OpenAI übertragen. Bitte keine sensiblen Daten eingeben. Mehr in der ");
    var ds = el("a", "", "Datenschutzerklärung"); ds.href = "/datenschutz.html#ki-assistent"; text.appendChild(ds); text.appendChild(document.createTextNode("."));
    var aktionen = el("div", "ki-panel__aktionen");
    var ja = el("button", "btn btn--primary", "Chat starten"); ja.type = "button"; ja.addEventListener("click", starten);
    var nein = el("button", "btn btn--ghost", "Abbrechen"); nein.type = "button"; nein.addEventListener("click", schliessePanel);
    aktionen.appendChild(ja); aktionen.appendChild(nein);
    panel.appendChild(kopf); panel.appendChild(text); panel.appendChild(aktionen);
    var wa = waLink();
    if (wa) { var alt = el("p", "ki-panel__alt", "Lieber per WhatsApp? "); var a = el("a", "", "Nachricht über WhatsApp schreiben"); a.href = wa; a.target = "_blank"; a.rel = "noopener noreferrer"; alt.appendChild(a); panel.appendChild(alt); }
    document.body.appendChild(panel); document.body.appendChild(fab);
    abstandSpaeter(); window.addEventListener("resize", abstand); window.addEventListener("load", abstandSpaeter);
    document.addEventListener("keydown", function (e) { if (e.key !== "Escape") return; if (geoeffnet) { schliesseDialog(); fab.focus(); } else if (panel && !panel.hidden) { schliessePanel(); fab.focus(); } });
  }
  function oeffnePanel() { panel.hidden = false; fab.setAttribute("aria-expanded", "true"); letzterFokus = document.activeElement; panel.querySelector(".btn--primary").focus(); }
  function schliessePanel() { panel.hidden = true; fab.setAttribute("aria-expanded", "false"); }

  /* ---------- Start (erst jetzt eine Anfrage – an die eigene Function) ---------- */
  function starten() {
    var b = panel.querySelector(".btn--primary"); b.disabled = true; b.textContent = "Wird gestartet …";
    anfrage({ aktion: "start", seite: location.pathname }).then(function (r) {
      b.disabled = false; b.textContent = "Chat starten";
      if (!r || r.aktiv === false) { zeigePanelFehler("Der Assistent ist gerade nicht verfügbar. Bitte nutzen Sie Telefon, E-Mail oder WhatsApp."); return; }
      if (r.pause) { schliessePanel(); baueDialog(); oeffneDialog(); nachricht("assistent", r.antwort, r.links); sperreEingabe(); return; }
      if (!r.ok || !r.token) { zeigePanelFehler(r && r.error ? r.error : "Der Assistent ist gerade nicht erreichbar."); return; }
      merken(); token = r.token; max = r.maxNachrichten || 20; maxZeichen = r.maxZeichen || 1000; startZeit = Date.now(); anzahl = 0; ende = false;
      schliessePanel(); baueDialog(); oeffneDialog();
      nachricht("assistent", r.begruessung, []);
      zeigeChips(r.vorschlaege || []);
    });
  }
  function zeigePanelFehler(t) { var p = panel.querySelector(".ki-panel__text"); p.textContent = t; }

  /* ---------- Dialog ---------- */
  function baueDialog() {
    if (dialog) return;
    dialog = el("section", "ki-dialog"); dialog.hidden = true; dialog.setAttribute("role", "dialog"); dialog.setAttribute("aria-modal", "true"); dialog.setAttribute("aria-labelledby", "ki-dialog-titel");
    var kopf = el("header", "ki-dialog__kopf");
    var t = el("div", "ki-dialog__titelzeile");
    var h = el("h2", "ki-dialog__titel", "Daniel – Ihr digitaler Assistent"); h.id = "ki-dialog-titel";
    t.appendChild(h); t.appendChild(el("span", "ki-badge", "KI"));
    var sub = el("p", "ki-dialog__sub", "Fenster-WeissenBurger · Antworten einer KI – keine Beratung durch eine Person");
    var zu = el("button", "ki-dialog__zu"); zu.type = "button"; zu.setAttribute("aria-label", "Chat schließen"); zu.innerHTML = "&times;"; zu.addEventListener("click", schliesseDialog);
    var links = el("div"); links.appendChild(t); links.appendChild(sub);
    kopf.appendChild(links); kopf.appendChild(zu);
    liste = el("div", "ki-dialog__verlauf"); liste.setAttribute("aria-live", "polite"); liste.setAttribute("aria-relevant", "additions");
    chips = el("div", "ki-dialog__chips");
    statusZeile = el("p", "ki-dialog__status"); statusZeile.hidden = true;
    var form = el("form", "ki-dialog__form"); form.setAttribute("novalidate", "");
    hp = el("input", "ki-hp"); hp.type = "text"; hp.name = "firma_website"; hp.tabIndex = -1; hp.autocomplete = "off"; hp.setAttribute("aria-hidden", "true");
    eingabe = el("textarea", "ki-dialog__eingabe"); eingabe.rows = 1; eingabe.maxLength = maxZeichen; eingabe.placeholder = "Ihre Frage zu Fenstern oder Türen …"; eingabe.setAttribute("aria-label", "Ihre Nachricht");
    eingabe.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit ? form.requestSubmit() : sendenKlick(); } });
    eingabe.addEventListener("input", function () { eingabe.style.height = "auto"; eingabe.style.height = Math.min(120, eingabe.scrollHeight) + "px"; });
    senden = el("button", "btn btn--primary ki-dialog__senden", "Senden"); senden.type = "submit";
    form.appendChild(hp); form.appendChild(eingabe); form.appendChild(senden);
    form.addEventListener("submit", function (e) { e.preventDefault(); sendenKlick(); });
    hinweisZeile = el("p", "ki-dialog__fuss", "KI-Antworten können Fehler enthalten. Preise sind unverbindliche Richtpreise. Bitte keine sensiblen Daten eingeben. ");
    var dsl = el("a", "", "Datenschutz"); dsl.href = "/datenschutz.html#ki-assistent"; hinweisZeile.appendChild(dsl);
    dialog.appendChild(kopf); dialog.appendChild(liste); dialog.appendChild(chips); dialog.appendChild(statusZeile); dialog.appendChild(form); dialog.appendChild(hinweisZeile);
    document.body.appendChild(dialog);
    dialog.addEventListener("keydown", fokusFalle);
  }
  function oeffneDialog() { letzterFokus = document.activeElement; dialog.hidden = false; geoeffnet = true; document.documentElement.classList.add("ki-offen"); fab.setAttribute("aria-expanded", "true"); fab.hidden = true; setTimeout(function () { eingabe.focus(); }, 50); }
  function schliesseDialog() { dialog.hidden = true; geoeffnet = false; document.documentElement.classList.remove("ki-offen"); fab.hidden = false; fab.setAttribute("aria-expanded", "false"); fab.querySelector(".ki-fab__lang").textContent = "Chat fortsetzen"; fab.querySelector(".ki-fab__kurz").textContent = "Chat"; if (letzterFokus && letzterFokus.focus) letzterFokus.focus(); }
  function fokusFalle(e) {
    if (e.key !== "Tab") return;
    var f = dialog.querySelectorAll("button:not([disabled]), a[href], textarea:not([disabled])"); var erst = f[0], letzt = f[f.length - 1];
    if (e.shiftKey && document.activeElement === erst) { e.preventDefault(); letzt.focus(); } else if (!e.shiftKey && document.activeElement === letzt) { e.preventDefault(); erst.focus(); }
  }

  /* ---------- Nachrichten ---------- */
  function nachricht(wer, text, links, sofort) {
    var m = el("div", "ki-msg ki-msg--" + wer);
    var wo = el("span", "ki-msg__wer", wer === "assistent" ? "Daniel (KI)" : "Sie");
    var b = el("div", "ki-msg__text");
    m.appendChild(wo); m.appendChild(b); liste.appendChild(m);
    if (wer === "assistent" && !sofort) tippen(b, text, function () { haengeLinks(m, links); scrollen(); });
    else { b.textContent = text; haengeLinks(m, links); }
    scrollen();
    return m;
  }
  /* „Streaming“-Darstellung: der Text erscheint fortlaufend (Antwort kommt als Ganzes vom Server) */
  function tippen(ziel, text, fertig) {
    var i = 0, schritt = Math.max(2, Math.round(text.length / 90)), reduziert = false;
    try { reduziert = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { /* egal */ }
    if (reduziert) { ziel.textContent = text; fertig(); return; }
    (function lauf() { i = Math.min(text.length, i + schritt); ziel.textContent = text.slice(0, i); if (i < text.length) setTimeout(lauf, 16); else fertig(); })();
  }
  function haengeLinks(m, links) {
    if (!links || !links.length) return;
    var box = el("div", "ki-msg__links");
    links.forEach(function (l) {
      if (!l || !l.url || !/^(\/|tel:|mailto:|https:\/\/wa\.me\/)/.test(l.url)) return;
      var a = el("a", "btn btn--sm " + (l.art === "konfigurator" || l.art === "anfrage" ? "btn--primary" : "btn--ghost"), l.text || l.url); a.href = l.url;
      if (/^https:/.test(l.url)) { a.target = "_blank"; a.rel = "noopener noreferrer"; }
      box.appendChild(a);
    });
    if (box.childNodes.length) m.appendChild(box);
  }
  function zeigeChips(vorschlaege) {
    chips.innerHTML = "";
    vorschlaege.forEach(function (v) { var c = el("button", "ki-chip", v); c.type = "button"; c.addEventListener("click", function () { eingabe.value = v; sendenKlick(); }); chips.appendChild(c); });
  }
  function scrollen() { liste.scrollTop = liste.scrollHeight; }
  function status(t) { statusZeile.hidden = !t; statusZeile.textContent = t || ""; }
  function sperreEingabe() { eingabe.disabled = true; senden.disabled = true; chips.innerHTML = ""; }

  function sendenKlick() {
    if (beschaeftigt || ende) return;
    var text = (eingabe.value || "").trim();
    if (!text) return;
    if (text.length > maxZeichen) { status("Bitte höchstens " + maxZeichen + " Zeichen."); return; }
    var jetzt = Date.now();
    if (jetzt - startZeit < 2000 || jetzt - letzteSendung < 1000) { status("Einen Moment bitte …"); setTimeout(function () { status(""); }, 1200); return; }
    letzteSendung = jetzt; beschaeftigt = true; senden.disabled = true; chips.innerHTML = "";
    nachricht("nutzer", text, [], true);
    eingabe.value = ""; eingabe.style.height = "auto";
    var warte = el("div", "ki-msg ki-msg--assistent ki-msg--warte"); warte.innerHTML = '<span class="ki-msg__wer">Daniel (KI)</span><div class="ki-msg__text"><span class="ki-punkte" aria-label="Antwort wird geschrieben"><i></i><i></i><i></i></span></div>'; liste.appendChild(warte); scrollen();
    anfrage({ aktion: "nachricht", token: token, text: text, hp: hp.value, t: jetzt }).then(function (r) {
      warte.remove(); beschaeftigt = false; senden.disabled = false;
      if (!r) { nachricht("assistent", "Der Assistent ist gerade nicht erreichbar. Bitte versuchen Sie es gleich noch einmal oder nutzen Sie Telefon oder E-Mail.", []); return; }
      if (r.neustart) { token = null; nachricht("assistent", r.error || "Die Sitzung ist abgelaufen.", []); sperreEingabe(); var n = el("button", "ki-chip", "Chat neu starten"); n.type = "button"; n.addEventListener("click", function () { eingabe.disabled = false; senden.disabled = false; starten(); }); chips.appendChild(n); return; }
      if (!r.ok) { status(r.error || "Das hat nicht geklappt."); if (r.links) nachricht("assistent", r.error, r.links, true); return; }
      status("");
      nachricht("assistent", r.antwort, r.links);
      anzahl = r.zaehler || anzahl + 1;
      if (r.ende) { ende = true; sperreEingabe(); }
      else if (anzahl >= max - 2) status((max - anzahl) + " Nachricht(en) in diesem Gespräch übrig.");
      eingabe.focus();
    });
  }
  function anfrage(body) {
    return fetch(URL_FN, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body), credentials: "omit" })
      .then(function (r) { return r.json().catch(function () { return { ok: false, error: "Unerwartete Antwort (" + r.status + ")." }; }); })
      .catch(function () { return null; });
  }

  /* Eigenes Stylesheet erst jetzt laden (eigene Herkunft; Pfad mit Versionskennung aus data-css) – Seiten ohne aktiven Assistenten tragen nichts davon */
  function start() {
    var l = document.createElement("link"); l.rel = "stylesheet"; l.href = CFG.css;
    var fertig = false; var los = function () { if (fertig) return; fertig = true; baueKnopf(); };
    l.onload = los; l.onerror = los; document.head.appendChild(l); setTimeout(los, 1500);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
