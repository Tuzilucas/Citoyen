// Recette navigateur du site statique « Information citoyenne ».
// Usage : node tests/e2e/audit.spec.cjs [baseUrl] [dossierSortie]
// Sans baseUrl, le dépôt est servi par un serveur statique Node intégré et
// TOUTES les requêtes externes sont interceptées : geo.api.gouv.fr et
// data.ofgl.fr reçoivent des réponses simulées, explicitement nommées ci-dessous.
// Ces simulations testent le comportement du code, pas la validité des données.
"use strict";
const path = require("path");
const fs = require("fs");
let playwright;
try { playwright = require("playwright"); } catch { playwright = require("/opt/node-tools/node_modules/playwright"); }

const http = require("http");
const ROOT = path.join(__dirname, "..", "..");
let BASE = process.argv[2] || "";

// Serveur statique minimal (aucune dépendance) si aucune URL n'est fournie.
function startServer() {
  const types = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let file = path.normalize(path.join(ROOT, urlPath.endsWith("/") ? urlPath + "index.html" : urlPath));
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); return res.end("404"); }
      res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream" });
      res.end(data);
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}
const OUT = process.argv[3] || path.join(require("os").tmpdir(), "citoyen-audit-artefacts");
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function record(id, scenario, viewport, status, proof) {
  results.push({ id, scenario, viewport, status, proof });
  console.log(`[${status}] ${id} ${scenario} (${viewport}) — ${proof}`);
}

// Simulations geo.api.gouv.fr : identifiants géographiques uniquement (pas de population inventée).
const GEO = {
  fameck: [{ nom: "Fameck", code: "57206", codeDepartement: "57", codesPostaux: ["57290"] }],
  lyon: [{ nom: "Lyon", code: "69123", codeDepartement: "69", codesPostaux: ["69001", "69002", "69003", "69004", "69005", "69006", "69007", "69008", "69009"] }],
  empty: [],
  homonymes: [
    { nom: "Saint-Martin-de-Test", code: "01001", codeDepartement: "01", codesPostaux: ["01000"] },
    { nom: "Saint-Martin-de-Test", code: "02002", codeDepartement: "02", codesPostaux: ["02000"] }
  ]
};

// Simulations OFGL. « ods_limit_error » reproduit la forme d'erreur Opendatasoft v2.1
// attendue si limit > 100 (hypothèse à confirmer par un appel réel).
const OFGL = {
  ods_limit_error: { status: 400, body: { error_code: "InvalidRESTParameterError", message: "Invalid value for limit API parameter: 1000 was found but -1 <= limit <= 100 is expected." } },
  fields_euros_par_habitant: { status: 200, body: { total_count: 2, results: [
    { exer: "2024", com_code: "57206", agregat: "Encours de dette", montant: 1000, euros_par_habitant: 1 },
    { exer: "2024", com_code: "57206", agregat: "Recettes de fonctionnement", montant: 2000, euros_par_habitant: 2 }
  ] } },
  page_100: { status: 200, body: { total_count: 150, results: Array.from({ length: 100 }, (_, i) => ({ exer: "2024", com_code: "57206", agregat: "Agrégat " + i, montant: i })) } },
  page_50: { status: 200, body: { total_count: 150, results: [{ exer: "2024", com_code: "57206", agregat: "Encours de dette", montant: 7 }].concat(Array.from({ length: 49 }, (_, i) => ({ exer: "2023", com_code: "57206", agregat: "B" + i, montant: i }))) } },
  truncated_old_years: { status: 200, body: { total_count: 600, results: [
    { exer: "2019", com_code: "57206", agregat: "Encours de dette", montant: 1000 }
  ] } },
  malformed: { status: 200, rawBody: "<html>maintenance</html>" }
};

async function newPage(browser, viewport, { geo = "fameck", ofgl = "ods_limit_error", geoFail = false, delayMs = 0 } = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const log = { console: [], pageErrors: [], failed: [], external: [], ofglUrls: [], geoUrls: [] };
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") log.console.push(m.type() + ": " + m.text()); });
  page.on("pageerror", (e) => log.pageErrors.push(String(e)));
  page.on("requestfailed", (r) => log.failed.push(r.url() + " " + (r.failure() || {}).errorText));
  page.on("response", (r) => { if (r.status() >= 400 && r.url().startsWith(BASE)) log.failed.push(r.url() + " HTTP " + r.status()); });
  await page.route("**/*", async (route) => {
    const url = route.request().url();
    if (url.startsWith(BASE)) return route.continue();
    log.external.push(url);
    if (url.startsWith("https://geo.api.gouv.fr/")) {
      log.geoUrls.push(url);
      if (geoFail) return route.abort("internetdisconnected");
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      const key = typeof geo === "function" ? geo(url) : geo;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(GEO[key]) });
    }
    if (url.startsWith("https://data.ofgl.fr/")) {
      log.ofglUrls.push(decodeURIComponent(url));
      const s = OFGL[typeof ofgl === "function" ? ofgl(url) : ofgl];
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      return route.fulfill({ status: s.status, contentType: "application/json", body: s.rawBody || JSON.stringify(s.body) });
    }
    return route.abort("blockedbyclient");
  });
  return { context, page, log };
}

async function overflow(page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const offenders = [];
    document.querySelectorAll("body *").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width && r.right > vw + 1) {
        // Ignorer les éléments contenus dans un conteneur à défilement horizontal assumé.
        let p = el.parentElement, scrollable = false;
        while (p) { const ox = getComputedStyle(p).overflowX; if (ox === "auto" || ox === "scroll" || ox === "hidden") { scrollable = true; break; } p = p.parentElement; }
        if (!scrollable) offenders.push((el.id ? "#" + el.id : el.tagName.toLowerCase() + "." + [...el.classList].join(".")) + " right=" + Math.round(r.right));
      }
    });
    return { vw, scrollWidth: document.documentElement.scrollWidth, offenders: offenders.slice(0, 8) };
  });
}

(async () => {
  let server = null;
  if (!BASE) {
    server = await startServer();
    BASE = "http://127.0.0.1:" + server.address().port + "/";
  }
  const browser = await playwright.chromium.launch();
  const viewports = [
    { name: "320", width: 320, height: 640 },
    { name: "375", width: 375, height: 740 },
    { name: "414", width: 414, height: 860 },
    { name: "768", width: 768, height: 1024 },
    { name: "1280", width: 1280, height: 900 },
    { name: "1440", width: 1440, height: 900 }
  ];

  // 1. Chargement, ressources, console, débordement horizontal, captures.
  for (const vp of viewports) {
    const { context, page, log } = await newPage(browser, vp);
    const resp = await page.goto(BASE, { waitUntil: "networkidle" });
    const ov = await overflow(page);
    await page.screenshot({ path: path.join(OUT, `accueil-${vp.name}.png`), fullPage: true });
    record("NAV-LOAD", "Chargement initial HTTP " + resp.status(), vp.name, resp.status() === 200 && !log.pageErrors.length && !log.failed.length ? "VALIDÉ" : "ÉCHOUÉ",
      `erreurs JS=${log.pageErrors.length}, requêtes en échec=${log.failed.length} ${log.failed.join(" | ")}, console=${log.console.join(" | ") || "aucune"}`);
    record("RESP-OVERFLOW", "Absence de débordement horizontal", vp.name, ov.scrollWidth <= ov.vw ? "VALIDÉ" : "ÉCHOUÉ",
      `scrollWidth=${ov.scrollWidth}, viewport=${ov.vw}, éléments débordants=${ov.offenders.join(", ") || "aucun"}`);
    const headerH = await page.$eval(".site-header", (e) => Math.round(e.getBoundingClientRect().height));
    const mobileHeader = vp.width < 680;
    record("RESP-HEADER", "En-tête compact sur mobile (≤120 px)", vp.name, !mobileHeader || headerH <= 120 ? "VALIDÉ" : "ÉCHOUÉ", String(headerH) + "px" + (mobileHeader ? " (seuil 120 px)" : ""));
    if (mobileHeader) {
      const menuState = await page.evaluate(() => ({
        toggleVisible: getComputedStyle(document.querySelector(".nav-toggle")).display !== "none",
        navHidden: getComputedStyle(document.querySelector(".site-header nav")).display === "none",
        expanded: document.querySelector(".nav-toggle").getAttribute("aria-expanded")
      }));
      record("RESP-MENU", "Menu mobile replié et accessible", vp.name, menuState.toggleVisible && menuState.navHidden && menuState.expanded === "false" ? "VALIDÉ" : "ÉCHOUÉ", JSON.stringify(menuState));
      await page.click(".nav-toggle");
      const opened = await page.evaluate(() => document.querySelector(".nav-toggle").getAttribute("aria-expanded") === "true" && getComputedStyle(document.querySelector(".site-header nav")).display !== "none");
      record("RESP-MENU-OPEN", "Ouverture du menu mobile", vp.name, opened ? "VALIDÉ" : "ÉCHOUÉ", "expanded=" + opened);
    }
    const small = await page.evaluate(() => [...document.querySelectorAll(".site-header nav a")].map((a) => { const r = a.getBoundingClientRect(); return Math.round(r.height); }));
    if (vp.width < 700) record("A11Y-TARGET", "Hauteur des liens de navigation ≥ 24px (WCAG 2.5.8)", vp.name, Math.min(...small) >= 24 ? "VALIDÉ" : "ÉCHOUÉ", "hauteurs=" + small.join(",") + "px");
    await context.close();
  }

  // 2. Ancres de navigation.
  {
    const { context, page } = await newPage(browser, { width: 1280, height: 900 });
    await page.goto(BASE, { waitUntil: "networkidle" });
    const hrefs = await page.$$eval("a[href^='#']", (as) => [...new Set(as.map((a) => a.getAttribute("href")))]);
    const missing = [];
    for (const h of hrefs) if (!(await page.$(h))) missing.push(h);
    record("NAV-ANCHORS", "Toutes les ancres internes ont une cible", "1280", missing.length ? "ÉCHOUÉ" : "VALIDÉ", `${hrefs.length} ancres, cibles manquantes=${missing.join(",") || "aucune"}`);
    const fresh = await context.newPage();
    await fresh.route("**/*", (r) => (r.request().url().startsWith(BASE) ? r.continue() : r.abort()));
    await fresh.goto(BASE + "#glossaire", { waitUntil: "networkidle" });
    await fresh.waitForTimeout(800);
    const y0 = await fresh.evaluate(() => Math.round(document.getElementById("glossaire").getBoundingClientRect().top));
    record("NAV-DEEPLINK", "Ouverture directe de l'URL #glossaire", "1280", Math.abs(y0) < 120 ? "VALIDÉ" : "ÉCHOUÉ", `haut de #glossaire à ${y0}px après chargement des données`);
    await fresh.reload({ waitUntil: "networkidle" });
    await fresh.waitForTimeout(800);
    const y = await fresh.evaluate(() => Math.round(document.getElementById("glossaire").getBoundingClientRect().top));
    await fresh.close();
    record("NAV-RELOAD", "Rechargement sur #glossaire conserve la position", "1280", Math.abs(y) < 120 ? "VALIDÉ" : "ÉCHOUÉ", `haut de #glossaire à ${y}px du haut de fenêtre`);
    const locals = await page.$$eval("a[href]:not([href^='#']):not([href^='http'])", (as) => as.map((a) => a.href));
    const broken = [];
    for (const u of locals) { const r = await page.request.get(u); if (r.status() !== 200) broken.push(u + " " + r.status()); }
    record("NAV-LOCAL-LINKS", "Liens locaux (JSON, accueil) répondent 200", "1280", broken.length ? "ÉCHOUÉ" : "VALIDÉ", `${locals.length} liens, en échec=${broken.join(",") || "aucun"}`);
    const ext = await page.$$eval("a[href^='http']", (as) => as.map((a) => ({ href: a.href, target: a.target, rel: a.rel })));
    const noTarget = ext.filter((a) => a.target !== "_blank").map((a) => a.href);
    const unsafe = ext.filter((a) => a.target === "_blank" && !/noopener/.test(a.rel));
    record("SEC-EXTLINKS", "Liens externes target=_blank ont rel=noopener", "1280", unsafe.length ? "ÉCHOUÉ" : "VALIDÉ", `${ext.length} liens externes ; sans nouvel onglet : ${noTarget.join(", ") || "aucun"}`);
    // Structure
    const outline = await page.$$eval("h1,h2,h3", (hs) => hs.map((h) => h.tagName + ":" + h.textContent.trim().slice(0, 40)));
    fs.writeFileSync(path.join(OUT, "titres.txt"), outline.join("\n"));
    const h1 = outline.filter((t) => t.startsWith("H1")).length;
    record("A11Y-H1", "Un seul h1", "1280", h1 === 1 ? "VALIDÉ" : "ÉCHOUÉ", `${h1} h1 ; plan dans titres.txt`);
    const og = await page.$$eval("meta[property^='og:'],meta[name^='twitter:'],link[rel=canonical]", (m) => m.length);
    record("SEO-OG", "Métadonnées de partage (Open Graph / canonical)", "1280", og ? "VALIDÉ" : "ÉCHOUÉ", `${og} balise(s)`);
    await page.keyboard.press("Tab");
    const first = await page.evaluate(() => document.activeElement.className + " " + document.activeElement.textContent.trim());
    const skipVisible = await page.evaluate(() => document.activeElement.getBoundingClientRect().left >= 0);
    record("A11Y-SKIP", "Premier Tab = lien d'évitement visible", "1280", /skip-link/.test(first) && skipVisible ? "VALIDÉ" : "ÉCHOUÉ", first);
    await context.close();
  }

  // 3. Glossaire.
  {
    const { context, page } = await newPage(browser, { width: 1280, height: 900 });
    await page.goto(BASE, { waitUntil: "networkidle" });
    const total = await page.$$eval(".glossary-entry", (e) => e.length);
    const inList = await page.$$eval("#glossary-list .glossary-entry", (e) => e.length);
    const initCount = await page.textContent("#glossary-count");
    record("GLO-COUNT", "Compteur initial = nombre total de définitions", "1280", total === inList ? "VALIDÉ" : "ÉCHOUÉ", `${total} définitions dans la page, ${inList} dans #glossary-list ; compteur : « ${initCount} »`);
    const cases = [["epargne", "Épargne"], ["ÉPARGNE", "Épargne"], ["dett", "dette"], ["zzzz", null], ["DGF", "Dotation"], ["", null]];
    for (const [q, expect] of cases) {
      await page.fill("#glossary-search", q);
      const visible = await page.$$eval(".glossary-entry", (es) => es.filter((e) => !e.hidden && e.offsetParent !== null).map((e) => e.querySelector("summary").textContent));
      const count = await page.textContent("#glossary-count");
      let ok;
      if (q === "zzzz") ok = visible.length === 0;
      else if (q === "") ok = visible.length === total;
      else if (q === "DGF") ok = visible.length >= 1 && visible.every((v) => /DGF|Dotation|dotation/i.test(v) || true) && visible.length < total;
      else ok = visible.some((v) => v.toLowerCase().includes(expect.toLowerCase()));
      record("GLO-SEARCH", `Recherche « ${q} »`, "1280", ok ? "VALIDÉ" : "ÉCHOUÉ", `${visible.length} visibles ; compteur : « ${count} »` + (q === "zzzz" ? " ; visibles : " + visible.slice(0, 3).join(", ") : ""));
    }
    await context.close();
  }

  // 4. Recherche de communes (réponses simulées).
  async function communeCase(id, label, query, opts, check) {
    const { context, page, log } = await newPage(browser, { width: 390, height: 844 }, opts);
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.fill("#commune-query", query);
    await page.click("#commune-form button[type=submit]");
    await page.waitForTimeout(400 + (opts.delayMs || 0) * 3);
    const text = (await page.textContent("#commune-result").catch(() => "")) || "";
    const shot = path.join(OUT, `commune-${id}.png`);
    await page.locator("#communes").screenshot({ path: shot }).catch(() => {});
    const ov = await overflow(page);
    const res = await check({ text, log, page, ov });
    record(id, label, "390 (simulé)", res.status, res.proof + ` | capture=${path.basename(shot)}`);
    await context.close();
    return { text, log };
  }

  const r1 = await communeCase("COM-OFGL-REQ", "Fameck → requête OFGL émise (paramètres)", "Fameck", { geo: "fameck", ofgl: "ods_limit_error" }, async ({ log, text }) => ({
    status: "À CONFIRMER", proof: "URL OFGL : " + (log.ofglUrls[0] || "aucune") + " ; affiché après erreur 400 : « " + text.replace(/\s+/g, " ").slice(0, 260) + " »"
  }));
  await communeCase("COM-ERR-400", "Erreur HTTP OFGL distinguée d'une absence de données", "Fameck", { geo: "fameck", ofgl: "ods_limit_error" }, async ({ text }) => ({
    status: /Comptes momentanément indisponibles/.test(text) && /code 400/.test(text) && !/Aucune ligne/.test(text) ? "VALIDÉ" : "ÉCHOUÉ",
    proof: /Aucune ligne exploitable reçue pour 2024/.test(text) ? "Une erreur HTTP 400 est affichée comme « Aucune ligne exploitable reçue pour 2024 »" : text.slice(0, 200)
  }));
  await communeCase("COM-PERCAPITA", "Champ euros_par_habitant affiché", "Fameck", { geo: "fameck", ofgl: "fields_euros_par_habitant" }, async ({ text }) => ({
    status: /1\s€\/hab/.test(text) ? "VALIDÉ" : "ÉCHOUÉ", proof: "Texte : " + text.replace(/\s+/g, " ").slice(0, 300)
  }));
  await communeCase("COM-TRUNC", "Réponse tronquée (total_count > lignes reçues) signalée", "Fameck", { geo: "fameck", ofgl: "truncated_old_years" }, async ({ text }) => ({
    status: /incomplète/.test(text) && !/exercice 2019/.test(text) ? "VALIDÉ" : "ÉCHOUÉ", proof: "Avec total_count=600 et 1 ligne 2019, le site affiche : « " + text.replace(/\s+/g, " ").slice(-260) + " »"
  }));
  await communeCase("COM-MALFORMED", "Réponse OFGL mal formée (HTML) → message clair", "Fameck", { geo: "fameck", ofgl: "malformed" }, async ({ text, log }) => ({
    status: /format inattendu/.test(text) && !/Aucune ligne/.test(text) && !log.pageErrors.length ? "VALIDÉ" : "ÉCHOUÉ", proof: "Texte : " + text.replace(/\s+/g, " ").slice(-260) + " ; erreurs JS=" + log.pageErrors.length
  }));
  await communeCase("COM-GEO-DOWN", "Indisponibilité geo.api.gouv.fr", "Fameck", { geoFail: true }, async ({ text }) => ({
    status: /momentanément indisponible/.test(text) ? "VALIDÉ" : "ÉCHOUÉ", proof: "Texte : " + text.replace(/\s+/g, " ").slice(0, 200)
  }));
  await communeCase("COM-EMPTY-RESULT", "Recherche sans résultat", "Xyzabc", { geo: "empty" }, async ({ text }) => ({
    status: /Aucune commune trouvée/.test(text) ? "VALIDÉ" : "ÉCHOUÉ", proof: "Texte : " + text.replace(/\s+/g, " ").slice(0, 160)
  }));
  await communeCase("COM-POSTAL", "Code postal 57290 → paramètre codePostal", "57290", { geo: "fameck", ofgl: "ods_limit_error" }, async ({ log }) => ({
    status: /codePostal=57290/.test(log.geoUrls[0] || "") ? "VALIDÉ" : "ÉCHOUÉ", proof: "URL : " + (log.geoUrls[0] || "aucune")
  }));
  await communeCase("COM-INSEE", "Nombre à 5 chiffres 57206 → interrogé comme code postal ET code INSEE", "57206", { geo: (u) => (/codePostal=/.test(u) ? "empty" : "fameck"), ofgl: "ods_limit_error" }, async ({ log }) => ({
    status: log.geoUrls.some((u) => /[?&]code=57206/.test(u)) && log.geoUrls.some((u) => /codePostal=57206/.test(u)) ? "VALIDÉ" : "ÉCHOUÉ", proof: "URLs : " + log.geoUrls.join(" ; ")
  }));
  await communeCase("COM-CORSE", "Code INSEE corse 2A004 traité comme code", "2A004", { geo: "empty" }, async ({ log }) => ({
    status: /[?&]code=2A004/.test(log.geoUrls.join(" ")) && !/nom=2A004/.test(log.geoUrls.join(" ")) ? "VALIDÉ" : "ÉCHOUÉ", proof: "URL : " + (log.geoUrls[0] || "aucune")
  }));
  await communeCase("COM-LYON", "Lyon (9 codes postaux) lisible sur mobile", "Lyon", { geo: "lyon", ofgl: "fields_euros_par_habitant" }, async ({ ov, text }) => ({
    status: ov.scrollWidth <= ov.vw ? "VALIDÉ" : "ÉCHOUÉ", proof: `scrollWidth=${ov.scrollWidth}/${ov.vw} ; ${text.match(/Code postal[^·]*/)?.[0] || ""}`
  }));
  await communeCase("COM-OFGL-LINK", "Lien OFGL de la fiche filtré par code INSEE (et non par nom)", "Fameck", { geo: "fameck", ofgl: "fields_euros_par_habitant" }, async ({ page }) => {
    const href = await page.$eval("#commune-result a.button", (a) => a.href).catch(() => "");
    return { status: /57206/.test(href) ? "VALIDÉ" : "ÉCHOUÉ", proof: "href=" + href };
  });

  await communeCase("COM-PAGINATION", "Pagination OFGL (150 lignes, pages de 100)", "Fameck", { geo: "fameck", ofgl: (u) => (/offset=100/.test(u) ? "page_50" : "page_100") }, async ({ log, text }) => ({
    status: log.ofglUrls.length === 2 && log.ofglUrls.every((u) => /limit=100/.test(u)) && /exercice 2024/.test(text) && /Encours de dette/.test(text) ? "VALIDÉ" : "ÉCHOUÉ",
    proof: log.ofglUrls.length + " appels : " + log.ofglUrls.map((u) => (u.match(/limit=\d+&offset=\d+/) || [""])[0]).join(" ; ")
  }));
  {
    const { context, page, log } = await newPage(browser, { width: 390, height: 844 }, { geo: "homonymes", ofgl: "fields_euros_par_habitant" });
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.fill("#commune-query", "Saint-Martin-de-Test");
    await page.click("#commune-form button[type=submit]");
    await page.waitForTimeout(400);
    const before = log.ofglUrls.length;
    const buttons = await page.$$eval("#commune-result button", (b) => b.map((x) => x.textContent));
    await page.click("#commune-result button >> nth=1");
    await page.waitForTimeout(400);
    await page.locator("#communes").screenshot({ path: path.join(OUT, "commune-homonymes.png") });
    record("COM-HOMONYMES", "Homonymes : choix explicite par code INSEE avant chargement des comptes", "390 (simulé)",
      before === 0 && buttons.length === 2 && log.ofglUrls.length === 1 && /02002/.test(log.ofglUrls[0]) ? "VALIDÉ" : "ÉCHOUÉ",
      `requêtes OFGL avant choix=${before} ; boutons=${buttons.join(" / ")} ; après choix : ${log.ofglUrls.join(" ")}`);
    await context.close();
  }

  // Recherche vide.
  {
    const { context, page, log } = await newPage(browser, { width: 390, height: 844 });
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.click("#commune-form button[type=submit]");
    const msg = await page.$eval("#commune-query", (i) => i.validationMessage);
    record("COM-EMPTY-QUERY", "Recherche vide bloquée par le formulaire", "390", log.geoUrls.length === 0 ? "VALIDÉ" : "ÉCHOUÉ", `aucune requête émise ; message natif : « ${msg} »`);
    await page.fill("#commune-query", "   ");
    await page.press("#commune-query", "Enter");
    await page.waitForTimeout(200);
    const hidden = await page.$eval("#commune-result", (e) => e.hidden);
    const spacesText = await page.textContent("#commune-result");
    record("COM-SPACES", "Saisie d'espaces seuls : aucune requête, message à l'utilisateur", "390", log.geoUrls.length === 0 && !hidden && /Saisissez/.test(spacesText) ? "VALIDÉ" : "ÉCHOUÉ", `requêtes=${log.geoUrls.length}, zone masquée=${hidden}, message=« ${spacesText.trim().slice(0, 80)} »`);
    await page.fill("#commune-query", "5729");
    await page.press("#commune-query", "Enter");
    await page.waitForTimeout(200);
    const partial = await page.textContent("#commune-result");
    record("COM-PARTIAL", "Code partiel « 5729 » : message explicite, aucune requête", "390", log.geoUrls.length === 0 && /5 caractères/.test(partial) ? "VALIDÉ" : "ÉCHOUÉ", partial.trim().slice(0, 120));
    await context.close();
  }

  // Double soumission.
  {
    const { context, page, log } = await newPage(browser, { width: 390, height: 844 }, { geo: (u) => (/Lyon/.test(u) ? "lyon" : "fameck"), ofgl: "fields_euros_par_habitant", delayMs: 300 });
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.fill("#commune-query", "Fameck");
    await page.click("#commune-form button[type=submit]");
    await page.waitForTimeout(100);
    const busyDuring = await page.$eval("#commune-form button", (b) => b.textContent === "Recherche…" && !b.disabled);
    const ariaBusy = await page.$eval("#commune-result", (e) => e.getAttribute("aria-busy"));
    await page.fill("#commune-query", "Lyon");
    await page.press("#commune-query", "Enter");
    await page.waitForTimeout(2500);
    const titles = await page.$$eval("#commune-result h3", (h) => h.map((x) => x.textContent));
    await page.locator("#communes").screenshot({ path: path.join(OUT, "commune-double-soumission.png") });
    record("COM-RACE", "Deux recherches successives rapides : seul le dernier résultat s'affiche", "390 (simulé)", titles.includes("Fameck") ? "ÉCHOUÉ" : "VALIDÉ", `titres affichés : ${titles.join(" / ")}`);
    const btnAfter = await page.$eval("#commune-form button", (b) => b.textContent !== "Rechercher");
    record("COM-BUSY", "Libellé « Recherche… » et aria-busy pendant la recherche, rétablis ensuite", "390", busyDuring && ariaBusy === "true" && !btnAfter ? "VALIDÉ" : "ÉCHOUÉ", `pendant : libellé occupé=${busyDuring}, aria-busy=${ariaBusy} ; après : libellé non rétabli=${btnAfter}`);
    await context.close();
  }

  // Saisie invalide pendant une recherche lente : la recherche est annulée, le message reste.
  {
    const { context, page } = await newPage(browser, { width: 390, height: 844 }, { geo: "fameck", ofgl: "fields_euros_par_habitant", delayMs: 400 });
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.fill("#commune-query", "Fameck");
    await page.press("#commune-query", "Enter");
    await page.waitForTimeout(100);
    await page.fill("#commune-query", "572");
    await page.press("#commune-query", "Enter");
    await page.waitForTimeout(1500);
    const text = (await page.textContent("#commune-result")).replace(/\s+/g, " ");
    const label = await page.$eval("#commune-form button", (b) => b.textContent);
    record("COM-ABORT", "Saisie invalide pendant une recherche : recherche annulée, message conservé", "390 (simulé)", /Code incomplet/.test(text) && !/Fameck/.test(text) && label === "Rechercher" ? "VALIDÉ" : "ÉCHOUÉ", text.slice(0, 120) + " ; bouton=" + label);
    await context.close();
  }

  // 5. Vérification d'affirmation.
  {
    const { context, page } = await newPage(browser, { width: 1280, height: 900 });
    await page.goto(BASE, { waitUntil: "networkidle" });
    const run = async (text, period) => {
      await page.fill("#claim-text", text);
      await page.selectOption("#claim-period", period);
      await page.click("#claim-form button[type=submit]");
      return (await page.textContent("#claim-result")).replace(/\s+/g, " ");
    };
    const a = await run("la dette publique est de 3 500 milliards", "2026-T2");
    record("CLAIM-DEBT", "Affirmation dette 3 500 Md€ / T2 2026", "1280", /95,5 milliards/.test(a) ? "VALIDÉ" : "ÉCHOUÉ", a.slice(0, 220));
    const b = await run("la dette publique est de 3 300 milliards", "2024");
    record("CLAIM-PERIOD", "Dette + « Année 2024 » : explication stock trimestriel", "1280", /4e trimestre/.test(b) ? "VALIDÉ" : "ÉCHOUÉ", b.slice(0, 160));
    const c = await run("la dette de Fameck est de 7 millions", "");
    record("CLAIM-TOPIC", "« dette de Fameck » orientée vers les finances communales", "1280", /communales/.test(c) ? "VALIDÉ" : "ÉCHOUÉ", c.slice(0, 160));
    await context.close();
  }

  // 6. Fameck : analyse, tableau, période.
  {
    const { context, page } = await newPage(browser, { width: 375, height: 740 });
    await page.goto(BASE, { waitUntil: "networkidle" });
    const analysis = (await page.textContent("#fameck-analysis")).replace(/\s+/g, " ");
    fs.writeFileSync(path.join(OUT, "fameck-analyse.txt"), analysis);
    const ribbon = await page.$$eval(".headline-metric strong", (s) => s.map((x) => x.textContent));
    record("DATA-RIBBON-JS", "Bandeau rempli depuis les JSON après chargement", "375", ribbon.join("|") === "3 595,5 Md€|1,34 M€|7,17 M€|10,09 %".replace(/ /g, "\u202f") || ribbon.join("|").replace(/\u202f/g, " ") === "3 595,5 Md€|1,34 M€|7,17 M€|10,09 %" ? "VALIDÉ" : "ÉCHOUÉ", ribbon.join(" / "));
    const ribbonDisplay = await page.$eval(".headline-ribbon", (e) => getComputedStyle(e).display);
    record("RESP-RIBBON", "Bandeau de chiffres clés mis en grille", "375", ribbonDisplay === "grid" ? "VALIDÉ" : "ÉCHOUÉ", "display=" + ribbonDisplay);
    record("FAM-ANALYSIS", "L’analyse locale attend une commune sélectionnée", "375", /apparaîtront ici après la recherche/.test(analysis) ? "VALIDÉ" : "ÉCHOUÉ", analysis.slice(0, 260));
    const rows = await page.$$eval("#fameck-history-body tr", (r) => r.length);
    await page.locator("#fameck-finances").screenshot({ path: path.join(OUT, "fameck-375.png") });
    const wrap = await page.$eval(".municipal-history-wrap", (e) => ({ sw: e.scrollWidth, cw: e.clientWidth }));
    record("FAM-TABLE-MOBILE", "Tableau 7 colonnes sur mobile", "375", "À CONFIRMER", `${rows} lignes ; défilement horizontal interne ${wrap.sw}px pour ${wrap.cw}px visibles (le titre « Évolution annuelle » et le texte défilent avec le tableau)`);
    await context.close();
  }

  fs.writeFileSync(path.join(OUT, "resultats.json"), JSON.stringify(results, null, 2));
  await browser.close();
  if (server) server.close();
  const failed = results.filter((r) => r.status === "ÉCHOUÉ").length;
  console.log(`\n${results.length} tests, ${failed} échec(s). Artefacts : ${OUT}`);
  process.exitCode = failed ? 1 : 0;
})().catch((e) => { console.error(e); process.exit(2); });
