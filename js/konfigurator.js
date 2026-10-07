/* Konfigurator für Fenster und Haustüren.
   Preise ausschließlich aus /data/preise.json, Berechnung über js/preis.js (dasselbe Modul wie in der
   Netlify Function, die den Preis beim Angebot neu berechnet). Ist die Liste ungültig oder die
   Konfiguration außerhalb der Grenzen → „Preis auf Anfrage“. */
(function () {
  "use strict";
  var root = document.getElementById("konf");
  if (!root || !window.FWPreis) return;
  var Preis = window.FWPreis;
  var produkt = root.getAttribute("data-produkt") === "haustuer" ? "haustuer" : "fenster";
  var IMG = "/assets/konfigurator/";
  var liste = null, listeOk = false;
  var state = produkt === "fenster"
    ? { produkt: "fenster", system: "koemmerling-76-md", typ: "1-fluegelig", breiteMm: 1200, hoeheMm: 1400, menge: 1, farbe: "weiss", glas: "3-fach", sprossen: "keine", rollladen: "keiner", zusaetze: [], montage: true, demontage: true }
    : { produkt: "haustuer", modell: "modern-voll", breiteMm: 1100, hoeheMm: 2100, menge: 1, farbe: "anthrazit", glas: "standard", seitenteil: "keines", zusaetze: [], montage: true, demontage: true };
  readHash();

  var STEPS = produkt === "fenster"
    ? [{ id: "profil", label: "Profil" }, { id: "typ", label: "Typ" }, { id: "masse", label: "Maße" }, { id: "farbe", label: "Farbe" }, { id: "glas", label: "Glas" }, { id: "sprossen", label: "Sprossen" }, { id: "rollladen", label: "Rollladen" }, { id: "zusaetze", label: "Zusätze" }, { id: "angebot", label: "Angebot" }]
    : [{ id: "modell", label: "Modell" }, { id: "masse", label: "Maße" }, { id: "farbe", label: "Farbe" }, { id: "glas", label: "Glas" }, { id: "seitenteil", label: "Seitenteil" }, { id: "zusaetze", label: "Zusätze" }, { id: "angebot", label: "Angebot" }];
  var step = 0;

  var els = {
    steps: root.querySelector(".konf__steps"), panels: root.querySelector(".konf__panels"), preview: root.querySelector(".preview svg"),
    previewBox: root.querySelector(".preview"), foto: root.querySelector(".preview__foto"), etikett: root.querySelector(".preview__etikett"), masse: root.querySelector(".preview__masse"), note: root.querySelector(".preview__note"),
    price: root.querySelector(".price"), summary: root.querySelector(".summary dl"), pos: root.querySelector(".posliste tbody"),
    bar: document.querySelector(".konf__bar"), form: root.querySelector("form[data-netlify]"),
    progress: root.querySelector(".konf__progress__txt"), progressBar: root.querySelector(".konf__progress__bar i"),
  };

  renderSteps();
  window.addEventListener("hashchange", function () { readHash(); render(); });
  var B = null; // Bildauswahl (js/konfigurator-bilder.js + data/konfigurator-bilder.json)
  var bilderGeladen = fetch("/data/konfigurator-bilder.json", { cache: "no-cache" }).then(function (r) { return r.json(); }).then(function (j) { if (window.FWBilder) B = window.FWBilder.Bilder(j); }).catch(function () { B = null; });
  Promise.all([fetch("/data/preise.json", { cache: "no-cache" }).then(function (r) { return r.json(); }), bilderGeladen]).then(function (res) {
    var j = res[0];
    liste = j; listeOk = Preis.validiereListe(j).ok;
    if (B) B.setPreise(j); // Optionsnamen für die Bildzuordnung (auch im Admin umbenannte/neue Optionen)
    if (!listeOk) console.warn("Preisliste ungültig:", Preis.validiereListe(j).fehler);
    render();
  }).catch(function () { liste = null; listeOk = false; render(); });

  /* ---------- Helfer ---------- */
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function fmtEuro(c) { return Preis.euro(c); }
  function pic(bild, alt, cls, eager) {
    if (!bild) return "";
    var info = B && B.info(bild);
    var groessen = (info && info.groessen) || [400, 800];
    var h = info && info.breite && info.hoehe ? Math.round(400 * info.hoehe / info.breite) : (cls === "tuer" ? 536 : 400);
    var sizes = cls === "klein" ? "72px" : cls === "zusatz" ? "(min-width: 900px) 200px, (min-width: 600px) 30vw, 96px" : "(min-width: 900px) 220px, 45vw";
    return '<img src="' + IMG + bild + "-" + groessen[0] + '.webp" srcset="' + groessen.map(function (g) { return IMG + bild + "-" + g + ".webp " + g + "w"; }).join(", ") + '" sizes="' + sizes + '" width="400" height="' + h + '" alt="' + esc(alt) + '" loading="' + (eager ? "eager" : "lazy") + '"' + (eager ? ' fetchpriority="high"' : "") + ' decoding="async">';
  }
  function L() { return liste && (produkt === "fenster" ? liste.fenster : liste.haustuer); }
  function calc(cfg) { return listeOk ? Preis.berechne(cfg || state, liste) : { ok: false, fehler: ["preisliste"] }; }
  function deltaText(key, value) {
    /* Preisunterschied dieser Option zur aktuellen Auswahl (für die Karten) */
    if (!listeOk) return "";
    var a = calc(), b = calc(Object.assign({}, state, (function () { var o = {}; o[key] = value; return o; })()));
    if (!a.ok || !b.ok) return "";
    var d = b.brutto - a.brutto;
    if (d === 0) return "inklusive";
    return (d > 0 ? "+ " : "− ") + fmtEuro(Math.abs(d));
  }
  function writeHash() {
    try {
      var p = new URLSearchParams();
      Object.keys(state).forEach(function (k) { if (k !== "produkt") p.set(k, Array.isArray(state[k]) ? state[k].join(",") : String(state[k])); });
      history.replaceState(null, "", "#" + p.toString());
    } catch (e) { /* egal */ }
  }
  function readHash() {
    if (!location.hash || location.hash.length < 3) return;
    try {
      var p = new URLSearchParams(location.hash.slice(1));
      p.forEach(function (v, k) {
        if (!(k in state) || k === "produkt") return;
        if (Array.isArray(state[k])) state[k] = v ? v.split(",") : [];
        else if (typeof state[k] === "number") state[k] = parseInt(v, 10) || state[k];
        else if (typeof state[k] === "boolean") state[k] = v === "true";
        else state[k] = v;
      });
    } catch (e) { /* egal */ }
  }

  /* ---------- Rendern ---------- */
  function render() {
    renderSteps();
    renderPanel();
    renderAside();
    renderBar();
    writeHash();
    updateForm();
  }
  function renderSteps() {
    els.steps.innerHTML = STEPS.map(function (s, i) {
      return '<li><button type="button" class="' + (i === step ? "is-active" : i < step ? "is-done" : "") + '" data-step="' + i + '"><span class="n">' + (i + 1) + "</span>" + esc(s.label) + "</button></li>";
    }).join("");
    var active = els.steps.querySelector(".is-active");
    if (active && els.steps.scrollWidth > els.steps.clientWidth + 4) els.steps.scrollLeft = Math.max(0, active.getBoundingClientRect().left - els.steps.getBoundingClientRect().left + els.steps.scrollLeft - 16);
    if (els.progress) els.progress.textContent = "Schritt " + (step + 1) + " von " + STEPS.length + " · " + STEPS[step].label;
    if (els.progressBar) els.progressBar.style.width = Math.round((step + 1) / STEPS.length * 100) + "%"; // CSSOM statt Inline-Style (CSP)
  }
  function cards(key, map, opts) {
    opts = opts || {};
    var html = Object.keys(map).filter(function (id) { return map[id].aktiv !== false; }).map(function (id, idx) {
      var e = map[id];
      var sel = state[key] === id;
      var sub = opts.sub ? opts.sub(e, id) : (e.kurz || "");
      var badges = opts.badges ? opts.badges(e, id) : "";
      var bildName = B ? B.karte(produkt, key, id, e, state) : e.bild;
      var img = bildName ? pic(bildName, (opts.alt ? opts.alt(e) : e.name) + " – Abbildung beispielhaft", opts.imgCls, idx < 4) : (e.hex ? '<div class="opt__swatch" data-hex="' + esc(e.hex) + '"></div>' : "");
      var spiegel = B && B.spiegeln(produkt, key, id, e);
      return '<label class="opt' + (opts.imgCls === "tuer" ? " opt--tuer" : "") + (spiegel ? " opt--spiegel" : "") + (sel ? " is-selected" : "") + '"><input type="radio" name="k-' + key + '" value="' + esc(id) + '"' + (sel ? " checked" : "") + ">" + badges + img +
        '<div class="opt__body"><span class="opt__name">' + esc(e.name) + "</span>" + (sub ? '<span class="opt__sub">' + sub + "</span>" : "") +
        '<span class="opt__price">' + (opts.price ? opts.price(e, id) : deltaText(key, id)) + "</span></div></label>";
    }).join("");
    return '<div class="opts' + (opts.four ? " opts--4" : "") + '" data-key="' + key + '">' + html + "</div>";
  }
  function multiCards(key, map) {
    var ohneRollladen = produkt === "fenster" && (!state.rollladen || state.rollladen === "keiner" || (L() && L().rollladen && L().rollladen[state.rollladen] && !Preis.cent(L().rollladen[state.rollladen].zuschlagProM2) && /kein|ohne/i.test(L().rollladen[state.rollladen].name || "")));
    return '<div class="opts opts--zusatz" data-multi="' + key + '">' + Object.keys(map).filter(function (id) { return map[id].aktiv !== false; }).map(function (id, idx) {
      var e = map[id]; var sel = state[key].indexOf(id) >= 0;
      var inaktiv = !!(e.nurMitRollladen && ohneRollladen);
      var preisTxt = e.art === "proLfm" ? fmtEuro(Preis.cent(e.zuschlag)) + " je lfm Breite" : "+ " + fmtEuro(Preis.cent(e.zuschlag)) + " je Element";
      var bildName = B ? B.karte(produkt, "zusatz", id, e, state) : null;
      var alt = esc(e.name) + " – Abbildung beispielhaft";
      return '<label class="opt opt--check' + (inaktiv ? " opt--inaktiv" : "") + (sel && !inaktiv ? " is-selected" : "") + '"' + (inaktiv ? ' aria-disabled="true"' : "") + '><input type="checkbox" value="' + esc(id) + '"' + (sel && !inaktiv ? " checked" : "") + (inaktiv ? " disabled" : "") + ' aria-label="' + esc(e.name) + '">' +
        (bildName ? pic(bildName, alt, "zusatz", idx < 3).replace("<img ", '<img data-lightbox="' + esc(bildName) + '" ') : "") +
        '<div class="opt__body"><span class="opt__name">' + esc(e.name) + "</span>" + (e.nurMitRollladen ? '<span class="opt__sub">Nur zusammen mit Rollladen</span>' : "") + '<span class="opt__price">' + preisTxt + "</span>" + (inaktiv ? '<span class="opt__hinweis">Nur mit Rollladen wählbar</span>' : "") + "</div></label>";
    }).join("") + "</div>";
  }
  /* Lightbox: Klick auf ein Kartenbild zeigt es groß; Esc oder Klick schließt */
  function lightbox(name) {
    var info = (B && B.info(name)) || {}; var groessen = info.groessen || [400, 900]; var g = groessen[groessen.length - 1];
    var box = document.querySelector(".lightbox");
    if (!box) { box = document.createElement("div"); box.className = "lightbox"; box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); box.setAttribute("aria-label", "Bild vergrößert"); box.hidden = true; box.innerHTML = '<button type="button" class="lightbox__schliessen" aria-label="Schließen">×</button><figure><img alt=""><figcaption></figcaption></figure>'; document.body.appendChild(box);
      box.addEventListener("click", function () { box.hidden = true; }); document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !box.hidden) box.hidden = true; }); }
    var img = box.querySelector("img"); img.src = IMG + name + "-" + g + ".webp"; img.alt = info.alt || ""; box.querySelector("figcaption").textContent = info.alt || "";
    box.hidden = false; box.querySelector(".lightbox__schliessen").focus();
  }
  function renderPanel() {
    var s = STEPS[step].id, D = L(), html = "";
    var ortName = produkt === "fenster" ? "Fenster" : "Haustür";
    if (!D) { html = '<h2>Preisliste wird geladen …</h2>'; }
    else if (s === "profil") {
      html = '<h2>Welches <em>Profil?</em></h2><p class="lead lead--sm">Kunststoff, Kunststoff-Aluminium oder Aluminium – alle Werte sind Herstellerangaben.</p>' +
        cards("system", D.systeme, {
          sub: function (e) { return esc(e.material) + " · " + e.bautiefeMm.toString().replace(".", ",") + " mm · " + (e.kammern ? e.kammern + " Kammern" : "therm. Trennung " + e.thermischeTrennungMm + " mm") + "<br>" + esc(e.kurz || ""); },
          badges: function (e) { return '<div class="badges"><span class="badge badge--uf">Uf ' + String(e.uf).replace(".", ",") + "</span>" + (e.besterPreis ? '<span class="badge badge--best">Bester Preis</span>' : "") + "</div>"; },
          price: function (e) { return "ab <strong>" + fmtEuro(Preis.cent(e.preisProM2)) + "/m²</strong>"; },
          alt: function (e) { return "Profilschnitt " + e.name; },
        });
    } else if (s === "modell") {
      html = '<h2>Welches <em>Modell?</em></h2><p class="lead lead--sm">Grundpreis für Standardmaß bis 1100 × 2100 mm, inklusive Griff und Mehrfachverriegelung.</p>' +
        cards("modell", D.modelle, { imgCls: "tuer", price: function (e) { return "ab <strong>" + fmtEuro(Preis.cent(e.grundpreis)) + "</strong>"; }, alt: function (e) { return "Haustür " + e.name; } });
    } else if (s === "typ") {
      html = '<h2>Welcher <em>Fenstertyp?</em></h2><p class="lead lead--sm">Öffnungsart des Elements.</p>' + cards("typ", D.typen, { sub: function (e) { return e.zuschlagProzent ? (e.zuschlagProzent > 0 ? "+" : "−") + Math.abs(e.zuschlagProzent) + " % auf den Grundpreis" : "Standard"; }, alt: function (e) { return "Fenster " + e.name; } });
    } else if (s === "masse") {
      var g = D.grenzen; var sys = produkt === "fenster" ? D.systeme[state.system] : null;
      var bMax = sys && sys.breiteMaxMm ? sys.breiteMaxMm : g.breiteMaxMm, hMax = sys && sys.hoeheMaxMm ? sys.hoeheMaxMm : g.hoeheMaxMm;
      var r = calc(); var fe = r.ok ? [] : r.fehler;
      html = '<h2>Welche <em>Maße?</em></h2><p class="lead lead--sm">Außenmaße des Elements in Millimetern. Das genaue Aufmaß nehmen wir kostenlos vor Ort.</p>' +
        '<div class="masse">' +
        '<div class="form__row' + (fe.some(function (x) { return /breite/.test(x); }) ? " is-invalid" : "") + '"><label for="k-breite">Breite (mm)</label><input id="k-breite" type="number" inputmode="numeric" min="' + g.breiteMinMm + '" max="' + bMax + '" step="1" value="' + state.breiteMm + '" data-num="breiteMm"><span class="range">' + g.breiteMinMm + " – " + bMax + " mm</span></div>" +
        '<div class="form__row' + (fe.some(function (x) { return /hoehe/.test(x); }) ? " is-invalid" : "") + '"><label for="k-hoehe">Höhe (mm)</label><input id="k-hoehe" type="number" inputmode="numeric" min="' + g.hoeheMinMm + '" max="' + hMax + '" step="1" value="' + state.hoeheMm + '" data-num="hoeheMm"><span class="range">' + g.hoeheMinMm + " – " + hMax + " mm</span></div>" +
        '<div class="form__row' + (fe.some(function (x) { return /menge/.test(x); }) ? " is-invalid" : "") + '"><label for="k-menge">Anzahl gleicher Elemente</label><input id="k-menge" type="number" inputmode="numeric" min="1" max="' + g.mengeMax + '" step="1" value="' + state.menge + '" data-num="menge"><span class="range">1 – ' + g.mengeMax + "</span></div>" +
        (produkt === "fenster" ? '<div class="form__row"><label>&nbsp;</label><span class="range">Mindestabrechnung ' + String(g.mindestflaecheM2).replace(".", ",") + " m² je Element</span></div>" : '<div class="form__row"><label>&nbsp;</label><span class="range">Über ' + g.standardBreiteMaxMm + " × " + g.standardHoeheMaxMm + " mm: Übergröße +" + g.uebergroesseProzent + " %</span></div>") +
        "</div>" + (fe.length && fe[0] !== "preisliste" ? '<p class="fehler">Bitte prüfen Sie die rot markierten Maße.</p>' : "") +
        '<div class="checks checks--konf checks--abstand">' +
        '<label class="check' + (B && B.hat("zusatz-montage") ? " check--bild" : "") + (state.montage ? " is-selected" : "") + '"><input type="checkbox" data-bool="montage"' + (state.montage ? " checked" : "") + '>' + (B && B.hat("zusatz-montage") ? pic("zusatz-montage", "Fachgerechte Montage – Abbildung beispielhaft", "klein", false) : "") + '<span><strong>Montage durch Fenster-WeissenBurger</strong><span class="sub">' + fmtEuro(Preis.cent(D.montage.montageProElement)) + " je Element</span></span></label>" +
        '<label class="check' + (B && B.hat("zusatz-demontage") ? " check--bild" : "") + (state.demontage ? " is-selected" : "") + '"><input type="checkbox" data-bool="demontage"' + (state.demontage ? " checked" : "") + (state.montage ? "" : " disabled") + '>' + (B && B.hat("zusatz-demontage") ? pic("zusatz-demontage", "Demontage und Entsorgung – Abbildung beispielhaft", "klein", false) : "") + '<span><strong>Demontage &amp; Entsorgung der alten Elemente</strong><span class="sub">' + fmtEuro(Preis.cent(D.montage.demontageEntsorgungProElement)) + " je Element (nur mit Montage)</span></span></label></div>";
    } else if (s === "farbe") {
      html = '<h2>Welche <em>Farbe?</em></h2><p class="lead lead--sm">Weiß ist im Preis enthalten; Dekore und Farben als Zuschlag auf den Grundpreis.</p>' + cards("farbe", D.farben, { sub: function (e) { return e.zuschlagProzent ? "+" + e.zuschlagProzent + " %" : "Standard"; }, alt: function (e) { return ortName + " in " + e.name; }, four: true });
    } else if (s === "glas") {
      html = '<h2>Welches <em>Glas?</em></h2>' + cards("glas", D.glas, { sub: function (e) { return produkt === "fenster" ? (e.zuschlagProM2 ? "+ " + fmtEuro(Preis.cent(e.zuschlagProM2)) + "/m²" : "Standard") : (e.zuschlagProElement ? "+ " + fmtEuro(Preis.cent(e.zuschlagProElement)) : "Standard"); } });
    } else if (s === "sprossen") {
      html = '<h2>Sprossen <em>gewünscht?</em></h2>' + cards("sprossen", D.sprossen, { sub: function (e) { return e.zuschlagProElement ? "+ " + fmtEuro(Preis.cent(e.zuschlagProElement)) + " je Element" : "Standard"; }, alt: function (e) { return "Fenster mit " + e.name; } });
    } else if (s === "rollladen") {
      html = '<h2><em>Rollladen</em> dazu?</h2>' + cards("rollladen", D.rollladen, { sub: function (e) { return e.zuschlagProM2 ? "+ " + fmtEuro(Preis.cent(e.zuschlagProM2)) + "/m² Fensterfläche" : "Ohne"; }, alt: function (e) { return "Fenster mit " + e.name; } });
    } else if (s === "seitenteil") {
      html = '<h2>Zusätzliches <em>Seitenteil?</em></h2><p class="lead lead--sm">Festverglaste Seitenteile neben der Tür, satiniert oder klar.</p>' + cards("seitenteil", D.seitenteil, { sub: function (e) { return e.zuschlagProElement ? "+ " + fmtEuro(Preis.cent(e.zuschlagProElement)) : "Ohne"; }, four: true });
    } else if (s === "zusaetze") {
      html = '<h2>Noch <em>Zusätze?</em></h2>' + multiCards("zusaetze", D.zusaetze);
    } else if (s === "angebot") {
      var r2 = calc();
      html = '<h2>Angebot <em>anfordern.</em></h2><p class="lead lead--sm">Wir prüfen Ihre Konfiguration, nehmen das Aufmaß kostenlos vor Ort und schicken Ihnen ein verbindliches Angebot.</p>' +
        '<div class="angebot__grid">' + angebotBildHtml() +
        '<div class="angebot__summary summary"><h3>Ihre Konfiguration</h3><dl>' + summaryRows().map(function (x) { return "<dt>" + esc(x[0]) + "</dt><dd>" + esc(x[1]) + "</dd>"; }).join("") + "</dl>" +
        (r2.ok ? '<p class="price__note price__note--abstand">Richtpreis: <strong>' + fmtEuro(r2.brutto) + "</strong> inkl. " + r2.mwstProzent + " % MwSt. (unverbindlich)</p>" : '<p class="price__note price__note--abstand">Preis auf Anfrage</p>') + "</div></div>";
    }
    html += '<p class="konf__hint">Abbildungen beispielhaft. Alle Preise unverbindliche Richtpreise inkl. 19 % MwSt.; verbindlich wird es mit dem Angebot nach dem Aufmaß.</p>';
    html += '<div class="konf__nav">' + (step > 0 ? '<button type="button" class="btn btn--ghost" data-nav="-1">Zurück</button>' : "<span></span>") + (step < STEPS.length - 1 ? '<button type="button" class="btn btn--primary" data-nav="1">Weiter</button>' : "") + "</div>";
    els.panels.innerHTML = '<section class="konf__panel is-active">' + html + "</section>";
    Array.prototype.forEach.call(els.panels.querySelectorAll(".opt__swatch[data-hex]"), function (sw) { sw.style.background = sw.getAttribute("data-hex"); }); // CSSOM statt Inline-Style (CSP)
    // Telefon: waagerecht scrollbare Kartenreihe – gewählte Karte ins Bild rücken
    Array.prototype.forEach.call(els.panels.querySelectorAll(".opts"), function (o) { if (o.scrollWidth > o.clientWidth + 4) { var sel = o.querySelector(".is-selected"); if (sel) o.scrollLeft = Math.max(0, sel.getBoundingClientRect().left - o.getBoundingClientRect().left + o.scrollLeft - 16); } });
    if (s === "angebot" && els.form) { els.form.hidden = false; } else if (els.form) { els.form.hidden = true; }
    if (s === "masse") { var inp = els.panels.querySelector("input[data-num]"); if (inp && window.matchMedia("(min-width: 900px)").matches) inp.focus(); }
  }
  /* Großes Foto der Konfiguration für den Angebotsschritt (exakt; bei RAL/Sonderfarbe nächstliegendes Foto mit Hinweis) */
  function angebotBildHtml() {
    if (!B) return "";
    var exakt = B.vorschau(produkt, state), name = exakt || B.angebotBild(produkt, state);
    if (!name) return "";
    var et = B.etikett(produkt, state);
    var info = B.info(name) || {}; var groessen = info.groessen || [400, 900]; var gross = groessen[groessen.length - 1];
    var h = info.breite && info.hoehe ? Math.round(gross * info.hoehe / info.breite) : Math.round(gross * 1.34);
    var spiegel = B.angebotSpiegel(produkt, state);
    return '<figure class="angebot__bild"><img' + (spiegel ? ' class="is-spiegel"' : "") + ' src="' + IMG + name + "-" + gross + '.webp" srcset="' + groessen.map(function (g) { return IMG + name + "-" + g + ".webp " + g + "w"; }).join(", ") + '" sizes="(min-width: 900px) 360px, 92vw" width="' + gross + '" height="' + h + '" alt="' + esc(info.alt || "Ihre Konfiguration – Abbildung beispielhaft") + '" decoding="async">' + (et ? '<span class="angebot__etikett">' + esc(et) + "</span>" : "") + '<figcaption>' + esc(state.breiteMm + " × " + state.hoeheMm + " mm" + (state.menge > 1 ? " · " + state.menge + " Elemente" : "")) + (et ? " · Form in Weiß, Farbe nach Wahl · Abbildung beispielhaft" : exakt ? " · Abbildung beispielhaft" : " · Farbe weicht ab · Abbildung beispielhaft") + "</figcaption></figure>";
  }
  function summaryRows() {
    var D = L(); if (!D) return [];
    var rows = [];
    if (produkt === "fenster") {
      rows.push(["Profil", D.systeme[state.system] ? D.systeme[state.system].name : "–"]);
      rows.push(["Typ", D.typen[state.typ] ? D.typen[state.typ].name : "–"]);
    } else {
      rows.push(["Modell", D.modelle[state.modell] ? D.modelle[state.modell].name : "–"]);
    }
    rows.push(["Maße", state.breiteMm + " × " + state.hoeheMm + " mm" + (state.menge > 1 ? " · " + state.menge + " Stück" : "")]);
    rows.push(["Farbe", D.farben[state.farbe] ? D.farben[state.farbe].name : "–"]);
    rows.push(["Glas", D.glas[state.glas] ? D.glas[state.glas].name : "–"]);
    if (produkt === "fenster") {
      rows.push(["Sprossen", D.sprossen[state.sprossen] ? D.sprossen[state.sprossen].name : "–"]);
      rows.push(["Rollladen", D.rollladen[state.rollladen] ? D.rollladen[state.rollladen].name : "–"]);
    } else {
      rows.push(["Seitenteil", D.seitenteil[state.seitenteil] ? D.seitenteil[state.seitenteil].name : "–"]);
    }
    rows.push(["Zusätze", state.zusaetze.length ? state.zusaetze.map(function (z) { return D.zusaetze[z] ? D.zusaetze[z].name : z; }).join(", ") : "keine"]);
    rows.push(["Montage", state.montage ? (state.demontage ? "ja, mit Demontage & Entsorgung" : "ja") : "nein (nur Lieferung)"]);
    return rows;
  }
  var fotoTimer = null;
  /* Foto der aktuellen Kombination einblenden (weiche Überblendung); ohne passendes Foto bleibt die SVG-Zeichnung */
  function zeigeFoto(name) {
    var img = els.foto, box = els.previewBox; if (!img || !box) return;
    if (!name) { img.hidden = true; img.removeAttribute("src"); img.removeAttribute("data-name"); box.classList.remove("hat-foto"); if (els.note) els.note.textContent = "Schematische Darstellung"; return; }
    if (img.getAttribute("data-name") === name) return;
    img.setAttribute("data-name", name);
    var info = B.info(name) || {}; var groessen = (info.groessen || [900]).slice().reverse();
    var versuch = 0;
    var lade = function () {
      var src = IMG + name + "-" + groessen[versuch] + ".webp";
      var pre = new Image();
      pre.onload = function () {
        if (img.getAttribute("data-name") !== name) return;
        var fertig = function () { img.src = src; img.alt = info.alt || "Vorschau Ihrer Konfiguration – Abbildung beispielhaft"; img.hidden = false; box.classList.add("hat-foto"); if (els.note) els.note.textContent = "Abbildung beispielhaft"; requestAnimationFrame(function () { img.classList.remove("is-wechsel"); }); };
        if (img.hidden || !img.getAttribute("src")) fertig();
        else { img.classList.add("is-wechsel"); setTimeout(fertig, 180); } // kurze Überblendung, altes Foto bleibt bis dahin sichtbar
      };
      pre.onerror = function () {
        if (img.getAttribute("data-name") !== name) return;
        if (++versuch < groessen.length) { lade(); return; } // kleinere Datei versuchen
        img.classList.remove("is-wechsel"); // Foto existiert laut Liste, Netz-/Ladefehler: letztes Foto behalten, keine Zeichnung
        if (!img.getAttribute("src")) { img.removeAttribute("data-name"); box.classList.remove("hat-foto"); img.hidden = true; }
      };
      pre.src = src;
    };
    lade();
  }
  /* Nachbarvarianten (eine Änderung in Farbe/Sprossen/Rollladen/Typ bzw. Modell/Farbe) im Hintergrund vorladen */
  function ladeNachbarn() {
    if (!B) return; var D = L(); if (!D) return;
    clearTimeout(fotoTimer);
    fotoTimer = setTimeout(function () {
      var opt = produkt === "fenster" ? { farbe: Object.keys(D.farben), sprossen: Object.keys(D.sprossen), rollladen: Object.keys(D.rollladen), typ: Object.keys(D.typen) } : { farbe: Object.keys(D.farben), modell: Object.keys(D.modelle), seitenteil: Object.keys(D.seitenteil || {}) };
      B.nachbarn(produkt, state, opt).forEach(function (n) { var info = B.info(n) || {}; var g = (info.groessen || [900]).slice(-1)[0]; var i = new Image(); i.src = IMG + n + "-" + g + ".webp"; });
    }, 400);
  }
  function renderAside() {
    if (els.preview) els.preview.innerHTML = produkt === "fenster" ? drawFenster() : drawHaustuer();
    zeigeFoto(B ? B.vorschau(produkt, state) : null);
    if (els.foto) els.foto.classList.toggle("is-spiegel", !!(B && B.vorschauSpiegel(produkt, state)));
    if (els.etikett) { var et = B ? B.etikett(produkt, state) : null; els.etikett.textContent = et || ""; els.etikett.hidden = !et || !(B && B.vorschau(produkt, state)); }
    ladeNachbarn();
    if (els.masse) els.masse.textContent = state.breiteMm + " × " + state.hoeheMm + " mm" + (state.menge > 1 ? " · " + state.menge + " Elemente" : "");
    var r = calc();
    if (els.price) {
      var offen = (function () { var d = els.price.querySelector(".posliste"); return !!(d && d.open); })();
      var letzter = step >= STEPS.length - 1;
      var cta = letzter ? '<a class="btn btn--primary price__cta" href="#angebot-form">Angebot anfordern</a>' : '<button type="button" class="btn btn--primary price__cta" data-step="' + (STEPS.length - 1) + '">Angebot anfordern</button>';
      var zusammen = '<h4>Ihre Konfiguration</h4><dl class="price__zusammen">' + summaryRows().map(function (x) { return "<dt>" + esc(x[0]) + "</dt><dd>" + esc(x[1]) + "</dd>"; }).join("") + "</dl>";
      if (!r.ok) {
        els.price.innerHTML = '<div class="price__kopf"><div><span class="price__lbl">Ihr Preis</span><strong class="price__sum">auf Anfrage</strong></div>' + cta + "</div>" +
          '<p class="price__note">' + (r.fehler[0] === "preisliste" ? "Die Preisliste ist derzeit nicht verfügbar. Wir erstellen Ihnen gern ein individuelles Angebot." : "Bitte prüfen Sie die Maße – außerhalb des konfigurierbaren Bereichs erstellen wir ein individuelles Angebot.") + "</p>" +
          '<details class="posliste"' + (offen ? " open" : "") + "><summary>Einzelpositionen anzeigen</summary>" + zusammen + "</details>";
      } else {
        els.price.innerHTML = '<div class="price__kopf"><div><span class="price__lbl">Ihr Preis</span><strong class="price__sum">' + fmtEuro(r.brutto) + "<small>inkl. " + r.mwstProzent + " % MwSt.</small></strong></div>" + cta + "</div>" +
          '<details class="posliste"' + (offen ? " open" : "") + '><summary>Einzelpositionen anzeigen</summary><div class="price__rows">' +
          "<div><span>Preis ohne Online-Rabatt</span><span>" + fmtEuro(r.ohneRabattBrutto) + "</span></div>" +
          "<div><span>Online-Rabatt −" + r.rabattProzent + " %</span><span>− " + fmtEuro(r.ersparnisBrutto) + "</span></div>" +
          (r.montage ? "<div><span>darin Montage" + (state.demontage ? " &amp; Entsorgung" : "") + "</span><span>" + fmtEuro(r.montage + Preis.rund(r.montage * r.mwstProzent / 100)) + "</span></div>" : "") +
          "</div><h4>Einzelpositionen</h4><table><tbody>" + r.positionen.map(function (p) { return "<tr><td>" + esc(p.name) + (p.detail ? " <small>(" + esc(p.detail) + ")</small>" : "") + "</td><td>" + fmtEuro(p.betrag) + "</td></tr>"; }).join("") +
          (state.menge > 1 ? "<tr><td>× " + state.menge + " Elemente</td><td>" + fmtEuro(r.produkt) + "</td></tr>" : "") +
          "<tr><td>Online-Rabatt " + r.rabattProzent + " %</td><td>− " + fmtEuro(r.rabatt) + "</td></tr>" + (r.montage ? "<tr><td>Montage" + (state.demontage ? " + Demontage/Entsorgung" : "") + "</td><td>" + fmtEuro(r.montage) + "</td></tr>" : "") +
          "<tr><td>Netto</td><td>" + fmtEuro(r.netto) + "</td></tr><tr><td>MwSt. " + r.mwstProzent + " %</td><td>" + fmtEuro(r.mwst) + "</td></tr></tbody></table>" + zusammen +
          '<p class="price__note">Unverbindlicher Richtpreis' + (state.menge > 1 ? " für " + state.menge + " Elemente" : "") + " · Preisliste " + esc(r.version) + "</p></details>";
      }
    }
    if (els.summary) els.summary.innerHTML = summaryRows().map(function (x) { return "<dt>" + esc(x[0]) + "</dt><dd>" + esc(x[1]) + "</dd>"; }).join("");
  }
  function renderBar() {
    if (!els.bar) return;
    var r = calc();
    els.bar.innerHTML = "<div><div class=\"lbl\">Ihr Preis</div><div class=\"sum\">" + (r.ok ? fmtEuro(r.brutto) : "auf Anfrage") + "</div><div class=\"sub\">" + (r.ok ? "inkl. MwSt. · Richtpreis" : "Maße prüfen") + "</div></div>" +
      (step < STEPS.length - 1 ? "<button type=\"button\" class=\"btn btn--primary\" data-nav=\"1\">Weiter</button>" : "<a class=\"btn btn--primary\" href=\"#angebot-form\">Angebot anfordern</a>");
  }
  function updateForm() {
    if (!els.form) return;
    var r = calc();
    var set = function (n, v) { var el = els.form.querySelector("input[name='" + n + "']"); if (el) el.value = v; };
    set("konfiguration", JSON.stringify(state));
    set("preis_brutto_browser", r.ok ? String(r.brutto) : "");
    set("preisliste_version", liste ? String(liste.version || "") : "");
    set("zusammenfassung", summaryRows().map(function (x) { return x[0] + ": " + x[1]; }).join(" | ") + (r.ok ? " | Richtpreis " + fmtEuro(r.brutto) : " | Preis auf Anfrage"));
  }

  /* ---------- Zeichnungen (SVG) ---------- */
  function farbeHex() { var D = L(); return (D && D.farben[state.farbe] && D.farben[state.farbe].hex) || "#f4f4f2"; }
  function drawFenster() {
    var W = 320, H = 300, b = state.breiteMm || 1000, h = state.hoeheMm || 1000;
    var ratio = b / h, bw, bh;
    var hasRl = state.rollladen && state.rollladen !== "keiner";
    var maxW = 260, maxH = hasRl ? 200 : 240;
    if (ratio > maxW / maxH) { bw = maxW; bh = maxW / ratio; } else { bh = maxH; bw = maxH * ratio; }
    var x = (W - bw) / 2, y = (H - bh) / 2 + (hasRl ? 18 : 0);
    var col = farbeHex(), dark = col === "#f4f4f2" ? "#cfcfcb" : "#1f2327";
    var frame = 10 * Math.min(1, bw / 160), sash = 9 * Math.min(1, bw / 160);
    var s = "";
    if (hasRl) s += "<rect x=\"" + (x - 8) + "\" y=\"" + (y - 40) + "\" width=\"" + (bw + 16) + "\" height=\"34\" rx=\"3\" fill=\"#c9c6bf\" stroke=\"#8e8b84\"/>" + Array.from({ length: 4 }, function (_, i) { return "<line x1=\"" + (x - 6) + "\" y1=\"" + (y - 34 + i * 8) + "\" x2=\"" + (x + bw + 6) + "\" y2=\"" + (y - 34 + i * 8) + "\" stroke=\"#a9a69f\"/>"; }).join("");
    s += "<rect x=\"" + x + "\" y=\"" + y + "\" width=\"" + bw + "\" height=\"" + bh + "\" fill=\"" + col + "\" stroke=\"" + dark + "\" stroke-width=\"1.5\"/>";
    var ix = x + frame, iy = y + frame, iw = bw - 2 * frame, ih = bh - 2 * frame;
    var sashes = state.typ === "2-fluegelig" ? 2 : 1;
    var fixed = state.typ === "festverglasung";
    for (var i = 0; i < sashes; i++) {
      var sx = ix + (iw / sashes) * i, sw = iw / sashes;
      if (!fixed) s += "<rect x=\"" + sx + "\" y=\"" + iy + "\" width=\"" + sw + "\" height=\"" + ih + "\" fill=\"" + col + "\" stroke=\"" + dark + "\" stroke-width=\"1\"/>";
      var gx = sx + (fixed ? 0 : sash), gy = iy + (fixed ? 0 : sash), gw = sw - (fixed ? 0 : 2 * sash), gh = ih - (fixed ? 0 : 2 * sash);
      s += "<rect x=\"" + gx + "\" y=\"" + gy + "\" width=\"" + gw + "\" height=\"" + gh + "\" fill=\"url(#glas)\"/>";
      if (state.sprossen && state.sprossen !== "keine") {
        var cols = 2, rows = state.hoeheMm > state.breiteMm ? 3 : 2, t = state.sprossen === "wiener" ? 3 : 1.5;
        for (var c = 1; c < cols; c++) s += "<line x1=\"" + (gx + gw * c / cols) + "\" y1=\"" + gy + "\" x2=\"" + (gx + gw * c / cols) + "\" y2=\"" + (gy + gh) + "\" stroke=\"" + col + "\" stroke-width=\"" + t + "\"/>";
        for (var rr = 1; rr < rows; rr++) s += "<line x1=\"" + gx + "\" y1=\"" + (gy + gh * rr / rows) + "\" x2=\"" + (gx + gw) + "\" y2=\"" + (gy + gh * rr / rows) + "\" stroke=\"" + col + "\" stroke-width=\"" + t + "\"/>";
      }
      if (!fixed) { var hx = sashes === 2 ? (i === 0 ? sx + sw - 4 : sx + 4) : sx + sw - 5; s += "<rect x=\"" + (hx - 2) + "\" y=\"" + (iy + ih / 2 - 12) + "\" width=\"4\" height=\"24\" rx=\"2\" fill=\"#0B5ED7\" stroke=\"#083f91\" stroke-width=\".6\"/>"; }
      if (state.typ === "balkontuer") { bh = bh; }
    }
    s += "<rect x=\"" + (x - 10) + "\" y=\"" + (y + bh) + "\" width=\"" + (bw + 20) + "\" height=\"8\" fill=\"#e8e6e0\" stroke=\"#b5b2aa\"/>";
    s += "<text x=\"" + (x + bw / 2) + "\" y=\"" + (y + bh + 26) + "\" text-anchor=\"middle\" font-size=\"11\" fill=\"#5a5750\">" + state.breiteMm + " mm</text>";
    s += "<text x=\"" + (x - 14) + "\" y=\"" + (y + bh / 2) + "\" text-anchor=\"middle\" font-size=\"11\" fill=\"#5a5750\" transform=\"rotate(-90 " + (x - 14) + " " + (y + bh / 2) + ")\">" + state.hoeheMm + " mm</text>";
    return "<defs><linearGradient id=\"glas\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#cfe3ee\"/><stop offset=\".5\" stop-color=\"#a9c6d6\"/><stop offset=\"1\" stop-color=\"#86a9bd\"/></linearGradient></defs>" + s;
  }
  function drawHaustuer() {
    var W = 320, H = 300, b = state.breiteMm || 1100, h = state.hoeheMm || 2100;
    var col = farbeHex(), dark = col === "#f4f4f2" ? "#cfcfcb" : "#1f2327";
    var st = state.seitenteil || "keines", model = state.modell;
    var hasPanelModel = model === "mit-seitenteil";
    var left = st === "links" || st === "beidseitig", right = st === "rechts" || st === "beidseitig" || hasPanelModel;
    var ober = state.zusaetze.indexOf("oberlicht") >= 0;
    var totalB = b + (left ? 400 : 0) + (right ? 400 : 0), totalH = h + (ober ? 350 : 0);
    var scale = Math.min(240 / totalB, 250 / totalH);
    var tw = totalB * scale, th = totalH * scale, x0 = (W - tw) / 2, y0 = (H - th) / 2 + 6;
    var s = "<rect x=\"" + (x0 - 6) + "\" y=\"" + (y0 - 6) + "\" width=\"" + (tw + 12) + "\" height=\"" + (th + 6) + "\" fill=\"#31363c\"/>";
    var cy = y0 + (ober ? 350 * scale : 0);
    if (ober) s += "<rect x=\"" + x0 + "\" y=\"" + y0 + "\" width=\"" + tw + "\" height=\"" + (350 * scale - 4) + "\" fill=\"url(#satin)\"/>";
    var cx = x0;
    if (left) { s += "<rect x=\"" + cx + "\" y=\"" + cy + "\" width=\"" + (400 * scale - 4) + "\" height=\"" + (h * scale) + "\" fill=\"url(#satin)\"/>"; cx += 400 * scale; }
    var dw = b * scale, dh = h * scale;
    s += "<rect x=\"" + cx + "\" y=\"" + cy + "\" width=\"" + dw + "\" height=\"" + dh + "\" fill=\"" + col + "\" stroke=\"" + dark + "\"/>";
    if (model === "modern-glasstreifen") s += "<rect x=\"" + (cx + dw * .14) + "\" y=\"" + (cy + dh * .08) + "\" width=\"" + (dw * .1) + "\" height=\"" + (dh * .84) + "\" fill=\"url(#satin)\" stroke=\"" + dark + "\" stroke-width=\".8\"/>";
    if (model === "klassisch-golden-oak") { s += "<rect x=\"" + (cx + dw * .2) + "\" y=\"" + (cy + dh * .12) + "\" width=\"" + (dw * .6) + "\" height=\"" + (dh * .22) + "\" fill=\"url(#satin)\" stroke=\"" + dark + "\"/>"; s += "<rect x=\"" + (cx + dw * .2) + "\" y=\"" + (cy + dh * .42) + "\" width=\"" + (dw * .6) + "\" height=\"" + (dh * .18) + "\" fill=\"none\" stroke=\"" + dark + "\"/><rect x=\"" + (cx + dw * .2) + "\" y=\"" + (cy + dh * .66) + "\" width=\"" + (dw * .6) + "\" height=\"" + (dh * .22) + "\" fill=\"none\" stroke=\"" + dark + "\"/>"; }
    if (model === "mit-seitenteil" || model === "modern-voll") { for (var i = 0; i < 3; i++) s += (model === "mit-seitenteil" ? "" : ""); }
    var gx = cx + dw * .8;
    s += "<rect x=\"" + (gx - 2) + "\" y=\"" + (cy + dh * .25) + "\" width=\"4\" height=\"" + (dh * .5) + "\" rx=\"2\" fill=\"#0B5ED7\" stroke=\"#083f91\" stroke-width=\".6\"/>";
    cx += dw;
    if (right) s += "<rect x=\"" + (cx + 4) + "\" y=\"" + cy + "\" width=\"" + (400 * scale - 4) + "\" height=\"" + dh + "\" fill=\"url(#satin)\"/>";
    s += "<rect x=\"" + (x0 - 10) + "\" y=\"" + (y0 + th) + "\" width=\"" + (tw + 20) + "\" height=\"6\" fill=\"#c6cacf\"/>";
    s += "<text x=\"" + (x0 + tw / 2) + "\" y=\"" + (y0 + th + 22) + "\" text-anchor=\"middle\" font-size=\"11\" fill=\"#5a5750\">Türblatt " + state.breiteMm + " × " + state.hoeheMm + " mm</text>";
    return "<defs><linearGradient id=\"satin\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#eef3f6\"/><stop offset=\"1\" stop-color=\"#c9d6de\"/></linearGradient></defs>" + s;
  }

  /* ---------- Ereignisse ---------- */
  root.addEventListener("click", function (e) {
    var lb = e.target.closest("img[data-lightbox]"); if (lb) { e.preventDefault(); lightbox(lb.getAttribute("data-lightbox")); return; }
    var sb = e.target.closest("[data-step]"); if (sb) { step = +sb.getAttribute("data-step"); render(); scrollTop(); return; }
    var nb = e.target.closest("[data-nav]"); if (nb) { step = Math.max(0, Math.min(STEPS.length - 1, step + (+nb.getAttribute("data-nav")))); render(); scrollTop(); }
  });
  document.addEventListener("click", function (e) { var nb = e.target.closest(".konf__bar [data-nav]"); if (nb) { step = Math.min(STEPS.length - 1, step + 1); render(); scrollTop(); } });
  root.addEventListener("change", function (e) {
    var t = e.target;
    var opts = t.closest(".opts");
    if (opts && t.type === "radio") { state[opts.getAttribute("data-key")] = t.value; render(); return; }
    var multi = t.closest("[data-multi]");
    if (multi && t.type === "checkbox") { var k = multi.getAttribute("data-multi"); var arr = state[k].filter(function (v) { return v !== t.value; }); if (t.checked) arr.push(t.value); state[k] = arr; render(); return; }
    if (t.hasAttribute("data-bool")) { state[t.getAttribute("data-bool")] = t.checked; if (!state.montage) state.demontage = false; render(); return; }
  });
  root.addEventListener("input", function (e) {
    var t = e.target; if (!t.hasAttribute("data-num")) return;
    var v = parseInt(t.value, 10); if (!isFinite(v)) return;
    state[t.getAttribute("data-num")] = v;
    renderAside(); renderBar(); writeHash(); updateForm();
    var row = t.closest(".form__row"); var r = calc(); var key = t.getAttribute("data-num");
    var bad = !r.ok && r.fehler.some(function (x) { return x.indexOf(key.replace("Mm", "").replace("menge", "menge")) === 0; });
    if (row) row.classList.toggle("is-invalid", bad);
  });
  function scrollTop() { var top = root.getBoundingClientRect().top + window.scrollY - 80; if (window.scrollY > top) window.scrollTo({ top: top, behavior: "smooth" }); }
})();
