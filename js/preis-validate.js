/* Feldgenaue Prüfung der Preisliste und Einstellungen – EIN Modul für Browser (Admin) und Server
   (Netlify Functions, Build). Liefert je Fehler { feld, meldung } mit deutschem Text.
   Baut auf FWPreis.validiereListe() auf (harte Schema-Prüfung des Rechners). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./preis.js"), require("./steuer.js"));
  else root.FWPreisValidate = factory(root.FWPreis, root.FWSteuer);
})(typeof self !== "undefined" ? self : this, function (Preis, Steuer) {
  "use strict";
  var num = function (x) { return typeof x === "number" && isFinite(x); };
  var geld = function (x) { return num(x) && x >= 0 && Math.abs(x * 100 - Math.round(x * 100)) < 1e-6; };
  var STATUS = ["aus", "vorschau", "online"];

  function validierePreise(p) {
    var f = [];
    var add = function (feld, meldung) { f.push({ feld: feld, meldung: meldung }); };
    if (!p || typeof p !== "object") { add("", "Preisliste fehlt."); return f; }
    if (!p.version || typeof p.version !== "string" || !p.version.trim()) add("version", "Bitte eine Versionsbezeichnung angeben (z. B. 2026-11-01).");
    if (!num(p.onlineRabattProzent) || p.onlineRabattProzent < 0 || p.onlineRabattProzent > 50) add("onlineRabattProzent", "Online-Rabatt muss zwischen 0 und 50 % liegen.");
    if (p.anfahrt) {
      if (!(num(p.anfahrt.freiBisKm) && p.anfahrt.freiBisKm >= 0 && p.anfahrt.freiBisKm <= 1000)) add("anfahrt.freiBisKm", "Anfahrt frei bis: 0 bis 1.000 km.");
      if (!(geld(p.anfahrt.proKm) && p.anfahrt.proKm <= 20)) add("anfahrt.proKm", "Preis je km: 0 bis 20 €.");
    }
    var F = p.fenster || {}, H = p.haustuer || {};
    var g = F.grenzen || {};
    if (!(num(g.breiteMinMm) && g.breiteMinMm >= 200)) add("fenster.grenzen.breiteMinMm", "Mindestbreite: Zahl ab 200 mm.");
    if (!(num(g.breiteMaxMm) && g.breiteMaxMm > (g.breiteMinMm || 0))) add("fenster.grenzen.breiteMaxMm", "Maximalbreite muss größer als die Mindestbreite sein.");
    if (!(num(g.hoeheMinMm) && g.hoeheMinMm >= 200)) add("fenster.grenzen.hoeheMinMm", "Mindesthöhe: Zahl ab 200 mm.");
    if (!(num(g.hoeheMaxMm) && g.hoeheMaxMm > (g.hoeheMinMm || 0))) add("fenster.grenzen.hoeheMaxMm", "Maximalhöhe muss größer als die Mindesthöhe sein.");
    if (!(num(g.mindestflaecheM2) && g.mindestflaecheM2 > 0 && g.mindestflaecheM2 <= 3)) add("fenster.grenzen.mindestflaecheM2", "Mindestfläche: zwischen 0,1 und 3 m².");
    if (!(num(g.mengeMax) && g.mengeMax >= 1 && g.mengeMax <= 500)) add("fenster.grenzen.mengeMax", "Maximale Menge: 1 bis 500.");
    var sys = F.systeme || {};
    if (!Object.keys(sys).length) add("fenster.systeme", "Mindestens ein Profilsystem.");
    Object.keys(sys).forEach(function (k) {
      var s = sys[k];
      if (!s.name || !String(s.name).trim()) add("fenster.systeme." + k + ".name", "Name fehlt.");
      if (!(geld(s.preisProM2) && s.preisProM2 > 0 && s.preisProM2 <= 5000)) add("fenster.systeme." + k + ".preisProM2", "Preis €/m²: positive Zahl bis 5.000, max. 2 Nachkommastellen.");
      if (!(num(s.uf) && s.uf > 0 && s.uf < 5)) add("fenster.systeme." + k + ".uf", "Uf-Wert zwischen 0 und 5.");
      if (s.breiteMaxMm !== undefined && !(num(s.breiteMaxMm) && s.breiteMaxMm > (g.breiteMinMm || 0))) add("fenster.systeme." + k + ".breiteMaxMm", "Breite max. muss größer als die Mindestbreite sein.");
      if (s.hoeheMaxMm !== undefined && !(num(s.hoeheMaxMm) && s.hoeheMaxMm > (g.hoeheMinMm || 0))) add("fenster.systeme." + k + ".hoeheMaxMm", "Höhe max. muss größer als die Mindesthöhe sein.");
    });
    var each = function (obj, pfad, fn) { Object.keys(obj || {}).forEach(function (k) { var e = obj[k]; if (!e.name || !String(e.name).trim()) add(pfad + "." + k + ".name", "Name fehlt."); fn(e, pfad + "." + k); }); };
    each(F.typen, "fenster.typen", function (e, n) { if (!(num(e.zuschlagProzent) && e.zuschlagProzent > -100 && e.zuschlagProzent <= 100)) add(n + ".zuschlagProzent", "Zuschlag in % zwischen −99 und 100."); });
    each(F.farben, "fenster.farben", function (e, n) { if (!(num(e.zuschlagProzent) && e.zuschlagProzent >= 0 && e.zuschlagProzent <= 100)) add(n + ".zuschlagProzent", "Farbzuschlag in % zwischen 0 und 100."); });
    each(F.glas, "fenster.glas", function (e, n) { if (!(geld(e.zuschlagProM2) && e.zuschlagProM2 <= 1000)) add(n + ".zuschlagProM2", "Glas-Zuschlag €/m²: 0 bis 1.000."); });
    each(F.sprossen, "fenster.sprossen", function (e, n) { if (!(geld(e.zuschlagProElement) && e.zuschlagProElement <= 2000)) add(n + ".zuschlagProElement", "Sprossen-Zuschlag €: 0 bis 2.000."); });
    each(F.rollladen, "fenster.rollladen", function (e, n) { if (!(geld(e.zuschlagProM2) && e.zuschlagProM2 <= 1000)) add(n + ".zuschlagProM2", "Rollladen €/m²: 0 bis 1.000."); });
    each(F.zusaetze, "fenster.zusaetze", function (e, n) { if (e.art !== "proElement" && e.art !== "proLfm") add(n + ".art", "Art muss „je Element“ oder „je lfm“ sein."); if (!(geld(e.zuschlag) && e.zuschlag <= 5000)) add(n + ".zuschlag", "Zuschlag €: 0 bis 5.000."); });
    if (!F.montage || !geld(F.montage.montageProElement) || F.montage.montageProElement > 2000) add("fenster.montage.montageProElement", "Montage je Element: 0 bis 2.000 €.");
    if (!F.montage || !geld(F.montage.demontageEntsorgungProElement) || F.montage.demontageEntsorgungProElement > 2000) add("fenster.montage.demontageEntsorgungProElement", "Demontage/Entsorgung je Element: 0 bis 2.000 €.");
    var hg = H.grenzen || {};
    if (!(num(hg.breiteMinMm) && hg.breiteMinMm >= 500)) add("haustuer.grenzen.breiteMinMm", "Mindestbreite Tür: ab 500 mm.");
    if (!(num(hg.breiteMaxMm) && hg.breiteMaxMm > (hg.breiteMinMm || 0))) add("haustuer.grenzen.breiteMaxMm", "Maximalbreite Tür muss größer als die Mindestbreite sein.");
    if (!(num(hg.hoeheMinMm) && hg.hoeheMinMm >= 1500)) add("haustuer.grenzen.hoeheMinMm", "Mindesthöhe Tür: ab 1.500 mm.");
    if (!(num(hg.hoeheMaxMm) && hg.hoeheMaxMm > (hg.hoeheMinMm || 0))) add("haustuer.grenzen.hoeheMaxMm", "Maximalhöhe Tür muss größer als die Mindesthöhe sein.");
    if (!(num(hg.standardBreiteMaxMm) && hg.standardBreiteMaxMm > 0)) add("haustuer.grenzen.standardBreiteMaxMm", "Standardbreite max.: positive Zahl.");
    if (!(num(hg.standardHoeheMaxMm) && hg.standardHoeheMaxMm > 0)) add("haustuer.grenzen.standardHoeheMaxMm", "Standardhöhe max.: positive Zahl.");
    if (!(num(hg.mengeMax) && hg.mengeMax >= 1 && hg.mengeMax <= 100)) add("haustuer.grenzen.mengeMax", "Maximale Menge: 1 bis 100.");
    if (!(num(hg.uebergroesseProzent) && hg.uebergroesseProzent >= 0 && hg.uebergroesseProzent <= 100)) add("haustuer.grenzen.uebergroesseProzent", "Übergröße in % zwischen 0 und 100.");
    if (!Object.keys(H.modelle || {}).length) add("haustuer.modelle", "Mindestens ein Türmodell.");
    each(H.modelle, "haustuer.modelle", function (m, n) { if (!(geld(m.grundpreis) && m.grundpreis > 0 && m.grundpreis <= 50000)) add(n + ".grundpreis", "Grundpreis: positive Zahl bis 50.000 €."); });
    each(H.farben, "haustuer.farben", function (e, n) { if (!(num(e.zuschlagProzent) && e.zuschlagProzent >= 0 && e.zuschlagProzent <= 100)) add(n + ".zuschlagProzent", "Farbzuschlag in % zwischen 0 und 100."); });
    each(H.glas, "haustuer.glas", function (e, n) { if (!(geld(e.zuschlagProElement) && e.zuschlagProElement <= 5000)) add(n + ".zuschlagProElement", "Glas-Zuschlag €: 0 bis 5.000."); });
    each(H.seitenteil, "haustuer.seitenteil", function (e, n) { if (!(geld(e.zuschlagProElement) && e.zuschlagProElement <= 10000)) add(n + ".zuschlagProElement", "Seitenteil €: 0 bis 10.000."); });
    each(H.zusaetze, "haustuer.zusaetze", function (e, n) { if (!(geld(e.zuschlag) && e.zuschlag <= 10000)) add(n + ".zuschlag", "Zuschlag €: 0 bis 10.000."); });
    if (!H.montage || !geld(H.montage.montageProElement) || H.montage.montageProElement > 5000) add("haustuer.montage.montageProElement", "Montage je Tür: 0 bis 5.000 €.");
    if (!H.montage || !geld(H.montage.demontageEntsorgungProElement) || H.montage.demontageEntsorgungProElement > 5000) add("haustuer.montage.demontageEntsorgungProElement", "Demontage/Entsorgung je Tür: 0 bis 5.000 €.");
    each((p.schiebetuer || {}).systeme, "schiebetuer.systeme", function (s, n) { if (!(geld(s.preisProM2) && s.preisProM2 > 0 && s.preisProM2 <= 5000)) add(n + ".preisProM2", "Preis €/m²: positive Zahl bis 5.000."); });
    if (!f.length && Preis) { var v = Preis.validiereListe(p); if (!v.ok) v.fehler.forEach(function (m) { add("", "Rechner: " + m); }); }
    return f;
  }

  function validiereEinstellungen(e) {
    var f = [];
    if (!e || typeof e !== "object" || !e.konfigurator) f.push({ feld: "konfigurator", meldung: "Einstellungen unvollständig." });
    else if (STATUS.indexOf(e.konfigurator.status) < 0) f.push({ feld: "konfigurator.status", meldung: "Status muss aus, vorschau oder online sein." });
    if (e && e.steuer !== undefined && !(e.steuer && Steuer && Steuer.gueltig(e.steuer.satzProzent))) f.push({ feld: "steuer.satzProzent", meldung: "Steuersatz muss " + (Steuer ? Steuer.SAETZE.join(" oder ") : "0 oder 19") + " sein." });
    return f;
  }

  return { validierePreise: validierePreise, validiereEinstellungen: validiereEinstellungen, STATUS: STATUS };
});
