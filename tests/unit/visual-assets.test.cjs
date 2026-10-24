"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "assets/css/app.css"), "utf8");

test("les illustrations éditoriales locales sont présentes et référencées", () => {
  const expected = [
    "assets/img/illustration-hero.svg",
    "assets/img/illustration-commune.svg",
    "assets/img/illustration-france.svg",
    "assets/img/illustration-verification.svg"
  ];
  for (const relative of expected) {
    const absolute = path.join(root, relative);
    assert.ok(fs.existsSync(absolute), relative + " existe");
    assert.match(fs.readFileSync(absolute, "utf8"), /^<svg\\s/i, relative + " est un SVG");
    assert.ok(html.includes(relative), relative + " est intégré dans la page");
  }
  assert.match(html, /class="hero-visual"/);
  assert.match(html, /property="og:image"[^>]+illustration-hero\\.svg/);
});

test("les images secondaires sont différées et les images décoratives sont accessibles", () => {
  const tags = [...html.matchAll(/<img\\b[^>]*>/gs)].map((match) => match[0]);
  assert.ok(tags.length >= 5, "au moins cinq images sont intégrées");
  for (const tag of tags) {
    assert.match(tag, /\\balt=/, "chaque image possède un attribut alt");
  }
  for (const relative of ["illustration-commune.svg", "illustration-france.svg", "illustration-verification.svg"]) {
    const tag = tags.find((item) => item.includes(relative));
    assert.ok(tag, relative + " est référencée");
    assert.match(tag, /loading="lazy"/, relative + " est chargée en différé");
  }
});

test("la recherche communale reste ergonomique sur petit écran", () => {
  assert.match(css, /@media \\(max-width: 619px\\)[\\s\\S]*?\\.commune-search-row \\{\\s*flex-direction: column/s);
  assert.match(css, /\\.commune-search-row input,[\\s\\S]*?min-height: 3rem/);
});
