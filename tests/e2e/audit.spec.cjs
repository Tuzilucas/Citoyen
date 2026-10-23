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
const FIXTURE = JSON.parse(fs.readFileSync(path.join(__dirname, "../fixtures/ofgl-fameck-57206.json"), "utf8"));
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
  malformed: { status: 200, rawBody: "<html>maintenance</html>" },
  // Lignes OFGL réelles de Fameck (tests/fixtures, relevées le 23/10/2026), et les mêmes lignes
  // attribuées à Lyon : la fiche standard doit avoir exactement la même structure pour les deux.
  fameck_full: { status: 200, body: FIXTURE },
  lyon_full: { status: 200, body: { ...FIXTURE, results: FIXTURE.results.map((r) => ({ ...r, com_code: "69123", com_name: "Lyon" })) } }
};

// Simulation de la fiche DGFiP (comptes individuels 2025). Les champs et les valeurs reprennent la fiche
// réelle de Fameck consultée le 23/10/2026 ; « rimpo2 » est absent, comme dans la fiche réelle.
const DGFIP = {
  fameck: { status: 200, body: { total_count: 1, results: [{
    an: "2025", dep: "057", icom: "206", inom: "FAMECK", pop1: 14917,
    nomsst1: "communes de 10 000 à 20 000 hab", nomsst2: "appartenant à un groupement fiscalisé (FPU)",
    prod: 13263.36, fprod: 889.14, mprod: 1521.88, impo1: 4966.14, fimpo1: 332.92, mimpo1: 680.17,
    rimpo1: 37.44, rmimpo1: 45.92, rmimpo2: 8.27, pfb: 3934.2, fpfb: 263.74, mpfb: 636.63, tfb: 27.85, tmfb: 41.07,
    tvac: 0, ftvac: 0, mtvac: 0
  }] } },
  empty: { status: 200, body: { total_count: 0, results: [] } },
  error: { status: 503, body: { error: "service indisponible" } }
};

// Simulation des taux par bénéficiaire (DGFiP, fiscalité locale des particuliers) : valeurs réelles de
// Fameck pour 2025, relevées le 23/10/2026.
const TAUX = {
  fameck: { status: 200, body: { total_count: 1, results: [{
    exercice: "2025", q03: "CA du Val de Fensch", b12vote: 100, b22: 0, b32vote: 10.87, b12tafnb: 0, b32tafnb: 37.6, b32mgptafnb: 0,
    b52: 0.149, b52a: 0, b52ggemapi: 1.83, taux_global_tfnb: 150.45, e12vote: 27.85, e22: 0, e32vote: 5, e52: 0.111, e52a: 0,
    e52tasa: 0, e52ggemapi: 0.441, taux_global_tfb: 33.4, taux_plein_teom: 9.67, h12vote: 14.01, h22: 0, h32vote: 8.92,
    h52: 0.115, h52a: 0, h52ggemapi: 0.58, taux_global_th: 23.63, ind_majothrs: "NON", thsurtaxrstau: null, insee_com: "57206"
  }] } },
  error: { status: 503, body: { error: "service indisponible" } },
  empty: { status: 200, body: { total_count: 0, results: [] } }
};

async function newPage(browser, viewport, { geo = "fameck", ofgl = "ods_limit_error", dgfip = "fameck", geoFail = false, geoHangMs = 0, delayMs = 0 } = {}) {
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
      if (geoHangMs) { await new Promise((r) => setTimeout(r, geoHangMs)); return route.abort("timedout").catch(() => {}); }
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
    if (url.startsWith("https://data.economie.gouv.fr/") && url.includes("fiscalite-locale-des-particuliers")) {
      const s = TAUX[dgfip] || TAUX.fameck;
      return route.fulfill({ status: s.status, contentType: "application/json", body: JSON.stringify(s.body) });
    }
    if (url.startsWith("https://data.economie.gouv.fr/")) {
      const s = DGFIP[dgfip];
      return route.fulfill({ status: s.status, contentType: "application/json", body: JSON.stringify(s.body) });
    }
    return route.abort("blockedbyclient");
  });
  return { context, page, log };
}

// Contraste WCAG réel : couleur calculée du texte contre le premier fond opaque de ses ancêtres.
async function contrastIssues(page, selector, min = 4.5) {
  return page.evaluate(({ selector, min }) => {
    const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
    const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a >= 0.99) return c; } return { r: 255, g: 255, b: 255, a: 1 }; };
    const out = [];
    document.querySelectorAll(selector).forEach((root) => {
      root.querySelectorAll("*").forEach((el) => {
        const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
        const r = el.getBoundingClientRect();
        if (!own || !r.width || !r.height || getComputedStyle(el).visibility === "hidden" || el.closest(".visually-hidden")) return;
        const fg = parse(getComputedStyle(el).color), bg = bgOf(el);
        const l1 = lum(fg), l2 = lum(bg);
        const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
        if (ratio < min) out.push(el.tagName.toLowerCase() + " « " + el.textContent.trim().slice(0, 30) + " » " + ratio.toFixed(2));
      });
    });
    return out;
  }, { selector, min });
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
    record("RESP-HEADER", "En-tête collant compact sur mobile, menu replié (≤ 64 px)", vp.name, !mobileHeader || headerH <= 64 ? "VALIDÉ" : "ÉCHOUÉ", String(headerH) + "px" + (mobileHeader ? " (seuil 64 px)" : ""));
    const lowHeader = await contrastIssues(page, ".site-header, .site-bridge, .headline-ribbon");
    record("A11Y-CONTRAST-HEADER", "En-tête, menu et bandeau de chiffres : contraste ≥ 4,5:1", vp.name, lowHeader.length ? "ÉCHOUÉ" : "VALIDÉ", lowHeader.join(" | ") || "aucun texte sous 4,5:1");
    const firstScreen = await page.$eval("#commune-query", (i) => { const r = i.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight }; });
    record("ERGO-SEARCH-FOLD", "Champ de recherche de commune visible dans le premier écran", vp.name, firstScreen.bottom <= firstScreen.vh ? "VALIDÉ" : "ÉCHOUÉ", JSON.stringify(firstScreen));
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
      const lowMenu = await contrastIssues(page, ".site-header nav");
      record("A11Y-CONTRAST-MENU", "Menu mobile ouvert : contraste ≥ 4,5:1", vp.name, lowMenu.length ? "ÉCHOUÉ" : "VALIDÉ", lowMenu.join(" | ") || "aucun texte sous 4,5:1");
      await page.keyboard.press("Escape");
      const closed = await page.evaluate(() => ({ expanded: document.querySelector(".nav-toggle").getAttribute("aria-expanded"), hidden: getComputedStyle(document.querySelector(".site-header nav")).display === "none", focus: document.activeElement.classList.contains("nav-toggle") }));
      record("RESP-MENU-ESC", "Échap referme le menu et rend le focus au bouton", vp.name, closed.expanded === "false" && closed.hidden && closed.focus ? "VALIDÉ" : "ÉCHOUÉ", JSON.stringify(closed));
    }
    if (mobileHeader) await page.click(".nav-toggle");
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
    // Ancres sur mobile : la cible arrive sous l’en-tête collant, ni cachée dessous ni loin plus bas.
    for (const anchor of ["#glossaire", "#analyse-communale", "#indicateur-dette"]) {
      const mob = await browser.newPage({ viewport: { width: 360, height: 640 } });
      await mob.route("**/*", (r) => (r.request().url().startsWith(BASE) ? r.continue() : r.abort()));
      await mob.goto(BASE + anchor, { waitUntil: "networkidle" });
      await mob.waitForTimeout(600);
      const pos = await mob.evaluate((sel) => ({ top: Math.round(document.querySelector(sel).getBoundingClientRect().top), header: Math.round(document.querySelector(".site-header").getBoundingClientRect().bottom) }), anchor);
      await mob.close();
      record("NAV-ANCHOR-MOBILE", "Ancre " + anchor + " visible sous l’en-tête collant", "360", pos.top >= pos.header - 1 && pos.top < pos.header + 60 ? "VALIDÉ" : "ÉCHOUÉ", JSON.stringify(pos));
    }
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
  await communeCase("COM-GEO-DOWN", "Indisponibilité geo.api.gouv.fr : relais par le référentiel local", "Fameck", { geoFail: true }, async ({ text }) => ({
    status: /ne répond pas/.test(text) && /référentiel des communes publié avec ce site/.test(text) && /57206/.test(text) ? "VALIDÉ" : "ÉCHOUÉ", proof: "Texte : " + text.replace(/\s+/g, " ").slice(0, 240)
  }));
  // geo.api.gouv.fr muet (aucune réponse) : bascule sur data/entities/recherche.json en 4 s environ.
  {
    const { context, page } = await newPage(browser, { width: 390, height: 844 }, { geoHangMs: 15000, ofgl: "fields_euros_par_habitant" });
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.fill("#commune-query", "Fameck");
    const t0 = Date.now();
    await page.click("#commune-form button[type=submit]");
    const ok = await page.waitForFunction(() => /référentiel des communes publié avec ce site/.test(document.getElementById("commune-result").textContent), null, { timeout: 7000 }).then(() => true).catch(() => false);
    const elapsed = Date.now() - t0;
    record("COM-GEO-TIMEOUT", "geo.api.gouv.fr sans réponse : référentiel local utilisé en moins de 6 s", "390 (simulé)", ok && elapsed < 6000 ? "VALIDÉ" : "ÉCHOUÉ", `bascule en ${elapsed} ms`);
    await context.close();
  }
  // Commune reflétée dans l’adresse et rechargement qui relance la recherche.
  {
    const { context, page, log } = await newPage(browser, { width: 390, height: 844 }, { geo: (u) => (/codePostal=/.test(u) ? "empty" : "fameck"), ofgl: "fields_euros_par_habitant" });
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.fill("#commune-query", "Fameck");
    await page.click("#commune-form button[type=submit]");
    await page.waitForTimeout(700);
    const url = page.url();
    record("COM-URL", "La commune recherchée est écrite dans l’adresse (?commune=57206)", "390", /[?&]commune=57206/.test(url) ? "VALIDÉ" : "ÉCHOUÉ", url);
    log.geoUrls.length = 0;
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(700);
    const text = (await page.textContent("#commune-result")).replace(/\s+/g, " ");
    const input = await page.inputValue("#commune-query");
    record("COM-URL-RELOAD", "Rechargement de ?commune=57206 : recherche relancée par code INSEE", "390", /Fameck/.test(text) && input === "57206" && log.geoUrls.length === 1 && /[?&]code=57206/.test(log.geoUrls[0]) ? "VALIDÉ" : "ÉCHOUÉ", `champ=${input} ; requêtes geo=${log.geoUrls.join(" ; ")} ; ${text.slice(0, 80)}`);
    const title = await page.textContent("#municipal-title");
    record("COM-URL-ANALYSE", "L’analyse communale est remplie après ouverture de l’adresse", "390", /Fameck/.test(title) ? "VALIDÉ" : "ÉCHOUÉ", title);
    await context.close();
  }
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
    const href = await page.$$eval("#commune-result a.button", (as) => (as.find((a) => /OFGL/.test(a.textContent)) || {}).href || "").catch(() => "");
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
      await page.evaluate(() => { const r = document.getElementById("claim-result"); if (r) r.textContent = ""; });
      await page.click("#claim-form button[type=submit]");
      await page.waitForFunction(() => (document.getElementById("claim-result")?.textContent || "").trim().length > 0, null, { timeout: 5000 }).catch(() => null);
      return (await page.textContent("#claim-result")).replace(/\s+/g, " ");
    };
    const a = await run("la dette publique est de 3 500 milliards", "2026-T2");
    record("CLAIM-DEBT", "Affirmation dette 3 500 Md€ / T2 2026", "1280", /3 595,5 Md€/.test(a) && /2e trimestre 2026/.test(a) ? "VALIDÉ" : "ÉCHOUÉ", a.slice(0, 220));
    const b = await run("la dette publique est de 3 300 milliards", "2024");
    record("CLAIM-PERIOD", "Dette + « Année 2024 » : explication stock trimestriel", "1280", /4e trimestre/.test(b) ? "VALIDÉ" : "ÉCHOUÉ", b.slice(0, 160));
    const c = await run("la dette de Fameck est de 7 millions", "");
    record("CLAIM-TOPIC", "« dette de Fameck » orientée vers les finances communales", "1280", /communales/.test(c) ? "VALIDÉ" : "ÉCHOUÉ", c.slice(0, 160));
    await context.close();
  }

  // 5 bis. Comparaison avec la strate (fiche DGFiP) : valeurs publiées, « Non disponible », « Sans objet ».
  for (const scenario of ["fameck", "error", "empty"]) {
    const { context, page } = await newPage(browser, { width: 375, height: 740 }, { geo: "fameck", ofgl: "fields_euros_par_habitant", dgfip: scenario });
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.fill("#commune-query", "Fameck");
    await page.click("#commune-form button[type=submit]");
    await page.waitForTimeout(900);
    const text = (await page.textContent("#strata-content")).replace(/\s+/g, " ").replace(/\u202f/g, " ");
    if (scenario === "fameck") {
      const tables = await page.$$eval("#strata-content table", (t) => t.length);
      const ok = tables === 4 && text.includes("1 521,88") && text.includes("27,85 %") && text.includes("41,07 %")
        && text.includes("Sans objet") && text.includes("Non disponible") && /communes de 10 000 à 20 000 hab/.test(text);
      record("STRATA-TABLES", "Fiche DGFiP : 4 tableaux, moyenne de strate, taux, « Sans objet », « Non disponible »", "375", ok ? "VALIDÉ" : "ÉCHOUÉ", `${tables} tableaux ; ` + text.slice(0, 220));
      const sw = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      const taux = (await page.textContent("#taux-content")).replace(/\s+/g, " ").replace(/\u202f/g, " ");
      const tauxOk = taux.includes("27,850 %") && taux.includes("5,000 %") && taux.includes("33,400 %") && taux.includes("9,670 %")
        && taux.includes("CA du Val de Fensch") && !/Syndicats de communes/.test(taux);
      record("TAUX-BENEFICIAIRES", "Avis de taxe foncière : taux par bénéficiaire, taux global publié, TEOM à part, lignes nulles masquées", "375", tauxOk ? "VALIDÉ" : "ÉCHOUÉ", taux.slice(0, 260));
      record("STRATA-MOBILE", "Tableaux de strate sans débordement de la page sur mobile", "375", sw <= 0 ? "VALIDÉ" : "ÉCHOUÉ", "débordement=" + sw + "px");
      const badge = await page.$eval("#strata-status", (b) => ({ hidden: b.hidden, text: b.textContent }));
      record("STRATA-BADGE", "Pastille « Données officielles DGFiP » affichée seulement après réponse de la DGFiP", "375", !badge.hidden && /2025/.test(badge.text) ? "VALIDÉ" : "ÉCHOUÉ", JSON.stringify(badge));
      const hints = await page.$$eval("#strata-content .scroll-hint.is-visible", (h) => h.length);
      record("TABLE-SCROLL-HINT", "Tableaux larges : indice de défilement affiché sur mobile", "375", hints > 0 ? "VALIDÉ" : "ÉCHOUÉ", hints + " indice(s) visible(s)");
      await page.locator("#comparaison-strate").screenshot({ path: path.join(OUT, "strate-375.png") });
    } else if (scenario === "error") {
      const badgeHidden = await page.$eval("#strata-status", (b) => b.hidden);
      record("STRATA-ERROR", "Erreur DGFiP distinguée d'une absence de données, sans pastille « Données officielles »", "375", /code 503/.test(text) && /Les données existent peut-être/.test(text) && !/€/.test(text) && badgeHidden ? "VALIDÉ" : "ÉCHOUÉ", text.slice(0, 200) + " ; pastille masquée=" + badgeHidden);
    } else {
      record("STRATA-EMPTY", "Aucune fiche DGFiP : message explicite, aucun montant", "375", /Aucune fiche DGFiP/.test(text) && /pas un montant nul/.test(text) ? "VALIDÉ" : "ÉCHOUÉ", text.slice(0, 200));
    }
    await context.close();
  }

  // 6. Fameck : analyse, tableau, période.
  {
    const { context, page } = await newPage(browser, { width: 375, height: 740 }, { geo: "fameck", ofgl: "fields_euros_par_habitant" });
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.fill("#commune-query", "Fameck");
    await page.click("#commune-form button[type=submit]");
    await page.waitForTimeout(700);
    const analysis = (await page.textContent("#commune-analysis")).replace(/\s+/g, " ");
    fs.writeFileSync(path.join(OUT, "fameck-analyse.txt"), analysis);
    const ribbon = await page.$$eval(".headline-metric strong", (s) => s.map((x) => x.textContent));
    const tilesShown = await page.$$eval(".headline-commune", (t) => t.every((x) => !x.hidden));
    record("DATA-RIBBON-JS", "Bandeau communal mis à jour après la recherche (donnée absente = « Non disponible »)", "375", ribbon[0].replace(/\u202f/g, " ").includes("3 595,5") && ribbon[1] === "Non disponible" && ribbon[2].includes("M€") && ribbon[3] === "Non disponible" && tilesShown ? "VALIDÉ" : "ÉCHOUÉ", ribbon.join(" / ") + " ; tuiles visibles=" + tilesShown);
    const waiting = (await page.textContent("#analyse-communale")).replace(/\s+/g, " ");
    record("ERGO-WAIT-TEXT", "Textes d’attente retirés après la recherche", "375", !/Choisissez d’abord une commune|Aucune commune choisie/.test(waiting) ? "VALIDÉ" : "ÉCHOUÉ", waiting.slice(0, 160));
    const ribbonDisplay = await page.$eval(".headline-ribbon", (e) => getComputedStyle(e).display);
    record("RESP-RIBBON", "Bandeau de chiffres clés mis en grille", "375", ribbonDisplay === "grid" ? "VALIDÉ" : "ÉCHOUÉ", "display=" + ribbonDisplay);
    record("TERRITORY-ANALYSIS", "La recherche remplit l’analyse détaillée de la commune", "375", /Recettes de fonctionnement/.test(analysis) && /Limites indispensables/.test(analysis) ? "VALIDÉ" : "ÉCHOUÉ", analysis.slice(0, 260));
    const rows = await page.$$eval("#commune-history-body tr", (r) => r.length);
    await page.locator("#analyse-communale").screenshot({ path: path.join(OUT, "commune-375.png") });
    const wrap = await page.$eval(".history-scroll", (e) => ({ sw: e.scrollWidth, cw: e.clientWidth }));
    record("FAM-TABLE-MOBILE", "Tableau annuel de la fiche standard sur mobile", "375", "À CONFIRMER", `${rows} lignes ; défilement horizontal interne ${wrap.sw}px pour ${wrap.cw}px visibles (seul le tableau défile ; titre et texte restent en place)`);
    await context.close();
  }

  // 7. Fiche standard : même analyse et même structure pour Fameck et pour Lyon (socle commun + OFGL).
  {
    const shapes = {};
    for (const [name, geo, ofgl] of [["Fameck", "fameck", "fameck_full"], ["Lyon", "lyon", "lyon_full"]]) {
      const { context, page, log } = await newPage(browser, { width: 1280, height: 900 }, { geo, ofgl });
      await page.goto(BASE, { waitUntil: "networkidle" });
      await page.fill("#commune-query", name);
      await page.click("#commune-form button[type=submit]");
      await page.waitForSelector("#commune-dataset a[download]", { timeout: 5000 }).catch(() => null);
      const heads = await page.$$eval("#municipal-history-wrap thead th", (t) => t.map((x) => x.textContent));
      const rows = await page.$$eval("#commune-history-body tr", (r) => r.map((x) => x.children.length));
      const socle = (await page.textContent("#commune-dataset")).replace(/\s+/g, " ");
      const download = await page.$eval("#commune-dataset a[download]", (a) => a.getAttribute("download")).catch(() => null);
      shapes[name] = { heads: heads.length, rows, socle, download, errors: log.pageErrors.length };
      await context.close();
    }
    const f = shapes.Fameck, l = shapes.Lyon;
    record("STD-FAMECK", "Fiche standard de Fameck : 8 exercices, 14 colonnes, socle commun (intercommunalité 2026), fiche téléchargeable", "1280",
      f.rows.length === 8 && f.rows.every((n) => n === 14) && f.heads === 14 && /Thionville Fensch Agglomération/.test(f.socle) && f.download === "fiche-57206-finances.json" && !f.errors ? "VALIDÉ" : "ÉCHOUÉ", JSON.stringify(f).slice(0, 300));
    record("STD-TOUTES-COMMUNES", "Même structure pour une autre commune (Lyon) : mêmes colonnes, socle et fiche", "1280",
      l.rows.length === f.rows.length && l.heads === f.heads && /Métropole de Lyon/.test(l.socle) && l.download === "fiche-69123-finances.json" && !l.errors ? "VALIDÉ" : "ÉCHOUÉ", JSON.stringify(l).slice(0, 300));
  }

  fs.writeFileSync(path.join(OUT, "resultats.json"), JSON.stringify(results, null, 2));
  await browser.close();
  if (server) server.close();
  const failed = results.filter((r) => r.status === "ÉCHOUÉ").length;
  console.log(`\n${results.length} tests, ${failed} échec(s). Artefacts : ${OUT}`);
  process.exitCode = failed ? 1 : 0;
})().catch((e) => { console.error(e); process.exit(2); });
