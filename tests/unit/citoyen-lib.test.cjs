// Tests unitaires des fonctions pures : node --test tests/unit
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const lib = require("../../assets/js/citoyen-lib.js");

test("classifyCommuneQuery distingue nom, codes complets, partiels et vides", () => {
  assert.deepEqual(lib.classifyCommuneQuery("   "), { type: "empty", value: "" });
  assert.equal(lib.classifyCommuneQuery("Fameck").type, "name");
  assert.equal(lib.classifyCommuneQuery("Saint-Étienne").type, "name");
  assert.deepEqual(lib.classifyCommuneQuery(" 57290 "), { type: "postal-or-insee", value: "57290" });
  assert.deepEqual(lib.classifyCommuneQuery("2a004"), { type: "insee", value: "2A004" });
  assert.equal(lib.classifyCommuneQuery("5729").type, "partial-code");
  assert.equal(lib.classifyCommuneQuery("572900").type, "invalid-code");
});

test("isInseeCode accepte la Corse et refuse les codes mal formés", () => {
  assert.ok(lib.isInseeCode("57206"));
  assert.ok(lib.isInseeCode("2B033"));
  assert.ok(!lib.isInseeCode("2C033"));
  assert.ok(!lib.isInseeCode("5720"));
  assert.ok(!lib.isInseeCode('57206" OR 1=1'));
});

test("mergeCommunes déduplique par code INSEE et ignore les entrées invalides", () => {
  const merged = lib.mergeCommunes([
    { communes: [{ nom: "Fameck", code: "57206", codesPostaux: ["57290"] }], matchedBy: "code" },
    { communes: [{ nom: "Fameck", code: "57206" }, { nom: "<img onerror=x>", code: "bad" }, null], matchedBy: "codePostal" },
    { communes: { error: "not an array" }, matchedBy: "nom" }
  ]);
  assert.equal(merged.length, 1);
  assert.deepEqual(merged[0].matchedBy, ["code", "codePostal"]);
  assert.equal(merged[0].codeDepartement, null);
});

test("buildOfglParams respecte la limite de 100 lignes et pagine", () => {
  const p = lib.buildOfglParams("57206", 200);
  assert.equal(p.get("limit"), "100");
  assert.equal(p.get("offset"), "200");
  assert.match(p.get("where"), /com_code="57206"/);
  assert.match(p.get("where"), /type_de_budget="Budget principal"/);
  assert.equal(lib.OFGL.fields.year, "exer");
  assert.equal(lib.OFGL.fields.aggregate, "agregat");
  assert.throws(() => lib.buildOfglParams('57206" OR "1"="1', 0));
});

test("le lien OFGL est filtré par code INSEE, jamais par nom", () => {
  assert.equal(lib.ofglDatasetLink("57206"), "https://data.ofgl.fr/explore/dataset/ofgl-base-communes/?q=57206");
});

test("pickAmount : absent → null, zéro → 0, texte non numérique → null", () => {
  assert.equal(lib.pickAmount({}), null);
  assert.equal(lib.pickAmount({ montant: null }), null);
  assert.equal(lib.pickAmount({ montant: "" }), null);
  assert.equal(lib.pickAmount({ montant: 0 }), 0);
  assert.equal(lib.pickAmount({ montant: "abc" }), null);
  assert.equal(lib.pickPerCapita({ euros_par_habitant: 479.2 }), 479.2);
  assert.equal(lib.pickAmount({ montant: 12 }), 12);
});

test("summarizeOfglRecords refuse de choisir un exercice si la réponse est tronquée", () => {
  const rows = [{ exer: "2019", com_code: "57206", agregat: "Encours de dette", montant: 1 }];
  const s = lib.summarizeOfglRecords(rows, 600, "57206");
  assert.equal(s.complete, false);
  assert.equal(s.latestYear, null);
  assert.deepEqual(s.latestRecords, []);
});

test("summarizeOfglRecords prend le dernier exercice d'une réponse complète et écarte les autres communes", () => {
  const rows = [
    { exer: "2023", com_code: "57206", agregat: "A", montant: 1 },
    { exer: "2024", com_code: "57206", agregat: "A", montant: 2 },
    { exer: "2025", com_code: "69123", agregat: "A", montant: 3 }
  ];
  const s = lib.summarizeOfglRecords(rows, 3, "57206");
  assert.equal(s.latestYear, 2024);
  assert.equal(s.foreignCount, 1);
  assert.deepEqual(s.years, [2024, 2023]);
});

test("selectPriorityAggregates tolère accents et apostrophes typographiques", () => {
  const rows = [{ agregat: "Épargne brute" }, { agregat: "Dépenses d’équipement" }, { agregat: "Autre" }];
  assert.deepEqual(lib.selectPriorityAggregates(rows).map((r) => r.agregat), ["Épargne brute", "Dépenses d’équipement"]);
});

test("formatQuarter écrit « 1er trimestre »", () => {
  assert.equal(lib.formatQuarter("2026-T1"), "1er trimestre 2026");
  assert.equal(lib.formatQuarter("2026-T2"), "2e trimestre 2026");
  assert.equal(lib.formatQuarter("2026"), "2026");
});

test("percentChange et directionWord ne produisent pas de verbe faux", () => {
  assert.equal(lib.percentChange(110, 100).toFixed(1), "10.0");
  assert.equal(lib.percentChange(10, 0), null);
  assert.equal(lib.percentChange(10, -5), null);
  assert.equal(lib.directionWord(-35.7, "progresse", "recule", "stable"), "recule");
  assert.equal(lib.directionWord(4, "progresse", "recule", "stable"), "progresse");
  assert.equal(lib.directionWord(0.01, "progresse", "recule", "stable"), "stable");
});

test("detectTopic : une mention communale prime sur « dette »", () => {
  assert.equal(lib.detectTopic("la dette de la commune est de 7 millions", "auto"), "commune");
  assert.equal(lib.detectTopic("la dette publique est de 3 500 milliards", "auto"), "dette");
  assert.equal(lib.detectTopic("budget de l'Éducation nationale", "auto"), "education");
  assert.equal(lib.detectTopic("n'importe quoi", "auto"), "unknown");
  assert.equal(lib.detectTopic("dette", "commune"), "commune");
});

// Fiche financière standard : construite sur le modèle de Fameck, identique pour toutes les communes.
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, "../fixtures/ofgl-fameck-57206.json"), "utf8"));
const FAMECK = { code: "57206", nom: "Fameck", codesPostaux: ["57290"], codeDepartement: "57" };

test("Fiche standard de Fameck : valeurs OFGL reprises telles quelles, identités comptables vérifiées", () => {
  const d = lib.buildCommuneDataset(FAMECK, fixture.results, fixture.total_count, "2026-10-23T00:00:00Z");
  assert.equal(d.schema_version, lib.COMMUNE_DATASET_VERSION);
  assert.equal(d.dataset_id, "commune-57206-finances");
  assert.equal(d.display_year, 2025);
  assert.deepEqual(d.annual_series.map((y) => y.year), [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025]);
  // Valeurs de référence de l'ancienne fiche Fameck qui concordaient déjà avec l'OFGL (2024).
  const y2024 = d.annual_series.find((y) => y.year === 2024);
  assert.equal(Math.round(y2024.debt), 7171313);
  assert.equal(Math.round(y2024.local_taxes), 5344083);
  assert.equal(y2024.population, 14965);
  d.annual_series.forEach((y) => {
    assert.ok(Math.abs(y.revenue - y.expense - y.gross_savings) <= 1, "épargne brute " + y.year);
    assert.ok(Math.abs(y.gross_savings - y.debt_repayment - y.net_savings) <= 1, "épargne nette " + y.year);
    assert.ok(Math.abs(y.gross_savings / y.revenue * 100 - y.savings_rate) < 1e-9, "taux " + y.year);
  });
  // Chaque indicateur du dernier exercice est la ligne OFGL correspondante, sans recalcul.
  d.indicators.forEach((i) => {
    const row = fixture.results.find((r) => r.exer === "2025" && r.agregat === i.source_aggregate);
    assert.ok(row, i.id);
    assert.equal(i.value_eur, Math.round(row.montant * 100) / 100, i.id);
  });
});

test("Fiche standard : même structure pour toute commune, null (jamais 0) quand l'OFGL ne publie pas", () => {
  const rows = [
    { com_code: "01001", exer: "2025", type_de_budget: "Budget principal", agregat: "Recettes de fonctionnement", montant: 583305.88, euros_par_habitant: 650, ptot: 897 },
    { com_code: "01001", exer: "2025", type_de_budget: "Budget principal", agregat: "Encours de dette", montant: 0, euros_par_habitant: 0, ptot: 897 }
  ];
  const other = lib.buildCommuneDataset({ code: "01001", nom: "L'Abergement-Clémenciat" }, rows, 2);
  const ref = lib.buildCommuneDataset(FAMECK, fixture.results, fixture.total_count);
  assert.deepEqual(Object.keys(other), Object.keys(ref));
  assert.deepEqual(other.indicators.map((i) => i.id), ref.indicators.map((i) => i.id));
  assert.deepEqual(Object.keys(other.annual_series[0]), Object.keys(ref.annual_series[0]));
  const byId = Object.fromEntries(other.indicators.map((i) => [i.id, i]));
  assert.equal(byId.debt_outstanding.value_eur, 0);
  assert.equal(byId.gross_savings.value_eur, null);
  assert.equal(other.calculated_indicators.find((c) => c.id === "gross_savings_rate").value_percent, null);
  // Réponse tronquée : aucune fiche plutôt qu'une fiche fausse.
  assert.equal(lib.buildCommuneDataset(FAMECK, fixture.results.slice(0, 10), fixture.total_count), null);
});

test("Fiches standard publiées : structure identique pour Fameck, Lyon et une petite commune", () => {
  const dir = path.join(__dirname, "../../data/communes/finances");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  assert.ok(files.length >= 3);
  const shapes = files.map((f) => {
    const d = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    assert.equal(d.entity.insee_code + ".json", f);
    return JSON.stringify([Object.keys(d), d.indicators.map((i) => i.id), Object.keys(d.annual_series[0]), Object.keys(d.entity)]);
  });
  assert.equal(new Set(shapes).size, 1);
});

test("Socle commun : toutes les communes de France, une structure unique", () => {
  const index = JSON.parse(fs.readFileSync(path.join(__dirname, "../../data/entities.json"), "utf8"));
  const dir = path.join(__dirname, "../../data/entities/communes");
  let total = 0, withoutEpci = 0;
  const keys = new Set();
  fs.readdirSync(dir).forEach((f) => {
    const file = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    file.entities.forEach((e) => {
      total += 1;
      keys.add(Object.keys(e).join(","));
      assert.ok(lib.isInseeCode(e.entity_id), e.entity_id);
      assert.equal(e.department_code + ".json", f);
      if (e.parent_epci === null) withoutEpci += 1;
    });
  });
  assert.equal(total, index.counts.communes);
  assert.ok(total > 34000);
  assert.equal(keys.size, 1);
  assert.equal(withoutEpci, index.counts.communes_sans_epci);
  const fameck = JSON.parse(fs.readFileSync(path.join(dir, "57.json"), "utf8")).entities.find((e) => e.entity_id === "57206");
  assert.equal(fameck.parent_epci.entity_id, "992367730");
  assert.deepEqual(fameck.postal_codes, ["57290"]);
});

test("Recherche de secours dans le socle et reconnaissance de toute commune", () => {
  const idx = JSON.parse(fs.readFileSync(path.join(__dirname, "../../data/entities/recherche.json"), "utf8"));
  assert.deepEqual(lib.searchSocleIndex(idx, { type: "name", value: "fameck" }).map((c) => c.code), ["57206"]);
  const byCode = lib.searchSocleIndex(idx, { type: "postal-or-insee", value: "57290" });
  assert.ok(byCode.some((c) => c.code === "57206" && c.matchedBy.includes("codePostal")));
  assert.equal(lib.searchSocleIndex(idx, { type: "insee", value: "2A004" })[0].nom, "Ajaccio");
  const isCommune = lib.communeNameSet(idx);
  assert.equal(lib.detectTopic("la dette de Lyon atteint 1 milliard", "auto", isCommune), "commune");
  assert.equal(lib.detectTopic("l’endettement d’Aix-en-Provence est de 2 millions", "auto", isCommune), "commune");
  assert.equal(lib.detectTopic("la dette de la France est de 3 000 milliards", "auto", isCommune), "dette");
});

test("Analyse communale dynamique : aucune commune n'est imposée par défaut", () => {
  const html = fs.readFileSync(path.join(__dirname, "../../index.html"), "utf8");
  const debt = JSON.parse(fs.readFileSync(path.join(__dirname, "../../data/indicators/dette-publique-france.json"), "utf8"));
  const text = html.replace(/[\u00a0\u202f]/g, " ");
  assert.ok(text.includes('id="municipal-title">Les finances de la commune recherchée'));
  assert.ok(text.includes('id="municipal-status">En attente d’une commune'));
  // Donnée absente = « Non disponible » (jamais un tiret ni un zéro), tuiles communales masquées avant la recherche.
  assert.ok(text.includes('id="ribbon-commune-savings">Non disponible'));
  assert.ok(text.includes('id="ribbon-commune-debt">Non disponible'));
  assert.ok(text.includes('id="ribbon-commune-rate">Non disponible'));
  assert.equal((text.match(/class="headline-metric headline-commune" hidden/g) || []).length, 3);
  assert.ok(!/fameck/.test(text.replace(/Ex\. : Fameck/, "")), "aucun identifiant propre à Fameck");
  assert.ok(text.includes('id="municipal-history-wrap" hidden'));
  assert.ok(!/Épargne brute · Fameck|Encours de dette · Fameck|Taux d’épargne brute · Fameck/.test(text));
  const d = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(debt.records[0].debt_eur_billion).replace(/[\u00a0\u202f]/g, " ");
  assert.ok(text.includes('id="ribbon-debt">' + d + ' <abbr title="milliards d’euros">Md€</abbr>'));
});

test("Glossaire : les définitions partagées reprennent mot pour mot celles de Pièces à l’appui quand elles sont disponibles", () => {
  const html = fs.readFileSync(path.join(__dirname, "../../index.html"), "utf8");
  const palFile = path.join(__dirname, "../../../france_2027-code-source/data/pages/pratique.json");
  if (!fs.existsSync(palFile)) return; // dépôt voisin absent : contrôle ignoré
  const norm = (t) => t.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/[\u00a0\u202f]/g, " ").replace(/\u2019/g, "'").replace(/\s+/g, " ").trim();
  const pal = JSON.parse(fs.readFileSync(palFile, "utf8")).glossaire.filter((e) => e.theme === "finances");
  const entries = new Map([...html.matchAll(/<summary>(.*?)<\/summary><p>(.*?)<\/p>/g)].map((m) => [m[1], norm(m[2])]));
  let shared = 0;
  pal.forEach((e) => {
    if (!entries.has(e.term)) return;
    shared += 1;
    assert.equal(entries.get(e.term), norm(e.definition), e.term);
  });
  assert.ok(shared >= 40, shared + " termes partagés");
});

test("Glossaire : toutes les définitions sont dans la liste filtrable, triées", () => {
  const html = fs.readFileSync(path.join(__dirname, "../../index.html"), "utf8");
  const list = html.slice(html.indexOf('id="glossary-list"'), html.indexOf('class="glossary-disclaimer"'));
  const all = (html.match(/class="glossary-entry"/g) || []).length;
  const inList = (list.match(/class="glossary-entry"/g) || []).length;
  assert.equal(inList, all);
  const titles = [...list.matchAll(/<summary>(.*?)<\/summary>/g)].map((m) => lib.normalizeText(m[1]));
  assert.deepEqual(titles, titles.slice().sort((a, b) => a.localeCompare(b, "fr")));
});

test("Aucune insertion HTML de données externes dans app.js", () => {
  const js = fs.readFileSync(path.join(__dirname, "../../assets/js/app.js"), "utf8");
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(js));
});

test("dgfipKey convertit le code INSEE au format DGFiP (métropole, Corse, outre-mer)", () => {
  assert.deepEqual(lib.dgfipKey("57206"), { dep: "057", icom: "206" });
  assert.deepEqual(lib.dgfipKey("2a004"), { dep: "02A", icom: "004" });
  // Codes vérifiés sur la DGFiP : Pointe-à-Pitre, Fort-de-France, Cayenne, Saint-Denis, Mamoudzou.
  assert.deepEqual(lib.dgfipKey("97120"), { dep: "101", icom: "120" });
  assert.deepEqual(lib.dgfipKey("97209"), { dep: "103", icom: "209" });
  assert.deepEqual(lib.dgfipKey("97302"), { dep: "102", icom: "302" });
  assert.deepEqual(lib.dgfipKey("97411"), { dep: "104", icom: "411" });
  assert.deepEqual(lib.dgfipKey("97611"), { dep: "106", icom: "611" });
  assert.equal(lib.dgfipKey("97501"), null);
  assert.equal(lib.dgfipKey("1234"), null);
  assert.equal(lib.buildDgfipParams("57206").get("where"), 'dep="057" and icom="206"');
  assert.throws(() => lib.buildDgfipParams("97501"));
});

test("readDgfip reprend les valeurs publiées sans calcul ni zéro inventé", () => {
  const d = lib.readDgfip({ an: "2025", pop1: 14917, nomsst1: "communes de 10 000 à 20 000 hab", nomsst2: "appartenant à un groupement fiscalisé (FPU)", prod: 13263.36, fprod: 889.14, mprod: 1521.88, pfb: 3934.2, tfb: 27.85, tmfb: 41.07, tvac: 0, rmimpo2: 8.27 });
  assert.equal(d.year, "2025");
  assert.equal(d.strate, "communes de 10 000 à 20 000 hab, appartenant à un groupement fiscalisé (FPU)");
  assert.deepEqual(d.perCapita[0], { label: "Total des produits de fonctionnement", thousands: 13263.36, commune: 889.14, strate: 1521.88 });
  const tfb = d.taxes[0];
  assert.deepEqual([tfb.thousands, tfb.rate, tfb.strateRate, tfb.commune], [3934.2, 27.85, 41.07, null]);
  const tva = d.taxes.find((x) => /TVA/.test(x.label));
  assert.equal(tva.thousands, 0, "un zéro publié reste un zéro");
  assert.equal(tva.rate, undefined, "pas de taux prévu par la maquette : sans objet");
  const impo2 = d.structure.produits.find((x) => x.label === "Autres impôts et taxes");
  assert.deepEqual([impo2.commune, impo2.strate], [null, 8.27]);
  assert.equal(lib.readDgfip(null), null);
});

test("readTaux distingue taux publié, taux absent et composante sans objet", () => {
  assert.equal(lib.buildTauxParams("57206").get("where"), 'insee_com="57206"');
  const d = lib.readTaux({ exercice: "2025", q03: "CA du Val de Fensch", e12vote: 27.85, e32vote: 5, e22: 0, taux_global_tfb: 33.4, taux_plein_teom: 9.67, ind_majothrs: "NON" });
  assert.equal(d.year, "2025");
  const commune = d.rows[0];
  assert.deepEqual([commune.tfb, commune.tfnb, commune.th], [27.85, null, null]);
  const tasa = d.rows.find((r) => /Île-de-France/.test(r.label));
  assert.equal(tasa.tfnb, undefined, "la TASA n'existe pas pour le foncier non bâti : sans objet");
  assert.equal(d.rows.find((r) => r.label === "Syndicats de communes").tfb, 0, "un zéro publié reste un zéro");
  assert.deepEqual(d.global, { tfb: 33.4, tfnb: null, th: null });
  assert.equal(d.thMajoration, undefined);
});

test("frenchTypo pose les espaces insécables et l’apostrophe typographique sans changer le texte", () => {
  const out = lib.frenchTypo("Qu'est-ce que c'est ? Taux : 37,44 % « strate » ; 3 595,5 Md€ !");
  assert.equal(out, "Qu’est-ce que c’est ? Taux : 37,44 % « strate » ; 3 595,5 Md€ !");
  // Seuls les espaces et les apostrophes changent : le texte normalisé est identique.
  const norm = (t) => t.replace(/[  ]/g, " ").replace(/’/g, "'");
  assert.equal(norm(out), "Qu'est-ce que c'est ? Taux : 37,44 % « strate » ; 3 595,5 Md€ !");
  assert.equal(lib.frenchTypo("https://exemple.fr/a?b=1"), "https://exemple.fr/a?b=1");
  assert.equal(lib.frenchTypo(null), "");
});

test("formatQuarter écrit les trimestres en toutes lettres", () => {
  assert.equal(lib.formatQuarter("2026-T2"), "2e trimestre 2026");
  assert.equal(lib.formatQuarter("2026-T1"), "1er trimestre 2026");
});

test("Formulaires : pas de bulle native (attribut required retiré), préconnexion aux trois services publics", () => {
  const html = fs.readFileSync(path.join(__dirname, "../../index.html"), "utf8");
  assert.ok(!/\brequired\b/.test(html), "aucun champ required : les messages du site (aria-live) s’affichent");
  assert.ok(/id="commune-result"[^>]*aria-live="polite"/.test(html));
  for (const host of ["https://geo.api.gouv.fr", "https://data.ofgl.fr", "https://data.economie.gouv.fr"]) {
    assert.ok(html.includes('<link rel="preconnect" href="' + host + '" crossorigin>'), host);
  }
});

test("Mode sombre : jetons redéfinis sous prefers-color-scheme, aucune couleur en dur hors des blocs de jetons", () => {
  const css = fs.readFileSync(path.join(__dirname, "../../assets/css/app.css"), "utf8");
  assert.ok(/@media \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-theme="light"\]\)/.test(css));
  assert.ok(css.includes(':root[data-theme="dark"]'));
  const rest = css.slice(css.indexOf("/* ---------- Base ---------- */"));
  assert.deepEqual(rest.match(/#[0-9a-fA-F]{3,8}\b/g) || [], []);
});

test("formatEuros affiche le montant OFGL en euros, sans conversion en millions", () => {
  const plain = (t) => t.replace(/[  ]/g, " ");
  assert.equal(plain(lib.formatEuros(1000)), "1 000 €");
  assert.equal(plain(lib.formatEuros(1473652.4)), "1 473 652 €");
  assert.equal(plain(lib.formatEuros(-12500)), "-12 500 €");
  assert.equal(lib.formatEuros(null), "Non disponible");
  assert.equal(lib.formatEuros(Number.NaN), "Non disponible");
  assert.ok(!/M€|millions/.test(lib.formatEuros(6252679)));
});

test("communeRibbon : libellés courts, euros tels que publiés, donnée absente = « Non disponible »", () => {
  const plain = (t) => t.replace(/[  ]/g, " ");
  const r = lib.communeRibbon("Fameck", "2025", 1473652.21, 6252679, 11.11);
  assert.equal(plain(r.savings), "1 473 652 €");
  assert.equal(plain(r.debt), "6 252 679 €");
  assert.equal(plain(r.rate), "11,1 %");
  assert.equal(r.savingsContext, "Fameck · exercice 2025");
  assert.equal(r.debtContext, "Fameck · fin de l’exercice 2025");
  assert.equal(r.rateContext, "Fameck · calcul du site");
  const empty = lib.communeRibbon("Fameck", "2025", null, null, null);
  assert.deepEqual([empty.savings, empty.debt, empty.rate], ["Non disponible", "Non disponible", "Non disponible"]);
  // Petits montants : jamais « 0,00 M€ ».
  assert.equal(plain(lib.communeRibbon("X", "2024", 999, 1000, null).debt), "1 000 €");
});
