// Fonctions pures partagées par app.js (navigateur) et par les tests unitaires (Node).
// Aucune dépendance, aucun accès au DOM ni au réseau.
(function (root, factory) {
  "use strict";
  const lib = factory();
  if (typeof module === "object" && module.exports) module.exports = lib;
  else root.CitoyenLib = lib;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // Schéma du jeu OFGL « Comptes des communes » : com_code, exer, type_de_budget,
  // agregat, montant et euros_par_habitant. Vérifié sur l'API réelle le 22/10/2026
  // (limit ≤ 100, offset + limit ≤ 10 000, CORS ouvert) ; voir AUDIT-TECHNIQUE.md, section V.
  const OFGL = {
    endpoint: "https://data.ofgl.fr/api/explore/v2.1/catalog/datasets/ofgl-base-communes/records",
    datasetPage: "https://data.ofgl.fr/explore/dataset/ofgl-base-communes/",
    fields: {
      insee: "com_code",
      year: "exer",
      budgetType: "type_de_budget",
      aggregate: "agregat",
      amount: ["montant"],
      perCapita: ["euros_par_habitant"]
    },
    mainBudgetCode: "Budget principal",
    // L'API Explore v2.1 d'Opendatasoft limite « limit » à 100 lignes par appel.
    pageSize: 100,
    maxPages: 20
  };

  const INSEE_CODE = /^(?:\d{5}|2[AB]\d{3})$/;

  function normalizeText(value) {
    return String(value ?? "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[’‘`]/g, "'")
      .replace(/\s+/g, " ")
      .toLocaleLowerCase("fr-FR")
      .trim();
  }

  function isInseeCode(value) {
    return INSEE_CODE.test(String(value ?? "").toUpperCase());
  }

  // Classe la saisie de recherche de commune.
  function classifyCommuneQuery(raw) {
    const value = String(raw ?? "").trim();
    if (!value) return { type: "empty", value: "" };
    if (/^2[AB]\d{3}$/i.test(value)) return { type: "insee", value: value.toUpperCase() };
    if (/^\d{5}$/.test(value)) return { type: "postal-or-insee", value };
    if (/^\d{1,4}$/.test(value) || /^2[AB]\d{0,2}$/i.test(value)) return { type: "partial-code", value };
    if (/^\d+$/.test(value)) return { type: "invalid-code", value };
    return { type: "name", value };
  }

  // Valide et nettoie la réponse de geo.api.gouv.fr ; fusionne plusieurs réponses
  // (code postal + code INSEE) sans doublon, l'identifiant étant le code INSEE.
  function mergeCommunes(lists) {
    const byCode = new Map();
    lists.forEach(({ communes, matchedBy }) => {
      if (!Array.isArray(communes)) return;
      communes.forEach((item) => {
        if (!item || typeof item.nom !== "string" || !isInseeCode(item.code)) return;
        const existing = byCode.get(item.code);
        if (existing) {
          if (!existing.matchedBy.includes(matchedBy)) existing.matchedBy.push(matchedBy);
          return;
        }
        byCode.set(item.code, {
          nom: item.nom,
          code: item.code,
          codeDepartement: typeof item.codeDepartement === "string" ? item.codeDepartement : null,
          codesPostaux: Array.isArray(item.codesPostaux) ? item.codesPostaux.filter((c) => typeof c === "string") : [],
          matchedBy: [matchedBy]
        });
      });
    });
    return [...byCode.values()];
  }

  // Recherche dans l'index compact du socle commun (data/entities/recherche.json : [code INSEE, nom,
  // département, codes postaux]) : même résultat que geo.api.gouv.fr, utilisé si ce service ne répond pas.
  function searchSocleIndex(index, kind, limit) {
    const list = index && Array.isArray(index.communes) ? index.communes : [];
    const max = limit || 10;
    const toItem = ([code, nom, dep, cps]) => ({ code, nom, codeDepartement: dep, codesPostaux: cps });
    if (kind.type === "insee" || kind.type === "postal-or-insee") {
      const value = String(kind.value).toUpperCase();
      const byCode = list.filter((c) => c[0] === value).map(toItem);
      const byPostal = kind.type === "postal-or-insee" ? list.filter((c) => Array.isArray(c[3]) && c[3].includes(value)).map(toItem) : [];
      return mergeCommunes([{ communes: byCode, matchedBy: "code" }, { communes: byPostal, matchedBy: "codePostal" }]).slice(0, max);
    }
    if (kind.type !== "name") return [];
    const q = normalizeText(kind.value).replace(/-/g, " ");
    const norm = (n) => normalizeText(n).replace(/-/g, " ");
    const exact = [], starts = [], contains = [];
    list.forEach((c) => {
      const n = norm(c[1]);
      if (n === q) exact.push(c); else if (n.startsWith(q)) starts.push(c); else if (n.includes(q)) contains.push(c);
    });
    const byName = (a, b) => a[1].localeCompare(b[1], "fr");
    const found = [...exact.sort(byName), ...starts.sort(byName), ...contains.sort(byName)].slice(0, max);
    return mergeCommunes([{ communes: found.map(toItem), matchedBy: "nom" }]);
  }

  // Ensemble des noms de communes normalisés (pour detectTopic).
  function communeNameSet(index) {
    const set = new Set();
    (index && Array.isArray(index.communes) ? index.communes : []).forEach((c) => set.add(normalizeText(c[1]).replace(/-/g, " ")));
    return (name) => set.has(normalizeText(name).replace(/-/g, " "));
  }

  function buildOfglParams(inseeCode, offset) {
    if (!isInseeCode(inseeCode)) throw new Error("Code INSEE invalide");
    const f = OFGL.fields;
    return new URLSearchParams({
      where: f.insee + '="' + String(inseeCode).toUpperCase() + '" AND ' + f.budgetType + '="' + OFGL.mainBudgetCode + '"',
      limit: String(OFGL.pageSize),
      offset: String(offset || 0),
      order_by: f.year + " DESC, " + f.aggregate
    });
  }

  function ofglDatasetLink(inseeCode) {
    return OFGL.datasetPage + "?q=" + encodeURIComponent(String(inseeCode));
  }

  function firstDefined(row, keys) {
    for (const key of keys) {
      if (row && Object.prototype.hasOwnProperty.call(row, key) && row[key] !== null && row[key] !== undefined && row[key] !== "") {
        const number = Number(row[key]);
        return Number.isFinite(number) ? number : null;
      }
    }
    return null;
  }

  // Montant d'une ligne : null si absent (jamais 0 par défaut) ; 0 reste 0.
  function pickAmount(row) { return firstDefined(row, OFGL.fields.amount); }
  function pickPerCapita(row) { return firstDefined(row, OFGL.fields.perCapita); }

  // Contrôle l'exhaustivité et le périmètre des lignes reçues avant de choisir un exercice.
  function summarizeOfglRecords(records, totalCount, inseeCode) {
    const f = OFGL.fields;
    const rows = Array.isArray(records) ? records : [];
    const foreign = rows.filter((row) => row && row[f.insee] !== undefined && String(row[f.insee]).toUpperCase() !== String(inseeCode).toUpperCase());
    const own = rows.filter((row) => row && !foreign.includes(row));
    const complete = typeof totalCount !== "number" || rows.length >= totalCount;
    const years = [...new Set(own.map((row) => Number(row[f.year])).filter(Number.isFinite))].sort((a, b) => b - a);
    const latestYear = complete && years.length ? years[0] : null;
    const latestRecords = latestYear === null ? [] : own.filter((row) => Number(row[f.year]) === latestYear);
    return { received: rows.length, totalCount: typeof totalCount === "number" ? totalCount : null, complete, years, latestYear, latestRecords, foreignCount: foreign.length };
  }

  const PRIORITY_AGGREGATES = [
    "Recettes de fonctionnement", "Dépenses de fonctionnement", "Epargne brute", "Epargne nette",
    "Encours de dette", "Annuité de la dette", "Dépenses d'équipement", "Dépenses d'investissement",
    "Recettes d'investissement", "Frais de personnel"
  ];

  function selectPriorityAggregates(rows) {
    const f = OFGL.fields;
    const selected = [];
    PRIORITY_AGGREGATES.forEach((label) => {
      const found = rows.find((row) => normalizeText(row[f.aggregate]) === normalizeText(label));
      if (found) selected.push(found);
    });
    return selected;
  }

  // Comptes individuels des communes publiés par la DGFiP (exercice 2025) : chaque montant est donné
  // en milliers d'euros, en euros par habitant et avec la moyenne officielle de la strate (communes de
  // même taille et de même type de groupement). Libellés et codes : maquette officielle jointe au jeu.
  const DGFIP = {
    endpoint: "https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/comptes-individuels-des-communes-fichier-global-2025/records",
    datasetPage: "https://data.economie.gouv.fr/explore/dataset/comptes-individuels-des-communes-fichier-global-2025/",
    // Codes « département » de la DGFiP pour l'outre-mer (vérifiés le 23/10/2026 : Pointe-à-Pitre,
    // Fort-de-France, Cayenne, Saint-Denis de La Réunion, Mamoudzou).
    overseas: { "971": "101", "972": "103", "973": "102", "974": "104", "976": "106" }
  };

  // Code INSEE → identifiants DGFiP { dep, icom } ; null si le code n'est pas couvert.
  function dgfipKey(inseeCode) {
    const code = String(inseeCode ?? "").toUpperCase();
    if (!isInseeCode(code)) return null;
    if (/^97/.test(code)) {
      const dep = DGFIP.overseas[code.slice(0, 3)];
      return dep ? { dep, icom: code.slice(2) } : null;
    }
    return { dep: "0" + code.slice(0, 2), icom: code.slice(2) };
  }

  function buildDgfipParams(inseeCode) {
    const key = dgfipKey(inseeCode);
    if (!key) throw new Error("Commune non couverte par les comptes individuels de la DGFiP");
    return new URLSearchParams({ where: 'dep="' + key.dep + '" and icom="' + key.icom + '"', limit: "2" });
  }

  // [libellé, champ en milliers d'euros] ; « f » + champ = euros par habitant, « m » + champ = moyenne de la strate.
  const DGFIP_PER_CAPITA = [
    ["Total des produits de fonctionnement", "prod"],
    ["dont impôts locaux", "impo1"],
    ["dont dotation globale de fonctionnement", "dgf"],
    ["Total des charges de fonctionnement", "charge"],
    ["dont charges de personnel", "perso"],
    ["dont achats et charges externes", "achat"],
    ["dont subventions versées", "subv"],
    ["Capacité d'autofinancement (CAF)", "caf"],
    ["Dépenses d'équipement", "equip"],
    ["Encours total de la dette au 31 décembre", "dette"],
    ["Annuité de la dette", "annu"]
  ];
  // Ratios de structure publiés (« r » + champ, strate : « rm » + champ), en % des produits ou des charges.
  const DGFIP_STRUCTURE = {
    charges: [["Charges de personnel", "perso"], ["Achats et charges externes", "achat"], ["Charges financières", "fin"], ["Contingents", "cont"], ["Subventions versées", "subv"]],
    produits: [["Impôts locaux", "impo1"], ["Autres impôts et taxes", "impo2"], ["Dotation globale de fonctionnement", "dgf"], ["Autres dotations et participations", "autdot"], ["Produits des services et du domaine", "pserdom"]]
  };
  // [libellé, produit (k€), €/hab., moyenne strate €/hab., taux voté, taux moyen de la strate]
  const DGFIP_TAXES = [
    ["Taxe foncière sur les propriétés bâties (avant application du coefficient correcteur)", "pfb", "fpfb", "mpfb", "tfb", "tmfb"],
    ["Taxe foncière sur les propriétés bâties (après application du coefficient correcteur)", "pfbcoco", "fpfbcoco", "mpfbcoco", null, null],
    ["Taxe foncière sur les propriétés non bâties", "pfnb", "fpfnb", "mpfnb", "tfnb", "tmfnb"],
    ["Taxe additionnelle à la taxe foncière sur les propriétés non bâties", "ptafnb", "fptafnb", "mptafnb", "tafnb", "mtmtafnb"],
    ["Taxe d'habitation (résidences secondaires et logements vacants)", "pth", "fpth", "mpth", "tth", "tmth"],
    ["Cotisation foncière des entreprises", "pcfe", "fpcfe", "mpcfe", "ttp", "tmtp"],
    ["Imposition forfaitaire sur les entreprises de réseau", "iferc", "fiferc", "miferc", null, null],
    ["Taxe sur les surfaces commerciales", "tascomc", "ftascomc", "mtascomc", null, null],
    ["Fraction de TVA (montant net)", "tvac", "ftvac", "mtvac", null, null]
  ];

  function num(row, key) {
    if (!key || !row || !Object.prototype.hasOwnProperty.call(row, key)) return null;
    const v = row[key];
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // Lecture d'une fiche DGFiP : valeurs publiées seulement (null si absentes, 0 conservé), aucun calcul.
  function readDgfip(record) {
    if (!record || typeof record !== "object") return null;
    return {
      year: record.an ? String(record.an) : null,
      population: num(record, "pop1"),
      strate: [record.nomsst1, record.nomsst2].filter((x) => typeof x === "string" && x).join(", ") || null,
      perCapita: DGFIP_PER_CAPITA.map(([label, k]) => ({ label, thousands: num(record, k), commune: num(record, "f" + k), strate: num(record, "m" + k) })),
      structure: Object.fromEntries(Object.entries(DGFIP_STRUCTURE).map(([group, list]) => [group, list.map(([label, k]) => ({ label, commune: num(record, "r" + k), strate: num(record, "rm" + k) }))])),
      // Taux : undefined quand la maquette DGFiP ne prévoit pas de taux pour cet impôt (« sans objet »).
      taxes: DGFIP_TAXES.map(([label, p, f, m, rate, mrate]) => ({ label, thousands: num(record, p), commune: num(record, f), strate: num(record, m), rate: rate ? num(record, rate) : undefined, strateRate: mrate ? num(record, mrate) : undefined }))
    };
  }

  // Taux de fiscalité directe locale par bénéficiaire (DGFiP, « Fiscalité locale des particuliers »,
  // issus du fichier REI). Définition de chaque code : notice du REI 2025 (TRACE_REI_2025.xlsx).
  const TAUX = {
    endpoint: "https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/fiscalite-locale-des-particuliers/records",
    datasetPage: "https://data.economie.gouv.fr/explore/dataset/fiscalite-locale-des-particuliers/"
  };
  // [libellé, taxe foncière bâtie, taxe foncière non bâtie, taxe d'habitation] ; null = sans objet.
  const TAUX_ROWS = [
    ["Commune (taux voté)", "e12vote", "b12vote", "h12vote"],
    ["Intercommunalité à fiscalité propre (taux voté)", "e32vote", "b32vote", "h32vote"],
    ["Syndicats de communes", "e22", "b22", "h22"],
    ["Taxe spéciale d’équipement (établissement public foncier)", "e52", "b52", "h52"],
    ["Autres taxes spéciales d’équipement (Grand Paris, Guadeloupe, Martinique, Sud-Ouest)", "e52a", "b52a", "h52a"],
    ["Taxe GEMAPI (milieux aquatiques et inondations, intercommunalité)", "e52ggemapi", "b52ggemapi", "h52ggemapi"],
    ["Taxe additionnelle spéciale annuelle (Île-de-France)", "e52tasa", null, null],
    ["Taxe additionnelle au foncier non bâti (commune)", null, "b12tafnb", null],
    ["Taxe additionnelle au foncier non bâti (intercommunalité)", null, "b32tafnb", null],
    ["Taxe additionnelle au foncier non bâti (Métropole du Grand Paris)", null, "b32mgptafnb", null]
  ];

  function buildTauxParams(inseeCode) {
    if (!isInseeCode(inseeCode)) throw new Error("Code INSEE invalide");
    return new URLSearchParams({ where: 'insee_com="' + String(inseeCode).toUpperCase() + '"', order_by: "exercice desc", limit: "1" });
  }

  // Taux publiés seulement : null si absent, undefined si la taxe n'a pas cette composante (« sans objet »).
  function readTaux(record) {
    if (!record || typeof record !== "object") return null;
    const pick = (k) => (k ? num(record, k) : undefined);
    return {
      year: record.exercice ? String(record.exercice) : null,
      epci: typeof record.q03 === "string" && record.q03 ? record.q03 : null,
      rows: TAUX_ROWS.map(([label, tfb, tfnb, th]) => ({ label, tfb: pick(tfb), tfnb: pick(tfnb), th: pick(th) })),
      global: { tfb: num(record, "taux_global_tfb"), tfnb: num(record, "taux_global_tfnb"), th: num(record, "taux_global_th") },
      teom: num(record, "taux_plein_teom"),
      thMajoration: record.ind_majothrs === "OUI" ? num(record, "thsurtaxrstau") : undefined
    };
  }

  // Fiche financière standard d'une commune, sur le modèle de la fiche pilote de Fameck (schéma 1.1.0 :
  // indicateurs du dernier exercice, ratios calculés, série annuelle, provenance). Même structure et même
  // règle pour toutes les communes ; seules les valeurs publiées par l'OFGL (budget principal) sont reprises.
  // [identifiant, agrégat OFGL, libellé, clé de la série annuelle, définition]
  const COMMUNE_INDICATORS = [
    ["operating_revenue", "Recettes de fonctionnement", "Recettes de fonctionnement", "revenue", "Ressources courantes de l'exercice : impôts et taxes, dotations, participations, produits des services."],
    ["operating_expenses", "Dépenses de fonctionnement", "Dépenses de fonctionnement", "expense", "Coût courant des services : personnel, achats, charges financières, subventions versées."],
    ["gross_savings", "Epargne brute", "Épargne brute", "gross_savings", "Ressource dégagée par le fonctionnement, avant remboursement du capital de la dette."],
    ["net_savings", "Epargne nette", "Épargne nette", "net_savings", "Épargne brute après remboursement du capital de la dette."],
    ["investment_expenses", "Dépenses d'investissement", "Dépenses d'investissement", "investment_expense", "Dépenses d'investissement de l'exercice (équipement, subventions d'équipement, autres)."],
    ["equipment_expenses", "Dépenses d'équipement", "Dépenses d'équipement", "equipment_expense", "Acquisitions et travaux sur le patrimoine de la commune ; une partie de l'investissement."],
    ["investment_revenue", "Recettes d'investissement", "Recettes d'investissement", "investment_revenue", "Ressources d'investissement de l'exercice, emprunts compris."],
    ["debt_outstanding", "Encours de dette", "Encours de dette", "debt", "Capital restant dû à la fin de l'exercice."],
    ["debt_repayment", "Remboursements d'emprunts hors GAD", "Remboursement du capital de la dette", "debt_repayment", "Capital des emprunts remboursé dans l'année (hors gestion active de la dette)."],
    ["debt_service", "Annuité de la dette", "Annuité de la dette", "debt_service", "Montant payé dans l'année au titre de la dette."],
    ["working_capital", "Fonds de roulement", "Fonds de roulement", "working_capital", "Indicateur du financement à moyen terme, distinct de la trésorerie mobilisable."],
    ["local_taxes", "Impôts locaux", "Impôts locaux", "local_taxes", "Produit des impôts locaux perçus par la commune."],
    ["dgf", "Dotation globale de fonctionnement", "Dotation globale de fonctionnement", "dgf", "Principale dotation de l'État aux collectivités."],
    ["staff_costs", "Frais de personnel", "Frais de personnel", "staff_costs", "Rémunérations et charges du personnel."]
  ];
  const COMMUNE_DATASET_VERSION = "2.0.0";

  // Ratio calculé seulement si le numérateur et un dénominateur strictement positif sont publiés.
  const cents = (v) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
  function ratioOf(a, b, factor) {
    return Number.isFinite(a) && Number.isFinite(b) && b > 0 ? a / b * factor : null;
  }

  // commune : { code, nom, ... } (géographie) ; rows : lignes OFGL (budget principal) ; totalCount :
  // nombre de lignes annoncé. Renvoie null si la série n'est pas exploitable (réponse incomplète).
  function buildCommuneDataset(commune, rows, totalCount, retrievedAt) {
    const code = String(commune && commune.code || "").toUpperCase();
    const summary = summarizeOfglRecords(rows, totalCount, code);
    if (!summary.complete || summary.latestYear === null) return null;
    const f = OFGL.fields;
    const own = (Array.isArray(rows) ? rows : []).filter((r) => r && String(r[f.insee] ?? code).toUpperCase() === code && (!r[f.budgetType] || r[f.budgetType] === OFGL.mainBudgetCode));
    const byKey = new Map();
    own.forEach((r) => byKey.set(Number(r[f.year]) + "|" + normalizeText(r[f.aggregate]), r));
    const row = (year, aggregate) => byKey.get(year + "|" + normalizeText(aggregate)) || null;
    const years = summary.years.slice().sort((a, b) => a - b);
    const population = (year) => {
      const r = own.find((x) => Number(x[f.year]) === year && Number.isFinite(Number(x.ptot)));
      return r ? Number(r.ptot) : null;
    };
    const latest = summary.latestYear;
    const series = years.map((year) => {
      const entry = { year, population: population(year) };
      COMMUNE_INDICATORS.forEach(([, aggregate, , key]) => { const r = row(year, aggregate); entry[key] = r ? cents(pickAmount(r)) : null; });
      entry.savings_rate = ratioOf(entry.gross_savings, entry.revenue, 100);
      entry.debt_years = ratioOf(entry.debt, entry.gross_savings, 1);
      entry.debt_per_capita = ratioOf(entry.debt, entry.population, 1);
      return entry;
    });
    const last = series[series.length - 1];
    return {
      schema_version: COMMUNE_DATASET_VERSION,
      dataset_id: "commune-" + code + "-finances",
      title: "Repères budgétaires de " + (commune.nom || code) + " — série " + years[0] + "-" + latest,
      entity: {
        name: commune.nom || null,
        insee_code: code,
        postal_codes: Array.isArray(commune.codesPostaux) ? commune.codesPostaux.slice() : [],
        department_code: commune.codeDepartement || null
      },
      display_year: latest,
      budget_scope: "budget principal",
      currency: "EUR",
      indicators: COMMUNE_INDICATORS.map(([id, aggregate, label, key, definition]) => {
        const r = row(latest, aggregate);
        return { id, label, source_aggregate: aggregate, value_eur: r ? cents(pickAmount(r)) : null, value_per_capita_eur: r ? cents(pickPerCapita(r)) : null, definition };
      }),
      calculated_indicators: [
        { id: "gross_savings_rate", label: "Taux d'épargne brute", value_percent: last.savings_rate, formula: "Épargne brute / recettes de fonctionnement × 100" },
        { id: "debt_to_gross_savings", label: "Capacité de désendettement", value_years: last.debt_years, formula: "Encours de dette / épargne brute" },
        { id: "staff_to_operating_expenses", label: "Frais de personnel / dépenses de fonctionnement", value_percent: ratioOf(last.staff_costs, last.expense, 100), formula: "Frais de personnel / dépenses de fonctionnement × 100" },
        { id: "debt_per_capita", label: "Dette par habitant", value_eur: last.debt_per_capita, formula: "Encours de dette / population de l'exercice (OFGL)" }
      ],
      annual_series: series,
      provenance: {
        source_publisher: "OFGL — Observatoire des finances et de la gestion publique locales",
        official_dataset_url: OFGL.datasetPage,
        dataset_link_for_entity: ofglDatasetLink(code),
        primary_data_origin: "DGFiP, comptes de gestion (agrégats calculés par l'OFGL)",
        retrieved_at: retrievedAt || null,
        rows_received: summary.received,
        rows_announced: summary.totalCount
      },
      notes: [
        "Montants en euros courants, budget principal seulement (budgets annexes exclus).",
        "Une valeur absente vaut null (« non disponible »), jamais 0.",
        "Les ratios sont calculés uniquement à partir des valeurs publiées ; ils ne constituent pas un jugement sur la gestion."
      ]
    };
  }

  function formatQuarter(period) {
    const match = /^(\d{4})-T([1-4])$/.exec(String(period ?? ""));
    if (!match) return String(period ?? "");
    return (match[2] === "1" ? "1er" : match[2] + "e") + " trimestre " + match[1];
  }

  // Évolution en %, ou null si la base est nulle, négative ou non numérique.
  function percentChange(current, base) {
    if (!Number.isFinite(current) || !Number.isFinite(base) || base <= 0) return null;
    return (current / base - 1) * 100;
  }

  function directionWord(pct, up, down, flat) {
    if (pct === null) return null;
    if (Math.abs(pct) < 0.05) return flat;
    return pct > 0 ? up : down;
  }

  // isCommuneName (facultatif) : reconnaît un nom de commune du socle commun (data/entities/recherche.json),
  // pour toutes les communes de France et non une liste figée.
  function detectTopic(text, selectedScope, isCommuneName) {
    if (selectedScope && selectedScope !== "auto") return selectedScope;
    const value = normalizeText(text);
    // Une mention communale prime sur « dette » : « la dette de Fameck » n'est pas la dette publique nationale.
    if (/\b(commune|communal|communale|municipal|municipale|mairie|ville de)\b/.test(value)) return "commune";
    if (typeof isCommuneName === "function") {
      const m = /\b(?:(?:de|a|au)\s+|d')([a-z][a-z' -]{1,60}?)(?=\s+(?:est|a|sont|atteint|depasse|vaut|s'eleve)\b|[,.;:!?]|$)/.exec(value);
      if (m && isCommuneName(m[1].trim())) return "commune";
    }
    if (/education|ecole|ecoles|enseignement/.test(value)) return "education";
    if (/dette|maastricht|endettement/.test(value)) return "dette";
    if (/budget de l'etat|loi de finances|credits de l'etat/.test(value)) return "budget-etat";
    return "unknown";
  }

  return { OFGL, DGFIP, TAUX, COMMUNE_INDICATORS, COMMUNE_DATASET_VERSION, buildCommuneDataset, searchSocleIndex, communeNameSet, dgfipKey, buildDgfipParams, readDgfip, buildTauxParams, readTaux, normalizeText, isInseeCode, classifyCommuneQuery, mergeCommunes, buildOfglParams, ofglDatasetLink, pickAmount, pickPerCapita, summarizeOfglRecords, selectPriorityAggregates, PRIORITY_AGGREGATES, formatQuarter, percentChange, directionWord, detectTopic };
});
