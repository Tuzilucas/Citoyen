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
  assert.equal(lib.detectTopic("la dette de Fameck est de 7 millions", "auto"), "commune");
  assert.equal(lib.detectTopic("la dette publique est de 3 500 milliards", "auto"), "dette");
  assert.equal(lib.detectTopic("budget de l'Éducation nationale", "auto"), "education");
  assert.equal(lib.detectTopic("n'importe quoi", "auto"), "unknown");
  assert.equal(lib.detectTopic("dette", "commune"), "commune");
});

// Contrôles de cohérence des données publiées (aucune valeur n'est corrigée ici).
test("Fameck : épargne brute ≈ recettes − dépenses et ratios recalculables (écart ≤ 1 € / 0,01)", () => {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, "../../data/indicators/fameck-finances-2024.json"), "utf8"));
  data.annual_series.forEach((y) => {
    assert.ok(Math.abs(y.revenue - y.expense - y.gross_savings) <= 1, "épargne brute " + y.year);
    assert.ok(Math.abs(y.gross_savings - y.debt_repayment - y.net_savings) <= 1, "épargne nette " + y.year);
    assert.ok(Math.abs(y.gross_savings / y.revenue * 100 - y.savings_rate) < 0.006, "taux " + y.year);
    assert.ok(Math.abs(y.debt / y.gross_savings - y.debt_years) < 0.006, "désendettement " + y.year);
    assert.ok(Math.abs(Math.round(y.debt / y.population) - y.debt_per_capita) <= 0, "dette/hab " + y.year);
  });
  const y = data.annual_series.find((r) => r.year === data.display_year);
  const byId = Object.fromEntries(data.indicators.map((i) => [i.id, i]));
  assert.equal(byId.operating_revenue.value_eur, y.revenue);
  assert.equal(byId.debt_outstanding.value_eur, y.debt);
  data.indicators.forEach((i) => assert.equal(Math.round(i.value_eur / y.population), i.value_per_capita_eur, i.id));
});

test("Analyse communale dynamique : aucune commune n'est imposée par défaut", () => {
  const html = fs.readFileSync(path.join(__dirname, "../../index.html"), "utf8");
  const debt = JSON.parse(fs.readFileSync(path.join(__dirname, "../../data/indicators/dette-publique-france.json"), "utf8"));
  const text = html.replace(/ /g, " ");
  assert.ok(text.includes('id="municipal-title">Les finances de la commune recherchée'));
  assert.ok(text.includes('id="municipal-status">En attente d’une commune'));
  assert.ok(text.includes('id="ribbon-fameck-savings">—'));
  assert.ok(text.includes('id="ribbon-fameck-debt">—'));
  assert.ok(text.includes('id="ribbon-fameck-rate">—'));
  assert.ok(text.includes('id="municipal-history-wrap" hidden'));
  assert.ok(!/Épargne brute · Fameck|Encours de dette · Fameck|Taux d’épargne brute · Fameck/.test(text));
  const d = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(debt.records[0].debt_eur_billion).replace(/ /g, " ");
  assert.ok(text.includes('id="ribbon-debt">' + d + " Md€"));
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
