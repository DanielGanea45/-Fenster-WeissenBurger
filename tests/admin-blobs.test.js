/* Tests: Ablauf „erstes Konto anlegen“ in einer Netlify-Function-Umgebung mit der ECHTEN Bibliothek
   @netlify/blobs gegen einen lokalen Nachbau der Blobs-Edge-API. Prüft, dass das Konto dauerhaft im Store
   landet (auch für eine „neue“ Function-Instanz) – und dass ohne Blobs-Kontext ein klarer Fehler kommt statt
   eines stillen Schreibens auf das flüchtige Dateisystem (der Fehler vom Deploy Preview #14). */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const fs = require("fs");
const path = require("path");

/* Lambda-ähnliche Umgebung: kein lokaler Dateistore, Lambda-Variablen gesetzt */
delete process.env.FW_STORE_DIR; delete process.env.NETLIFY_BLOBS_CONTEXT; delete process.env.NETLIFY_BLOBS_TOKEN; delete process.env.NETLIFY; delete process.env.CONTEXT;
process.env.LAMBDA_TASK_ROOT = "/var/task"; process.env.AWS_LAMBDA_FUNCTION_NAME = "admin-auth";
process.env.ADMIN_SETUP_TOKEN = "preview-setup-token-abcdefghij";
process.env.DEPLOY_PRIME_URL = "https://deploy-preview-14--fensterweissenburger.netlify.app";
process.env.URL = "https://fensterweissenburger.netlify.app";

const SITE = "site-123", TOKEN = "blobs-token-xyz", PW = "SicheresPasswort!2026";
const ablage = new Map(); // "store/key" → { body, meta }
let anfragen = [];
let server, base;

function edgeApi(req, res) {
  const u = new URL(req.url, "http://x");
  anfragen.push(req.method + " " + u.pathname + u.search);
  if (req.headers.authorization !== "Bearer " + TOKEN) { res.writeHead(401); return res.end("unauthorized"); }
  const teile = u.pathname.split("/").filter(Boolean);
  if (teile[0] !== SITE) { res.writeHead(404); return res.end(); }
  const storeName = teile[1].replace(/^site:/, ""), key = teile.slice(2).join("/"); // Client adressiert Site-Stores als „site:<name>“
  if (!key) { /* Liste */
    const prefix = u.searchParams.get("prefix") || "";
    const blobs = [...ablage.keys()].filter((k) => k.startsWith(storeName + "/" + prefix)).map((k) => ({ key: k.slice(storeName.length + 1), etag: "e" }));
    res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ blobs, directories: [] }));
  }
  const id = storeName + "/" + key;
  if (req.method === "PUT") { const chunks = []; req.on("data", (c) => chunks.push(c)); req.on("end", () => { ablage.set(id, { body: Buffer.concat(chunks), meta: req.headers["x-amz-meta-user"] || "" }); res.writeHead(200); res.end(); }); return; }
  if (req.method === "DELETE") { ablage.delete(id); res.writeHead(204); return res.end(); }
  if (req.method === "GET" || req.method === "HEAD") { const e = ablage.get(id); if (!e) { res.writeHead(404); return res.end(); } res.writeHead(200, { "content-type": "application/octet-stream", etag: "e" }); return res.end(req.method === "HEAD" ? undefined : e.body); }
  res.writeHead(405); res.end();
}

/* Lambda-Event, wie Netlify ihn klassischen handler(event)-Functions übergibt: Blobs-Kontext in event.blobs */
let ipZaehler = 0;
function ev(method, body, extra = {}) {
  const blobs = extra.ohneBlobs ? undefined : Buffer.from(JSON.stringify(Object.assign({ url: base, token: TOKEN }, extra.ohneUncached ? {} : { url_uncached: base }))).toString("base64");
  return { httpMethod: method, path: "/.netlify/functions/admin-auth", blobs, headers: Object.assign({ host: "deploy-preview-14--fensterweissenburger.netlify.app", origin: "https://deploy-preview-14--fensterweissenburger.netlify.app", "x-nf-site-id": SITE, "x-nf-deploy-id": "dep-1", "x-forwarded-for": "198.51.100." + (++ipZaehler % 250), "x-forwarded-proto": "https" }, extra.headers || {}), body: body ? JSON.stringify(body) : null, queryStringParameters: extra.query || {} };
}
const parse = (r) => JSON.parse(r.body);
/* „Neue Function-Instanz“: Module frisch laden, Kontext-Variable weg */
function neueInstanz() {
  for (const k of Object.keys(require.cache)) if (/netlify[\\/]functions/.test(k)) delete require.cache[k];
  delete process.env.NETLIFY_BLOBS_CONTEXT;
  return { authFn: require("../netlify/functions/admin-auth"), apiFn: require("../netlify/functions/admin-api"), store: require("../netlify/functions/_lib/store") };
}

test.before(async () => { server = http.createServer(edgeApi); await new Promise((r) => server.listen(0, "127.0.0.1", r)); base = "http://127.0.0.1:" + server.address().port; });
test.after(() => server.close());

test("Ohne Blobs-Kontext in der Function: klarer Serverfehler, nichts wird still auf die Platte geschrieben", async () => {
  const { authFn, store } = neueInstanz();
  assert.equal(store.inNetlify(), true);
  assert.throws(() => store.useBlobs(), /Netlify Blobs\) nicht verfügbar/);
  const r = await authFn.handler(ev("POST", { aktion: "einrichten", token: process.env.ADMIN_SETUP_TOKEN, email: "daniel@example.de", passwort: PW }, { ohneBlobs: true }));
  assert.equal(r.statusCode, 500);
  assert.match(parse(r).error, /Datenspeicher \(Netlify Blobs\) nicht verfügbar/);
  assert.equal(fs.existsSync(path.join(process.cwd(), ".netlify-blobs-local")), false, "kein lokaler Dateistore angelegt");
  assert.equal(ablage.size, 0);
});

test("Erstes Konto über event.blobs: wird dauerhaft im Blobs-Store gespeichert und von einer neuen Instanz gelesen", async () => {
  let { authFn, store } = neueInstanz();
  let r = await authFn.handler(ev("GET"));
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(parse(r).eingerichtet, false);
  assert.equal(store.blobsStatus().art, "automatisch");
  assert.equal(store.storeName(), "admin-deploy-preview");
  r = await authFn.handler(ev("POST", { aktion: "einrichten", token: process.env.ADMIN_SETUP_TOKEN, email: "daniel@example.de", passwort: PW, name: "Daniel" }));
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(parse(r).ok, true);
  assert.match(r.headers["Set-Cookie"], /Secure/);
  const cookie = r.headers["Set-Cookie"].split(";")[0];
  assert.ok(ablage.has("admin-deploy-preview/konto"), "Konto liegt im Store admin-deploy-preview – Aufrufe:\n" + anfragen.join("\n") + "\nSchlüssel: " + [...ablage.keys()].join(", "));
  assert.ok(anfragen.some((a) => /^PUT \/site-123\/(site:)?admin-deploy-preview\/konto/.test(a)), anfragen.join("\n"));
  /* dieselbe Instanz: Sitzung gültig, Konto bekannt */
  r = await authFn.handler(ev("GET", null, { headers: { cookie } }));
  assert.equal(parse(r).eingerichtet, true); assert.equal(parse(r).angemeldet, true);
  /* neue (kalte) Instanz: Konto und Sitzung kommen aus Blobs */
  ({ authFn } = neueInstanz());
  r = await authFn.handler(ev("GET", null, { headers: { cookie } }));
  assert.equal(parse(r).eingerichtet, true, "Konto nach Neustart der Function vorhanden");
  assert.equal(parse(r).angemeldet, true);
  /* zweiter Einrichtungsversuch wird abgelehnt, Anmeldung mit Passwort klappt */
  r = await authFn.handler(ev("POST", { aktion: "einrichten", token: process.env.ADMIN_SETUP_TOKEN, email: "x@y.de", passwort: PW }));
  assert.equal(r.statusCode, 409);
  r = await authFn.handler(ev("POST", { aktion: "anmelden", email: "daniel@example.de", passwort: PW }));
  assert.equal(r.statusCode, 200, r.body);
  const protokoll = JSON.parse(ablage.get("admin-deploy-preview/protokoll").body.toString());
  assert.ok(protokoll.some((p) => p.typ === "einrichtung"));
});

test("Kontext ohne ungecachte Edge-URL: Zugriff funktioniert trotzdem (eventual statt Fehler)", async () => {
  const { authFn, store } = neueInstanz();
  const r = await authFn.handler(ev("GET", null, { ohneUncached: true }));
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(parse(r).eingerichtet, true);
  assert.equal(store.blobsStatus().art, "automatisch");
});

test("Admin-API nutzt denselben Store: Preise speichern landet in Blobs, Version wird angelegt", async () => {
  const { authFn, apiFn } = neueInstanz();
  const httpLib = require("../netlify/functions/_lib/http");
  let r = await authFn.handler(ev("POST", { aktion: "anmelden", email: "daniel@example.de", passwort: PW }));
  const cookie = r.headers["Set-Cookie"].split(";")[0];
  const csrf = parse(r).csrf;
  const preise = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data/preise.json"), "utf8"));
  preise.version = "2026-11-01-blobs";
  const e = ev("POST", { aktion: "speichern", bereich: "preise", daten: preise, beschreibung: "Blobs-Test" }, { headers: { cookie, "x-csrf": csrf } });
  e.path = "/.netlify/functions/admin-api";
  r = await apiFn.handler(e);
  assert.equal(r.statusCode, 200, r.body);
  assert.ok(ablage.has("admin-deploy-preview/daten/preise"));
  assert.ok([...ablage.keys()].some((k) => k.startsWith("admin-deploy-preview/versionen/")));
  assert.equal(httpLib.csrfFor("x").length > 20, true);
});
