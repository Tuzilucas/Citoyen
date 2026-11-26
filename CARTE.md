# Citoyen — carte du dossier

## Rôle

Ce dépôt contient l’Observatoire citoyen : interface HTML/CSS/JavaScript, jeux de données affichés, scripts de construction du socle des communes et tests. Dep…<!--a-->

## Sous-dossiers

| Dossier | Rôle |
|---|---|
| [.github/](.github/CARTE.md) | Configuration GitHub (workflows, modèles de PR). |
| [assets/](assets/CARTE.md) | Ressources (images, sons, modèles, polices…). |
| [audit/](audit/CARTE.md) | Audits datés et leurs constats. |
| [data/](data/CARTE.md) | Données. |
| [scripts/](scripts/CARTE.md) | Scripts d'outillage : vérification, construction, publication, maintenance. |
| [tests/](tests/CARTE.md) | Tests automatisés. |

## Fichiers

| Fichier | Description |
|---|---|
| `.gitignore` | Fichiers que Git ignore<!--a--> |
| `.nojekyll` | Désactive Jekyll sur GitHub Pages : les fichiers sont servis tels quels<!--a--> |
| `AGENTS.md` | Consignes pour les assistants (ChatGPT, Codex, Claude…)<!--a--> |
| `AUDIT-TECHNIQUE.md` | Audit technique et fonctionnel — Information citoyenne<!--a--> |
| `LICENSE` | Licence<!--a--> |
| `README.md` | Information citoyenne — site public<!--a--> |
| `carte.json` | Données JSON<!--a--> |
| `index.html` | Page « Information citoyenne — Finances publiques, sources à l’appui »<!--a--> |
| `package.json` | Site statique Information citoyenne — tests uniquement (aucune étape de construction).<!--a--> |

## Arborescence

- [.github/](.github/CARTE.md) — Configuration GitHub (workflows, modèles de PR).
  - [workflows/](.github/workflows/CARTE.md) — Workflows GitHub Actions : contrôles et publications automatiques.
- [assets/](assets/CARTE.md) — Ressources (images, sons, modèles, polices…).
  - [css/](assets/css/CARTE.md) — Feuilles de style.
  - [img/](assets/img/CARTE.md) — Ressources « img » (modèles, textures, sons…) avec leur licence.
  - [js/](assets/js/CARTE.md) — Scripts exécutés dans le navigateur.
- [audit/](audit/CARTE.md) — Audits datés et leurs constats.
  - [captures/](audit/captures/CARTE.md) — Captures d'écran (preuves visuelles).
- [data/](data/CARTE.md) — Données.
- [scripts/](scripts/CARTE.md) — Scripts d'outillage : vérification, construction, publication, maintenance.
  - [socle/](scripts/socle/CARTE.md) — Construction du socle de données : fiches communes (fiche-commune.cjs) et assemblage (construire-socle.py).
- [tests/](tests/CARTE.md) — Tests automatisés.
  - [e2e/](tests/e2e/CARTE.md) — Tests de bout en bout dans un vrai navigateur.
  - [fixtures/](tests/fixtures/CARTE.md) — Jeux de données de test (fixtures).
  - [unit/](tests/unit/CARTE.md) — Tests unitaires (fonctions pures).

<!-- carte:fin — généré par carte.mjs (STRUCTURE-PROJET/04-outillage/carte). Écrire à la main : le texte de « Rôle » et la colonne Description ; ne pas toucher au reste (recalculé). -->
