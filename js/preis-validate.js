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

  /* IBAN-Prüfsumme (Modulo 97) */
  function ibanGueltig(iban) {
    var s = String(iban || "").replace(/\s+/g, "").toUpperCase();
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
    var um = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, function (c) { return String(c.charCodeAt(0) - 55); });
    var rest = 0; for (var i = 0; i < um.length; i++) rest = (rest * 10 + Number(um[i])) % 97;
    return rest === 1;
  }
  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var URL_HTTPS = /^https:\/\/[^\s]+$/;
  var ZEIT = /^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/;
  var NUMMER = /^[A-Z]{1,5}-\d{4}-\d{3,6}$/;
  var DATUM = /^\d{4}-\d{2}-\d{2}$/;
  var TAGE = ["mo", "di", "mi", "do", "fr", "sa", "so"];

  function validiereEinstellungen(e) {
    var f = [];
    var add = function (feld, meldung) { f.push({ feld: feld, meldung: meldung }); };
    var str = function (x) { return typeof x === "string" ? x.trim() : ""; };
    var ganz = function (x, min, max) { return typeof x === "number" && isFinite(x) && Math.floor(x) === x && x >= min && x <= max; };
    if (!e || typeof e !== "object" || !e.konfigurator) { add("konfigurator", "Einstellungen unvollständig."); return f; }
    if (STATUS.indexOf(e.konfigurator.status) < 0) add("konfigurator.status", "Status muss aus, vorschau oder online sein.");
    if (e.steuer !== undefined && !(e.steuer && Steuer && Steuer.gueltig(e.steuer.satzProzent))) add("steuer.satzProzent", "Steuersatz muss " + (Steuer ? Steuer.SAETZE.join(" oder ") : "0 oder 19") + " sein.");
    if (e.firma !== undefined) {
      var fi = e.firma || {};
      if (!str(fi.name)) add("firma.name", "Firmenname fehlt.");
      if (!str(fi.strasse)) add("firma.strasse", "Straße und Hausnummer fehlen.");
      if (!/^\d{5}$/.test(str(fi.plz))) add("firma.plz", "Postleitzahl: fünf Ziffern.");
      if (!str(fi.ort)) add("firma.ort", "Ort fehlt.");
      if (!/^\+?[\d\s()\/-]{6,}$/.test(str(fi.telefon))) add("firma.telefon", "Telefonnummer prüfen (nur Ziffern, Leerzeichen, +, /, -).");
      if (!EMAIL.test(str(fi.email))) add("firma.email", "E-Mail-Adresse prüfen.");
      if (str(fi.ustIdNr) && !/^[A-Z]{2}[A-Z0-9]{8,12}$/.test(str(fi.ustIdNr).replace(/\s/g, ""))) add("firma.ustIdNr", "Format z. B. DE123456789.");
    }
    if (e.bank !== undefined) {
      var b = e.bank || {};
      if (str(b.iban) && !ibanGueltig(b.iban)) add("bank.iban", "IBAN ist ungültig (Prüfsumme).");
      if (str(b.bic) && !/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(str(b.bic).toUpperCase())) add("bank.bic", "BIC: 8 oder 11 Zeichen, z. B. BYLADEM1ING.");
      if (!ganz(b.zahlungszielTage, 0, 90)) add("bank.zahlungszielTage", "Zahlungsziel: 0 bis 90 Tage.");
      if (!ganz(b.anzahlungProzent, 0, 100)) add("bank.anzahlungProzent", "Anzahlung: 0 bis 100 %.");
      if (!ganz(b.skontoProzent, 0, 10)) add("bank.skontoProzent", "Skonto: 0 bis 10 %.");
      if (!ganz(b.skontoTage, 0, 60)) add("bank.skontoTage", "Skonto-Frist: 0 bis 60 Tage.");
    }
    if (e.dokumente !== undefined) {
      var d = e.dokumente || {};
      ["angebot", "auftragsbestaetigung", "rechnung"].forEach(function (k) {
        var x = d[k] || {};
        if (!NUMMER.test(str(x.nummerStart))) add("dokumente." + k + ".nummerStart", "Format z. B. " + { angebot: "AN", auftragsbestaetigung: "AB", rechnung: "RE" }[k] + "-2026-0001 (Kürzel-Jahr-Nummer).");
        if (k === "angebot" && !ganz(x.gueltigTage, 1, 365)) add("dokumente.angebot.gueltigTage", "Gültigkeit: 1 bis 365 Tage.");
        if (str(x.einleitung).length > 2000) add("dokumente." + k + ".einleitung", "Einleitung: höchstens 2.000 Zeichen.");
        if (str(x.schluss).length > 2000) add("dokumente." + k + ".schluss", "Schlusstext: höchstens 2.000 Zeichen.");
      });
    }
    if (e.email !== undefined) {
      var m = e.email || {};
      if (str(m.anfragen) && !EMAIL.test(str(m.anfragen))) add("email.anfragen", "E-Mail-Adresse prüfen.");
      if (str(m.bewertungen) && !EMAIL.test(str(m.bewertungen))) add("email.bewertungen", "E-Mail-Adresse prüfen.");
      if (!str(m.absenderName)) add("email.absenderName", "Absendername fehlt.");
    }
    if (e.bewertungen !== undefined) {
      var bw = e.bewertungen || {};
      if (str(bw.googleBewertungLink) && !URL_HTTPS.test(str(bw.googleBewertungLink))) add("bewertungen.googleBewertungLink", "Link muss mit https:// beginnen.");
      if (str(bw.googleProfilLink) && !URL_HTTPS.test(str(bw.googleProfilLink))) add("bewertungen.googleProfilLink", "Link muss mit https:// beginnen.");
      if (str(bw.myhammerLink) && !URL_HTTPS.test(str(bw.myhammerLink))) add("bewertungen.myhammerLink", "Link muss mit https:// beginnen.");
      if (str(bw.googleNote) && !/^[1-5](,\d)?$/.test(str(bw.googleNote))) add("bewertungen.googleNote", "Bitte eine Note von 1 bis 5 angeben, z. B. 4,8.");
      if (str(bw.googleAnzahl) && !/^\d{1,5}$/.test(str(bw.googleAnzahl))) add("bewertungen.googleAnzahl", "Bitte eine ganze Zahl angeben.");
      if (str(bw.myhammerNote) && !/^[1-5](,\d)?(\s?\/\s?5)?$/.test(str(bw.myhammerNote))) add("bewertungen.myhammerNote", "Bitte eine Note angeben, z. B. 5/5 oder 4,9.");
    }
    if (e.oeffnungszeiten !== undefined) {
      var oz = e.oeffnungszeiten || {};
      TAGE.forEach(function (t) { var z = str(oz[t]); if (z && !ZEIT.test(z)) add("oeffnungszeiten." + t, "Format 09:00-17:00 oder leer (geschlossen)."); });
    }
    if (e.einsatzgebiet !== undefined) {
      var eg = e.einsatzgebiet || {};
      ["ingolstadt", "karlsruhe"].forEach(function (k) { if (typeof eg[k] !== "boolean") add("einsatzgebiet." + k, "Schalter an/aus."); });
    }
    if (e.konten !== undefined) {
      var ko = e.konten || {};
      ["netlify", "github", "brevo", "domain", "google"].forEach(function (k) { var x = ko[k] || {}; if (str(x.konto).length > 200) add("konten." + k + ".konto", "Höchstens 200 Zeichen."); });
      if (ko.domain && str(ko.domain.link) && !URL_HTTPS.test(str(ko.domain.link))) add("konten.domain.link", "Link muss mit https:// beginnen.");
      if (ko.domain && str(ko.domain.anbieter).length > 80) add("konten.domain.anbieter", "Höchstens 80 Zeichen.");
      var te = ko.technik || {};
      if (str(te.email) && !EMAIL.test(str(te.email))) add("konten.technik.email", "E-Mail-Adresse prüfen.");
      if (str(te.telefon) && !/^\+?[\d\s()\/-]{6,}$/.test(str(te.telefon))) add("konten.technik.telefon", "Telefonnummer prüfen.");
      if (str(ko.blobsTokenAblauf) && !DATUM.test(str(ko.blobsTokenAblauf))) add("konten.blobsTokenAblauf", "Datum im Format JJJJ-MM-TT.");
    }
    if (e.website !== undefined) {
      var w = e.website || {};
      if (typeof w.wartung !== "boolean") add("website.wartung", "Schalter an/aus.");
      if (str(w.wartungText).length > 600) add("website.wartungText", "Höchstens 600 Zeichen.");
      var bn = w.banner || {};
      if (typeof bn.aktiv !== "boolean") add("website.banner.aktiv", "Schalter an/aus.");
      if (bn.aktiv && !str(bn.text)) add("website.banner.text", "Text für das Banner fehlt.");
      if (str(bn.text).length > 300) add("website.banner.text", "Höchstens 300 Zeichen.");
      if (str(bn.von) && !DATUM.test(str(bn.von))) add("website.banner.von", "Datum im Format JJJJ-MM-TT.");
      if (str(bn.bis) && !DATUM.test(str(bn.bis))) add("website.banner.bis", "Datum im Format JJJJ-MM-TT.");
      if (str(bn.von) && str(bn.bis) && str(bn.bis) < str(bn.von)) add("website.banner.bis", "Ende liegt vor dem Beginn.");
    }
    return f;
  }
  /* Produktkarten (Admin → Produkte) */
  function validiereProdukte(p) {
    var f = [];
    var add = function (feld, meldung) { f.push({ feld: feld, meldung: meldung }); };
    var str = function (x) { return typeof x === "string" ? x.trim() : ""; };
    if (!p || typeof p !== "object" || !Array.isArray(p.karten)) { add("karten", "Produktkarten fehlen."); return f; }
    if (!p.karten.length) add("karten", "Mindestens eine Karte.");
    var ids = {};
    p.karten.forEach(function (k, i) {
      var n = "karten." + i + ".";
      if (!k || typeof k !== "object") { add(n + "titel", "Karte unvollständig."); return; }
      if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(String(k.id || ""))) add(n + "id", "Kennung fehlt oder ungültig.");
      if (ids[k.id]) add(n + "id", "Kennung doppelt."); ids[k.id] = true;
      if (!str(k.titel)) add(n + "titel", "Titel fehlt."); else if (str(k.titel).length > 60) add(n + "titel", "Titel: höchstens 60 Zeichen.");
      if (str(k.untertitel).length > 120) add(n + "untertitel", "Untertitel: höchstens 120 Zeichen.");
      if (!str(k.kurz)) add(n + "kurz", "Kurztext fehlt."); else if (str(k.kurz).length > 240) add(n + "kurz", "Kurztext: höchstens 240 Zeichen.");
      if (!k.bild || typeof k.bild !== "object" || !(str(k.bild.src) || str(k.bild.blob))) add(n + "bild", "Bitte ein Bild wählen.");
      else if (str(k.bild.src) && !/^\/?(assets\/[\w\/.-]+\.(webp|png|jpg|jpeg|svg))$/i.test(str(k.bild.src))) add(n + "bild", "Bildpfad muss auf assets/… zeigen.");
      if (k.abPreis !== null && k.abPreis !== undefined && k.abPreis !== "") { if (!(typeof k.abPreis === "number" && isFinite(k.abPreis) && k.abPreis > 0 && k.abPreis < 100000 && Math.abs(k.abPreis * 100 - Math.round(k.abPreis * 100)) < 1e-6)) add(n + "abPreis", "Preis: positive Zahl in Euro, höchstens 2 Nachkommastellen."); }
      if (!/^(\/[\w\/.-]*|https:\/\/[^\s]+)$/.test(str(k.link))) add(n + "link", "Link-Ziel: Pfad wie /produkte/… oder https://…");
      if (k.sichtbar !== undefined && typeof k.sichtbar !== "boolean") add(n + "sichtbar", "Schalter an/aus.");
      if (k.startseite !== undefined && typeof k.startseite !== "boolean") add(n + "startseite", "Schalter an/aus.");
    });
    return f;
  }
  /* Tage bis zu einem Ablaufdatum (JJJJ-MM-TT); null ohne Datum */
  function tageBis(datum, heute) {
    if (!DATUM.test(String(datum || ""))) return null;
    var a = new Date(String(datum) + "T00:00:00Z"), b = heute ? new Date(String(heute).slice(0, 10) + "T00:00:00Z") : new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
    return Math.round((a - b) / 86400000);
  }
  /* Zweige, deren Änderung die Website verändert (→ automatische Veröffentlichung) */
  var ZWEIGE_WEBSITE = ["konfigurator", "steuer", "firma", "bewertungen", "oeffnungszeiten", "einsatzgebiet", "website"];

  return { validierePreise: validierePreise, validiereEinstellungen: validiereEinstellungen, ibanGueltig: ibanGueltig, tageBis: tageBis, validiereProdukte: validiereProdukte, STATUS: STATUS, ZWEIGE_WEBSITE: ZWEIGE_WEBSITE };
});
