/* Referenzen: Kundenstimmen stehen fertig in der Seite (scripts/bewertungen-einsetzen.js, Build); hier nur die
   Sterne-Pflicht im Bewertungsformular. */
(function () {
  "use strict";
  var form = document.querySelector("form[name='bewertung']");
  if (!form) return;
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
})();
