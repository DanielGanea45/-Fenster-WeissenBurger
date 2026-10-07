/* Admin → Produkte: Produktkarten für Startseite und /produkte/ – Titel, Untertitel, Kurztext, Bild (vorhandenes
   Website-Bild oder Upload), „ab Preis“ (optional), Link-Ziel, Sichtbar, Startseite; Reihenfolge per Drag & Drop
   oder Pfeile. Speichern ist versioniert und veröffentlicht automatisch. Nutzt window.FWAdmin. Keine Inline-Styles (CSP). */
(function () {
  "use strict";
  const A = window.FWAdmin; if (!A) return;
  const { $, $$, h, api, toast, bestaetigen, S, setDirty, startPoll, ladeStatus, PV, Steuer } = A;
  const klon = (o) => JSON.parse(JSON.stringify(o));
  const BILD = "/.netlify/functions/admin-bild";
  const SEITEN = [
    ["/produkte/kunststofffenster-koemmerling/", "Kunststofffenster (Kömmerling)"],
    ["/produkte/kunststoff-aluminium-fenster/", "Kunststoff-Aluminium-Fenster"],
    ["/produkte/aluminiumfenster-cortizo/", "Aluminiumfenster (Cortizo)"],
    ["/produkte/haustueren/", "Haustüren"],
    ["/produkte/schiebetueren/", "Hebe-Schiebetüren"],
    ["/produkte/", "Alle Produkte"],
    ["/konfigurator/fenster/", "Fenster-Konfigurator"],
    ["/konfigurator/haustuer/", "Haustür-Konfigurator"],
    ["/leistungen/", "Leistungen"],
  ];
  let P = null, O = null, BILDER = [], fehler = {};
  const dirty = () => JSON.stringify(P) !== JSON.stringify(O);
  const slug = (s) => String(s).toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "karte";
  const bildSrc = (b) => (b && b.blob ? `${BILD}?id=${encodeURIComponent(b.blob)}&g=800` : b && b.src ? "/" + String(b.src).replace(/^\//, "") : "");

  function bildOptionen(k) {
    const aktuell = k.bild && (k.bild.blob ? "blob:" + k.bild.blob : k.bild.src);
    const opts = BILDER.map((b) => `<option value="${h(b.wert)}" ${b.wert === aktuell ? "selected" : ""}>${h(b.label)}</option>`).join("");
    const fremd = aktuell && !BILDER.some((b) => b.wert === aktuell) ? `<option value="${h(aktuell)}" selected>${h(aktuell)}</option>` : "";
    return `<option value="">– Bild wählen –</option>${fremd}${opts}`;
  }
  function karteHtml(k, i, n) {
    const satz = Steuer.satz(S.einst || {});
    const f = (p) => fehler[`karten.${i}.${p}`] || "";
    const row = (p, label, desc, ctl) => `<div class="set-row ${f(p) ? "field--fehler" : ""}"><div class="set-row__text"><label class="set-row__titel" for="pk-${i}-${p}">${h(label)}</label>${desc ? `<span class="set-row__desc">${h(desc)}</span>` : ""}</div><div class="set-row__ctl">${ctl}<span class="fehler-text">${h(f(p))}</span></div></div>`;
    return `<li class="card set-card pkarte ${k.sichtbar === false ? "is-aus" : ""}" draggable="true" data-i="${i}">
      <div class="pkarte__kopf">
        <span class="pkarte__griff" title="Ziehen zum Sortieren" aria-hidden="true">⋮⋮</span>
        <img class="pkarte__bild" src="${h(bildSrc(k.bild))}" alt="" width="56" height="42" loading="lazy">
        <h2>${h(k.titel || "Neue Karte")}</h2>
        <span class="pill ${k.sichtbar === false ? "" : "pill--ok"}">${k.sichtbar === false ? "ausgeblendet" : k.startseite === false ? "nur Produktseite" : "Startseite + Produkte"}</span>
        <span class="row pkarte__tools"><button type="button" class="btn btn--xs" data-pk="hoch" data-i="${i}" ${i === 0 ? "disabled" : ""} aria-label="nach oben">↑</button><button type="button" class="btn btn--xs" data-pk="runter" data-i="${i}" ${i === n - 1 ? "disabled" : ""} aria-label="nach unten">↓</button><button type="button" class="btn btn--xs btn--danger" data-pk="loeschen" data-i="${i}">Löschen</button></span>
      </div>
      ${row("titel", "Titel", "", `<input type="text" id="pk-${i}-titel" class="input" data-k="${i}" data-p="titel" value="${h(k.titel || "")}">`)}
      ${row("untertitel", "Untertitel", "Profile oder Linien, erscheint auf der Produktübersicht", `<input type="text" id="pk-${i}-untertitel" class="input" data-k="${i}" data-p="untertitel" value="${h(k.untertitel || "")}">`)}
      ${row("kurz", "Kurztext", "Ein bis zwei Sätze", `<textarea id="pk-${i}-kurz" class="input" rows="2" data-k="${i}" data-p="kurz">${h(k.kurz || "")}</textarea>`)}
      ${row("bild", "Bild", "Aus den Website-Bildern wählen oder ein neues Bild hochladen", `<select id="pk-${i}-bild" class="input" data-k="${i}" data-p="bild">${bildOptionen(k)}</select><label class="btn btn--xs pkarte__upload">Neues Bild hochladen … <input type="file" accept="image/*,.heic,.heif" data-upload="${i}" class="sr-only"></label>`)}
      ${row("abPreis", "ab Preis", "Optional, in Euro; ohne Angabe erscheint keine Preiszeile. Hinweis auf der Website: „" + Steuer.texte(satz).kurz + "“", `<span class="inline-input"><input type="text" id="pk-${i}-abPreis" class="input" inputmode="decimal" data-k="${i}" data-p="abPreis" value="${k.abPreis == null ? "" : String(k.abPreis).replace(".", ",")}"><span class="einheit">€</span></span>`)}
      ${row("link", "Link-Ziel", "Die ganze Karte verlinkt dorthin", `<select id="pk-${i}-link" class="input" data-k="${i}" data-p="link">${SEITEN.map(([u, l]) => `<option value="${h(u)}" ${k.link === u ? "selected" : ""}>${h(l)}</option>`).join("")}${SEITEN.some(([u]) => u === k.link) ? "" : `<option value="${h(k.link || "")}" selected>${h(k.link || "")}</option>`}</select>`)}
      <div class="set-row"><div class="set-row__text"><span class="set-row__titel">Sichtbar</span><span class="set-row__desc">Aus = Karte erscheint nirgends</span></div><div class="set-row__ctl"><label class="switch"><input type="checkbox" data-k="${i}" data-p="sichtbar" data-typ="bool" ${k.sichtbar === false ? "" : "checked"}><span class="switch__track"></span><span class="sr-only">Sichtbar</span></label></div></div>
      <div class="set-row"><div class="set-row__text"><span class="set-row__titel">Auf der Startseite</span><span class="set-row__desc">Aus = nur auf der Produktübersicht</span></div><div class="set-row__ctl"><label class="switch"><input type="checkbox" data-k="${i}" data-p="startseite" data-typ="bool" ${k.startseite === false ? "" : "checked"}><span class="switch__track"></span><span class="sr-only">Startseite</span></label></div></div>
    </li>`;
  }
  function zeichne(main) {
    const n = P.karten.length;
    main.innerHTML = `<div class="page-head"><div><h1>Produkte</h1><span class="muted">Produktkarten auf der Startseite und unter „Produkte“. Reihenfolge per Ziehen oder Pfeilen; jede Speicherung veröffentlicht die Website neu.</span></div>
        <div class="row"><a class="btn btn--sm" href="/produkte/" target="_blank" rel="noopener">Produktseite ↗</a><button type="button" class="btn btn--sm" data-pk="neu">+ Karte hinzufügen</button></div></div>
      <ul class="stack pkarten" id="pkarten">${P.karten.map((k, i) => karteHtml(k, i, n)).join("")}</ul>
      <div class="set-footer"><span class="small muted">Nach dem Speichern wird die Website automatisch neu veröffentlicht.</span><span class="row"><button type="button" class="btn btn--sm" data-pk="verwerfen" ${dirty() ? "" : "disabled"}>Verwerfen</button><button type="button" class="btn btn--sm btn--primary" data-pk="speichern" ${dirty() ? "" : "disabled"}>Speichern</button></span></div>`;
  }
  function lies(main) {
    $$("[data-k][data-p]", main).forEach((el) => {
      const k = P.karten[Number(el.dataset.k)]; if (!k) return; const p = el.dataset.p;
      if (el.dataset.typ === "bool") k[p] = !!el.checked;
      else if (p === "abPreis") { const t = String(el.value).trim().replace(/\./g, "").replace(",", "."); k.abPreis = t === "" ? null : (isFinite(Number(t)) ? Number(t) : el.value); }
      else if (p === "bild") { const v = el.value; if (!v) k.bild = null; else if (v.startsWith("blob:")) { const b = BILDER.find((x) => x.wert === v); k.bild = { blob: v.slice(5), groessen: b ? b.groessen : [800], breite: b ? b.breite : 800, hoehe: b ? b.hoehe : 600, alt: (b && b.alt) || k.titel }; } else { const b = BILDER.find((x) => x.wert === v); k.bild = b ? { src: b.src, srcset: b.srcset, breite: b.breite, hoehe: b.hoehe, alt: b.alt || k.titel } : { src: v, alt: k.titel }; } }
      else k[p] = String(el.value);
    });
  }
  async function speichern(main) {
    lies(main);
    P.karten.forEach((k) => { if (!k.id) k.id = slug(k.titel); });
    const f = PV.validiereProdukte(P);
    fehler = {}; f.forEach((x) => { fehler[x.feld] = x.meldung; });
    if (f.length) { zeichne(main); toast("Bitte die markierten Felder prüfen.", "err"); return; }
    const r = await api.post("speichern", { bereich: "produkte", daten: { karten: P.karten }, beschreibung: "Produktkarten geändert", veroeffentlichen: true });
    if (!r.ok) { if (r.fehler) { r.fehler.forEach((x) => { fehler[x.feld] = x.meldung; }); zeichne(main); } toast(r.error || "Speichern fehlgeschlagen.", "err"); return; }
    O = klon(P); setDirty(false); toast("Produktkarten gespeichert.", "ok");
    if (r.veroeffentlichung) { if (r.veroeffentlichung.ok) { S.pub = r.veroeffentlichung.veroeffentlichung; startPoll(); toast("Veröffentlichung gestartet.", "ok"); } else toast(r.veroeffentlichung.error, r.veroeffentlichung.uebersprungen ? "" : "err"); }
    await ladeStatus(); zeichne(main);
  }
  /* Upload wie auf der Bilder-Seite: Datei → WebP (800/1600) → Server; danach als Kartenbild gewählt */
  async function hochladen(main, i, file) {
    if (!A.bildVerarbeiten) { toast("Bild-Upload ist hier nicht verfügbar – bitte unter „Bilder“ hochladen.", "err"); return; }
    try {
      toast("Bild wird optimiert …");
      const bild = await A.bildVerarbeiten(file, () => {});
      const titel = P.karten[i].titel || file.name.replace(/\.[^.]+$/, "");
      const r = await api.post("bild-hochladen", { dateien: bild.dateien, breite: bild.breite, hoehe: bild.hoehe, titel, alt: titel + " – Produktbild", sektion: "produkte" });
      if (!r.ok) throw new Error(r.error || "Upload fehlgeschlagen");
      BILDER.unshift({ wert: "blob:" + r.id, label: "Hochgeladen: " + titel, groessen: Object.keys(bild.dateien).map(Number), breite: bild.breite, hoehe: bild.hoehe, alt: titel + " – Produktbild" });
      lies(main); P.karten[i].bild = { blob: r.id, groessen: Object.keys(bild.dateien).map(Number), breite: bild.breite, hoehe: bild.hoehe, alt: titel + " – Produktbild" };
      setDirty(true); zeichne(main); toast("Bild hochgeladen – jetzt speichern.", "ok");
    } catch (e) { toast(e.message, "err"); }
  }

  A.VIEWS.produkte = async (main) => {
    const [dp, db, de] = await Promise.all([api.get("daten", { bereich: "produkte" }), api.get("daten", { bereich: "bilder" }), api.get("daten", { bereich: "einstellungen" })]);
    if (!dp.ok) throw new Error(dp.error);
    P = klon(dp.daten); O = klon(dp.daten); if (de.ok) S.einst = de.daten; fehler = {};
    if (!Array.isArray(P.karten)) P.karten = [];
    BILDER = [];
    if (db.ok) for (const [id, b] of Object.entries(db.daten.bilder || {})) {
      if (b.geloescht) continue;
      if (b.blob) BILDER.push({ wert: "blob:" + id, label: "Hochgeladen: " + (b.titel || id), groessen: b.groessen || [800], breite: b.breite, hoehe: b.hoehe, alt: b.alt });
      else BILDER.push({ wert: b.src, label: (b.titel || b.alt || b.src) + " (" + (b.seite || "") + ")", src: b.src, srcset: b.srcset, breite: b.breite, hoehe: b.hoehe, alt: b.alt });
    }
    for (const k of P.karten) if (k.bild && k.bild.src && !BILDER.some((b) => b.wert === k.bild.src)) BILDER.push({ wert: k.bild.src, label: k.bild.alt || k.bild.src, src: k.bild.src, srcset: k.bild.srcset, breite: k.bild.breite, hoehe: k.bild.hoehe, alt: k.bild.alt });
    zeichne(main);
    main.oninput = () => { lies(main); setDirty(dirty()); $$("[data-pk=speichern],[data-pk=verwerfen]", main).forEach((b) => { b.disabled = !dirty(); }); };
    main.onchange = async (e) => { const up = e.target.closest("[data-upload]"); if (up && up.files && up.files[0]) { await hochladen(main, Number(up.dataset.upload), up.files[0]); return; } if (e.target.dataset.p === "bild" || e.target.dataset.typ === "bool") { lies(main); zeichne(main); setDirty(dirty()); } };
    main.onclick = async (e) => {
      const b = e.target.closest("[data-pk]"); if (!b) return;
      lies(main);
      const i = Number(b.dataset.i), art = b.dataset.pk;
      if (art === "neu") { P.karten.push({ id: "", titel: "", untertitel: "", kurz: "", bild: null, abPreis: null, link: SEITEN[0][0], sichtbar: true, startseite: true }); }
      else if (art === "loeschen") { if (!(await bestaetigen("Karte löschen", `„${P.karten[i].titel || "Neue Karte"}“ wird aus Startseite und Produktübersicht entfernt (wirksam nach dem Speichern).`, "Löschen", true))) return; P.karten.splice(i, 1); }
      else if (art === "hoch" && i > 0) { [P.karten[i - 1], P.karten[i]] = [P.karten[i], P.karten[i - 1]]; }
      else if (art === "runter" && i < P.karten.length - 1) { [P.karten[i + 1], P.karten[i]] = [P.karten[i], P.karten[i + 1]]; }
      else if (art === "verwerfen") { P = klon(O); fehler = {}; setDirty(false); }
      else if (art === "speichern") { await speichern(main); return; }
      setDirty(dirty()); zeichne(main);
    };
    /* Drag & Drop */
    let von = null;
    main.addEventListener("dragstart", (e) => { const li = e.target.closest(".pkarte"); if (!li) return; von = Number(li.dataset.i); e.dataTransfer.effectAllowed = "move"; li.classList.add("is-drag"); });
    main.addEventListener("dragover", (e) => { if (e.target.closest(".pkarte")) e.preventDefault(); });
    main.addEventListener("drop", (e) => { const li = e.target.closest(".pkarte"); if (!li || von === null) return; e.preventDefault(); const bis = Number(li.dataset.i); if (bis !== von) { lies(main); const [k] = P.karten.splice(von, 1); P.karten.splice(bis, 0, k); setDirty(dirty()); zeichne(main); } von = null; });
    main.addEventListener("dragend", () => { $$(".is-drag", main).forEach((x) => x.classList.remove("is-drag")); von = null; });
  };
})();
