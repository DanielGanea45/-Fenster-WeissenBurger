/* Preisrechner für den Konfigurator – EIN Modul für Browser (window.FWPreis), Netlify Function
   und Tests (require). Keine Preise im Code: alles kommt aus data/preise.json.

   Rechenregeln (verbindlich, siehe README):
   - Alle Beträge intern in ganzen Cent. Euro-Werte der Preisliste werden beim Laden in Cent gewandelt
     (max. 2 Nachkommastellen).
   - Kaufmännische Rundung (0,5 Cent → aufrunden) nach JEDEM Schritt, feste Reihenfolge:
       1. Basis        = Fläche (mind. Mindestfläche) × €/m²          [Fenster]   bzw. Grundpreis (+ Übergröße %) [Haustür]
       2. Zuschläge    = jeweils einzeln gerundet: Typ % und Farbe % auf die Basis, Glas €/m², Sprossen €,
                         Rollladen €/m², Zusätze (pro Element oder pro lfm Breite), Seitenteil €
       3. Elementpreis = Basis + Zuschläge;  Produkt = Elementpreis × Menge
       4. Online-Rabatt = Produkt × Rabatt %   (nur auf das Produkt, nicht auf Montage)
       5. Montage      = (Montage + ggf. Demontage/Entsorgung) × Menge
       6. Summe        = Produkt − Rabatt + Montage
       7. Steuer       = Summe × Steuersatz;  Endpreis = Summe + Steuer
          (Steuersatz 0 oder 19 aus data/einstellungen.json, Texte dazu nur in js/steuer.js)
     „Preis ohne Online-Rabatt“ = (Produkt + Montage) mit Steuer, gleich gerundet.
   - Ist die Preisliste ungültig (Schema) oder die Konfiguration außerhalb der Grenzen, gibt es keinen Preis
     (ok: false, fehler[]), die Seite zeigt dann „Preis auf Anfrage“. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.FWPreis = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function rund(x) { return Math.round(x + 1e-9); } // kaufmännisch, Schutz vor 2707.4999999
  function cent(euro) { return rund(euro * 100); }
  function istZahl(x) { return typeof x === "number" && isFinite(x); }
  function istBetrag(x) { return istZahl(x) && x >= 0 && Math.abs(x * 100 - Math.round(x * 100)) < 1e-6 && x <= 1000000; }
  function istProzent(x) { return istZahl(x) && x >= -100 && x <= 100; }

  /* ---------- Schema-Prüfung der Preisliste ---------- */
  function validiereListe(p) {
    var f = [];
    function need(cond, msg) { if (!cond) f.push(msg); }
    need(p && typeof p === "object", "Preisliste fehlt");
    if (!p || typeof p !== "object") return { ok: false, fehler: f };
    need(typeof p.version === "string" && p.version.length > 0, "version fehlt");
    need(istProzent(p.onlineRabattProzent) && p.onlineRabattProzent >= 0 && p.onlineRabattProzent <= 50, "onlineRabattProzent ungültig");
    function mapOk(obj, name, check) {
      need(obj && typeof obj === "object" && Object.keys(obj).length > 0, name + " fehlt oder leer");
      if (!obj || typeof obj !== "object") return;
      Object.keys(obj).forEach(function (k) {
        var e = obj[k];
        need(e && typeof e === "object" && typeof e.name === "string" && e.name, name + "." + k + ": name fehlt");
        if (e && typeof e === "object") check(e, name + "." + k);
      });
    }
    function grenzen(g, name, keys) {
      need(g && typeof g === "object", name + " fehlt");
      if (!g) return;
      keys.forEach(function (k) { need(istZahl(g[k]) && g[k] > 0, name + "." + k + " ungültig"); });
      if (istZahl(g.breiteMinMm) && istZahl(g.breiteMaxMm)) need(g.breiteMinMm < g.breiteMaxMm, name + ": breiteMin >= breiteMax");
      if (istZahl(g.hoeheMinMm) && istZahl(g.hoeheMaxMm)) need(g.hoeheMinMm < g.hoeheMaxMm, name + ": hoeheMin >= hoeheMax");
    }
    var fe = p.fenster, ht = p.haustuer;
    need(fe && typeof fe === "object", "fenster fehlt");
    if (fe) {
      grenzen(fe.grenzen, "fenster.grenzen", ["breiteMinMm", "breiteMaxMm", "hoeheMinMm", "hoeheMaxMm", "mindestflaecheM2", "mengeMax"]);
      mapOk(fe.systeme, "fenster.systeme", function (e, n) {
        need(istBetrag(e.preisProM2) && e.preisProM2 > 0, n + ".preisProM2 ungültig");
        need(istZahl(e.uf) && e.uf > 0 && e.uf < 5, n + ".uf ungültig");
        need(istZahl(e.bautiefeMm) && e.bautiefeMm > 0, n + ".bautiefeMm ungültig");
        if (e.breiteMaxMm !== undefined) need(istZahl(e.breiteMaxMm) && e.breiteMaxMm > 0, n + ".breiteMaxMm ungültig");
        if (e.hoeheMaxMm !== undefined) need(istZahl(e.hoeheMaxMm) && e.hoeheMaxMm > 0, n + ".hoeheMaxMm ungültig");
      });
      mapOk(fe.typen, "fenster.typen", function (e, n) { need(istProzent(e.zuschlagProzent) && e.zuschlagProzent > -100, n + ".zuschlagProzent ungültig"); });
      mapOk(fe.farben, "fenster.farben", function (e, n) { need(istProzent(e.zuschlagProzent) && e.zuschlagProzent >= 0, n + ".zuschlagProzent ungültig"); });
      mapOk(fe.glas, "fenster.glas", function (e, n) { need(istBetrag(e.zuschlagProM2), n + ".zuschlagProM2 ungültig"); });
      mapOk(fe.sprossen, "fenster.sprossen", function (e, n) { need(istBetrag(e.zuschlagProElement), n + ".zuschlagProElement ungültig"); });
      mapOk(fe.rollladen, "fenster.rollladen", function (e, n) { need(istBetrag(e.zuschlagProM2), n + ".zuschlagProM2 ungültig"); });
      mapOk(fe.zusaetze, "fenster.zusaetze", function (e, n) { need((e.art === "proElement" || e.art === "proLfm") && istBetrag(e.zuschlag), n + " ungültig"); });
      need(fe.montage && istBetrag(fe.montage.montageProElement) && istBetrag(fe.montage.demontageEntsorgungProElement), "fenster.montage ungültig");
    }
    need(ht && typeof ht === "object", "haustuer fehlt");
    if (ht) {
      grenzen(ht.grenzen, "haustuer.grenzen", ["breiteMinMm", "breiteMaxMm", "hoeheMinMm", "hoeheMaxMm", "mengeMax", "standardBreiteMaxMm", "standardHoeheMaxMm"]);
      if (ht.grenzen) need(istProzent(ht.grenzen.uebergroesseProzent) && ht.grenzen.uebergroesseProzent >= 0, "haustuer.grenzen.uebergroesseProzent ungültig");
      mapOk(ht.modelle, "haustuer.modelle", function (e, n) { need(istBetrag(e.grundpreis) && e.grundpreis > 0, n + ".grundpreis ungültig"); });
      mapOk(ht.farben, "haustuer.farben", function (e, n) { need(istProzent(e.zuschlagProzent) && e.zuschlagProzent >= 0, n + ".zuschlagProzent ungültig"); });
      mapOk(ht.glas, "haustuer.glas", function (e, n) { need(istBetrag(e.zuschlagProElement), n + ".zuschlagProElement ungültig"); });
      mapOk(ht.seitenteil, "haustuer.seitenteil", function (e, n) { need(istBetrag(e.zuschlagProElement), n + ".zuschlagProElement ungültig"); });
      mapOk(ht.zusaetze, "haustuer.zusaetze", function (e, n) { need(e.art === "proElement" && istBetrag(e.zuschlag), n + " ungültig"); });
      need(ht.montage && istBetrag(ht.montage.montageProElement) && istBetrag(ht.montage.demontageEntsorgungProElement), "haustuer.montage ungültig");
    }
    return { ok: f.length === 0, fehler: f };
  }

  /* ---------- Hilfen ---------- */
  function ganzzahl(x) { return typeof x === "number" && isFinite(x) && Math.floor(x) === x; }
  function pos(name, betrag, detail) { return { name: name, betrag: betrag, detail: detail || "" }; }

  function abschluss(p, positionen, elementCent, menge, montageProElement, demontageProElement, cfg, satz) {
    var produkt = elementCent * menge;
    var rabatt = rund(produkt * p.onlineRabattProzent / 100);
    var montage = 0;
    if (cfg.montage !== false) {
      montage += montageProElement * menge;
      if (cfg.demontage) montage += demontageProElement * menge;
    }
    var summe = produkt - rabatt + montage;
    var steuer = rund(summe * satz / 100);
    var endpreis = summe + steuer;
    var ohneRabattSumme = produkt + montage;
    var ohneRabatt = ohneRabattSumme + rund(ohneRabattSumme * satz / 100);
    return {
      ok: true,
      version: p.version,
      waehrung: p.waehrung || "EUR",
      positionen: positionen,
      element: elementCent,
      menge: menge,
      produkt: produkt,
      rabattProzent: p.onlineRabattProzent,
      rabatt: rabatt,
      montage: montage,
      summe: summe,
      steuerProzent: satz,
      steuer: steuer,
      endpreis: endpreis,
      ohneRabatt: ohneRabatt,
      ersparnis: ohneRabatt - endpreis,
    };
  }

  /* ---------- Fenster ---------- */
  function berechneFenster(cfg, p, satz) {
    var v = validiereListe(p);
    if (!v.ok) return { ok: false, fehler: ["preisliste"].concat(v.fehler) };
    var F = p.fenster, f = [];
    var sys = F.systeme[cfg.system];
    if (!sys) f.push("system");
    var typ = F.typen[cfg.typ]; if (!typ) f.push("typ");
    var farbe = F.farben[cfg.farbe]; if (!farbe) f.push("farbe");
    var glas = F.glas[cfg.glas]; if (!glas) f.push("glas");
    var spr = F.sprossen[cfg.sprossen || "keine"]; if (!spr) f.push("sprossen");
    var rl = F.rollladen[cfg.rollladen || "keiner"]; if (!rl) f.push("rollladen");
    var b = cfg.breiteMm, h = cfg.hoeheMm, menge = cfg.menge === undefined ? 1 : cfg.menge;
    var g = F.grenzen;
    if (!ganzzahl(b) || b < g.breiteMinMm) f.push("breiteMin");
    if (!ganzzahl(h) || h < g.hoeheMinMm) f.push("hoeheMin");
    /* System-Grenzen (z. B. Cortizo 1600 × 2600) überschreiben die allgemeinen Fenster-Grenzen. */
    var bMax = sys && sys.breiteMaxMm ? sys.breiteMaxMm : g.breiteMaxMm;
    var hMax = sys && sys.hoeheMaxMm ? sys.hoeheMaxMm : g.hoeheMaxMm;
    if (ganzzahl(b) && b > bMax) f.push("breiteMax");
    if (ganzzahl(h) && h > hMax) f.push("hoeheMax");
    if (!ganzzahl(menge) || menge < 1) f.push("mengeMin");
    if (ganzzahl(menge) && menge > g.mengeMax) f.push("mengeMax");
    var zus = Array.isArray(cfg.zusaetze) ? cfg.zusaetze : [];
    zus.forEach(function (z) { if (!F.zusaetze[z]) f.push("zusatz:" + z); });
    if (f.length) return { ok: false, fehler: f, grenzen: { breiteMaxMm: bMax, hoeheMaxMm: hMax } };

    var flaecheMm2 = Math.max(b * h, rund(g.mindestflaecheM2 * 1e6));
    var basis = rund(flaecheMm2 * cent(sys.preisProM2) / 1e6);
    var P = [pos(sys.name + " – " + (flaecheMm2 / 1e6).toFixed(2).replace(".", ",") + " m²" + (b * h < flaecheMm2 ? " (Mindestfläche)" : ""), basis)];
    var summe = basis;
    function add(name, betrag, detail) { if (betrag !== 0) { P.push(pos(name, betrag, detail)); summe += betrag; } }
    add(typ.name, rund(basis * typ.zuschlagProzent / 100), typ.zuschlagProzent + " %");
    add("Farbe: " + farbe.name, rund(basis * farbe.zuschlagProzent / 100), farbe.zuschlagProzent + " %");
    add("Glas: " + glas.name, rund(flaecheMm2 * cent(glas.zuschlagProM2) / 1e6));
    add("Sprossen: " + spr.name, cent(spr.zuschlagProElement));
    add("Rollladen: " + rl.name, rund(flaecheMm2 * cent(rl.zuschlagProM2) / 1e6));
    zus.forEach(function (z) {
      var e = F.zusaetze[z];
      if (e.nurMitRollladen && (cfg.rollladen || "keiner") === "keiner") return; // ohne Rollladen kein Motor
      if (e.art === "proLfm") add(e.name, rund(b * cent(e.zuschlag) / 1000), (b / 1000).toFixed(2).replace(".", ",") + " lfm");
      else add(e.name, cent(e.zuschlag));
    });
    return abschluss(p, P, summe, menge, cent(F.montage.montageProElement), cent(F.montage.demontageEntsorgungProElement), cfg, steuersatz(satz));
  }

  /* ---------- Haustür ---------- */
  function berechneHaustuer(cfg, p, satz) {
    var v = validiereListe(p);
    if (!v.ok) return { ok: false, fehler: ["preisliste"].concat(v.fehler) };
    var H = p.haustuer, f = [];
    var mod = H.modelle[cfg.modell]; if (!mod) f.push("modell");
    var farbe = H.farben[cfg.farbe]; if (!farbe) f.push("farbe");
    var glas = H.glas[cfg.glas || "standard"]; if (!glas) f.push("glas");
    var st = H.seitenteil[cfg.seitenteil || "keines"]; if (!st) f.push("seitenteil");
    var b = cfg.breiteMm, h = cfg.hoeheMm, menge = cfg.menge === undefined ? 1 : cfg.menge;
    var g = H.grenzen;
    if (!ganzzahl(b) || b < g.breiteMinMm) f.push("breiteMin");
    if (ganzzahl(b) && b > g.breiteMaxMm) f.push("breiteMax");
    if (!ganzzahl(h) || h < g.hoeheMinMm) f.push("hoeheMin");
    if (ganzzahl(h) && h > g.hoeheMaxMm) f.push("hoeheMax");
    if (!ganzzahl(menge) || menge < 1) f.push("mengeMin");
    if (ganzzahl(menge) && menge > g.mengeMax) f.push("mengeMax");
    var zus = Array.isArray(cfg.zusaetze) ? cfg.zusaetze : [];
    zus.forEach(function (z) { if (!H.zusaetze[z]) f.push("zusatz:" + z); });
    if (f.length) return { ok: false, fehler: f, grenzen: { breiteMaxMm: g.breiteMaxMm, hoeheMaxMm: g.hoeheMaxMm } };

    var basis = cent(mod.grundpreis);
    var P = [pos(mod.name + " – " + b + " × " + h + " mm", basis)];
    var summe = basis;
    function add(name, betrag, detail) { if (betrag !== 0) { P.push(pos(name, betrag, detail)); summe += betrag; } }
    if (b > g.standardBreiteMaxMm || h > g.standardHoeheMaxMm) add("Übergröße", rund(basis * g.uebergroesseProzent / 100), g.uebergroesseProzent + " %");
    add("Farbe: " + farbe.name, rund(basis * farbe.zuschlagProzent / 100), farbe.zuschlagProzent + " %");
    add("Glas: " + glas.name, cent(glas.zuschlagProElement));
    add(st.name, cent(st.zuschlagProElement));
    zus.forEach(function (z) { add(H.zusaetze[z].name, cent(H.zusaetze[z].zuschlag)); });
    return abschluss(p, P, summe, menge, cent(H.montage.montageProElement), cent(H.montage.demontageEntsorgungProElement), cfg, steuersatz(satz));
  }

  /* Steuersatz in % (0 = Kleinunternehmer § 19 UStG, Standard). Kommt aus den Einstellungen (js/steuer.js), nie aus der Preisliste. */
  function steuersatz(s) { return istZahl(s) && s >= 0 && s <= 100 ? s : 0; }
  function berechne(cfg, p, satz) {
    if (!cfg || typeof cfg !== "object") return { ok: false, fehler: ["konfiguration"] };
    if (cfg.produkt === "haustuer") return berechneHaustuer(cfg, p, satz);
    if (cfg.produkt === "fenster") return berechneFenster(cfg, p, satz);
    return { ok: false, fehler: ["produkt"] };
  }

  function euro(c) {
    var neg = c < 0; c = Math.abs(c);
    var e = Math.floor(c / 100), r = c % 100;
    return (neg ? "-" : "") + e.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + (r < 10 ? "0" : "") + r + " €";
  }

  return { berechne: berechne, berechneFenster: berechneFenster, berechneHaustuer: berechneHaustuer, validiereListe: validiereListe, euro: euro, rund: rund, cent: cent };
});
