/* Fenster-WeissenBurger – Film-Navigation, Logo, Formular */
(function () {
  "use strict";

  var DUR = 1800; // ms, muss zu --dur in style.css passen
  var SCENES = ["home", "produkte", "leistungen", "ueber-uns", "kontakt"];
  var film = document.getElementById("film");
  if (!film) { initForm(); initPage(); return; }

  var scenes = Array.prototype.slice.call(film.querySelectorAll(".scene"));
  var videos = scenes.map(function (s) { return s.querySelector(".scene__video"); });
  var links = Array.prototype.slice.call(document.querySelectorAll("[data-go]"));
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  /* Kein Video bei Datensparmodus, prefers-reduced-data oder reduzierter Bewegung – das Poster bleibt stehen */
  var sparsam = reduced || (navigator.connection && navigator.connection.saveData) || window.matchMedia("(prefers-reduced-data: reduce)").matches;
  var current = 0;
  var stopTimer = null;

  /* Videos erst nach dem load-Ereignis anfassen: bis dahin konkurrieren sie mit Schrift, CSS und Text (LCP) */
  var geladen = document.readyState === "complete", ausstehend = null;
  function playVideo(v) {
    if (!v || sparsam) return;
    if (!geladen) { ausstehend = v; return; }
    if (v.preload === "none") {
      var klein = v.getAttribute("data-klein");
      if (klein && window.matchMedia("(max-width: 700px)").matches) { while (v.firstChild) v.removeChild(v.firstChild); var s = document.createElement("source"); s.src = klein; s.type = "video/mp4"; v.appendChild(s); }
      v.preload = "auto"; v.load();
    }
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
  /* Hintergrundvideo der aktuellen Szene erst nach dem Laden starten (siehe playVideo) */
  var heroStart = function () { geladen = true; setTimeout(function () { var v = ausstehend || videos[current]; ausstehend = null; playVideo(v); }, 300); };
  if (geladen) heroStart(); else window.addEventListener("load", heroStart);

  /* ---------- Formulare: Prüfung, Spam-Schutz, Versand über Netlify Function ---------- */
  function initForm() {
    var cfg = window.FW_CONFIG || {};
    var spam = cfg.spam || {};
    var frc = cfg.friendlyCaptcha || {};
    var forms = Array.prototype.slice.call(document.querySelectorAll("form[data-netlify]"));
    if (!forms.length) return;
    var minMs = (spam.minSeconds || 3) * 1000;

    if (frc.enabled && frc.sitekey) loadScriptOnce(frc.script);

    forms.forEach(function (form) {
      /* Zeitstempel des Seitenaufrufs (für Mindestzeit) + Kennzeichen „JS aktiv“ */
      var ts = hidden(form, "ts", String(Date.now()));
      hidden(form, "js", "1");

      /* Friendly Captcha – nur wenn in config.js aktiviert */
      if (frc.enabled && frc.sitekey && !form.querySelector(".frc-captcha")) {
        var w = document.createElement("div");
        w.className = "frc-captcha";
        w.setAttribute("data-sitekey", frc.sitekey);
        w.setAttribute("data-api-endpoint", frc.endpoint || "eu");
        w.setAttribute("data-lang", frc.lang || "de");
        var btn = form.querySelector("button[type=submit]");
        form.insertBefore(w, btn || null);
      }

      var err = form.querySelector(".form__error");
      var errDefault = err ? err.textContent : "";
      function fail(msg) { if (err) { err.textContent = msg || errDefault; err.hidden = false; } }

      form.addEventListener("submit", onSubmit);
      function onSubmit(e) {
        if (e.defaultPrevented) return;
        form.classList.add("was-validated");
        if (!form.checkValidity()) {
          e.preventDefault();
          fail(errDefault);
          var first = form.querySelector(":invalid");
          if (first && first.focus) first.focus();
          return;
        }
        if (Date.now() - Number(ts.value) < minMs) {
          e.preventDefault();
          fail("Das ging sehr schnell – bitte prüfen Sie Ihre Angaben kurz und senden Sie dann erneut.");
          return;
        }
        if (frc.enabled && frc.sitekey) {
          var sol = form.querySelector("input[name='frc-captcha-response']");
          if (!sol || !sol.value || sol.value.charAt(0) === ".") {
            e.preventDefault();
            fail("Bitte warten Sie einen Moment, bis die Sicherheitsprüfung abgeschlossen ist, und senden Sie dann erneut.");
            return;
          }
        }
        if (!spam.functionUrl || !window.fetch) return; // klassischer Versand an Netlify Forms

        e.preventDefault();
        if (err) err.hidden = true;
        var button = form.querySelector("button[type=submit]");
        var label = button ? button.textContent : "";
        if (button) { button.disabled = true; button.textContent = "Wird gesendet …"; }

        var fields = {};
        var fd = new FormData(form);
        fd.forEach(function (v, k) { fields[k] = fields[k] === undefined ? v : [].concat(fields[k], v); });
        var action = form.getAttribute("action") || "/danke.html";

        fetch(spam.functionUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify({ form: form.getAttribute("name"), fields: fields, page: location.pathname, sitekey: frc.sitekey || undefined }),
          credentials: "same-origin"
        }).then(function (r) {
          if (!r.ok && r.status !== 200) throw new Error("http " + r.status);
          return r.json();
        }).then(function (res) {
          if (res && res.ok) { location.href = action; return; }
          var reason = res && res.reason;
          if (reason === "zeit") fail("Das ging sehr schnell – bitte prüfen Sie Ihre Angaben kurz und senden Sie dann erneut.");
          else if (reason === "captcha") fail("Die Sicherheitsprüfung ist fehlgeschlagen. Bitte laden Sie die Seite neu und versuchen Sie es noch einmal.");
          else if (reason === "felder") fail(errDefault);
          else fail("Senden nicht möglich. Bitte rufen Sie uns an: 0176 81338935.");
          if (button) { button.disabled = false; button.textContent = label; }
        }).catch(function () {
          /* Function nicht erreichbar (z. B. lokal): klassischer Versand an Netlify Forms */
          form.removeEventListener("submit", onSubmit);
          if (button) { button.disabled = false; button.textContent = label; }
          HTMLFormElement.prototype.submit.call(form);
        });
      }
    });

    function hidden(form, name, value) {
      var el = form.querySelector("input[name='" + name + "']");
      if (!el) { el = document.createElement("input"); el.type = "hidden"; el.name = name; form.appendChild(el); }
      el.value = value;
      return el;
    }
    function loadScriptOnce(src) {
      if (!src || document.querySelector("script[src='" + src + "']")) return;
      var s = document.createElement("script");
      s.src = src; s.async = true; s.defer = true;
      document.head.appendChild(s);
    }
  }

  /* ---------- Kopfzeile: über dunklem Hero transparent, nach dem Scrollen weiß ---------- */
  function initHeader() {
    var top = document.querySelector(".top");
    if (!top || !document.body.classList.contains("dark-hero")) return;
    var tick = false;
    function update() { top.classList.toggle("top--solid", window.scrollY > 40); tick = false; }
    window.addEventListener("scroll", function () { if (!tick) { tick = true; requestAnimationFrame(update); } }, { passive: true });
    update();
  }

  /* ---------- E-Mail-Adresse erst im Browser zusammensetzen (Schutz vor Adress-Sammlern) ---------- */
  function initMail() {
    Array.prototype.slice.call(document.querySelectorAll(".mail[data-u][data-d]")).forEach(function (el) {
      var addr = el.getAttribute("data-u") + "@" + el.getAttribute("data-d");
      var a = document.createElement("a");
      a.href = "mailto:" + addr;
      a.textContent = addr;
      a.className = el.className.replace(/\bmail\b/, "mail mail--ready");
      el.parentNode.replaceChild(a, el);
    });
  }


  /* ---------- Hauptmenü: Untermenüs (Produkte, Konfigurator) per Klick/Tastatur, Menü-Knopf auf dem Telefon ---------- */
  function initNav() {
    var top = document.querySelector(".top"), nav = top && top.querySelector(".nav--top"), btn = top && top.querySelector(".menu-btn");
    if (!top || !nav) return;
    var desktop = window.matchMedia("(min-width: 900px)");
    var items = function () { return Array.prototype.slice.call(nav.querySelectorAll(".nav__item")); };
    function setItem(item, open) {
      item.classList.toggle("is-open", open);
      var a = item.querySelector(":scope > a"); if (a) a.setAttribute("aria-expanded", String(open));
    }
    function closeItems(except) { items().forEach(function (it) { if (it !== except) setItem(it, false); }); }
    function setMenu(open) {
      if (!btn) return;
      top.classList.toggle("is-menu-open", open);
      btn.setAttribute("aria-expanded", String(open));
      btn.setAttribute("aria-label", open ? "Menü schließen" : "Menü öffnen");
      if (open) { closeItems(); var k = nav.querySelector(".nav__item--konf:not([hidden])"); if (k) setItem(k, true); }
    }
    if (btn) btn.addEventListener("click", function () { setMenu(!top.classList.contains("is-menu-open")); });
    nav.addEventListener("click", function (e) {
      var a = e.target.closest(".nav__item > a"); if (!a || !nav.contains(a)) return;
      var item = a.parentNode;
      if (!desktop.matches || item.classList.contains("nav__item--konf")) { e.preventDefault(); var open = !item.classList.contains("is-open"); closeItems(item); setItem(item, open); }
    });
    nav.addEventListener("keydown", function (e) {
      var item = e.target.closest(".nav__item");
      if (e.key === "Escape") { closeItems(); setMenu(false); if (item) { var a0 = item.querySelector(":scope > a"); if (a0) a0.focus(); } else if (btn && !desktop.matches) btn.focus(); return; }
      if (item && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
        var links = Array.prototype.slice.call(item.querySelectorAll(".nav__drop a")); if (!links.length) return;
        e.preventDefault(); setItem(item, true);
        var i = links.indexOf(document.activeElement);
        var next = e.key === "ArrowDown" ? (i < 0 ? 0 : Math.min(links.length - 1, i + 1)) : (i <= 0 ? -1 : i - 1);
        if (next < 0) { var a1 = item.querySelector(":scope > a"); if (a1) a1.focus(); } else links[next].focus();
      }
    });
    nav.addEventListener("focusout", function (e) { var item = e.target.closest(".nav__item"); if (item && desktop.matches && !item.contains(e.relatedTarget)) setItem(item, false); });
    document.addEventListener("click", function (e) { if (!top.contains(e.target)) { closeItems(); setMenu(false); } });
    desktop.addEventListener ? desktop.addEventListener("change", function () { closeItems(); setMenu(false); }) : desktop.addListener(function () { closeItems(); setMenu(false); });
  }


  /* ---------- Ankündigungsbanner: nur im eingestellten Zeitraum, nach dem Schließen für die Sitzung ausgeblendet ---------- */
  function initBanner() {
    var b = document.querySelector(".ankuendigung"); if (!b) return;
    var von = b.getAttribute("data-von"), bis = b.getAttribute("data-bis"), heute = new Date().toISOString().slice(0, 10);
    if ((von && heute < von) || (bis && heute > bis)) return;
    try { if (sessionStorage.getItem("fw-banner-zu") === "1") return; } catch (e) { /* egal */ }
    b.hidden = false;
    var zu = b.querySelector(".ankuendigung__zu");
    if (zu) zu.addEventListener("click", function () { b.hidden = true; try { sessionStorage.setItem("fw-banner-zu", "1"); } catch (e) { /* egal */ } });
  }

  function initPage() {
    initHeader();
    initNav();
    initBanner();
    initMail();
    var y = document.getElementById("year");
    if (y) y.textContent = String(new Date().getFullYear());
    initLogo();
    initPrefetch();
  }

  /* Unterseiten beim Zeigen/Berühren eines Links vorab laden (nur gleiche Herkunft, nicht bei Datensparmodus) */
  function initPrefetch() {
    if (navigator.connection && navigator.connection.saveData) return;
    var fertig = {};
    function vorladen(a) {
      var href = a.getAttribute("href");
      if (!href || /^(#|mailto:|tel:|https?:)/i.test(href) || a.target) return;
      var url; try { url = new URL(href, location.href); } catch (e) { return; }
      if (url.origin !== location.origin || url.pathname === location.pathname || /\/(admin|\.netlify)\//.test(url.pathname) || /\.(pdf|zip|xml)$/i.test(url.pathname) || fertig[url.pathname]) return;
      fertig[url.pathname] = true;
      var l = document.createElement("link"); l.rel = "prefetch"; l.href = url.pathname; l.as = "document"; document.head.appendChild(l);
    }
    var handler = function (e) { var a = e.target && e.target.closest ? e.target.closest("a[href]") : null; if (a) vorladen(a); };
    document.addEventListener("mouseover", handler);
    document.addEventListener("touchstart", handler, { passive: true });
    document.addEventListener("focusin", handler);
  }

  /* Logo: Animation läuft einmal beim Laden (CSS im SVG), bei Hover erneut */
  function initLogo() {
    var brand = document.querySelector(".brand");
    var svg = document.querySelector(".brand__svg");
    if (!brand || !svg) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    brand.addEventListener("mouseenter", function () {
      svg.classList.remove("anim");
      void svg.getBoundingClientRect();
      svg.classList.add("anim");
    });
  }
})();
