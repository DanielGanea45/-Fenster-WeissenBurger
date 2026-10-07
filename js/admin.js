/* Fenster-WeissenBurger – Admin-Oberfläche (/admin/). Eine Seite, Bereiche per #hash.
   Spricht mit den Netlify Functions admin-auth und admin-api (Sitzung im httpOnly-Cookie, CSRF-Header).
   Keine Inline-Styles (CSP), keine Fremddienste. Preisrechner: dasselbe js/preis.js wie auf der Website. */
(function () {
  "use strict";
  const AUTH = "/.netlify/functions/admin-auth";
  const API = "/.netlify/functions/admin-api";
  const BILD = "/.netlify/functions/admin-bild";
  const Preis = window.FWPreis;
  const Steuer = window.FWSteuer;
  const PV = window.FWPreisValidate;

  /* ---------- Hilfen ---------- */
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const h = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtDT = (t) => (t ? new Date(t).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "–");
  const fmtD = (t) => (t ? new Date(t).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "–");
  const euro = (c) => Preis.euro(c);
  const zahl = (s) => { if (typeof s === "number") return s; const t = String(s == null ? "" : s).trim().replace(/\./g, "").replace(",", "."); if (t === "") return null; const n = Number(t.replace(/[^\d.-]/g, "")); return isFinite(n) ? n : NaN; };
  const dez = (n) => (n == null || n === "" ? "" : String(n).replace(".", ","));
  const klon = (o) => JSON.parse(JSON.stringify(o));
  const getP = (o, p) => p.split(".").reduce((a, k) => (a == null ? a : a[k]), o);
  const setP = (o, p, v) => { const ks = p.split("."); let a = o; for (let i = 0; i < ks.length - 1; i++) { if (a[ks[i]] == null || typeof a[ks[i]] !== "object") a[ks[i]] = {}; a = a[ks[i]]; } a[ks[ks.length - 1]] = v; };
  const delP = (o, p) => { const ks = p.split("."); let a = o; for (let i = 0; i < ks.length - 1; i++) { a = a && a[ks[i]]; } if (a) delete a[ks[ks.length - 1]]; };
  const slug = (s) => String(s).toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "neu";

  const S = { csrf: null, name: "", email: "", kontext: "", pub: null, dirty: false, tab: "fenster", seite: "startseite", bildFilter: "alle", bildId: null, pollTimer: null, test: null, konto: null, hooks: {} };

  /* ---------- Toast & Modal ---------- */
  function toast(text, art) { const t = document.createElement("div"); t.className = "toast" + (art ? " toast--" + art : ""); t.textContent = text; $("#toasts").appendChild(t); setTimeout(() => t.remove(), art === "err" ? 7000 : 4000); }
  function modal({ titel, text, html, ok = "OK", abbrechen = "Abbrechen", gefaehrlich = false, feld = null }) {
    return new Promise((resolve) => {
      const m = $("#modal");
      m.innerHTML = `<div class="modal__box"><h2>${h(titel)}</h2>${text ? `<p>${h(text)}</p>` : ""}${html || ""}${feld ? `<label class="field">${h(feld.label)}<input type="${feld.typ || "text"}" id="modal-feld" autocomplete="${feld.autocomplete || "off"}" value="${h(feld.wert || "")}"></label>` : ""}<div class="modal__actions">${abbrechen ? `<button type="button" class="btn" data-m="nein">${h(abbrechen)}</button>` : ""}<button type="button" class="btn ${gefaehrlich ? "btn--danger" : "btn--primary"}" data-m="ja">${h(ok)}</button></div></div>`;
      m.hidden = false;
      const schluss = (v) => { m.hidden = true; m.innerHTML = ""; document.removeEventListener("keydown", esc); resolve(v); };
      const esc = (e) => { if (e.key === "Escape") schluss(null); };
      document.addEventListener("keydown", esc);
      m.onclick = (e) => { const b = e.target.closest("[data-m]"); if (!b) { if (e.target === m) schluss(null); return; } if (b.dataset.m === "ja") schluss(feld ? $("#modal-feld").value : true); else schluss(null); };
      const f = $("#modal-feld"); if (f) { f.focus(); f.addEventListener("keydown", (e) => { if (e.key === "Enter") schluss(f.value); }); } else $("[data-m=ja]", m).focus();
    });
  }
  const bestaetigen = (titel, text, ok, gefaehrlich) => modal({ titel, text, ok: ok || "Ja, fortfahren", gefaehrlich });

  /* ---------- API ---------- */
  async function call(url, { method = "GET", body, query } = {}) {
    const u = query ? url + "?" + new URLSearchParams(query).toString() : url;
    const opt = { method, credentials: "same-origin", headers: { Accept: "application/json" } };
    if (body !== undefined) { opt.headers["Content-Type"] = "application/json"; opt.body = JSON.stringify(body); }
    if (method !== "GET" && S.csrf) opt.headers["X-CSRF"] = S.csrf;
    let r, j;
    try { r = await fetch(u, opt); } catch (e) { throw new Error("Keine Verbindung zum Server."); }
    const roh = await r.text().catch(() => "");
    try { j = JSON.parse(roh); } catch (e) { j = { ok: false, error: r.status === 404 ? "Admin-Bereich nicht verfügbar (404)." : "Unerwartete Serverantwort (" + r.status + ")" + (roh && !/^\s*</.test(roh) ? ": " + roh.slice(0, 200) : ".") }; }
    if (j && j.ok === false && !j.error) j.error = "Fehler ohne Beschreibung (HTTP " + r.status + ").";
    if (r.status === 401 && j.anmelden) { zeigeAuth(); throw new Error("Sitzung abgelaufen – bitte erneut anmelden."); }
    j.status = r.status;
    return j;
  }
  const api = { get: (aktion, query) => call(API, { query: Object.assign({ aktion }, query || {}) }), post: (aktion, body) => call(API, { method: "POST", body: Object.assign({ aktion }, body || {}) }), auth: (aktion, body) => call(AUTH, { method: "POST", body: Object.assign({ aktion }, body || {}) }) };
  function ladeScript(src) { return new Promise((res, rej) => { if ($(`script[src="${src}"]`)) return res(); const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("Skript nicht geladen: " + src)); document.head.appendChild(s); }); }

  /* ====================================================================
     Anmeldung, Einrichtung, Passwort zurücksetzen, E-Mail bestätigen
     ==================================================================== */
  function zeigeAuth() { $("#app").hidden = true; $("#auth").hidden = false; stopPoll(); }
  function zeigeApp() { $("#auth").hidden = true; $("#app").hidden = false; }
  const fehlerBox = (msg) => (msg ? `<div class="alert alert--err" role="alert">${h(msg)}</div>` : "");

  function authForm(html) { $("#auth-form").innerHTML = html; const f = $("#auth-form input:not([type=checkbox]):not([type=hidden])"); if (f) f.focus(); }
  function loginForm(opts = {}) {
    authForm(`<form id="f-login" novalidate>
      <div class="stack">
        <h2>Anmelden</h2>
        ${fehlerBox(opts.fehler)}
        ${opts.hinweis ? `<div class="alert alert--ok">${h(opts.hinweis)}</div>` : ""}
        <label class="field">E-Mail<input type="email" name="email" autocomplete="username" required value="${h(opts.email || "")}"></label>
        <label class="field">Passwort<input type="password" name="passwort" autocomplete="current-password" required></label>
        ${opts.zweiFaktor ? `<label class="field">Code aus der Authenticator-App<input type="text" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]*" maxlength="7" required></label>` : ""}
        <label class="check"><input type="checkbox" name="merken"> Angemeldet bleiben (30 Tage)</label>
        <button type="submit" class="btn btn--primary">Anmelden</button>
        <button type="button" class="btn btn--link center" data-auth="vergessen">Passwort vergessen?</button>
        <p class="small muted" class="center">Nach 5 Fehlversuchen wird der Zugang für 15 Minuten gesperrt.</p>
      </div></form>`);
    $("#f-login").addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const btn = $("button[type=submit]", e.target); btn.setAttribute("aria-busy", "true");
      try {
        const r = await api.auth("anmelden", { email: fd.get("email"), passwort: fd.get("passwort"), code: fd.get("code") || "", merken: !!fd.get("merken") });
        if (r.ok) { S.csrf = r.csrf; await starteApp(); return; }
        loginForm({ fehler: r.error, email: fd.get("email"), zweiFaktor: r.zweiFaktor });
        if (r.zweiFaktor) { const c = $("#f-login [name=code]"); $("#f-login [name=passwort]").value = fd.get("passwort"); c && c.focus(); }
      } catch (err) { loginForm({ fehler: err.message, email: fd.get("email") }); }
    });
  }
  function vergessenForm(opts = {}) {
    authForm(`<form id="f-vergessen" novalidate><div class="stack">
      <h2>Passwort vergessen</h2>
      <p class="muted">Wir senden Ihnen einen Link, mit dem Sie 30 Minuten lang ein neues Passwort festlegen können.</p>
      ${fehlerBox(opts.fehler)}${opts.hinweis ? `<div class="alert alert--ok">${h(opts.hinweis)}${opts.link ? `<br><a href="${h(opts.link)}">${h(opts.link)}</a>` : ""}</div>` : ""}
      <label class="field">E-Mail<input type="email" name="email" autocomplete="username" required value="${h(opts.email || "")}"></label>
      <button type="submit" class="btn btn--primary">Link senden</button>
      <button type="button" class="btn btn--link center" data-auth="login">Zurück zur Anmeldung</button>
    </div></form>`);
    $("#f-vergessen").addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = new FormData(e.target).get("email");
      try { const r = await api.auth("passwort-vergessen", { email }); vergessenForm({ email, hinweis: r.hinweis, link: r.link, fehler: r.ok ? "" : r.error }); }
      catch (err) { vergessenForm({ email, fehler: err.message }); }
    });
  }
  function neuesPasswortForm(token, opts = {}) {
    authForm(`<form id="f-neu" novalidate><div class="stack">
      <h2>Neues Passwort</h2>
      ${fehlerBox(opts.fehler)}
      <label class="field">Neues Passwort (mind. 12 Zeichen)<input type="password" name="p1" autocomplete="new-password" minlength="12" required></label>
      <label class="field">Wiederholen<input type="password" name="p2" autocomplete="new-password" required></label>
      <button type="submit" class="btn btn--primary">Passwort speichern</button>
    </div></form>`);
    $("#f-neu").addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      if (fd.get("p1") !== fd.get("p2")) return neuesPasswortForm(token, { fehler: "Die Passwörter stimmen nicht überein." });
      const r = await api.auth("passwort-neu", { token, passwort: fd.get("p1") });
      if (r.ok) { history.replaceState(null, "", "/admin/"); loginForm({ hinweis: "Passwort gespeichert. Bitte melden Sie sich mit dem neuen Passwort an." }); }
      else neuesPasswortForm(token, { fehler: r.error });
    });
  }
  function einrichtenForm(token, opts = {}) {
    authForm(`<form id="f-setup" novalidate><div class="stack">
      <h2>Konto einrichten</h2>
      <p class="muted">Einmalige Einrichtung des Zugangs. Danach ist dieser Link verbraucht.</p>
      ${fehlerBox(opts.fehler)}
      <label class="field">Ihr Name<input type="text" name="name" autocomplete="name" value="${h(opts.name || "Daniel")}"></label>
      <label class="field">E-Mail (Anmeldung &amp; Benachrichtigungen)<input type="email" name="email" autocomplete="username" required value="${h(opts.email || "")}"></label>
      <label class="field">Passwort (mind. 12 Zeichen)<input type="password" name="p1" autocomplete="new-password" minlength="12" required></label>
      <label class="field">Passwort wiederholen<input type="password" name="p2" autocomplete="new-password" required></label>
      <button type="submit" class="btn btn--primary">Konto anlegen</button>
    </div></form>`);
    $("#f-setup").addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      if (fd.get("p1") !== fd.get("p2")) return einrichtenForm(token, { fehler: "Die Passwörter stimmen nicht überein.", name: fd.get("name"), email: fd.get("email") });
      const btn = $("button[type=submit]", e.target); btn.disabled = true; btn.textContent = "Wird gespeichert …";
      const zurueck = (fehler) => einrichtenForm(token, { fehler: "Konto konnte nicht gespeichert werden: " + fehler, name: fd.get("name"), email: fd.get("email") });
      try {
        const tokenRoh = (location.search.match(/[?&]token=([^&#]*)/) || [])[1]; // undekodierter Wert aus der URL („+“ bleibt „+“)
        const r = await api.auth("einrichten", { token: String(token || "").trim(), tokenRoh, name: fd.get("name"), email: fd.get("email"), passwort: fd.get("p1") });
        if (!r.ok) return zurueck(r.error || ("Serverantwort " + r.status + " ohne Fehlertext"));
        /* Persistenz prüfen: Der Server muss das Konto jetzt dauerhaft kennen (Netlify Blobs). */
        const st = await call(AUTH);
        if (!st.eingerichtet) return zurueck("Der Server hat das Konto nicht dauerhaft gespeichert (Datenspeicher Netlify Blobs nicht erreichbar). Bitte den Entwickler informieren – der Einrichtungslink bleibt gültig.");
        S.csrf = r.csrf; history.replaceState(null, "", "/admin/#konto"); toast("Konto angelegt. Willkommen!", "ok"); await starteApp();
      } catch (err) { zurueck(err.message); }
    });
  }
  $("#auth-form").addEventListener("click", (e) => { const b = e.target.closest("[data-auth]"); if (!b) return; if (b.dataset.auth === "vergessen") vergessenForm(); if (b.dataset.auth === "login") loginForm(); });

  async function start() {
    const q = new URLSearchParams(location.search);
    let st;
    try { st = await call(AUTH); } catch (e) { zeigeAuth(); authForm(`<div class="stack"><h2>Nicht erreichbar</h2>${fehlerBox(e.message)}</div>`); return; }
    if (st.status === 404) { zeigeAuth(); authForm(`<div class="stack"><h2>Admin nicht aktiviert</h2><div class="alert alert--info">Der Admin-Bereich ist auf dieser Website noch nicht freigeschaltet. Die Freischaltung übernimmt die technische Betreuung (Einrichtungsschlüssel beim Hosting hinterlegen).</div></div>`); return; }
    S.kontext = st.kontext || "";
    if (q.get("reset")) { zeigeAuth(); return neuesPasswortForm(q.get("reset")); }
    if (q.get("email")) {
      const r = await api.auth("email-bestaetigen", { token: q.get("email") });
      history.replaceState(null, "", "/admin/");
      if (st.angemeldet) { S.csrf = st.csrf; toast(r.ok ? "Neue E-Mail-Adresse aktiv: " + r.email : r.error, r.ok ? "ok" : "err"); return starteApp(); }
      zeigeAuth(); return loginForm(r.ok ? { hinweis: "Neue E-Mail-Adresse bestätigt: " + r.email + ". Bitte damit anmelden.", email: r.email } : { fehler: r.error });
    }
    if (!st.eingerichtet) {
      zeigeAuth();
      if (q.get("token")) return einrichtenForm(q.get("token"));
      return authForm(`<div class="stack"><h2>Noch kein Konto</h2><div class="alert alert--info">Der Zugang wird einmalig über den Einrichtungslink angelegt:<br><code>/admin/?token=…</code><br>Den Link erhalten Sie von der technischen Betreuung.</div></div>`);
    }
    if (st.angemeldet) { S.csrf = st.csrf; S.name = st.name; S.email = st.email; return starteApp(); }
    zeigeAuth(); loginForm();
  }

  /* ====================================================================
     App-Rahmen: Navigation, Routing, Veröffentlichungsstatus
     ==================================================================== */
  const I = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const NAV = [
    { id: "uebersicht", gruppe: "Übersicht", label: "Übersicht", kurz: "Start", icon: I('<path d="M3 11l9-8 9 8v9a2 2 0 0 1-2 2h-4v-6H9v6H5a2 2 0 0 1-2-2z"/>') },
    { id: "bilder", gruppe: "Inhalte", label: "Bilder", kurz: "Bilder", icon: I('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 9"/>') },
    { id: "texte", gruppe: "Inhalte", label: "Texte", kurz: "Texte", icon: I('<path d="M5 4h14M12 4v16M8 20h8"/>') },
    { id: "produkte", gruppe: "Inhalte", label: "Produkte", kurz: "Produkte", icon: I('<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/>') },
    { id: "bewertungen", gruppe: "Inhalte", label: "Bewertungen", kurz: "Bewert.", badge: "bewertungen", icon: I('<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z"/>') },
    { id: "preise", gruppe: "Verkauf", label: "Preise & Konfigurator", kurz: "Preise", icon: I('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 10v10"/>') },
    { id: "anfragen", gruppe: "Verkauf", label: "Anfragen", kurz: "Anfragen", badge: "anfragen", icon: I('<path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H8l-4 4z"/><path d="M8 10h8M8 13h5"/>') },
    { id: "angebote", gruppe: "Verkauf", label: "Angebote & Rechnungen", kurz: "Angebote", hidden: true, icon: I('<path d="M6 3h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M9 13h6M9 17h4"/>') },
    { id: "einstellungen", gruppe: "System", label: "Einstellungen", kurz: "Einstell.", icon: I('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>') },
    { id: "versionen", gruppe: "System", label: "Änderungsprotokoll", kurz: "Versionen", icon: I('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>') },
    { id: "protokoll", gruppe: "System", label: "Zugriffsprotokoll", kurz: "Zugriffe", sub: true, icon: I('<path d="M6 3h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v6h6M8 13h8M8 17h6"/>') },
    { id: "konto", gruppe: "System", label: "Konto", kurz: "Konto", icon: I('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>') },
  ];  const TITEL = { uebersicht: "Übersicht", bilder: "Bilder", texte: "Texte", produkte: "Produkte", preise: "Preise & Konfigurator", einstellungen: "Einstellungen", bewertungen: "Bewertungen", anfragen: "Anfragen", versionen: "Änderungsprotokoll", protokoll: "Zugriffsprotokoll", konto: "Konto", angebote: "Angebote & Rechnungen" };
  function navHtml(aktiv) {
    const sichtbar = NAV.filter((n) => !n.hidden || localStorage.getItem("fw-modul-" + n.id) === "an");
    const gruppen = []; sichtbar.forEach((n) => { let g = gruppen.find((x) => x.name === n.gruppe); if (!g) { g = { name: n.gruppe, eintraege: [] }; gruppen.push(g); } g.eintraege.push(n); });
    return gruppen.map((g) => `<div class="nav__gruppe"><span class="nav__titel">${h(g.name)}</span>${navLinks(g.eintraege, aktiv)}</div>`).join("");
  }
  function navLinks(liste, aktiv) {
    return liste.map((n) => `<a href="#${n.id}" class="${n.sub ? "nav--sub" : ""}" title="${h(n.label)}" ${aktiv === n.id ? 'aria-current="page"' : ""}>${n.icon}<span class="lbl">${h(n.label)}</span>${n.badge && S[n.badge + "Badge"] ? `<span class="badge ${n.badge === "anfragen" ? "badge--grey" : ""}">${S[n.badge + "Badge"]}</span>` : ""}</a>`).join("");
  }
  function route() { const [id, sub] = (location.hash || "#uebersicht").slice(1).split("/"); return { id: TITEL[id] ? id : "uebersicht", sub }; }
  function renderNav() {
    const r = route();
    $("#nav-side").innerHTML = navHtml(r.id);
    $("#top-title").textContent = TITEL[r.id];
    document.title = TITEL[r.id] + " – Command Center – Fenster-WeissenBurger";
    $("#ctx-side").textContent = S.kontextLabel ? S.kontextLabel : "";
    $("#top-name").textContent = S.name || "Admin";
    $("#top-avatar").textContent = (S.name || "A").trim().slice(0, 1).toUpperCase();
    $("#top-datum").textContent = new Date().toLocaleString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
    const tp = $("#top-pub"); if (tp) tp.innerHTML = pubPill();
    document.querySelector(".app").classList.remove("is-nav-open");
  }
  function pubPill() {
    const p = S.pub || { status: "nie" };
    if (p.status === "laeuft") return '<span class="pill pill--warn pill--busy" title="Veröffentlichung läuft">Wird veröffentlicht …</span>';
    if (p.status === "fehler") return '<span class="pill pill--err" title="' + h(p.fehler || "") + '">Veröffentlichung fehlgeschlagen</span>';
    if (p.status === "unbekannt" || p.status === "gespeichert") return '<span class="pill pill--warn">Nicht veröffentlicht</span>';
    return '<span class="pill pill--ok" title="' + (p.letzteVeroeffentlichung ? "Zuletzt " + fmtDT(p.letzteVeroeffentlichung) : "") + '">Website online</span>';
  }
  document.addEventListener("click", (e) => {
    const t = e.target.closest("#nav-toggle"); const app = document.querySelector(".app");
    if (t && app) { app.classList.toggle("is-nav-open"); t.setAttribute("aria-expanded", String(app.classList.contains("is-nav-open"))); return; }
    if (e.target.closest("#rail-schliessen") && app) app.classList.remove("is-nav-open");
  });

  async function starteApp() {
    zeigeApp();
    if (!S.name) { try { const st = await call(AUTH); S.name = st.name; S.email = st.email; S.kontext = st.kontext; } catch (e) { /* egal */ } }
    render();
  }
  async function render() {
    const r = route();
    if (S.dirty && S.dirtyRoute && S.dirtyRoute !== r.id) {
      const ok = await bestaetigen("Ungespeicherte Änderungen", "Sie haben Änderungen, die noch nicht gespeichert sind. Wirklich verlassen?", "Verlassen", true);
      if (!ok) { location.hash = "#" + S.dirtyRoute; return; }
      S.dirty = false;
    }
    renderNav();
    const alt = $("#main"), main = alt.cloneNode(false); alt.replaceWith(main); // alte Event-Listener verwerfen
    main.innerHTML = '<p class="loading">Wird geladen …</p>';
    try { await VIEWS[r.id](main, r.sub); } catch (e) { main.innerHTML = `<div class="alert alert--err">Fehler: ${h(e.message)}</div>`; }
    main.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", render);
  window.addEventListener("beforeunload", (e) => { if (S.dirty) { e.preventDefault(); e.returnValue = ""; } });
  function setDirty(v) { S.dirty = v; S.dirtyRoute = v ? route().id : null; }

  /* Veröffentlichungsstatus */
  function pubHtml(p) {
    p = p || S.pub || { status: "nie" };
    const letzte = p.letzteVeroeffentlichung ? "Letzte Veröffentlichung: " + fmtDT(p.letzteVeroeffentlichung) : "Noch nicht über den Admin veröffentlicht";
    if (p.status === "laeuft") return `<span class="pill pill--warn pill--busy">Veröffentlichung läuft …</span><span>gestartet ${fmtDT(p.start)}${p.ausloeser ? " · " + h(p.ausloeser) : ""}</span><button type="button" class="btn btn--xs" data-pub="reset">Status zurücksetzen</button>`;
    if (p.status === "fehler") return `<span class="pill pill--err">Nicht veröffentlicht – Fehler</span><span class="strong">${h(p.fehler || "")}</span><span>Die bisherige Version bleibt online. ${letzte}</span>`;
    if (p.status === "unbekannt") return `<span class="pill pill--warn">Status unbekannt</span><span>${h(p.hinweis || "")}</span>`;
    if (p.status === "gespeichert") return `<span class="pill pill--warn">Gespeichert – nicht veröffentlicht</span><span>${h(p.hinweis || "")}</span>`;
    if (p.status === "veroeffentlicht") return `<span class="pill pill--ok">Website online</span><span>${letzte} · Tests bestanden${p.dauerMs ? " · " + Math.round(p.dauerMs / 1000) + " s" : ""}</span>`;
    return `<span class="pill pill--ok">Website online</span><span>${letzte}</span>`;
  }
  function pubBar(extraBtn) { return `<div class="pubbar" id="pubbar">${pubHtml()}${extraBtn || ""}</div>`; }
  async function ladeStatus() { try { const r = await api.get("status"); S.pub = r.veroeffentlichung; if (r.kontextLabel) { S.kontextLabel = r.kontextLabel; renderNav(); } const el = $("#pubbar"); if (el) { el.innerHTML = pubHtml(); } const tp = $("#top-pub"); if (tp) tp.innerHTML = pubPill(); if (S.pub.status === "laeuft") startPoll(); else stopPoll(); } catch (e) { /* egal */ } }
  function startPoll() { if (S.pollTimer) return; S.pollTimer = setInterval(async () => { const alt = S.pub && S.pub.status; await ladeStatus(); if (alt === "laeuft" && S.pub.status !== "laeuft") toast(S.pub.status === "veroeffentlicht" ? "Website veröffentlicht – alle Tests bestanden." : "Veröffentlichung fehlgeschlagen: " + (S.pub.fehler || ""), S.pub.status === "veroeffentlicht" ? "ok" : "err"); }, 8000); }
  function stopPoll() { if (S.pollTimer) { clearInterval(S.pollTimer); S.pollTimer = null; } }
  async function veroeffentlichen(grund) {
    const r = await api.post("veroeffentlichen", { grund: grund || "Manuell" });
    if (r.ok) { S.pub = r.veroeffentlichung; toast("Veröffentlichung gestartet – Tests laufen. Das dauert etwa 1–2 Minuten.", "ok"); startPoll(); }
    else { if (r.veroeffentlichung) S.pub = r.veroeffentlichung; toast(r.error || "Veröffentlichung nicht möglich.", r.uebersprungen ? "" : "err"); }
    await ladeStatus();
    return r.ok;
  }

  /* Globale Klicks (Abmelden, Drawer) */
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    if (b.dataset.act === "abmelden") { e.preventDefault(); await api.auth("abmelden"); S.csrf = null; setDirty(false); location.hash = ""; zeigeAuth(); loginForm({ hinweis: "Sie wurden abgemeldet." }); }
  });
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-pub=reset]"); if (!b) return;
    if (!(await bestaetigen("Status zurücksetzen", "Der Eintrag „Veröffentlichung läuft“ wird verworfen. Ein laufender Netlify-Build wird dadurch nicht abgebrochen; der Status zeigt danach „unbekannt“, bis Sie erneut veröffentlichen.", "Zurücksetzen"))) return;
    const r = await api.post("status-zuruecksetzen");
    if (r.ok) { S.pub = r.veroeffentlichung; stopPoll(); toast("Status zurückgesetzt.", "ok"); render(); } else toast(r.error, "err");
  });

  /* ====================================================================
     Ansichten
     ==================================================================== */
  async function verarbeite(file, fortschritt) {
    let quelle = file;
    if (/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name)) {
      await ladeScript("/js/vendor/heic2any-0.0.4.min.js");
      const out = await window.heic2any({ blob: file, toType: "image/jpeg", quality: 0.92 });
      quelle = Array.isArray(out) ? out[0] : out;
    }
    fortschritt(20);
    let bmp;
    try { bmp = await createImageBitmap(quelle, { imageOrientation: "from-image" }); }
    catch (e) { bmp = await new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = () => rej(new Error("Bild konnte nicht gelesen werden.")); img.src = URL.createObjectURL(quelle); }); }
    const W = bmp.width || bmp.naturalWidth, H = bmp.height || bmp.naturalHeight;
    const groessen = W > 900 ? [800, 1600] : [800];
    const dateien = {}; let breite = 0, hoehe = 0;
    for (const g of groessen) {
      const f = Math.min(1, g / W);
      const c = document.createElement("canvas"); c.width = Math.round(W * f); c.height = Math.round(H * f);
      c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
      const blob = await new Promise((res) => c.toBlob(res, "image/webp", 0.82));
      if (!blob) throw new Error("WebP wird von diesem Browser nicht unterstützt.");
      dateien[g] = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(",")[1]); fr.readAsDataURL(blob); });
      if (!breite) { breite = c.width; hoehe = c.height; }
      fortschritt(50 + 50 * (groessen.indexOf(g) + 1) / groessen.length);
    }
    return { dateien, breite, hoehe };
  }
  const VIEWS = {};

  /* ---------- Übersicht ---------- */
  VIEWS.uebersicht = async (main) => {
    const d = await api.get("uebersicht");
    if (!d.ok) throw new Error(d.error);
    S.pub = d.veroeffentlichung; S.name = d.name; S.kontext = d.kontext; S.kontextLabel = d.kontextLabel; S.bewertungenBadge = d.bewertungenOffen || 0; S.anfragenBadge = d.anfragen.neuDieseWoche || 0; renderNav();
    S.hooks = { buildHook: d.buildHook, mail: d.mail };
    const letzte = d.versionen && d.versionen[0];
    const typText = (p) => ({ login: "Anmeldung", "login-fehler": "Fehlversuch", "login-gesperrt": "Zugang gesperrt", logout: "Abmeldung", gespeichert: "Gespeichert", veroeffentlichung: "Veröffentlichung", "veroeffentlichung-fehler": "Veröffentlichung fehlgeschlagen", bild: "Bild", bewertung: "Bewertung", wiederhergestellt: "Wiederhergestellt", einrichtung: "Einrichtung", "2fa": "Zwei-Faktor", "veroeffentlichung-uebersprungen": "Nicht veröffentlicht (Testumgebung)", "status-zurueckgesetzt": "Status zurückgesetzt", benachrichtigungen: "Benachrichtigungen", "email-aenderung": "E-Mail-Adresse", "passwort-reset": "Passwort zurückgesetzt", passwort: "Passwort geändert" }[p.typ] || String(p.typ || "").replace(/-/g, " "));
    const warn = [];
    if (!d.buildHook) warn.push(d.kontext === "production" ? "Die automatische Veröffentlichung ist noch nicht eingerichtet: Änderungen werden gespeichert, erscheinen aber erst nach der Einrichtung auf der Website." : "Testumgebung (" + h(d.kontextLabel) + "): Änderungen werden nur gespeichert; die Live-Website wird von hier aus nie verändert.");
    { const t = PV.tageBis(d.blobsTokenAblauf); if (t !== null && t <= 30) warn.push(t < 0 ? "Der Zugriffsschlüssel für den Datenspeicher ist seit " + fmtD(d.blobsTokenAblauf) + " abgelaufen – bitte erneuern (<a href=\"#einstellungen/konten\">Konten &amp; Zugänge</a>)." : "Der Zugriffsschlüssel für den Datenspeicher läuft in " + t + " Tagen ab (" + fmtD(d.blobsTokenAblauf) + ") – rechtzeitig erneuern (<a href=\"#einstellungen/konten\">Konten &amp; Zugänge</a>)."); }
    if (!d.mail) warn.push("Der E-Mail-Versand ist noch nicht eingerichtet – es werden keine Benachrichtigungen und keine „Passwort vergessen“-Mails versendet.");
    main.innerHTML = `
      <div class="page-head"><div><h1>Guten Tag, ${h(S.name || "")}</h1><span class="muted">${S.pub.status === "fehler" ? "Die letzte Veröffentlichung ist fehlgeschlagen." : S.pub.status === "laeuft" ? "Eine Veröffentlichung läuft gerade." : "Alle Änderungen sind veröffentlicht."}</span></div>${pubHtml()}</div>
      ${warn.length ? `<div class="alert alert--warn">${warn.join("<br>")} <span class="small">Einrichtung: unter <a href="#einstellungen">Einstellungen</a> bzw. durch die technische Betreuung.</span></div>` : ""}
      <div class="kpis">
        <div class="card kpi"><div class="kpi__head"><span class="kpi__icon">${NAV.find((n) => n.id === "anfragen").icon}</span>Neue Anfragen</div><div class="value">${d.anfragen.neuDieseWoche}</div><div class="sub">letzte 7 Tage · <a href="#anfragen">Ansehen →</a></div></div>
        <div class="card kpi"><div class="kpi__head"><span class="kpi__icon">${NAV.find((n) => n.id === "bewertungen").icon}</span>Bewertungen</div><div class="value">${d.bewertungenOffen}</div><div class="sub">zu prüfen · <a href="#bewertungen">Prüfen →</a></div></div>
        <div class="card kpi"><div class="kpi__head"><span class="kpi__icon">${NAV.find((n) => n.id === "bilder").icon}</span>Bilder</div><div class="value value--ink">${d.bilder}</div><div class="sub">auf der Website · <a href="#bilder">Verwalten →</a></div></div>
        <div class="card kpi"><div class="kpi__head"><span class="kpi__icon">${NAV.find((n) => n.id === "versionen").icon}</span>Letzte Änderung</div><div class="value value--ink value--sm">${letzte ? fmtDT(letzte.wann) : "–"}</div><div class="sub">${letzte ? h(letzte.titel) + (letzte.beschreibung ? " · " + h(letzte.beschreibung) : "") : "Noch keine Änderungen"}</div></div>
      </div>
      <div class="cols">
        <div class="card"><h2>Schnellzugriff</h2>
          <a class="quick" href="#bilder">Neues Referenzfoto hochladen</a>
          <a class="quick" href="#texte/startseite">Startseite-Text ändern</a>
          <a class="quick" href="#bewertungen">Bewertung freigeben</a>
          <a class="quick" href="#preise">Preise prüfen · Testrechner</a>
          <a class="quick" href="#konto">Passwort ändern</a>
        </div>
        <div class="card grow"><h2>Letzte Aktivitäten</h2>
          <div class="list">${(d.protokoll || []).map((p) => `<div><span><b>${h(typText(p))}</b> · ${h(p.text)}</span><span class="small muted nowrap">${fmtDT(p.wann)}</span></div>`).join("") || '<p class="muted">Noch keine Einträge.</p>'}</div>
          <a href="#protokoll" class="small strong">Vollständiges Zugriffsprotokoll →</a>
        </div>
      </div>
      <div class="card"><div class="row row--between"><h2>Konfigurator</h2><span class="pill ${d.konfigurator === "online" ? "pill--ok" : d.konfigurator === "vorschau" ? "pill--warn" : ""}">${{ aus: "Aus", vorschau: "Vorschau", online: "Online" }[d.konfigurator]}</span></div><p class="muted">Preisliste ${h(d.preislisteVersion)} · <a href="#preise">Preise &amp; Schalter →</a></p></div>
      <div class="card"><div class="row row--between"><h2>${h(Steuer.TITEL)}</h2><span class="pill ${d.steuer ? "pill--warn" : ""}">${h(Steuer.SCHALTER_LABEL)}: ${h(Steuer.texte(d.steuer).option)}</span></div><p class="muted">${h(Steuer.texte(d.steuer).adminKurz)} <a href="#einstellungen">Einstellungen →</a></p></div>`;
    if (S.pub.status === "laeuft") startPoll();
  };

  /* ---------- Bilder ---------- */
  const SEKTIONEN = { startseite: "Startseite", referenzen: "Referenzen", produkte: "Produkte", leistungen: "Leistungen", "ueber-uns": "Über uns", konfigurator: "Konfigurator", sonstiges: "Sonstiges" };
  function bildSrc(id, b, g) { return b.blob ? `${BILD}?id=${encodeURIComponent(id)}&g=${g || 800}&t=${b.hochgeladen || 0}` : "/" + b.src; }
  VIEWS.bilder = async (main) => {
    const d = await api.get("daten", { bereich: "bilder" });
    if (!d.ok) throw new Error(d.error);
    S.bilder = d.daten.bilder;
    S.bilderAend = {};
    const ids = Object.keys(S.bilder);
    if (!S.bildId || !S.bilder[S.bildId]) S.bildId = ids[0] || null;
    main.innerHTML = `
      <div class="page-head"><div><h1>Bilder</h1><span class="muted">Fotos hochladen, ersetzen oder löschen. Bilder werden im Browser verkleinert, in WebP umgewandelt und von Metadaten (EXIF/GPS) befreit.</span></div><button type="button" class="btn btn--primary" data-b="upload">+ Bilder hochladen</button></div>
      ${pubBar()}
      <div class="chips" role="group" aria-label="Bereich" id="bild-filter"></div>
      <div class="cols">
        <div class="col-main">
          <label class="drop" id="drop"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0B5ED7" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v4h16v-4"/></svg><span><b>Fotos hierher ziehen</b> oder vom Handy auswählen · JPG, PNG, HEIC · max. 20 MB</span><input type="file" id="file-neu" accept="image/*,.heic,.heif" multiple></label>
          <div id="upload-status" class="stack" hidden></div>
          <div class="bilder-grid" id="bild-grid"></div>
        </div>
        <aside class="col-side"><div class="card" id="bild-edit"></div></aside>
      </div>`;
    const filter = $("#bild-filter");
    const zeichneFilter = () => { const alle = ["alle", ...Object.keys(SEKTIONEN).filter((s) => ids.some((i) => S.bilder[i].sektion === s))]; filter.innerHTML = alle.map((s) => `<button type="button" class="chip" aria-selected="${S.bildFilter === s}" data-f="${s}">${s === "alle" ? "Alle" : SEKTIONEN[s]}</button>`).join(""); };
    const zeichneGrid = () => {
      const liste = ids.filter((i) => S.bildFilter === "alle" || S.bilder[i].sektion === S.bildFilter);
      $("#bild-grid").innerHTML = liste.map((i) => { const b = S.bilder[i]; return `<button type="button" class="bild ${b.geloescht ? "is-geloescht" : ""}" data-id="${h(i)}" aria-pressed="${S.bildId === i}"><img class="bild__img" src="${h(bildSrc(i, b, 800))}" alt="" loading="lazy" width="400" height="300"><span class="bild__meta"><b>${h(b.titel || i)}</b><span>${h(SEKTIONEN[b.sektion] || b.sektion)}${b.blob ? " · ersetzt" : ""}${b.neu ? " · neu" : ""}${b.geloescht ? " · gelöscht" : ""}${S.bildId === i ? " · ausgewählt" : ""}</span></span></button>`; }).join("") || '<p class="muted">Keine Bilder in diesem Bereich.</p>';
    };
    const zeichneEdit = () => {
      const i = S.bildId, b = i && S.bilder[i];
      const box = $("#bild-edit");
      if (!b) { box.innerHTML = "<h2>Bild bearbeiten</h2><p class='muted'>Bitte ein Bild auswählen.</p>"; return; }
      const a = Object.assign({}, b, S.bilderAend[i] || {});
      box.innerHTML = `<h2>Bild bearbeiten</h2>
        <img class="preview" src="${h(bildSrc(i, b, 800))}" alt="${h(a.alt || "")}">
        <p class="small muted">${b.seite ? "Seite: " + h(b.seite) + " · " : ""}${b.breite && b.hoehe ? b.breite + " × " + b.hoehe + " px" : ""}${b.loeschbar ? "" : " · fest im Layout (nur ersetzen)"}</p>
        <label class="field">Titel<input type="text" id="be-titel" maxlength="80" value="${h(a.titel || "")}"></label>
        <label class="field">Bildbeschreibung (für Google und Screenreader)<textarea id="be-alt" rows="2" maxlength="200">${h(a.alt || "")}</textarea></label>
        <label class="field">Bereich<select id="be-sektion">${Object.entries(SEKTIONEN).map(([k, v]) => `<option value="${k}" ${a.sektion === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
        <div class="grid grid--2"><label class="btn btn--sm">Ersetzen<input type="file" id="file-ersetzen" accept="image/*,.heic,.heif" class="sr-only"></label>${b.loeschbar ? `<button type="button" class="btn btn--sm ${b.geloescht ? "" : "btn--danger"}" data-b="${b.geloescht ? "wieder" : "loeschen"}">${b.geloescht ? "Wieder einblenden" : "Löschen"}</button>` : ""}</div>
        <button type="button" class="btn btn--dark" data-b="speichern">Speichern</button>
        <button type="button" class="btn btn--primary" data-b="speichern-pub">Speichern &amp; veröffentlichen</button>`;
      $("#file-ersetzen").addEventListener("change", (e) => e.target.files[0] && hochladen([e.target.files[0]], i));
      ["be-titel", "be-alt", "be-sektion"].forEach((id) => $("#" + id).addEventListener("input", () => { S.bilderAend[i] = { titel: $("#be-titel").value, alt: $("#be-alt").value, sektion: $("#be-sektion").value }; setDirty(true); }));
    };
    zeichneFilter(); zeichneGrid(); zeichneEdit();
    filter.addEventListener("click", (e) => { const b = e.target.closest("[data-f]"); if (!b) return; S.bildFilter = b.dataset.f; zeichneFilter(); zeichneGrid(); });
    $("#bild-grid").addEventListener("click", (e) => { const b = e.target.closest("[data-id]"); if (!b) return; S.bildId = b.dataset.id; zeichneGrid(); zeichneEdit(); if (window.innerWidth < 900) $("#bild-edit").scrollIntoView({ behavior: "smooth" }); });
    $("#file-neu").addEventListener("change", (e) => hochladen(Array.from(e.target.files), null));
    const drop = $("#drop");
    ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("is-over"); }));
    ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("is-over"); }));
    drop.addEventListener("drop", (e) => hochladen(Array.from(e.dataTransfer.files), null));
    main.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-b]"); if (!b) return;
      if (b.dataset.b === "upload") $("#file-neu").click();
      if (b.dataset.b === "loeschen" || b.dataset.b === "wieder") {
        const bild = S.bilder[S.bildId];
        if (b.dataset.b === "loeschen" && !(await bestaetigen("Bild löschen", `„${bild.titel}“ wird von der Website entfernt (sichtbar nach dem Veröffentlichen). Über das Änderungsprotokoll lässt es sich wiederherstellen.`, "Löschen", true))) return;
        const r = await api.post("bild-loeschen", { id: S.bildId, wiederherstellen: b.dataset.b === "wieder" });
        if (r.ok) { toast(b.dataset.b === "wieder" ? "Bild wieder eingeblendet." : "Bild gelöscht – bitte veröffentlichen.", "ok"); render(); } else toast(r.error, "err");
      }
      if (b.dataset.b === "speichern" || b.dataset.b === "speichern-pub") {
        if (!S.bilderAend[S.bildId]) S.bilderAend[S.bildId] = { titel: $("#be-titel").value, alt: $("#be-alt").value, sektion: $("#be-sektion").value };
        const r = await api.post("speichern", { bereich: "bilder", daten: S.bilderAend, beschreibung: "Bildtexte", veroeffentlichen: b.dataset.b === "speichern-pub" });
        if (!r.ok) { toast(r.error + (r.fehler ? " " + r.fehler.map((f) => f.meldung).join(" ") : ""), "err"); return; }
        setDirty(false); toast("Gespeichert.", "ok");
        if (r.veroeffentlichung) { if (r.veroeffentlichung.ok) { S.pub = r.veroeffentlichung.veroeffentlichung; startPoll(); toast("Veröffentlichung gestartet.", "ok"); } else toast(r.veroeffentlichung.error, r.veroeffentlichung.uebersprungen ? "" : "err"); }
        render();
      }
    });

    /* Upload: Datei → (HEIC→JPEG) → Bitmap → Canvas (800/1600 px, WebP, ohne EXIF) → Base64 → Server */
    async function hochladen(files, ersetzeId) {
      const box = $("#upload-status"); box.hidden = false;
      for (const file of files) {
        if (file.size > 20 * 1024 * 1024) { toast(file.name + ": größer als 20 MB.", "err"); continue; }
        const zeile = document.createElement("div"); zeile.className = "card"; zeile.innerHTML = `<div class="row row--between"><span>${h(file.name)} · wird optimiert …</span><span class="small muted" data-s></span></div><div class="progress"><span></span></div>`;
        box.appendChild(zeile);
        const bar = $(".progress span", zeile), st = $("[data-s]", zeile);
        const setP = (p, t) => { bar.style.width = p + "%"; if (t) st.textContent = t; };
        try {
          setP(10, "lesen");
          const bild = await verarbeite(file, (p) => setP(10 + p * 0.6));
          setP(75, "hochladen");
          let titel, alt, sektion;
          if (ersetzeId) { const a = Object.assign({}, S.bilder[ersetzeId], S.bilderAend[ersetzeId] || {}); titel = $("#be-titel") ? $("#be-titel").value : a.titel; alt = $("#be-alt") ? $("#be-alt").value : a.alt; sektion = $("#be-sektion") ? $("#be-sektion").value : a.sektion; }
          else { titel = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").slice(0, 60); alt = titel; sektion = S.bildFilter !== "alle" ? S.bildFilter : "referenzen"; }
          if (!alt || alt.length < 5) alt = titel + " – Foto von Fenster-WeissenBurger";
          const r = await api.post("bild-hochladen", { id: ersetzeId || undefined, dateien: bild.dateien, breite: bild.breite, hoehe: bild.hoehe, titel, alt, sektion });
          if (!r.ok) throw new Error(r.error + (r.fehler ? " " + r.fehler.map((f) => f.meldung).join(" ") : ""));
          setP(100, "fertig"); zeile.classList.add("card--soft");
          S.bildId = r.id;
          setTimeout(() => zeile.remove(), 2500);
        } catch (err) { setP(100, "Fehler"); zeile.classList.add("card--err"); st.textContent = err.message; }
      }
      toast("Hochgeladen – Titel und Beschreibung prüfen, dann „Speichern & veröffentlichen“.", "ok");
      await render();
      if ($("#be-titel")) { $("#be-titel").focus(); }
    }
  };

  /* ---------- Texte ---------- */
  const TAG_LABEL = { h1: "Hauptüberschrift", h2: "Überschrift", h3: "Zwischenüberschrift", p: "Text" };
  function sanitizeClient(html) {
    const t = document.createElement("template"); t.innerHTML = html;
    $$("script,style,iframe,object,embed,img,video,audio,link,meta,form,input,button,svg", t.content).forEach((n) => n.remove());
    $$("*", t.content).forEach((n) => { Array.from(n.attributes).forEach((a) => { if (/^on/i.test(a.name) || (a.name === "href" && /^\s*javascript:/i.test(a.value))) n.removeAttribute(a.name); if (a.name === "style") n.removeAttribute("style"); }); });
    return t.innerHTML;
  }
  VIEWS.texte = async (main, sub) => {
    const [d, de] = await Promise.all([api.get("daten", { bereich: "texte" }), api.get("daten", { bereich: "einstellungen" })]);
    if (!d.ok) throw new Error(d.error);
    S.texte = d.daten; S.texteAend = S.texteAend || {}; if (de.ok) S.einst = de.daten;
    const steuerSatz = () => Steuer.satz(S.einst);
    if (sub && S.texte.seiten[sub]) S.seite = sub;
    if (!S.texte.seiten[S.seite]) S.seite = Object.keys(S.texte.seiten)[0];
    const bloeckeVon = (seite) => Object.entries(S.texte.bloecke).filter(([, b]) => b.seite === seite);
    main.innerHTML = `
      <div class="page-head"><div><h1>Texte</h1><span class="muted">Wählen Sie eine Seite und ändern Sie Überschriften und Texte. Erlaubt: <b>fett</b>, <i>kursiv</i>, Links, Zeilenumbruch.</span></div>
        <div class="row"><span class="small muted" id="txt-stand"></span><button type="button" class="btn" data-t="vorschau">Vorschau</button><button type="button" class="btn btn--dark" data-t="speichern">Speichern</button><button type="button" class="btn btn--primary" data-t="speichern-pub">Speichern &amp; veröffentlichen</button></div></div>
      ${pubBar()}
      <div class="cols">
        <nav class="col-nav seiten-nav" aria-label="Seiten" id="seiten-nav"></nav>
        <div class="col-main" id="txt-main"></div>
      </div>`;
    const zeichneNav = () => { $("#seiten-nav").innerHTML = Object.entries(S.texte.seiten).map(([k, s]) => { const n = bloeckeVon(k).filter(([id, b]) => b.geaendert || S.texteAend[id] !== undefined).length; return `<button type="button" data-seite="${k}" aria-current="${S.seite === k}"><span>${h(s.titel)}</span>${s.geschuetzt ? '<span class="badge badge--warn">geschützt</span>' : n ? `<span class="badge">${n}</span>` : ""}</button>`; }).join(""); };
    const zeichneMain = () => {
      const s = S.texte.seiten[S.seite];
      const bl = bloeckeVon(S.seite);
      const url = "/" + s.datei.replace(/index\.html$/, "");
      $("#txt-main").innerHTML = `
        <section class="card">
          <div class="row row--between"><h2>${h(s.titel)}</h2><a href="${h(url)}" target="_blank" rel="noopener" class="small strong">Auf der Seite ansehen ↗</a></div>
          ${s.geschuetzt ? '<div class="alert alert--warn">Impressum und Datenschutzerklärung sind rechtlich relevante Texte. Änderungen werden erst nach einer zusätzlichen Bestätigung gespeichert.</div>' : ""}
          <p class="small muted">Steuerhinweis nie von Hand schreiben: Der Platzhalter <code>${h(Steuer.PLATZHALTER)}</code> wird beim Veröffentlichen automatisch durch den aktuellen Hinweis ersetzt (zurzeit: „${h(Steuer.texte(steuerSatz()).lang)}“).</p>
          <label class="field"><span class="sr-only">Suche</span><input type="search" id="txt-suche" placeholder="In den Texten dieser Seite suchen …"></label>
          <div class="toolbar" role="toolbar" aria-label="Formatierung"><button type="button" class="tb-b" data-tb="b" title="Fett">B</button><button type="button" class="tb-i" data-tb="i" title="Kursiv">I</button><button type="button" data-tb="a">Link</button><button type="button" data-tb="br">Zeilenumbruch</button><span class="hint">Markieren Sie Text im Feld und klicken Sie auf eine Schaltfläche.</span></div>
          <div class="stack" id="txt-bloecke">${bl.map(([id, b]) => { const wert = S.texteAend[id] !== undefined ? S.texteAend[id] : b.html; const ge = b.geaendert || S.texteAend[id] !== undefined; return `<div class="block block--${b.tag}" data-block="${id}"><div class="block__head"><b>${TAG_LABEL[b.tag] || b.tag}</b><span>${ge ? `geändert · <button type="button" class="btn btn--link" data-reset="${id}">Original wiederherstellen</button>` : ""} <span class="zeichen">${wert.replace(/<[^>]+>/g, "").length} Zeichen</span></span></div><textarea rows="${b.tag === "p" ? 3 : 2}" data-id="${id}" class="${ge ? "is-geaendert" : ""}" aria-label="${TAG_LABEL[b.tag]}">${h(wert)}</textarea></div>`; }).join("")}</div>
        </section>
        <section class="card" id="txt-versionen"><h2>Frühere Versionen (Texte)</h2><p class="muted small">Wird geladen …</p></section>`;
      let fokus = null;
      $("#txt-bloecke").addEventListener("focusin", (e) => { if (e.target.tagName === "TEXTAREA") fokus = e.target; });
      $("#txt-bloecke").addEventListener("input", (e) => { const ta = e.target; if (ta.tagName !== "TEXTAREA") return; const id = ta.dataset.id; S.texteAend[id] = ta.value; ta.classList.add("is-geaendert"); $(".zeichen", ta.closest(".block")).textContent = ta.value.replace(/<[^>]+>/g, "").length + " Zeichen"; setDirty(true); $("#txt-stand").textContent = "Ungespeicherte Änderungen"; });
      $("#txt-bloecke").addEventListener("click", (e) => { const r = e.target.closest("[data-reset]"); if (!r) return; S.texteAend[r.dataset.reset] = null; setDirty(true); zeichneMain(); });
      $(".toolbar", $("#txt-main")).addEventListener("click", (e) => {
        const b = e.target.closest("[data-tb]"); if (!b || !fokus) return;
        const ta = fokus, a = ta.selectionStart, z = ta.selectionEnd, sel = ta.value.slice(a, z);
        let ins;
        if (b.dataset.tb === "b") ins = `<strong>${sel || "fett"}</strong>`;
        else if (b.dataset.tb === "i") ins = `<em>${sel || "kursiv"}</em>`;
        else if (b.dataset.tb === "br") ins = "<br>";
        else { const url = prompt("Linkziel (z. B. /leistungen/ oder https://…):", "/"); if (!url) return; ins = `<a href="${url.replace(/"/g, "")}">${sel || "Link"}</a>`; }
        ta.setRangeText(ins, a, z, "end"); ta.dispatchEvent(new Event("input", { bubbles: true })); ta.focus();
      });
      $("#txt-suche").addEventListener("input", (e) => { const q = e.target.value.toLowerCase(); $$("#txt-bloecke .block").forEach((el) => { el.hidden = q && !$("textarea", el).value.toLowerCase().includes(q); }); });
      api.get("versionen").then((v) => { const vs = (v.versionen || []).filter((x) => x.bereich === "texte").slice(0, 8); $("#txt-versionen").innerHTML = `<h2>Frühere Versionen (Texte)</h2>${vs.length ? vs.map((x) => `<div class="version"><span>${fmtDT(x.wann)} · ${h(x.wer)} · ${x.aenderungen} Änderung(en)${x.beschreibung ? " · " + h(x.beschreibung) : ""}</span><button type="button" class="btn btn--sm" data-restore="${x.id}">Wiederherstellen</button></div>`).join("") : '<p class="muted small">Noch keine gespeicherten Versionen.</p>'}<a href="#versionen" class="small strong">Alle Versionen →</a>`; });
    };
    zeichneNav(); zeichneMain();
    $("#seiten-nav").addEventListener("click", (e) => { const b = e.target.closest("[data-seite]"); if (!b) return; S.seite = b.dataset.seite; history.replaceState(null, "", "#texte/" + S.seite); zeichneNav(); zeichneMain(); });
    main.addEventListener("click", async (e) => {
      const r = e.target.closest("[data-restore]"); if (r) return wiederherstellen(r.dataset.restore);
      const b = e.target.closest("[data-t]"); if (!b) return;
      if (b.dataset.t === "vorschau") {
        const s = S.texte.seiten[S.seite];
        const html = bloeckeVon(S.seite).map(([id, blk]) => { const wert = S.texteAend[id] !== undefined && S.texteAend[id] !== null ? S.texteAend[id] : S.texteAend[id] === null ? d.daten.bloecke[id].html : blk.html; const ge = S.texteAend[id] !== undefined || blk.geaendert; return `<${blk.tag} class="${ge ? "is-geaendert" : ""}">${Steuer.ersetzePlatzhalter(sanitizeClient(wert), steuerSatz())}</${blk.tag}>`; }).join("");
        modal({ titel: "Vorschau · " + s.titel, html: `<div class="vorschau">${html}</div><p class="small muted">Geänderte Bausteine sind blau umrandet. Die Vorschau zeigt den Text in Lesereihenfolge, ohne das Seitenlayout.</p>`, ok: "Schließen", abbrechen: "" });
      }
      if (b.dataset.t === "speichern" || b.dataset.t === "speichern-pub") {
        const aend = {}; Object.entries(S.texteAend).forEach(([id, v]) => { aend[id] = v; });
        if (!Object.keys(aend).length) { toast("Keine Änderungen zum Speichern."); if (b.dataset.t === "speichern-pub") await veroeffentlichen("Texte"); return; }
        const geschuetzt = Object.keys(aend).some((id) => S.texte.bloecke[id] && S.texte.bloecke[id].geschuetzt);
        let bestaetigt = false;
        if (geschuetzt) { bestaetigt = await bestaetigen("Rechtliche Texte ändern", "Sie ändern Impressum oder Datenschutzerklärung. Diese Texte sind rechtlich relevant – bitte nur nach Prüfung speichern.", "Ja, speichern", true); if (!bestaetigt) return; }
        const r = await api.post("speichern", { bereich: "texte", daten: aend, bestaetigt, beschreibung: "Texte: " + S.texte.seiten[S.seite].titel, veroeffentlichen: b.dataset.t === "speichern-pub" });
        if (!r.ok) { toast(r.error + (r.fehler ? " " + r.fehler.map((f) => f.meldung).join(" ") : ""), "err"); return; }
        S.texteAend = {}; setDirty(false); toast(`Gespeichert (${r.version.aenderungen} Änderung(en)).`, "ok");
        if (r.veroeffentlichung) { if (r.veroeffentlichung.ok) { S.pub = r.veroeffentlichung.veroeffentlichung; startPoll(); toast("Veröffentlichung gestartet.", "ok"); } else toast(r.veroeffentlichung.error, r.veroeffentlichung.uebersprungen ? "" : "err"); }
        render();
      }
    });
  };

  async function wiederherstellen(id) {
    if (!(await bestaetigen("Version wiederherstellen", "Der gespeicherte Stand wird als neue Version übernommen und sofort veröffentlicht (mit allen Tests).", "Wiederherstellen & veröffentlichen"))) return;
    const r = await api.post("wiederherstellen", { id });
    if (!r.ok) return toast(r.error, "err");
    toast("Wiederhergestellt." + (r.veroeffentlichung && r.veroeffentlichung.ok ? " Veröffentlichung läuft." : " " + ((r.veroeffentlichung && r.veroeffentlichung.error) || "")), r.veroeffentlichung && r.veroeffentlichung.ok ? "ok" : "err");
    if (r.veroeffentlichung && r.veroeffentlichung.ok) { S.pub = r.veroeffentlichung.veroeffentlichung; startPoll(); }
    render();
  }

  /* ---------- Preise & Konfigurator (Command Center) ---------- */
  const TABS = [["fenster", "Fenster"], ["haustuer", "Haustüren"], ["schiebetuer", "Hebe-Schiebetüren"], ["allgemein", "Montage & Allgemein"]];
  const ICON_KPI = {
    systeme: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 12h18M12 3v18"/></svg>',
    zeit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    konf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M12 3v18M4 12h16"/></svg>',
    tests: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/></svg>',
    calc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h2M12 11h2M16 11h0M8 15h2M12 15h2M16 15h0"/></svg>',
  };
  function zahlInput(pfad, wert, opts = {}) { return `<input type="text" inputmode="decimal" data-pfad="${h(pfad)}" data-typ="zahl" value="${h(dez(wert))}" aria-label="${h(opts.label || pfad)}" ${opts.cls ? `class="${opts.cls}"` : ""}>`; }
  function textInput(pfad, wert, label, cls) { return `<textarea rows="1" class="${cls || "zelle-input--text"}" data-pfad="${h(pfad)}" data-typ="text" aria-label="${h(label || pfad)}">${h(wert == null ? "" : wert)}</textarea>`; }
  function toggle(pfad, wert, label) { return `<label class="switch"><input type="checkbox" data-pfad="${h(pfad)}" data-typ="bool" ${wert !== false ? "checked" : ""} aria-label="${h(label || "aktiv")}"><span class="switch__track"></span><span class="lbl">${wert !== false ? "Aktiv" : "Aus"}</span></label>`; }
  /* Sparkline aus einer Zahlenreihe (SVG, ohne Inline-Styles) */
  function sparkline(reihe) {
    const w = 120, hh = 34, pad = 3;
    const vals = (reihe || []).filter((v) => typeof v === "number" && isFinite(v));
    if (vals.length < 2) return `<span class="spark--leer">${vals.length === 1 ? "1 Stand" : "kein Verlauf"}</span>`;
    const min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
    const pts = vals.map((v, i) => [pad + (i * (w - 2 * pad)) / (vals.length - 1), hh - pad - ((v - min) / span) * (hh - 2 * pad)]);
    const line = pts.map((p) => p.map((n) => n.toFixed(1)).join(",")).join(" ");
    const area = `${pad},${hh} ${line} ${(w - pad).toFixed(1)},${hh}`;
    return `<svg class="spark" viewBox="0 0 ${w} ${hh}" role="img" aria-label="Preisverlauf: ${vals.map((v) => dez(v)).join(" → ")}"><polygon points="${area}"/><polyline points="${line}"/></svg>`;
  }
  /* Tabelle für eine Optionsgruppe (Fenstertyp, Farben, Glas, …): Bezeichnung | Wert | Aktiv | ✕ */
  function mapTable(id, titel, pfad, map, felder, opts = {}) {
    const rows = Object.entries(map || {}).map(([k, e]) => `<tr>
      <td class="name" data-th="Bezeichnung">${textInput(`${pfad}.${k}.name`, e.name, "Bezeichnung")}</td>
      ${felder.map((f) => f.typ === "select"
        ? `<td data-th="${h(f.label)}"><select data-pfad="${pfad}.${k}.${f.key}" data-typ="text" aria-label="${h(f.label)}">${f.optionen.map(([v, l]) => `<option value="${v}" ${e[f.key] === v ? "selected" : ""}>${l}</option>`).join("")}</select></td>`
        : f.typ === "text" ? `<td data-th="${h(f.label)}">${textInput(`${pfad}.${k}.${f.key}`, e[f.key], f.label, "zelle-input--text zelle-text")}</td>`
        : `<td class="num" data-th="${h(f.label)}">${zahlInput(`${pfad}.${k}.${f.key}`, e[f.key], { label: e.name + " " + f.label })}<span class="einheit">${f.einheit}</span><span class="fehler-text" data-fehler="${pfad}.${k}.${f.key}"></span></td>`).join("")}
      ${opts.aktiv ? `<td data-th="Aktiv">${toggle(`${pfad}.${k}.aktiv`, e.aktiv, e.name + " aktiv")}</td>` : ""}
      ${opts.loeschbar ? `<td class="leer" data-th=""><button type="button" class="btn btn--xs btn--danger" data-del="${pfad}.${k}" aria-label="${h(e.name)} entfernen">✕</button></td>` : ""}
    </tr>`).join("");
    return `<section class="card abschnitt" id="${id}"><div class="row row--between"><h2>${titel}</h2>${opts.neu ? `<button type="button" class="btn btn--xs" data-neu="${pfad}" data-vorlage='${h(JSON.stringify(opts.neu))}'>+ ${opts.neuLabel || "Hinzufügen"}</button>` : ""}</div>${opts.hinweis ? `<p class="small muted">${opts.hinweis}</p>` : ""}
      <div class="table-wrap"><table class="tbl tbl--karten"><thead><tr><th>Bezeichnung</th>${felder.map((f) => `<th>${h(f.label)}</th>`).join("")}${opts.aktiv ? "<th>Aktiv</th>" : ""}${opts.loeschbar ? "<th></th>" : ""}</tr></thead><tbody>${rows || `<tr><td colspan="6" class="muted">Noch keine Einträge.</td></tr>`}</tbody></table></div></section>`;
  }
  /* Tabelle für einzelne Felder (Grenzen, Montage, Allgemein): Feld | Wert */
  function feldTable(id, titel, felder, hinweis) {
    return `<section class="card abschnitt" id="${id}"><h2>${titel}</h2>${hinweis ? `<p class="small muted">${hinweis}</p>` : ""}
      <div class="table-wrap"><table class="tbl tbl--karten"><thead><tr><th>Feld</th><th>Wert</th></tr></thead><tbody>${felder.map(([pfad, label, wert, einheit, typ]) => `<tr><td class="name" data-th="Feld">${h(label)}</td><td class="num" data-th="Wert">${typ === "text" ? textInput(pfad, wert, label) : zahlInput(pfad, wert, { label })}${einheit ? `<span class="einheit">${einheit}</span>` : ""}<span class="fehler-text" data-fehler="${pfad}"></span></td></tr>`).join("")}</tbody></table></div></section>`;
  }
  function autosizeTexte(el) { $$('textarea[data-typ="text"]', el).forEach(wachse); }
  function wachse(ta) { ta.style.height = "auto"; ta.style.height = Math.max(38, ta.scrollHeight) + "px"; }
  window.addEventListener("resize", () => { const m = $("#main"); if (m) autosizeTexte(m); });
  function anzahlAenderungen() {
    try { const a = flachObj(S.preiseOriginal), b = flachObj(S.preise); const keys = new Set([...Object.keys(a), ...Object.keys(b)]); let n = 0; for (const k of keys) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) n++; return n; } catch (e) { return 0; }
  }
  function flachObj(o, p = "", out = {}) { if (o === null || typeof o !== "object") { out[p] = o; return out; } for (const k of Object.keys(o)) flachObj(o[k], p ? p + "." + k : k, out); return out; }

  VIEWS.preise = async (main, sub) => {
    const [dp, de, dv, ds] = await Promise.all([api.get("daten", { bereich: "preise" }), api.get("daten", { bereich: "einstellungen" }), api.get("versionen"), api.get("status")]);
    if (!dp.ok) throw new Error(dp.error);
    S.preise = dp.daten; S.preiseOriginal = klon(dp.daten); S.einst = de.daten; S.pub = ds.veroeffentlichung || S.pub; if (ds.kontextLabel) { S.kontextLabel = ds.kontextLabel; renderNav(); }
    const versionen = (dv.versionen || []);
    const preisVersionen = versionen.filter((v) => v.bereich === "preise");
    if (sub && TABS.some(([k]) => k === sub)) S.tab = sub;
    if (!S.test) S.test = { produkt: "fenster", system: Object.keys(S.preise.fenster.systeme)[0], typ: Object.keys(S.preise.fenster.typen)[0], modell: Object.keys(S.preise.haustuer.modelle)[0], breiteMm: 1200, hoeheMm: 1400, menge: 1, farbe: "weiss", glas: Object.keys(S.preise.fenster.glas)[0], glasT: "standard", sprossen: "keine", rollladen: "keiner", seitenteil: "keines", zusaetze: [], montage: true, demontage: true, angebot: "" };
    const STATUS_LABEL = { aus: "Aus", vorschau: "Vorschau", online: "Online" };
    const kpiTests = () => { const p = S.pub || {}; if (p.status === "veroeffentlicht") return `<div class="value value--ok">✓ bestanden</div><div class="sub">Letzter Build ${fmtDT(p.letzteVeroeffentlichung || p.ende)} · alle Prüfungen erfolgreich</div>`; if (p.status === "fehler") return `<div class="value value--err">Fehler</div><div class="sub">${h((p.fehler || "").slice(0, 120))}</div>`; if (p.status === "laeuft") return `<div class="value value--sm">läuft …</div><div class="sub">Build gestartet ${fmtDT(p.start)}</div>`; return `<div class="value value--ink value--sm">–</div><div class="sub">Noch kein Build über den Admin</div>`; };
    const sysAktiv = () => { const s = Object.values(S.preise.fenster.systeme); return [s.filter((x) => x.aktiv !== false).length, s.length]; };
    main.innerHTML = `
      <div class="page-head"><div><h1>Preise &amp; Konfigurator</h1><span class="muted">Alle Preise in Euro ohne Steuer. Steuer (<a href="#einstellungen/steuer">Einstellungen → Steuer</a>) und Online-Rabatt rechnet der Konfigurator automatisch – auf der Website genauso wie hier.</span></div>
        <div class="row"><a class="btn btn--sm" href="#versionen">Änderungsprotokoll</a></div></div>
      <div class="kpis">
        <div class="card kpi"><div class="kpi__head"><span class="kpi__icon">${ICON_KPI.systeme}</span>Systeme aktiv</div><div class="value" id="kpi-sys">${sysAktiv()[0]}</div><div class="sub" id="kpi-sys-sub">von ${sysAktiv()[1]} Profilsystemen</div></div>
        <div class="card kpi"><div class="kpi__head"><span class="kpi__icon">${ICON_KPI.zeit}</span>Letzte Änderung</div><div class="value value--ink value--sm">${preisVersionen[0] ? fmtDT(preisVersionen[0].wann) : "–"}</div><div class="sub">${preisVersionen[0] ? "durch " + h(preisVersionen[0].wer) + (preisVersionen[0].beschreibung ? " · " + h(preisVersionen[0].beschreibung) : "") : "Preisliste " + h(S.preise.version)}</div></div>
        <div class="card kpi"><div class="kpi__head"><span class="kpi__icon">${ICON_KPI.konf}</span>Konfigurator: <span id="kpi-konf">${STATUS_LABEL[S.einst.konfigurator.status]}</span></div>
          <div class="seg" role="radiogroup" aria-label="Konfigurator-Status" id="konf-status">${Object.entries(STATUS_LABEL).map(([k, l]) => `<button type="button" role="radio" class="seg--${k}" aria-checked="${S.einst.konfigurator.status === k}" data-status="${k}">${l}</button>`).join("")}</div>
          <div class="sub">Aus: unsichtbar · Vorschau: nur nach Anmeldung · Online: öffentlich<br><a href="/konfigurator/fenster/" target="_blank" rel="noopener">Fenster ↗</a> · <a href="/konfigurator/haustuer/" target="_blank" rel="noopener">Haustür ↗</a></div></div>
        <div class="card kpi"><div class="kpi__head"><span class="kpi__icon">${ICON_KPI.tests}</span>Tests</div><div id="kpi-tests">${kpiTests()}</div></div>
      </div>
      ${pubBar()}
      <div id="preis-fehler"></div>
      <div class="chips" role="tablist" aria-label="Produktbereich" id="preis-tabs">${TABS.map(([k, l]) => `<button type="button" role="tab" class="chip" aria-selected="${S.tab === k}" data-tab="${k}">${l}</button>`).join("")}</div>
      <div class="cols"><div class="col-main" id="preis-main"></div><aside class="col-side"><div class="card card--accent calc" id="calc"></div></aside></div>
      <div class="aktionsleiste" id="aktionsleiste" hidden><span><span class="zahl" id="aend-zahl">0</span> Änderungen nicht gespeichert</span><span class="row"><button type="button" class="btn btn--sm" data-p="verwerfen">Verwerfen</button><button type="button" class="btn btn--sm btn--dark" data-p="speichern">Speichern</button><button type="button" class="btn btn--sm btn--primary" data-p="speichern-pub">Speichern &amp; veröffentlichen</button></span></div>`;

    /* Preisverlauf je System aus den gespeicherten Versionen (letzte 10 Stände) */
    const verlauf = {};
    const zeichneSparks = async () => {
      const ids = preisVersionen.slice(0, 10).map((v) => v.id).reverse();
      const staende = [];
      for (const id of ids) { try { const r = await api.get("version", { id }); if (r.ok && r.version.snapshot) staende.push(r.version.snapshot); } catch (e) { /* egal */ } }
      staende.push(S.preiseOriginal);
      for (const k of Object.keys(S.preise.fenster.systeme)) verlauf[k] = staende.map((s) => s.fenster && s.fenster.systeme && s.fenster.systeme[k] ? s.fenster.systeme[k].preisProM2 : undefined);
      $$("[data-spark]", main).forEach((el) => { el.innerHTML = sparkline(verlauf[el.dataset.spark]); });
      autosizeTexte(main); // Spaltenbreiten können sich durch die Sparklines geändert haben
    };
    const zeichneTab = () => {
      const p = S.preise, F = p.fenster, H = p.haustuer, el = $("#preis-main"), g = F.grenzen;
      const sub = (liste) => `<nav class="sub-tabs" aria-label="Abschnitte">${liste.map(([id, l]) => `<a href="#preise/${S.tab}" data-anker="${id}">${l}</a>`).join("")}</nav>`;
      if (S.tab === "fenster") el.innerHTML = `
        ${sub([["grundpreise", "Grundpreise"], ["grenzen", "Grenzen"], ["typen", "Fenstertyp"], ["farben", "Farben"], ["glas", "Verglasung"], ["sprossen", "Sprossen"], ["rollladen", "Rollladen"], ["extras", "Extras"], ["montage", "Montage"]])}
        <section class="card abschnitt" id="grundpreise"><div class="row row--between"><h2>Grundpreise je Profilsystem</h2><span class="small muted">Mindestfläche ${dez(g.mindestflaecheM2)} m² · Standardmaße bis ${g.breiteMaxMm} × ${g.hoeheMaxMm} mm</span></div>
          <div class="table-wrap"><table class="tbl tbl--karten"><thead><tr><th>System</th><th>€/m²</th><th>Min. m²</th><th>max. Maße (B × H mm)</th><th>Aktiv</th><th>Verlauf</th></tr></thead><tbody>
          ${Object.entries(F.systeme).map(([k, s]) => `<tr>
            <td class="name" data-th="System">${textInput(`fenster.systeme.${k}.name`, s.name, "Systemname")}<span class="sub">${h(s.material || "")}${s.uf ? " · Uf " + dez(s.uf) : ""}</span></td>
            <td class="num" data-th="€/m²">${zahlInput(`fenster.systeme.${k}.preisProM2`, s.preisProM2, { label: s.name + " Preis je m²" })}<span class="einheit">€/m²</span><span class="fehler-text" data-fehler="fenster.systeme.${k}.preisProM2"></span></td>
            <td class="num" data-th="Min. m²"><span class="muted">${dez(g.mindestflaecheM2)} m²</span></td>
            <td data-th="max. Maße"><span class="masse">${zahlInput(`fenster.systeme.${k}.breiteMaxMm`, s.breiteMaxMm, { label: s.name + " Breite max." })} × ${zahlInput(`fenster.systeme.${k}.hoeheMaxMm`, s.hoeheMaxMm, { label: s.name + " Höhe max." })}</span><span class="fehler-text" data-fehler="fenster.systeme.${k}.breiteMaxMm"></span><span class="fehler-text" data-fehler="fenster.systeme.${k}.hoeheMaxMm"></span></td>
            <td data-th="Aktiv">${toggle(`fenster.systeme.${k}.aktiv`, s.aktiv, s.name + " aktiv")}</td>
            <td data-th="Verlauf"><span data-spark="${k}"><span class="spark--leer">…</span></span></td></tr>`).join("")}
          </tbody><tfoot><tr><td colspan="6">Leere Maximalmaße = allgemeine Fenstergrenzen. Unter der Mindestfläche wird die Mindestfläche berechnet. Inaktive Systeme erscheinen nicht im Konfigurator. Verlauf: €/m² über die letzten gespeicherten Versionen.</td></tr></tfoot></table></div></section>
        ${feldTable("grenzen", "Grenzen Fenster", [["fenster.grenzen.breiteMinMm", "Breite min.", g.breiteMinMm, "mm"], ["fenster.grenzen.breiteMaxMm", "Breite max.", g.breiteMaxMm, "mm"], ["fenster.grenzen.hoeheMinMm", "Höhe min.", g.hoeheMinMm, "mm"], ["fenster.grenzen.hoeheMaxMm", "Höhe max.", g.hoeheMaxMm, "mm"], ["fenster.grenzen.mindestflaecheM2", "Mindestfläche", g.mindestflaecheM2, "m²"], ["fenster.grenzen.mengeMax", "Menge max.", g.mengeMax, "Stück"]])}
        ${mapTable("typen", "Fenstertyp", "fenster.typen", F.typen, [{ key: "zuschlagProzent", label: "Zuschlag", einheit: "%" }], { aktiv: true })}
        ${mapTable("farben", "Farben & Dekore", "fenster.farben", F.farben, [{ key: "zuschlagProzent", label: "Zuschlag", einheit: "%" }], { aktiv: true, loeschbar: true, neu: { name: "Neue Farbe", zuschlagProzent: 0 }, neuLabel: "Farbe" })}
        ${mapTable("glas", "Verglasung", "fenster.glas", F.glas, [{ key: "zuschlagProM2", label: "Zuschlag", einheit: "€/m²" }], { aktiv: true, loeschbar: true, neu: { name: "Neues Glas", zuschlagProM2: 0 }, neuLabel: "Glas" })}
        ${mapTable("sprossen", "Sprossen", "fenster.sprossen", F.sprossen, [{ key: "zuschlagProElement", label: "Zuschlag", einheit: "€/Element" }], { aktiv: true })}
        ${mapTable("rollladen", "Rollladen", "fenster.rollladen", F.rollladen, [{ key: "zuschlagProM2", label: "Zuschlag", einheit: "€/m²" }], { aktiv: true })}
        ${mapTable("extras", "Extras", "fenster.zusaetze", F.zusaetze, [{ key: "art", label: "Art", typ: "select", optionen: [["proElement", "je Element"], ["proLfm", "je lfm Breite"]] }, { key: "zuschlag", label: "Zuschlag", einheit: "€" }], { aktiv: true, loeschbar: true, neu: { name: "Neues Extra", art: "proElement", zuschlag: 0 }, neuLabel: "Extra" })}
        ${feldTable("montage", "Montage Fenster", [["fenster.montage.montageProElement", "Montage je Element", F.montage.montageProElement, "€"], ["fenster.montage.demontageEntsorgungProElement", "Demontage & Entsorgung je Element", F.montage.demontageEntsorgungProElement, "€"]])}`;
      else if (S.tab === "haustuer") el.innerHTML = `
        ${sub([["modelle", "Modelle"], ["grenzen", "Grenzen"], ["farben", "Farben"], ["glas", "Verglasung"], ["seitenteil", "Seitenteil"], ["extras", "Sicherheit & Komfort"], ["montage", "Montage"]])}
        ${mapTable("modelle", "Türmodelle", "haustuer.modelle", H.modelle, [{ key: "grundpreis", label: "Grundpreis", einheit: "€" }, { key: "kurz", label: "Kurzbeschreibung", typ: "text" }], { aktiv: true })}
        ${feldTable("grenzen", "Grenzen Haustür", [["haustuer.grenzen.breiteMinMm", "Breite min.", H.grenzen.breiteMinMm, "mm"], ["haustuer.grenzen.breiteMaxMm", "Breite max.", H.grenzen.breiteMaxMm, "mm"], ["haustuer.grenzen.hoeheMinMm", "Höhe min.", H.grenzen.hoeheMinMm, "mm"], ["haustuer.grenzen.hoeheMaxMm", "Höhe max.", H.grenzen.hoeheMaxMm, "mm"], ["haustuer.grenzen.standardBreiteMaxMm", "Standardbreite bis", H.grenzen.standardBreiteMaxMm, "mm"], ["haustuer.grenzen.standardHoeheMaxMm", "Standardhöhe bis", H.grenzen.standardHoeheMaxMm, "mm"], ["haustuer.grenzen.uebergroesseProzent", "Zuschlag Übergröße", H.grenzen.uebergroesseProzent, "%"], ["haustuer.grenzen.mengeMax", "Menge max.", H.grenzen.mengeMax, "Stück"]], "Über Standardbreite/-höhe wird der Übergrößen-Zuschlag auf den Grundpreis berechnet.")}
        ${mapTable("farben", "Farben", "haustuer.farben", H.farben, [{ key: "zuschlagProzent", label: "Zuschlag", einheit: "%" }], { aktiv: true, loeschbar: true, neu: { name: "Neue Farbe", zuschlagProzent: 0 }, neuLabel: "Farbe" })}
        ${mapTable("glas", "Verglasung", "haustuer.glas", H.glas, [{ key: "zuschlagProElement", label: "Zuschlag", einheit: "€" }], { aktiv: true, loeschbar: true, neu: { name: "Neues Glas", zuschlagProElement: 0 }, neuLabel: "Glas" })}
        ${mapTable("seitenteil", "Seitenteil", "haustuer.seitenteil", H.seitenteil, [{ key: "zuschlagProElement", label: "Zuschlag", einheit: "€" }], { aktiv: true })}
        ${mapTable("extras", "Sicherheit & Komfort", "haustuer.zusaetze", H.zusaetze, [{ key: "zuschlag", label: "Zuschlag", einheit: "€" }], { aktiv: true, loeschbar: true, neu: { name: "Neues Extra", art: "proElement", zuschlag: 0 }, neuLabel: "Extra" })}
        ${feldTable("montage", "Montage Haustür", [["haustuer.montage.montageProElement", "Montage je Tür", H.montage.montageProElement, "€"], ["haustuer.montage.demontageEntsorgungProElement", "Demontage & Entsorgung je Tür", H.montage.demontageEntsorgungProElement, "€"]])}`;
      else if (S.tab === "schiebetuer") el.innerHTML = `
        <div class="alert alert--info">Der Online-Konfigurator berechnet derzeit <b>Fenster</b> und <b>Haustüren</b>. Hebe-Schiebetüren sind noch nicht enthalten – Grundpreise können hier bereits hinterlegt werden (gespeichert und versioniert, aber noch nicht auf der Website gerechnet).</div>
        ${mapTable("schiebetueren", "Grundpreise Hebe-Schiebetüren", "schiebetuer.systeme", (p.schiebetuer || {}).systeme || {}, [{ key: "preisProM2", label: "Preis", einheit: "€/m²" }], { loeschbar: true, neu: { name: "Neues System", preisProM2: 600 }, neuLabel: "System" })}`;
      else el.innerHTML = `
        ${sub([["allgemein", "Allgemein"], ["montage-f", "Montage Fenster"], ["montage-h", "Montage Haustür"], ["anfahrt", "Anfahrt"]])}
        ${feldTable("allgemein", "Allgemein", [["version", "Versionsbezeichnung der Preisliste (wird bei jeder Anfrage mitgespeichert)", p.version, "", "text"], ["onlineRabattProzent", "Online-Rabatt", p.onlineRabattProzent, "%"]])}
        ${feldTable("montage-f", "Montage Fenster", [["fenster.montage.montageProElement", "Montage je Element", F.montage.montageProElement, "€"], ["fenster.montage.demontageEntsorgungProElement", "Demontage & Entsorgung je Element", F.montage.demontageEntsorgungProElement, "€"]])}
        ${feldTable("montage-h", "Montage Haustür", [["haustuer.montage.montageProElement", "Montage je Tür", H.montage.montageProElement, "€"], ["haustuer.montage.demontageEntsorgungProElement", "Demontage & Entsorgung je Tür", H.montage.demontageEntsorgungProElement, "€"]])}
        ${feldTable("anfahrt", "Anfahrt", [["anfahrt.freiBisKm", "Anfahrt frei bis", (p.anfahrt || {}).freiBisKm, "km"], ["anfahrt.proKm", "Danach je km", (p.anfahrt || {}).proKm, "€"]], "Hinweis: Die Anfahrt wird im Online-Richtpreis derzeit nicht berechnet. Die Werte dienen als Information für Ihre Angebote.")}`;
      autosizeTexte(el);
      bindeFelder(el);
      zeigeFehler(PV.validierePreise(S.preise));
      if (S.tab === "fenster") zeichneSparks();
    };
    const aktualisiereLeiste = () => {
      const n = anzahlAenderungen();
      const leiste = $("#aktionsleiste"); if (!leiste) return;
      leiste.hidden = n === 0; $("#aend-zahl").textContent = n;
      const [a, b] = sysAktiv(); $("#kpi-sys").textContent = a; $("#kpi-sys-sub").textContent = `von ${b} Profilsystemen`;
      setDirty(n > 0);
    };
    const bindeFelder = (el) => {
      el.addEventListener("input", (e) => {
        const f = e.target; if (!f.dataset.pfad) return;
        let v;
        if (f.dataset.typ === "zahl") { v = zahl(f.value); if (v === null) { delP(S.preise, f.dataset.pfad); } else setP(S.preise, f.dataset.pfad, v); }
        else if (f.dataset.typ === "bool") { setP(S.preise, f.dataset.pfad, f.checked); const l = f.closest(".switch") && $(".lbl", f.closest(".switch")); if (l) l.textContent = f.checked ? "Aktiv" : "Aus"; }
        else { if (f.tagName === "TEXTAREA" && f.value.includes("\n")) f.value = f.value.replace(/[\r\n]+/g, " "); setP(S.preise, f.dataset.pfad, f.value); if (f.tagName === "TEXTAREA") wachse(f); }
        aktualisiereLeiste();
        zeigeFehler(PV.validierePreise(S.preise));
        zeichneCalc();
      });
      el.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.matches("textarea[data-typ=text]")) e.preventDefault(); });
      el.addEventListener("click", async (e) => {
        const an = e.target.closest("[data-anker]"); if (an) { e.preventDefault(); const z = $("#" + an.dataset.anker, el); if (z) z.scrollIntoView({ behavior: "smooth", block: "start" }); $$("[data-anker]", el).forEach((x) => x.setAttribute("aria-current", x === an)); return; }
        const d = e.target.closest("[data-del]"); if (d) { if (await bestaetigen("Eintrag entfernen", "Dieser Eintrag wird aus der Preisliste entfernt.", "Entfernen", true)) { delP(S.preise, d.dataset.del); aktualisiereLeiste(); zeichneTab(); zeichneCalc(); } return; }
        const n = e.target.closest("[data-neu]"); if (n) { const name = await modal({ titel: "Neuer Eintrag", feld: { label: "Bezeichnung (wie der Kunde sie sieht)" }, ok: "Anlegen" }); if (!name) return; const key = slug(name); const vorlage = JSON.parse(n.dataset.vorlage); vorlage.name = name; const map = getP(S.preise, n.dataset.neu) || {}; if (map[key]) return toast("Es gibt bereits einen Eintrag mit dieser Kennung.", "err"); map[key] = vorlage; setP(S.preise, n.dataset.neu, map); aktualisiereLeiste(); zeichneTab(); zeichneCalc(); }
      });
    };
    const zeigeFehler = (fehler) => {
      $$("[data-fehler]", main).forEach((e) => { e.textContent = ""; });
      $$("[data-pfad]", main).forEach((e) => { e.classList.remove("input--fehler"); const l = e.closest(".field"); if (l) l.classList.remove("field--fehler"); });
      fehler.forEach((f) => { const t = $(`[data-fehler="${CSS.escape(f.feld)}"]`, main); if (t) t.textContent = f.meldung; const i = $(`[data-pfad="${CSS.escape(f.feld)}"]`, main); if (i) { i.classList.add("input--fehler"); const l = i.closest(".field"); if (l) l.classList.add("field--fehler"); } });
      $("#preis-fehler").innerHTML = fehler.length ? `<div class="alert alert--err"><b>${fehler.length} Eingabe${fehler.length === 1 ? "" : "n"} ungültig – Speichern ist erst möglich, wenn alles stimmt:</b><ul>${fehler.slice(0, 12).map((f) => `<li>${f.feld ? "<code>" + h(f.feld) + "</code>: " : ""}${h(f.meldung)}</li>`).join("")}${fehler.length > 12 ? "<li>…</li>" : ""}</ul></div>` : "";
      $$("[data-p^=speichern]", main).forEach((b) => { b.disabled = fehler.length > 0; });
      return fehler.length === 0;
    };
    /* Testrechner */
    const bildFuer = (cfg) => {
      if (cfg.produkt === "haustuer") return `/assets/konfigurator/haustuer-${cfg.modell}-400.webp`;
      const typ = ["1-fluegelig", "2-fluegelig", "festverglasung"].includes(cfg.typ) ? cfg.typ : "1-fluegelig";
      return `/assets/konfigurator/typ-${typ}-400.webp`;
    };
    const zeichneCalc = () => {
      const t = S.test, p = S.preise, box = $("#calc");
      const F = p.fenster, H = p.haustuer;
      const opt = (map, sel) => Object.entries(map || {}).filter(([, e]) => e.aktiv !== false).map(([k, e]) => `<option value="${k}" ${sel === k ? "selected" : ""}>${h(e.name)}</option>`).join("");
      const cfg = t.produkt === "fenster"
        ? { produkt: "fenster", system: t.system, typ: t.typ, breiteMm: t.breiteMm, hoeheMm: t.hoeheMm, menge: t.menge, farbe: t.farbe, glas: t.glas, sprossen: t.sprossen, rollladen: t.rollladen, zusaetze: t.zusaetze.filter((z) => F.zusaetze[z]), montage: t.montage, demontage: t.demontage }
        : { produkt: "haustuer", modell: t.modell, breiteMm: t.breiteMm, hoeheMm: t.hoeheMm, menge: t.menge, farbe: H.farben[t.farbe] ? t.farbe : Object.keys(H.farben)[0], glas: t.glasT, seitenteil: t.seitenteil, zusaetze: t.zusaetze.filter((z) => H.zusaetze[z]), montage: t.montage, demontage: t.demontage };
      const ST = Steuer.texte(Steuer.satz(S.einst));
      let r; try { r = Preis.berechne(cfg, p, ST.satz); } catch (e) { r = { ok: false, fehler: [e.message] }; }
      const FEHLER = { breiteMin: "Breite unter Minimum", breiteMax: "Breite über Maximum", hoeheMin: "Höhe unter Minimum", hoeheMax: "Höhe über Maximum", mengeMin: "Menge zu klein", mengeMax: "Menge zu groß", system: "System fehlt", typ: "Typ fehlt", farbe: "Farbe fehlt", glas: "Glas fehlt", modell: "Modell fehlt" };
      const basis = r.ok ? r.positionen[0].betrag : 0, zuschlaege = r.ok ? r.positionen.slice(1).reduce((a, x) => a + x.betrag, 0) : 0;
      const ergebnis = r.ok ? `
        <div class="ergebnis"><div class="ergebnis__titel">Ergebnis Vorschau</div>
          <div class="ergebnis__body"><img class="ergebnis__bild" src="${bildFuer(cfg)}" alt="" width="112" height="112" loading="lazy"><div class="ergebnis__preis"><div class="preis-gross">${euro(r.endpreis)}</div><div class="preis-sub">Kunde sieht · ${h(ST.kurz)}</div></div></div>
          <div class="line"><span>Basis (${h(r.positionen[0].name)})</span><span class="wert">${euro(basis)}</span></div>
          <div class="line"><span>Zuschläge</span><span class="wert">${euro(zuschlaege)}</span></div>
          ${r.menge > 1 ? `<div class="line"><span>× ${r.menge} Stück</span><span class="wert">${euro(r.produkt)}</span></div>` : ""}
          ${r.rabatt ? `<div class="line"><span>Online-Rabatt −${r.rabattProzent} %</span><span class="wert">−${euro(r.rabatt)}</span></div>` : ""}
          <div class="line"><span>Montage${t.demontage && r.montage ? " + Demontage" : ""}</span><span class="wert">${euro(r.montage)}</span></div>
          ${ST.steuerLabel ? `<div class="line line--top"><span>${h(ST.summeLabel)} / ${h(ST.steuerLabel)}</span><span class="wert">${euro(r.summe)} / ${euro(r.steuer)}</span></div>` : `<div class="line line--top"><span>${h(ST.summeLabel)}</span><span class="wert">${euro(r.summe)}</span></div>`}
          <details><summary>Alle Rechenzeilen</summary>${r.positionen.map((x) => `<div class="line"><span>${h(x.name)}${x.detail ? " · " + h(x.detail) : ""}</span><span class="wert">${euro(x.betrag)}</span></div>`).join("")}<div class="line"><span>Ohne Online-Rabatt</span><span class="wert">${euro(r.ohneRabatt)}</span></div></details>
        </div>`
        : `<div class="ergebnis"><div class="err">Keine Berechnung: ${(r.fehler || []).map((f) => FEHLER[f] || f).join(", ")}</div></div>`;
      let diff = "";
      const ang = zahl(t.angebot);
      if (r.ok && ang != null && !isNaN(ang) && ang > 0) { const a = Math.round(ang * 100); const d = r.endpreis - a; const proz = (d / a) * 100; diff = `<div class="diff ${d > 0 ? "diff--neg" : ""}">Abweichung: ${d >= 0 ? "+" : "−"}${euro(Math.abs(d))} (${d >= 0 ? "+" : "−"}${Math.abs(proz).toFixed(2).replace(".", ",")} %) – Konfigurator liegt ${d > 0 ? "über" : d < 0 ? "unter" : "gleichauf mit"} Ihrem Angebot</div>`; }
      box.innerHTML = `<div class="calc__head"><span class="kpi__icon">${ICON_KPI.calc}</span><div><span class="eyebrow">Schnellkalkulation</span><h2>Testrechner</h2></div></div>
        <span class="small muted">Rechnet mit den Werten in diesem Formular – auch ungespeicherten.</span>
        <div class="seg" role="radiogroup" aria-label="Produkt"><button type="button" role="radio" aria-checked="${t.produkt === "fenster"}" data-tp="fenster">Fenster</button><button type="button" role="radio" aria-checked="${t.produkt === "haustuer"}" data-tp="haustuer">Haustür</button></div>
        <div class="grid">
          <label class="field">Breite (mm)<input type="text" inputmode="numeric" data-tf="breiteMm" value="${t.breiteMm}"></label>
          <label class="field">Höhe (mm)<input type="text" inputmode="numeric" data-tf="hoeheMm" value="${t.hoeheMm}"></label>
          ${t.produkt === "fenster" ? `<label class="field">Profil<select data-tf="system">${opt(F.systeme, t.system)}</select></label><label class="field">Typ<select data-tf="typ">${opt(F.typen, t.typ)}</select></label><label class="field">Verglasung<select data-tf="glas">${opt(F.glas, t.glas)}</select></label>` : `<label class="field">Modell<select data-tf="modell">${opt(H.modelle, t.modell)}</select></label><label class="field">Verglasung<select data-tf="glasT">${opt(H.glas, t.glasT)}</select></label><label class="field">Seitenteil<select data-tf="seitenteil">${opt(H.seitenteil, t.seitenteil)}</select></label>`}
          <label class="field">Farbe<select data-tf="farbe">${opt(t.produkt === "fenster" ? F.farben : H.farben, t.farbe)}</select></label>
          ${t.produkt === "fenster" ? `<label class="field">Sprossen<select data-tf="sprossen">${opt(F.sprossen, t.sprossen)}</select></label><label class="field">Rollladen<select data-tf="rollladen">${opt(F.rollladen, t.rollladen)}</select></label>` : ""}
          <label class="field">Menge<input type="text" inputmode="numeric" data-tf="menge" value="${t.menge}"></label>
        </div>
        <div class="checks">${Object.entries(t.produkt === "fenster" ? F.zusaetze : H.zusaetze).filter(([, e]) => e.aktiv !== false).map(([k, e]) => `<label class="check"><input type="checkbox" data-tz="${k}" ${t.zusaetze.includes(k) ? "checked" : ""}> ${h(e.name)}</label>`).join("")}
          <label class="check"><input type="checkbox" data-tf="montage" ${t.montage ? "checked" : ""}> Montage</label><label class="check"><input type="checkbox" data-tf="demontage" ${t.demontage ? "checked" : ""}> Demontage &amp; Entsorgung</label></div>
        <div class="conf">${h(cfg.produkt === "fenster" ? (F.systeme[cfg.system] || {}).name : (H.modelle[cfg.modell] || {}).name)} · ${cfg.breiteMm} × ${cfg.hoeheMm} mm · ${cfg.menge} Stk.</div>
        ${ergebnis}
        <label class="field">Mit eigenem Angebot vergleichen (€ Endpreis)<input type="text" inputmode="decimal" data-tf="angebot" value="${h(t.angebot)}" placeholder="z. B. 760,00"></label>${diff}
        <button type="button" class="btn btn--sm" data-tp="server">Vom Server nachrechnen lassen</button><span id="calc-server" class="small"></span>`;
      box.onchange = box.oninput = (e) => {
        const f = e.target;
        if (f.dataset.tf) { const k = f.dataset.tf; if (f.type === "checkbox") t[k] = f.checked; else if (["breiteMm", "hoeheMm", "menge"].includes(k)) t[k] = Math.round(zahl(f.value) || 0); else t[k] = f.value; if (k !== "angebot" || e.type === "change") zeichneCalc(); else { zeichneCalc(); const i = $("[data-tf=angebot]", box); i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
        if (f.dataset.tz) { t.zusaetze = f.checked ? [...t.zusaetze, f.dataset.tz] : t.zusaetze.filter((z) => z !== f.dataset.tz); zeichneCalc(); }
      };
      box.onclick = async (e) => {
        const b = e.target.closest("[data-tp]"); if (!b) return;
        if (b.dataset.tp === "server") { const rr = await api.post("rechnen", { konfiguration: cfg, preise: p }); $("#calc-server").innerHTML = rr.ok && rr.ergebnis.ok ? `<span class="ok">Server: ${euro(rr.ergebnis.endpreis)} – ${r.ok && rr.ergebnis.endpreis === r.endpreis ? "identisch ✓" : "WEICHT AB!"}</span>` : `<span class="err">${h(rr.error || (rr.ergebnis && rr.ergebnis.fehler.join(", ")) || "Fehler")}</span>`; return; }
        t.produkt = b.dataset.tp; t.zusaetze = []; t.farbe = "weiss"; if (t.produkt === "haustuer") { t.breiteMm = 1100; t.hoeheMm = 2100; } else { t.breiteMm = 1200; t.hoeheMm = 1400; } zeichneCalc();
      };
    };
    zeichneTab(); zeichneCalc();
    $("#preis-tabs").addEventListener("click", (e) => { const b = e.target.closest("[data-tab]"); if (!b) return; S.tab = b.dataset.tab; history.replaceState(null, "", "#preise/" + S.tab); $$("#preis-tabs .chip").forEach((c) => c.setAttribute("aria-selected", c === b)); zeichneTab(); });
    $("#konf-status").addEventListener("click", async (e) => {
      const b = e.target.closest("[data-status]"); if (!b) return;
      const neu = b.dataset.status, alt = S.einst.konfigurator.status;
      if (neu === alt) return;
      let bestaetigt = false;
      if (neu === "online") { bestaetigt = await bestaetigen("Konfigurator online schalten", "Der Konfigurator wird für alle Besucher sichtbar: Menüpunkt, Links auf den Produktseiten, Sitemap und Suchmaschinen. Die aktuelle Preisliste wird dabei veröffentlicht. Fortfahren?", "Ja, online schalten"); if (!bestaetigt) return; }
      if (PV.validierePreise(S.preise).length && neu !== "aus") return toast("Bitte zuerst die ungültigen Preise korrigieren.", "err");
      const r = await api.post("speichern", { bereich: "einstellungen", daten: { konfigurator: { status: neu } }, bestaetigt, beschreibung: "Konfigurator: " + neu, veroeffentlichen: true });
      if (!r.ok) return toast(r.error, "err");
      S.einst.konfigurator.status = neu;
      $$("#konf-status button").forEach((x) => x.setAttribute("aria-checked", x.dataset.status === neu));
      $("#kpi-konf").textContent = STATUS_LABEL[neu];
      toast("Status gespeichert: " + STATUS_LABEL[neu] + ".", "ok");
      if (r.veroeffentlichung) { if (r.veroeffentlichung.ok) { S.pub = r.veroeffentlichung.veroeffentlichung; startPoll(); toast("Veröffentlichung gestartet.", "ok"); } else toast(r.veroeffentlichung.error, r.veroeffentlichung.uebersprungen ? "" : "err"); }
      await ladeStatus(); const kt = $("#kpi-tests"); if (kt) kt.innerHTML = kpiTests();
    });
    main.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-p]"); if (!b) return;
      if (b.dataset.p === "verwerfen") { if (!(await bestaetigen("Änderungen verwerfen", `${anzahlAenderungen()} ungespeicherte Änderung(en) werden verworfen.`, "Verwerfen", true))) return; S.preise = klon(S.preiseOriginal); aktualisiereLeiste(); zeichneTab(); zeichneCalc(); return; }
      const fehler = PV.validierePreise(S.preise);
      if (!zeigeFehler(fehler)) return toast("Bitte die markierten Felder prüfen.", "err");
      const geaendert = JSON.stringify(S.preise) !== JSON.stringify(S.preiseOriginal);
      if (!geaendert) { toast("Keine Änderungen an den Preisen."); if (b.dataset.p === "speichern-pub") await veroeffentlichen("Preise"); return; }
      const beschreibung = await modal({ titel: "Änderung beschreiben", text: "Kurze Notiz für das Änderungsprotokoll (optional).", feld: { label: "Was wurde geändert?" }, ok: "Speichern" });
      if (beschreibung === null) return;
      const r = await api.post("speichern", { bereich: "preise", daten: S.preise, beschreibung, veroeffentlichen: b.dataset.p === "speichern-pub" });
      if (!r.ok) { if (r.fehler) zeigeFehler(r.fehler); toast(r.error, "err"); return; }
      S.preiseOriginal = klon(S.preise); aktualisiereLeiste();
      toast(`Preise gespeichert (${r.version.aenderungen} Änderung(en)).`, "ok");
      if (r.veroeffentlichung) { if (r.veroeffentlichung.ok) { S.pub = r.veroeffentlichung.veroeffentlichung; startPoll(); toast("Veröffentlichung gestartet – Tests laufen.", "ok"); } else toast(r.veroeffentlichung.error, r.veroeffentlichung.uebersprungen ? "" : "err"); }
      await ladeStatus(); const kt = $("#kpi-tests"); if (kt) kt.innerHTML = kpiTests();
      render();
    });
  };

  /* ---------- Bewertungen ---------- */
  VIEWS.bewertungen = async (main) => {
    const d = await api.get("daten", { bereich: "bewertungen" });
    if (!d.ok) throw new Error(d.error);
    const liste = Array.isArray(d.daten) ? d.daten : [];
    const offen = liste.filter((b) => b.status === "offen"), rest = liste.filter((b) => b.status !== "offen");
    S.bewertungenBadge = offen.length; renderNav();
    const sterne = (n) => `<span class="stars" aria-label="${n} Sterne">${"★".repeat(n)}${"☆".repeat(Math.max(0, 5 - n))}</span>`;
    const karte = (b) => `<div class="card anfrage"><div class="row row--between"><div><b>${h(b.name)}</b> · ${h(b.ort)}${b.projekt ? " · " + h(b.projekt) : ""} ${sterne(Number(b.sterne) || 0)}</div><span class="badge ${b.status === "freigegeben" ? "badge--ok" : b.status === "abgelehnt" ? "badge--err" : "badge--warn"}">${{ offen: "offen", freigegeben: "freigegeben", abgelehnt: "abgelehnt" }[b.status] || b.status}</span></div>
      <p class="quote">„${h(b.text)}“</p>
      <p class="small muted">Eingegangen ${fmtDT(b.eingegangen)}${b.email ? " · " + h(b.email) : ""}${b.kunde ? " · Kunde: " + h(b.kunde) : ""}${b.entschieden ? " · entschieden " + fmtDT(b.entschieden) + " von " + h(b.von || "") : ""}</p>
      <div class="row">${b.status !== "freigegeben" ? `<button type="button" class="btn btn--sm btn--primary" data-bw="freigegeben" data-id="${h(b.id)}">Freigeben</button>` : ""}${b.status !== "abgelehnt" ? `<button type="button" class="btn btn--sm btn--danger" data-bw="abgelehnt" data-id="${h(b.id)}">Ablehnen</button>` : ""}${b.status !== "offen" ? `<button type="button" class="btn btn--sm" data-bw="offen" data-id="${h(b.id)}">Zurück auf „offen“</button>` : ""}</div></div>`;
    main.innerHTML = `<div class="page-head"><div><h1>Bewertungen</h1><span class="muted">Nur freigegebene Bewertungen erscheinen auf der Website (/referenzen/). Bitte vor der Freigabe prüfen, ob der Auftrag tatsächlich ausgeführt wurde.</span></div><button type="button" class="btn btn--primary" data-bw="pub">Veröffentlichen</button></div>${pubBar()}
      <h2>Zu prüfen (${offen.length})</h2>${offen.map(karte).join("") || '<p class="muted">Keine offenen Bewertungen.</p>'}
      <h2>Entschieden (${rest.length})</h2>${rest.map(karte).join("") || '<p class="muted">Noch keine.</p>'}`;
    main.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-bw]"); if (!b) return;
      if (b.dataset.bw === "pub") return veroeffentlichen("Bewertungen");
      const r = await api.post("bewertung", { id: b.dataset.id, status: b.dataset.bw });
      if (!r.ok) return toast(r.error, "err");
      toast(b.dataset.bw === "freigegeben" ? "Freigegeben – bitte „Veröffentlichen“, damit sie auf der Website erscheint." : "Gespeichert.", "ok");
      render();
    });
  };

  /* ---------- Anfragen ---------- */
  VIEWS.anfragen = async (main) => {
    const d = await api.get("anfragen");
    if (!d.ok) throw new Error(d.error);
    const FORM = { kontakt: "Kontakt", "anfrage-leistungen": "Leistungen", "anfrage-produkte": "Produkte", "anfrage-einsatzgebiet": "Einsatzgebiet", "angebot-konfigurator": "Konfigurator" };
    const AUSBLENDEN = ["konfiguration", "preis_server", "preis_server_text", "preis_abweichung", "preisliste_version", "positionen", "preis_browser", "steuersatz_prozent", "datenschutz"];
    main.innerHTML = `<div class="page-head"><div><h1>Anfragen</h1><span class="muted">Alle Anfragen aus Formularen und Konfigurator (zusätzlich zur E-Mail-Benachrichtigung und zum Netlify-Dashboard). Konfigurator-Anfragen zeigen den vom Server nachgerechneten Preis.</span></div></div>
      <div class="chips" id="anf-filter">${[["alle", "Alle"], ...Object.entries(FORM)].map(([k, l]) => `<button type="button" class="chip" aria-selected="${k === "alle"}" data-f="${k}">${l}</button>`).join("")}</div>
      <div class="stack" id="anf-liste"></div>`;
    const zeichne = (f) => {
      const liste = d.anfragen.filter((a) => f === "alle" || a.formular === f);
      $("#anf-liste").innerHTML = liste.map((a) => {
        const k = a.felder || {};
        const konf = a.formular === "angebot-konfigurator";
        const abw = konf && /JA/.test(a.abweichung || "");
        return `<div class="card anfrage ${a.status === "erledigt" ? "is-erledigt" : ""}"><div class="row row--between"><div><span class="badge ${konf ? "" : "badge--grey"}">${FORM[a.formular] || a.formular}</span> <b>${h(k.name || "")}</b>${k.plz || k.ort ? " · " + h([k.plz, k.ort].filter(Boolean).join(" ")) : ""}</div><span class="small muted">${fmtDT(a.eingegangen)}</span></div>
          ${abw ? `<div class="alert alert--err"><b>Achtung:</b> Der im Browser angezeigte Preis (${k.preis_browser ? euro(Number(k.preis_browser)) : "?"}) weicht vom Serverpreis ab – mögliche Manipulation oder veraltete Preisliste. Maßgeblich ist der Serverpreis.</div>` : ""}
          <dl>${Object.entries(k).filter(([key]) => !AUSBLENDEN.includes(key) && key !== "name").map(([key, v]) => `<dt>${h(key)}</dt><dd>${key === "email" ? `<a href="mailto:${h(v)}">${h(v)}</a>` : key === "telefon" ? `<a href="tel:${h(v)}">${h(v)}</a>` : h(v)}</dd>`).join("")}</dl>
          ${konf ? `<details><summary>Konfiguration &amp; Preis (Server)</summary><dl><dt>Serverpreis</dt><dd><b>${a.preisServer ? euro(a.preisServer) : h(k.preis_server_text || "–")}</b> ${k.preis_server_text ? "· " + h(k.preis_server_text) : ""}</dd>${a.steuerProzent !== undefined && !isNaN(a.steuerProzent) ? `<dt>${h(Steuer.TITEL)} bei Anfrage</dt><dd>${h(Steuer.texte(a.steuerProzent).option)}</dd>` : ""}<dt>Browserpreis</dt><dd>${a.preisBrowser ? euro(a.preisBrowser) : "–"} · Abweichung: ${h(a.abweichung || "–")}</dd><dt>Preisliste</dt><dd>${h(a.preislisteVersion || "–")}</dd><dt>Positionen</dt><dd>${h(k.positionen || "–")}</dd><dt>Konfiguration</dt><dd><code class="small">${h(JSON.stringify(a.konfiguration))}</code></dd></dl></details>` : ""}
          <div class="row"><button type="button" class="btn btn--xs" data-st="${a.status === "erledigt" ? "neu" : "erledigt"}" data-id="${h(a.id)}">${a.status === "erledigt" ? "Als neu markieren" : "Als erledigt markieren"}</button>${a.status === "erledigt" ? '<span class="badge badge--ok">erledigt</span>' : ""}</div></div>`;
      }).join("") || '<p class="muted">Keine Anfragen.</p>';
    };
    zeichne("alle");
    $("#anf-filter").addEventListener("click", (e) => { const b = e.target.closest("[data-f]"); if (!b) return; $$("#anf-filter .chip").forEach((c) => c.setAttribute("aria-selected", c === b)); zeichne(b.dataset.f); });
    main.addEventListener("click", async (e) => { const b = e.target.closest("[data-st]"); if (!b) return; const r = await api.post("anfrage-status", { id: b.dataset.id, status: b.dataset.st }); if (r.ok) render(); else toast(r.error, "err"); });
  };

  /* ---------- Änderungsprotokoll (Versionen) ---------- */
  VIEWS.versionen = async (main) => {
    const d = await api.get("versionen");
    if (!d.ok) throw new Error(d.error);
    main.innerHTML = `<div class="page-head"><div><h1>Änderungsprotokoll</h1><span class="muted">Jede Speicherung ist eine Version: wer, wann, was. „Wiederherstellen“ übernimmt den Stand und veröffentlicht ihn (mit allen Tests).</span></div></div>${pubBar()}
      <div class="card"><div class="list" id="v-liste">${d.versionen.map((v) => `<div class="version"><span><b>${fmtDT(v.wann)}</b> · ${h(v.titel)} · ${h(v.wer)} · ${v.aenderungen} Änderung(en)${v.beschreibung ? " · <i>" + h(v.beschreibung) + "</i>" : ""}</span><span class="row"><button type="button" class="btn btn--xs" data-diff="${h(v.id)}">Details</button><button type="button" class="btn btn--sm" data-restore="${h(v.id)}">Wiederherstellen</button></span></div><div class="diff" data-diff-box="${h(v.id)}" hidden></div>`).join("") || '<p class="muted">Noch keine Versionen.</p>'}</div></div>`;
    main.addEventListener("click", async (e) => {
      const r = e.target.closest("[data-restore]"); if (r) return wiederherstellen(r.dataset.restore);
      const b = e.target.closest("[data-diff]"); if (!b) return;
      const box = $(`[data-diff-box="${CSS.escape(b.dataset.diff)}"]`, main);
      if (!box.hidden) { box.hidden = true; return; }
      const v = await api.get("version", { id: b.dataset.diff });
      const fmt = (x) => (x === null || x === undefined ? "<i>leer</i>" : typeof x === "object" ? h(JSON.stringify(x)) : h(String(x)).slice(0, 300));
      box.innerHTML = v.ok ? `<div class="table-wrap"><table class="tbl tbl--karten diff-tbl"><thead><tr><th>Feld</th><th>Vorher</th><th>Nachher</th></tr></thead><tbody>${v.version.diff.map((x) => `<tr><td class="name" data-th="Feld"><code>${h(x.pfad)}</code></td><td class="alt" data-th="Vorher">${fmt(x.alt)}</td><td class="neu" data-th="Nachher">${fmt(x.neu)}</td></tr>`).join("") || "<tr><td colspan=3>Keine Feldänderungen (z. B. identischer Stand).</td></tr>"}</tbody></table></div>` : `<p class="fehler-text">${h(v.error)}</p>`;
      box.hidden = false;
    });
  };

  /* ---------- Zugriffsprotokoll ---------- */
  VIEWS.protokoll = async (main) => {
    const d = await api.get("protokoll");
    if (!d.ok) throw new Error(d.error);
    main.innerHTML = `<div class="page-head"><div><h1>Zugriffsprotokoll</h1><span class="muted">Anmeldungen (erfolgreich und fehlgeschlagen), Änderungen und Veröffentlichungen – die letzten 500 Einträge. IP-Adressen sind gekürzt.</span></div></div>
      <div class="card"><div class="table-wrap"><table class="tbl tbl--karten"><thead><tr><th>Zeit</th><th>Typ</th><th>Details</th><th>Wer</th><th>IP</th></tr></thead><tbody>${d.protokoll.map((p) => `<tr><td class="name nowrap" data-th="Zeit">${fmtDT(p.wann)}</td><td data-th="Typ"><span class="badge ${/fehler|gesperrt/.test(p.typ) ? "badge--err" : /login|einrichtung/.test(p.typ) ? "badge--ok" : "badge--grey"}">${h(p.typ)}</span></td><td data-th="Details">${h(p.text)}</td><td data-th="Wer">${h(p.wer || "")}</td><td class="small muted" data-th="IP">${h(p.ip || "")}</td></tr>`).join("") || "<tr><td colspan=5>Noch keine Einträge.</td></tr>"}</tbody></table></div></div>`;
  };

  /* ---------- Konto ---------- */
  VIEWS.konto = async (main) => {
    const d = await api.get("konto");
    if (!d.ok) throw new Error(d.error);
    const k = d.konto; S.konto = k;
    const staerke = (pw) => { let s = 0; if (pw.length >= 12) s++; if (pw.length >= 16) s++; if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++; if (/\d/.test(pw) && /[^\w]/.test(pw)) s++; return s; };
    main.innerHTML = `<div class="page-head"><div><h1>Konto</h1><span class="muted">Zugangsdaten und E-Mail-Benachrichtigungen verwalten.</span></div></div>
      <div class="grid grid--konto">
        <form class="card" id="f-email" novalidate><h2>E-Mail-Adresse ändern</h2><p class="small muted">Mit dieser Adresse melden Sie sich an. Wir senden einen Bestätigungslink an die neue Adresse; erst danach wird sie aktiv.</p>
          <label class="field">Aktuelle E-Mail<input type="email" readonly value="${h(k.email)}"></label>
          <label class="field">Neue E-Mail<input type="email" name="email" autocomplete="email" placeholder="name@beispiel.de" required></label>
          <label class="field">Passwort zur Bestätigung<input type="password" name="passwort" autocomplete="current-password" required></label>
          <button type="submit" class="btn btn--dark">Bestätigungslink senden</button><div class="hint" id="email-hinweis"></div></form>
        <form class="card" id="f-pw" novalidate><h2>Passwort ändern</h2>
          <label class="field">Aktuelles Passwort<input type="password" name="aktuell" autocomplete="current-password" required></label>
          <label class="field">Neues Passwort<input type="password" name="neu" autocomplete="new-password" minlength="12" required></label>
          <div class="stack"><div class="grid" id="pw-balken"></div><span class="small" id="pw-text">Mindestens 12 Zeichen</span></div>
          <label class="field">Neues Passwort wiederholen<input type="password" name="neu2" autocomplete="new-password" required></label>
          <button type="submit" class="btn btn--primary">Passwort speichern</button></form>
        <form class="card" id="f-notify" novalidate><h2>Benachrichtigungen</h2><p class="small muted">An diese Adresse senden wir neue Anfragen und Bewertungen${S.hooks.mail === false ? " (der E-Mail-Versand ist noch nicht eingerichtet)" : ""}.</p>
          <label class="field">E-Mail für Benachrichtigungen<input type="email" name="email" value="${h((k.notify || {}).email || k.email)}" required></label>
          <label class="check"><input type="checkbox" name="anfragen" ${(k.notify || {}).anfragen !== false ? "checked" : ""}> Neue Anfragen per E-Mail</label>
          <label class="check"><input type="checkbox" name="bewertungen" ${(k.notify || {}).bewertungen !== false ? "checked" : ""}> Neue Bewertungen zur Prüfung</label>
          <button type="submit" class="btn">Speichern</button></form>
        <div class="card" id="k-sicherheit"><h2>Sicherheit</h2>
          <div class="kv"><span>Zwei-Faktor-Anmeldung (Code per App)</span><span class="badge ${k.totp ? "badge--ok" : "badge--grey"}">${k.totp ? "aktiv" : "aus"}</span></div>
          <p class="small muted">Zusätzlich zum Passwort wird beim Anmelden ein 6-stelliger Code aus einer Authenticator-App (z. B. Google Authenticator, Microsoft Authenticator, Aegis) verlangt.</p>
          <div id="totp-box">${k.totp ? '<button type="button" class="btn btn--sm" data-k="totp-aus">Zwei-Faktor deaktivieren</button>' : '<button type="button" class="btn btn--sm btn--primary" data-k="totp-start">Zwei-Faktor einrichten</button>'}</div>
          <hr class="divider"><p class="small">Letzte Anmeldung: ${fmtDT(k.letzteAnmeldung)} · Konto seit ${fmtD(k.erstellt)}</p>
          <button type="button" class="btn btn--sm btn--danger" data-k="alle-abmelden">Auf allen Geräten abmelden</button></div>
      </div>`;
    const pwNeu = $("#f-pw [name=neu]");
    const zeichneStaerke = () => { const s = staerke(pwNeu.value); $("#pw-balken").innerHTML = [0, 1, 2, 3].map((i) => `<span class="progress"><span class="${i < s ? "is-on" : ""}"></span></span>`).join(""); $$("#pw-balken .progress > span").forEach((b, i) => { b.style.width = i < s ? "100%" : "0"; b.style.background = s >= 3 ? "#2e9a5a" : s === 2 ? "#b7791f" : "#a02b2b"; }); $("#pw-text").textContent = pwNeu.value.length < 12 ? `Noch ${12 - pwNeu.value.length} Zeichen bis zur Mindestlänge` : s >= 3 ? "Stark · mindestens 12 Zeichen ✓" : "Ausreichend – länger und mit Zahlen/Sonderzeichen wird es stärker"; };
    pwNeu.addEventListener("input", zeichneStaerke); zeichneStaerke();
    $("#f-email").addEventListener("submit", async (e) => { e.preventDefault(); const fd = new FormData(e.target); const r = await api.post("email-aendern", { email: fd.get("email"), passwort: fd.get("passwort") }); $("#email-hinweis").innerHTML = r.ok ? `<span class="alert alert--ok">${h(r.hinweis)}${r.link ? `<br><a href="${h(r.link)}">${h(r.link)}</a>` : ""}</span>` : `<span class="fehler-text">${h(r.error)}</span>`; if (r.ok) e.target.reset(); });
    $("#f-pw").addEventListener("submit", async (e) => { e.preventDefault(); const fd = new FormData(e.target); if (fd.get("neu") !== fd.get("neu2")) return toast("Die neuen Passwörter stimmen nicht überein.", "err"); const r = await api.post("passwort-aendern", { aktuell: fd.get("aktuell"), neu: fd.get("neu") }); if (r.ok) { S.csrf = r.csrf; toast("Passwort geändert. Andere Geräte wurden abgemeldet.", "ok"); e.target.reset(); zeichneStaerke(); } else toast(r.error, "err"); });
    $("#f-notify").addEventListener("submit", async (e) => { e.preventDefault(); const fd = new FormData(e.target); const r = await api.post("benachrichtigungen", { email: fd.get("email"), anfragen: !!fd.get("anfragen"), bewertungen: !!fd.get("bewertungen") }); toast(r.ok ? "Benachrichtigungen gespeichert." : r.error, r.ok ? "ok" : "err"); });
    main.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-k]"); if (!b) return;
      if (b.dataset.k === "alle-abmelden") { if (!(await bestaetigen("Auf allen Geräten abmelden", "Alle Sitzungen – auch diese – werden beendet. Sie müssen sich neu anmelden.", "Abmelden", true))) return; await api.post("ueberall-abmelden"); S.csrf = null; zeigeAuth(); loginForm({ hinweis: "Alle Sitzungen wurden beendet." }); }
      if (b.dataset.k === "totp-start") {
        const r = await api.post("totp-start"); if (!r.ok) return toast(r.error, "err");
        let qr = "";
        try { await ladeScript("/js/vendor/qrcode-generator-2.0.4.js"); const q = window.qrcode(0, "M"); q.addData(r.url); q.make(); qr = q.createSvgTag({ scalable: true, margin: 2 }); } catch (err) { qr = ""; }
        $("#totp-box").innerHTML = `<div class="stack"><p class="small">1. Scannen Sie den Code mit Ihrer Authenticator-App – oder geben Sie den Schlüssel von Hand ein.</p><div class="qr">${qr}</div><code class="secret">${h(r.secret)}</code><p class="small">2. Geben Sie den aktuellen 6-stelligen Code aus der App ein:</p><form id="f-totp" class="row"><input class="input" type="text" inputmode="numeric" autocomplete="one-time-code" name="code" maxlength="7" required aria-label="Code"><button type="submit" class="btn btn--sm btn--primary">Aktivieren</button><button type="button" class="btn btn--sm" data-k="totp-abbruch">Abbrechen</button></form></div>`;
        $("#f-totp").addEventListener("submit", async (ev) => { ev.preventDefault(); const rr = await api.post("totp-aktivieren", { code: new FormData(ev.target).get("code") }); if (rr.ok) { toast("Zwei-Faktor-Anmeldung aktiviert.", "ok"); render(); } else toast(rr.error, "err"); });
      }
      if (b.dataset.k === "totp-abbruch") render();
      if (b.dataset.k === "totp-aus") { const pw = await modal({ titel: "Zwei-Faktor deaktivieren", text: "Bitte zur Bestätigung Ihr Passwort eingeben.", feld: { label: "Passwort", typ: "password", autocomplete: "current-password" }, ok: "Deaktivieren", gefaehrlich: true }); if (!pw) return; const r = await api.post("totp-deaktivieren", { passwort: pw }); if (r.ok) { toast("Zwei-Faktor-Anmeldung deaktiviert.", "ok"); render(); } else toast(r.error, "err"); }
    });
  };

  /* ---------- Platzhalter: Angebote & Rechnungen ---------- */
  VIEWS.angebote = async (main) => {
    main.innerHTML = `<div class="page-head"><div><h1>Angebote &amp; Rechnungen</h1><span class="muted">Dieses Modul ist vorbereitet, aber noch nicht freigeschaltet.</span></div></div>
      <div class="card"><p>Geplant: Angebote aus Anfragen und Konfigurator-Konfigurationen erstellen, als PDF versenden, Rechnungen schreiben und den Status verfolgen. Bis dahin bleiben Anfragen unter <a href="#anfragen">Anfragen</a> einsehbar.</p><p class="small muted">Für Entwickler: Menüeintrag aktivieren mit <code>localStorage.setItem("fw-modul-angebote","an")</code>.</p></div>`;
  };

  /* ---------- Start ---------- */
  start();
  window.FWAdmin = { $, $$, h, api, toast, modal, bestaetigen, S, I, VIEWS, setDirty, startPoll, ladeStatus, render, renderNav, fmtDT, fmtD, euro, PV, Steuer, pubHtml, bildVerarbeiten: verarbeite };
})();
