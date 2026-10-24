# Information citoyenne — site public

Ce dépôt contient la version web publique de l’Observatoire citoyen : interface HTML/CSS/JavaScript et jeux de données affichés. Le dépôt de développement reste séparé et privé.

## Direction visuelle

L’interface adopte une direction éditoriale : grille de publication, typographie à empattements pour les titres, séparateurs francs et annotations proches des données. Elle évite les tableaux de bord génériques et conserve les états de validation explicites. Le brief réutilisable est documenté dans le dépôt privé STRUCTURE-PROJET, sous `03-ui/exemples/direction-artistique-information-citoyenne.md`.

## Chiffres disponibles

La publication INSEE du 29 septembre 2026 indique qu’au T2 2026 la dette publique brute atteint **3 595,5 Md€**, soit **119,0 % du PIB**. La dette publique nette s’établit à **3 366,8 Md€** (111,4 % du PIB). La dette brute augmente de **59,6 Md€** sur le trimestre ; la contribution de l’État progresse de 53,0 Md€, tandis que celle des administrations publiques locales baisse de 1,7 Md€. Ces chiffres sont transcrits de la publication officielle ; le rapprochement automatisé du fichier XLSX source reste à réaliser. Les données de détail sont dans `data/indicators/dette-publique-composition-2026-T2.json`.

## État du prototype

- Indicateur présenté : dette publique française au sens de Maastricht, par trimestre.
- Les sources et limites sont documentées dans `data/sources.json` et dans l’interface.
- La recherche de commune interroge le référentiel national geo.api.gouv.fr (nom, code postal ou code INSEE, Corse comprise) ; chaque commune est identifiée par son code INSEE. La requête OFGL utilise les champs documentés dans les exemples officiels indexés du jeu « Comptes des communes » : `com_code`, `exer`, `type_de_budget="Budget principal"`, `agregat`, `montant` et `euros_par_habitant`. Le test HTTP réel depuis le site déployé et le rapprochement ligne à ligne des montants restent à faire ; les données locales restent donc marquées « non rapprochées » (voir `AUDIT-TECHNIQUE.md`).
- La section locale n’est plus figée sur Fameck : elle se remplit avec la commune recherchée, présente les agrégats reconnus, calcule des ratios quand les données nécessaires sont disponibles, explique les indicateurs en langage courant et affiche une série annuelle. Les montants OFGL restent à rapprocher de la documentation officielle ; une donnée absente n’est jamais assimilée à zéro.
- Le rapprochement automatique du fichier XLSX brut de l’INSEE reste à effectuer. Les chiffres affichés doivent donc être considérés comme un prototype tant que ce contrôle n’est pas terminé.

## Publication

Les corrections d’interface et de navigation mobile sont intégrées à `main`. Le site statique est configuré pour GitHub Pages à l’adresse https://tuzilucas.github.io/Citoyen/ ; l’accès direct au site déployé n’a pas pu être vérifié depuis l’environnement d’audit. Aucun backend ni secret n’est requis pour ce prototype.

Important : les fichiers HTML, CSS et JavaScript exécutés dans le navigateur sont nécessairement consultables par le public. Les secrets, clés privées, outils internes, tests et documentation de développement ne doivent pas être copiés dans ce dépôt public.

## Analyse personnelle de la taxe foncière

Après avoir choisi une commune, l’outil « Comprendre ma taxe foncière » pré-remplit automatiquement les taux publics DGFiP disponibles et sélectionne l’année correspondante quand elle est proposée. L’utilisateur ne saisit que les données personnelles absentes des bases publiques : total à payer, base imposable et, facultativement, détail des cotisations et montant précédent. Les résultats se mettent à jour pendant la saisie. Il ne déclare jamais une taxe « normale » ou « excessive » à partir du seul montant : la base cadastrale, les caractéristiques du bien, la TEOM et les mécanismes fiscaux doivent être pris en compte. Les montants saisis restent dans le navigateur et ne sont pas envoyés par cet outil.

## Tests

Aucune étape de construction : le site reste un ensemble de fichiers statiques.

- `npm run test:unit` : fonctions pures de `assets/js/citoyen-lib.js` et cohérence des JSON (Node 22, aucune dépendance).
- `npm run test:e2e` : recette Playwright (320 à 1440 px). Le dépôt est servi par un serveur Node intégré ; geo.api.gouv.fr et data.ofgl.fr reçoivent des réponses **simulées** : ces tests vérifient le comportement du code, pas l’exactitude des données officielles.
- Le workflow `.github/workflows/tests.yml` est déclenchable **manuellement uniquement** (`workflow_dispatch`) : aucun test ne se lance automatiquement à chaque publication. Il n’a pas été lancé pendant cet audit afin de ne pas consommer de minutes GitHub Actions. `npm install` est nécessaire pour Playwright.

Audit et plan de correction : `AUDIT-TECHNIQUE.md`.

## Sources

Les sources officielles et les limites de chaque série sont répertoriées dans `data/sources.json`.


## Analyse territoriale dynamique

La recherche communale pilote désormais la section d’analyse locale : le titre, les indicateurs, les explications, les ratios et le tableau historique se mettent à jour après sélection de la commune. Les explications distinguent flux annuels et stocks, détaillent les formules et signalent les limites des comparaisons. La fiche de Fameck a servi de modèle : sa structure (indicateurs, ratios, série annuelle, provenance) est désormais produite pour **chacune des 34 875 communes** par une seule fonction, `buildCommuneDataset` (`assets/js/citoyen-lib.js`), à partir de l'API officielle de l'OFGL. La même fonction alimente l'écran, le bouton « Télécharger la fiche standard (JSON) » et le script `scripts/socle/fiche-commune.cjs <code INSEE>` (fiches de référence dans `data/communes/finances/`).

## Socle commun des territoires

`data/entities.json` et `data/entities/` décrivent toutes les communes de France avec la même structure : code INSEE, nom, département, région, codes postaux, intercommunalité de rattachement et population légale. Sources : INSEE (Code officiel géographique au 1er janvier 2026) et DGCL (composition des intercommunalités au 1er janvier 2026) ; codes postaux de geo.api.gouv.fr, pour la recherche seulement. Régénération : `python3 scripts/socle/construire-socle.py` (nécessite `openpyxl`). Le socle sert à afficher l'intercommunalité à jour, à rechercher une commune quand geo.api.gouv.fr ne répond pas, et à reconnaître n'importe quelle commune dans « Vérifier une affirmation ».

**Limite explicite :** le fonctionnement réel de l’API OFGL depuis le navigateur et le rapprochement des champs/montants avec les fiches méthodologiques doivent encore être validés. L’analyse ne doit pas être lue comme un audit certifié des comptes ni comme un jugement sur la gestion d’une équipe municipale.
