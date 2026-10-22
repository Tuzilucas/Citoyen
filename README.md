# Information citoyenne — site public

Ce dépôt contient la version web publique de l’Observatoire citoyen : interface HTML/CSS/JavaScript et jeux de données affichés. Le dépôt de développement reste séparé et privé.

## Direction visuelle

L’interface adopte une direction éditoriale : grille de publication, typographie à empattements pour les titres, séparateurs francs et annotations proches des données. Elle évite les tableaux de bord génériques et conserve les états de validation explicites. Le brief réutilisable est documenté dans le dépôt privé STRUCTURE-PROJET, sous `03-ui/exemples/direction-artistique-information-citoyenne.md`.

## Chiffres disponibles

La publication INSEE du 29 septembre 2026 indique qu’au T2 2026 la dette publique brute atteint **3 595,5 Md€**, soit **119,0 % du PIB**. La dette publique nette s’établit à **3 366,8 Md€** (111,4 % du PIB). La dette brute augmente de **59,6 Md€** sur le trimestre ; la contribution de l’État progresse de 53,0 Md€, tandis que celle des administrations publiques locales baisse de 1,7 Md€. Ces chiffres sont transcrits de la publication officielle ; le rapprochement automatisé du fichier XLSX source reste à réaliser. Les données de détail sont dans `data/indicators/dette-publique-composition-2026-T2.json`.

## État du prototype

- Indicateur présenté : dette publique française au sens de Maastricht, par trimestre.
- Les sources et limites sont documentées dans `data/sources.json` et dans l’interface.
- La recherche de commune interroge le référentiel national geo.api.gouv.fr (nom, code postal ou code INSEE, Corse comprise) ; chaque commune est identifiée par son code INSEE. Les comptes sont ensuite demandés à l’API OFGL, mais les noms de champs utilisés n’ont pas encore été vérifiés contre le schéma officiel : les montants affichés sont marqués « non rapprochés » (voir `AUDIT-TECHNIQUE.md`).
- Les données financières de Fameck sont affichées comme repères retranscrits d’une source secondaire (FMPC), non encore rapprochés de l’OFGL : aucune valeur locale n’est présentée comme vérifiée.
- Le rapprochement automatique du fichier XLSX brut de l’INSEE reste à effectuer. Les chiffres affichés doivent donc être considérés comme un prototype tant que ce contrôle n’est pas terminé.

## Publication

Le site est statique et peut être publié avec GitHub Pages depuis la branche `main`, dossier `/` (root). Aucun backend ni secret n’est requis pour ce prototype.

Important : les fichiers HTML, CSS et JavaScript exécutés dans le navigateur sont nécessairement consultables par le public. Les secrets, clés privées, outils internes, tests et documentation de développement ne doivent pas être copiés dans ce dépôt public.

## Tests

Aucune étape de construction : le site reste un ensemble de fichiers statiques.

- `npm run test:unit` : fonctions pures de `assets/js/citoyen-lib.js` et cohérence des JSON (Node 22, aucune dépendance).
- `npm run test:e2e` : recette Playwright (320 à 1440 px). Le dépôt est servi par un serveur Node intégré ; geo.api.gouv.fr et data.ofgl.fr reçoivent des réponses **simulées** : ces tests vérifient le comportement du code, pas l’exactitude des données officielles.
- Le workflow `.github/workflows/tests.yml` lance les deux suites ; `npm install` est nécessaire pour Playwright.

Audit et plan de correction : `AUDIT-TECHNIQUE.md`.

## Sources

Les sources officielles et les limites de chaque série sont répertoriées dans `data/sources.json`.


## Premier jeu de données local : Fameck 2024

Le site affiche désormais des repères budgétaires du budget principal exécuté de Fameck pour 2024 : produits et charges de fonctionnement, résultat comptable, capacité d'autofinancement, emplois d'investissement, dette et fonds de roulement. La série 2019–2025 a été retranscrite depuis la page [FMPC consacrée aux chiffres clés de Fameck](https://www.fmpc.fr/finances-locales/index.php?ido=20758). Le jeu interne est disponible dans [fameck-finances-2024.json](data/indicators/fameck-finances-2024.json).

**Limite explicite :** le fichier brut officiel OFGL/DGFiP n'a pas encore été téléchargé et rapproché ligne à ligne. Les données sont donc marquées « à rapprocher » et les ratios calculés par le prototype restent indicatifs. Le budget principal ne doit pas être confondu avec les comptes consolidés incluant les budgets annexes.
