/* Bildauswahl für den Konfigurator – EIN Modul für Browser (window.FWBilder) und Node (Tests).
   Grundlage ist data/konfigurator-bilder.json (automatisch erzeugt). Regeln:
   – Karten: jede Option bekommt ein Bild; Fensteroptionen (Typ, Farbe, Sprossen, Rollladen) nutzen das
     passendste Foto aus der Serie fenster-<typ>-<farbe>-<sprossen>-<rollladen>, Glas/Zusätze ihre eigenen Bilder.
   – Vorschau: nur das EXAKT passende Foto (sonst null → schematische SVG-Zeichnung). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.FWBilder = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  /* Schlüssel der Preisliste → Namensteile der Bilddateien */
  const MAP = {
    typ: { "1-fluegelig": "1fl", "2-fluegelig": "2fl", festverglasung: "fest", balkontuer: "balkon" },
    farbe: { weiss: "weiss", anthrazit: "anthrazit", "golden-oak": "goldenoak", zweifarbig: "zweifarbig", ral: "anthrazit" },
    sprossen: { keine: "keine", innenliegend: "innen", wiener: "wiener" },
    rollladen: { keiner: "kein", aufsatz: "aufsatz", vorsatz: "vorsatz" },
    modell: { "modern-voll": "voll", "modern-glasstreifen": "glasstreifen", "mit-seitenteil": "seitenteil", "klassisch-golden-oak": "klassisch" },
    glas: { "2-fach": "glas-2fach", "3-fach": "glas-3fach", schallschutz: "glas-schallschutz", sicherheit: "glas-vsg" },
    glasTuer: { standard: "tuer-glasstreifen-weiss", sicherheit: "glas-vsg", ornament: "tuer-klassisch-weiss" },
    zusatz: { rc2: "zusatz-rc2", insektenschutz: "zusatz-insektenschutz", rollladenmotor: "zusatz-rollladenmotor", "fensterbank-innen": "zusatz-fensterbank-innen", "fensterbank-aussen": "zusatz-fensterbank-aussen", montage: "zusatz-montage", demontage: "zusatz-demontage" },
    zusatzTuer: { rc2: "zusatz-rc2", fingerprint: "zusatz-rc2", automatikschloss: "zusatz-rc2", oberlicht: "tuer-glasstreifen-weiss" },
  };
  const teil = (gruppe, key) => (MAP[gruppe] && MAP[gruppe][key]) || String(key || "").toLowerCase().replace(/[^a-z0-9]/g, "");

  function Bilder(liste) {
    const bilder = (liste && liste.bilder) || {};
    const hat = (name) => !!(name && bilder[name]);
    const fenster = Object.keys(bilder).filter((k) => /^fenster-/.test(k)).map((k) => { const p = k.split("-"); return { key: k, typ: p[1], farbe: p[2], sprossen: p[3], rollladen: p[4] }; });

    /* Exaktes Fensterfoto oder null */
    /* RAL-Wunschfarbe hat kein eigenes Foto: Karten zeigen ersatzweise Anthrazit, die Vorschau bleibt bei der Zeichnung */
    const ohneFoto = (cfg) => cfg.farbe === "ral";
    function fensterExakt(cfg) {
      if (ohneFoto(cfg)) return null;
      const name = `fenster-${teil("typ", cfg.typ)}-${teil("farbe", cfg.farbe)}-${teil("sprossen", cfg.sprossen || "keine")}-${teil("rollladen", cfg.rollladen || "keiner")}`;
      return hat(name) ? name : null;
    }
    /* Passendstes Fensterfoto: exakt → gleiche Sprossen+Farbe → gleicher Rollladen+Farbe → Farbe → Sprossen → Rollladen → Typ */
    function fensterNaechstes(cfg) {
      const t = teil("typ", cfg.typ), f = teil("farbe", cfg.farbe), s = teil("sprossen", cfg.sprossen || "keine"), r = teil("rollladen", cfg.rollladen || "keiner");
      const exakt = fensterExakt(cfg); if (exakt) return exakt;
      const kand = fenster.filter((b) => b.typ === t);
      if (!kand.length) return null;
      const stufen = [(b) => b.farbe === f && b.sprossen === s, (b) => b.farbe === f && b.rollladen === r, (b) => b.farbe === f, (b) => b.sprossen === s && b.rollladen === r, (b) => b.sprossen === s, (b) => b.rollladen === r];
      for (const st of stufen) { const tr = kand.filter(st).sort(punkte(f, s, r)); if (tr.length) return tr[0].key; }
      return kand.sort(punkte(f, s, r))[0].key;
    }
    /* Ruhige Varianten bevorzugen (weiß, ohne Sprossen, ohne Rollladen), wenn mehrere gleich gut passen */
    function punkte(f, s, r) {
      const score = (b) => (b.farbe === f ? 0 : b.farbe === "weiss" ? 1 : 2) * 100 + (b.sprossen === s ? 0 : b.sprossen === "keine" ? 1 : 2) * 10 + (b.rollladen === r ? 0 : b.rollladen === "kein" ? 1 : 2);
      return (a, b) => score(a) - score(b);
    }
    function tuerExakt(cfg) { if (ohneFoto(cfg)) return null; const name = `tuer-${teil("modell", cfg.modell)}-${teil("farbe", cfg.farbe)}`; return hat(name) ? name : null; }
    function tuerNaechstes(cfg) {
      const ersatz = `tuer-${teil("modell", cfg.modell)}-${teil("farbe", cfg.farbe)}`;
      return tuerExakt(cfg) || [ersatz, `tuer-${teil("modell", cfg.modell)}-weiss`, `tuer-voll-${teil("farbe", cfg.farbe)}`, "tuer-voll-weiss"].find(hat) || null;
    }

    /* Bild für eine Karte. produkt: fenster|haustuer; gruppe: system|typ|farbe|glas|sprossen|rollladen|modell|seitenteil|zusatz;
       id: Schlüssel der Option; eintrag: Objekt aus der Preisliste (für e.bild); state: aktuelle Auswahl */
    function karte(produkt, gruppe, id, eintrag, state) {
      state = state || {};
      const alt = (eintrag && eintrag.bild && hat(eintrag.bild)) ? eintrag.bild : null;
      let name = null;
      if (produkt === "fenster") {
        if (gruppe === "system") name = alt;
        else if (gruppe === "typ") name = fensterNaechstes({ typ: id, farbe: state.farbe || "weiss", sprossen: "keine", rollladen: "keiner" });
        else if (gruppe === "farbe") name = fensterNaechstes({ typ: state.typ || "1-fluegelig", farbe: id, sprossen: state.sprossen || "keine", rollladen: state.rollladen || "keiner" });
        else if (gruppe === "sprossen") name = fensterNaechstes({ typ: state.typ || "1-fluegelig", farbe: state.farbe || "weiss", sprossen: id, rollladen: state.rollladen || "keiner" });
        else if (gruppe === "rollladen") name = fensterNaechstes({ typ: state.typ || "1-fluegelig", farbe: state.farbe || "weiss", sprossen: state.sprossen || "keine", rollladen: id });
        else if (gruppe === "glas") name = MAP.glas[id] || null;
        else if (gruppe === "zusatz") name = MAP.zusatz[id] || null;
      } else {
        if (gruppe === "modell") name = tuerNaechstes({ modell: id, farbe: state.farbe || "weiss" });
        else if (gruppe === "farbe") name = tuerNaechstes({ modell: state.modell || "modern-voll", farbe: id });
        else if (gruppe === "glas") name = MAP.glasTuer[id] || null;
        else if (gruppe === "seitenteil") name = id === "keines" ? tuerNaechstes({ modell: state.modell || "modern-voll", farbe: state.farbe || "weiss" }) : tuerNaechstes({ modell: "mit-seitenteil", farbe: state.farbe || "weiss" });
        else if (gruppe === "zusatz") name = MAP.zusatzTuer[id] || MAP.zusatz[id] || null;
      }
      if (!hat(name)) name = alt;
      return hat(name) ? name : null;
    }
    /* Foto für die Vorschau (nur exakt) */
    function vorschau(produkt, state) { return produkt === "fenster" ? fensterExakt(state) : tuerExakt(state); }
    /* Nachbarvarianten zum Vorladen: je eine Änderung in Farbe/Sprossen/Rollladen/Typ bzw. Modell/Farbe */
    function nachbarn(produkt, state, optionen) {
      const out = new Set();
      const probe = (k, werte) => (werte || []).forEach((v) => { if (v !== state[k]) { const n = vorschau(produkt, Object.assign({}, state, { [k]: v })); if (n) out.add(n); } });
      if (produkt === "fenster") { probe("farbe", optionen.farbe); probe("sprossen", optionen.sprossen); probe("rollladen", optionen.rollladen); probe("typ", optionen.typ); }
      else { probe("farbe", optionen.farbe); probe("modell", optionen.modell); }
      return [...out].slice(0, 12);
    }
    function info(name) { return bilder[name] || null; }
    return { hat, karte, vorschau, nachbarn, info, fensterExakt, fensterNaechstes, tuerExakt, tuerNaechstes, MAP };
  }
  return { Bilder, MAP };
});
