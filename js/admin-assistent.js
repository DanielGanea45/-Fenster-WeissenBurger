/* Admin → Assistent: Schalter an/aus, Monatsbudget und Tageslimit, Verbrauch des Monats, blockierte Anfragen,
   Gespräche (ohne IP; Kontaktdaten nur, wenn bei der Übergabe hinterlassen; Löschung nach 90 Tagen), Wissen (Frage/Antwort).
   Nutzt window.FWAdmin. Keine Inline-Stile (CSP). Keine technischen Begriffe in den Texten. */
(function () {
  "use strict";
  const A = window.FWAdmin; if (!A) return;
  const { $, $$, h, api, toast, bestaetigen, modal, S, fmtDT, euro } = A;
  const klon = (o) => JSON.parse(JSON.stringify(o));
  const eur = (x) => (Math.round((Number(x) || 0) * 100) / 100).toFixed(2).replace(".", ",") + " €";

  A.VIEWS.assistent = async (main, sub) => {
    const d = await api.get("assistent-uebersicht");
    if (!d.ok) throw new Error(d.error);
    const e = d.einstellungen || {};
    const st = d.stand || {};
    const wissen = Array.isArray(d.wissen) ? klon(d.wissen) : [];
    const prozent = (a, b) => (b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 0);
    const balken = (p) => `<span class="konf-bar"><i class="konf-bar__fill konf-bar__fill--p${Math.round(p / 5) * 5}"></i></span>`;
    main.innerHTML = `<div class="page-head"><div><h1>Assistent</h1><span class="muted">„Daniel – Ihr digitaler Assistent“ (KI) beantwortet Fragen auf der Website ausschließlich mit Inhalten der Website, berechnet Richtpreise über den Preisrechner und leitet Anfragen an Sie weiter. ${d.schluessel ? "" : "<b>Er ist derzeit nicht geschaltet: Die Zugangsdaten zum KI-Dienst sind noch nicht hinterlegt – das übernimmt die technische Betreuung.</b>"}</span></div></div>
      <div class="grid grid--2">
        <section class="card"><h2>Schalter &amp; Grenzen</h2>
          <div class="set-row"><div class="set-row__text"><label class="set-row__titel" for="as-aktiv">Assistent auf der Website anzeigen</label><span class="set-row__desc">Aus = kein Knopf auf der Website (wirkt nach „Speichern &amp; veröffentlichen“).</span></div><div class="set-row__ctl"><label class="switch"><input type="checkbox" id="as-aktiv" ${e.aktiv !== false ? "checked" : ""}><span class="switch__track"></span><span class="sr-only">Assistent an</span></label></div></div>
          <div class="set-row"><div class="set-row__text"><label class="set-row__titel" for="as-monat">Monatsbudget</label><span class="set-row__desc">Geschätzte Kosten je Monat; bei Erreichen pausiert der Assistent bis zum Monatsende und zeigt Ihre Kontaktdaten. 0 = ohne Grenze.</span></div><div class="set-row__ctl"><span class="inline-input"><input type="text" id="as-monat" class="input" inputmode="decimal" value="${h(String(e.monatslimitEuro == null ? 20 : e.monatslimitEuro).replace(".", ","))}"><span class="einheit">€</span></span></div></div>
          <div class="set-row"><div class="set-row__text"><label class="set-row__titel" for="as-tag">Nachrichten pro Tag (alle Besucher)</label><span class="set-row__desc">Bei Erreichen pausiert der Assistent bis zum nächsten Tag. 0 = ohne Grenze.</span></div><div class="set-row__ctl"><span class="inline-input"><input type="text" id="as-tag" class="input" inputmode="numeric" value="${h(String(e.tageslimit == null ? 200 : e.tageslimit))}"><span class="einheit">Nachrichten</span></span></div></div>
          <div class="set-row"><div class="set-row__text"><label class="set-row__titel" for="as-alarm">Warnung per E-Mail an</label><span class="set-row__desc">Bei 80 % des Tages- oder Monatslimits; leer = Adresse für Anfragen.</span></div><div class="set-row__ctl"><input type="email" id="as-alarm" class="input" value="${h(e.alarmEmail || "")}"></div></div>
          <div class="row"><button type="button" class="btn btn--primary" id="as-speichern">Speichern &amp; veröffentlichen</button></div>
        </section>
        <section class="card"><h2>Verbrauch</h2>
          <div class="kpis kpis--2">
            <div class="kpi"><span class="kpi__l">Dieser Monat (geschätzt)</span><span class="kpi__v">${eur(st.monatKosten)}</span><span class="kpi__s">von ${e.monatslimitEuro ? eur(e.monatslimitEuro) : "ohne Grenze"} · ${st.monatNachrichten || 0} Nachrichten</span>${e.monatslimitEuro ? balken(prozent(st.monatKosten || 0, e.monatslimitEuro)) : ""}</div>
            <div class="kpi"><span class="kpi__l">Heute</span><span class="kpi__v">${st.tagNachrichten || 0}</span><span class="kpi__s">von ${e.tageslimit ? e.tageslimit : "ohne Grenze"} Nachrichten</span>${e.tageslimit ? balken(prozent(st.tagNachrichten || 0, e.tageslimit)) : ""}</div>
            <div class="kpi"><span class="kpi__l">Blockierte Anfragen (Monat)</span><span class="kpi__v">${st.monatBlockiert || 0}</span><span class="kpi__s">Bots, zu schnelle oder fremde Aufrufe</span></div>
            <div class="kpi"><span class="kpi__l">Gespräche (90 Tage)</span><span class="kpi__v">${st.gespraeche || 0}</span><span class="kpi__s">${st.uebergaben || 0} an Sie weitergeleitet</span></div>
          </div>
          <p class="small muted">Modell: ${h(d.modell || "–")}. Gespräche werden ohne IP-Adresse gespeichert und nach 90 Tagen automatisch gelöscht.</p>
        </section>
      </div>
      <section class="card"><div class="row row--between"><h2>Wissen für den Assistenten</h2><button type="button" class="btn btn--sm" id="w-neu">Eintrag hinzufügen</button></div>
        <p class="muted small">Fragen und Antworten, die der Assistent zusätzlich zu den Website-Texten kennen soll (z. B. Anfahrt, Zahlungsweise, Ablauf). Nur Fakten, die Sie zusagen können – der Assistent gibt sie wörtlich weiter. Wirkt nach „Speichern &amp; veröffentlichen“.</p>
        <div class="stack" id="w-liste"></div>
        <div class="row"><button type="button" class="btn btn--primary" id="w-speichern">Wissen speichern &amp; veröffentlichen</button></div>
      </section>
      <section class="card"><h2>Gespräche</h2><div class="stack" id="k-liste"><div class="skelett-zeile"></div></div><div class="row row--between" id="k-seiten"></div></section>`;

    /* Einstellungen speichern */
    $("#as-speichern").addEventListener("click", async () => {
      const monat = Number(String($("#as-monat").value).replace(",", "."));
      const tag = Number($("#as-tag").value);
      const r = await api.post("speichern", { bereich: "einstellungen", daten: { assistent: { aktiv: $("#as-aktiv").checked, monatslimitEuro: isFinite(monat) ? monat : 20, tageslimit: isFinite(tag) ? Math.round(tag) : 200, alarmEmail: $("#as-alarm").value.trim() } }, beschreibung: "Assistent: Schalter/Grenzen", veroeffentlichen: true });
      if (!r.ok) return toast(r.fehler && r.fehler[0] ? r.fehler[0].meldung : r.error, "err");
      toast("Gespeichert – die Website wird veröffentlicht.", "ok");
      A.startPoll && A.startPoll();
    });

    /* Wissen */
    const zeichneWissen = () => {
      $("#w-liste").innerHTML = wissen.map((w, i) => `<div class="card card--flach wissen" data-i="${i}">
        <label class="field">Frage oder Stichwort<input type="text" class="input" data-w="frage" value="${h(w.frage || "")}" maxlength="300" placeholder="z. B. Wie läuft das Aufmaß ab?"></label>
        <label class="field">Antwort<textarea class="input" rows="3" data-w="antwort" maxlength="2000" placeholder="Kurz und sachlich – so gibt der Assistent es weiter.">${h(w.antwort || "")}</textarea></label>
        <div class="row row--between"><label class="switch switch--inline"><input type="checkbox" data-w="aktiv" ${w.aktiv !== false ? "checked" : ""}><span class="switch__track"></span><span class="small">aktiv</span></label><button type="button" class="btn btn--xs btn--danger" data-w-loeschen="${i}">Entfernen</button></div>
      </div>`).join("") || '<p class="muted">Noch keine Einträge – der Assistent nutzt dann nur die Website-Texte, Preisliste und Firmendaten.</p>';
    };
    const lesen = () => { $$("#w-liste .wissen").forEach((k) => { const i = Number(k.dataset.i); wissen[i].frage = k.querySelector("[data-w=frage]").value; wissen[i].antwort = k.querySelector("[data-w=antwort]").value; wissen[i].aktiv = k.querySelector("[data-w=aktiv]").checked; }); };
    zeichneWissen();
    $("#w-neu").addEventListener("click", () => { lesen(); wissen.push({ id: "w-" + Date.now().toString(36), frage: "", antwort: "", aktiv: true }); zeichneWissen(); const f = $$("#w-liste [data-w=frage]"); if (f.length) f[f.length - 1].focus(); });
    $("#w-liste").addEventListener("click", (e) => { const b = e.target.closest("[data-w-loeschen]"); if (!b) return; lesen(); wissen.splice(Number(b.dataset.wLoeschen), 1); zeichneWissen(); });
    $("#w-speichern").addEventListener("click", async () => {
      lesen();
      const r = await api.post("speichern", { bereich: "wissen", daten: wissen, beschreibung: "Assistent: Wissen", veroeffentlichen: true });
      if (!r.ok) { if (r.fehler && r.fehler[0]) { const m = /wissen\.(\d+)\./.exec(r.fehler[0].feld); if (m) { const k = $$("#w-liste .wissen")[Number(m[1])]; if (k) { k.classList.add("field--fehler"); k.scrollIntoView({ block: "center" }); } } } return toast(r.fehler && r.fehler[0] ? r.fehler[0].meldung : r.error, "err"); }
      toast("Wissen gespeichert – die Website wird veröffentlicht.", "ok");
      A.startPoll && A.startPoll();
    });

    /* Gespräche */
    let seite = 1;
    const ladeGespraeche = async () => {
      const g = await api.get("assistent-gespraeche", { seite, proSeite: 20 });
      if (!g.ok) { $("#k-liste").innerHTML = `<div class="alert alert--err">${h(g.error)}</div>`; return; }
      $("#k-liste").innerHTML = g.gespraeche.map((k) => `<div class="card card--flach gespraech"><div class="row row--between"><div><b>${fmtDT(k.start)}</b> · ${k.anzahl} Nachricht(en) · ${eur(k.kosten)}${k.uebergabe ? ` · <span class="badge badge--ok">an Sie weitergeleitet${k.uebergabe.name ? ": " + h(k.uebergabe.name) : ""}</span>` : ""}${k.verdacht ? ' · <span class="badge badge--warn">Verdacht</span>' : ""}</div><div class="row"><button type="button" class="btn btn--xs" data-k-zeigen="${h(k.id)}">Anzeigen</button><button type="button" class="btn btn--xs btn--danger" data-k-loeschen="${h(k.id)}">Löschen</button></div></div><p class="small muted">${h((k.erste || "").slice(0, 160))}${k.seite ? " · Seite " + h(k.seite) : ""}</p></div>`).join("") || '<p class="muted">Noch keine Gespräche.</p>';
      const seiten = Math.max(1, Math.ceil(g.gesamt / g.proSeite));
      $("#k-seiten").innerHTML = `<span class="small muted">${g.gesamt} Gespräch(e)</span>${seiten > 1 ? `<span class="row"><button type="button" class="btn btn--xs" data-k-seite="${seite - 1}" ${seite <= 1 ? "disabled" : ""}>Zurück</button><span class="small">${seite} / ${seiten}</span><button type="button" class="btn btn--xs" data-k-seite="${seite + 1}" ${seite >= seiten ? "disabled" : ""}>Weiter</button></span>` : ""}`;
    };
    main.addEventListener("click", async (e) => {
      const s = e.target.closest("[data-k-seite]"); if (s) { seite = Number(s.dataset.kSeite); ladeGespraeche(); return; }
      const z = e.target.closest("[data-k-zeigen]");
      if (z) {
        const g = await api.get("assistent-gespraech", { id: z.dataset.kZeigen });
        if (!g.ok) return toast(g.error, "err");
        const k = g.gespraech;
        const html = `<div class="verlauf">${(k.nachrichten || []).map((m) => `<p class="verlauf__${m.rolle === "nutzer" ? "nutzer" : "assistent"}"><b>${m.rolle === "nutzer" ? "Besucher" : "Daniel (KI)"}:</b> ${h(m.text)}</p>`).join("")}</div>
          <p class="small muted">Begonnen ${fmtDT(k.start)} · ${k.anzahl} Nachricht(en) · Kosten ${eur(k.kosten)} · ${k.werkzeuge || 0} Werkzeugaufruf(e)${k.uebergabe ? ` · Übergabe an Sie: ${h([k.uebergabe.name, k.uebergabe.telefon, k.uebergabe.email, k.uebergabe.plz].filter(Boolean).join(", "))}` : ""}</p>`;
        await modal({ titel: "Gespräch", html, ok: "Schließen", abbrechen: "" });
        return;
      }
      const l = e.target.closest("[data-k-loeschen]");
      if (l) {
        if (!(await bestaetigen("Gespräch löschen?", "Das Gespräch wird endgültig entfernt.", "Löschen", true))) return;
        const r = await api.post("assistent-gespraech-loeschen", { id: l.dataset.kLoeschen });
        if (!r.ok) return toast(r.error, "err");
        toast("Gelöscht.", "ok"); ladeGespraeche();
      }
    });
    await ladeGespraeche();
  };
})();
