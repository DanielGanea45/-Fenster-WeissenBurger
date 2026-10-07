/* Steuer – EIN Modul für Browser (window.FWSteuer), Netlify Functions, Build, E-Mails, PDF und Tests.
   Hier und NUR hier stehen der Steuersatz-Schalter und sämtliche Steuertexte der Website.
   Satz 0 = Kleinunternehmer (§ 19 UStG): kein Steuerausweis, Endpreis = Summe.
   Satz 19 = Regelbesteuerung: Steuer wird auf die Summe aufgeschlagen und ausgewiesen.
   Quelle des Satzes: data/einstellungen.json → steuer.satzProzent (im Admin unter „Steuer“ umschaltbar,
   Build + Veröffentlichung laufen danach automatisch). Bereits erzeugte Vorgänge (Anfragen, Angebote,
   Rechnungen) speichern den Satz zum Zeitpunkt ihrer Erstellung und bleiben davon unberührt. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.FWSteuer = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var SAETZE = [0, 19];
  var STANDARD = 0;
  var PLATZHALTER = "{steuerhinweis}";

  function prozent(s) { return String(s).replace(".", ",") + " %"; }
  function gueltig(s) { return typeof s === "number" && SAETZE.indexOf(s) >= 0; }
  /* Aktueller Satz aus den Einstellungen (fehlt der Eintrag: Standard 0 %) */
  function satz(einstellungen) {
    var s = einstellungen && einstellungen.steuer ? einstellungen.steuer.satzProzent : undefined;
    return gueltig(s) ? s : STANDARD;
  }

  /* Alle Texte zu einem Satz. Nirgendwo sonst wird ein Steuertext von Hand geschrieben. */
  function texte(s) {
    s = gueltig(s) ? s : STANDARD;
    if (s === 0) {
      return {
        satz: 0,
        kurz: "Endpreis gem. § 19 UStG",
        lang: "Endpreis – gemäß § 19 UStG wird keine Umsatzsteuer berechnet.",
        summeLabel: "Endpreis",
        steuerLabel: null,
        option: "0 % (Kleinunternehmer, § 19 UStG)",
        beschreibung: "Umsatzsteuer: 0 % (Kleinunternehmer, § 19 UStG)",
        adminKurz: "Kein Steuerausweis – der Endpreis ist die Summe aller Positionen.",
        bestaetigung: "Die Website zeigt ab sofort keine Umsatzsteuer mehr: Der Hinweis „inkl. MwSt.“ und die Steuerzeile verschwinden auf allen Seiten, im Konfigurator, in E-Mails und Dokumenten. Stattdessen steht überall „Endpreis – gemäß § 19 UStG wird keine Umsatzsteuer berechnet.“ Die Website wird danach automatisch neu veröffentlicht. Bereits erstellte Angebote, Auftragsbestätigungen und Rechnungen behalten ihren Steuerstatus.",
      };
    }
    return {
      satz: s,
      kurz: "inkl. " + prozent(s) + " MwSt.",
      lang: "Alle Preise inkl. " + prozent(s) + " MwSt.",
      summeLabel: "Netto",
      steuerLabel: "MwSt. " + prozent(s),
      option: prozent(s),
      beschreibung: "Umsatzsteuer: " + prozent(s),
      adminKurz: "Umsatzsteuer " + prozent(s) + " wird auf die Summe aufgeschlagen und ausgewiesen.",
      bestaetigung: "Die Website weist ab sofort " + prozent(s) + " Umsatzsteuer aus: Alle Preise erscheinen „inkl. " + prozent(s) + " MwSt.“, in der Preisaufstellung erscheint die Zeile „MwSt. " + prozent(s) + "“ – auf allen Seiten, im Konfigurator, in E-Mails und Dokumenten. Die Website wird danach automatisch neu veröffentlicht. Bereits erstellte Angebote, Auftragsbestätigungen und Rechnungen behalten ihren Steuerstatus.",
    };
  }
  function optionen() { return SAETZE.map(function (s) { return { satz: s, label: texte(s).option }; }); }
  var TITEL = "Steuer";
  var SCHALTER_LABEL = "Umsatzsteuer";

  /* Preiszeile „952,38 €“ + Zusatz */
  function preisMitZusatz(euroText, s) { return euroText + " · " + texte(s).kurz; }

  /* Platzhalter {steuerhinweis} in Admin-Texten (Build und Vorschau) */
  function ersetzePlatzhalter(text, s) { return String(text == null ? "" : text).split(PLATZHALTER).join(texte(s).lang); }

  /* ---- Prüfung (tests/steuer-audit.test.js): Wörter, die außerhalb dieses Moduls nirgends vorkommen dürfen ---- */
  var VERBOTEN = /mwst|mehrwertsteuer|\bust\b|umsatzsteuer|19\s?%|inkl\.|zzgl\.|brutto|netto/gi;
  /* Texte dieses Moduls, die auf der Website stehen dürfen (aktueller Satz + beide Schalter-Beschriftungen) */
  function erlaubteTexte(s) {
    var t = texte(s), out = [t.lang, t.bestaetigung, t.adminKurz, t.beschreibung, t.kurz, t.steuerLabel, t.summeLabel];
    SAETZE.forEach(function (x) { var o = texte(x); out.push(o.beschreibung, o.option); });
    out.push(SCHALTER_LABEL + ":");
    return out.filter(function (x, i, a) { return x && a.indexOf(x) === i; }).sort(function (a, b) { return b.length - a.length; });
  }
  /* Entfernt die erlaubten Texte aus einem Inhalt; was danach noch zu VERBOTEN passt, ist ein Verstoß. */
  function bereinige(inhalt, s) {
    var out = String(inhalt);
    erlaubteTexte(s).forEach(function (t) { out = out.split(t).join(" "); out = out.split(t.replace(/&/g, "&amp;").replace(/"/g, "&quot;")).join(" "); });
    return out;
  }
  function verstoesse(inhalt, s) {
    var out = [], text = bereinige(inhalt, s), m;
    VERBOTEN.lastIndex = 0;
    while ((m = VERBOTEN.exec(text))) { var zeile = text.slice(0, m.index).split("\n").length; out.push({ wort: m[0], zeile: zeile }); }
    return out;
  }

  return { SAETZE: SAETZE, STANDARD: STANDARD, PLATZHALTER: PLATZHALTER, TITEL: TITEL, SCHALTER_LABEL: SCHALTER_LABEL, satz: satz, gueltig: gueltig, prozent: prozent, texte: texte, optionen: optionen, preisMitZusatz: preisMitZusatz, ersetzePlatzhalter: ersetzePlatzhalter, VERBOTEN: VERBOTEN, erlaubteTexte: erlaubteTexte, bereinige: bereinige, verstoesse: verstoesse };
});
