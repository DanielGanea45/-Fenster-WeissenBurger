/* Seitenübergang „durchs Fenster“ (zwei Phasen, verbunden über sessionStorage).
   Wird synchron im <head> geladen, damit die neue Seite ohne Blitz mit offenem Fenster startet. */
(function () {
  "use strict";
  var KEY = "fw-transition";
  var TOTAL = 1600;        // Gesamtdauer der Zeitachse
  var NAV_AT = 700;        // Zeitpunkt der Navigation (Flügel bereits halb offen)
  var ENTER_MIN = 700, ENTER_MAX = 1024;
  var doc = document, html = doc.documentElement;
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var supported = !reduced && "sessionStorage" in window && typeof html.animate === "function" && CSS.supports && CSS.supports("transform-style", "preserve-3d");
  var state = null; // {phase:"leave"|"enter", overlay, started, url, timer}

  /* ---------- Phase 2: neue Seite ---------- */
  var pending = null;
  try { pending = JSON.parse(sessionStorage.getItem(KEY) || "null"); sessionStorage.removeItem(KEY); } catch (e) { pending = null; }
  if (pending && supported && typeof pending.t0 === "number" && Date.now() - pending.t0 < 6000 && pending.url === location.pathname) {
    var elapsed = Math.max(ENTER_MIN, Math.min(ENTER_MAX, Date.now() - pending.t0));
    html.style.setProperty("--fw-t", elapsed + "ms");
    html.classList.add("fw-enter");
    var startEnter = function () {
      var ov = buildOverlay(pending.type);
      html.appendChild(ov); /* außerhalb von <body>, damit die Body-Animation das Overlay nicht mitskaliert */
      state = { phase: "enter", overlay: ov, started: Date.now() - elapsed };
      state.timer = setTimeout(finishEnter, TOTAL - elapsed + 60);
      ov.addEventListener("animationend", function (e) { if (e.animationName === "fw-through") finishEnter(); });
      setTimeout(finishEnter, 2600); // Sicherheitsnetz
    };
    if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", startEnter); else startEnter();
  }

  function finishEnter() {
    if (!state || state.phase !== "enter") return;
    clearTimeout(state.timer);
    html.classList.remove("fw-enter");
    html.style.removeProperty("--fw-t");
    if (state.overlay && state.overlay.parentNode) state.overlay.parentNode.removeChild(state.overlay);
    state = null;
  }

  /* ---------- Overlay ---------- */
  /* Übergangstypen: "fenster" (Standard), "tuer" (Haustür). Weitere Typen hier registrieren
     und per data-uebergang="…" am Link oder in typeFor() zuweisen. */
  var TYPES = { fenster: fensterMarkup, tuer: tuerMarkup };
  function typeFor(a, url) {
    var t = a && a.getAttribute && a.getAttribute("data-uebergang");
    if (t && TYPES[t]) return t;
    if (/^\/produkte\/haustueren\/?$/.test(url.pathname)) return "tuer";
    return "fenster";
  }
  function tuerMarkup() {
    return (
      '<div class="fw__opening fw__opening--tuer">' +
        '<div class="fw__frame fw__frame--tuer">' +
          '<span class="fw__hinge fw__hinge--l fw__hinge--1"></span><span class="fw__hinge fw__hinge--l fw__hinge--2"></span><span class="fw__hinge fw__hinge--l fw__hinge--3"></span>' +
          '<div class="fw__door"><div class="fw__strip"></div><div class="fw__bar"></div><div class="fw__lock"></div><div class="fw__edge fw__edge--door"></div></div>' +
          '<div class="fw__panel"></div>' +
        "</div>" +
        '<div class="fw__threshold"></div>' +
      "</div>"
    );
  }
  function fensterMarkup() {
    return (
      '<div class="fw__opening">' +
        '<div class="fw__frame">' +
          '<span class="fw__hinge fw__hinge--l fw__hinge--t"></span><span class="fw__hinge fw__hinge--l fw__hinge--b"></span>' +
          '<span class="fw__hinge fw__hinge--r fw__hinge--t"></span><span class="fw__hinge fw__hinge--r fw__hinge--b"></span>' +
          '<div class="fw__sash fw__sash--l"><div class="fw__glass"></div><div class="fw__edge"></div><div class="fw__handle"></div></div>' +
          '<div class="fw__sash fw__sash--r"><div class="fw__glass"></div><div class="fw__edge"></div></div>' +
        "</div>" +
        '<div class="fw__sill"></div>' +
      "</div>"
    );
  }
  function buildOverlay(type) {
    type = TYPES[type] ? type : "fenster";
    var ov = doc.createElement("div");
    ov.className = "fw fw--" + type;
    ov.setAttribute("aria-hidden", "true");
    ov.innerHTML = TYPES[type]();
    return ov;
  }

  /* ---------- Phase 1: aktuelle Seite ---------- */
  function internalLink(a, e) {
    if (!a || !a.href) return null;
    if (e && (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)) return null;
    if (a.target && a.target !== "_self") return null;
    if (a.hasAttribute("download") || a.hasAttribute("data-no-transition")) return null;
    var url;
    try { url = new URL(a.href, location.href); } catch (err) { return null; }
    if (url.origin !== location.origin) return null;
    if (!/^https?:$/.test(url.protocol)) return null;
    if (url.pathname === location.pathname && url.search === location.search) return null; // Anker / gleiche Seite
    return url;
  }

  function leave(url, type) {
    if (state) return;
    var t0 = Date.now();
    html.style.setProperty("--fw-t", "0ms");
    html.classList.add("fw-leave");
    var ov = buildOverlay(type);
    html.appendChild(ov); /* außerhalb von <body>, damit die Body-Animation das Overlay nicht mitskaliert */
    state = { phase: "leave", overlay: ov, started: t0, url: url.href, type: type };
    state.timer = setTimeout(function () { go(url, t0); }, NAV_AT);
  }

  function go(url, t0) {
    if (!state || state.phase !== "leave") return;
    clearTimeout(state.timer);
    try { sessionStorage.setItem(KEY, JSON.stringify({ t0: t0, url: url.pathname, type: state.type })); } catch (e) { /* kein Storage: normale Navigation */ }
    state.navigating = true;
    location.href = url.href;
  }

  /* Zweiter Klick: Animation abkürzen */
  doc.addEventListener("click", function (e) {
    if (!state) return;
    if (state.phase === "leave") {
      e.preventDefault();
      if (!state.navigating) go(new URL(state.url), state.started);
    } else if (state.phase === "enter") {
      finishEnter(); // Klick geht normal weiter
    }
  }, true);

  doc.addEventListener("click", function (e) {
    if (!supported || state) return;
    var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
    var url = internalLink(a, e);
    if (!url) return;
    e.preventDefault();
    leave(url, typeFor(a, url));
  });

  /* Vorladen bei Hover / Touch / Fokus */
  var prefetched = {};
  function prefetch(a) {
    var url = internalLink(a, null);
    if (!url || prefetched[url.pathname]) return;
    prefetched[url.pathname] = true;
    var l = doc.createElement("link");
    l.rel = "prefetch";
    l.href = url.pathname + url.search;
    l.as = "document";
    doc.head.appendChild(l);
  }
  ["mouseover", "touchstart", "focusin"].forEach(function (ev) {
    doc.addEventListener(ev, function (e) {
      var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
      if (a) prefetch(a);
    }, { passive: true });
  });

  /* Zurück-Navigation aus dem bfcache: alles zurücksetzen */
  window.addEventListener("pageshow", function (e) {
    if (!e.persisted) return;
    html.classList.remove("fw-leave", "fw-enter");
    html.style.removeProperty("--fw-t");
    var ov = doc.querySelector(".fw");
    if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
    state = null;
  });
})();
