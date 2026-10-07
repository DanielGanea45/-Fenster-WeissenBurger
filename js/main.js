/* Fenster-WeissenBurger – Film-Navigation, Logo, Formular */
(function () {
  "use strict";

  var DUR = 1800; // ms, muss zu --dur in style.css passen
  var SCENES = ["home", "produkte", "leistungen", "ueber-uns", "kontakt"];
  var film = document.getElementById("film");
  if (!film) { initPage(); return; }

  var scenes = Array.prototype.slice.call(film.querySelectorAll(".scene"));
  var videos = scenes.map(function (s) { return s.querySelector(".scene__video"); });
  var links = Array.prototype.slice.call(document.querySelectorAll("[data-go]"));
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var current = 0;
  var stopTimer = null;

  function playVideo(v) {
    if (!v) return;
    if (v.preload === "none") { v.preload = "auto"; v.load(); }
    var p = v.play();
    if (p && typeof p.catch === "function") { p.catch(function () { /* Autoplay blockiert -> Poster bleibt */ }); }
  }

  function go(i, opts) {
    opts = opts || {};
    i = Math.max(0, Math.min(SCENES.length - 1, i | 0));
    var instant = opts.instant || reduced;

    if (instant) { film.style.transition = "none"; }
    film.style.transform = "translateY(" + (-i * 100) + "svh)";
    if (instant) { void film.offsetHeight; film.style.transition = ""; }

    playVideo(videos[i]);
    clearTimeout(stopTimer);
    stopTimer = setTimeout(function () {
      videos.forEach(function (v, k) { if (k !== i && v && !v.paused) v.pause(); });
    }, instant ? 0 : DUR);

    links.forEach(function (a) {
      var k = +a.getAttribute("data-go");
      if (a.closest(".nav")) {
        if (k === i) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
      }
    });
    scenes.forEach(function (s, k) { s.toggleAttribute("inert", k !== i); });

    if (i !== current || opts.force) {
      scenes[i].querySelector(".scene__inner").scrollTop = 0;
    }
    current = i;
    if (!opts.silent) {
      var hash = "#" + SCENES[i];
      if (location.hash !== hash) {
        if (history.pushState) history.pushState(null, "", hash); else location.hash = hash;
      }
    }
  }

  function indexFromHash() {
    var h = (location.hash || "").replace("#", "");
    var i = SCENES.indexOf(h);
    return i < 0 ? 0 : i;
  }

  links.forEach(function (a) {
    a.addEventListener("click", function (e) {
      e.preventDefault();
      go(+a.getAttribute("data-go"));
    });
  });
  window.addEventListener("popstate", function () { go(indexFromHash(), { silent: true }); });
  window.addEventListener("hashchange", function () { go(indexFromHash(), { silent: true }); });

  // Tastatur: Pfeile / Bild auf/ab wechseln die Szene
  document.addEventListener("keydown", function (e) {
    if (e.target && /^(input|textarea|select)$/i.test(e.target.tagName)) return;
    if (e.key === "ArrowDown" || e.key === "PageDown") { e.preventDefault(); go(current + 1); }
    if (e.key === "ArrowUp" || e.key === "PageUp") { e.preventDefault(); go(current - 1); }
  });

  // Startszene ohne Animation (z. B. Rücksprung von Impressum mit #kontakt)
  go(indexFromHash(), { instant: true, silent: true, force: true });

  // Sichtbarkeit: Video nur laufen lassen, wenn Tab aktiv
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) { videos.forEach(function (v) { v && v.pause(); }); }
    else { playVideo(videos[current]); }
  });

  initForm();
  initPage();

  /* ---------- Formular: einfache Client-Prüfung ---------- */
  function initForm() {
    var form = document.querySelector("form.form");
    if (!form) return;
    var err = form.querySelector(".form__error");
    form.addEventListener("submit", function (e) {
      form.classList.add("was-validated");
      if (!form.checkValidity()) {
        e.preventDefault();
        if (err) err.hidden = false;
        var first = form.querySelector(":invalid");
        if (first && first.focus) first.focus();
      } else if (err) {
        err.hidden = true;
      }
    });
  }

  function initPage() {
    var y = document.getElementById("year");
    if (y) y.textContent = String(new Date().getFullYear());
  }
})();
