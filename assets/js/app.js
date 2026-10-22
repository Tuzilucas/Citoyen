(() => {
  "use strict";
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
    period.textContent = latest.period.replace(/^(\d{4})-T(\d)$/, "$2e trimestre $1") + " · France entière";
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

  function detectTopic(text, selectedScope) {
    if (selectedScope !== "auto") return selectedScope;
    const value = text.toLocaleLowerCase("fr-FR");
    if (/éducation|education|école|écoles|enseignement|ministère de l'éducation/.test(value)) return "education";
    if (/dette|maastricht|endettement/.test(value)) return "dette";
    if (/fameck|commune|municipal|mairie/.test(value)) return "commune";
    if (/budget de l'état|budget de l'etat|loi de finances|crédits de l'état/.test(value)) return "budget-etat";
    return "unknown";
  }

  function handleClaim(event) {
    event.preventDefault();
    const text = document.getElementById("claim-text")?.value.trim() || "";
    const period = document.getElementById("claim-period")?.value || "";
    const selectedScope = document.getElementById("claim-scope")?.value || "auto";
    const topic = detectTopic(text, selectedScope);

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

  function normalizeSearch(value) {
    return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr-FR").trim();
  }

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

  function renderCommuneResult(container, entity) {
    container.replaceChildren();
    const title = document.createElement("h3");
    title.textContent = entity.official_name + " — " + entity.department_name;
    container.appendChild(title);

    const code = document.createElement("p");
    code.className = "commune-meta";
    code.textContent = "Code INSEE : " + entity.entity_id + " · Code postal : " + (entity.postal_codes || []).join(", ");
    container.appendChild(code);

    const status = document.createElement("span");
    status.className = "result-status";
    status.textContent = "Identité géographique référencée";
    container.appendChild(status);

    const explanation = document.createElement("p");
    explanation.textContent = "Les données financières de cette commune ne sont pas encore intégrées et validées dans l’observatoire. Aucun montant local n’est donc affiché. La prochaine étape est de récupérer les comptes officiels, contrôler les exercices disponibles et documenter les périmètres.";
    container.appendChild(explanation);

    addResultLink(container, "Consulter les comptes des communes — OFGL", "https://data.ofgl.fr/explore/dataset/ofgl-base-communes/");
    addResultLink(container, "Consulter les comptes individuels des communes — DGFiP", "https://www.data.gouv.fr/datasets/comptes-individuels-des-communes-fichier-global-2025");
    container.hidden = false;
  }

  async function initMunicipalitySearch() {
    const form = document.getElementById("commune-form");
    const input = document.getElementById("commune-query");
    const result = document.getElementById("commune-result");
    if (!form || !input || !result) return;

    let entities = [];
    try {
      const response = await fetch("data/entities.json", { cache: "no-store" });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const data = await response.json();
      entities = Array.isArray(data.entities) ? data.entities : [];
    } catch (error) {
      result.textContent = "Le catalogue territorial est momentanément indisponible. Consulte les sources officielles en attendant.";
      result.hidden = false;
      return;
    }

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const query = normalizeSearch(input.value);
      if (!query) return;
      const matches = entities.filter((entity) => {
        const values = [entity.official_name, entity.entity_id, ...(entity.postal_codes || [])];
        return values.some((value) => normalizeSearch(String(value)).includes(query));
      });
      result.replaceChildren();
      if (matches.length) {
        matches.slice(0, 5).forEach((entity) => renderCommuneResult(result, entity));
      } else {
        const title = document.createElement("h3");
        title.textContent = "Commune non présente dans le catalogue actuel";
        const explanation = document.createElement("p");
        explanation.textContent = "Le catalogue de l’observatoire ne contient pour l’instant qu’un nombre limité de communes. Cela ne signifie pas que les données officielles sont indisponibles. Tu peux consulter les bases nationales ci-dessous.";
        result.append(title, explanation);
        addResultLink(result, "Rechercher dans les comptes des communes — OFGL", "https://data.ofgl.fr/explore/dataset/ofgl-base-communes/");
        addResultLink(result, "Rechercher les comptes individuels — DGFiP", "https://www.data.gouv.fr/datasets/comptes-individuels-des-communes-fichier-global-2025");
      }
      result.hidden = false;
    });
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
      if (netContext) netContext.textContent = money.format(data.headline.net_debt_gdp_percent) + " % du PIB · variation trimestrielle : +" + money.format(data.headline.net_debt_change_qoq) + " Md€";
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
      ["Total des administrations publiques", money.format(total) + " Md€", "+" + money.format(data.headline.gross_debt_change_qoq) + " Md€", "100,0 %"].forEach((text, index) => {
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
        const first = data.annual_series.find((item) => item.year === 2019);
        const last = data.annual_series.find((item) => item.year === 2024);
        if (first && last) {
          const change = (current, base) => (current / base - 1) * 100;
          const savingsChange = change(last.gross_savings, first.gross_savings);
          const debtChange = change(last.debt, first.debt);
          analysis.replaceChildren();
          const title = document.createElement("strong");
          title.textContent = "Ce que montre la série 2019–2024";
          const paragraph = document.createElement("p");
          paragraph.textContent = "L’épargne brute recule de " + ratio.format(Math.abs(savingsChange)) + " % tandis que l’encours de dette augmente de " + ratio.format(debtChange) + " %. Le taux d’épargne brute passe de " + ratio.format(first.savings_rate) + " % à " + ratio.format(last.savings_rate) + " %, et la capacité de désendettement publiée passe de " + ratio.format(first.debt_years) + " à " + ratio.format(last.debt_years) + " ans.";
          const note = document.createElement("p");
          note.className = "municipal-analysis-note";
          note.textContent = "Lecture descriptive des valeurs retranscrites, sans attribution de cause ni jugement sur les choix municipaux. À confirmer après rapprochement avec l’export officiel OFGL.";
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

  async function init() {
    initMunicipalitySearch();
    initDebtComposition();
    initFameckFinances();
    const form = document.getElementById("claim-form");
    if (form) form.addEventListener("submit", handleClaim);
    try {
      const response = await fetch(DATA_URL, { cache: "no-store" });
      if (!response.ok) throw new Error("HTTP " + response.status);
      debtData = await response.json();
      renderDebt(debtData);
    } catch (error) {
      const value = document.getElementById("latest-debt");
      if (value) value.textContent = "Données indisponibles";
      const period = document.getElementById("latest-period");
      if (period) period.textContent = "Ouvrir le fichier source officiel pour consulter la dernière publication.";
      const body = document.getElementById("debt-table-body");
      if (body) body.textContent = "Impossible de charger le fichier JSON. Consultez directement la source INSEE.";
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();