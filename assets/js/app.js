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
          "Des repères 2024 de Fameck sont affichés dans le site, mais ils proviennent d'une retranscription secondaire et ne sont pas encore rapprochés ligne à ligne de l'export brut OFGL/DGFiP.",
          "Une comparaison communale devra distinguer budget principal, budgets annexes et données consolidées, ainsi que prévisions et exécution. Les chiffres de Fameck ne doivent pas être traités comme une série officiellement réconciliée tant que le contrôle brut n'est pas terminé.",
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

  async function loadCommuneCard(card, commune, signal) {
    const loading = paragraph("Chargement des comptes OFGL pour " + commune.nom + "…", "commune-loading");
    card.appendChild(loading);
    try {
      const data = await fetchCommuneFinances(commune, signal);
      if (signal.aborted) return;
      loading.remove();
      renderCommuneFinances(card, commune, data);
    } catch (error) {
      if (signal.aborted) return;
      loading.remove();
      renderFinanceError(card, error);
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

  async function initFameckFinances() {
    const metrics = document.getElementById("fameck-metrics");
    const calculations = document.getElementById("fameck-calculs");
    const history = document.getElementById("fameck-history-body");
    if (!metrics || !calculations) return;
    const euro = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
    try {
      const response = await fetch("data/indicators/fameck-finances-2024.json", { cache: "no-store" });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const data = await response.json();
      metrics.replaceChildren();
      data.indicators.forEach((item) => {
        const card = document.createElement("article");
        card.className = "municipal-metric";
        const label = document.createElement("p");
        label.className = "municipal-metric-label";
        label.textContent = item.label;
        const amount = document.createElement("p");
        amount.className = "municipal-metric-value";
        amount.textContent = euro.format(item.value_eur);
        const perCapita = document.createElement("p");
        perCapita.className = "municipal-metric-context";
        perCapita.textContent = money.format(item.value_per_capita_eur) + " € par habitant";
        const definition = document.createElement("p");
        definition.className = "municipal-metric-definition";
        definition.textContent = item.definition;
        card.append(label, amount, perCapita, definition);
        metrics.appendChild(card);
      });
      calculations.replaceChildren();
      const analysis = document.getElementById("fameck-analysis");
      if (analysis) {
        const series = data.annual_series.slice().sort((a, b) => a.year - b.year);
        const first = series[0];
        const last = series.find((item) => item.year === data.display_year);
        if (first && last && first !== last) {
          const pct = (key) => lib.percentChange(last[key], first[key]);
          const describe = (label, value, plural) => value === null
            ? label + (plural ? " ne peuvent pas être comparées" : " ne peut pas être comparée") + " (base nulle ou négative)"
            : label + " " + lib.directionWord(value, plural ? "progressent" : "progresse", plural ? "reculent" : "recule", plural ? "sont stables" : "est stable") + (Math.abs(value) < 0.05 ? "" : " de " + ratio.format(Math.abs(value)) + " %");
          const revenueChange = pct("revenue");
          const expenseChange = pct("expense");
          const savingsChange = pct("gross_savings");
          const period = first.year + " et " + last.year;
          analysis.replaceChildren();
          const title = document.createElement("strong");
          title.textContent = "Ce que montre la série " + first.year + "–" + last.year;
          const paragraph = document.createElement("p");
          let reading = "";
          if (revenueChange !== null && expenseChange !== null && Math.abs(expenseChange - revenueChange) >= 0.05) {
            reading = expenseChange > revenueChange
              ? " En clair : entre ces deux exercices, les dépenses de fonctionnement ont augmenté plus vite que les recettes, ce qui réduit la marge annuelle disponible pour financer les investissements et rembourser le capital de la dette."
              : " En clair : entre ces deux exercices, les recettes de fonctionnement ont augmenté plus vite que les dépenses, ce qui accroît la marge annuelle disponible.";
          }
          paragraph.textContent = "Entre " + period + ", " + describe("les recettes de fonctionnement", revenueChange, true) + ", et " + describe("les dépenses", expenseChange, true) + ". " +
            describe("L’épargne brute", savingsChange) + ". Le taux d’épargne brute passe de " + ratio.format(first.savings_rate) + " % à " + ratio.format(last.savings_rate) + " %, et la capacité de désendettement publiée passe de " + ratio.format(first.debt_years) + " à " + ratio.format(last.debt_years) + " ans." + reading;
          const note = document.createElement("p");
          note.className = "municipal-analysis-note";
          note.textContent = "Comparaison de deux exercices seulement (" + period + ") : les années intermédiaires figurent dans le tableau et peuvent évoluer différemment. Lecture descriptive des valeurs retranscrites, sans attribution de cause ni jugement politique. Montants nominaux : l’inflation n’est pas corrigée. Ces résultats restent provisoires, car la série secondaire n’a pas encore été rapprochée ligne à ligne de l’export officiel OFGL.";
          analysis.append(title, paragraph, note);
        }
      }
      if (history) {
        history.replaceChildren();
        data.annual_series.forEach((year) => {
          const tr = document.createElement("tr");
          const cells = [
            String(year.year),
            euro.format(year.revenue),
            euro.format(year.expense),
            euro.format(year.gross_savings),
            euro.format(year.debt),
            ratio.format(year.savings_rate) + " %",
            ratio.format(year.debt_years) + " ans"
          ];
          cells.forEach((text, index) => {
            const td = document.createElement("td");
            td.textContent = text;
            if (index > 0) td.className = "numeric-cell";
            tr.appendChild(td);
          });
          if (year.year === data.display_year) tr.className = "current-year-row";
          history.appendChild(tr);
        });
      }
      const ribbonYear = data.annual_series.find((item) => item.year === data.display_year);
      if (ribbonYear) {
        const millions = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
        set("ribbon-fameck-savings", millions.format(ribbonYear.gross_savings / 1e6) + " M€");
        set("ribbon-fameck-debt", millions.format(ribbonYear.debt / 1e6) + " M€");
        set("ribbon-fameck-rate", millions.format(ribbonYear.gross_savings / ribbonYear.revenue * 100) + " %");
      }
      data.calculated_indicators.forEach((item) => {
        const article = document.createElement("article");
        article.className = "municipal-calculation";
        const title = document.createElement("strong");
        title.textContent = item.label;
        const value = document.createElement("span");
        value.textContent = item.value_percent !== undefined ? ratio.format(item.value_percent) + " %" : ratio.format(item.value_years) + " ans";
        const formula = document.createElement("p");
        formula.textContent = "Formule : " + item.formula + ". Indicateur indicatif, calculé à partir des valeurs retranscrites.";
        article.append(title, value, formula);
        calculations.appendChild(article);
      });
    } catch (error) {
      metrics.textContent = "Les données de Fameck ne peuvent pas être chargées pour le moment. Consultez les sources liées à cette section.";
    }
  }

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
    const pending = [initDebtComposition(), initFameckFinances()];
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