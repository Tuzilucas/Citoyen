const test = require("node:test");
const assert = require("node:assert/strict");
const { parseAmount, calculate } = require("../../assets/js/taxe-fonciere.js");

test("parseAmount accepts French decimal commas and preserves zero", () => {
  assert.equal(parseAmount("1 234,50"), 1234.5);
  assert.equal(parseAmount("0"), 0);
  assert.equal(parseAmount(""), null);
  assert.equal(parseAmount("-2"), null);
});

test("calculate compares only values provided and calculates the year change", () => {
  const result = calculate({ year: "2025", total: "1700", previous: "1578", base: "2000", communeAmount: "837", epciAmount: "120", teom: "300" }, {
    year: "2025", global: { tfb: 41.85 }, rows: [{ label: "Commune (taux voté)", tfb: 39.34 }]
  });
  assert.equal(result.total, 1700);
  assert.equal(result.estimatedCommune, 786.8);
  assert.equal(result.estimatedGlobal, 837);
  assert.equal(result.yearMatches, true);
  assert.ok(result.items.some((item) => item.title.includes("Évolution")));
});

test("calculate does not invent a comparison when tax base or rates are missing", () => {
  const result = calculate({ year: "2026", total: "1700", base: "", communeAmount: "", epciAmount: "", teom: "", previous: "" }, null);
  assert.equal(result.base, null);
  assert.equal(result.officialGlobalRate, undefined);
  assert.equal(result.items.length, 0);
});

test("invalid total is reported instead of treated as zero", () => {
  assert.equal(calculate({ total: "" }, null).error, "Saisissez un montant total valide.");
});

test("commune tax rates are displayed from the DGFiP payload and the year follows the source", () => {
  const source = require("fs").readFileSync(require("path").join(__dirname, "../../assets/js/taxe-fonciere.js"), "utf8");
  assert.match(source, /function showPublicRates\(\)/);
  assert.match(source, /Taux voté par la commune/);
  assert.match(source, /Taux global bâti/);
  assert.match(source, /rates\.teom/);
  assert.match(source, /yearSelect\.value = String\(rates\.year\)/);
});
