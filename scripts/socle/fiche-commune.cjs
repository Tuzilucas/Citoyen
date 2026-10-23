#!/usr/bin/env node
// Produit la fiche financière standard (schéma de la fiche pilote de Fameck) d'une ou plusieurs
// communes, à partir du socle commun (data/entities/communes/<DEP>.json) et de l'API de l'OFGL.
// La même fonction (citoyen-lib.js, buildCommuneDataset) alimente le site : une seule règle pour
// toutes les communes.
//
// Usage : node scripts/socle/fiche-commune.cjs 57206 69123 …   → data/communes/finances/<code>.json
"use strict";
const fs = require("fs");
const path = require("path");
const lib = require("../../assets/js/citoyen-lib.js");

const ROOT = path.join(__dirname, "..", "..");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function socleCommune(code) {
  const dep = /^97/.test(code) ? code.slice(0, 3) : code.slice(0, 2);
  const file = path.join(ROOT, "data", "entities", "communes", dep + ".json");
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8")).entities.find((e) => e.entity_id === code) || null;
}

async function fetchJson(url, attempts = 12) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const r = await fetch(url);
      if (r.ok) return await r.json();
      if (r.status < 500) throw new Error("HTTP " + r.status);
    } catch (e) {
      if (i === attempts - 1) throw e;
    }
    await sleep(1500 + i * 1000);
  }
  throw new Error("Service injoignable : " + url);
}

async function fiche(code) {
  const entity = socleCommune(code);
  if (!entity) throw new Error(code + " : commune absente du socle commun (data/entities)");
  const rows = [];
  let total = null;
  for (let page = 0; page < lib.OFGL.maxPages; page += 1) {
    const payload = await fetchJson(lib.OFGL.endpoint + "?" + lib.buildOfglParams(code, page * lib.OFGL.pageSize));
    total = payload.total_count;
    rows.push(...payload.results);
    if (payload.results.length < lib.OFGL.pageSize || rows.length >= total) break;
  }
  const commune = { code, nom: entity.official_name, codesPostaux: entity.postal_codes, codeDepartement: entity.department_code };
  const dataset = lib.buildCommuneDataset(commune, rows, total, new Date().toISOString());
  if (!dataset) throw new Error(code + " : réponse OFGL incomplète, aucune fiche écrite");
  // Identité complète reprise du socle commun (même structure pour toutes les communes).
  dataset.entity = { ...dataset.entity, department_name: entity.department_name, region_code: entity.region_code, region_name: entity.region_name, parent_epci: entity.parent_epci, population_legale: entity.population, socle_source_id: entity.source_id };
  const out = path.join(ROOT, "data", "communes", "finances", code + ".json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(dataset, null, 2) + "\n");
  return out;
}

(async () => {
  const codes = process.argv.slice(2).map((c) => c.toUpperCase());
  if (!codes.length || !codes.every(lib.isInseeCode)) {
    console.error("Usage : node scripts/socle/fiche-commune.cjs <code INSEE> [<code INSEE> …]");
    process.exit(2);
  }
  for (const code of codes) console.log(await fiche(code));
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
