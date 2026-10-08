/* Live-Chat (Crisp) mit Zwei-Klick-Lösung – DSGVO/TDDDG-konform ohne Cookie-Banner.
   Vor dem Klick auf „Chat laden“ wird nichts von Crisp geladen (kein Skript, kein Cookie, keine Verbindung).
   Die Konfiguration schreibt der Build in die Markierung unten (Kennung aus der Umgebungsvariable CRISP_WEBSITE_ID,
   Schalter und WhatsApp-Nummer aus Admin → Einstellungen → Website). Ohne Kennung oder bei ausgeschaltetem Chat
   passiert gar nichts. Die Entscheidung des Besuchers gilt nur für den aktuellen Browser-Tab (Sitzungsspeicher).
   Keine Inline-Stile (CSP): Positionen werden über CSS-Variablen per CSSOM gesetzt. */
(function () {
  "use strict";
  var CFG = /*CHAT*/{"id":"","aktiv":false,"whatsapp":"4917681338935"}/*/CHAT*/;
  if (!CFG || !CFG.aktiv || !CFG.id) return;
  if (/^\/admin(\/|$)/.test(location.pathname)) return;
  var MERKER = "fw-chat-ok";
  var geladen = false, fab, panel, letzterFokus;

  function merker() { try { return sessionStorage.getItem(MERKER) === "1"; } catch (e) { return false; } }
  function merken() { try { sessionStorage.setItem(MERKER, "1"); } catch (e) { /* privater Modus – dann eben nicht */ } }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; }
  function waLink() { var n = String(CFG.whatsapp || "").replace(/\D/g, ""); return n ? "https://wa.me/" + n : ""; }

  /* Abstand zu festen Leisten am unteren Rand (Telefon-Navigation, Kontaktleiste, Konfigurator-Leiste) */
  function abstand() {
    var h = 0;
    ["nav--bottom", "ctabar", "konf__bar"].forEach(function (c) {
      var b = document.querySelector("." + c); if (!b) return;
      var cs = getComputedStyle(b); if (cs.display === "none" || cs.position !== "fixed") return; // Konfigurator-Leiste ist vor dem Befüllen unsichtbar, hält aber ihre Höhe
      h = Math.max(h, b.getBoundingClientRect().height);
    });
    document.documentElement.style.setProperty("--chat-unten", h ? h + "px" : "0px");
  }
  function abstandSpaeter() { abstand(); setTimeout(abstand, 800); setTimeout(abstand, 2500); }

  function ladeCrisp() {
    if (geladen) return; geladen = true;
    merken();
    window.$crisp = window.$crisp || [];
    window.CRISP_WEBSITE_ID = CFG.id;
    window.CRISP_RUNTIME_CONFIG = { locale: "de" };
    window.CRISP_COOKIE_EXPIRE = 7 * 24 * 3600; // Crisp-Cookies: 7 Tage statt 6 Monate
    window.$crisp.push(["safe", true]);
    window.$crisp.push(["config", "color:theme", ["blue"]]); // passend zum Blau der Website
    window.$crisp.push(["on", "session:loaded", function () {
      if (fab) fab.hidden = true;
      if (panel) schliessen();
      if (!merkerBeimStart) window.$crisp.push(["do", "chat:open"]);
    }]);
    var s = document.createElement("script");
    s.src = "https://client.crisp.chat/l.js"; s.async = true;
    s.onerror = function () { geladen = false; if (fab) { fab.hidden = false; fab.classList.remove("is-laedt"); } zeigeFehler(); };
    document.head.appendChild(s);
  }
  var merkerBeimStart = false;

  function zeigeFehler() {
    oeffnen();
    var p = panel.querySelector(".chat-panel__text");
    p.textContent = "Der Chat konnte gerade nicht geladen werden. Schreiben Sie uns gern per WhatsApp oder E-Mail – wir melden uns schnell.";
  }
  function baue() {
    fab = el("button", "chat-fab", "");
    fab.type = "button"; fab.setAttribute("aria-haspopup", "dialog"); fab.setAttribute("aria-expanded", "false");
    fab.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.4 3.3A.75.75 0 0 1 4.4 18.7V16A2.5 2.5 0 0 1 4 13.5v-8Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg><span>Chat starten</span>';
    fab.addEventListener("click", function () { if (panel && !panel.hidden) schliessen(); else oeffnen(); });

    panel = el("div", "chat-panel"); panel.hidden = true;
    panel.setAttribute("role", "dialog"); panel.setAttribute("aria-modal", "false"); panel.setAttribute("aria-labelledby", "chat-panel-titel");
    var kopf = el("div", "chat-panel__kopf");
    var titel = el("h2", "chat-panel__titel", "Live-Chat"); titel.id = "chat-panel-titel";
    var zu = el("button", "chat-panel__zu", ""); zu.type = "button"; zu.setAttribute("aria-label", "Schließen"); zu.innerHTML = "&times;";
    zu.addEventListener("click", schliessen);
    kopf.appendChild(titel); kopf.appendChild(zu);
    var text = el("p", "chat-panel__text", "Für den Chat wird Crisp (Crisp IM SAS, Frankreich) geladen. Dabei werden Daten an Crisp übertragen. Mehr in der ");
    var ds = el("a", "", "Datenschutzerklärung"); ds.href = "/datenschutz.html#live-chat"; text.appendChild(ds); text.appendChild(document.createTextNode("."));
    var aktionen = el("div", "chat-panel__aktionen");
    var ja = el("button", "btn btn--primary", "Chat laden"); ja.type = "button";
    ja.addEventListener("click", function () { fab.classList.add("is-laedt"); fab.querySelector("span").textContent = "Chat wird geladen …"; text.textContent = "Der Chat wird geladen …"; ladeCrisp(); });
    var nein = el("button", "btn btn--ghost", "Abbrechen"); nein.type = "button"; nein.addEventListener("click", schliessen);
    aktionen.appendChild(ja); aktionen.appendChild(nein);
    panel.appendChild(kopf); panel.appendChild(text); panel.appendChild(aktionen);
    var wa = waLink();
    if (wa) {
      var alt = el("p", "chat-panel__alt", "Lieber per WhatsApp? ");
      var a = el("a", "", "Nachricht über WhatsApp schreiben"); a.href = wa; a.target = "_blank"; a.rel = "noopener noreferrer";
      alt.appendChild(a); panel.appendChild(alt);
    }
    document.body.appendChild(panel); document.body.appendChild(fab);
    abstandSpaeter();
    window.addEventListener("resize", abstand);
    window.addEventListener("load", abstandSpaeter);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && panel && !panel.hidden) { schliessen(); fab.focus(); } });
  }
  function oeffnen() { panel.hidden = false; fab.setAttribute("aria-expanded", "true"); letzterFokus = document.activeElement; panel.querySelector(".btn--primary").focus(); }
  function schliessen() { panel.hidden = true; fab.setAttribute("aria-expanded", "false"); if (letzterFokus && letzterFokus.focus && letzterFokus !== document.body) letzterFokus.focus(); }

  function start() {
    if (merker()) { merkerBeimStart = true; ladeCrisp(); return; } // in diesem Tab bereits zugestimmt → direkt laden
    baue();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
