/* Zentrale Einstellungen für Formulare und Spam-Schutz.
   Wird vor main.js geladen. Änderungen hier wirken auf alle Formulare der Website. */
window.FW_CONFIG = {
  spam: {
    /* Mindestzeit zwischen Seitenaufruf und Absenden (Sekunden). Schneller = Bot. */
    minSeconds: 3,
    /* Netlify Function, die Zeitprüfung, Honeypot und (optional) Captcha serverseitig prüft
       und die Anfrage dann an Netlify Forms weiterreicht. Leer lassen = nur Prüfung im Browser. */
    functionUrl: "/.netlify/functions/anfrage"
  },
  friendlyCaptcha: {
    /* Auf true setzen, sobald Sitekey (hier) und API-Key (Netlify-Umgebungsvariable FRC_API_KEY)
       vorliegen – siehe README, Abschnitt „Friendly Captcha“. */
    enabled: false,
    sitekey: "",
    /* "eu" = Verarbeitung ausschließlich auf EU-Servern (DSGVO), "global" = weltweit. */
    endpoint: "eu",
    /* Selbst gehostetes Widget-Skript (kein Aufruf eines fremden CDN). */
    script: "/js/vendor/friendly-captcha-sdk-1.0.2.min.js",
    lang: "de"
  }
};
