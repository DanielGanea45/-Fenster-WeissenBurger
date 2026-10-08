/* Landing-Page „Leistungen“: Hero-Video, Service-Vorauswahl, Lightbox */
(function () {
  "use strict";
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Hero-Video erst nach dem Laden starten (schont LCP) */
  var hero = document.querySelector(".hero__video");
  var sparsam = reduced || (navigator.connection && navigator.connection.saveData) || window.matchMedia("(prefers-reduced-data: reduce)").matches;
  if (hero && !sparsam) {
    var start = function () {
      var klein = hero.getAttribute("data-klein");
      if (klein && window.matchMedia("(max-width: 700px)").matches) { while (hero.firstChild) hero.removeChild(hero.firstChild); var s = document.createElement("source"); s.src = klein; s.type = "video/mp4"; hero.appendChild(s); }
      hero.preload = "auto";
      hero.load();
      var p = hero.play();
      if (p && p.catch) p.catch(function () {});
    };
    if (document.readyState === "complete") setTimeout(start, 300);
    else window.addEventListener("load", function () { setTimeout(start, 300); });
  }

  /* Karten-Buttons: Leistung im Formular vorauswählen und hinscrollen */
  var select = document.getElementById("f-leistung");
  document.querySelectorAll("[data-leistung]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var wanted = btn.getAttribute("data-leistung");
      if (select) {
        var found = false;
        Array.prototype.forEach.call(select.options, function (o) {
          if (o.text === wanted) { select.value = o.value; found = true; }
        });
        if (!found) { var o = new Option(wanted, wanted, true, true); select.add(o, 0); }
      }
      var target = document.getElementById("anfrage");
      if (target) target.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
      var name = document.getElementById("f-name");
      if (name) setTimeout(function () { name.focus({ preventScroll: true }); }, reduced ? 0 : 700);
    });
  });

  /* Lightbox mit Wischgeste */
  var dlg = document.getElementById("lightbox");
  var links = Array.prototype.slice.call(document.querySelectorAll("#gallery a"));
  if (!dlg || !links.length || typeof dlg.showModal !== "function") return;
  var img = dlg.querySelector(".lb__img");
  var cap = dlg.querySelector(".lb__cap");
  var idx = 0;

  function show(i) {
    idx = (i + links.length) % links.length;
    var a = links[idx];
    var thumb = a.querySelector("img");
    img.src = a.getAttribute("href");
    img.alt = thumb ? thumb.alt : "";
    cap.textContent = (thumb ? thumb.alt : "") + " (" + (idx + 1) + "/" + links.length + ")";
  }
  function open(i) {
    show(i);
    dlg.showModal();
    document.body.style.overflow = "hidden";
  }
  function close() {
    dlg.close();
    document.body.style.overflow = "";
  }
  links.forEach(function (a, i) {
    a.addEventListener("click", function (e) { e.preventDefault(); open(i); });
  });
  dlg.addEventListener("click", function (e) {
    var act = e.target.getAttribute && e.target.getAttribute("data-lb");
    if (act === "close") close();
    else if (act === "prev") show(idx - 1);
    else if (act === "next") show(idx + 1);
    else if (e.target === dlg) close();
  });
  dlg.addEventListener("close", function () { document.body.style.overflow = ""; });
  dlg.addEventListener("keydown", function (e) {
    if (e.key === "ArrowRight") show(idx + 1);
    if (e.key === "ArrowLeft") show(idx - 1);
  });
  var x0 = null;
  dlg.addEventListener("touchstart", function (e) { x0 = e.touches[0].clientX; }, { passive: true });
  dlg.addEventListener("touchend", function (e) {
    if (x0 === null) return;
    var dx = e.changedTouches[0].clientX - x0;
    x0 = null;
    if (Math.abs(dx) > 40) show(dx < 0 ? idx + 1 : idx - 1);
  }, { passive: true });
})();
