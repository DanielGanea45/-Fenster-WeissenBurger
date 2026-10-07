/* Bildauswahl für den Konfigurator – EIN Modul für Browser (window.FWBilder) und Node (Tests, Abdeckungsbericht).
   Grundlage ist data/konfigurator-bilder.json (automatisch erzeugt). Regeln:
   – Jede Option der Preisliste wird über ihren Schlüssel UND ihren Namen (Schlagwörter) einem Bildteil zugeordnet,
     damit auch im Admin umbenannte oder neu angelegte Optionen („Anthrazit außen“, „Aufsatzrollladen Gurt/elektrisch“ …)
     ein Foto bekommen.
   – Karten: jede Option bekommt ein Bild; Fensteroptionen (Typ, Farbe, Sprossen, Rollladen) nutzen das passendste Foto
     der Serie fenster-<typ>-<farbe>-<sprossen>-<rollladen>, Glas/Zusätze ihre eigenen Bilder.
   – Vorschau: nur das EXAKT passende Foto (sonst null → schematische SVG-Zeichnung). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.FWBilder = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const norm = (s) => String(s == null ? "" : s).toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
  /* Schlagwort-Regeln je Gruppe: erste Regel, die auf „schlüssel name“ passt, gewinnt. null = bewusst kein Foto (RAL). */
  const REGELN = {
    typ: [[/2[\s-]?fl|zweifl|stulp|doppelfl|zweiteilig/, "2fl"], [/fest|fix/, "fest"], [/balkon|terrasse|tuer\b|-tuer|tür/, "balkon"], [/1[\s-]?fl|einfl|dreh|kipp|standard/, "1fl"]],
    farbe: [[/ral|wunsch|sonderfarbe|nach wahl/, null], [/zweifarb|zwei farb|aussen farbig|innen weiss|bicolor/, "zweifarbig"], [/anthrazit|7016|grau|schwarz|basalt/, "anthrazit"], [/golden|oak|eiche|holz|nuss|mahagoni|dekor/, "goldenoak"], [/weiss|white|standard/, "weiss"]],
    sprossen: [[/ohne|kein|standard/, "keine"], [/wiener|aufgesetzt|glasteilend|aussen/, "wiener"], [/innen|zwischen|scheibenzwischen|sprosse/, "innen"]],
    rollladen: [[/ohne|kein|standard/, "kein"], [/vorsatz|vorbau|aufgesetzt aussen/, "vorsatz"], [/aufsatz|aufbau|rollladen|roll|gurt|elektr|motor|funk|kasten/, "aufsatz"]],
    modell: [[/seitenteil/, "seitenteil"], [/glasstreifen|streifen|lichtausschnitt/, "glasstreifen"], [/klassisch|kassette|holz|landhaus|ornament/, "klassisch"], [/voll|modern|flaechenbuendig|glatt/, "voll"]],
    glas: [[/3[\s-]?fach|dreifach|0,6|0\.6/, "glas-3fach"], [/schall/, "glas-schallschutz"], [/vsg|esg|sicherheit|einbruch|p4a/, "glas-vsg"], [/2[\s-]?fach|zweifach|1,1|1\.1|standard/, "glas-2fach"]],
    glasTuer: [[/ornament|struktur|katedral|klassisch/, "tuer-klassisch-weiss"], [/vsg|esg|sicherheit|einbruch/, "glas-vsg"], [/satin|standard|klar|streifen/, "tuer-glasstreifen-weiss"]],
    zusatz: [[/demontage|entsorg|ausbau|altfenster/, "zusatz-demontage"], [/montage|einbau|lieferung/, "zusatz-montage"], [/fensterbank.*(innen|marmor|werzalit)|innenfensterbank/, "zusatz-fensterbank-innen"], [/fensterbank|aussenbank|alu/, "zusatz-fensterbank-aussen"], [/insekt|fliegen|muecken|gitter/, "zusatz-insektenschutz"], [/motor|elektr|antrieb|gurt|funk|smart/, "zusatz-rollladenmotor"], [/rc2|rc 2|einbruch|sicher|pilzkopf|abschliess|verriegel/, "zusatz-rc2"]],
    zusatzTuer: [[/oberlicht|lichtausschnitt|seitenteil/, "tuer-glasstreifen-weiss"], [/rc2|rc 2|einbruch|sicher|finger|automatik|schloss|verriegel|motor|smart|zutritt/, "zusatz-rc2"], [/montage|einbau/, "zusatz-montage"], [/demontage|entsorg/, "zusatz-demontage"]],
  };
  /* Exakte Schlüssel der Repo-Preisliste (schnellster Weg, bleibt stabil) */
  const FEST = {
    typ: { "1-fluegelig": "1fl", "2-fluegelig": "2fl", festverglasung: "fest", balkontuer: "balkon" },
    farbe: { weiss: "weiss", anthrazit: "anthrazit", "golden-oak": "goldenoak", goldenoak: "goldenoak", zweifarbig: "zweifarbig", ral: null },
    sprossen: { keine: "keine", innenliegend: "innen", innen: "innen", wiener: "wiener" },
    rollladen: { keiner: "kein", kein: "kein", aufsatz: "aufsatz", vorsatz: "vorsatz" },
    modell: { "modern-voll": "voll", "modern-glasstreifen": "glasstreifen", "mit-seitenteil": "seitenteil", "klassisch-golden-oak": "klassisch" },
    glas: { "2-fach": "glas-2fach", "3-fach": "glas-3fach", schallschutz: "glas-schallschutz", sicherheit: "glas-vsg" },
    glasTuer: { standard: "tuer-glasstreifen-weiss", sicherheit: "glas-vsg", ornament: "tuer-klassisch-weiss" },
    zusatz: { rc2: "zusatz-rc2", insektenschutz: "zusatz-insektenschutz", rollladenmotor: "zusatz-rollladenmotor", "fensterbank-innen": "zusatz-fensterbank-innen", "fensterbank-aussen": "zusatz-fensterbank-aussen", montage: "zusatz-montage", demontage: "zusatz-demontage" },
    zusatzTuer: { rc2: "zusatz-rc2", fingerprint: "zusatz-rc2", automatikschloss: "zusatz-rc2", oberlicht: "tuer-glasstreifen-weiss" },
  };
  /* Bildteil für einen Optionsschlüssel: fester Schlüssel → Schlagwörter in Schlüssel + Name → unbekannt (undefined) */
  function teil(gruppe, key, name) {
    if (FEST[gruppe] && Object.prototype.hasOwnProperty.call(FEST[gruppe], key)) return FEST[gruppe][key];
    const text = norm(key) + " " + norm(name);
    for (const [re, wert] of REGELN[gruppe] || []) if (re.test(text)) return wert;
    return undefined;
  }

  function Bilder(liste, preise) {
    const bilder = (liste && liste.bilder) || {};
    const hat = (name) => !!(name && bilder[name]);
    const serie = Object.keys(bilder).filter((k) => /^fenster-/.test(k)).map((k) => { const p = k.split("-"); return { key: k, typ: p[1], farbe: p[2], sprossen: p[3], rollladen: p[4] }; });
    let P = preise || null;
    function setPreise(p) { P = p; }
    /* Name einer Option aus der Preisliste (für Schlagwörter), wenn vorhanden */
    function nameVon(produkt, gruppe, key) {
      const D = P && (produkt === "haustuer" ? P.haustuer : P.fenster); if (!D) return "";
      const map = { typ: D.typen, farbe: D.farben, sprossen: D.sprossen, rollladen: D.rollladen, modell: D.modelle, glas: D.glas, seitenteil: D.seitenteil, zusatz: D.zusaetze }[gruppe];
      return map && map[key] ? map[key].name || "" : "";
    }
    const t = (produkt, gruppe, key, name) => teil(gruppe, key, name !== undefined ? name : nameVon(produkt, gruppe, key));
    const fensterTeile = (cfg) => ({ typ: t("fenster", "typ", cfg.typ), farbe: t("fenster", "farbe", cfg.farbe), sprossen: t("fenster", "sprossen", cfg.sprossen || "keine"), rollladen: t("fenster", "rollladen", cfg.rollladen || "keiner") });

    /* Exaktes Fensterfoto oder null (RAL/unbekannte Farbe → null) */
    function fensterExakt(cfg) {
      const x = fensterTeile(cfg);
      if (!x.typ || !x.farbe || !x.sprossen || !x.rollladen) return null;
      const name = `fenster-${x.typ}-${x.farbe}-${x.sprossen}-${x.rollladen}`;
      return hat(name) ? name : null;
    }
    /* Passendstes Fensterfoto: exakt → Farbe+Sprossen → Farbe+Rollladen → Farbe → Sprossen+Rollladen → Sprossen → Rollladen → Typ → irgendein Fenster */
    function fensterNaechstes(cfg) {
      const exakt = fensterExakt(cfg); if (exakt) return exakt;
      const x = fensterTeile(cfg);
      const f = x.farbe === null ? "anthrazit" : (x.farbe || "weiss"), s = x.sprossen || "keine", r = x.rollladen || "kein";
      const kand = serie.filter((b) => b.typ === (x.typ || "1fl"));
      const basis = kand.length ? kand : serie;
      if (!basis.length) return null;
      const stufen = [(b) => b.farbe === f && b.sprossen === s, (b) => b.farbe === f && b.rollladen === r, (b) => b.farbe === f, (b) => b.sprossen === s && b.rollladen === r, (b) => b.sprossen === s, (b) => b.rollladen === r];
      for (const st of stufen) { const tr = basis.filter(st).sort(punkte(f, s, r)); if (tr.length) return tr[0].key; }
      return basis.slice().sort(punkte(f, s, r))[0].key;
    }
    function punkte(f, s, r) {
      const score = (b) => (b.farbe === f ? 0 : b.farbe === "weiss" ? 1 : 2) * 100 + (b.sprossen === s ? 0 : b.sprossen === "keine" ? 1 : 2) * 10 + (b.rollladen === r ? 0 : b.rollladen === "kein" ? 1 : 2);
      return (a, b) => score(a) - score(b);
    }
    function tuerExakt(cfg) {
      const m = t("haustuer", "modell", cfg.modell), f = t("haustuer", "farbe", cfg.farbe);
      if (!m || !f) return null;
      const name = `tuer-${m}-${f}`; return hat(name) ? name : null;
    }
    function tuerNaechstes(cfg) {
      const m = t("haustuer", "modell", cfg.modell) || "voll", f0 = t("haustuer", "farbe", cfg.farbe), f = f0 === null ? "anthrazit" : (f0 || "weiss");
      return tuerExakt(cfg) || [`tuer-${m}-${f}`, `tuer-${m}-weiss`, `tuer-voll-${f}`, "tuer-voll-weiss"].find(hat) || null;
    }

    /* Bild für eine Karte. produkt: fenster|haustuer; gruppe: system|typ|farbe|glas|sprossen|rollladen|modell|seitenteil|zusatz */
    function karte(produkt, gruppe, id, eintrag, state) {
      state = state || {};
      const name = eintrag && eintrag.name;
      const alt = (eintrag && eintrag.bild && hat(eintrag.bild)) ? eintrag.bild : null;
      let bild = null;
      if (produkt === "fenster") {
        if (gruppe === "system") bild = alt;
        else if (gruppe === "typ") bild = fensterNaechstes({ typ: id, farbe: state.farbe || "weiss", sprossen: "keine", rollladen: "keiner" });
        else if (gruppe === "farbe") bild = fensterNaechstes({ typ: state.typ || "1-fluegelig", farbe: id, sprossen: state.sprossen || "keine", rollladen: state.rollladen || "keiner" });
        else if (gruppe === "sprossen") bild = fensterNaechstes({ typ: state.typ || "1-fluegelig", farbe: state.farbe || "weiss", sprossen: id, rollladen: state.rollladen || "keiner" });
        else if (gruppe === "rollladen") bild = fensterNaechstes({ typ: state.typ || "1-fluegelig", farbe: state.farbe || "weiss", sprossen: state.sprossen || "keine", rollladen: id });
        else if (gruppe === "glas") bild = teil("glas", id, name) || null;
        else if (gruppe === "zusatz") bild = teil("zusatz", id, name) || null;
      } else {
        if (gruppe === "modell") bild = tuerNaechstes({ modell: id, farbe: state.farbe || "weiss" });
        else if (gruppe === "farbe") bild = tuerNaechstes({ modell: state.modell || "modern-voll", farbe: id });
        else if (gruppe === "glas") bild = teil("glasTuer", id, name) || null;
        else if (gruppe === "seitenteil") bild = /ohne|kein/.test(norm(id) + " " + norm(name)) ? tuerNaechstes({ modell: state.modell || "modern-voll", farbe: state.farbe || "weiss" }) : tuerNaechstes({ modell: "mit-seitenteil", farbe: state.farbe || "weiss" });
        else if (gruppe === "zusatz") bild = teil("zusatzTuer", id, name) || teil("zusatz", id, name) || null;
      }
      if (!hat(bild)) bild = alt;
      if (!hat(bild)) bild = produkt === "fenster" ? (gruppe === "glas" ? "glas-2fach" : gruppe === "zusatz" ? "zusatz-montage" : fensterNaechstes({ typ: "1-fluegelig", farbe: "weiss" })) : (gruppe === "glas" ? "tuer-glasstreifen-weiss" : gruppe === "zusatz" ? "zusatz-rc2" : "tuer-voll-weiss");
      return hat(bild) ? bild : null;
    }
    /* Foto für die Vorschau (nur exakt) */
    function vorschau(produkt, state) { return produkt === "fenster" ? fensterExakt(state) : tuerExakt(state); }
    /* Nachbarvarianten zum Vorladen */
    function nachbarn(produkt, state, optionen) {
      const out = new Set();
      const probe = (k, werte) => (werte || []).forEach((v) => { if (v !== state[k]) { const n = vorschau(produkt, Object.assign({}, state, { [k]: v })); if (n) out.add(n); } });
      if (produkt === "fenster") { probe("farbe", optionen.farbe); probe("sprossen", optionen.sprossen); probe("rollladen", optionen.rollladen); probe("typ", optionen.typ); }
      else { probe("farbe", optionen.farbe); probe("modell", optionen.modell); }
      return [...out].slice(0, 12);
    }
    /* Abdeckung: exakt | aehnlich | fehlt für eine Kombination */
    function abdeckung(produkt, state) {
      const exakt = vorschau(produkt, state); if (exakt) return { stufe: "exakt", bild: exakt };
      const n = produkt === "fenster" ? fensterNaechstes(state) : tuerNaechstes(state);
      return n ? { stufe: "aehnlich", bild: n } : { stufe: "fehlt", bild: null };
    }
    function info(name) { return bilder[name] || null; }
    return { hat, karte, vorschau, nachbarn, abdeckung, info, fensterExakt, fensterNaechstes, tuerExakt, tuerNaechstes, setPreise, teil };
  }
  return { Bilder, teil, REGELN, FEST };
});
