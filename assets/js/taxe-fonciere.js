(() => {
  "use strict";

  const money = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });
  const percent = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function parseAmount(raw) {
    if (raw === null || raw === undefined || String(raw).trim() === "") return null;
    const value = Number(String(raw).trim().replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(value) && value >= 0 ? value : null;
  }

  function calculate(input, rates) {
    const total = parseAmount(input.total);
    if (total === null) return { error: "Saisissez un montant total valide." };
    const base = parseAmount(input.base);
    const communeAmount = parseAmount(input.communeAmount);
    const epciAmount = parseAmount(input.epciAmount);
    const teom = parseAmount(input.teom);
    const previous = parseAmount(input.previous);
    const result = { total, base, communeAmount, epciAmount, teom, previous, items: [] };

    if (previous !== null) {
      const delta = total - previous;
      result.items.push({
        title: "Évolution par rapport à l’année précédente",
        text: (delta > 0 ? "Hausse de " : delta < 0 ? "Baisse de " : "Montant stable : ") +
          (delta === 0 ? money.format(total) : money.format(Math.abs(delta))) +
          (previous > 0 ? " (" + (delta > 0 ? "+" : delta < 0 ? "−" : "") + percent.format(Math.abs(delta) / previous * 100) + " %)." : "."),
        note: "Cette variation peut venir du taux, de la base cadastrale, des exonérations ou des taxes annexes. Elle ne permet pas d’attribuer la hausse à la seule commune."
      });
    }

    if (communeAmount !== null && total > 0) {
      result.items.push({
        title: "Part communale déclarée",
        text: percent.format(communeAmount / total * 100) + " % du montant total (" + money.format(communeAmount) + ").",
        note: "Il s’agit du montant saisi depuis votre avis, pas d’une estimation du taux communal."
      });
    }

    const parts = [communeAmount, epciAmount, teom].filter((v) => v !== null);
    if (parts.length >= 2) {
      const known = parts.reduce((sum, value) => sum + value, 0);
      const difference = total - known;
      result.items.push({
        title: "Rapprochement des montants saisis",
        text: "Total des postes renseignés : " + money.format(known) + ". Écart avec le total à payer : " + money.format(difference) + ".",
        note: difference > 1 ? "D’autres lignes, frais ou parts peuvent rester à renseigner." : difference < -1 ? "Les postes saisis dépassent le total : vérifiez qu’ils correspondent tous au même avis et au même périmètre." : "Les postes renseignés sont proches du total déclaré, à l’arrondi près."
      });
    }

    if (base !== null && base > 0 && communeAmount !== null) {
      result.effectiveCommuneRate = communeAmount / base * 100;
      result.items.push({
        title: "Taux effectif calculé à partir de votre avis",
        text: percent.format(result.effectiveCommuneRate) + " % (cotisation communale saisie ÷ base nette imposable × 100).",
        note: "Ce taux effectif peut différer du taux voté, notamment en raison des mécanismes de calcul et des bases fiscales. Il sert à repérer un écart à vérifier, pas à établir une erreur."
      });
    }

    if (base !== null && base > 0 && rates && rates.global && Number.isFinite(rates.global.tfb)) {
      result.officialGlobalRate = rates.global.tfb;
      result.estimatedGlobal = base * rates.global.tfb / 100;
      result.items.push({
        title: "Contrôle indicatif avec le taux global publié",
        text: "Base saisie × taux global DGFiP (" + percent.format(rates.global.tfb) + " %) = " + money.format(result.estimatedGlobal) + ", hors TEOM et autres ajustements.",
        note: "Cette estimation n’est comparable à votre cotisation que si l’année de l’avis (" + input.year + ") correspond à l’année des taux publiés (" + (rates.year || "inconnue") + "). Elle ne reproduit pas tous les mécanismes fiscaux."
      });
      const communeRow = Array.isArray(rates.rows) ? rates.rows.find((row) => /Commune \(taux voté\)/i.test(row.label)) : null;
      if (communeRow && Number.isFinite(communeRow.tfb)) {
        result.officialCommuneRate = communeRow.tfb;
        result.estimatedCommune = base * communeRow.tfb / 100;
      }
    }

    result.rateYear = rates && rates.year ? String(rates.year) : null;
    result.yearMatches = result.rateYear !== null && String(input.year) === result.rateYear;
    return result;
  }

  function renderResult(container, result, commune, rates, year) {
    container.replaceChildren();
    const heading = document.createElement("h4");
    heading.textContent = "Résultat de votre analyse";
    container.appendChild(heading);
    if (result.error) {
      const p = document.createElement("p");
      p.textContent = result.error;
      container.appendChild(p);
      container.hidden = false;
      return;
    }

    const lead = document.createElement("p");
    lead.textContent = "Montant total saisi : " + money.format(result.total) + (commune ? " · " + commune.nom + " (" + commune.code + ")" : " · aucune commune sélectionnée") + ".";
    container.appendChild(lead);

    if (result.items.length) {
      const list = document.createElement("ul");
      result.items.forEach((item) => {
        const li = document.createElement("li");
        const strong = document.createElement("strong");
        strong.textContent = item.title + " : ";
        li.appendChild(strong);
        li.appendChild(document.createTextNode(item.text));
        const note = document.createElement("p");
        note.className = "tax-result-note";
        note.textContent = item.note;
        li.appendChild(note);
        list.appendChild(li);
      });
      container.appendChild(list);
    } else {
      const p = document.createElement("p");
      p.textContent = "Avec le seul montant total, il est impossible de comparer votre taxe de façon fiable. Ajoutez la base nette imposable et, si possible, le détail des cotisations.";
      container.appendChild(p);
    }

    if (!commune) {
      const p = document.createElement("p");
      p.className = "tax-result-alert";
      p.textContent = "Aucune commune n’est sélectionnée. Choisissez-la dans la recherche en haut de page pour rapprocher l’avis des taux officiels.";
      container.appendChild(p);
    } else if (!rates) {
      const p = document.createElement("p");
      p.className = "tax-result-alert";
      p.textContent = "Les taux officiels de cette commune ne sont pas encore disponibles. Les calculs issus des montants saisis restent consultables, mais aucun rapprochement fiscal n’est produit.";
      container.appendChild(p);
    } else if (!result.yearMatches) {
      const p = document.createElement("p");
      p.className = "tax-result-alert";
      p.textContent = "Attention : l’avis choisi porte sur " + year + ", alors que les taux disponibles sont ceux de " + (rates.year || "l’année non identifiée") + ". Les taux ne sont pas comparables tels quels.";
      container.appendChild(p);
    } else if (result.officialCommuneRate !== undefined && result.estimatedCommune !== undefined) {
      const p = document.createElement("p");
      p.className = "tax-result-note";
      p.textContent = "Contrôle communal pour la même année : taux voté DGFiP " + percent.format(result.officialCommuneRate) + " %, soit une estimation simple de " + money.format(result.estimatedCommune) + " sur la base saisie. Votre cotisation déclarée est " + (result.communeAmount === null ? "non renseignée" : money.format(result.communeAmount)) + ". Un écart ne prouve pas une erreur fiscale : vérifiez la base et le détail de l’avis.";
      container.appendChild(p);
    }

    const conclusion = document.createElement("p");
    conclusion.className = "tax-result-note";
    conclusion.textContent = "Conclusion : cette analyse contrôle les montants et les taux disponibles, mais ne qualifie pas votre taxe de « normale » ou « excessive » sans comparaison de biens réellement comparables et de bases cadastrales. Les finances de la commune sont visibles dans la section « Analyse détaillée » ; elles ne suffisent pas à expliquer seules le montant de votre avis.";
    container.appendChild(conclusion);

    const link = document.createElement("a");
    link.href = "https://data.economie.gouv.fr/explore/dataset/fiscalite-locale-des-particuliers/";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Source officielle DGFiP : taux de fiscalité locale des particuliers ↗";
    container.appendChild(link);
    container.hidden = false;
  }

  function init() {
    const form = document.getElementById("personal-tax-form");
    const result = document.getElementById("personal-tax-result");
    if (!form || !result) return;
    let commune = null;
    let rates = null;
    const communeName = document.getElementById("personal-tax-commune");
    const communeStatus = document.getElementById("personal-tax-commune-status");
    const rateYear = document.getElementById("personal-tax-rate-year");

    window.addEventListener("citoyen:commune-selected", (event) => {
      commune = event.detail && event.detail.commune ? event.detail.commune : null;
      rates = null;
      if (communeName) communeName.textContent = commune ? commune.nom + " (" + commune.code + ")" : "Aucune commune sélectionnée";
      if (communeStatus) communeStatus.textContent = commune ? "Commune sélectionnée" : "Choisissez d’abord une commune";
      if (rateYear) rateYear.textContent = "Chargement des taux DGFiP…";
      if (!result.hidden) {
        const p = document.createElement("p");
        p.className = "tax-result-note";
        p.textContent = "La commune a changé. Relancez l’analyse pour utiliser les nouveaux taux.";
        result.appendChild(p);
      }
    });

    window.addEventListener("citoyen:tax-rates-loaded", (event) => {
      const detail = event.detail || {};
      if (!commune || !detail.commune || detail.commune.code !== commune.code) return;
      rates = detail.rates || null;
      if (rateYear) rateYear.textContent = rates && rates.year
        ? "Dernière année de taux disponible : " + rates.year + (rates.global && Number.isFinite(rates.global.tfb) ? " · taux global bâti : " + percent.format(rates.global.tfb) + " %" : "")
        : "Aucun taux officiel disponible.";
      if (communeStatus) communeStatus.textContent = rates ? "Taux officiels chargés" : "Taux indisponibles";
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const input = {
        year: document.getElementById("personal-tax-year").value,
        total: document.getElementById("personal-tax-total").value,
        base: document.getElementById("personal-tax-base").value,
        communeAmount: document.getElementById("personal-tax-commune-amount").value,
        epciAmount: document.getElementById("personal-tax-epci-amount").value,
        teom: document.getElementById("personal-tax-teom").value,
        previous: document.getElementById("personal-tax-previous").value
      };
      const calculated = calculate(input, rates);
      renderResult(result, calculated, commune, rates, input.year);
    });
  }

  if (typeof module === "object" && module.exports) module.exports = { parseAmount, calculate };
  if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", init);
})();
