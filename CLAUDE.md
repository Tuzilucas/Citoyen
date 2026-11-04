# Citoyen — consignes pour Claude Code

Site public statique de l'Observatoire citoyen des finances publiques (HTML, CSS, JavaScript, jeux de données),
publié par GitHub Pages. Le développement de fond se fait dans le dépôt privé `Information-citoyenne`.

## Règles
- Dépôt **public** : aucun secret, outil interne ni document de travail.
- Ne jamais inventer un chiffre, une source ou une date ; un chiffre affiché cite sa source et sa date
  (mêmes règles que `Information-citoyenne/CLAUDE.md`).
- Aucun verdict « normal » ou « excessif » sur une taxe ; les montants saisis par l'utilisateur restent dans le navigateur.

## Commandes
- `npm run check` : tests unitaires (fonctions pures, cohérence des JSON).
- `npm run verifier` : tests unitaires et recette Playwright de 320 à 1440 px (`npm install` d'abord).

## Socle commun (STRUCTURE-PROJET)

- Ce projet suit le socle de `Tuzilucas/STRUCTURE-PROJET` : version et modèle dans `.claude/socle.json` (modèle : `plateforme-info`, dossier du moule : à créer (plateforme d'information sourcée)).
- Vérifier : `npm run check` (rapide) ; `npm run verifier` avant chaque poussée (crochet `.githooks/pre-push`, installé par `npm install`). Tout projet se valide aussi par `livraison-coordonnee` (`node scripts/valider.mjs <dossier>`).
- Incident : skill `incident-triage` (reproduction, test de non-régression, ligne dans `ERROR_LOG.md`).
- Amélioration réutilisable : skill `feed-structure`, qui la reverse en version générique dans STRUCTURE-PROJET (Pull Request).
- Relecture de sécurité : agent `security-reviewer`.
