(() => {
  "use strict";
  const lib = window.CitoyenLib;
  const REQUEST_TIMEOUT_MS = 10000;
  // Au-delà de 4 s sans réponse de geo.api.gouv.fr, la recherche bascule sur le socle local (data/entities).
  const GEO_TIMEOUT_MS = 4000;
  // Menu replié sous cette largeur (même seuil que la feuille de style).
  const NAV_COLLAPSED_QUERY = "(max-width: 1179px)";
  const typo = lib.frenchTypo;
  const NEW_TAB = " (nouvel onglet)";
  const DATA_URL = "data/indicators/dette-publique-france.json";
  const money = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
  const ratio = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  let debtData = null;

  function formatDebt(value) {
    return money.format(value) + " Md€";
  }

  // Signe moins typographique pour les évolutions affichées.
  function signed(value, formatter) {
    const text = formatter.format(Math.abs(value));
    return (value > 0 ? "+" : value < 0 ? "\u2212" : "") + text;
  }

  // Lien externe : nouvel onglet signalé visuellement (↗) et pour les lecteurs d’écran.
  function externalLink(label, href, className) {
    const a = document.createElement("a");
    if (className) a.className = className;
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = typo(label.endsWith("↗") ? label : label + " ↗");
    const hidden = document.createElement("span");
    hidden.className = "visually-hidden";
    hidden.textContent = NEW_TAB;
    a.appendChild(hidden);
    return a;
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
    period.textContent = "milliards d’euros · " + lib.formatQuarter(latest.period) + " · France entière";
    share.textContent = typo(ratio.format(latest.debt_gdp_percent) + " %");
    body.replaceChildren();

    records.forEach((record) => {
      const tr = document.createElement("tr");
      [lib.formatQuarter(record.period), money.format(record.debt_eur_billion), typo(ratio.format(record.debt_gdp_percent) + " %")].forEach((text, index) => {
        const td = document.createElement("td");
        td.textContent = text;
        if (index > 0) td.className = "numeric-cell";
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
    heading.textContent = typo(title);
    result.appendChild(heading);
    const badge = document.createElement("span");
    badge.className = "result-status";
    badge.textContent = typo(status);
    result.appendChild(badge);
    paragraphs.forEach((text) => result.appendChild(paragraph(text)));
    links.forEach((link) => {
      const p = document.createElement("p");
      p.appendChild(link.href.startsWith("http") ? externalLink(link.label, link.href) : Object.assign(document.createElement("a"), { href: link.href, textContent: link.label }));
      result.appendChild(p);
    });
    result.hidden = false;
    result.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  async function handleClaim(event) {
    event.preventDefault();
    const text = document.getElementById("claim-text")?.value.trim() || "";
    const period = document.getElementById("claim-period")?.value || "";
    const selectedScope = document.getElementById("claim-scope")?.value || "auto";
    const claimInput = document.getElementById("claim-text");
    if (!text) {
      // Champ vide : message du site (zone aria-live #claim-result) plutôt que la bulle native.
      if (claimInput) { claimInput.setAttribute("aria-invalid", "true"); claimInput.focus(); }
      showResult("Saisissez un chiffre ou une affirmation", "Champ vide", ["Recopiez par exemple « la dette publique est de 3 500 milliards », ou indiquez simplement un sujet (dette, budget, commune)."]);
      return;
    }
    if (claimInput) claimInput.removeAttribute("aria-invalid");
    // Toutes les communes de France sont reconnues grâce au socle commun (chargé à la demande).
    let isCommuneName = null;
    try { isCommuneName = lib.communeNameSet(await loadSearchIndex()); } catch (error) { isCommuneName = null; }
    const topic = lib.detectTopic(text, selectedScope, isCommuneName);

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
          "La série affichée sur ce site ne contient pas la période choisie. Aucune conclusion n'est produite.",
          "Vous pouvez consulter la série complète dans le fichier officiel de l'INSEE (lien ci-dessous)."
        ], [
          { label: "Ouvrir les données brutes INSEE (XLSX)", href: debtData.source.raw_file_url },
          { label: "Voir la définition de la dette de Maastricht", href: "https://www.insee.fr/fr/metadonnees/definition/c1091" }
        ]);
        return;
      }
      const amountMatch = text.match(/(\d[\d\s]*(?:[,.]\d+)?)\s*milliards?/i);
      let comparison = "Le montant de l'affirmation n'a pas pu être lu de façon fiable. Comparez la valeur de référence avec le texte original et vérifiez le périmètre.";
      if (amountMatch) {
        const claimed = Number(amountMatch[1].replace(/\s/g, "").replace(",", "."));
        if (Number.isFinite(claimed)) {
          const delta = match.debt_eur_billion - claimed;
          const absDelta = Math.abs(delta);
          comparison = "Le texte contient " + formatDebt(claimed) + ". L'écart avec la référence de l'INSEE est de " + formatDebt(absDelta) + " (" + (delta >= 0 ? "la référence est supérieure" : "la référence est inférieure") + "). Cet écart ne suffit pas à qualifier l'affirmation : vérifiez l'arrondi, la période et le périmètre exacts.";
        }
      }
      showResult("Référence officielle trouvée : dette publique", "Comparaison indicative · source INSEE", [
        "Période : " + lib.formatQuarter(match.period) + ".",
        "Valeur publiée par l'INSEE : " + formatDebt(match.debt_eur_billion) + " (milliards d'euros), soit " + ratio.format(match.debt_gdp_percent) + " % du PIB.",
        comparison,
        "Périmètre : dette brute consolidée de toutes les administrations publiques françaises, au sens de Maastricht. C'est un stock en fin de trimestre, pas le budget de l'année.",
        "Valeurs transcrites du tableau de l'INSEE et relues contre cette publication. Aucun verdict « vrai » ou « faux » n'est émis."
      ], [
        { label: "Ouvrir le fichier brut officiel (XLSX)", href: debtData.source.raw_file_url },
        { label: "Ouvrir la page de référence de l'INSEE", href: debtData.source.official_page_url },
        { label: "Voir la publication de l'INSEE du 29 septembre 2026", href: debtData.extraction.cross_check.official_release_page_url },
        { label: "Afficher les données utilisées par ce site (JSON)", href: DATA_URL }
      ]);
      return;
    }

    const guidance = {
      education: {
        title: "Sujet identifié : budget de l'Éducation nationale",
        links: [{ label: "Consulter les données détaillées des comptes nationaux — INSEE", href: "https://www.insee.fr/fr/statistiques/8988843" }, { label: "Consulter le portail officiel du budget de l'État", href: "https://www.budget.gouv.fr/" }],
        paragraphs: [
          "Ce site ne propose pas encore de série annuelle comparable pour ce montant.",
          "Pour comparer, précisez d'abord ce que vise l'affirmation : crédits votés, crédits consommés, budget du ministère ou dépense d'éducation plus large.",
          "Précisez aussi s'il s'agit d'euros courants ou d'euros constants (corrigés de l'inflation).",
          "Sans donnée ici, l'affirmation n'est ni confirmée ni contredite."
        ]
      },
      commune: {
        title: "Sujet identifié : finances communales",
        links: [{ label: "Ouvrir les comptes des communes — OFGL", href: "https://data.ofgl.fr/explore/dataset/ofgl-base-communes/" }, { label: "Ouvrir les comptes individuels DGFiP 2025", href: "https://www.data.gouv.fr/datasets/comptes-individuels-des-communes-fichier-global-2025" }],
        paragraphs: [
          "Recherchez la commune en haut de page : ses comptes publiés par l'OFGL et la DGFiP s'affichent avec leurs définitions.",
          "Pour comparer, distinguez le budget principal, les budgets annexes et les comptes consolidés. Distinguez aussi les prévisions et les comptes exécutés.",
          "Aucun verdict n'est produit sans donnée correspondant exactement à la question."
        ]
      },
      "budget-etat": {
        title: "Sujet identifié : budget de l'État",
        links: [{ label: "Portail officiel du budget de l'État", href: "https://www.budget.gouv.fr/" }, { label: "Données détaillées des comptes nationaux — INSEE", href: "https://www.insee.fr/fr/statistiques/8988843" }],
        paragraphs: [
          "Les crédits votés au budget de l'État et les dépenses réellement exécutées ne sont pas la même chose.",
          "Ce site ne propose pas encore de série annuelle comparable pour ce sujet.",
          "Vous pouvez consulter les documents officiels du budget de l'État (liens ci-dessous)."
        ]
      },
      unknown: {
        title: "Précisez le sujet à vérifier",
        links: [{ label: "Parcourir les données officielles de l'INSEE", href: "https://www.insee.fr/fr/statistiques" }],
        paragraphs: [
          "Ce sujet n'est pas reconnu, ou le site n'a pas de série correspondante.",
          "Essayez « dette publique », « budget de l'Éducation nationale » ou « finances d'une commune ». Aucun résultat n'est inventé quand les données manquent."
        ]
      }
    };
    const result = guidance[topic] || guidance.unknown;
    const periodLabel = /^\d{4}-T[1-4]$/.test(period) ? lib.formatQuarter(period) : period;
    const paragraphs = period ? ["Période demandée : " + periodLabel + ".", ...result.paragraphs] : result.paragraphs;
    showResult(result.title, "Pas de donnée comparable sur ce site", paragraphs, result.links);
  }

  const normalizeSearch = (value) => lib.normalizeText(value);

  function addResultLink(container, label, href) {
    const p = document.createElement("p");
    p.appendChild(externalLink(label, href));
    container.appendChild(p);
  }

  const formatFinancialAmount = lib.formatEuros;

  class ServiceError extends Error {
    constructor(service, reason, timeoutMs) {
      super(service + " : " + reason);
      this.service = service;
      this.reason = reason;
      this.timeoutMs = timeoutMs || REQUEST_TIMEOUT_MS;
    }
  }

  // fetch avec délai maximal et annulation liée à la recherche en cours.
  async function fetchJson(url, service, signal, timeoutMs = REQUEST_TIMEOUT_MS) {
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    if (signal) signal.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetch(url, { headers: { Accept: "application/json" }, signal: controller.signal });
    } catch (error) {
      if (signal && signal.aborted) throw error;
      throw new ServiceError(service, controller.signal.aborted ? "timeout" : "network", timeoutMs);
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

  // Socle commun des territoires (data/entities) : même structure pour toutes les communes.
  let searchIndexPromise = null;
  function loadSearchIndex() {
    if (!searchIndexPromise) {
      searchIndexPromise = fetchJson("data/entities/recherche.json", "socle").catch((error) => { searchIndexPromise = null; throw error; });
    }
    return searchIndexPromise;
  }
  const socleFiles = new Map();
  async function loadSocleCommune(commune) {
    const code = String(commune.code || "").toUpperCase();
    const dep = commune.codeDepartement || (/^97/.test(code) ? code.slice(0, 3) : code.slice(0, 2));
    if (!socleFiles.has(dep)) socleFiles.set(dep, fetchJson("data/entities/communes/" + encodeURIComponent(dep) + ".json", "socle").catch(() => null));
    const file = await socleFiles.get(dep);
    return file && Array.isArray(file.entities) ? file.entities.find((e) => e.entity_id === code) || null : null;
  }

  // Récupère toutes les pages (100 lignes maximum par appel) pour une commune identifiée par son code INSEE.
  async function fetchCommuneFinances(commune, signal) {
    const rows = [];
    let total = null;
    for (let page = 0; page < lib.OFGL.maxPages; page += 1) {
      const params = lib.buildOfglParams(commune.code, page * lib.OFGL.pageSize);
      // Une coupure réseau ou un délai dépassé est réessayé une fois ; une erreur HTTP ne l'est pas.
      let payload;
      try {
        payload = await fetchJson(lib.OFGL.endpoint + "?" + params.toString(), "ofgl", signal);
      } catch (error) {
        if (signal.aborted || !error || !["network", "timeout"].includes(error.reason)) throw error;
        payload = await fetchJson(lib.OFGL.endpoint + "?" + params.toString(), "ofgl", signal);
      }
      if (!payload || !Array.isArray(payload.results)) throw new ServiceError("ofgl", "format");
      if (typeof payload.total_count === "number") total = payload.total_count;
      rows.push(...payload.results);
      if (payload.results.length < lib.OFGL.pageSize || (total !== null && rows.length >= total)) break;
    }
    return { rows, total };
  }

  function serviceErrorText(error, serviceLabel) {
    const reason = error && error.reason ? error.reason : "network";
    if (reason === "timeout") return serviceLabel + " n’a pas répondu dans le délai de " + Math.round((error.timeoutMs || REQUEST_TIMEOUT_MS) / 1000) + " secondes.";
    if (reason === "format") return serviceLabel + " a renvoyé une réponse dans un format inattendu.";
    if (reason.startsWith("http-")) return serviceLabel + " a refusé ou n’a pas pu traiter la demande (code " + reason.slice(5) + ").";
    return serviceLabel + " est injoignable (réseau ou blocage du navigateur).";
  }

  function statusBadge(text, tone) {
    const status = document.createElement("span");
    status.className = "result-status" + (tone ? " result-status-" + tone : "");
    status.textContent = typo(text);
    return status;
  }

  function paragraph(text, className) {
    const p = document.createElement("p");
    if (className) p.className = className;
    p.textContent = typo(text);
    return p;
  }

  // Message de panne d’un service : sans double négation, avec ce que le lecteur peut faire.
  function unavailableText(error, serviceLabel, what) {
    return serviceErrorText(error, serviceLabel) + " " + what + " Les données existent peut-être : réessayez dans quelques minutes ou consultez directement la source officielle.";
  }

  function sourceLink(commune) {
    return externalLink("Ouvrir la source officielle (OFGL)", lib.ofglDatasetLink(commune.code), "button button-primary");
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
        paragraph("L’OFGL n’a renvoyé aucune ligne pour le code INSEE " + commune.code + " (budget principal). Une ligne absente ne vaut pas zéro : aucun montant n’est affiché. Consultez la source officielle pour vérifier.")
      );
      return;
    }
    if (!summary.complete) {
      card.append(
        statusBadge("Réponse incomplète · aucun montant affiché", "warning"),
        paragraph("L’OFGL annonce " + summary.totalCount + " lignes, mais seulement " + summary.received + " ont été reçues. L’exercice le plus récent ne peut pas être déterminé de façon fiable : les montants ne sont pas affichés.")
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
      statusBadge("Données OFGL · exercice " + summary.latestYear + " · budget principal · lecture automatique", "warning"),
      paragraph("Montants lus automatiquement dans la base de données de l’OFGL, pour le dernier exercice reçu (" + summary.received + " lignes). Ce sont les totaux publiés par l’OFGL, hors écritures comptables internes (opérations d’ordre). Ils peuvent différer de la fiche DGFiP de la commune, dont le périmètre n’est pas le même. Une ligne absente ne vaut pas zéro.")
    );
    if (summary.foreignCount) card.appendChild(paragraph(summary.foreignCount + " ligne(s) concernant un autre code INSEE ont été écartées.", "commune-method-note"));
    const list = document.createElement("dl");
    list.className = "finance-result-list";
    const selected = lib.selectPriorityAggregates(summary.latestRecords);
    const shown = selected.length ? selected : summary.latestRecords.slice().sort((a, b) => String(a[lib.OFGL.fields.aggregate]).localeCompare(String(b[lib.OFGL.fields.aggregate]), "fr")).slice(0, 8);
    shown.forEach((row) => {
      const dt = document.createElement("dt");
      dt.textContent = row[lib.OFGL.fields.aggregate] || "Poste comptable non nommé";
      const dd = document.createElement("dd");
      const amount = lib.pickAmount(row);
      const perCapita = lib.pickPerCapita(row);
      dd.textContent = amount === null ? "Non disponible" : formatFinancialAmount(amount);
      if (amount !== null && perCapita !== null) dd.textContent += " · " + formatFinancialAmount(perCapita) + "/hab.";
      list.append(dt, dd);
    });
    card.appendChild(list);
    card.appendChild(paragraph(
      (selected.length ? "" : "Les postes comptables habituels n’ont pas été reconnus : les premiers postes reçus sont affichés par ordre alphabétique. ") +
      "Exercices reçus : " + summary.years.join(", ") + ". Montants en euros courants, non corrigés de l’inflation. Budgets annexes non inclus.", "commune-method-note"));
  }

  function renderFinanceError(card, error) {
    card.append(
      statusBadge("Comptes momentanément indisponibles", "error"),
      paragraph(unavailableText(error, "Le service de l’OFGL", "Aucun montant n’est affiché."))
    );
  }

  // Définitions courtes (phrases de 25 mots au plus) ; la définition complète est celle du glossaire, commune aux deux sites.
  const MUNICIPAL_DEFINITIONS = [
    { key: "Recettes de fonctionnement", aliases: ["recettes de fonctionnement"], label: "Recettes de fonctionnement", glossary: "recettes-de-fonctionnement", definition: "Les ressources courantes de l’année : impôts, dotations, participations et produits des services. Ce n’est pas une somme librement disponible.", formula: "Total des recettes de fonctionnement publié par l’OFGL." },
    { key: "Dépenses de fonctionnement", aliases: ["depenses de fonctionnement"], label: "Dépenses de fonctionnement", glossary: "charges-depenses-de-fonctionnement", definition: "Le coût courant des services : personnel, énergie, achats, entretien, prestations. Le contenu exact dépend du classement comptable.", formula: "Total des dépenses de fonctionnement publié par l’OFGL." },
    { key: "Épargne brute", aliases: ["epargne brute", "capacite d'autofinancement brute"], label: "Épargne brute", glossary: "epargne-brute", definition: "La marge de l’année sur le fonctionnement. Elle vient avant le remboursement du capital des emprunts et le financement des investissements.", formula: "Contrôle : recettes − dépenses de fonctionnement. La définition comptable de la source prévaut." },
    { key: "Épargne nette", aliases: ["epargne nette"], label: "Épargne nette", glossary: "epargne-nette", definition: "La marge qui reste après le remboursement du capital de la dette. Elle ne représente pas, à elle seule, tout le financement disponible.", formula: "Souvent : épargne brute − remboursement du capital. Vérifiez la définition de l’OFGL." },
    { key: "Encours de dette", aliases: ["encours de dette", "dette"], label: "Encours de dette", glossary: "encours-de-dette", definition: "Le capital restant dû à une date, en général en fin d’année. C’est un stock, différent des emprunts, remboursements et intérêts de l’année.", formula: "Encours déclaré pour l’exercice. La date de référence figure dans la fiche de l’indicateur." },
    { key: "Annuité de la dette", aliases: ["annuite de la dette"], label: "Annuité de la dette", glossary: "annuite-de-la-dette", definition: "La somme payée sur l’année au titre de la dette. Selon la source, elle regroupe capital et intérêts. Ce n’est pas la dette restante.", formula: "Total publié par l’OFGL : vérifiez ce qu’il comprend." },
    { key: "Dépenses d’équipement", aliases: ["depenses d'equipement"], label: "Dépenses d’équipement", glossary: "depenses-d-equipement", definition: "Ce qui sert à construire, acheter ou rénover durablement : bâtiments, écoles, voirie, matériels. C’est une partie des dépenses d’investissement.", formula: "Total des dépenses d’équipement publié par l’OFGL." },
    { key: "Dépenses d’investissement", aliases: ["depenses d'investissement"], label: "Dépenses d’investissement", glossary: "depenses-d-investissement", definition: "Les dépenses classées en investissement. Elles dépassent parfois les seuls équipements. Comparez seulement des séries définies de la même façon.", formula: "Total des dépenses d’investissement publié par l’OFGL." },
    { key: "Recettes d’investissement", aliases: ["recettes d'investissement"], label: "Recettes d’investissement", glossary: "recettes-d-investissement", definition: "Les ressources qui financent l’investissement : subventions, fonds, cessions, emprunts selon le total. Un emprunt finance une dépense, mais il augmente la dette.", formula: "Total des recettes d’investissement publié par l’OFGL." },
    { key: "Frais de personnel", aliases: ["frais de personnel", "charges de personnel"], label: "Frais de personnel", glossary: null, definition: "Les dépenses liées aux agents et à leur rémunération. Leur part dans les dépenses informe, mais ne mesure pas l’efficacité des services.", formula: "Frais de personnel ÷ dépenses de fonctionnement × 100, si les deux totaux sont disponibles." }
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
    const formula = paragraph("Calcul : " + definition.formula, "municipal-metric-definition");
    card.append(label, amount, context, meaning, formula);
    if (definition.glossary && document.getElementById(definition.glossary)) {
      const more = document.createElement("p");
      more.className = "municipal-metric-definition";
      const link = document.createElement("a");
      link.href = "#" + definition.glossary;
      link.textContent = "Définition complète dans le glossaire";
      more.appendChild(link);
      card.appendChild(more);
    }
    container.appendChild(card);
  }

  function renderSelectedTerritory(commune, data) {
    const title = document.getElementById("municipal-title");
    const status = document.getElementById("municipal-status");
    const intro = document.getElementById("municipal-intro");
    const metrics = document.getElementById("commune-metrics");
    const calculations = document.getElementById("commune-calculs");
    const analysis = document.getElementById("commune-analysis");
    const historyWrap = document.getElementById("municipal-history-wrap");
    const history = document.getElementById("commune-history-body");
    if (!metrics || !analysis) return;

    const summary = lib.summarizeOfglRecords(data.rows, data.total, commune.code);
    if (title) title.textContent = "Les finances de " + commune.nom + " (" + commune.code + ")";
    if (status) status.textContent = !summary.complete ? "Données incomplètes" : "Données OFGL · lecture automatique";
    if (intro) intro.textContent = typo("Commune : " + commune.nom + " · code INSEE " + commune.code + " · département " + (commune.codeDepartement || "non précisé") + ". Budget principal seulement. Les chiffres viennent de la base de données de l’OFGL. Une donnée absente ne vaut jamais zéro. Les résultats décrivent la situation : ils ne disent pas, à eux seuls, si la commune est bien ou mal gérée.");
    metrics.replaceChildren();
    calculations.replaceChildren();
    analysis.replaceChildren();
    analysis.hidden = false;
    if (history) history.replaceChildren();

    if (!summary.complete || summary.latestYear === null) {
      if (status) status.textContent = "Impossible de valider la série";
      metrics.appendChild(paragraph("Aucun montant de synthèse n’est affiché : la réponse de l’OFGL est incomplète, ou l’exercice ne peut pas être identifié de façon fiable. " + summary.received + " ligne(s) reçue(s), " + (summary.totalCount === null ? "total non communiqué" : summary.totalCount + " ligne(s) annoncée(s)") + ".", "commune-method-note"));
      analysis.append(paragraph("Pourquoi aucun chiffre n’est présenté : choisir le dernier exercice à partir d’une réponse tronquée pourrait mélanger des années ou oublier des postes. Réessayez plus tard ou ouvrez la fiche OFGL de cette commune."));
      if (historyWrap) historyWrap.hidden = true;
      renderDatasetTools(commune, null);
      return;
    }

    const latestYear = summary.latestYear;
    const shown = MUNICIPAL_DEFINITIONS.filter((d) => municipalRow(summary.latestRecords, d, latestYear));
    shown.forEach((d) => {
      const row = municipalRow(summary.latestRecords, d, latestYear);
      appendMunicipalMetric(metrics, d, lib.pickAmount(row), lib.pickPerCapita(row), latestYear);
    });
    if (!shown.length) metrics.appendChild(paragraph("L’OFGL a renvoyé des lignes, mais aucun des postes comptables habituels n’a été reconnu. Aucun montant n’est interprété automatiquement. Consultez la source officielle et ses libellés.", "commune-method-note"));

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
      v.textContent = value === null || !Number.isFinite(value) ? "Non calculable" : typo(ratio.format(value) + (label.includes("désendettement") ? " ans" : " %"));
      article.append(h, v, paragraph(explanation));
      calculations.appendChild(article);
    };
    const savingsRate = revenue !== null && revenue > 0 && savings !== null ? savings / revenue * 100 : null;
    const staffRate = expense !== null && expense > 0 && staff !== null ? staff / expense * 100 : null;
    const debtYears = savings !== null && savings > 0 && debt !== null ? debt / savings : null;
    addCalculation("Taux d’épargne brute", savingsRate, "Épargne brute ÷ recettes de fonctionnement × 100. C’est la part des recettes courantes mise de côté. Il ne dit pas si les services sont suffisants ni si les investissements sont utiles.");
    addCalculation("Dépenses de personnel / fonctionnement", staffRate, "Frais de personnel ÷ dépenses de fonctionnement × 100. Affiché seulement si les deux totaux sont présents et positifs. Il ne mesure, à lui seul, ni la productivité ni la qualité du service.");
    addCalculation("Capacité de désendettement théorique", debtYears, "Encours de dette ÷ épargne brute, en années. Le calcul suppose que toute l’épargne brute rembourse la dette, ce qui n’arrive jamais en pratique. Non interprétable si l’épargne brute est nulle ou négative.");
    if (revenue !== null && expense !== null) {
      const article = document.createElement("article");
      article.className = "municipal-calculation";
      const h = document.createElement("strong"); h.textContent = "Écart recettes − dépenses de fonctionnement";
      const v = document.createElement("span"); v.textContent = formatFinancialAmount(revenue - expense);
      article.append(h, v, paragraph("Simple soustraction des deux totaux de l’OFGL. Le résultat peut différer de l’épargne brute officielle, dont la définition comptable est plus précise. Vérifiez cette définition avant de les assimiler."));
      calculations.appendChild(article);
    }

    const firstYear = summary.years.length ? Math.min(...summary.years) : latestYear;
    const yearList = summary.years.slice().sort((a, b) => a - b);
    const firstRevenue = municipalValue(data.rows, MUNICIPAL_DEFINITIONS[0], firstYear);
    const firstExpense = municipalValue(data.rows, MUNICIPAL_DEFINITIONS[1], firstYear);
    const firstSavings = municipalValue(data.rows, MUNICIPAL_DEFINITIONS[2], firstYear);
    const firstDebt = municipalValue(data.rows, MUNICIPAL_DEFINITIONS[4], firstYear);
    const changeText = (label, first, last) => {
      if (firstYear === latestYear) return label + " : évolution non calculable (une seule année reçue).";
      const pct = lib.percentChange(last, first);
      if (pct === null) return label + " : évolution non calculable (valeur de départ absente, nulle ou négative).";
      if (Math.abs(pct) < 0.05) return label + " : quasi stable entre " + firstYear + " et " + latestYear + " (variation inférieure à 0,1 %, en euros courants).";
      return label + " : " + (pct > 0 ? "hausse" : "baisse") + " de " + ratio.format(Math.abs(pct)) + " % entre " + firstYear + " et " + latestYear + " (en euros courants).";
    };
    // Gabarit par indicateur : le chiffre, ce que c'est, ce que ça ne dit pas (phrases courtes).
    const block = (lines) => analysis.appendChild(paragraph(lines.filter(Boolean).join(" ")));
    const lead = document.createElement("strong");
    lead.textContent = "Lire les comptes de " + commune.nom + " : exercice " + latestYear;
    analysis.appendChild(lead);
    block(["Ces chiffres portent sur le budget principal et sur le dernier exercice reçu.", "Les recettes et les dépenses sont des flux : elles se mesurent sur l’année.", "La dette est un stock : elle se mesure à une date.", "Ne comparez donc pas directement les dépenses de l’année et la dette."]);
    if (revenue !== null) block(["Recettes de fonctionnement : " + formatFinancialAmount(revenue) + ".", "Ce sont les ressources courantes qui financent les services.", "Leur hausse peut venir des impôts, des dotations, des tarifs ou d’autres causes ; les totaux seuls ne disent pas laquelle."]);
    if (expense !== null) block(["Dépenses de fonctionnement : " + formatFinancialAmount(expense) + ".", "C’est le coût courant des services.", "Une hausse peut refléter les prix, l’énergie, les salaires, les besoins ou le périmètre.", "Pour conclure, il faut détailler les postes et comparer avec des communes comparables."]);
    if (savings !== null) block(["Épargne brute : " + formatFinancialAmount(savings) + (savingsRate === null ? "." : " (" + ratio.format(savingsRate) + " % des recettes de fonctionnement)."), "C’est ce qui reste des recettes courantes après les dépenses courantes.", "Cette somme n’est pas forcément libre : elle sert d’abord à rembourser le capital des emprunts."]);
    if (netSavings !== null) block(["Épargne nette : " + formatFinancialAmount(netSavings) + ".", "C’est l’épargne brute après remboursement du capital de la dette, selon la définition de la source.", "Ce n’est pas l’argent disponible sur le compte bancaire de la commune."]);
    if (debt !== null) block(["Encours de dette : " + formatFinancialAmount(debt) + ".", "C’est le capital restant dû à la date de référence, pas la somme payée dans l’année.", "Pour l’interpréter, regardez aussi l’épargne brute, les annuités et les investissements financés."]);
    if (debtYears !== null) block(["Désendettement théorique : " + ratio.format(debtYears) + " ans (encours de dette ÷ épargne brute).", "Ce n’est pas une prévision : la commune doit aussi faire fonctionner ses services et investir."]);
    if (annuity !== null) block(["Annuité de la dette : " + formatFinancialAmount(annuity) + ".", "C’est l’effort payé dans l’année ; l’encours, lui, mesure la dette restante.", "Vérifiez dans la fiche de l’OFGL si ce total regroupe capital et intérêts."]);
    if (equipment !== null || investment !== null) block(["Investissement : " + (equipment === null ? "dépenses d’équipement non disponibles" : formatFinancialAmount(equipment) + " de dépenses d’équipement") + (investment === null ? "." : " ; " + formatFinancialAmount(investment) + " de dépenses d’investissement."), "L’équipement est en général une partie de l’investissement, pas son total.", "Pour juger l’effort, regardez aussi les subventions, l’emprunt, l’état du patrimoine et les besoins."]);
    if (investmentRevenue !== null) block(["Recettes d’investissement : " + formatFinancialAmount(investmentRevenue) + ".", "Selon le total, elles comprennent subventions, fonds, ventes de biens ou emprunts.", "Un nouvel emprunt finance l’investissement mais augmente la dette : sa part compte."]);
    if (staff !== null) block(["Frais de personnel : " + formatFinancialAmount(staff) + (staffRate === null ? "." : " (" + ratio.format(staffRate) + " % des dépenses de fonctionnement)."), "Ce poste dépend des compétences exercées, des effectifs et des services rendus.", "Ce ratio seul ne permet pas de dire qu’une commune dépense trop ou trop peu."]);
    const changes = document.createElement("ul");
    [changeText("Recettes de fonctionnement", firstRevenue, revenue), changeText("Dépenses de fonctionnement", firstExpense, expense), changeText("Épargne brute", firstSavings, savings), changeText("Encours de dette", firstDebt, debt)].forEach((t) => {
      const li = document.createElement("li");
      li.textContent = typo(t);
      changes.appendChild(li);
    });
    analysis.appendChild(paragraph("Évolution entre la première et la dernière année reçues :"));
    analysis.appendChild(changes);
    analysis.appendChild(paragraph("Limites indispensables :", "municipal-analysis-note"));
    const limits = document.createElement("ul");
    limits.className = "municipal-analysis-note";
    ["Montants en euros courants, non corrigés de l’inflation.", "Seules la première et la dernière année sont comparées.", "La comparaison avec les communes de même taille figure dans la section suivante (fiche DGFiP).", "Vérifiez les libellés et le périmètre dans la documentation de l’OFGL. Ces chiffres ne prouvent aucune cause et ne sont pas un jugement politique."].forEach((t) => {
      const li = document.createElement("li");
      li.textContent = typo(t);
      limits.appendChild(li);
    });
    analysis.appendChild(limits);
    if (historyWrap) historyWrap.hidden = false;
    const cap = document.getElementById("municipal-history-caption");
    if (cap) cap.textContent = commune.nom + " · budget principal · source : OFGL (lecture automatique)";
    const historyIntro = document.getElementById("municipal-history-intro");
    if (historyIntro) historyIntro.textContent = typo("Exercices reçus : " + yearList.join(", ") + ". Montants en euros courants. « Non disponible » signifie que le poste n’a pas été trouvé ; cela ne veut pas dire zéro.");
    // Tableau annuel : fiche standard, même structure pour toutes les communes.
    const dataset = lib.buildCommuneDataset(commune, data.rows, data.total, new Date().toISOString());
    if (history && dataset) {
      const euros0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
      const amount = (v) => (v === null ? "Non disponible" : formatFinancialAmount(v));
      dataset.annual_series.forEach((y) => {
        const tr = document.createElement("tr");
        const cells = [
          String(y.year),
          y.population === null ? "Non disponible" : euros0.format(y.population),
          amount(y.revenue), amount(y.expense), amount(y.gross_savings), amount(y.net_savings),
          amount(y.debt), y.debt_per_capita === null ? "Non calculable" : euros0.format(y.debt_per_capita) + " €",
          amount(y.local_taxes), amount(y.dgf), amount(y.investment_expense), amount(y.working_capital),
          y.savings_rate === null ? "Non calculable" : ratio.format(y.savings_rate) + " %",
          y.debt_years === null ? "Non calculable" : ratio.format(y.debt_years) + " ans"
        ];
        cells.forEach((txt, i) => { const td = document.createElement("td"); td.textContent = txt; if (i > 0) td.className = "numeric-cell"; tr.appendChild(td); });
        if (y.year === latestYear) tr.className = "current-year-row";
        history.appendChild(tr);
      });
    }
    renderDatasetTools(commune, dataset);
    updateRibbon(commune, latestYear, savings, debt, savingsRate);
  }

  // Bandeau : les tuiles communales n’apparaissent qu’une fois une commune chargée ; donnée absente = « Non disponible ».
  function updateRibbon(commune, latestYear, savings, debt, savingsRate) {
    const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = typo(value); };
    const r = lib.communeRibbon(commune.nom, latestYear, savings, debt, savingsRate);
    set("ribbon-commune-savings", r.savings);
    set("ribbon-commune-debt", r.debt);
    set("ribbon-commune-rate", r.rate);
    set("ribbon-local-savings-context", r.savingsContext);
    set("ribbon-local-debt-context", r.debtContext);
    set("ribbon-local-rate-context", r.rateContext);
    document.querySelectorAll(".headline-commune").forEach((tile) => { tile.hidden = false; });
    const call = document.getElementById("ribbon-call");
    if (call) call.hidden = true;
  }

  let ficheUrl = null;
  // Identité issue du socle commun (INSEE, DGCL) et fiche standard téléchargeable.
  async function renderDatasetTools(commune, dataset) {
    const box = document.getElementById("commune-dataset");
    if (!box) return;
    box.replaceChildren();
    const entity = await loadSocleCommune(commune).catch(() => null);
    if (entity) {
      const epci = entity.parent_epci ? entity.parent_epci.official_name + " (" + entity.parent_epci.entity_id + ")" : "aucune (la commune n’appartient à aucune intercommunalité)";
      const pop = entity.population && Number.isFinite(entity.population.municipale)
        ? new Intl.NumberFormat("fr-FR").format(entity.population.municipale) + " habitants (population municipale en vigueur au 1er janvier 2026)"
        : "non disponible";
      box.appendChild(paragraph("Identité de la commune : " + entity.official_name + " · " + entity.department_name + " · " + entity.region_name + " · intercommunalité : " + epci + " · population : " + pop + ". Sources : INSEE (Code officiel géographique 2026) et DGCL (composition des intercommunalités au 1er janvier 2026).", "commune-meta"));
    }
    if (!dataset) return;
    if (entity) dataset.entity = { ...dataset.entity, department_name: entity.department_name, region_code: entity.region_code, region_name: entity.region_name, parent_epci: entity.parent_epci, population_legale: entity.population };
    const blob = new Blob([JSON.stringify(dataset, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.className = "button button-secondary";
    // Une seule adresse de fichier à la fois : la précédente est libérée.
    if (ficheUrl) URL.revokeObjectURL(ficheUrl);
    ficheUrl = URL.createObjectURL(blob);
    link.href = ficheUrl;
    link.download = "fiche-" + dataset.entity.insee_code + "-finances.json";
    link.textContent = "Télécharger la fiche de " + (commune.nom || dataset.entity.insee_code) + " (JSON)";
    box.appendChild(link);
    box.appendChild(paragraph("Même structure pour toutes les communes : indicateurs du dernier exercice, ratios calculés, série annuelle et provenance des données (OFGL).", "commune-meta"));
  }

  // Comparaison avec la strate et impôts locaux : fiche officielle DGFiP de la commune (aucun calcul).
  const frNumber = (digits) => new Intl.NumberFormat("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  function cellText(value, digits, suffix) {
    if (value === undefined) return "Sans objet";
    return value === null ? "Non disponible" : frNumber(digits).format(value) + (suffix || "");
  }

  function strataTable(caption, headers, rows) {
    const wrap = document.createElement("div");
    wrap.className = "strata-table-wrap stack-on-mobile";
    const table = document.createElement("table");
    // Rôles explicites : la sémantique de tableau reste annoncée quand le tableau s’empile sur mobile.
    table.setAttribute("role", "table");
    const cap = document.createElement("caption");
    cap.textContent = typo(caption);
    table.appendChild(cap);
    const thead = document.createElement("thead");
    thead.setAttribute("role", "rowgroup");
    const htr = document.createElement("tr");
    htr.setAttribute("role", "row");
    headers.forEach((h, i) => { const th = document.createElement("th"); th.scope = "col"; th.setAttribute("role", "columnheader"); th.textContent = typo(h); if (i > 0) th.className = "numeric-cell"; htr.appendChild(th); });
    thead.appendChild(htr);
    table.appendChild(thead);
    const tbody = document.createElement("tbody");
    tbody.setAttribute("role", "rowgroup");
    rows.forEach((cells) => {
      const tr = document.createElement("tr");
      tr.setAttribute("role", "row");
      cells.forEach((txt, i) => {
        const cell = document.createElement(i === 0 ? "th" : "td");
        cell.setAttribute("role", i === 0 ? "rowheader" : "cell");
        // data-label : intitulé de colonne repris devant chaque valeur quand le tableau s’empile (mobile).
        if (i === 0) cell.scope = "row"; else { cell.className = "numeric-cell"; cell.dataset.label = typo(headers[i]); }
        cell.textContent = typo(txt);
        tr.appendChild(cell);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
  }

  function renderStrata(container, commune, d) {
    const year = d.year || "exercice inconnu";
    const nodes = [
      paragraph(commune.nom + " · exercice " + year + " · budget principal · population légale : " + cellText(d.population, 0, " habitants") + ". Strate de comparaison de la DGFiP : " + (d.strate || "non disponible") + ".", "strata-context"),
      strataTable("Montants par habitant : " + commune.nom + " et moyenne des communes de la même strate (DGFiP, " + year + ")",
        ["Poste", "Montant de la commune (milliers d’euros)", "Commune (€ par habitant)", "Moyenne de la strate (€ par habitant)"],
        d.perCapita.map((r) => [r.label, cellText(r.thousands, 2), cellText(r.commune, 2), cellText(r.strate, 2)])),
      strataTable("Où va l’argent de fonctionnement : part de chaque poste dans les charges (DGFiP, " + year + ")",
        ["Poste de dépense", "Commune (% des charges)", "Moyenne de la strate (% des charges)"],
        d.structure.charges.map((r) => [r.label, cellText(r.commune, 2, " %"), cellText(r.strate, 2, " %")])),
      strataTable("D’où vient l’argent de fonctionnement : part de chaque ressource dans les produits (DGFiP, " + year + ")",
        ["Ressource", "Commune (% des produits)", "Moyenne de la strate (% des produits)"],
        d.structure.produits.map((r) => [r.label, cellText(r.commune, 2, " %"), cellText(r.strate, 2, " %")])),
      strataTable("Impôts perçus par la commune : produit, montant par habitant et taux votés (DGFiP, " + year + ")",
        ["Impôt", "Produit (milliers d’euros)", "Commune (€ par habitant)", "Moyenne de la strate (€ par habitant)", "Taux voté par la commune", "Taux moyen de la strate"],
        d.taxes.map((r) => [r.label, cellText(r.thousands, 2), cellText(r.commune, 2), cellText(r.strate, 2), cellText(r.rate, 2, " %"), cellText(r.strateRate, 2, " %")])),
      paragraph("Ces tableaux reprennent les valeurs publiées par la DGFiP, sans calcul du site. Une valeur absente est indiquée « Non disponible » ; un zéro publié reste un zéro. Les impôts ci-dessus ne concernent que la part de la commune. D’autres collectivités et organismes (intercommunalité, syndicats…) perçoivent aussi ces impôts et votent leurs propres taux.", "commune-method-note")
    ];
    container.replaceChildren(...nodes);
  }

  async function loadStrataComparison(commune, signal) {
    const container = document.getElementById("strata-content");
    const title = document.getElementById("strata-title");
    const badge = document.getElementById("strata-status");
    if (!container) return;
    // La pastille « Données officielles DGFiP » n’apparaît que si la DGFiP a effectivement répondu.
    if (badge) badge.hidden = true;
    if (title) title.textContent = "Comparer " + commune.nom + " avec les communes de même taille";
    if (!lib.dgfipKey(commune.code)) {
      container.replaceChildren(paragraph("Les comptes individuels de la DGFiP ne couvrent pas cette commune (code INSEE " + commune.code + ").", "commune-method-note"));
      return;
    }
    container.replaceChildren(paragraph("Chargement de la fiche DGFiP de " + commune.nom + "…", "commune-loading"));
    try {
      const payload = await fetchJson(lib.DGFIP.endpoint + "?" + lib.buildDgfipParams(commune.code).toString(), "dgfip", signal);
      if (signal && signal.aborted) return;
      if (!payload || !Array.isArray(payload.results)) throw new ServiceError("dgfip", "format");
      if (payload.results.length !== 1) {
        container.replaceChildren(paragraph(payload.results.length === 0
          ? "Aucune fiche DGFiP 2025 n’est publiée pour cette commune. Ce n’est pas un montant nul : la fiche n’existe pas."
          : "La DGFiP renvoie plusieurs fiches pour ce code : aucune n’est affichée pour éviter une confusion.", "commune-method-note"));
        return;
      }
      const fiche = lib.readDgfip(payload.results[0]);
      renderStrata(container, commune, fiche);
      if (badge) {
        badge.textContent = "Données officielles DGFiP" + (fiche && fiche.year ? " · exercice " + fiche.year : "");
        badge.hidden = false;
      }
    } catch (error) {
      if (signal && signal.aborted) return;
      container.replaceChildren(paragraph(unavailableText(error, "Le service de la DGFiP", "Aucun montant n’est affiché."), "commune-method-note"));
    }
  }

  // Taux par bénéficiaire sur l'avis d'imposition (DGFiP, issus du REI) : valeurs publiées, aucun calcul.
  function renderTaux(container, commune, d) {
    const pct = (v) => cellText(v, 3, " %");
    const rows = d.rows.filter((r) => [r.tfb, r.tfnb, r.th].some((v) => v !== undefined && v !== null && v !== 0));
    const nodes = [
      paragraph(commune.nom + " · année " + (d.year || "inconnue") + (d.epci ? " · intercommunalité : " + d.epci : "") + ". Seuls les bénéficiaires dont le taux n’est pas nul sur la commune sont listés.", "strata-context"),
      strataTable("Sur l’avis d’imposition : qui reçoit quoi (taux votés ou applicables, DGFiP, " + (d.year || "") + ")",
        ["Bénéficiaire", "Taxe foncière sur les propriétés bâties", "Taxe foncière sur les propriétés non bâties", "Taxe d’habitation (résidences secondaires, logements vacants)"],
        rows.map((r) => [r.label, pct(r.tfb), pct(r.tfnb), pct(r.th)]).concat([["Taux global publié par la DGFiP", pct(d.global.tfb), pct(d.global.tfnb), pct(d.global.th)]])),
      paragraph("Taxe d’enlèvement des ordures ménagères (affichée à part par la DGFiP ; taux plein, hors zones à taux particulier) : " + (d.teom === null ? "non renseignée (la collecte peut être financée par une redevance)" : pct(d.teom)) + "." + (d.thMajoration !== undefined ? " Majoration de la taxe d’habitation sur les résidences secondaires : " + pct(d.thMajoration) + "." : ""), "strata-context"),
      paragraph("Selon la DGFiP, le taux global additionne les taux de la commune, de l’intercommunalité, des syndicats et des taxes spéciales. Il exclut les chambres de commerce, de métiers et d’agriculture. Quand des communes ou des intercommunalités fusionnent, leurs taux se rapprochent sur plusieurs années. Le taux de votre avis peut alors différer un temps du taux voté.", "commune-method-note")
    ];
    container.replaceChildren(...nodes);
    window.dispatchEvent(new CustomEvent("citoyen:tax-rates-loaded", { detail: { commune, rates: d } }));
  }

  async function loadTaux(commune, signal) {
    const container = document.getElementById("taux-content");
    if (!container) return;
    container.replaceChildren(paragraph("Chargement des taux d’imposition de " + commune.nom + "…", "commune-loading"));
    try {
      const payload = await fetchJson(lib.TAUX.endpoint + "?" + lib.buildTauxParams(commune.code).toString(), "dgfip", signal);
      if (signal && signal.aborted) return;
      if (!payload || !Array.isArray(payload.results)) throw new ServiceError("dgfip", "format");
      if (!payload.results.length) {
        container.replaceChildren(paragraph("La DGFiP ne publie pas de taux pour cette commune. Ce n’est pas un taux nul : la donnée n’existe pas.", "commune-method-note"));
        return;
      }
      renderTaux(container, commune, lib.readTaux(payload.results[0]));
    } catch (error) {
      if (signal && signal.aborted) return;
      container.replaceChildren(paragraph(unavailableText(error, "Le service de la DGFiP", "Aucun taux n’est affiché."), "commune-method-note"));
    }
  }

  async function loadCommuneCard(card, commune, signal) {
    // Fiche DGFiP chargée en parallèle : sa disponibilité ne dépend pas de celle de l'OFGL.
    loadStrataComparison(commune, signal);
    loadTaux(commune, signal);
    const loading = paragraph("Comptes de l’OFGL pour " + commune.nom + " : chargement…", "commune-loading");
    card.appendChild(loading);
    const selectedStatus = document.getElementById("municipal-status");
    const selectedTitle = document.getElementById("municipal-title");
    const selectedIntro = document.getElementById("municipal-intro");
    const selectedAnalysis = document.getElementById("commune-analysis");
    if (selectedTitle) selectedTitle.textContent = "Les finances de " + commune.nom + " (" + commune.code + ")";
    if (selectedStatus) selectedStatus.textContent = "Chargement des données…";
    // Le texte d’attente est retiré dès qu’une commune est choisie.
    if (selectedIntro) selectedIntro.textContent = typo("Commune : " + commune.nom + " · code INSEE " + commune.code + ". Les comptes de l’OFGL sont en cours de chargement.");
    if (selectedAnalysis) { selectedAnalysis.replaceChildren(); selectedAnalysis.hidden = true; }
    try {
      const data = await fetchCommuneFinances(commune, signal);
      if (signal.aborted) return;
      loading.remove();
      renderCommuneFinances(card, commune, data);
      renderSelectedTerritory(commune, data);
      const link = document.createElement("a");
      link.className = "button button-secondary";
      link.href = "#analyse-communale";
      link.textContent = "Lire l’analyse détaillée de " + commune.nom;
      card.appendChild(link);
    } catch (error) {
      if (signal.aborted) return;
      loading.remove();
      renderFinanceError(card, error);
      if (selectedStatus) selectedStatus.textContent = "Données indisponibles";
      if (selectedIntro) selectedIntro.textContent = typo("Commune : " + commune.nom + " · code INSEE " + commune.code + ". Les comptes de l’OFGL n’ont pas pu être chargés.");
      const metrics = document.getElementById("commune-metrics");
      if (metrics) metrics.replaceChildren(paragraph(unavailableText(error, "Le service de l’OFGL", "Aucun montant n’est affiché."), "commune-method-note"));
      const calculations = document.getElementById("commune-calculs");
      if (calculations) calculations.replaceChildren();
      const historyWrap = document.getElementById("municipal-history-wrap");
      if (historyWrap) historyWrap.hidden = true;
    }
    card.appendChild(sourceLink(commune));
  }

  function showSearchMessage(result, title, text, withOfglLink) {
    result.replaceChildren();
    const heading = document.createElement("h3");
    heading.textContent = typo(title);
    result.append(heading, paragraph(text));
    if (withOfglLink) addResultLink(result, "Ouvrir la base des comptes communaux — OFGL", lib.OFGL.datasetPage);
    result.hidden = false;
  }

  async function searchCommunes(kind, signal) {
    const base = { fields: "nom,code,codeDepartement,codesPostaux", limit: "10" };
    const query = (extra) => fetchJson("https://geo.api.gouv.fr/communes?" + new URLSearchParams({ ...base, ...extra }).toString(), "geo", signal, GEO_TIMEOUT_MS);
    if (kind.type === "postal-or-insee") {
      // Un nombre à 5 chiffres peut être un code postal ou un code INSEE : les deux sont interrogés.
      const [byPostal, byCode] = await Promise.all([query({ codePostal: kind.value }), query({ code: kind.value })]);
      return lib.mergeCommunes([{ communes: byCode, matchedBy: "code" }, { communes: byPostal, matchedBy: "codePostal" }]);
    }
    if (kind.type === "insee") return lib.mergeCommunes([{ communes: await query({ code: kind.value }), matchedBy: "code" }]);
    return lib.mergeCommunes([{ communes: await query({ nom: kind.value, boost: "population" }), matchedBy: "nom" }]);
  }

  // geo.api.gouv.fr d'abord ; s'il ne répond pas, le socle commun publié avec le site prend le relais.
  async function searchCommunesWithFallback(kind, signal) {
    try {
      return { communes: await searchCommunes(kind, signal), fallback: false };
    } catch (error) {
      if (signal.aborted) throw error;
      try {
        return { communes: lib.searchSocleIndex(await loadSearchIndex(), kind, 10), fallback: true };
      } catch (fallbackError) {
        throw error;
      }
    }
  }

  // Menu replié (bouton « Menu », aria-expanded, Échap, retour du focus, fermeture au clic extérieur).
  function initMobileNavigation() {
    const toggle = document.querySelector(".nav-toggle");
    const nav = document.getElementById("navigation-principale");
    if (!toggle || !nav) return;
    const collapsed = () => window.matchMedia(NAV_COLLAPSED_QUERY).matches;
    const icon = toggle.querySelector(".nav-toggle-icon");
    const setOpen = (open) => {
      toggle.setAttribute("aria-expanded", String(open));
      nav.classList.toggle("is-open", open);
      if (icon) icon.textContent = open ? "−" : "+";
    };
    toggle.addEventListener("click", () => {
      const open = toggle.getAttribute("aria-expanded") !== "true";
      setOpen(open);
      if (open) {
        const first = nav.querySelector("a");
        if (first) first.focus();
      }
    });
    nav.addEventListener("click", (event) => {
      if (event.target.closest("a") && collapsed()) setOpen(false);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
        setOpen(false);
        toggle.focus();
      }
    });
    document.addEventListener("click", (event) => {
      if (toggle.getAttribute("aria-expanded") === "true" && !event.target.closest(".site-header")) setOpen(false);
    });
    // Le focus qui quitte le menu ouvert (Tab après le dernier lien) le referme.
    nav.addEventListener("focusout", (event) => {
      if (collapsed() && toggle.getAttribute("aria-expanded") === "true" && event.relatedTarget && !event.relatedTarget.closest(".site-header")) setOpen(false);
    });
    window.addEventListener("resize", () => {
      if (!collapsed()) setOpen(false);
    });
  }

  // Section visible signalée dans le menu (aria-current="location").
  function initCurrentSection() {
    const links = Array.from(document.querySelectorAll("#navigation-principale a[href^='#']"));
    if (!links.length || !("IntersectionObserver" in window)) return;
    const byId = new Map(links.map((a) => [a.getAttribute("href").slice(1), a]));
    const visible = new Map();
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => visible.set(entry.target.id, entry.isIntersecting ? entry.boundingClientRect.top : null));
      let current = null;
      let best = Infinity;
      visible.forEach((top, id) => { if (top !== null && Math.abs(top) < best) { best = Math.abs(top); current = id; } });
      links.forEach((a) => a.removeAttribute("aria-current"));
      if (current && byId.has(current)) byId.get(current).setAttribute("aria-current", "location");
    }, { rootMargin: "-20% 0px -60% 0px" });
    byId.forEach((_, id) => { const section = document.getElementById(id); if (section) observer.observe(section); });
  }

  // Bouton « Haut de page », affiché après le premier écran.
  function initBackToTop() {
    const button = document.querySelector(".back-to-top");
    if (!button) return;
    let ticking = false;
    const update = () => {
      button.hidden = window.scrollY < window.innerHeight;
      ticking = false;
    };
    window.addEventListener("scroll", () => {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    button.addEventListener("click", () => {
      const target = document.getElementById("contenu");
      if (target) setTimeout(() => target.focus({ preventScroll: true }), 0);
    });
    update();
  }

  // Tableaux larges : zone défilante focalisable au clavier et indice visible quand le tableau dépasse.
  function initScrollHints() {
    const selector = ".table-wrap, .composition-table-wrap, .strata-table-wrap, .history-scroll";
    const prepare = (wrap) => {
      if (wrap.dataset.scrollReady) return;
      wrap.dataset.scrollReady = "1";
      const caption = wrap.querySelector("caption");
      wrap.setAttribute("role", "region");
      wrap.setAttribute("tabindex", "0");
      wrap.setAttribute("aria-label", caption ? caption.textContent.trim() : "Tableau");
      const hint = document.createElement("p");
      hint.className = "scroll-hint";
      hint.textContent = "Tableau large : faites-le défiler horizontalement →";
      hint.setAttribute("aria-hidden", "true");
      wrap.parentNode.insertBefore(hint, wrap);
      const check = () => hint.classList.toggle("is-visible", wrap.scrollWidth > wrap.clientWidth + 2);
      if ("ResizeObserver" in window) new ResizeObserver(check).observe(wrap);
      check();
    };
    const scan = () => document.querySelectorAll(selector).forEach(prepare);
    scan();
    if ("MutationObserver" in window) {
      const main = document.getElementById("contenu");
      if (main) new MutationObserver(scan).observe(main, { childList: true, subtree: true });
    }
  }

  // Commune reflétée dans l’adresse : ?commune=<code INSEE>. Recharger ou partager l’adresse relance la recherche.
  function communeFromUrl() {
    const code = (new URLSearchParams(window.location.search).get("commune") || "").trim().toUpperCase();
    return lib.isInseeCode(code) ? code : null;
  }
  function writeCommuneToUrl(code, replace) {
    if (!window.history || !window.history.pushState) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("commune") === code) return;
    url.searchParams.set("commune", code);
    window.history[replace ? "replaceState" : "pushState"]({ commune: code }, "", url.toString());
  }

  async function initMunicipalitySearch() {
    const form = document.getElementById("commune-form");
    const input = document.getElementById("commune-query");
    const result = document.getElementById("commune-result");
    if (!form || !input || !result) return;
    const button = form.querySelector("button[type=submit]");
    let current = null;
    const setBusy = (busy) => {
      // Le bouton reste actif : une nouvelle recherche annule la précédente.
      if (button) button.textContent = busy ? "Recherche…" : "Rechercher";
    };
    const setResultBusy = (busy) => result.setAttribute("aria-busy", busy ? "true" : "false");
    // Saisie vide ou invalide : message du site (zone aria-live #commune-result) plutôt que la bulle native.
    const setInvalid = (invalid) => {
      if (invalid) {
        input.setAttribute("aria-invalid", "true");
        input.setAttribute("aria-describedby", "commune-result commune-hint");
        input.focus();
      } else {
        input.removeAttribute("aria-invalid");
        input.setAttribute("aria-describedby", "commune-hint");
      }
    };

    // kind : résultat de lib.classifyCommuneQuery ; fromUrl : recherche relancée depuis l’adresse.
    const search = async (kind, fromUrl) => {
      if (current) {
        current.abort();
        current = null;
        setBusy(false);
        setResultBusy(false);
      }
      setInvalid(kind.type === "empty" || kind.type === "partial-code" || kind.type === "invalid-code");
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
      setResultBusy(true);
      result.replaceChildren(paragraph("Recherche de la commune…", "commune-loading"));
      result.hidden = false;
      try {
        const { communes, fallback } = await searchCommunesWithFallback(kind, controller.signal);
        if (controller.signal.aborted) return;
        // Commune identifiée : le bouton retrouve son libellé, les comptes se chargent bloc par bloc.
        setBusy(false);
        result.replaceChildren();
        if (!communes.length) {
          showSearchMessage(result, "Aucune commune trouvée", "Vérifiez l’orthographe, le code postal ou le code INSEE. Vous pouvez aussi chercher directement dans la base financière officielle.", true);
          return;
        }
        const heading = document.createElement("h3");
        heading.textContent = communes.length === 1 ? "Commune trouvée" : communes.length + " communes correspondent : choisissez la bonne";
        result.append(heading, paragraph(fallback
          ? "Le service geo.api.gouv.fr ne répond pas : la liste vient du référentiel des communes publié avec ce site (Code officiel géographique de l’INSEE au 1er janvier 2026). Chaque commune est identifiée par son code INSEE."
          : "La commune est identifiée par le service public geo.api.gouv.fr, avec son code INSEE. Les comptes de l’OFGL ont leur propre périmètre, exercice et disponibilité.", "commune-meta"));
        const loads = [];
        const open = (card, commune) => {
          writeCommuneToUrl(commune.code, fromUrl);
          window.dispatchEvent(new CustomEvent("citoyen:commune-selected", { detail: { commune } }));
          return loadCommuneCard(card, commune, controller.signal);
        };
        communes.forEach((commune) => {
          const card = document.createElement("article");
          card.className = "commune-result-card";
          communeHeader(card, commune);
          result.appendChild(card);
          if (communes.length === 1) {
            loads.push(open(card, commune));
          } else {
            const choose = document.createElement("button");
            choose.type = "button";
            choose.className = "button button-secondary";
            choose.textContent = "Afficher les comptes de " + commune.nom + " (" + commune.code + ")";
            choose.addEventListener("click", () => {
              choose.remove();
              open(card, commune);
            }, { once: true });
            card.appendChild(choose);
          }
        });
        await Promise.all(loads);
      } catch (error) {
        if (controller.signal.aborted) return;
        showSearchMessage(result, "Recherche momentanément indisponible", serviceErrorText(error, "Le référentiel géographique geo.api.gouv.fr") + " Vous pouvez quand même chercher les comptes dans la base officielle de l’OFGL.", true);
      } finally {
        if (current === controller) {
          setBusy(false);
          setResultBusy(false);
        }
      }
    };

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      search(lib.classifyCommuneQuery(input.value), false);
    });

    const fromUrl = () => {
      const code = communeFromUrl();
      if (!code) return;
      input.value = code;
      search({ type: "insee", value: code }, true);
    };
    window.addEventListener("popstate", fromUrl);
    fromUrl();
  }

  function initGlossary() {
    const input = document.getElementById("glossary-search");
    const list = document.getElementById("glossary-list");
    const count = document.getElementById("glossary-count");
    if (!input || !list || !count) return;
    const entries = Array.from(list.querySelectorAll(".glossary-entry"));
    // Sur mobile (une colonne), seules les 12 premières définitions sont dépliées dans la page ;
    // la recherche porte toujours sur toutes. Sur grand écran, le bouton est masqué par la feuille de style.
    let more = null;
    if (entries.length > 12) {
      more = document.createElement("button");
      more.type = "button";
      more.className = "button button-secondary glossary-more";
      more.textContent = "Afficher les " + entries.length + " définitions";
      more.setAttribute("aria-controls", "glossary-list");
      more.setAttribute("aria-expanded", "false");
      list.classList.add("is-collapsed");
      list.after(more);
      more.addEventListener("click", () => {
        list.classList.remove("is-collapsed");
        more.setAttribute("aria-expanded", "true");
        more.hidden = true;
        const next = entries[12] && entries[12].querySelector("summary");
        if (next) next.focus();
      });
    }
    const update = () => {
      const query = normalizeSearch(input.value);
      list.classList.toggle("has-query", Boolean(query));
      let visible = 0;
      entries.forEach((entry) => {
        const matches = !query || normalizeSearch(entry.textContent).includes(query);
        entry.hidden = !matches;
        if (matches) visible += 1;
      });
      if (!visible) {
        count.textContent = typo("Aucune définition pour « " + input.value.trim() + " ». Essayez un mot plus court.");
        return;
      }
      count.textContent = typo(visible + " définition" + (visible > 1 ? "s" : "") + (query ? " pour « " + input.value.trim() + " »." : " dans le glossaire."));
    };
    input.addEventListener("input", update);
    update();
    // Une ancre vers un terme (#encours-de-dette) ouvre sa définition.
    const openTarget = () => {
      let target = null;
      try { target = location.hash ? document.querySelector(location.hash) : null; } catch (error) { target = null; }
      if (target && target.classList.contains("glossary-entry")) {
        list.classList.remove("is-collapsed");
        if (more) more.hidden = true;
        target.hidden = false;
        target.open = true;
      }
    };
    window.addEventListener("hashchange", openTarget);
    openTarget();
  }

  async function initDebtComposition() {
    const table = document.getElementById("composition-table-body");
    if (!table) return;
    try {
      const response = await fetch("data/indicators/dette-publique-composition-2026-T2.json");
      if (!response.ok) throw new Error("HTTP " + response.status);
      const data = await response.json();
      const total = data.headline.gross_debt;
      const netValue = document.getElementById("net-debt-value");
      const netContext = document.getElementById("net-debt-context");
      if (netValue) netValue.textContent = typo(money.format(data.headline.net_debt) + " Md€");
      if (netContext) netContext.textContent = typo(money.format(data.headline.net_debt_gdp_percent) + " % du PIB · variation sur le trimestre : " + signed(data.headline.net_debt_change_qoq, money) + " Md€");
      table.replaceChildren();
      const addRow = (cells, className) => {
        const tr = document.createElement("tr");
        if (className) tr.className = className;
        cells.forEach((text, index) => {
          const td = document.createElement("td");
          td.textContent = typo(text);
          if (index > 0) td.className = "numeric-cell";
          tr.appendChild(td);
        });
        table.appendChild(tr);
      };
      data.subsectors.forEach((item) => {
        addRow([item.label, money.format(item.debt) + " Md€", signed(item.change_qoq, money) + " Md€", ratio.format(item.debt / total * 100) + " %"]);
      });
      addRow(["Total des administrations publiques", money.format(total) + " Md€", signed(data.headline.gross_debt_change_qoq, money) + " Md€", "100,0 %"], "composition-total-row");
    } catch (error) {
      table.replaceChildren();
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 4;
      cell.textContent = "Données de composition momentanément indisponibles. Consultez la publication de l’INSEE liée sous le tableau.";
      row.appendChild(cell);
      table.appendChild(row);
    }
  }


  // Les tableaux chargés après coup déplacent les sections : on revient sur l’ancre demandée,
  // sauf si le lecteur a déjà fait défiler la page lui-même.
  let userScrolled = false;
  ["wheel", "touchstart", "keydown", "mousedown"].forEach((type) => window.addEventListener(type, () => { userScrolled = true; }, { once: true, passive: true }));
  function restoreAnchor() {
    if (!location.hash || userScrolled) return;
    let target = null;
    try { target = document.querySelector(location.hash); } catch (error) { return; }
    if (target) target.scrollIntoView({ block: "start", behavior: "instant" });
  }

  async function init() {
    initMunicipalitySearch();
    initGlossary();
    initCurrentSection();
    initBackToTop();
    initScrollHints();
    const pending = [initDebtComposition()];
    const form = document.getElementById("claim-form");
    if (form) {
      form.addEventListener("submit", handleClaim);
      // Liste des communes préchargée dès la saisie (reconnaissance de toutes les communes).
      form.addEventListener("focusin", () => { loadSearchIndex().catch(() => null); }, { once: true });
    }
    try {
      const response = await fetch(DATA_URL);
      if (!response.ok) throw new Error("HTTP " + response.status);
      debtData = await response.json();
      renderDebt(debtData);
      const latest = debtData.records && debtData.records[0];
      const ribbonDebt = document.getElementById("ribbon-debt");
      const ribbonDebtContext = document.getElementById("ribbon-debt-context");
      if (latest && ribbonDebt) {
        const unit = document.createElement("abbr");
        unit.title = "milliards d’euros";
        unit.textContent = "Md€";
        ribbonDebt.replaceChildren(typo(money.format(latest.debt_eur_billion)) + "\u00a0", unit);
      }
      if (latest && ribbonDebtContext) ribbonDebtContext.textContent = typo(ratio.format(latest.debt_gdp_percent) + " % du PIB · " + lib.formatQuarter(latest.period).replace(/ /g, "\u00a0"));
    } catch (error) {
      const value = document.getElementById("latest-debt");
      if (value) value.textContent = "Données indisponibles";
      const period = document.getElementById("latest-period");
      if (period) period.textContent = "Ouvrez le fichier source officiel pour consulter la dernière publication.";
      const body = document.getElementById("debt-table-body");
      if (body) body.textContent = "Impossible de charger les données. Consultez directement la source de l’INSEE.";
    }
    await Promise.allSettled(pending);
    requestAnimationFrame(restoreAnchor);
  }

  document.addEventListener("DOMContentLoaded", initMobileNavigation);
  document.addEventListener("DOMContentLoaded", init);
})();
