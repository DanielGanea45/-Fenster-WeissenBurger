/* Fenster-WeissenBurger – Admin-Oberfläche (/admin/). Eine Seite, Bereiche per #hash.
   Spricht mit den Netlify Functions admin-auth und admin-api (Sitzung im httpOnly-Cookie, CSRF-Header).
   Keine Inline-Styles (CSP), keine Fremddienste. Preisrechner: dasselbe js/preis.js wie auf der Website. */
(function () {
  "use strict";
  const AUTH = "/.netlify/functions/admin-auth";
  const API = "/.netlify/functions/admin-api";
  const BILD = "/.netlify/functions/admin-bild";
  const Preis = window.FWPreis;
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
    try { j = await r.json(); } catch (e) { j = { ok: false, error: r.status === 404 ? "Admin-Bereich nicht verfügbar (404)." : "Unerwartete Antwort (" + r.status + ")." }; }
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
      try {
        const r = await api.auth("einrichten", { token, name: fd.get("name"), email: fd.get("email"), passwort: fd.get("p1") });
        if (r.ok) { S.csrf = r.csrf; history.replaceState(null, "", "/admin/#konto"); toast("Konto angelegt. Willkommen!", "ok"); await starteApp(); }
        else einrichtenForm(token, { fehler: r.error, name: fd.get("name"), email: fd.get("email") });
      } catch (err) { einrichtenForm(token, { fehler: err.message }); }
    });
  }
  $("#auth-form").addEventListener("click", (e) => { const b = e.target.closest("[data-auth]"); if (!b) return; if (b.dataset.auth === "vergessen") vergessenForm(); if (b.dataset.auth === "login") loginForm(); });

  async function start() {
    const q = new URLSearchParams(location.search);
    let st;
    try { st = await call(AUTH); } catch (e) { zeigeAuth(); authForm(`<div class="stack"><h2>Nicht erreichbar</h2>${fehlerBox(e.message)}</div>`); return; }
    if (st.status === 404) { zeigeAuth(); authForm(`<div class="stack"><h2>Admin nicht aktiviert</h2><div class="alert alert--info">Der Admin-Bereich ist auf dieser Website noch nicht freigeschaltet. Bitte die Umgebungsvariable <b>ADMIN_SETUP_TOKEN</b> in Netlify setzen (siehe README).</div></div>`); return; }
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
      return authForm(`<div class="stack"><h2>Noch kein Konto</h2><div class="alert alert--info">Der Zugang wird einmalig über den Einrichtungslink angelegt:<br><code>/admin/?token=…</code><br>Den Link finden Sie in der README (Abschnitt „So melden Sie sich an“).</div></div>`);
    }
    if (st.angemeldet) { S.csrf = st.csrf; S.name = st.name; S.email = st.email; return starteApp(); }
    zeigeAuth(); loginForm();
  }

  /* ====================================================================
     App-Rahmen: Navigation, Routing, Veröffentlichungsstatus
     ==================================================================== */
  const NAV = [
    { id: "uebersicht", label: "Übersicht" },
    { id: "bilder", label: "Bilder" },
    { id: "texte", label: "Texte" },
    { id: "preise", label: "Preise & Konfigurator" },
    { id: "bewertungen", label: "Bewertungen", badge: "bewertungen" },
    { id: "anfragen", label: "Anfragen", badge: "anfragen" },
    { id: "versionen", label: "Änderungsprotokoll" },
    { id: "protokoll", label: "Zugriffsprotokoll", sub: true },
    { id: "konto", label: "Konto" },
    { id: "angebote", label: "Angebote & Rechnungen", hidden: true }, // Platzhalter für ein späteres Modul
  ];
  const TITEL = { uebersicht: "Übersicht", bilder: "Bilder", texte: "Texte", preise: "Preise & Konfigurator", bewertungen: "Bewertungen", anfragen: "Anfragen", versionen: "Änderungsprotokoll", protokoll: "Zugriffsprotokoll", konto: "Konto", angebote: "Angebote & Rechnungen" };
  function navHtml(aktiv) {
    return NAV.filter((n) => !n.hidden || localStorage.getItem("fw-modul-" + n.id) === "an").map((n) => `<a href="#${n.id}" class="${n.sub ? "nav--sub" : ""}" ${aktiv === n.id ? 'aria-current="page"' : ""}>${h(n.label)}${n.badge && S[n.badge + "Badge"] ? `<span class="badge ${n.badge === "anfragen" ? "badge--grey" : ""}">${S[n.badge + "Badge"]}</span>` : ""}</a>`).join("");
  }
  function route() { const [id, sub] = (location.hash || "#uebersicht").slice(1).split("/"); return { id: TITEL[id] ? id : "uebersicht", sub }; }
  function renderNav() { const r = route(); $("#nav-side").innerHTML = navHtml(r.id); $("#nav-drawer").innerHTML = navHtml(r.id); $$("#app .mnav a").forEach((a) => a.toggleAttribute("aria-current", a.dataset.nav === r.id) || (a.dataset.nav === r.id ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"))); $("#mhead-title").textContent = TITEL[r.id]; $("#ctx-side").textContent = S.kontext && S.kontext !== "production" ? "Umgebung: " + S.kontext : ""; }

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
    $("#drawer").hidden = true;
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
    if (p.status === "laeuft") return `<span class="pill pill--warn pill--busy">Veröffentlichung läuft …</span><span>gestartet ${fmtDT(p.start)}${p.ausloeser ? " · " + h(p.ausloeser) : ""}</span>`;
    if (p.status === "fehler") return `<span class="pill pill--err">Nicht veröffentlicht – Fehler</span><span class="strong">${h(p.fehler || "")}</span><span>Die bisherige Version bleibt online. ${letzte}</span>`;
    if (p.status === "unbekannt") return `<span class="pill pill--warn">Status unbekannt</span><span>${h(p.hinweis || "")}</span>`;
    if (p.status === "veroeffentlicht") return `<span class="pill pill--ok">Website online</span><span>${letzte} · Tests bestanden${p.dauerMs ? " · " + Math.round(p.dauerMs / 1000) + " s" : ""}</span>`;
    return `<span class="pill pill--ok">Website online</span><span>${letzte}</span>`;
  }
  function pubBar(extraBtn) { return `<div class="pubbar" id="pubbar">${pubHtml()}${extraBtn || ""}</div>`; }
  async function ladeStatus() { try { const r = await api.get("status"); S.pub = r.veroeffentlichung; const el = $("#pubbar"); if (el) { const btn = $(".btn", el); el.innerHTML = pubHtml() + (btn ? btn.outerHTML : ""); } if (S.pub.status === "laeuft") startPoll(); else stopPoll(); } catch (e) { /* egal */ } }
  function startPoll() { if (S.pollTimer) return; S.pollTimer = setInterval(async () => { const alt = S.pub && S.pub.status; await ladeStatus(); if (alt === "laeuft" && S.pub.status !== "laeuft") toast(S.pub.status === "veroeffentlicht" ? "Website veröffentlicht – alle Tests bestanden." : "Veröffentlichung fehlgeschlagen: " + (S.pub.fehler || ""), S.pub.status === "veroeffentlicht" ? "ok" : "err"); }, 8000); }
  function stopPoll() { if (S.pollTimer) { clearInterval(S.pollTimer); S.pollTimer = null; } }
  async function veroeffentlichen(grund) {
    const r = await api.post("veroeffentlichen", { grund: grund || "Manuell" });
    if (r.ok) { S.pub = r.veroeffentlichung; toast("Veröffentlichung gestartet – Tests laufen. Das dauert etwa 1–2 Minuten.", "ok"); startPoll(); }
    else { if (r.veroeffentlichung) S.pub = r.veroeffentlichung; toast(r.error || "Veröffentlichung nicht möglich.", "err"); }
    await ladeStatus();
    return r.ok;
  }

  /* Globale Klicks (Abmelden, Drawer) */
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    if (b.dataset.act === "abmelden") { e.preventDefault(); await api.auth("abmelden"); S.csrf = null; setDirty(false); location.hash = ""; zeigeAuth(); loginForm({ hinweis: "Sie wurden abgemeldet." }); }
    if (b.dataset.act === "drawer-auf") { $("#drawer").hidden = false; $("#nav-drawer a") && $("#nav-drawer a").focus(); }
    if (b.dataset.act === "drawer-zu") $("#drawer").hidden = true;
  });
  $("#drawer").addEventListener("click", (e) => { if (e.target === $("#drawer") || e.target.closest("a")) $("#drawer").hidden = true; });

  /* ====================================================================
     Ansichten
     ==================================================================== */
  const VIEWS = {};

  /* ---------- Übersicht ---------- */
  VIEWS.uebersicht = async (main) => {
    const d = await api.get("uebersicht");
    if (!d.ok) throw new Error(d.error);
    S.pub = d.veroeffentlichung; S.name = d.name; S.kontext = d.kontext; S.bewertungenBadge = d.bewertungenOffen || 0; S.anfragenBadge = d.anfragen.neuDieseWoche || 0; renderNav();
    S.hooks = { buildHook: d.buildHook, mail: d.mail };
    const letzte = d.versionen && d.versionen[0];
    const typText = (p) => ({ login: "Anmeldung", "login-fehler": "Fehlversuch", "login-gesperrt": "Zugang gesperrt", logout: "Abmeldung", gespeichert: "Gespeichert", veroeffentlichung: "Veröffentlichung", "veroeffentlichung-fehler": "Veröffentlichung fehlgeschlagen", bild: "Bild", bewertung: "Bewertung", wiederhergestellt: "Wiederhergestellt", einrichtung: "Einrichtung", "2fa": "Zwei-Faktor" }[p.typ] || p.typ);
    const warn = [];
    if (!d.buildHook) warn.push("<b>NETLIFY_BUILD_HOOK</b> fehlt – Änderungen können gespeichert, aber nicht veröffentlicht werden.");
    if (!d.mail) warn.push("<b>BREVO_API_KEY</b> fehlt – es werden keine E-Mails (Passwort vergessen, Benachrichtigungen) versendet.");
    main.innerHTML = `
      <div class="page-head"><div><h1>Guten Tag, ${h(S.name || "")}</h1><span class="muted">${S.pub.status === "fehler" ? "Die letzte Veröffentlichung ist fehlgeschlagen." : S.pub.status === "laeuft" ? "Eine Veröffentlichung läuft gerade." : "Alle Änderungen sind veröffentlicht."}</span></div>${pubHtml()}</div>
      ${warn.length ? `<div class="alert alert--warn">${warn.join("<br>")} Anleitung: README → „Umgebungsvariablen“.</div>` : ""}
      <div class="grid">
        <div class="card kpi"><span class="label">Neue Anfragen (7 Tage)</span><div class="value">${d.anfragen.neuDieseWoche}</div><a href="#anfragen">Ansehen →</a></div>
        <div class="card kpi"><span class="label">Bewertungen zu prüfen</span><div class="value value--accent">${d.bewertungenOffen}</div><a href="#bewertungen">Prüfen →</a></div>
        <div class="card kpi"><span class="label">Bilder auf der Website</span><div class="value">${d.bilder}</div><a href="#bilder">Verwalten →</a></div>
        <div class="card kpi"><span class="label">Letzte Änderung</span><div class="value value--sm">${letzte ? fmtDT(letzte.wann) : "–"}</div><span class="small muted">${letzte ? h(letzte.titel) + (letzte.beschreibung ? " · " + h(letzte.beschreibung) : "") : "Noch keine Änderungen"}</span></div>
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
      <div class="card"><div class="row row--between"><h2>Konfigurator</h2><span class="pill ${d.konfigurator === "online" ? "pill--ok" : d.konfigurator === "vorschau" ? "pill--warn" : ""}">${{ aus: "Aus", vorschau: "Vorschau", online: "Online" }[d.konfigurator]}</span></div><p class="muted">Preisliste ${h(d.preislisteVersion)} · <a href="#preise">Preise &amp; Schalter →</a></p></div>`;
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
        if (r.veroeffentlichung) { if (r.veroeffentlichung.ok) { S.pub = r.veroeffentlichung.veroeffentlichung; startPoll(); toast("Veröffentlichung gestartet.", "ok"); } else toast(r.veroeffentlichung.error, "err"); }
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
    const d = await api.get("daten", { bereich: "texte" });
    if (!d.ok) throw new Error(d.error);
    S.texte = d.daten; S.texteAend = S.texteAend || {};
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
        const html = bloeckeVon(S.seite).map(([id, blk]) => { const wert = S.texteAend[id] !== undefined && S.texteAend[id] !== null ? S.texteAend[id] : S.texteAend[id] === null ? d.daten.bloecke[id].html : blk.html; const ge = S.texteAend[id] !== undefined || blk.geaendert; return `<${blk.tag} class="${ge ? "is-geaendert" : ""}">${sanitizeClient(wert)}</${blk.tag}>`; }).join("");
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
        if (r.veroeffentlichung) { if (r.veroeffentlichung.ok) { S.pub = r.veroeffentlichung.veroeffentlichung; startPoll(); toast("Veröffentlichung gestartet.", "ok"); } else toast(r.veroeffentlichung.error, "err"); }
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

  /* ---------- Preise & Konfigurator ---------- */
  const TABS = [["fenster", "Fenster"], ["haustuer", "Haustüren"], ["schiebetuer", "Hebe-Schiebetüren"], ["allgemein", "Montage & Allgemein"]];
  function zahlInput(pfad, wert, opts = {}) { return `<input type="text" inputmode="decimal" data-pfad="${h(pfad)}" data-typ="zahl" value="${h(dez(wert))}" aria-label="${h(opts.label || pfad)}" ${opts.cls ? `class="${opts.cls}"` : ""}>`; }
  function textInput(pfad, wert, label) { return `<input type="text" data-pfad="${h(pfad)}" data-typ="text" value="${h(wert == null ? "" : wert)}" aria-label="${h(label || pfad)}">`; }
  function boolInput(pfad, wert, label) { return `<input type="checkbox" data-pfad="${h(pfad)}" data-typ="bool" ${wert !== false ? "checked" : ""} aria-label="${h(label || pfad)}">`; }
  function mapCard(titel, pfad, map, felder, opts = {}) {
    const rows = Object.entries(map || {}).map(([k, e]) => `<div class="kv"><span class="inline-input">${textInput(`${pfad}.${k}.name`, e.name, "Name")}</span><span class="inline-input">${felder.map((f) => f.typ === "select" ? `<select data-pfad="${pfad}.${k}.${f.key}" data-typ="text" aria-label="${f.label}">${f.optionen.map(([v, l]) => `<option value="${v}" ${e[f.key] === v ? "selected" : ""}>${l}</option>`).join("")}</select>` : zahlInput(`${pfad}.${k}.${f.key}`, e[f.key], { label: e.name + " " + f.label }) + " " + f.einheit).join(" ")}${opts.aktiv ? `<label class="check" title="Aktiv">${boolInput(`${pfad}.${k}.aktiv`, e.aktiv, "aktiv")}</label>` : ""}${opts.loeschbar ? `<button type="button" class="btn btn--xs btn--danger" data-del="${pfad}.${k}" aria-label="${h(e.name)} entfernen">✕</button>` : ""}</span></div><div class="fehler-text" data-fehler="${pfad}.${k}"></div>`).join("");
    return `<div class="card"><h2>${titel}</h2>${opts.hinweis ? `<p class="small muted">${opts.hinweis}</p>` : ""}${rows}${opts.neu ? `<button type="button" class="btn btn--dashed" data-neu="${pfad}" data-vorlage='${h(JSON.stringify(opts.neu))}'>+ ${opts.neuLabel || "Hinzufügen"}</button>` : ""}</div>`;
  }
  function feldKarte(titel, felder, hinweis) { return `<div class="card"><h2>${titel}</h2>${hinweis ? `<p class="small muted">${hinweis}</p>` : ""}<div class="grid">${felder.map(([pfad, label, wert, einheit]) => `<label class="field">${label}${einheit ? ` <span class="hint">(${einheit})</span>` : ""}${zahlInput(pfad, wert, { label })}<span class="fehler-text" data-fehler="${pfad}"></span></label>`).join("")}</div></div>`; }

  VIEWS.preise = async (main, sub) => {
    const [dp, de] = await Promise.all([api.get("daten", { bereich: "preise" }), api.get("daten", { bereich: "einstellungen" })]);
    if (!dp.ok) throw new Error(dp.error);
    S.preise = dp.daten; S.preiseOriginal = klon(dp.daten); S.einst = de.daten; S.pub = S.pub || null;
    if (sub && TABS.some(([k]) => k === sub)) S.tab = sub;
    if (!S.test) S.test = { produkt: "fenster", system: Object.keys(S.preise.fenster.systeme)[0], typ: Object.keys(S.preise.fenster.typen)[0], modell: Object.keys(S.preise.haustuer.modelle)[0], breiteMm: 1200, hoeheMm: 1400, menge: 1, farbe: "weiss", glas: Object.keys(S.preise.fenster.glas)[0], glasT: "standard", sprossen: "keine", rollladen: "keiner", seitenteil: "keines", zusaetze: [], montage: true, demontage: true, angebot: "" };
    main.innerHTML = `
      <div class="page-head"><div><h1>Preise &amp; Konfigurator</h1><span class="muted">Alle Preise netto in Euro. MwSt. und Online-Rabatt rechnet der Konfigurator automatisch – auf der Website und auf dem Server mit demselben Modul.</span></div>
        <div class="row"><a class="btn" href="#versionen">Änderungsprotokoll</a><button type="button" class="btn btn--dark" data-p="speichern">Speichern</button><button type="button" class="btn btn--primary" data-p="speichern-pub">Speichern &amp; veröffentlichen</button></div></div>
      <section class="card" aria-label="Konfigurator-Status"><div class="row row--between">
        <div class="stack"><b>Konfigurator auf der Website</b><span class="small muted">Aus: für Besucher unsichtbar („Demnächst verfügbar“). Vorschau: nur für Sie nach Anmeldung sichtbar, mit Banner, nicht für Suchmaschinen. Online: für alle sichtbar – Menüpunkt, Sitemap, Google.</span></div>
        <div class="seg" role="radiogroup" aria-label="Status" id="konf-status">${[["aus", "Aus"], ["vorschau", "Vorschau"], ["online", "Online"]].map(([k, l]) => `<button type="button" role="radio" class="seg--${k}" aria-checked="${S.einst.konfigurator.status === k}" data-status="${k}">${l}</button>`).join("")}</div>
        <div class="row small muted"><a href="/konfigurator/fenster/" target="_blank" rel="noopener">Fenster-Konfigurator ↗</a> · <a href="/konfigurator/haustuer/" target="_blank" rel="noopener">Haustür-Konfigurator ↗</a></div></div>
        ${pubBar()}</section>
      <div id="preis-fehler"></div>
      <div class="chips" role="tablist" aria-label="Produktbereich" id="preis-tabs">${TABS.map(([k, l]) => `<button type="button" role="tab" class="chip" aria-selected="${S.tab === k}" data-tab="${k}">${l}</button>`).join("")}</div>
      <div class="cols"><div class="col-main" id="preis-main"></div><aside class="col-side"><div class="card card--dark calc" id="calc"></div></aside></div>`;
    const zeichneTab = () => {
      const p = S.preise, F = p.fenster, H = p.haustuer, el = $("#preis-main");
      if (S.tab === "fenster") el.innerHTML = `
        <div class="card"><h2>1 · Grundpreise je Profilsystem</h2><div class="table-wrap"><table class="tbl"><thead><tr><th>System</th><th>Preis €/m²</th><th>Uf-Wert</th><th>Breite max. (mm)</th><th>Höhe max. (mm)</th><th>Aktiv</th></tr></thead><tbody>
          ${Object.entries(F.systeme).map(([k, s]) => `<tr><td class="name">${textInput(`fenster.systeme.${k}.name`, s.name, "Name")}<span class="small muted">${h(s.material || "")}</span></td><td>${zahlInput(`fenster.systeme.${k}.preisProM2`, s.preisProM2, { label: s.name + " Preis" })}<span class="fehler-text" data-fehler="fenster.systeme.${k}.preisProM2"></span></td><td>${zahlInput(`fenster.systeme.${k}.uf`, s.uf, { label: "Uf" })}<span class="fehler-text" data-fehler="fenster.systeme.${k}.uf"></span></td><td>${zahlInput(`fenster.systeme.${k}.breiteMaxMm`, s.breiteMaxMm, { label: "Breite max" })}<span class="fehler-text" data-fehler="fenster.systeme.${k}.breiteMaxMm"></span></td><td>${zahlInput(`fenster.systeme.${k}.hoeheMaxMm`, s.hoeheMaxMm, { label: "Höhe max" })}<span class="fehler-text" data-fehler="fenster.systeme.${k}.hoeheMaxMm"></span></td><td>${boolInput(`fenster.systeme.${k}.aktiv`, s.aktiv, s.name + " aktiv")}</td></tr>`).join("")}
        </tbody></table></div><span class="small muted">Leere Maximalmaße = allgemeine Fenstergrenzen. Unter der Mindestfläche wird die Mindestfläche berechnet. Inaktive Systeme erscheinen nicht im Konfigurator.</span></div>
        ${feldKarte("Grenzen Fenster", [["fenster.grenzen.breiteMinMm", "Breite min.", F.grenzen.breiteMinMm, "mm"], ["fenster.grenzen.breiteMaxMm", "Breite max.", F.grenzen.breiteMaxMm, "mm"], ["fenster.grenzen.hoeheMinMm", "Höhe min.", F.grenzen.hoeheMinMm, "mm"], ["fenster.grenzen.hoeheMaxMm", "Höhe max.", F.grenzen.hoeheMaxMm, "mm"], ["fenster.grenzen.mindestflaecheM2", "Mindestfläche", F.grenzen.mindestflaecheM2, "m²"], ["fenster.grenzen.mengeMax", "Menge max.", F.grenzen.mengeMax, "Stück"]])}
        <div class="grid grid--2">
          ${mapCard("2 · Fenstertyp", "fenster.typen", F.typen, [{ key: "zuschlagProzent", label: "Zuschlag", einheit: "%" }], { aktiv: true })}
          ${mapCard("3 · Farben & Dekore", "fenster.farben", F.farben, [{ key: "zuschlagProzent", label: "Zuschlag", einheit: "%" }], { aktiv: true, loeschbar: true, neu: { name: "Neue Farbe", zuschlagProzent: 0 }, neuLabel: "Farbe hinzufügen" })}
          ${mapCard("4 · Verglasung", "fenster.glas", F.glas, [{ key: "zuschlagProM2", label: "Zuschlag", einheit: "€/m²" }], { aktiv: true, loeschbar: true, neu: { name: "Neues Glas", zuschlagProM2: 0 }, neuLabel: "Glas hinzufügen" })}
          ${mapCard("5 · Sprossen", "fenster.sprossen", F.sprossen, [{ key: "zuschlagProElement", label: "Zuschlag", einheit: "€/Element" }], { aktiv: true })}
          ${mapCard("6 · Rollladen", "fenster.rollladen", F.rollladen, [{ key: "zuschlagProM2", label: "Zuschlag", einheit: "€/m²" }], { aktiv: true })}
          ${mapCard("7 · Extras", "fenster.zusaetze", F.zusaetze, [{ key: "art", label: "Art", typ: "select", optionen: [["proElement", "je Element"], ["proLfm", "je lfm Breite"]] }, { key: "zuschlag", label: "Zuschlag", einheit: "€" }], { aktiv: true, loeschbar: true, neu: { name: "Neues Extra", art: "proElement", zuschlag: 0 }, neuLabel: "Extra hinzufügen" })}
        </div>
        ${feldKarte("8 · Montage Fenster", [["fenster.montage.montageProElement", "Montage je Element", F.montage.montageProElement, "€"], ["fenster.montage.demontageEntsorgungProElement", "Demontage & Entsorgung je Element", F.montage.demontageEntsorgungProElement, "€"]])}`;
      else if (S.tab === "haustuer") el.innerHTML = `
        <div class="card"><h2>1 · Türmodelle</h2><div class="table-wrap"><table class="tbl"><thead><tr><th>Modell</th><th>Grundpreis €</th><th>Kurzbeschreibung</th><th>Aktiv</th></tr></thead><tbody>
          ${Object.entries(H.modelle).map(([k, m]) => `<tr><td class="name">${textInput(`haustuer.modelle.${k}.name`, m.name, "Name")}</td><td>${zahlInput(`haustuer.modelle.${k}.grundpreis`, m.grundpreis, { label: m.name + " Grundpreis" })}<span class="fehler-text" data-fehler="haustuer.modelle.${k}.grundpreis"></span></td><td><input type="text" class="w-lg" data-pfad="haustuer.modelle.${k}.kurz" data-typ="text" value="${h(m.kurz || "")}" aria-label="Kurzbeschreibung"></td><td>${boolInput(`haustuer.modelle.${k}.aktiv`, m.aktiv, m.name + " aktiv")}</td></tr>`).join("")}
        </tbody></table></div></div>
        ${feldKarte("Grenzen Haustür", [["haustuer.grenzen.breiteMinMm", "Breite min.", H.grenzen.breiteMinMm, "mm"], ["haustuer.grenzen.breiteMaxMm", "Breite max.", H.grenzen.breiteMaxMm, "mm"], ["haustuer.grenzen.hoeheMinMm", "Höhe min.", H.grenzen.hoeheMinMm, "mm"], ["haustuer.grenzen.hoeheMaxMm", "Höhe max.", H.grenzen.hoeheMaxMm, "mm"], ["haustuer.grenzen.standardBreiteMaxMm", "Standardbreite bis", H.grenzen.standardBreiteMaxMm, "mm"], ["haustuer.grenzen.standardHoeheMaxMm", "Standardhöhe bis", H.grenzen.standardHoeheMaxMm, "mm"], ["haustuer.grenzen.uebergroesseProzent", "Zuschlag Übergröße", H.grenzen.uebergroesseProzent, "%"], ["haustuer.grenzen.mengeMax", "Menge max.", H.grenzen.mengeMax, "Stück"]], "Über Standardbreite/-höhe wird der Übergrößen-Zuschlag auf den Grundpreis berechnet.")}
        <div class="grid grid--2">
          ${mapCard("2 · Farben", "haustuer.farben", H.farben, [{ key: "zuschlagProzent", label: "Zuschlag", einheit: "%" }], { aktiv: true, loeschbar: true, neu: { name: "Neue Farbe", zuschlagProzent: 0 }, neuLabel: "Farbe hinzufügen" })}
          ${mapCard("3 · Verglasung", "haustuer.glas", H.glas, [{ key: "zuschlagProElement", label: "Zuschlag", einheit: "€" }], { aktiv: true, loeschbar: true, neu: { name: "Neues Glas", zuschlagProElement: 0 }, neuLabel: "Glas hinzufügen" })}
          ${mapCard("4 · Seitenteil", "haustuer.seitenteil", H.seitenteil, [{ key: "zuschlagProElement", label: "Zuschlag", einheit: "€" }], { aktiv: true })}
          ${mapCard("5 · Sicherheit & Komfort", "haustuer.zusaetze", H.zusaetze, [{ key: "zuschlag", label: "Zuschlag", einheit: "€" }], { aktiv: true, loeschbar: true, neu: { name: "Neues Extra", art: "proElement", zuschlag: 0 }, neuLabel: "Extra hinzufügen" })}
        </div>
        ${feldKarte("6 · Montage Haustür", [["haustuer.montage.montageProElement", "Montage je Tür", H.montage.montageProElement, "€"], ["haustuer.montage.demontageEntsorgungProElement", "Demontage & Entsorgung je Tür", H.montage.demontageEntsorgungProElement, "€"]])}`;
      else if (S.tab === "schiebetuer") el.innerHTML = `
        <div class="alert alert--info">Der Online-Konfigurator berechnet derzeit <b>Fenster</b> und <b>Haustüren</b>. Hebe-Schiebetüren sind noch nicht enthalten – Sie können hier bereits Grundpreise hinterlegen (sie werden gespeichert und versioniert, aber noch nicht auf der Website gerechnet). Anfragen zu Schiebetüren laufen weiter über das Kontaktformular.</div>
        ${mapCard("Grundpreise Hebe-Schiebetüren", "schiebetuer.systeme", (p.schiebetuer || {}).systeme || {}, [{ key: "preisProM2", label: "Preis", einheit: "€/m²" }], { loeschbar: true, neu: { name: "Neues System", preisProM2: 600 }, neuLabel: "System hinzufügen" })}`;
      else el.innerHTML = `
        <div class="card"><h2>Allgemein</h2><div class="grid">
          <label class="field">Versionsbezeichnung der Preisliste<span class="hint">wird bei jeder Anfrage mitgespeichert</span>${textInput("version", p.version, "Version")}<span class="fehler-text" data-fehler="version"></span></label>
          <label class="field">MwSt. <span class="hint">(%)</span>${zahlInput("mwstProzent", p.mwstProzent, { label: "MwSt" })}<span class="fehler-text" data-fehler="mwstProzent"></span></label>
          <label class="field">Online-Rabatt <span class="hint">(%)</span>${zahlInput("onlineRabattProzent", p.onlineRabattProzent, { label: "Online-Rabatt" })}<span class="fehler-text" data-fehler="onlineRabattProzent"></span></label>
        </div></div>
        ${feldKarte("Montage Fenster", [["fenster.montage.montageProElement", "Montage je Element", F.montage.montageProElement, "€"], ["fenster.montage.demontageEntsorgungProElement", "Demontage & Entsorgung je Element", F.montage.demontageEntsorgungProElement, "€"]])}
        ${feldKarte("Montage Haustür", [["haustuer.montage.montageProElement", "Montage je Tür", H.montage.montageProElement, "€"], ["haustuer.montage.demontageEntsorgungProElement", "Demontage & Entsorgung je Tür", H.montage.demontageEntsorgungProElement, "€"]])}
        ${feldKarte("Anfahrt", [["anfahrt.freiBisKm", "Anfahrt frei bis", (p.anfahrt || {}).freiBisKm, "km"], ["anfahrt.proKm", "Danach je km", (p.anfahrt || {}).proKm, "€"]], "Hinweis: Die Anfahrt wird im Online-Richtpreis derzeit nicht berechnet. Die Werte dienen als Information für Ihre Angebote.")}`;
      bindeFelder(el);
      zeigeFehler(PV.validierePreise(S.preise));
    };
    const bindeFelder = (el) => {
      el.addEventListener("input", (e) => {
        const f = e.target; if (!f.dataset.pfad) return;
        let v;
        if (f.dataset.typ === "zahl") { v = zahl(f.value); if (v === null) { delP(S.preise, f.dataset.pfad); } else setP(S.preise, f.dataset.pfad, v); }
        else if (f.dataset.typ === "bool") setP(S.preise, f.dataset.pfad, f.checked);
        else setP(S.preise, f.dataset.pfad, f.value);
        setDirty(true);
        zeigeFehler(PV.validierePreise(S.preise));
        zeichneCalc();
      });
      el.addEventListener("click", async (e) => {
        const d = e.target.closest("[data-del]"); if (d) { if (await bestaetigen("Eintrag entfernen", "Dieser Eintrag wird aus der Preisliste entfernt.", "Entfernen", true)) { delP(S.preise, d.dataset.del); setDirty(true); zeichneTab(); zeichneCalc(); } return; }
        const n = e.target.closest("[data-neu]"); if (n) { const name = await modal({ titel: "Neuer Eintrag", feld: { label: "Bezeichnung (wie der Kunde sie sieht)" }, ok: "Anlegen" }); if (!name) return; const key = slug(name); const vorlage = JSON.parse(n.dataset.vorlage); vorlage.name = name; const map = getP(S.preise, n.dataset.neu) || {}; if (map[key]) return toast("Es gibt bereits einen Eintrag mit dieser Kennung.", "err"); map[key] = vorlage; setP(S.preise, n.dataset.neu, map); setDirty(true); zeichneTab(); zeichneCalc(); }
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
    const zeichneCalc = () => {
      const t = S.test, p = S.preise, box = $("#calc");
      const F = p.fenster, H = p.haustuer;
      const opt = (map, sel) => Object.entries(map || {}).filter(([, e]) => e.aktiv !== false).map(([k, e]) => `<option value="${k}" ${sel === k ? "selected" : ""}>${h(e.name)}</option>`).join("");
      const cfg = t.produkt === "fenster"
        ? { produkt: "fenster", system: t.system, typ: t.typ, breiteMm: t.breiteMm, hoeheMm: t.hoeheMm, menge: t.menge, farbe: t.farbe, glas: t.glas, sprossen: t.sprossen, rollladen: t.rollladen, zusaetze: t.zusaetze.filter((z) => F.zusaetze[z]), montage: t.montage, demontage: t.demontage }
        : { produkt: "haustuer", modell: t.modell, breiteMm: t.breiteMm, hoeheMm: t.hoeheMm, menge: t.menge, farbe: H.farben[t.farbe] ? t.farbe : Object.keys(H.farben)[0], glas: t.glasT, seitenteil: t.seitenteil, zusaetze: t.zusaetze.filter((z) => H.zusaetze[z]), montage: t.montage, demontage: t.demontage };
      let r; try { r = Preis.berechne(cfg, p); } catch (e) { r = { ok: false, fehler: [e.message] }; }
      const FEHLER = { breiteMin: "Breite unter Minimum", breiteMax: "Breite über Maximum", hoeheMin: "Höhe unter Minimum", hoeheMax: "Höhe über Maximum", mengeMin: "Menge zu klein", mengeMax: "Menge zu groß", system: "System fehlt", typ: "Typ fehlt", farbe: "Farbe fehlt", glas: "Glas fehlt", modell: "Modell fehlt" };
      const zeilen = r.ok ? `
        ${r.positionen.map((x, i) => `<div class="line ${i === 0 ? "line--top" : ""}"><span>${h(x.name)}${x.detail ? " · " + h(x.detail) : ""}</span><span>${euro(x.betrag)}</span></div>`).join("")}
        <div class="line line--muted"><span>Elementpreis × ${r.menge}</span><span>${euro(r.produkt)}</span></div>
        ${r.rabatt ? `<div class="line"><span>Online-Rabatt −${r.rabattProzent} %</span><span>−${euro(r.rabatt)}</span></div>` : ""}
        ${r.montage ? `<div class="line"><span>Montage${t.demontage ? " + Demontage/Entsorgung" : ""}</span><span>${euro(r.montage)}</span></div>` : ""}
        <div class="line line--muted"><span>Netto / MwSt. ${r.mwstProzent} %</span><span>${euro(r.netto)} / ${euro(r.mwst)}</span></div>
        <div class="total"><b>Kunde sieht</b><b>${euro(r.brutto)}</b></div>
        <div class="line line--muted"><span>Ohne Online-Rabatt</span><span>${euro(r.ohneRabattBrutto)}</span></div>`
        : `<div class="err">Keine Berechnung: ${(r.fehler || []).map((f) => FEHLER[f] || f).join(", ")}</div>`;
      let diff = "";
      const ang = zahl(t.angebot);
      if (r.ok && ang != null && !isNaN(ang) && ang > 0) { const a = Math.round(ang * 100); const d = r.brutto - a; const proz = (d / a) * 100; diff = `<div class="diff ${d > 0 ? "diff--neg" : ""}">Abweichung zum eigenen Angebot: ${d >= 0 ? "+" : "−"}${euro(Math.abs(d))} (${d >= 0 ? "+" : "−"}${Math.abs(proz).toFixed(2).replace(".", ",")} %) – Konfigurator liegt ${d > 0 ? "über" : d < 0 ? "unter" : "gleichauf mit"} Ihrem Angebot</div>`; }
      box.innerHTML = `<h2>Testrechner</h2><span class="small muted">Prüfen Sie vor dem Veröffentlichen, was der Kunde sieht – gerechnet mit den Werten in diesem Formular (auch ungespeicherten).</span>
        <div class="seg" role="radiogroup" aria-label="Produkt"><button type="button" role="radio" aria-checked="${t.produkt === "fenster"}" data-tp="fenster">Fenster</button><button type="button" role="radio" aria-checked="${t.produkt === "haustuer"}" data-tp="haustuer">Haustür</button></div>
        <div class="grid">
          ${t.produkt === "fenster" ? `<label class="field">System<select data-tf="system">${opt(F.systeme, t.system)}</select></label><label class="field">Typ<select data-tf="typ">${opt(F.typen, t.typ)}</select></label>` : `<label class="field">Modell<select data-tf="modell">${opt(H.modelle, t.modell)}</select></label><label class="field">Seitenteil<select data-tf="seitenteil">${opt(H.seitenteil, t.seitenteil)}</select></label>`}
          <label class="field">Breite (mm)<input type="text" inputmode="numeric" data-tf="breiteMm" value="${t.breiteMm}"></label>
          <label class="field">Höhe (mm)<input type="text" inputmode="numeric" data-tf="hoeheMm" value="${t.hoeheMm}"></label>
          <label class="field">Menge<input type="text" inputmode="numeric" data-tf="menge" value="${t.menge}"></label>
          <label class="field">Farbe<select data-tf="farbe">${opt(t.produkt === "fenster" ? F.farben : H.farben, t.farbe)}</select></label>
          ${t.produkt === "fenster" ? `<label class="field">Glas<select data-tf="glas">${opt(F.glas, t.glas)}</select></label><label class="field">Sprossen<select data-tf="sprossen">${opt(F.sprossen, t.sprossen)}</select></label><label class="field">Rollladen<select data-tf="rollladen">${opt(F.rollladen, t.rollladen)}</select></label>` : `<label class="field">Glas<select data-tf="glasT">${opt(H.glas, t.glasT)}</select></label>`}
        </div>
        <div class="stack">${Object.entries(t.produkt === "fenster" ? F.zusaetze : H.zusaetze).filter(([, e]) => e.aktiv !== false).map(([k, e]) => `<label class="check"><input type="checkbox" data-tz="${k}" ${t.zusaetze.includes(k) ? "checked" : ""}> ${h(e.name)}</label>`).join("")}
          <label class="check"><input type="checkbox" data-tf="montage" ${t.montage ? "checked" : ""}> Montage</label><label class="check"><input type="checkbox" data-tf="demontage" ${t.demontage ? "checked" : ""}> Demontage &amp; Entsorgung</label></div>
        <div class="conf muted small">${h(cfg.produkt === "fenster" ? (F.systeme[cfg.system] || {}).name : (H.modelle[cfg.modell] || {}).name)} · ${cfg.breiteMm} × ${cfg.hoeheMm} mm · ${cfg.menge} Stk.</div>
        ${zeilen}
        <label class="field">Mit eigenem Angebot vergleichen (€ brutto)<input type="text" inputmode="decimal" data-tf="angebot" value="${h(t.angebot)}" placeholder="z. B. 760,00"></label>${diff}
        <button type="button" class="btn btn--sm btn--ghost" data-tp="server">Vom Server nachrechnen lassen</button><span id="calc-server" class="small"></span>`;
      box.onchange = box.oninput = (e) => {
        const f = e.target;
        if (f.dataset.tf) { const k = f.dataset.tf; if (f.type === "checkbox") t[k] = f.checked; else if (["breiteMm", "hoeheMm", "menge"].includes(k)) t[k] = Math.round(zahl(f.value) || 0); else t[k] = f.value; if (k !== "angebot" || e.type === "change") zeichneCalc(); else { const d = $(".diff", box); zeichneCalc(); const i = $("[data-tf=angebot]", box); i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
        if (f.dataset.tz) { t.zusaetze = f.checked ? [...t.zusaetze, f.dataset.tz] : t.zusaetze.filter((z) => z !== f.dataset.tz); zeichneCalc(); }
      };
      box.onclick = async (e) => {
        const b = e.target.closest("[data-tp]"); if (!b) return;
        if (b.dataset.tp === "server") { const rr = await api.post("rechnen", { konfiguration: cfg, preise: p }); $("#calc-server").innerHTML = rr.ok && rr.ergebnis.ok ? `<span class="ok">Server: ${euro(rr.ergebnis.brutto)} – ${r.ok && rr.ergebnis.brutto === r.brutto ? "identisch ✓" : "WEICHT AB!"}</span>` : `<span class="err">${h(rr.error || (rr.ergebnis && rr.ergebnis.fehler.join(", ")) || "Fehler")}</span>`; return; }
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
      toast("Status gespeichert: " + { aus: "Aus", vorschau: "Vorschau", online: "Online" }[neu] + ".", "ok");
      if (r.veroeffentlichung) { if (r.veroeffentlichung.ok) { S.pub = r.veroeffentlichung.veroeffentlichung; startPoll(); toast("Veröffentlichung gestartet.", "ok"); } else toast(r.veroeffentlichung.error, "err"); }
      await ladeStatus();
    });
    main.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-p]"); if (!b) return;
      const fehler = PV.validierePreise(S.preise);
      if (!zeigeFehler(fehler)) return toast("Bitte die markierten Felder prüfen.", "err");
      const geaendert = JSON.stringify(S.preise) !== JSON.stringify(S.preiseOriginal);
      if (!geaendert) { toast("Keine Änderungen an den Preisen."); if (b.dataset.p === "speichern-pub") await veroeffentlichen("Preise"); return; }
      const beschreibung = await modal({ titel: "Änderung beschreiben", text: "Kurze Notiz für das Änderungsprotokoll (optional).", feld: { label: "Was wurde geändert?" }, ok: "Speichern" });
      if (beschreibung === null) return;
      const r = await api.post("speichern", { bereich: "preise", daten: S.preise, beschreibung, veroeffentlichen: b.dataset.p === "speichern-pub" });
      if (!r.ok) { if (r.fehler) zeigeFehler(r.fehler); toast(r.error, "err"); return; }
      S.preiseOriginal = klon(S.preise); setDirty(false);
      toast(`Preise gespeichert (${r.version.aenderungen} Änderung(en)).`, "ok");
      if (r.veroeffentlichung) { if (r.veroeffentlichung.ok) { S.pub = r.veroeffentlichung.veroeffentlichung; startPoll(); toast("Veröffentlichung gestartet – Tests laufen.", "ok"); } else toast(r.veroeffentlichung.error, "err"); }
      await ladeStatus();
    });
    ladeStatus();
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
    const AUSBLENDEN = ["konfiguration", "preis_server_brutto", "preis_server_netto", "preis_server_text", "preis_abweichung", "preisliste_version", "positionen", "preis_browser_brutto", "datenschutz"];
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
          ${abw ? `<div class="alert alert--err"><b>Achtung:</b> Der im Browser angezeigte Preis (${k.preis_browser_brutto ? euro(Number(k.preis_browser_brutto)) : "?"}) weicht vom Serverpreis ab – mögliche Manipulation oder veraltete Preisliste. Maßgeblich ist der Serverpreis.</div>` : ""}
          <dl>${Object.entries(k).filter(([key]) => !AUSBLENDEN.includes(key) && key !== "name").map(([key, v]) => `<dt>${h(key)}</dt><dd>${key === "email" ? `<a href="mailto:${h(v)}">${h(v)}</a>` : key === "telefon" ? `<a href="tel:${h(v)}">${h(v)}</a>` : h(v)}</dd>`).join("")}</dl>
          ${konf ? `<details><summary>Konfiguration &amp; Preis (Server)</summary><dl><dt>Serverpreis</dt><dd><b>${a.preisServerBrutto ? euro(a.preisServerBrutto) : h(k.preis_server_text || "–")}</b> ${k.preis_server_text ? "· " + h(k.preis_server_text) : ""}</dd><dt>Browserpreis</dt><dd>${a.preisBrowserBrutto ? euro(a.preisBrowserBrutto) : "–"} · Abweichung: ${h(a.abweichung || "–")}</dd><dt>Preisliste</dt><dd>${h(a.preislisteVersion || "–")}</dd><dt>Positionen</dt><dd>${h(k.positionen || "–")}</dd><dt>Konfiguration</dt><dd><code class="small">${h(JSON.stringify(a.konfiguration))}</code></dd></dl></details>` : ""}
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
      box.innerHTML = v.ok ? `<div class="table-wrap"><table class="tbl diff-tbl"><thead><tr><th>Feld</th><th>Vorher</th><th>Nachher</th></tr></thead><tbody>${v.version.diff.map((x) => `<tr><td><code>${h(x.pfad)}</code></td><td class="alt">${fmt(x.alt)}</td><td class="neu">${fmt(x.neu)}</td></tr>`).join("") || "<tr><td colspan=3>Keine Feldänderungen (z. B. identischer Stand).</td></tr>"}</tbody></table></div>` : `<p class="fehler-text">${h(v.error)}</p>`;
      box.hidden = false;
    });
  };

  /* ---------- Zugriffsprotokoll ---------- */
  VIEWS.protokoll = async (main) => {
    const d = await api.get("protokoll");
    if (!d.ok) throw new Error(d.error);
    main.innerHTML = `<div class="page-head"><div><h1>Zugriffsprotokoll</h1><span class="muted">Anmeldungen (erfolgreich und fehlgeschlagen), Änderungen und Veröffentlichungen – die letzten 500 Einträge. IP-Adressen sind gekürzt.</span></div></div>
      <div class="card"><div class="table-wrap"><table class="tbl"><thead><tr><th>Zeit</th><th>Typ</th><th>Details</th><th>Wer</th><th>IP</th></tr></thead><tbody>${d.protokoll.map((p) => `<tr><td class="nowrap">${fmtDT(p.wann)}</td><td><span class="badge ${/fehler|gesperrt/.test(p.typ) ? "badge--err" : /login|einrichtung/.test(p.typ) ? "badge--ok" : "badge--grey"}">${h(p.typ)}</span></td><td>${h(p.text)}</td><td>${h(p.wer || "")}</td><td class="small muted">${h(p.ip || "")}</td></tr>`).join("") || "<tr><td colspan=5>Noch keine Einträge.</td></tr>"}</tbody></table></div></div>`;
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
        <form class="card" id="f-notify" novalidate><h2>Benachrichtigungen</h2><p class="small muted">An diese Adresse senden wir neue Anfragen und Bewertungen${S.hooks.mail === false ? " (derzeit kein E-Mail-Versand: BREVO_API_KEY fehlt)" : ""}.</p>
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
})();
