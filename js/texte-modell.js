/* Texte – EIN Modul für den visuellen Editor im Admin (window.FWTexte), die Netlify Functions (Prüfung beim
   Speichern) und die Tests. Wandelt den gespeicherten HTML-Text eines Bausteins verlustfrei in ein kleines
   Modell um und zurück:
     text        – normaler Text (Entities werden gelesen und beim Schreiben wieder erzeugt)
     em / strong – Hervorhebung / Fett (mit Kindern)
     a           – Link; vorhandene Attribute bleiben unverändert erhalten (attrRoh), nur href ist änderbar
     br          – neue Zeile
     struktur    – gesperrter Baustein, z. B. <span>01</span> vor der Überschrift oder die geschützte E-Mail-Adresse;
                   wird unverändert durchgereicht, der Benutzer kann ihn nicht bearbeiten
     platzhalter – {steuerhinweis}: wird beim Veröffentlichen automatisch ersetzt, im Editor als Etikett gesperrt
   Beim Speichern prüft pruefe(): erlaubt sind nur em, strong, a (sichere Ziele), br sowie Strukturbausteine und
   Links, die genau so schon im Originaltext der Seite stehen. Alles andere wird mit einer einfachen Meldung abgelehnt. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.FWTexte = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var PLATZHALTER = { steuerhinweis: "Steuerhinweis (automatisch)" };
  var MELDUNG = "Dieser Text enthält Zeichen, die nicht erlaubt sind.";
  var ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0" };
  var ROLLEN = { eyebrow: "Kleine Zeile über der Überschrift", h1: "Große Überschrift", h2: "Überschrift", h3: "Zwischenüberschrift", lead: "Einleitung", button: "Button-Text", p: "Absatz" };
  /* Empfohlene Längen je Rolle (Hinweis, keine Sperre) */
  var LIMITS = { eyebrow: 40, h1: 60, h2: 80, h3: 70, lead: 320, button: 30, p: 600 };

  function decode(s) { return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, function (m, e) { if (e[0] === "#") { var n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return isFinite(n) ? String.fromCodePoint(n) : m; } var k = e.toLowerCase(); return ENT[k] !== undefined ? ENT[k] : m; }); }
  function encode(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  /* ---------- Lesen: HTML → Knoten ---------- */
  function parse(html) {
    var s = String(html == null ? "" : html);
    var pos = 0, wurzel = [], stapel = [{ kinder: wurzel }];
    var tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^\s=>\/"']+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>"']+))?)*)\s*(\/?)>/g;
    function textEin(roh) {
      if (!roh) return;
      var kinder = stapel[stapel.length - 1].kinder;
      var teile = roh.split(/(\{[a-z]+\})/);
      for (var i = 0; i < teile.length; i++) {
        var t = teile[i]; if (!t) continue;
        var pm = /^\{([a-z]+)\}$/.exec(t);
        if (pm && PLATZHALTER[pm[1]]) kinder.push({ typ: "platzhalter", name: pm[1] });
        else kinder.push({ typ: "text", text: decode(t), raw: t });
      }
    }
    var m;
    tagRe.lastIndex = 0;
    while ((m = tagRe.exec(s))) {
      textEin(s.slice(pos, m.index));
      var schliesst = m[1] === "/", name = m[2].toLowerCase(), attrRoh = m[3] || "", ganz = m[0];
      var kinder = stapel[stapel.length - 1].kinder;
      if (schliesst) {
        if (name === "b") name = "strong"; if (name === "i") name = "em";
        /* passenden offenen Knoten schließen; unpassende Schließ-Tags ignorieren */
        for (var k = stapel.length - 1; k > 0; k--) if (stapel[k].typ === name) { stapel.length = k; break; }
        pos = m.index + ganz.length; continue;
      }
      if (name === "br") { kinder.push({ typ: "br" }); }
      else if (name === "em" || name === "i") { var e = { typ: "em", kinder: [] }; kinder.push(e); stapel.push(e); }
      else if (name === "strong" || name === "b") { var st = { typ: "strong", kinder: [] }; kinder.push(st); stapel.push(st); }
      else if (name === "a") { var a = { typ: "a", attrRoh: attrRoh, href: attribut(attrRoh, "href"), kinder: [] }; kinder.push(a); stapel.push(a); }
      else {
        /* alles andere (span, ul, p, …) ist ein gesperrter Strukturbaustein samt Inhalt */
        var ende = schliessendesEnde(s, m.index + ganz.length, name);
        if (m[4] === "/" || ende < 0) { kinder.push({ typ: "struktur", html: ganz }); pos = m.index + ganz.length; }
        else { kinder.push({ typ: "struktur", html: s.slice(m.index, ende) }); pos = ende; tagRe.lastIndex = ende; }
        continue;
      }
      pos = m.index + ganz.length;
    }
    textEin(s.slice(pos));
    return wurzel;
  }
  /* Ende des zugehörigen Schließ-Tags (mit Verschachtelung gleicher Tags), -1 wenn keins */
  function schliessendesEnde(s, von, name) {
    var re = new RegExp("<(/?)" + name + "\\b[^>]*>", "gi"); re.lastIndex = von; var tiefe = 1, m;
    while ((m = re.exec(s))) { if (m[1] === "/") { tiefe--; if (tiefe === 0) return m.index + m[0].length; } else if (!/\/\s*>$/.test(m[0])) tiefe++; }
    return -1;
  }
  function attribut(attrRoh, name) { var m = new RegExp("\\s" + name + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>\"']+))", "i").exec(" " + attrRoh); return m ? decode(m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[3]) : ""; }

  /* ---------- Schreiben: Knoten → HTML ---------- */
  function serialisiere(knoten) {
    var out = "";
    for (var i = 0; i < (knoten || []).length; i++) {
      var k = knoten[i];
      if (k.typ === "text") out += k.raw !== undefined && decode(k.raw) === k.text ? k.raw : encode(k.text);
      else if (k.typ === "br") out += "<br>";
      else if (k.typ === "em" || k.typ === "strong") out += "<" + k.typ + ">" + serialisiere(k.kinder) + "</" + k.typ + ">";
      else if (k.typ === "a") out += "<a" + linkAttribute(k) + ">" + serialisiere(k.kinder) + "</a>";
      else if (k.typ === "struktur") out += k.html;
      else if (k.typ === "platzhalter") out += "{" + k.name + "}";
    }
    return out;
  }
  /* Attribute eines Links: vorhandene bleiben, href wird ersetzt bzw. ergänzt */
  function linkAttribute(k) {
    var roh = k.attrRoh || "";
    var href = String(k.href || "");
    var hrefAttr = ' href="' + href.replace(/&/g, "&amp;").replace(/"/g, "&quot;") + '"';
    if (/\shref\s*=/.test(" " + roh)) roh = (" " + roh).replace(/\shref\s*=\s*("[^"]*"|'[^']*'|[^\s>"']+)/i, hrefAttr).replace(/^\s/, "");
    else roh = (hrefAttr + (roh ? " " + roh.trim() : "")).trim();
    if (/^https:\/\//i.test(href) && !/\srel=/.test(" " + roh)) roh += ' rel="noopener noreferrer" target="_blank"';
    return roh ? " " + roh.replace(/^\s+/, "") : "";
  }

  /* ---------- Hilfen ---------- */
  function nurText(knoten) {
    var out = "";
    for (var i = 0; i < (knoten || []).length; i++) { var k = knoten[i]; if (k.typ === "text") out += k.text; else if (k.typ === "br") out += "\n"; else if (k.kinder) out += nurText(k.kinder); else if (k.typ === "struktur") out += decode(k.html.replace(/<[^>]+>/g, "")); }
    return out;
  }
  function zeichen(html) { return nurText(parse(html)).replace(/\s+/g, " ").trim().length; }
  function hrefErlaubt(h) { h = String(h || "").trim(); if (!h) return false; if (/^javascript:|^data:|^vbscript:/i.test(h)) return false; return /^(https:\/\/[^\s"'<>]+|\/[^\s"'<>]*|#[A-Za-z0-9_\-]+|mailto:[^\s"'<>]+|tel:[^\s"'<>]+|[A-Za-z0-9][A-Za-z0-9_\-.\/]*(#[A-Za-z0-9_\-]+)?)$/.test(h); }
  function alleLinks(knoten, out) { out = out || []; for (var i = 0; i < (knoten || []).length; i++) { var k = knoten[i]; if (k.typ === "a") out.push(k); if (k.kinder) alleLinks(k.kinder, out); } return out; }
  function alleStrukturen(knoten, out) { out = out || []; for (var i = 0; i < (knoten || []).length; i++) { var k = knoten[i]; if (k.typ === "struktur") out.push(k); if (k.kinder) alleStrukturen(k.kinder, out); } return out; }
  function istGesperrt(k) { return k.typ === "struktur" || k.typ === "platzhalter"; }

  /* Prüfung beim Speichern: Text neu gegen den Originalbaustein der Seite.
     Rückgabe { ok, html } oder { ok:false, fehler: MELDUNG }. html ist die normalisierte Form. */
  function pruefe(html, original) {
    var neu = parse(html), alt = parse(original == null ? "" : original);
    var altHtml = String(original == null ? "" : original);
    var altLinks = alleLinks(alt).map(function (l) { return (l.attrRoh || "").trim(); });
    var fehler = false;
    alleStrukturen(neu).forEach(function (s) { if (altHtml.indexOf(s.html) < 0) fehler = true; });
    alleLinks(neu).forEach(function (l) {
      if (!hrefErlaubt(l.href)) { fehler = true; return; }
      var roh = (l.attrRoh || "").trim();
      var nurHref = roh.replace(/href\s*=\s*("[^"]*"|'[^']*'|[^\s>"']+)/i, "").replace(/rel\s*=\s*"noopener noreferrer"/i, "").replace(/target\s*=\s*"_blank"/i, "").trim();
      if (nurHref && altLinks.indexOf(roh) < 0) fehler = true; // fremde Attribute nur, wenn der Link genau so im Original steht
      if (/\son[a-z]+\s*=/i.test(" " + roh) || /javascript:/i.test(roh)) fehler = true;
    });
    if (fehler) return { ok: false, fehler: MELDUNG };
    return { ok: true, html: serialisiere(neu) };
  }

  /* Rolle eines Bausteins aus Tag und Attributen der Seite */
  function rolle(tag, attrs, inner) {
    attrs = attrs || ""; tag = String(tag || "p").toLowerCase();
    if (/class="[^"]*\beyebrow\b/.test(attrs)) return "eyebrow";
    if (tag === "h1" || tag === "h2" || tag === "h3") return tag;
    if (/class="[^"]*\blead\b/.test(attrs)) return "lead";
    if (/^\s*<a\s[^>]*class="[^"]*\bbtn\b[^"]*"[^>]*>[\s\S]*<\/a>\s*$/.test(inner || "")) return "button";
    return "p";
  }

  return { PLATZHALTER: PLATZHALTER, MELDUNG: MELDUNG, ROLLEN: ROLLEN, LIMITS: LIMITS, parse: parse, serialisiere: serialisiere, pruefe: pruefe, nurText: nurText, zeichen: zeichen, hrefErlaubt: hrefErlaubt, istGesperrt: istGesperrt, rolle: rolle, decode: decode, encode: encode };
});
