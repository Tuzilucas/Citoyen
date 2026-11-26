#!/usr/bin/env node
// carte.mjs — une carte (CARTE.md) dans chaque dossier d'un dépôt : rôle du dossier, sous-dossiers, fichiers, chacun
// avec une ligne de description, et des liens vers le parent et la racine. La carte racine montre toute l'arborescence.
// Node ≥ 20, aucune dépendance. Voir README.md.
//
//   node carte.mjs [racine]               crée ou met à jour toutes les cartes
//   node carte.mjs [racine] --verifier    n'écrit rien ; code 1 si une carte manque ou est périmée
//   node carte.mjs [racine] --verifier --strict   code 1 aussi s'il reste des rôles ou descriptions « À décrire »
//
// Ce qui est écrit à la main (rôle d'un dossier, description d'un fichier) n'est jamais écrasé. Les descriptions
// extraites automatiquement de l'en-tête des fichiers portent le marqueur invisible <!--a--> et sont recalculées.
import { execFileSync } from "node:child_process";
import { existsSync, openSync, readSync, closeSync, readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, posix, resolve } from "node:path";

export const NOM_PAR_DEFAUT = "CARTE.md";
export const A_DECRIRE = "_À décrire._";
const AUTO = "<!--a-->";
const IGNORER_DEFAUT = [".git", "node_modules", ".godot", "__pycache__", ".next", ".gradle", ".venv", "coverage", ".import"];
// Dossiers où un fichier en plus casserait quelque chose, décrits depuis leur parent (aucun fichier n'y est ajouté) :
// ressources Android (aapt refuse tout fichier inconnu) ; dossiers lus par Claude Code (un .md dans agents/ ou
// commands/ deviendrait un agent ou une commande « CARTE » ; .claude/ et skills/ par prudence).
const DEPUIS_PARENT_DEFAUT = ["**/src/*/res", ".claude", "agents", "commands", "skills"];
const MAX_DESC = 160;

// ——— Configuration ———
export function lireConfig(racine) {
  const p = join(racine, "carte.json");
  const c = existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : {};
  return {
    nom: c.nom || NOM_PAR_DEFAUT,
    ignorer: [...IGNORER_DEFAUT, ...(c.ignorer || [])],
    depuisParent: [...DEPUIS_PARENT_DEFAUT, ...(c.decrire_depuis_parent || [])],
    racineSeulement: c.racine_seulement === true, // dépôt généré (site construit) : une seule carte, à la racine
  };
}

// Motif simple : « ** » = n'importe quels dossiers, « * » = un nom de dossier ; sans « / », le motif vise un nom.
export function correspond(chemin, motif) {
  if (!motif.includes("/")) return chemin.split("/").includes(motif);
  const re = new RegExp(
    "^" + motif.split("/").map((s) => (s === "**" ? "(?:.+/)?" : s.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*") + "/")).join("").replace(/\/$/, "") + "(?:/.*)?$",
  );
  return re.test(chemin);
}

// ——— Inventaire ———
export function listerFichiers(racine, cfg) {
  let fichiers;
  try {
    const sortie = execFileSync("git", ["-C", racine, "ls-files", "-co", "--exclude-standard", "-z"], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
    fichiers = sortie.split("\0").filter(Boolean).filter((f) => existsSync(join(racine, f)));
  } catch {
    fichiers = [];
    const parcourir = (rel) => {
      for (const e of readdirSync(join(racine, rel), { withFileTypes: true })) {
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) parcourir(r);
        else fichiers.push(r);
      }
    };
    parcourir("");
  }
  return fichiers
    .filter((f) => posix.basename(f) !== cfg.nom)
    .filter((f) => !cfg.ignorer.some((m) => correspond(posix.dirname(f) === "." ? "" : posix.dirname(f), m) || correspond(f, m)))
    .sort();
}

// ——— Descriptions automatiques (en-tête des fichiers) ———
const TYPES = {
  png: "Image PNG", jpg: "Image JPEG", jpeg: "Image JPEG", webp: "Image WebP", gif: "Image GIF", svg: "Image SVG",
  ico: "Icône", glb: "Modèle 3D (glTF binaire)", gltf: "Modèle 3D (glTF)", obj: "Modèle 3D (OBJ)", fbx: "Modèle 3D (FBX)",
  ogg: "Son (OGG)", wav: "Son (WAV)", mp3: "Son (MP3)", mp4: "Vidéo (MP4)", webm: "Vidéo (WebM)",
  ttf: "Police", otf: "Police", woff: "Police web", woff2: "Police web", pdf: "Document PDF", zip: "Archive ZIP",
  apk: "Application Android (APK)", pck: "Paquet de jeu Godot", wasm: "Code WebAssembly", jar: "Archive Java",
  tscn: "Scène Godot", tres: "Ressource Godot", import: "Réglages d'import Godot", uid: "Identifiant de ressource Godot",
  xlsx: "Classeur Excel", xlsm: "Classeur Excel (macros)", docx: "Document Word", keystore: "Magasin de clés",
  lock: "Verrou de dépendances", bundle: "Sauvegarde Git (bundle)", bin: "Données binaires",
  prec: "Copie de secours de l'état précédent (écriture atomique)", jsonl: "Journal : une ligne JSON par événement",
  patch: "Correctif au format diff", diff: "Différences au format diff", keep: "Garde le dossier dans Git (vide)",
  gitkeep: "Garde le dossier dans Git (vide)",
};
const NOMS = {
  "package.json": null, "package-lock.json": "Versions exactes des dépendances npm (généré)",
  ".gitignore": "Fichiers que Git ignore", ".gitattributes": "Règles Git par type de fichier",
  ".editorconfig": "Règles d'éditeur (indentation, fins de ligne)", ".prettierrc.json": "Réglages Prettier (formatage)",
  ".nvmrc": "Version de Node.js attendue", LICENSE: "Licence", "ERROR_LOG.md": null, "CLAUDE.md": null, "AGENTS.md": null,
  "project.godot": "Projet Godot (réglages du moteur)", "gradlew": "Lanceur Gradle", "gradle.properties": "Réglages Gradle",
  "build.gradle.kts": "Construction Gradle du module (dépendances, version, réglages Android)",
  "settings.gradle.kts": "Modules et dépôts du projet Gradle", "Dockerfile": "Image Docker",
  "pre-push": "Crochet Git lancé avant chaque poussée (vérification)",
  ".nojekyll": "Désactive Jekyll sur GitHub Pages : les fichiers sont servis tels quels",
  ".env.example": "Modèle des variables d'environnement (sans aucun secret)", ".npmrc": "Réglages npm du projet",
  ".prettierignore": "Fichiers exclus du formatage Prettier", ".eslintignore": "Fichiers exclus du contrôle ESLint",
  "eslint.config.mjs": "Règles ESLint (contrôle du code)", "eslint.config.js": "Règles ESLint (contrôle du code)",
  "postcss.config.mjs": "Réglages PostCSS (traitement des styles)", "tailwind.config.ts": "Réglages Tailwind CSS",
  "vitest.config.ts": "Réglages Vitest (tests)", "vitest.config.mjs": "Réglages Vitest (tests)",
  "vite.config.ts": "Réglages Vite (construction et serveur de développement)", "tsconfig.json": "Réglages TypeScript",
  "playwright.config.ts": "Réglages Playwright (tests dans un vrai navigateur)", "next.config.ts": "Réglages Next.js",
  "next.config.mjs": "Réglages Next.js", "next-env.d.ts": "Types Next.js (généré)", "wrangler.toml": "Réglages Cloudflare (Wrangler)",
  "_headers": "En-têtes HTTP servis par l'hébergeur (sécurité, cache)", "_redirects": "Redirections servies par l'hébergeur",
  "page.tsx": "Page de cette adresse (Next.js)", "layout.tsx": "Mise en page commune des pages de ce dossier (Next.js)",
  "route.ts": "Gestionnaire de route : produit le contenu servi à cette adresse (Next.js)", "not-found.tsx": "Page « introuvable » (404)",
  "error.tsx": "Page d'erreur (Next.js)", "loading.tsx": "Affichage pendant le chargement (Next.js)",
  "sitemap.ts": "Plan du site (sitemap.xml) généré", "robots.ts": "Règles pour les moteurs de recherche (robots.txt) générées",
  "globals.css": "Styles globaux du site", "manifest.ts": "Manifeste de l'application web (généré)", "export_presets.cfg": "Préréglages d'export Godot (web, Android, ordinateur)", "pre-commit": "Crochet Git lancé avant chaque commit",
};

function lireDebut(chemin, octets = 4096) {
  const fd = openSync(chemin, "r");
  try {
    const b = Buffer.alloc(octets);
    const n = readSync(fd, b, 0, octets, 0);
    return b.subarray(0, n);
  } finally {
    closeSync(fd);
  }
}

const nettoyer = (s) => {
  s = s.replace(/\s+/g, " ").replace(/\|/g, "\\|").trim();
  return s.length > MAX_DESC ? s.slice(0, MAX_DESC - 1).trimEnd() + "…" : s;
};

function commentairesDeTete(lignes, prefixes) {
  const out = [];
  for (const brut of lignes) {
    const l = brut.trim();
    if (!out.length && (l === "" || l.startsWith("#!") || /coding[:=]/.test(l) || l === "\"use strict\";" || l === "'use strict';" || /^@?tool$/.test(l) || /^(extends|class_name|package|import|declare|@echo|setlocal|using|namespace)\b/.test(l))) continue;
    const p = prefixes.find((x) => l.startsWith(x));
    if (!p) break;
    const t = l.slice(p.length).replace(/^[-=#*/!\s]+/, "").trim();
    if (t) out.push(t);
    else if (out.length) break;
    if (out.join(" ").length > MAX_DESC) break;
  }
  return out.join(" ");
}

export function decrireAuto(racine, rel) {
  const nom = posix.basename(rel);
  const essai = nom.match(/^(.+?)(?:Instrumented)?Tests?\.(kt|java|swift|cs)$/) || nom.match(/^(.+?)[._-](test|spec)\.[cm]?[jt]sx?$/) || nom.match(/^test_(.+)\.py$/);
  if (essai) {
    const d = (() => { try { return decrireDepuisTete(racine, rel, nom); } catch { return ""; } })();
    return d || `Tests de ${essai[1]}`;
  }
  return decrireDepuisTete(racine, rel, nom);
}

function decrireDepuisTete(racine, rel, nom) {
  const ext = nom.includes(".") ? nom.split(".").pop().toLowerCase() : "";
  if (nom in NOMS && NOMS[nom]) return NOMS[nom];
  let tete;
  try {
    tete = lireDebut(join(racine, rel));
  } catch {
    return "";
  }
  if (TYPES[ext]) return TYPES[ext]; // type connu (image, son, modèle, scène Godot…) : le type suffit
  if (tete.includes(0)) return "Fichier binaire";
  const texte = tete.toString("utf8");
  const lignes = texte.split(/\r?\n/);
  try {
    if (nom === "package.json" || ext === "json") {
      const m = texte.match(/"description"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      if (m) return nettoyer(m[1]);
      return nom === "package.json" ? "Paquet npm (scripts et dépendances)" : "Données JSON";
    }
    if (["md", "markdown"].includes(ext)) {
      const fm = texte.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      const dsc = fm && fm[1].match(/^description:\s*(.+)$/m);
      if (dsc) return nettoyer(dsc[1].replace(/^["']|["']$/g, ""));
      const t = lignes.find((l) => /^#\s+\S/.test(l));
      if (t) return nettoyer(t.replace(/^#\s+/, ""));
      const p = lignes.find((l) => l.trim() && !l.startsWith("<!--") && !l.startsWith("---"));
      return p ? nettoyer(p) : "";
    }
    if (ext === "sql") {
      const c = commentairesDeTete(lignes, ["--"]);
      return nettoyer(c || "Script SQL");
    }
    if (["xml", "plist", "xaml"].includes(ext)) {
      const c = texte.match(/<!--\s*([\s\S]*?)\s*-->/);
      if (c && texte.indexOf(c[0]) < (texte.search(/<[A-Za-z]/) + 1 || Infinity)) return nettoyer(c[1]);
      const r = texte.replace(/<\?[\s\S]*?\?>/g, "").match(/<([A-Za-z][\w:.-]*)/);
      if (nom === "AndroidManifest.xml") return "Manifeste Android (permissions, activités)";
      return r ? `Fichier XML (<${r[1]}>)` : "Fichier XML";
    }
    if (["html", "htm"].includes(ext)) {
      const m = texte.match(/<title[^>]*>([^<]+)<\/title>/i);
      return m ? nettoyer("Page « " + m[1].trim() + " »") : "Page HTML";
    }
    if (ext === "py") {
      const sans = lignes.filter((l) => !l.startsWith("#!") && !/coding[:=]/.test(l)).join("\n").trimStart();
      const m = sans.match(/^(?:"""|''')\s*([\s\S]*?)(?:"""|'''|\n\s*\n)/);
      if (m) return nettoyer(m[1].split(/\n\s*\n/)[0]);
      return nettoyer(commentairesDeTete(lignes, ["#"]));
    }
    if (["yml", "yaml"].includes(ext)) {
      const c = commentairesDeTete(lignes, ["#"]);
      const n = lignes.find((l) => /^name:\s*\S/.test(l));
      return nettoyer(c || (n ? "Workflow « " + n.replace(/^name:\s*/, "").replace(/^["']|["']$/g, "") + " »" : ""));
    }
    if (ext === "gd") return nettoyer(commentairesDeTete(lignes, ["##", "#"]));
    if (["tsx", "jsx", "vue", "svelte"].includes(ext) && /(^|\/)components\//.test(rel)) {
      const c = commentairesDeTete(lignes, ["///", "//", "/**", "/*", "*"]);
      return nettoyer(c || "Composant d'interface « " + nom.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ") + " »");
    }
    if (["js", "mjs", "cjs", "ts", "tsx", "jsx", "kt", "kts", "java", "cs", "swift", "go", "rs", "c", "h", "cpp", "css", "scss", "gdshader", "shader", "glsl"].includes(ext)) {
      const c = commentairesDeTete(lignes, ["///", "//", "/**", "/*", "*"]);
      return nettoyer(c);
    }
    if (["sh", "bash", "ps1", "toml", "cfg", "ini", "txt", "conf", "env", "properties", "bat", "cmd", "r", "rb", "pl"].includes(ext) || !ext) {
      const c = commentairesDeTete(lignes, ["#", "::", "REM ", "<#", ";"]);
      if (c) return nettoyer(c);
      if (ext === "txt") return nettoyer(lignes.find((l) => l.trim()) || "");
      return "";
    }
  } catch {
    return "";
  }
  return "";
}

// ——— Lecture d'une carte existante (ce qui a été écrit à la main) ———
export function lireCarte(texte) {
  const res = { role: "", descriptions: new Map() };
  if (!texte) return res;
  const m = texte.match(/^## Rôle\s*\n([\s\S]*?)(?=^## |\n<!-- carte:fin)/m);
  if (m) res.role = m[1].trim();
  for (const l of texte.split("\n")) {
    const r = l.match(/^\|\s*(?:\[`?([^`\]]+)`?\]\([^)]*\)|`([^`]+)`)\s*\|\s*(.*?)\s*\|\s*$/);
    if (r) res.descriptions.set(r[1] || r[2], r[3]);
  }
  return res;
}

const estAuto = (d) => d.endsWith(AUTO);
const estVide = (d) => !d || d === A_DECRIRE || d === AUTO;

function premierParagrapheReadme(racine, dossier) {
  const p = join(racine, dossier, "README.md");
  if (!existsSync(p)) return "";
  const lignes = readFileSync(p, "utf8").split(/\r?\n/);
  let para = [];
  for (const l of lignes) {
    const t = l.trim();
    if (!t) {
      if (para.length) break;
      continue;
    }
    if (t.startsWith("#") || t.startsWith("<!--") || t.startsWith("![") || t.startsWith("[![") || t.startsWith("|") || t.startsWith("```")) {
      if (para.length) break;
      continue;
    }
    para.push(t.replace(/^>\s*/, ""));
  }
  return nettoyer(para.join(" "));
}

// Rôle d'un dossier sans README : description de son SKILL.md, sinon rôle conventionnel d'après son nom.
const ROLES_CONVENTIONNELS = [
  [/(^|\/)tests?\/(unit|unitaires?)$/, "Tests unitaires (fonctions pures)."],
  [/(^|\/)tests?\/(integration|integ)$/, "Tests d'intégration."],
  [/(^|\/)tests?\/(e2e|bout-en-bout)$/, "Tests de bout en bout dans un vrai navigateur."],
  [/(^|\/)(fixtures|donnees-de-test)$/, "Jeux de données de test (fixtures)."],
  [/(^|\/)tests?\/(donnees|data)$/, "Données utilisées par les tests."],
  [/(^|\/)tests?\/contrat$/, "Tests de contrat : comportement figé, tout écart doit être validé."],
  [/(^|\/)captures(\/[^/]+)*$/, "Captures d'écran (preuves visuelles)."],
  [/(^|\/)(polices?|fonts?)(\/[^/]+)*$/, "Polices de caractères (avec leur licence)."],
  [/(^|\/)(icones?|icons?)\/source$/, "Sources des icônes (avant export)."],
  [/(^|\/)assets\/css$/, "Feuilles de style."],
  [/(^|\/)assets\/js$/, "Scripts exécutés dans le navigateur."],
  [/(^|\/)assets\/([^/]+)$/, "Ressources « $2 » (modèles, textures, sons…) avec leur licence."],
  [/(^|\/)raw$/, "Données brutes telles que récupérées à la source (jamais modifiées à la main)."],
  [/(^|\/)raw\/([^/]+)\/([^/]+)$/, "Données brutes « $2 » : $3."],
  [/(^|\/)raw\/([^/]+)$/, "Données brutes : $2."],
  [/(^|\/)src\/app\/(.+\.[a-z]+)$/, "Route Next.js qui produit le fichier /$2."],
  [/(^|\/)src\/app\/(.+)$/, "Page /$2 du site (Next.js)."],
  [/(^|\/)src\/components$/, "Composants d'interface réutilisables."],
  [/(^|\/)controllers$/, "Contrôleurs : relient l'interface à la logique."],
  [/(^|\/)outils$/, "Outils (scripts de génération, de contrôle ou de maintenance)."],
  [/(^|\/)chantiers$/, "Chantiers en cours : notes et correctifs mis de côté."],
  [/(^|\/)releases$/, "Fiches de livraison : une par version publiée (commit, empreintes, preuves)."],
  [/(^|\/)audits?$/, "Audits datés et leurs constats."],
  [/(^|\/)(propositions)$/, "Propositions en attente de décision."],
  [/(^|\/)\.github\/workflows$/, "Workflows GitHub Actions : contrôles et publications automatiques."],
  [/(^|\/)\.github$/, "Configuration GitHub (workflows, modèles de PR)."],
  [/(^|\/)\.claude-plugin$/, "Manifeste du plugin Claude Code (nom, version, description)."],
  [/(^|\/)\.claude$/, "Configuration Claude Code du projet : skills, agents, règles et réglages."],
  [/(^|\/)\.githooks$/, "Crochets Git du projet (vérification avant chaque poussée)."],
  [/(^|\/)skills$/, "Skills Claude Code : une fiche (SKILL.md) par geste, chargée au moment où elle sert."],
  [/(^|\/)agents$/, "Sous-agents Claude Code : un fichier par rôle spécialisé."],
  [/(^|\/)commands$/, "Commandes slash de Claude Code (une par fichier)."],
  [/(^|\/)hooks$/, "Crochets (hooks) : actions déclenchées automatiquement autour des outils."],
  [/(^|\/)plugin$/, "Plugin Claude Code : manifeste, skills, agents et commandes."],
  [/(^|\/)(tests?|__tests__|spec)$/, "Tests automatisés."],
  [/(^|\/)docs?$/, "Documentation."],
  [/(^|\/)scripts$/, "Scripts d'outillage : vérification, construction, publication, maintenance."],
  [/(^|\/)src$/, "Code source."],
  [/(^|\/)src\/(main|test|androidTest)$/, "Ensemble de sources $2 (Gradle) : code, manifeste et ressources."],
  [/(^|\/)(assets|ressources|resources)$/, "Ressources (images, sons, modèles, polices…)."],
  [/(^|\/)(images|img|icons|icones)$/, "Images et icônes."],
  [/(^|\/)fonts?$/, "Polices de caractères."],
  [/(^|\/)data$/, "Données."],
  [/(^|\/)(lib|libs)$/, "Bibliothèque de fonctions partagées."],
  [/(^|\/)migrations$/, "Migrations de base de données (une par évolution du schéma, jamais modifiées après application)."],
  [/(^|\/)functions$/, "Fonctions serveur (exécutées par l'hébergeur à chaque requête)."],
  [/(^|\/)res\/values(-[\w-]+)?$/, "Ressources Android : textes, couleurs, dimensions et thèmes."],
  [/(^|\/)res\/drawable(-[\w-]+)?$/, "Ressources Android : images et dessins vectoriels."],
  [/(^|\/)res\/mipmap(-[\w-]+)?$/, "Ressources Android : icônes de l'application."],
  [/(^|\/)res\/layout(-[\w-]+)?$/, "Ressources Android : mises en page."],
  [/(^|\/)res\/xml$/, "Ressources Android : réglages en XML (sauvegarde, réseau, fournisseurs)."],
  [/(^|\/)res$/, "Ressources Android (textes, images, icônes, réglages) : aucun fichier étranger toléré ici."],
  [/(^|\/)template$/, "Squelette du projet : copié tel quel pour démarrer un nouveau projet de ce type."],
  [/(^|\/)app$/, "Module de l'application (code, ressources, construction)."],
  [/(^|\/)scenes$/, "Scènes Godot."],
  [/(^|\/)content$/, "Contenu éditorial (fichiers de données, sans code)."],
  [/(^|\/)(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})[^/]*$/, "Exécution horodatée du $2 à $3 h $4 (UTC) : rapport et journaux."],
  [/(^|\/)([^/]+?)-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})[^/]*$/, "Exécution horodatée ($2) du $3 à $4 h $5 (UTC) : rapport et journaux."],
  [/(^|\/)validations\/([^/]+)$/, "Rapports de validation du projet $2 (un dossier horodaté par passage)."],
  [/(^|\/)validations$/, "Rapports de validation, un dossier par projet."],
  [/(^|\/)missions\/(M-[\w-]+)$/, "Mission $2 : demande, plan, tâches, preuves et rapport."],
  [/(^|\/)missions$/, "Missions tracées : un dossier par mission (demande, plan, preuves, rapport)."],
  [/(^|\/)preuves$/, "Preuves d'exécution : sorties de commandes et rapports de validation, horodatés."],
  [/(^|\/)livrables$/, "Livrables produits par la mission."],
];
function roleParDefaut(racine, dossier) {
  const skill = join(racine, dossier, "SKILL.md");
  if (existsSync(skill)) {
    const d = decrireAuto(racine, posix.join(dossier, "SKILL.md"));
    if (d) return "Skill : " + d;
  }
  const java = dossier.match(/(?:^|\/)src\/[^/]+\/(?:java|kotlin)\/(.+)$/);
  if (java) return `Paquet ${java[1].replace(/\//g, ".")} (code Kotlin ou Java).`;
  if (/(?:^|\/)src\/[^/]+\/(?:java|kotlin)$/.test(dossier)) return "Racine des paquets Kotlin ou Java.";
  for (const [re, role] of ROLES_CONVENTIONNELS) {
    const m = dossier.match(re);
    if (m) return role.replace(/\$(\d)/g, (_, i) => m[+i] || "");
  }
  return "";
}

const premierePhrase = (role) => {
  const t = role.replace(AUTO, "").replace(/\s+/g, " ").trim();
  if (!t || t === A_DECRIRE) return A_DECRIRE;
  const p = t.split(/(?<=[.!?])\s/)[0];
  return nettoyer(p);
};

function nomDepot(racine) {
  try {
    const url = execFileSync("git", ["-C", racine, "config", "--get", "remote.origin.url"], { encoding: "utf8" }).trim();
    if (url) return posix.basename(url.replace(/\/+$/, "")).replace(/\.git$/, "");
  } catch {
    /* pas de dépôt Git ou pas de remote : nom du dossier */
  }
  return posix.basename(resolve(racine));
}

// Cible de lien Markdown : espaces et parenthèses encodés (dossiers « appli android/ »).
const cible = (chemin) => chemin.split("/").map((s) => encodeURIComponent(s).replace(/%2E/g, ".")).join("/");

// ——— Construction ———
export function construire(racine, cfg = lireConfig(racine)) {
  const fichiers = listerFichiers(racine, cfg);
  const dossiers = new Set([""]);
  for (const f of fichiers) {
    let d = posix.dirname(f);
    while (d !== "." && d !== "") {
      dossiers.add(d);
      d = posix.dirname(d);
    }
  }
  const depuisParent = (d) => d !== "" && cfg.depuisParent.some((m) => correspond(d, m));
  const aCarte = (d) => (cfg.racineSeulement ? d === "" : !depuisParent(d));
  const enfants = new Map([...dossiers].map((d) => [d, { dossiers: [], fichiers: [] }]));
  for (const d of dossiers) if (d !== "") enfants.get(posix.dirname(d) === "." ? "" : posix.dirname(d)).dossiers.push(d);
  for (const f of fichiers) enfants.get(posix.dirname(f) === "." ? "" : posix.dirname(f)).fichiers.push(f);
  for (const v of enfants.values()) {
    v.dossiers.sort();
    v.fichiers.sort();
  }
  const anciennes = new Map();
  const lire = (d) => {
    if (!anciennes.has(d)) {
      const p = join(racine, d, cfg.nom);
      anciennes.set(d, lireCarte(existsSync(p) ? readFileSync(p, "utf8") : ""));
    }
    return anciennes.get(d);
  };
  const description = (porteur, cle, rel) => {
    const ancienne = lire(porteur).descriptions.get(cle) || "";
    if (!estVide(ancienne) && !estAuto(ancienne)) return ancienne;
    const auto = decrireAuto(racine, rel);
    return auto ? auto + AUTO : A_DECRIRE;
  };
  // Rôles, du plus profond au plus haut (un parent montre le rôle de ses sous-dossiers).
  const roles = new Map();
  const tri = [...dossiers].sort((a, b) => b.split("/").length - a.split("/").length);
  for (const d of tri) {
    let role = aCarte(d) ? lire(d).role : "";
    if (!aCarte(d)) {
      // Décrit par le parent : son rôle est dans la colonne du tableau du parent.
      let p = posix.dirname(d) === "." ? "" : posix.dirname(d);
      while (!aCarte(p)) p = posix.dirname(p) === "." ? "" : posix.dirname(p);
      role = lire(p).descriptions.get(posix.relative(p, d) + "/") || "";
      if (estVide(role) || estAuto(role)) role = "";
    }
    if (estVide(role) || (estAuto(role) && !role.replace(AUTO, "").trim())) role = "";
    if (!role || estAuto(role)) {
      const r = premierParagrapheReadme(racine, d) || roleParDefaut(racine, d);
      role = r ? nettoyer(r) + AUTO : A_DECRIRE;
    }
    roles.set(d, role);
  }
  const cartes = new Map();
  const lien = (de, vers) => {
    const r = posix.relative(de || ".", vers || ".") || ".";
    return r;
  };
  for (const d of dossiers) {
    if (!aCarte(d)) continue;
    const titre = d === "" ? nomDepot(racine) : d + "/";
    const l = [];
    l.push(`# ${titre} — carte du dossier`, "");
    const nav = [];
    if (d !== "") {
      let p = posix.dirname(d) === "." ? "" : posix.dirname(d);
      nav.push(`[↑ dossier parent](${cible(posix.join(lien(d, p), cfg.nom))})`);
      nav.push(`[⌂ racine](${cible(posix.join(lien(d, ""), cfg.nom))})`);
    }
    if (nav.length) l.push(nav.join(" · "), "");
    l.push("## Rôle", "", roles.get(d), "");
    // Sous-dossiers (avec ceux décrits ici même, sans carte propre)
    const sousTous = [];
    const descendre = (x) => {
      for (const s of enfants.get(x).dossiers) {
        if (aCarte(s) && !cfg.racineSeulement) sousTous.push({ s, carte: true });
        else {
          sousTous.push({ s, carte: false });
          descendre(s);
        }
      }
    };
    if (cfg.racineSeulement && d === "") {
      for (const s of enfants.get(d).dossiers) {
        sousTous.push({ s, carte: false });
        descendre(s);
      }
    } else descendre(d);
    const directs = sousTous.filter((x) => x.carte);
    if (directs.length) {
      l.push("## Sous-dossiers", "", "| Dossier | Rôle |", "|---|---|");
      for (const { s } of directs) l.push(`| [${posix.relative(d || ".", s)}/](${cible(posix.join(posix.relative(d || ".", s), cfg.nom))}) | ${premierePhrase(roles.get(s))} |`);
      l.push("");
    }
    const fichiersIci = enfants.get(d).fichiers;
    if (fichiersIci.length) {
      l.push("## Fichiers", "", "| Fichier | Description |", "|---|---|");
      for (const f of fichiersIci) l.push(`| \`${posix.basename(f)}\` | ${description(d, posix.basename(f), f)} |`);
      l.push("");
    }
    const sansCarte = sousTous.filter((x) => !x.carte);
    if (sansCarte.length) {
      l.push(
        "## Contenu décrit ici",
        "",
        "Ces dossiers n'ont pas de carte à eux (fichier en trop interdit ou dépôt généré) : leur contenu est décrit ci-dessous.",
        "",
        "| Élément | Description |",
        "|---|---|",
      );
      for (const { s } of sansCarte) {
        const cle = posix.relative(d || ".", s) + "/";
        const ancienne = lire(d).descriptions.get(cle) || "";
        let dsc = !estVide(ancienne) && !estAuto(ancienne) ? ancienne : "";
        if (!dsc) {
          const r = premierParagrapheReadme(racine, s) || roleParDefaut(racine, s);
          dsc = r ? nettoyer(r) + AUTO : A_DECRIRE;
        }
        l.push(`| \`${cle}\` | ${dsc} |`);
        for (const f of enfants.get(s).fichiers) {
          const c = posix.relative(d || ".", f);
          l.push(`| \`${c}\` | ${description(d, c, f)} |`);
        }
      }
      l.push("");
    }
    if (d === "" && !cfg.racineSeulement) {
      l.push("## Arborescence", "");
      const arbre = (x, prof) => {
        for (const s of enfants.get(x).dossiers) {
          if (!aCarte(s)) continue;
          l.push(`${"  ".repeat(prof)}- [${posix.basename(s)}/](${cible(posix.join(s, cfg.nom))}) — ${premierePhrase(roles.get(s))}`);
          arbre(s, prof + 1);
        }
      };
      arbre("", 0);
      l.push("");
    }
    l.push(
      `<!-- carte:fin — généré par carte.mjs (STRUCTURE-PROJET/04-outillage/carte). Écrire à la main : le texte de « Rôle » et la colonne Description ; ne pas toucher au reste (recalculé). -->`,
      "",
    );
    cartes.set(d, l.join("\n").replace(/\n{3,}/g, "\n\n"));
  }
  return { cartes, fichiers, dossiers };
}

// Éléments à écrire à la main dans CETTE carte : son rôle et les descriptions de ses fichiers (les rôles des
// sous-dossiers recopiés dans les tableaux et l'arborescence se décrivent dans leur propre carte).
export function aDecrireDans(texte) {
  let n = 0;
  let section = "";
  for (const l of texte.split("\n")) {
    if (l.startsWith("## ")) section = l.slice(3).trim();
    else if (l.includes(A_DECRIRE) && (section === "Rôle" || section === "Fichiers" || section === "Contenu décrit ici")) n++;
  }
  return n;
}

export function analyser(racine, cfg = lireConfig(racine)) {
  const { cartes } = construire(racine, cfg);
  const perimees = [];
  let aDecrire = 0;
  const details = [];
  for (const [d, texte] of cartes) {
    const p = join(racine, d, cfg.nom);
    const actuel = existsSync(p) ? readFileSync(p, "utf8") : null;
    if (actuel !== texte) perimees.push(d || ".");
    const n = aDecrireDans(texte);
    if (n) {
      aDecrire += n;
      details.push(`${d || "."} (${n})`);
    }
  }
  return { cartes, perimees, aDecrire, details };
}

// ——— Ligne de commande ———
function principal(argv) {
  const args = argv.filter((a) => !a.startsWith("--"));
  const racine = resolve(args[0] || ".");
  if (!existsSync(racine) || !statSync(racine).isDirectory()) {
    console.error(`Dossier introuvable : ${racine}`);
    return 2;
  }
  const verifier = argv.includes("--verifier");
  const strict = argv.includes("--strict");
  const cfg = lireConfig(racine);
  const { cartes, perimees, aDecrire, details } = analyser(racine, cfg);
  if (!verifier) {
    for (const [d, texte] of cartes) writeFileSync(join(racine, d, cfg.nom), texte);
    console.log(`${cartes.size} carte(s) à jour ; ${perimees.length} créée(s) ou modifiée(s) ; ${aDecrire} élément(s) « À décrire ».`);
    if (details.length) console.log("À décrire : " + details.slice(0, 30).join(", ") + (details.length > 30 ? ", …" : ""));
    return 0;
  }
  if (perimees.length) {
    console.error(`Cartes manquantes ou périmées (${perimees.length}) : ${perimees.slice(0, 20).join(", ")}${perimees.length > 20 ? ", …" : ""}`);
    console.error("Corriger : node carte.mjs (puis décrire ce qui reste « À décrire »).");
    return 1;
  }
  if (aDecrire) {
    const msg = `${aDecrire} élément(s) « À décrire » : ${details.slice(0, 20).join(", ")}`;
    if (strict) {
      console.error(msg);
      return 1;
    }
    console.log("Avertissement : " + msg);
  }
  console.log(`${cartes.size} carte(s) à jour.`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  process.exit(principal(process.argv.slice(2)));
}
