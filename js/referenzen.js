/* Referenzen: geprüfte Kundenstimmen aus /data/bewertungen.json anzeigen */
(function () {
  "use strict";
  var box = document.getElementById("reviews");
  if (!box) return;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function stars(n) {
    n = Math.max(1, Math.min(5, parseInt(n, 10) || 0));
    var s = el("span", "review__stars");
    s.setAttribute("aria-label", n + " von 5 Sternen");
    s.setAttribute("role", "img");
    var full = "";
    for (var i = 0; i < 5; i++) full += i < n ? "★" : "☆";
    s.textContent = full;
    return s;
  }
  function fmtDate(iso) {
    var m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(iso || "");
    if (!m) return "";
    var monate = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
    return monate[parseInt(m[2], 10) - 1] + " " + m[1];
  }
  function empty() {
    box.innerHTML = "";
    var p = el("p", "reviews__empty", "Noch keine Bewertungen – seien Sie die/der Erste!");
    box.appendChild(p);
  }
  function render(list) {
    box.innerHTML = "";
    if (!Array.isArray(list) || !list.length) { empty(); return; }
    var ul = el("ul", "reviews__list");
    list
      .slice()
      .sort(function (a, b) { return String(b.datum || "").localeCompare(String(a.datum || "")); })
      .forEach(function (r) {
        if (!r || !r.text) return;
        var li = el("li", "review");
        var head = el("div", "review__head");
        head.appendChild(stars(r.sterne));
        var meta = el("span", "review__meta");
        meta.textContent = [r.projekt, fmtDate(r.datum)].filter(Boolean).join(" · ");
        head.appendChild(meta);
        li.appendChild(head);
        var q = el("blockquote", "review__text");
        q.textContent = r.text;
        li.appendChild(q);
        var who = el("p", "review__who");
        who.textContent = [r.name, r.ort].filter(Boolean).join(", ");
        li.appendChild(who);
        ul.appendChild(li);
      });
    if (!ul.children.length) { empty(); return; }
    box.appendChild(ul);
  }

  fetch("/data/bewertungen.json", { cache: "no-cache" })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(render)
    .catch(empty);

  /* Sterne-Pflichtfeld in die Formularprüfung einbeziehen */
  var form = document.querySelector("form[name='bewertung']");
  if (form) {
    form.addEventListener("submit", function (e) {
      if (!form.querySelector("input[name='sterne']:checked")) {
        e.preventDefault();
        form.classList.add("was-validated");
        var err = form.querySelector(".form__error");
        if (err) err.hidden = false;
        var first = form.querySelector("input[name='sterne']");
        if (first) first.focus();
      }
    }, true);
  }
})();
