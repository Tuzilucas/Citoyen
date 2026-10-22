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
  // agregat, montant et euros_par_habitant. Le portail OFGL indexe ces champs dans
  // ses exemples de requêtes et ses enregistrements. Le test HTTP réel depuis le site
  // déployé reste à faire ; voir AUDIT-TECHNIQUE.md.
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

  function detectTopic(text, selectedScope) {
    if (selectedScope && selectedScope !== "auto") return selectedScope;
    const value = normalizeText(text);
    // Une mention communale prime sur « dette » : « la dette de Fameck » n'est pas la dette publique nationale.
    if (/\b(fameck|commune|communal|communale|municipal|municipale|mairie|ville de)\b/.test(value)) return "commune";
    if (/education|ecole|ecoles|enseignement/.test(value)) return "education";
    if (/dette|maastricht|endettement/.test(value)) return "dette";
    if (/budget de l'etat|loi de finances|credits de l'etat/.test(value)) return "budget-etat";
    return "unknown";
  }

  return { OFGL, normalizeText, isInseeCode, classifyCommuneQuery, mergeCommunes, buildOfglParams, ofglDatasetLink, pickAmount, pickPerCapita, summarizeOfglRecords, selectPriorityAggregates, PRIORITY_AGGREGATES, formatQuarter, percentChange, directionWord, detectTopic };
});
