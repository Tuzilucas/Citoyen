(() => {
  "use strict";
  const lib = window.CitoyenLib;
  const REQUEST_TIMEOUT_MS = 10000;
  const DATA_URL = "data/indicators/dette-publique-france.json";
  const money = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
  const ratio = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  let debtData = null;

  function formatDebt(value) {
    return money.format(value) + " milliards €";
  }

  function renderDebt(data) {
    const records = data.records || [];
    const latest = records[0];
    const value = document.getElementById("latest-debt");
    const period = document.getElementById("latest-period");
    const share = document.getElementById("latest-ratio");
    const body = document.getElementById("debt-table-body");
    if (!latest || !value || !period || !share || !body) return;

    value.textContent = formatDebt(latest.debt_eur_billion);
    period.textContent = lib.formatQuarter(latest.period) + " · France entière";
    share.textContent = ratio.format(latest.debt_gdp_percent) + " %";
    body.replaceChildren();

    records.forEach((record) => {
      const tr = document.createElement("tr");
      [record.period, money.format(record.debt_eur_billion), ratio.format(record.debt_gdp_percent) + " %"].forEach((text) => {
        const td = document.createElement("td");
        td.textContent = text;
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
  }

  function showResult(title, status, paragraphs, links = []) {
    const result = document.getElementById("claim-result");
    if (!result) return;
    result.replaceChildren();
    const heading = document.createElement("h3");
    heading.textContent = title;
    result.appendChild(heading);
    const badge = document.createElement("span");
    badge.className = "result-status";
    badge.textContent = status;
    result.appendChild(badge);
    paragraphs.forEach((text) => {
      const p = document.createElement("p");
      p.textContent = text;
      result.appendChild(p);
    });
    links.forEach((link) => {
      const p = document.createElement("p");
      const a = document.createElement("a");
      a.href = link.href;
      a.textContent = link.label;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      p.appendChild(a);
      result.appendChild(p);
    });
    result.hidden = false;
    result.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function handleClaim(event) {
    event.preventDefault();
    const text = document.getElementById("claim-text")?.value.trim() || "";
    const period = document.getElementById("claim-period")?.value || "";
    const selectedScope = document.getElementById("claim-scope")?.value || "auto";
    const topic = lib.detectTopic(text, selectedScope);

    if (topic === "dette" && debtData && /^\d{4}(-\d{4})?$/.test(period)) {
      showResult("La dette se mesure par trimestre", "Période à préciser", [
        "La dette publique est un stock mesuré à la fin de chaque trimestre, pas un montant annuel. Pour une année, choisissez le 4e trimestre, qui correspond à la dette au 31 décembre.",
        "Aucune comparaison n'est produite tant que la période n'est pas précisée."
      ], [{ label: "Voir la définition de la dette de Maastricht", href: "https://www.insee.fr/fr/metadonnees/definition/c1091" }]);
      return;
    }
    if (topic === "dette" && debtData) {
      const match = period ? debtData.records.find((record) => record.period === period) : debtData.records[0];
      if (!match) {
        showResult("Période non couverte par cette série", "Données insuffisantes", [
          "La série actuellement intégrée ne contient pas la période sélectionnée. Aucune conclusion n'est produite.",
          "La prochaine étape consiste à importer la série complète depuis le fichier officiel et à vérifier automatiquement chaque valeur."
        ], [
          { label: "Ouvrir les données brutes INSEE (XLSX)", href: debtData.source.raw_file_url },
          { label: "Voir la définition de la dette de Maastricht", href: "https://www.insee.fr/fr/metadonnees/definition/c1091" }
        ]);
        return;
      }
      const amountMatch = text.match(/(\d[\d\s]*(?:[,.]\d+)?)\s*milliards?/i);
      let comparison = "Le montant de l'affirmation n'a pas pu être extrait de façon fiable. Compare la valeur de référence avec le texte original et vérifie le périmètre.";
      if (amountMatch) {
        const claimed = Number(amountMatch[1].replace(/\s/g, "").replace(",", "."));
        if (Number.isFinite(claimed)) {
          const delta = match.debt_eur_billion - claimed;
          const absDelta = Math.abs(delta);
          comparison = "Le texte contient " + money.format(claimed) + " milliards €. L'écart avec la référence INSEE est de " + money.format(absDelta) + " milliards € (" + (delta >= 0 ? "la référence est supérieure" : "la référence est inférieure") + "). Cet écart arithmétique ne suffit pas à lui seul à qualifier l'affirmation : il faut vérifier l'arrondi, la période et le périmètre exacts.";
        }
      }
      showResult("Référence officielle trouvée : dette publique", "Comparaison indicative — transcription à contrôler", [
        "Période : " + match.period + ".",
        "Valeur publiée par l'INSEE : " + formatDebt(match.debt_eur_billion) + ", soit " + ratio.format(match.debt_gdp_percent) + " % du PIB.",
        comparison,
        "Périmètre : ensemble des administrations publiques françaises, dette brute consolidée au sens de Maastricht. Il s'agit d'un stock en fin de trimestre, pas du budget annuel.",
        "La série a été transcrite du tableau officiel ; son rapprochement automatisé avec le XLSX reste à effectuer. Aucun verdict automatique vrai/faux n'est émis."
      ], [
        { label: "Ouvrir le fichier brut officiel (XLSX)", href: debtData.source.raw_file_url },
        { label: "Ouvrir la page de référence INSEE", href: debtData.source.official_page_url },
        { label: "Voir la publication INSEE de recoupement", href: debtData.extraction.cross_check.official_release_page_url },
        { label: "Afficher le JSON utilisé par le prototype", href: DATA_URL }
      ]);
      return;
    }

    const guidance = {
      education: {
        title: "Sujet identifié : budget de l'Éducation nationale",
        links: [{ label: "Consulter les données détaillées des comptes nationaux — INSEE", href: "https://www.insee.fr/fr/statistiques/8988843" }, { label: "Consulter le portail officiel du budget de l'État", href: "https://www.budget.gouv.fr/" }],
        paragraphs: [
          "Aucun jeu de données comparables par année n'est encore intégré ici pour conclure sur ce montant.",
          "Avant toute comparaison, il faudra préciser si l'affirmation porte sur les crédits votés, les crédits consommés, le budget du ministère ou une dépense plus large d'éducation, ainsi que sur les euros courants ou constants.",
          "L'absence de données dans ce prototype ne signifie ni que l'affirmation est fausse ni qu'elle est vraie."
        ]
      },
      commune: {
        title: "Sujet identifié : finances communales",
        links: [{ label: "Ouvrir les comptes des communes — OFGL", href: "https://data.ofgl.fr/explore/dataset/ofgl-base-communes/" }, { label: "Ouvrir les comptes individuels DGFiP 2025", href: "https://www.data.gouv.fr/datasets/comptes-individuels-des-communes-fichier-global-2025" }],
        paragraphs: [
          "Les comptes communaux sont chargés pour la commune recherchée ; les données restent indicatives tant que leurs agrégats et périmètres ne sont pas rapprochés de la documentation officielle.",
          "Une comparaison communale devra distinguer budget principal, budgets annexes et données consolidées, ainsi que prévisions et exécution. Les chiffres communaux ne doivent pas être traités comme une série officiellement réconciliée tant que le contrôle brut n'est pas terminé.",
          "Aucun verdict n'est produit sans série vérifiée correspondant exactement à la question."
        ]
      },
      "budget-etat": {
        title: "Sujet identifié : budget de l'État",
        links: [{ label: "Portail officiel du budget de l'État", href: "https://www.budget.gouv.fr/" }, { label: "Données détaillées des comptes nationaux — INSEE", href: "https://www.insee.fr/fr/statistiques/8988843" }],
        paragraphs: [
          "Les crédits du budget de l'État et les dépenses exécutées ne sont pas interchangeables.",
          "Aucune série annuelle comparable n'est encore intégrée dans ce prototype pour le sujet saisi.",
          "Le site doit importer les documents bruts, documenter les changements de périmètre et vérifier la série avant de conclure."
        ]
      },
      unknown: {
        title: "Précise le sujet à vérifier",
        links: [{ label: "Parcourir les données officielles de l'INSEE", href: "https://www.insee.fr/fr/statistiques" }],
        paragraphs: [
          "Le prototype ne reconnaît pas encore ce sujet ou ne possède pas de série correspondante.",
          "Essaie « dette publique », « budget de l'Éducation nationale » ou « finances d'une commune ». Aucun résultat ne sera inventé si les données ne sont pas disponibles."
        ]
      }
    };
    const result = guidance[topic] || guidance.unknown;
    const paragraphs = period ? ["Période demandée : " + period + ".", ...result.paragraphs] : result.paragraphs;
    showResult(result.title, "Pas encore de données validées pour conclure", paragraphs, result.links);
  }

  const normalizeSearch = (value) => lib.normalizeText(value);

  function addResultLink(container, label, href) {
    const p = document.createElement("p");
    const a = document.createElement("a");
    a.href = href;
    a.textContent = label;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    p.appendChild(a);
    container.appendChild(p);
  }

  function formatFinancialAmount(value) {
    return Number.isFinite(value) ? new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value) + " €" : "Non disponible";
  }

  class ServiceError extends Error {
    constructor(service, reason) {
      super(service + " : " + reason);
      this.service = service;
      this.reason = reason;
    }
  }

  // fetch avec délai maximal et annulation liée à la recherche en cours.
  async function fetchJson(url, service, signal) {
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    if (signal) signal.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response;
    try {
      response = await fetch(url, { headers: { Accept: "application/json" }, signal: controller.signal });
    } catch (error) {
      if (signal && signal.aborted) throw error;
      throw new ServiceError(service, controller.signal.aborted ? "timeout" : "network");
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener("abort", onAbort);
    }
    if (!response.ok) throw new ServiceError(service, "http-" + response.status);
    try {
      return await response.json();
    } catch (error) {
      throw new ServiceError(service, "format");
    }
  }

  // Récupère toutes les pages (100 lignes maximum par appel) pour une commune identifiée par son code INSEE.
  async function fetchCommuneFinances(commune, signal) {
    const rows = [];
    let total = null;
    for (let page = 0; page < lib.OFGL.maxPages; page += 1) {
      const params = lib.buildOfglParams(commune.code, page * lib.OFGL.pageSize);
      const payload = await fetchJson(lib.OFGL.endpoint + "?" + params.toString(), "ofgl", signal);
      if (!payload || !Array.isArray(payload.results)) throw new ServiceError("ofgl", "format");
      if (typeof payload.total_count === "number") total = payload.total_count;
      rows.push(...payload.results);
      if (payload.results.length < lib.OFGL.pageSize || (total !== null && rows.length >= total)) break;
    }
    return { rows, total };
  }

  function serviceErrorText(error, serviceLabel) {
    const reason = error && error.reason ? error.reason : "network";
    if (reason === "timeout") return serviceLabel + " n’a pas répondu dans le délai de " + REQUEST_TIMEOUT_MS / 1000 + " secondes.";
    if (reason === "format") return serviceLabel + " a renvoyé une réponse dans un format inattendu.";
    if (reason.startsWith("http-")) return serviceLabel + " a refusé ou n’a pas pu traiter la demande (code " + reason.slice(5) + ").";
    return serviceLabel + " est injoignable (réseau ou blocage du navigateur).";
  }

  function statusBadge(text, tone) {
    const status = document.createElement("span");
    status.className = "result-status" + (tone ? " result-status-" + tone : "");
    status.textContent = text;
    return status;
  }

  function paragraph(text, className) {
    const p = document.createElement("p");
    if (className) p.className = className;
    p.textContent = text;
    return p;
  }

  function sourceLink(commune) {
    const link = document.createElement("a");
    link.className = "button button-primary";
    link.href = lib.ofglDatasetLink(commune.code);
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Ouvrir la source officielle OFGL ↗";
    return link;
  }

  function communeHeader(card, commune) {
    const title = document.createElement("h3");
    title.textContent = commune.nom;
    const matched = commune.matchedBy && commune.matchedBy.length
      ? " · Trouvée par " + commune.matchedBy.map((m) => (m === "code" ? "code INSEE" : m === "codePostal" ? "code postal" : "nom")).join(" et ")
      : "";
    const meta = paragraph("Code INSEE : " + commune.code +
      " · Département : " + (commune.codeDepartement || "non précisé") +
      (commune.codesPostaux && commune.codesPostaux.length ? " · Code" + (commune.codesPostaux.length > 1 ? "s" : "") + " postal" + (commune.codesPostaux.length > 1 ? "aux" : "") + " : " + commune.codesPostaux.join(", ") : "") + matched, "commune-meta");
    card.append(title, meta);
  }

  function renderCommuneFinances(card, commune, data) {
    const summary = lib.summarizeOfglRecords(data.rows, data.total, commune.code);
    if (!summary.received) {
      card.append(
        statusBadge("Aucune ligne financière reçue", "warning"),
        paragraph("L’OFGL n’a renvoyé aucune ligne pour le code INSEE " + commune.code + " avec le filtre « budget principal ». Une absence de ligne ne signifie pas un montant nul : aucun zéro n’est affiché. Consultez la source officielle pour vérifier.")
      );
      return;
    }
    if (!summary.complete) {
      card.append(
        statusBadge("Réponse incomplète · aucun montant affiché", "warning"),
        paragraph("L’OFGL annonce " + summary.totalCount + " lignes, mais seulement " + summary.received + " ont pu être récupérées. L’exercice le plus récent ne peut pas être déterminé de façon fiable : les montants ne sont pas affichés.")
      );
      return;
    }
    if (summary.latestYear === null) {
      card.append(statusBadge("Exercice non identifiable", "warning"), paragraph(
        (summary.foreignCount ? summary.foreignCount + " ligne(s) reçue(s) concernaient un autre code INSEE et ont été écartées. " : "") +
        "Aucune ligne restante ne comporte d’exercice exploitable pour le code INSEE " + commune.code + ". Aucun montant n’est affiché."));
      return;
    }
    card.append(
      statusBadge("Données OFGL reçues · exercice " + summary.latestYear + " · budget principal · non rapprochées", "warning"),
      paragraph("Montants lus automatiquement dans l’API officielle OFGL pour le dernier exercice présent dans la réponse complète (" + summary.received + " lignes). Les noms de champs et de libellés n’ont pas encore été validés contre la fiche officielle : ces chiffres sont indicatifs. Une ligne absente ne signifie pas un montant nul.")
    );
    if (summary.foreignCount) card.appendChild(paragraph(summary.foreignCount + " ligne(s) concernant un autre code INSEE ont été écartées.", "commune-method-note"));
    const list = document.createElement("dl");
    list.className = "finance-result-list";
    const selected = lib.selectPriorityAggregates(summary.latestRecords);
    const shown = selected.length ? selected : summary.latestRecords.slice().sort((a, b) => String(a[lib.OFGL.fields.aggregate]).localeCompare(String(b[lib.OFGL.fields.aggregate]), "fr")).slice(0, 8);
    shown.forEach((row) => {
      const dt = document.createElement("dt");
      dt.textContent = row[lib.OFGL.fields.aggregate] || "Agrégat financier non nommé";
      const dd = document.createElement("dd");
      const amount = lib.pickAmount(row);
      const perCapita = lib.pickPerCapita(row);
      dd.textContent = amount === null ? "Non disponible" : formatFinancialAmount(amount);
      if (amount !== null && perCapita !== null) dd.textContent += " · " + formatFinancialAmount(perCapita) + "/hab.";
      list.append(dt, dd);
    });
    card.appendChild(list);
    card.appendChild(paragraph(
      (selected.length ? "" : "Aucun des agrégats de référence n’a été reconnu : les premiers agrégats reçus sont affichés par ordre alphabétique. ") +
      "Exercices présents dans la réponse : " + summary.years.join(", ") + ". Montants nominaux, non corrigés de l’inflation. Les budgets annexes ne sont pas inclus.", "commune-method-note"));
  }

  function renderFinanceError(card, error) {
    card.append(
      statusBadge("Comptes momentanément indisponibles", "error"),
      paragraph(serviceErrorText(error, "Le service de l’OFGL") + " Il ne s’agit pas d’une absence de données. Réessayez plus tard ou consultez directement la source officielle.")
    );
  }

  const MUNICIPAL_DEFINITIONS = [
    { key: "Recettes de fonctionnement", aliases: ["recettes de fonctionnement"], label: "Recettes de fonctionnement", definition: "Les ressources courantes de la commune sur l’exercice : fiscalité, dotations, participations et produits des services selon les catégories comptables. Ce n’est ni le budget total ni une somme nécessairement disponible librement.", formula: "Somme des recettes classées en fonctionnement dans l’agrégat OFGL." },
    { key: "Dépenses de fonctionnement", aliases: ["depenses de fonctionnement"], label: "Dépenses de fonctionnement", definition: "Le coût courant des services : personnel, énergie, achats, entretien, prestations et autres charges. La composition exacte dépend de la nomenclature et du périmètre de l’agrégat.", formula: "Somme des dépenses classées en fonctionnement dans l’agrégat OFGL." },
    { key: "Épargne brute", aliases: ["epargne brute", "capacite d'autofinancement brute"], label: "Épargne brute", definition: "La marge annuelle dégagée par le fonctionnement avant remboursement du capital de la dette et financement des investissements. Elle aide à apprécier la capacité de la commune à financer ses projets sans recourir uniquement à l’emprunt.", formula: "À titre de contrôle : recettes de fonctionnement − dépenses de fonctionnement. La définition comptable exacte de l’agrégat source prévaut." },
    { key: "Épargne nette", aliases: ["epargne nette"], label: "Épargne nette", definition: "La marge restant après prise en compte du remboursement du capital de la dette selon la définition de la source. Elle est généralement plus proche de la capacité à contribuer aux investissements, mais ne constitue pas à elle seule le financement total disponible.", formula: "Souvent épargne brute − remboursement du capital de la dette ; vérifier la définition OFGL utilisée." },
    { key: "Encours de dette", aliases: ["encours de dette", "dette"], label: "Encours de dette", definition: "Le capital restant dû à une date donnée, généralement en fin d’exercice. C’est un stock, à distinguer des emprunts nouveaux, des remboursements annuels et des intérêts.", formula: "Montant d’encours déclaré pour l’exercice ; la date de référence doit être confirmée dans la fiche de l’indicateur." },
    { key: "Annuité de la dette", aliases: ["annuite de la dette"], label: "Annuité de la dette", definition: "Le montant payé au titre de la dette pendant l’année. Selon la source, il peut regrouper remboursement du capital et intérêts ; il ne faut pas le confondre avec l’encours total restant dû.", formula: "Utiliser l’agrégat OFGL correspondant et vérifier les composantes retenues." },
    { key: "Dépenses d’équipement", aliases: ["depenses d'equipement"], label: "Dépenses d’équipement", definition: "Les dépenses qui servent à acquérir, construire ou améliorer durablement des équipements : bâtiments, écoles, voirie, matériels ou rénovations. Elles forment une partie des dépenses d’investissement.", formula: "Montant de l’agrégat d’équipement publié par la source." },
    { key: "Dépenses d’investissement", aliases: ["depenses d'investissement"], label: "Dépenses d’investissement", definition: "Les dépenses relevant de l’investissement selon le périmètre comptable retenu. Elles peuvent comprendre des opérations autres que les seuls équipements ; comparer uniquement des séries définies de la même façon.", formula: "Montant de l’agrégat d’investissement publié par la source." },
    { key: "Recettes d’investissement", aliases: ["recettes d'investissement"], label: "Recettes d’investissement", definition: "Les ressources affectées au financement de l’investissement. Selon l’agrégat, elles peuvent inclure subventions, fonds, cessions et emprunts : une recette d’emprunt finance une dépense mais augmente la dette.", formula: "Montant de l’agrégat de recettes d’investissement publié par la source." },
    { key: "Frais de personnel", aliases: ["frais de personnel", "charges de personnel"], label: "Frais de personnel", definition: "Les dépenses liées aux agents et à la rémunération du personnel selon le classement comptable. Le ratio par rapport aux dépenses de fonctionnement est informatif, mais il ne mesure pas à lui seul l’efficacité des services.", formula: "Frais de personnel ÷ dépenses de fonctionnement × 100, si les deux agrégats sont disponibles et comparables." }
  ];

  function municipalNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function municipalRow(rows, definition, year) {
    const f = lib.OFGL.fields;
    return rows.find((row) => {
      if (year !== undefined && Number(row[f.year]) !== Number(year)) return false;
      const label = lib.normalizeText(row[f.aggregate] || "");
      return definition.aliases.some((alias) => label === lib.normalizeText(alias));
    }) || null;
  }

  function municipalValue(rows, definition, year) {
    const row = municipalRow(rows, definition, year);
    return row ? lib.pickAmount(row) : null;
  }

  function appendMunicipalMetric(container, definition, value, perCapita, year) {
    const card = document.createElement("article");
    card.className = "municipal-metric";
    const label = paragraph(definition.label, "municipal-metric-label");
    const amount = paragraph(value === null ? "Non disponible" : formatFinancialAmount(value), "municipal-metric-value");
    const context = paragraph(perCapita === null ? "Montant par habitant non disponible" : formatFinancialAmount(perCapita) + " par habitant · " + year, "municipal-metric-context");
    const meaning = paragraph(definition.definition, "municipal-metric-definition");
    const formula = paragraph("Lecture / calcul : " + definition.formula, "municipal-metric-definition");
    card.append(label, amount, context, meaning, formula);
    container.appendChild(card);
  }

  function renderSelectedTerritory(commune, data) {
    const title = document.getElementById("municipal-title");
    const status = document.getElementById("municipal-status");
    const intro = document.getElementById("municipal-intro");
    const metrics = document.getElementById("fameck-metrics");
    const calculations = document.getElementById("fameck-calculs");
    const analysis = document.getElementById("fameck-analysis");
    const historyWrap = document.getElementById("municipal-history-wrap");
    const history = document.getElementById("fameck-history-body");
    if (!metrics || !analysis) return;

    const summary = lib.summarizeOfglRecords(data.rows, data.total, commune.code);
    const f = lib.OFGL.fields;
    if (title) title.textContent = "Les finances de " + commune.nom + " (" + commune.code + ")";
    if (status) status.textContent = !summary.complete ? "Données incomplètes" : "Données OFGL · à interpréter avec prudence";
    if (intro) intro.textContent = "Commune : " + commune.nom + " · code INSEE " + commune.code + " · département " + (commune.codeDepartement || "non précisé") + ". Périmètre demandé : budget principal. La série ci-dessous provient de l’API OFGL et doit être lue avec ses définitions comptables ; une donnée absente n’équivaut jamais à zéro. Les résultats sont descriptifs : ils ne prouvent pas, à eux seuls, la qualité ou la mauvaise gestion d’une municipalité.";
    metrics.replaceChildren();
    calculations.replaceChildren();
    analysis.replaceChildren();
    if (history) history.replaceChildren();

    if (!summary.complete || summary.latestYear === null) {
      if (status) status.textContent = "Impossible de valider la série";
      metrics.appendChild(paragraph("Aucun montant de synthèse n’est affiché : la réponse de l’OFGL est incomplète ou l’exercice ne peut pas être identifié de façon fiable. " + summary.received + " ligne(s) reçue(s), " + (summary.totalCount === null ? "total non communiqué" : summary.totalCount + " ligne(s) annoncée(s)") + ".", "commune-method-note"));
      analysis.append(paragraph("Pourquoi aucun chiffre n’est présenté : choisir le dernier exercice à partir d’un extrait tronqué pourrait mélanger des années ou masquer des agrégats. Réessayez plus tard ou ouvrez la fiche OFGL de cette commune."));
      if (historyWrap) historyWrap.hidden = true;
      return;
    }

    const latestYear = summary.latestYear;
    const available = MUNICIPAL_DEFINITIONS.filter((d) => municipalRow(summary.latestRecords, d, latestYear));
    const shown = available.length ? available : [];
    shown.forEach((d) => {
      const row = municipalRow(summary.latestRecords, d, latestYear);
      appendMunicipalMetric(metrics, d, lib.pickAmount(row), lib.pickPerCapita(row), latestYear);
    });
    if (!shown.length) metrics.appendChild(paragraph("L’API a renvoyé des lignes, mais aucun des agrégats de référence n’a été reconnu avec les libellés attendus. Aucun montant n’est interprété automatiquement. Consultez la source officielle et les libellés bruts.", "commune-method-note"));

    const revenue = municipalValue(data.rows, MUNICIPAL_DEFINITIONS[0], latestYear);
    const expense = municipalValue(data.rows, MUNICIPAL_DEFINITIONS[1], latestYear);
    const savings = municipalValue(data.rows, MUNICIPAL_DEFINITIONS[2], latestYear);
    const netSavings = municipalValue(data.rows, MUNICIPAL_DEFINITIONS[3], latestYear);
    const debt = municipalValue(data.rows, MUNICIPAL_DEFINITIONS[4], latestYear);
    const annuity = municipalValue(data.rows, MUNICIPAL_DEFINITIONS[5], latestYear);
    const equipment = municipalValue(data.rows, MUNICIPAL_DEFINITIONS[6], latestYear);
    const investment = municipalValue(data.rows, MUNICIPAL_DEFINITIONS[7], latestYear);
    const investmentRevenue = municipalValue(data.rows, MUNICIPAL_DEFINITIONS[8], latestYear);
    const staff = municipalValue(data.rows, MUNICIPAL_DEFINITIONS[9], latestYear);
    const ratio = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const addCalculation = (label, value, explanation) => {
      const article = document.createElement("article");
      article.className = "municipal-calculation";
      const h = document.createElement("strong");
      h.textContent = label;
      const v = document.createElement("span");
      v.textContent = value === null || !Number.isFinite(value) ? "Non calculable" : ratio.format(value) + (label.includes("durée") ? " ans" : " %");
      const p = paragraph(explanation);
      article.append(h, v, p);
      calculations.appendChild(article);
    };
    const savingsRate = revenue !== null && revenue > 0 && savings !== null ? savings / revenue * 100 : null;
    const staffRate = expense !== null && expense > 0 && staff !== null ? staff / expense * 100 : null;
    const debtYears = savings !== null && savings > 0 && debt !== null ? debt / savings : null;
    addCalculation("Taux d’épargne brute", savingsRate, "Épargne brute ÷ recettes de fonctionnement × 100. Il indique la part des recettes courantes qui reste sous forme d’épargne brute. Ce ratio ne dit pas si les services sont suffisants ni si les investissements sont pertinents.");
    addCalculation("Dépenses de personnel / fonctionnement", staffRate, "Frais de personnel ÷ dépenses de fonctionnement × 100. Le ratio n’est affiché que si les deux agrégats sont présents et positifs ; il ne mesure pas à lui seul la productivité ni la qualité du service public.");
    addCalculation("Capacité de désendettement théorique", debtYears, "Encours de dette ÷ épargne brute. Le résultat est exprimé en années théoriques, sous l’hypothèse irréaliste que toute l’épargne brute sert à rembourser la dette. Si l’épargne brute est nulle ou négative, ce ratio n’est pas interprétable normalement.");
    if (revenue !== null && expense !== null) {
      const balance = revenue - expense;
      const article = document.createElement("article");
      article.className = "municipal-calculation";
      const h = document.createElement("strong"); h.textContent = "Écart recettes − dépenses de fonctionnement";
      const v = document.createElement("span"); v.textContent = formatFinancialAmount(balance);
      const p = paragraph("Calcul arithmétique effectué à partir des deux agrégats OFGL. Cet écart peut différer de l’épargne brute officielle si les agrégats ont des retraitements ou périmètres distincts : il faut vérifier la définition comptable avant de les assimiler.");
      article.append(h, v, p); calculations.appendChild(article);
    }

    const makeP = (txt, cls) => paragraph(txt, cls);
    const firstYear = summary.years.length ? Math.min(...summary.years) : latestYear;
    const yearList = summary.years.slice().sort((a,b) => a-b);
    const firstRevenue = municipalValue(data.rows, MUNICIPAL_DEFINITIONS[0], firstYear);
    const firstExpense = municipalValue(data.rows, MUNICIPAL_DEFINITIONS[1], firstYear);
    const firstSavings = municipalValue(data.rows, MUNICIPAL_DEFINITIONS[2], firstYear);
    const firstDebt = municipalValue(data.rows, MUNICIPAL_DEFINITIONS[4], firstYear);
    const changeText = (label, first, last) => {
      const pct = lib.percentChange(last, first);
      if (pct === null) return label + " : évolution non calculable (valeur de départ absente, nulle ou négative).";
      return label + " : " + (pct > 0.05 ? "hausse" : pct < -0.05 ? "baisse" : "stabilité") + " de " + ratio.format(Math.abs(pct)) + " % entre " + firstYear + " et " + latestYear + " en euros courants.";
    };
    const lead = document.createElement("strong"); lead.textContent = "Analyse vulgarisée détaillée · exercice " + latestYear;
    analysis.appendChild(lead);
    analysis.appendChild(makeP("Lecture générale : cette photographie porte sur le budget principal et le dernier exercice identifiable dans la réponse complète. Les recettes et dépenses décrivent des flux de l’année ; la dette décrit un stock à une date. Il faut donc éviter de comparer directement le total annuel des dépenses à l’encours de dette comme s’il s’agissait de la même chose."));
    if (revenue !== null) analysis.appendChild(makeP("Recettes de fonctionnement : " + formatFinancialAmount(revenue) + ". Elles financent les services courants et comprennent plusieurs catégories de ressources. Leur hausse peut venir des taux, des bases fiscales, des dotations, des tarifs ou d’autres facteurs ; les seuls agrégats ne permettent pas d’identifier la cause."));
    if (expense !== null) analysis.appendChild(makeP("Dépenses de fonctionnement : " + formatFinancialAmount(expense) + ". Elles correspondent au coût courant des services. Une hausse ne signifie pas automatiquement une dérive : elle peut aussi refléter l’inflation, l’énergie, les rémunérations, l’évolution des besoins ou du périmètre. Pour conclure, il faudrait décomposer les postes et comparer avec des communes comparables."));
    if (savings !== null) analysis.appendChild(makeP("Épargne brute : " + formatFinancialAmount(savings) + (savingsRate === null ? "." : ", soit " + ratio.format(savingsRate) + " % des recettes de fonctionnement selon le calcul indicatif ci-dessus.") + " Elle constitue une marge avant remboursement du capital et financement des investissements. Une épargne positive donne une capacité de financement, mais ne signifie pas que l’argent est entièrement libre ou qu’un projet est automatiquement finançable."));
    if (netSavings !== null) analysis.appendChild(makeP("Épargne nette : " + formatFinancialAmount(netSavings) + ". Elle cherche à mesurer ce qui reste après le remboursement du capital selon la définition de la source. Il faut vérifier les retraitements exacts avant de l’assimiler à une trésorerie disponible."));
    if (debt !== null) analysis.appendChild(makeP("Encours de dette : " + formatFinancialAmount(debt) + ". C’est le capital restant dû à la date de référence, pas le montant payé dans l’année. Pour l’interpréter, on examine aussi l’épargne brute, les annuités, les taux, les échéances et les investissements financés."));
    if (debtYears !== null) analysis.appendChild(makeP("Désendettement théorique : " + ratio.format(debtYears) + " ans, calculé par encours de dette ÷ épargne brute. Ce n’est pas une prévision de remboursement : la commune doit aussi continuer à faire fonctionner ses services et investir."));
    if (annuity !== null) analysis.appendChild(makeP("Annuité de dette : " + formatFinancialAmount(annuity) + ". Vérifiez dans la fiche OFGL si cet agrégat regroupe capital et intérêts ; l’annuité mesure un effort annuel, contrairement à l’encours qui mesure une dette restante."));
    if (equipment !== null || investment !== null) analysis.appendChild(makeP("Investissement : " + (equipment === null ? "dépenses d’équipement non disponibles" : formatFinancialAmount(equipment) + " de dépenses d’équipement") + (investment === null ? "" : " ; " + formatFinancialAmount(investment) + " de dépenses d’investissement") + ". Les équipements sont généralement une composante de l’investissement, pas nécessairement son total. Pour juger l’effort d’investissement, il faut regarder les recettes dédiées, les subventions, l’emprunt, l’état du patrimoine et les besoins du territoire."));
    if (investmentRevenue !== null) analysis.appendChild(makeP("Recettes d’investissement : " + formatFinancialAmount(investmentRevenue) + ". Elles peuvent inclure des subventions, des fonds, des cessions ou des emprunts selon l’agrégat. Une recette issue d’un nouvel emprunt améliore le financement immédiat mais accroît la dette : la composition de cette recette est essentielle."));
    if (staff !== null) analysis.appendChild(makeP("Frais de personnel : " + formatFinancialAmount(staff) + (staffRate === null ? "." : ", soit " + ratio.format(staffRate) + " % des dépenses de fonctionnement.") + " Ce poste doit être mis en regard des compétences exercées, des effectifs, des services rendus et des choix d’organisation ; le ratio seul ne permet pas de qualifier une commune de dépensière ou d’économe."));
    analysis.appendChild(makeP(changeText("Recettes de fonctionnement", firstRevenue, revenue)));
    analysis.appendChild(makeP(changeText("Dépenses de fonctionnement", firstExpense, expense)));
    analysis.appendChild(makeP(changeText("Épargne brute", firstSavings, savings)));
    analysis.appendChild(makeP(changeText("Encours de dette", firstDebt, debt)));
    analysis.appendChild(makeP("Limites indispensables : montants nominaux, non corrigés de l’inflation ; comparaison entre première et dernière année seulement ; pas de comparaison par strate démographique dans cette version ; les libellés et périmètres doivent être vérifiés dans la documentation OFGL. Ces chiffres ne démontrent aucune causalité et ne constituent pas un jugement politique.", "municipal-analysis-note"));
    if (historyWrap) historyWrap.hidden = false;
    const cap = document.getElementById("municipal-history-caption");
    if (cap) cap.textContent = commune.nom + " · budget principal · données OFGL à contrôler";
    const historyIntro = document.getElementById("municipal-history-intro");
    if (historyIntro) historyIntro.textContent = "Exercices reçus : " + yearList.join(", ") + ". Les montants sont en euros courants. « Non disponible » signifie que l’agrégat n’a pas été trouvé ; il ne signifie pas zéro.";
    if (history) {
      yearList.forEach((year) => {
        const tr = document.createElement("tr");
        const defs = [MUNICIPAL_DEFINITIONS[0], MUNICIPAL_DEFINITIONS[1], MUNICIPAL_DEFINITIONS[2], MUNICIPAL_DEFINITIONS[4]];
        const vals = defs.map((d) => municipalValue(data.rows, d, year));
        const r = vals[0] !== null && vals[0] > 0 && vals[2] !== null ? ratio.format(vals[2] / vals[0] * 100) + " %" : "Non disponible";
        const d = vals[2] !== null && vals[2] > 0 && vals[3] !== null ? ratio.format(vals[3] / vals[2]) + " ans" : "Non calculable";
        const cells = [String(year), ...vals.map((v) => v === null ? "Non disponible" : formatFinancialAmount(v)), r, d];
        cells.forEach((txt, i) => { const td = document.createElement("td"); td.textContent = txt; if (i > 0) td.className = "numeric-cell"; tr.appendChild(td); });
        if (year === latestYear) tr.className = "current-year-row";
        history.appendChild(tr);
      });
    }
    const millions = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
    set("ribbon-fameck-savings", savings === null ? "—" : millions.format(savings / 1e6) + " M€");
    set("ribbon-fameck-debt", debt === null ? "—" : millions.format(debt / 1e6) + " M€");
    set("ribbon-fameck-rate", savingsRate === null ? "—" : ratio.format(savingsRate) + " %");
    set("ribbon-local-savings-context", "Exercice " + latestYear + " · " + commune.nom);
    set("ribbon-local-debt-context", "Exercice " + latestYear + " · " + commune.nom);
    set("ribbon-local-rate-context", "Calcul indicatif · " + commune.nom);
  }

  async function loadCommuneCard(card, commune, signal) {
    const loading = paragraph("Chargement des comptes OFGL pour " + commune.nom + "…", "commune-loading");
    card.appendChild(loading);
    const selectedStatus = document.getElementById("municipal-status");
    const selectedTitle = document.getElementById("municipal-title");
    if (selectedTitle) selectedTitle.textContent = "Chargement de l’analyse de " + commune.nom + "…";
    if (selectedStatus) selectedStatus.textContent = "Chargement des données";
    try {
      const data = await fetchCommuneFinances(commune, signal);
      if (signal.aborted) return;
      loading.remove();
      renderCommuneFinances(card, commune, data);
      renderSelectedTerritory(commune, data);
      const link = document.createElement("a");
      link.className = "button button-secondary";
      link.href = "#fameck-finances";
      link.textContent = "Lire l’analyse détaillée de " + commune.nom;
      card.appendChild(link);
    } catch (error) {
      if (signal.aborted) return;
      loading.remove();
      renderFinanceError(card, error);
      if (selectedTitle) selectedTitle.textContent = "Analyse de " + commune.nom;
      if (selectedStatus) selectedStatus.textContent = "Données indisponibles";
      const metrics = document.getElementById("fameck-metrics");
      if (metrics) metrics.replaceChildren(paragraph(serviceErrorText(error, "L’OFGL") + " Aucun montant n’est affiché. Réessayez ou ouvrez la source officielle.", "commune-method-note"));
    }
    card.appendChild(sourceLink(commune));
  }

  function showSearchMessage(result, title, text, withOfglLink) {
    result.replaceChildren();
    const heading = document.createElement("h3");
    heading.textContent = title;
    result.append(heading, paragraph(text));
    if (withOfglLink) addResultLink(result, "Ouvrir la base des comptes communaux — OFGL", lib.OFGL.datasetPage);
    result.hidden = false;
  }

  async function searchCommunes(kind, signal) {
    const base = { fields: "nom,code,codeDepartement,codesPostaux", limit: "10" };
    const query = (extra) => fetchJson("https://geo.api.gouv.fr/communes?" + new URLSearchParams({ ...base, ...extra }).toString(), "geo", signal);
    if (kind.type === "postal-or-insee") {
      // Un nombre à 5 chiffres peut être un code postal ou un code INSEE : les deux sont interrogés.
      const [byPostal, byCode] = await Promise.all([query({ codePostal: kind.value }), query({ code: kind.value })]);
      return lib.mergeCommunes([{ communes: byCode, matchedBy: "code" }, { communes: byPostal, matchedBy: "codePostal" }]);
    }
    if (kind.type === "insee") return lib.mergeCommunes([{ communes: await query({ code: kind.value }), matchedBy: "code" }]);
    return lib.mergeCommunes([{ communes: await query({ nom: kind.value, boost: "population" }), matchedBy: "nom" }]);
  }

  function initMobileNavigation() {
    const toggle = document.querySelector(".nav-toggle");
    const nav = document.getElementById("navigation-principale");
    if (!toggle || !nav) return;
    const close = () => {
      toggle.setAttribute("aria-expanded", "false");
      nav.classList.remove("is-open");
      toggle.querySelector(".nav-toggle-icon").textContent = "+";
    };
    toggle.addEventListener("click", () => {
      const expanded = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!expanded));
      nav.classList.toggle("is-open", !expanded);
      toggle.querySelector(".nav-toggle-icon").textContent = expanded ? "+" : "−";
    });
    nav.addEventListener("click", (event) => {
      if (event.target.closest("a") && window.matchMedia("(max-width: 679px)").matches) close();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
        close();
        toggle.focus();
      }
    });
    window.addEventListener("resize", () => {
      if (!window.matchMedia("(max-width: 679px)").matches) close();
    });
  }

  async function initMunicipalitySearch() {
    const form = document.getElementById("commune-form");
    const input = document.getElementById("commune-query");
    const result = document.getElementById("commune-result");
    if (!form || !input || !result) return;
    const button = form.querySelector("button[type=submit]");
    let current = null;
    const setBusy = (busy) => {
      result.setAttribute("aria-busy", busy ? "true" : "false");
      // Le bouton reste actif : une nouvelle recherche annule la précédente.
      if (button) button.textContent = busy ? "Recherche…" : "Rechercher";
    };

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const kind = lib.classifyCommuneQuery(input.value);
      if (current) {
        current.abort();
        current = null;
        setBusy(false);
      }
      if (kind.type === "empty") {
        showSearchMessage(result, "Saisissez une commune", "Indiquez un nom de commune, un code postal ou un code INSEE (5 caractères, par exemple 57206 ou 2A004).", false);
        return;
      }
      if (kind.type === "partial-code" || kind.type === "invalid-code") {
        showSearchMessage(result, "Code incomplet ou invalide", "Un code postal ou un code INSEE comporte exactement 5 caractères (par exemple 57290 ou 2A004). Vous avez saisi « " + kind.value + " ».", false);
        return;
      }
      const controller = new AbortController();
      current = controller;
      setBusy(true);
      result.replaceChildren(paragraph("Recherche dans le référentiel national des communes…"));
      result.hidden = false;
      try {
        const communes = await searchCommunes(kind, controller.signal);
        if (controller.signal.aborted) return;
        result.replaceChildren();
        if (!communes.length) {
          showSearchMessage(result, "Aucune commune trouvée", "Vérifiez l’orthographe, le code postal ou le code INSEE. Vous pouvez aussi lancer la recherche directement dans la base financière officielle.", true);
          return;
        }
        const heading = document.createElement("h3");
        heading.textContent = communes.length === 1 ? "Commune trouvée" : communes.length + " communes correspondent : choisissez la bonne";
        result.append(heading, paragraph("L’identité géographique est fournie par le service public geo.api.gouv.fr ; chaque commune est identifiée par son code INSEE. Les chiffres financiers de l’OFGL restent soumis à leur propre périmètre, exercice et disponibilité.", "commune-meta"));
        const loads = [];
        communes.forEach((commune) => {
          const card = document.createElement("article");
          card.className = "commune-result-card";
          communeHeader(card, commune);
          result.appendChild(card);
          if (communes.length === 1) {
            loads.push(loadCommuneCard(card, commune, controller.signal));
          } else {
            const choose = document.createElement("button");
            choose.type = "button";
            choose.className = "button button-secondary";
            choose.textContent = "Afficher les comptes de " + commune.nom + " (" + commune.code + ")";
            choose.addEventListener("click", () => {
              choose.remove();
              loadCommuneCard(card, commune, controller.signal);
            }, { once: true });
            card.appendChild(choose);
          }
        });
        await Promise.all(loads);
      } catch (error) {
        if (controller.signal.aborted) return;
        showSearchMessage(result, "Recherche momentanément indisponible", serviceErrorText(error, "Le référentiel géographique geo.api.gouv.fr") + " Vous pouvez quand même rechercher les comptes dans la base officielle de l’OFGL.", true);
      } finally {
        if (current === controller) {
          setBusy(false);
        }
      }
    });
  }

  function initGlossary() {
    const input = document.getElementById("glossary-search");
    const list = document.getElementById("glossary-list");
    const count = document.getElementById("glossary-count");
    if (!input || !list || !count) return;
    const entries = Array.from(list.querySelectorAll(".glossary-entry"));
    const update = () => {
      const query = normalizeSearch(input.value);
      let visible = 0;
      entries.forEach((entry) => {
        const matches = !query || normalizeSearch(entry.textContent).includes(query);
        entry.hidden = !matches;
        if (matches) visible += 1;
      });
      count.textContent = visible + " définition" + (visible > 1 ? "s" : "") + " affichée" + (visible > 1 ? "s" : "") + (query ? " pour « " + input.value.trim() + " »." : " dans le glossaire.");
    };
    input.addEventListener("input", update);
    update();
  }

  async function initDebtComposition() {
    const table = document.getElementById("composition-table-body");
    if (!table) return;
    try {
      const response = await fetch("data/indicators/dette-publique-composition-2026-T2.json", { cache: "no-store" });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const data = await response.json();
      const total = data.headline.gross_debt;
      const netValue = document.getElementById("net-debt-value");
      const netContext = document.getElementById("net-debt-context");
      if (netValue) netValue.textContent = money.format(data.headline.net_debt) + " Md€";
      if (netContext) netContext.textContent = money.format(data.headline.net_debt_gdp_percent) + " % du PIB · variation trimestrielle : " + (data.headline.net_debt_change_qoq > 0 ? "+" : "") + money.format(data.headline.net_debt_change_qoq) + " Md€";
      table.replaceChildren();
      data.subsectors.forEach((item) => {
        const tr = document.createElement("tr");
        const share = item.debt / total * 100;
        const variation = (item.change_qoq > 0 ? "+" : "") + money.format(item.change_qoq) + " Md€";
        const cells = [
          item.label,
          money.format(item.debt) + " Md€",
          variation,
          ratio.format(share) + " %"
        ];
        cells.forEach((text, index) => {
          const td = document.createElement("td");
          td.textContent = text;
          if (index > 0) td.className = "numeric-cell";
          tr.appendChild(td);
        });
        table.appendChild(tr);
      });
      const totalRow = document.createElement("tr");
      totalRow.className = "composition-total-row";
      ["Total des administrations publiques", money.format(total) + " Md€", (data.headline.gross_debt_change_qoq > 0 ? "+" : "") + money.format(data.headline.gross_debt_change_qoq) + " Md€", "100,0 %"].forEach((text, index) => {
        const td = document.createElement("td");
        td.textContent = text;
        if (index > 0) td.className = "numeric-cell";
        totalRow.appendChild(td);
      });
      table.appendChild(totalRow);
    } catch (error) {
      table.replaceChildren();
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 4;
      cell.textContent = "Données de composition momentanément indisponibles. Consultez la publication INSEE liée sous le tableau.";
      row.appendChild(cell);
      table.appendChild(row);
    }
  }

  function initFameckFinances() { /* L’analyse locale est désormais alimentée par la commune recherchée. */ }

  // Les tableaux chargés après coup déplacent les sections : on revient sur l’ancre demandée.
  function restoreAnchor(initialScroll) {
    if (!location.hash || window.scrollY !== initialScroll) return;
    let target = null;
    try { target = document.querySelector(location.hash); } catch (error) { return; }
    if (target) target.scrollIntoView({ block: "start" });
  }

  async function init() {
    initMunicipalitySearch();
    initGlossary();
    const pending = [initDebtComposition()];
    const form = document.getElementById("claim-form");
    if (form) form.addEventListener("submit", handleClaim);
    try {
      const response = await fetch(DATA_URL, { cache: "no-store" });
      if (!response.ok) throw new Error("HTTP " + response.status);
      debtData = await response.json();
      renderDebt(debtData);
      const latest = debtData.records && debtData.records[0];
      const ribbonDebt = document.getElementById("ribbon-debt");
      const ribbonDebtContext = document.getElementById("ribbon-debt-context");
      if (latest && ribbonDebt) ribbonDebt.textContent = money.format(latest.debt_eur_billion) + " Md€";
      if (latest && ribbonDebtContext) ribbonDebtContext.textContent = ratio.format(latest.debt_gdp_percent) + " % du PIB · " + latest.period.replace(/^(\d{4})-(T\d)$/, "$2 $1");
    } catch (error) {
      const value = document.getElementById("latest-debt");
      if (value) value.textContent = "Données indisponibles";
      const period = document.getElementById("latest-period");
      if (period) period.textContent = "Ouvrir le fichier source officiel pour consulter la dernière publication.";
      const body = document.getElementById("debt-table-body");
      if (body) body.textContent = "Impossible de charger le fichier JSON. Consultez directement la source INSEE.";
    }
    const scrollBefore = window.scrollY;
    await Promise.allSettled(pending);
    requestAnimationFrame(() => restoreAnchor(scrollBefore));
  }

  document.addEventListener("DOMContentLoaded", initMobileNavigation);
  document.addEventListener("DOMContentLoaded", init);
})();