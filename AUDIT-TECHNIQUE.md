# Audit technique et fonctionnel — Information citoyenne

- **Date** : 22 octobre 2026
- **Objet** : site https://tuzilucas.github.io/Citoyen/ — dépôt `Tuzilucas/Citoyen`
- **Version auditée** : `main` au commit `230d34d` (« Fix literal newline in primary navigation »)
- **Branche de correction** : `ccr-8e430522-ifzcgl` (non fusionnée dans `main`)
- **Outils** : Chromium (Playwright 1.56.1) en mode headless, Node 22 (`node:test`), Python 3, inspection du code et de l’historique Git

---

## A. Résumé exécutif

### État global

Le site est un prototype soigné. Il est prudent sur la méthode : le statut « à rapprocher » est affiché partout et les données sont toujours insérées comme texte. **Mais la fonction centrale, l’affichage des comptes d’une commune quelconque via l’OFGL, ne peut pas être considérée comme fonctionnelle :**

1. **La requête OFGL dépasse très probablement la limite de l’API** (`limit=1000` alors qu’Opendatasoft Explore v2.1 plafonne à 100 lignes par appel). Elle utilise aussi des noms de champs (`code_type_budget`, `montant_hab`) qui n’ont jamais été vérifiés, et un indice officiel suggère qu’ils sont faux (API-01, API-02).
2. **Toute erreur de l’API est présentée comme une absence de données** : « Aucune ligne exploitable reçue pour 2024 ». Ce libellé est constaté au test et l’année y est codée en dur (API-03).
3. Le choix du « dernier exercice » est fait **sans vérifier que la réponse est complète** (API-04).

Il faut ajouter **un défaut visuel majeur** : la mise en page du bandeau de chiffres clés a été supprimée par erreur au commit `3dd3e51`. À toutes les largeurs, le bandeau est illisible (texte en ligne continue, contraste 1,87:1) (UI-01). **Le glossaire est en partie hors du filtre de recherche** : 10 définitions sur 48 ne sont ni filtrées ni comptées (GLO-01).

Les chiffres de Fameck sont **cohérents entre eux** : l’épargne brute, l’épargne nette, les ratios et les montants par habitant se recalculent à 1 € près. Ils proviennent toutefois **d’une source secondaire (FMPC) non rapprochée de l’OFGL** : leur exactitude officielle reste non démontrée (FAM-01).

### Limite majeure de cet audit : réseau

L’environnement d’exécution **refuse les connexions** vers `tuzilucas.github.io`, `data.ofgl.fr`, `geo.api.gouv.fr`, `www.insee.fr` et `www.fmpc.fr` : le proxy répond par un refus de politique réseau (HTTP 403 au `CONNECT`). En conséquence :

- **le site déployé n’a pas été ouvert**. Tous les tests navigateur portent sur le code du dépôt, servi localement ;
- **aucun appel réel à l’OFGL ni à geo.api.gouv.fr n’a été fait**. Les réponses de ces services ont été **simulées** pour tester le comportement du code. Les simulations sont nommées dans `tests/e2e/audit.spec.cjs` et ne valident aucune donnée ;
- **aucun montant n’a pu être rapproché d’une fiche officielle**, ni pour Fameck, ni pour Lyon, ni pour une petite commune.

La seule information obtenue sur l’OFGL vient d’une recherche web : titres et URL de pages `data.ofgl.fr` indexées. Elle est signalée comme telle. La procédure pour terminer l’audit hors de cet environnement figure en section E (étape 0).

### Niveau de confiance

| Domaine | Confiance | Justification |
|---|---|---|
| Interface, responsive, glossaire, accessibilité de base | **Élevée** | 58 tests navigateur exécutés avant correction (6 largeurs), 63 après, plus des captures |
| Cohérence interne des données Fameck | **Élevée** | Recalcul indépendant de chaque ligne (test unitaire) |
| Exactitude des chiffres Fameck par rapport à l’OFGL | **Nulle** | Source officielle inaccessible depuis l’environnement |
| Requête OFGL (champs, limite, libellés) | **Faible à moyenne** | Défauts établis par lecture du code ; noms de champs déduits d’indices indirects |
| Écart entre dépôt et site déployé | **Non évalué** | Site inaccessible |

### Décision à prendre avant fusion

Le `README.md` indique que « les tests et la documentation de développement ne doivent pas être copiés dans ce dépôt public ». Or la demande d’audit prévoit un rapport à la racine et une suite de tests. Ces fichiers ne contiennent aucun secret et ne sont pas utilisés par les pages. Ils sont donc **conservés sur la branche**, mais leur place définitive (dépôt public ou dépôt privé de développement) est **à arbitrer** avant la fusion.

---

## B. Tableau des anomalies

Légende du **statut de constat** :
- **Constaté** : reproduit par un test ou une capture ;
- **Code** : établi par lecture précise du code, sans exécution possible ;
- **À confirmer** : indice sérieux, preuve insuffisante.

La colonne **Correction** indique si la branche corrige l’anomalie. Une correction n’est dite « testée » que si son test a été exécuté avec succès.

### P0 — bloquant

| ID | Domaine | Emplacement | Reproduction | Attendu / observé | Preuve | Correction recommandée | Test de non-régression | Statut / correction |
|---|---|---|---|---|---|---|---|---|
| **API-01** | API, données | `assets/js/app.js:186` (main) : `where: 'com_code="…" AND code_type_budget=1'` ; `:237` : `row.montant_hab` | Rechercher « Fameck », observer la requête envoyée à `data.ofgl.fr` | Attendu : des champs qui existent dans `ofgl-base-communes`. Observé : noms jamais vérifiés. Une page OFGL indexée du même jeu filtre le budget avec **`refine.cbudg=1`** (et non `code_type_budget`) ; le jeu départemental OFGL expose **`euros_par_habitant`** (et non `montant_hab`). Si un champ du `where` n’existe pas, l’API Opendatasoft renvoie une erreur 400 pour **toutes** les communes. | URL envoyée (test COM-OFGL-REQ) : `where=com_code="57206" AND code_type_budget=1&limit=1000&order_by=exer DESC, agregat`. Indices : résultats de recherche web listant `data.ofgl.fr/explore/dataset/ofgl-base-communes/table/?…refine.cbudg=1…` et le schéma de `ofgl-base-departements-consolidee`. | Lire le schéma réel : `GET …/catalog/datasets/ofgl-base-communes` (liste `fields`). Corriger les noms dans **un seul endroit** (`OFGL.fields` de `citoyen-lib.js`). Vérifier la signification du code de budget principal. **Suspendre l’affichage des montants** tant que ce n’est pas fait. | Test d’intégration réel (hors CI) : la réponse pour 57206 contient uniquement `com_code=57206` et le budget principal ; test unitaire sur `buildOfglParams`. | **À confirmer**. Branche : champs centralisés et documentés ; montants marqués « non rapprochés ». **Noms de champs non modifiés**, faute de preuve. |
| **API-02** | API | `assets/js/app.js:187` (main) : `limit: "1000"` | Idem | Attendu : `limit` ≤ 100 (plafond documenté de l’API Explore v2.1 d’Opendatasoft, sur laquelle repose `data.ofgl.fr`). Observé : 1000, donc une erreur 400 attendue à chaque appel. Même si l’appel passait, aucune pagination n’existe. | Code. Comportement simulé avec une erreur 400 au format Opendatasoft (test COM-ERR-400). | Pages de 100 lignes avec `offset`, arrêt sur `total_count` ou sur une page incomplète, plafond de 20 pages. | COM-PAGINATION (150 lignes, donc 2 appels `limit=100`) ; unitaire `buildOfglParams`. | **Code + à confirmer** par appel réel. **Corrigé, testé sur simulation.** |
| **API-03** | API, interface | `assets/js/app.js:318-326` et `:246-250` (main) | Simuler une erreur 400 ou une réponse HTML (maintenance) de l’OFGL | Attendu : « service indisponible », distinct d’« aucune donnée ». Observé : **« Aucune ligne exploitable reçue pour 2024 »**. L’année est codée en dur alors que la requête porte sur toutes les années, et l’erreur est confondue avec une absence de données. | Tests COM-ERR-400 et COM-MALFORMED **ÉCHOUÉS** avant correction ; capture `audit/captures/avant-commune-erreur-400-390.png` | Distinguer erreur réseau, délai dépassé, code HTTP, format inattendu, absence de lignes et réponse incomplète. Ne jamais citer une année non issue de la réponse. | COM-ERR-400, COM-MALFORMED, COM-TRUNC | **Constaté. Corrigé et testé** (`audit/captures/apres-commune-erreur-400-390.png`). |

### P1 — élevé

| ID | Domaine | Emplacement | Reproduction | Attendu / observé | Preuve | Correction recommandée | Test | Statut / correction |
|---|---|---|---|---|---|---|---|---|
| **API-04** | Données, calculs | `app.js:217-219` (main) | Réponse OFGL annonçant 600 lignes, une seule reçue (2019) | Attendu : refuser de choisir un exercice si la réponse est tronquée. Observé : « Données OFGL reçues · exercice **2019** · budget principal ». | COM-TRUNC **ÉCHOUÉ** avant | Vérifier `total_count` et exclure les lignes d’un autre code INSEE **avant** de choisir l’exercice (`summarizeOfglRecords`). | COM-TRUNC ; unitaires « tronquée » et « autres communes » | **Constaté. Corrigé et testé.** |
| **API-05** | Données | `app.js:237` (main) | Réponse portant `euros_par_habitant` | Attendu : afficher le montant par habitant. Observé : rien, car seuls `montant_hab` et `montant_eur_par_habitant` sont lus. | COM-PERCAPITA **ÉCHOUÉ** | Lire le nom réel (API-01) ; repli ajouté sur `euros_par_habitant`. | COM-PERCAPITA ; unitaire `pickPerCapita` | **Constaté sur simulation. Corrigé.** Nom réel à confirmer. |
| **API-06** | Données | `app.js:226-229` (main) | — | Attendu : libellés d’agrégats identiques à ceux de l’OFGL. Observé : liste écrite à la main (« Epargne brute » sans accent, apostrophe droite) ; la comparaison ne neutralise que la casse. Si aucun libellé ne correspond, **les 8 premières lignes reçues** s’affichent, sans le signaler. | Code | Relever les libellés réels (`GET …/records?group_by=agregat`) ; comparaison sans accents ni apostrophes typographiques ; signaler le repli. | Unitaire `selectPriorityAggregates` | **Code. Normalisation et signalement du repli corrigés** ; libellés réels **à confirmer**. |
| **COM-01** | Recherche | `app.js:277` (main) : `/^\d{5}$/` | Saisir `2A004` | Attendu : recherche par code INSEE. Observé : recherche **par nom** `nom=2A004`. | COM-CORSE **ÉCHOUÉ** | Reconnaître `2A`/`2B` + 3 chiffres. | COM-CORSE ; unitaire `classifyCommuneQuery` | **Constaté. Corrigé et testé.** |
| **COM-02** | Recherche | `app.js:277-288` (main) | Saisir un nombre de 5 chiffres | Attendu : interroger code postal **et** code INSEE, puisqu’un même nombre peut être les deux. Observé : le code INSEE n’est tenté que si le code postal ne renvoie rien. | COM-INSEE (URL) | Deux requêtes en parallèle, fusion par code INSEE, origine de la correspondance affichée (« Trouvée par code INSEE et code postal »). | COM-INSEE ; unitaire `mergeCommunes` | **Code. Corrigé et testé.** Collision réelle non recherchée (réseau). |
| **COM-03** | Recherche, performance | `app.js:313-327` (main) | Recherche par nom renvoyant plusieurs communes | Attendu : choix explicite parmi les homonymes, identifiés par code INSEE. Observé : chargement automatique et **séquentiel** des comptes de toutes les communes (jusqu’à 10), donc jusqu’à 10 requêtes OFGL par recherche. | Code ; COM-HOMONYMES (nouveau) | Si plusieurs résultats : bouton « Afficher les comptes de X (code INSEE) » ; un seul résultat : chargement direct. | COM-HOMONYMES | **Code. Corrigé et testé** (`apres-commune-homonymes-390.png`). |
| **COM-04** | Données | `app.js:211` (main) | Lien « Ouvrir la source officielle OFGL » | Attendu : lien filtré par code INSEE. Observé : `?q=Fameck`, une recherche **par nom**, ambiguë pour les homonymes. | COM-OFGL-LINK **ÉCHOUÉ** | `?q=<code INSEE>` | COM-OFGL-LINK ; unitaire | **Constaté. Corrigé et testé.** |
| **COM-05** | Recherche, robustesse | `app.js:262-337` (main) | Double soumission, service lent | Attendu : délai maximal, annulation de la recherche précédente, état « occupé ». Observé : aucun `AbortController`, aucun délai, aucun `aria-busy`. | Code. COM-RACE a réussi avant correction dans le minutage testé : la course n’a pas été observée. | Délai de 10 s par appel, annulation de la recherche précédente, `aria-busy`, libellé « Recherche… ». Le bouton reste actif : le désactiver empêchait de corriger une saisie. | COM-RACE, COM-BUSY, COM-ABORT | **Code. Corrigé et testé.** |
| **COM-07** | Interface, données | CSS ligne 25 (`.commune-result .result-status`, vert) ; classe `result-status-verified` sans règle | Afficher une fiche, quel que soit le résultat | Attendu : aucun signal visuel de validation. Observé : **tous** les statuts en vert, y compris « Aucune ligne exploitable » et « Données OFGL reçues ». | Capture `avant-commune-erreur-400-390.png` ; recherche `grep` | Statuts « avertissement » (ambre) et « erreur » (rouge) ; libellé « non rapprochées ». | Capture après | **Constaté. Corrigé** (vérifié par capture). |
| **UI-01** | Interface, accessibilité | `assets/css/app.css` : règles `.headline-ribbon`/`.headline-metric` supprimées au commit `3dd3e51` | Ouvrir l’accueil à n’importe quelle largeur | Attendu : 4 chiffres clés en grille. Observé : liens soulignés en ligne continue ; texte `#285b78` sur `#102f49`, **contraste 1,87:1** (WCAG AA exige 4,5:1). | Captures `avant-accueil-320.png`, `avant-accueil-1280.png` ; `git show 3dd3e51` | Rétablir les règles d’origine (adaptées aux variables actuelles) et ajouter un focus visible. | RESP-RIBBON ; captures `apres-ruban-320.png` / `-1280.png` | **Constaté. Corrigé et testé.** |
| **GLO-01** | Glossaire | `index.html:278-287` (main) | Rechercher « zzzz » | Attendu : 0 définition visible. Observé : **10 visibles** (DGF, EPCI, Excédent…) avec le message « 0 définition affichée ». Le compteur initial annonce 38 définitions pour 48 présentes. Ces entrées sont hors de la grille. | GLO-COUNT et GLO-SEARCH « zzzz » **ÉCHOUÉS** | Intégrer les 48 entrées dans `#glossary-list`, triées par ordre alphabétique français. | GLO-COUNT, GLO-SEARCH ; unitaire « Glossaire » | **Constaté. Corrigé et testé.** |
| **FAM-01** | Données | `data/indicators/fameck-finances-2024.json` (`provenance`) | — | Attendu : chaque montant rapproché de l’OFGL (même exercice, même budget, même agrégat). Observé : série retranscrite de FMPC ; libellés « recettes réelles de fonctionnement » non mis en correspondance avec les agrégats OFGL ; écart connu avec une autre source secondaire (signalé par le projet lui-même). | Fichier JSON ; source inaccessible ici | Télécharger l’export OFGL de 57206 (budget principal, 2019-2025), comparer ligne à ligne et consigner le résultat dans le JSON. En cas d’écart non expliqué, **suspendre** l’affichage du poste concerné. | Test de données : valeurs du JSON = valeurs de l’export OFGL figé | **À confirmer. Non corrigé** (impossible sans accès à la source). L’affichage « à rapprocher » est maintenu. |

### P2 — moyen

| ID | Domaine | Emplacement | Constat | Preuve | Correction / test | Statut |
|---|---|---|---|---|---|---|
| **FAM-02** | Calculs, neutralité | `app.js:443-459` (main) | Les années 2019 et 2024 sont codées en dur. Les verbes (« progressent », « recule ») et la conclusion (« les dépenses ont augmenté plus vite ») sont **écrits en dur**, quel que soit le sens réel des évolutions. Une comparaison entre deux exercices seulement est sensible au choix des bornes : l’épargne brute de 2023 (2,20 M€) est plus élevée qu’en 2019. | Code ; recalcul : recettes +7,90 %, dépenses +16,81 %, épargne brute −35,74 % (identiques à l’affichage) | Bornes lues dans les données ; verbe et conclusion selon le signe ; note « comparaison de deux exercices seulement ». Tests FAM-ANALYSIS et unitaire `directionWord`. | **Code. Corrigé et testé.** |
| **DATA-01** | Données | `index.html:58-61` (main) | Bandeau de chiffres clés **saisi à la main dans le HTML** ; il ne se met pas à jour avec les JSON. | Code | Valeurs recalculées depuis les JSON après chargement ; le HTML reste la valeur de repli, contrôlée par un test unitaire. Tests DATA-RIBBON-JS et unitaire « Bandeau ». | **Corrigé et testé.** Valeurs actuelles identiques. |
| **NAV-01** | Interface | Chargement asynchrone des tableaux | Une ouverture directe de `…/#glossaire` laisse la section **à 1 952 px** de sa position : le contenu chargé ensuite la décale. | NAV-DEEPLINK et NAV-RELOAD **ÉCHOUÉS** | Retour sur l’ancre après le chargement, si l’utilisateur n’a pas défilé entre-temps. | **Constaté. Corrigé et testé.** |
| **CLAIM-01** | Calculs | `detectTopic` (main) | « la dette de Fameck est de 7 millions » est comparé à la **dette publique nationale** (3 595,5 Md€). | CLAIM-TOPIC **ÉCHOUÉ** | Une mention communale l’emporte sur « dette ». | **Constaté. Corrigé et testé.** |
| **CLAIM-02** | Interface | `index.html:133` | Les périodes annuelles (« Année 2024 »…) sont proposées pour la dette, qui est une série trimestrielle ; le message « période non couverte » ne dit pas quoi faire. | CLAIM-PERIOD | Message expliquant que la dette est un stock trimestriel et invitant à choisir le 4e trimestre. | **Corrigé et testé.** |
| **COM-06** | Recherche | `app.js:264-265` (main) | Saisie d’espaces seuls : **aucun message**. Code partiel « 5729 » : envoyé comme nom de commune. | COM-SPACES **ÉCHOUÉ** | Messages « Saisissez une commune » et « Code incomplet ou invalide ». COM-SPACES, COM-PARTIAL. | **Constaté. Corrigé et testé.** |
| **RESP-01** | Responsive | `.municipal-history-wrap table{min-width:850px}` | Tableau Fameck de 850 px dans 343 px visibles : le titre et le texte défilent avec le tableau et l’année disparaît au défilement. | FAM-TABLE-MOBILE ; capture `avant-fameck-375.png` | Titre et texte figés, colonne « Année » collante (`apres-fameck-tableau-320.png`). Une vue en cartes sur mobile reste à étudier. | **Corrigé** (capture). |
| **RESP-02** | Responsive | En-tête | Navigation de 10 liens : l’en-tête occupe **222 px à 320 px de large (35 % de l’écran)** et 220 px à 375 px. | RESP-HEADER | Réduire la navigation : regrouper les ancres, ou utiliser un menu repliable accessible (`<details>` ou bouton `aria-expanded`). | **Constaté. Non corrigé** (choix éditorial). |
| **CSS-01** | Maintenabilité | `assets/css/app.css` | Feuille en couches successives : 3 blocs `:root` (lignes 1, 31, 236), **104 sélecteurs redéfinis** hors media queries (`.debt-main` 5 fois, `th`/`td` 4 fois), 8 points de rupture différents (480 à 1100 px), règles mobiles des résultats communaux dupliquées (lignes 310 et 317), `.brand-mark` inutilisé, police `Inter` déclarée mais jamais chargée. UI-01 est une conséquence directe de cet empilement. | Script d’analyse (section C) | Consolider en une seule passe : variables uniques, 3 points de rupture (480, 760, 1100), suppression des règles écrasées. À faire **après** les corrections de données, avec comparaison de captures avant/après. | **Constaté. Non corrigé** (refonte hors périmètre). |
| **README-01** | Documentation | `README.md:18` et `:25` (main) | La ligne 18 dit que les données de Fameck ne sont « pas encore intégrées », ce que contredit la section Fameck. La ligne 25 interdit les tests dans ce dépôt (voir A). | Lecture | Ligne 18 corrigée ; ligne 25 à arbitrer. | **Partiellement corrigé.** |

### P3 — faible

| ID | Domaine | Constat | Preuve | Statut |
|---|---|---|---|---|
| **SEO-01** | Métadonnées | Aucune balise Open Graph ni `canonical`. | SEO-OG **ÉCHOUÉ** avant | **Corrigé** (sans `og:image` : il faut une image PNG, à créer). |
| **CLAIM-03** | Interface | `"$2e trimestre"` produirait « **1e** trimestre » pour un T1. Défaut latent : la dernière période affichée est un T2. | Code | **Corrigé**, avec test unitaire `formatQuarter`. |
| **CLAIM-04** | Calculs | L’extraction du montant n’accepte que « milliard(s) » : « 3 500 Md€ » ou « 3,5 billions » ne sont pas reconnus. Le site le signale alors correctement : « montant non extrait ». | Code | **Non corrigé.** |
| **COMP-01** | Calculs | Signe `+` écrit en dur devant les variations totales : une baisse s’afficherait « +-1,2 Md€ ». Défaut latent. | Code | **Corrigé.** |
| **FAM-03** | Interface | Navigation « Fameck 2024 » mais section « série 2019–2025 » ; l’exercice d’affichage 2024 n’est pas justifié alors que 2025 est présent (la recherche web indique que 2025 est incomplet à l’OFGL pour 97 communes). | Lecture | **Non corrigé** : justification à écrire dans le JSON. |
| **NEUT-01** | Éditorial | Le logo comporte une croix de Lorraine : symbole régional (Fameck est en Moselle), mais aussi associé historiquement à un courant politique. | Capture | **À arbitrer** : risque de perception seulement. |
| **A11Y-01** | Accessibilité | Le lien « Présidentielle 2027 » s’ouvre dans le même onglet, contrairement aux autres liens externes. Comportement acceptable, mais incohérent. | SEC-EXTLINKS | **Non corrigé.** |

### Points contrôlés sans anomalie

- **Injection** : aucune utilisation de `innerHTML`, `outerHTML`, `insertAdjacentHTML` ni `document.write` ; toutes les données externes passent par `textContent`. Une garde est ajoutée en test unitaire. Le code INSEE est validé avant d’entrer dans la clause `where` de l’OFGL (unitaire `buildOfglParams`).
- **Liens externes** : les 10 liens `target="_blank"` portent `rel="noopener noreferrer"` (SEC-EXTLINKS).
- **Suivi** : aucun script tiers, aucun traceur, aucune police distante.
- **Structure** : un seul `h1`, lien d’évitement fonctionnel au premier Tab, `label` associés aux champs, `aria-live` sur les zones de résultat, règles `:focus-visible`, prise en compte de `prefers-reduced-motion`.
- **Contrastes mesurés (WCAG AA)** : texte secondaire `#5b6c78` sur `#f8f7f2` : 5,07:1 ; navigation : 11,68:1 ; badges d’alerte de la branche : 6,43:1 et 7,71:1. **Seul le bandeau UI-01 échoue.**
- **Poids** : environ 122 Ko non compressés (HTML, CSS, JS) plus 3 SVG d’environ 6 Ko. Aucune requête répétitive au chargement.
- **Débordement horizontal** : aucun débordement à 320, 375, 414, 768, 1280 et 1440 px, avant comme après correction.

---

## C. Matrice des tests

### Environnement

- **Machine** : Linux, Chromium headless (Playwright 1.56.1), `deviceScaleFactor` 1.
- **Version testée avant correction** : `main` 230d34d. **Après correction** : branche `ccr-8e430522-ifzcgl`.
- **Service des pages** : dépôt servi localement (serveur HTTP statique). **Toute requête externe est interceptée.**
  - Pour `geo.api.gouv.fr`, les réponses simulées ne contiennent que des identifiants : nom, code INSEE, département, codes postaux. Aucune population n’est inventée.
  - Pour `data.ofgl.fr`, les réponses sont des **jeux fictifs**, nommés dans le script : `ods_limit_error`, `fields_euros_par_habitant`, `page_100`, `page_50`, `truncated_old_years`, `malformed`.
- **Reproduction** : `npm install && npm run test:e2e` (ou `node tests/e2e/audit.spec.cjs [URL] [dossier]`). Résultats bruts : `audit/resultats-avant.json` et `audit/resultats-apres.json`. Captures : `audit/captures/`.

**Remarques sur la colonne « Avant » :**
- quelques critères ont été précisés après le premier passage. COM-INSEE vérifie désormais l’interrogation simultanée des deux codes. COM-BUSY reposait, avant correction, sur la lecture du code (aucun état « occupé » n’existait) ;
- « Recherche DGF » apparaît VALIDÉ avant correction uniquement parce que les 10 entrées hors liste restaient toujours visibles (voir GLO-01).

### Tests navigateur (exécutés)

| ID | Écran (px) | Scénario | Avant (main 230d34d) | Après (branche) | Preuve (après) |
|---|---|---|---|---|---|
| NAV-LOAD | 320 | Chargement initial HTTP 200 | VALIDÉ | VALIDÉ | erreurs JS=0, requêtes en échec=0 , console=aucune |
| RESP-OVERFLOW | 320 | Absence de débordement horizontal | VALIDÉ | VALIDÉ | scrollWidth=320, viewport=320, éléments débordants=aucun |
| RESP-HEADER | 320 | Hauteur de l'en-tête (navigation 10 liens) | VALIDÉ | VALIDÉ | 222px (35 % de la hauteur d'écran) |
| A11Y-TARGET | 320 | Hauteur des liens de navigation ≥ 24px (WCAG 2.5.8) | VALIDÉ | VALIDÉ | hauteurs=33,33,33,33,33,33,33,33,33,33px |
| NAV-LOAD | 375 | Chargement initial HTTP 200 | VALIDÉ | VALIDÉ | erreurs JS=0, requêtes en échec=0 , console=aucune |
| RESP-OVERFLOW | 375 | Absence de débordement horizontal | VALIDÉ | VALIDÉ | scrollWidth=375, viewport=375, éléments débordants=aucun |
| RESP-HEADER | 375 | Hauteur de l'en-tête (navigation 10 liens) | VALIDÉ | VALIDÉ | 220px (30 % de la hauteur d'écran) |
| A11Y-TARGET | 375 | Hauteur des liens de navigation ≥ 24px (WCAG 2.5.8) | VALIDÉ | VALIDÉ | hauteurs=33,33,33,33,33,33,33,33,33,30px |
| NAV-LOAD | 414 | Chargement initial HTTP 200 | VALIDÉ | VALIDÉ | erreurs JS=0, requêtes en échec=0 , console=aucune |
| RESP-OVERFLOW | 414 | Absence de débordement horizontal | VALIDÉ | VALIDÉ | scrollWidth=414, viewport=414, éléments débordants=aucun |
| RESP-HEADER | 414 | Hauteur de l'en-tête (navigation 10 liens) | VALIDÉ | VALIDÉ | 186px (22 % de la hauteur d'écran) |
| A11Y-TARGET | 414 | Hauteur des liens de navigation ≥ 24px (WCAG 2.5.8) | VALIDÉ | VALIDÉ | hauteurs=33,33,33,33,33,33,33,33,33,33px |
| NAV-LOAD | 768 | Chargement initial HTTP 200 | VALIDÉ | VALIDÉ | erreurs JS=0, requêtes en échec=0 , console=aucune |
| RESP-OVERFLOW | 768 | Absence de débordement horizontal | VALIDÉ | VALIDÉ | scrollWidth=768, viewport=768, éléments débordants=aucun |
| RESP-HEADER | 768 | Hauteur de l'en-tête (navigation 10 liens) | VALIDÉ | VALIDÉ | 162px (16 % de la hauteur d'écran) |
| NAV-LOAD | 1280 | Chargement initial HTTP 200 | VALIDÉ | VALIDÉ | erreurs JS=0, requêtes en échec=0 , console=aucune |
| RESP-OVERFLOW | 1280 | Absence de débordement horizontal | VALIDÉ | VALIDÉ | scrollWidth=1280, viewport=1280, éléments débordants=aucun |
| RESP-HEADER | 1280 | Hauteur de l'en-tête (navigation 10 liens) | VALIDÉ | VALIDÉ | 104px (12 % de la hauteur d'écran) |
| NAV-LOAD | 1440 | Chargement initial HTTP 200 | VALIDÉ | VALIDÉ | erreurs JS=0, requêtes en échec=0 , console=aucune |
| RESP-OVERFLOW | 1440 | Absence de débordement horizontal | VALIDÉ | VALIDÉ | scrollWidth=1440, viewport=1440, éléments débordants=aucun |
| RESP-HEADER | 1440 | Hauteur de l'en-tête (navigation 10 liens) | VALIDÉ | VALIDÉ | 104px (12 % de la hauteur d'écran) |
| NAV-ANCHORS | 1280 | Toutes les ancres internes ont une cible | VALIDÉ | VALIDÉ | 11 ancres, cibles manquantes=aucune |
| NAV-DEEPLINK | 1280 | Ouverture directe de l'URL #glossaire | ÉCHOUÉ | VALIDÉ | haut de #glossaire à 16px après chargement des données |
| NAV-RELOAD | 1280 | Rechargement sur #glossaire conserve la position | ÉCHOUÉ | VALIDÉ | haut de #glossaire à 16px du haut de fenêtre |
| NAV-LOCAL-LINKS | 1280 | Liens locaux (JSON, accueil) répondent 200 | VALIDÉ | VALIDÉ | 4 liens, en échec=aucun |
| SEC-EXTLINKS | 1280 | Liens externes target=_blank ont rel=noopener | VALIDÉ | VALIDÉ | 10 liens externes ; sans nouvel onglet : https://tuzilucas.github.io/FRANCE_2027/carte/ |
| A11Y-H1 | 1280 | Un seul h1 | VALIDÉ | VALIDÉ | 1 h1 ; plan dans titres.txt |
| SEO-OG | 1280 | Métadonnées de partage (Open Graph / canonical) | ÉCHOUÉ | VALIDÉ | 7 balise(s) |
| A11Y-SKIP | 1280 | Premier Tab = lien d'évitement visible | VALIDÉ | VALIDÉ | skip-link Aller au contenu |
| GLO-COUNT | 1280 | Compteur initial = nombre total de définitions | ÉCHOUÉ | VALIDÉ | 48 définitions dans la page, 48 dans #glossary-list ; compteur : « 48 définitions affichées dans le glossaire. » |
| GLO-SEARCH | 1280 | Recherche « epargne » | VALIDÉ | VALIDÉ | 6 visibles ; compteur : « 6 définitions affichées pour « epargne ». » |
| GLO-SEARCH | 1280 | Recherche « ÉPARGNE » | VALIDÉ | VALIDÉ | 6 visibles ; compteur : « 6 définitions affichées pour « ÉPARGNE ». » |
| GLO-SEARCH | 1280 | Recherche « dett » | VALIDÉ | VALIDÉ | 12 visibles ; compteur : « 12 définitions affichées pour « dett ». » |
| GLO-SEARCH | 1280 | Recherche « zzzz » | ÉCHOUÉ | VALIDÉ | 0 visibles ; compteur : « 0 définition affichée pour « zzzz ». » ; visibles :  |
| GLO-SEARCH | 1280 | Recherche « DGF » | VALIDÉ | VALIDÉ | 1 visibles ; compteur : « 1 définition affichée pour « DGF ». » |
| GLO-SEARCH | 1280 | Recherche «  » | VALIDÉ | VALIDÉ | 48 visibles ; compteur : « 48 définitions affichées dans le glossaire. » |
| COM-OFGL-REQ | 390 (simulé) | Fameck → requête OFGL émise (paramètres) | À CONFIRMER | À CONFIRMER | URL OFGL : https://data.ofgl.fr/api/explore/v2.1/catalog/datasets/ofgl-base-communes/records?where=com_code="57206"+AND+code_type_budget=1&limit=100&offset=0&order_by=ex… |
| COM-ERR-400 | 390 (simulé) | Erreur HTTP OFGL distinguée d'une absence de données | ÉCHOUÉ | VALIDÉ | Commune trouvéeL’identité géographique est fournie par le service public geo.api.gouv.fr ; chaque commune est identifiée par son code INSEE. Les chiffres financiers de l… |
| COM-PERCAPITA | 390 (simulé) | Champ euros_par_habitant affiché | ÉCHOUÉ | VALIDÉ | Texte : Commune trouvéeL’identité géographique est fournie par le service public geo.api.gouv.fr ; chaque commune est identifiée par son code INSEE. Les chiffres financi… |
| COM-TRUNC | 390 (simulé) | Réponse tronquée (total_count > lignes reçues) signalée | ÉCHOUÉ | VALIDÉ | Avec total_count=600 et 1 ligne 2019, le site affiche : « vée par nomRéponse incomplète · aucun montant affichéL’OFGL annonce 600 lignes, mais seulement 1 ont pu être ré… |
| COM-MALFORMED | 390 (simulé) | Réponse OFGL mal formée (HTML) → message clair | ÉCHOUÉ | VALIDÉ | Texte : ouvée par nomComptes momentanément indisponiblesLe service de l’OFGL a renvoyé une réponse dans un format inattendu. Il ne s’agit pas d’une absence de données. R… |
| COM-GEO-DOWN | 390 (simulé) | Indisponibilité geo.api.gouv.fr | VALIDÉ | VALIDÉ | Texte : Recherche momentanément indisponibleLe référentiel géographique geo.api.gouv.fr est injoignable (réseau ou blocage du navigateur). Vous pouvez quand même recherc… |
| COM-EMPTY-RESULT | 390 (simulé) | Recherche sans résultat | VALIDÉ | VALIDÉ | Texte : Aucune commune trouvéeVérifiez l’orthographe, le code postal ou le code INSEE. Vous pouvez aussi lancer la recherche directement dans la base financière officie … |
| COM-POSTAL | 390 (simulé) | Code postal 57290 → paramètre codePostal | VALIDÉ | VALIDÉ | URL : https://geo.api.gouv.fr/communes?fields=nom%2Ccode%2CcodeDepartement%2CcodesPostaux&limit=10&codePostal=57290 \| capture=commune-COM-POSTAL.png |
| COM-INSEE | 390 (simulé) | Nombre à 5 chiffres 57206 → interrogé comme code postal ET code INSEE | VALIDÉ | VALIDÉ | URLs : https://geo.api.gouv.fr/communes?fields=nom%2Ccode%2CcodeDepartement%2CcodesPostaux&limit=10&codePostal=57206 ; https://geo.api.gouv.fr/communes?fields=nom%2Ccode… |
| COM-CORSE | 390 (simulé) | Code INSEE corse 2A004 traité comme code | ÉCHOUÉ | VALIDÉ | URL : https://geo.api.gouv.fr/communes?fields=nom%2Ccode%2CcodeDepartement%2CcodesPostaux&limit=10&code=2A004 \| capture=commune-COM-CORSE.png |
| COM-LYON | 390 (simulé) | Lyon (9 codes postaux) lisible sur mobile | VALIDÉ | VALIDÉ | scrollWidth=390/390 ;  \| capture=commune-COM-LYON.png |
| COM-OFGL-LINK | 390 (simulé) | Lien OFGL de la fiche filtré par code INSEE (et non par nom) | ÉCHOUÉ | VALIDÉ | href=https://data.ofgl.fr/explore/dataset/ofgl-base-communes/?q=57206 \| capture=commune-COM-OFGL-LINK.png |
| COM-PAGINATION | 390 (simulé) | Pagination OFGL (150 lignes, pages de 100) | nouveau test | VALIDÉ | 2 appels : limit=100&offset=0 ; limit=100&offset=100 \| capture=commune-COM-PAGINATION.png |
| COM-HOMONYMES | 390 (simulé) | Homonymes : choix explicite par code INSEE avant chargement des comptes | nouveau test | VALIDÉ | requêtes OFGL avant choix=0 ; boutons=Afficher les comptes de Saint-Martin-de-Test (01001) / Afficher les comptes de Saint-Martin-de-Test (02002) ; après choix : https:/… |
| COM-EMPTY-QUERY | 390 | Recherche vide bloquée par le formulaire | VALIDÉ | VALIDÉ | aucune requête émise ; message natif : « Please fill out this field. » |
| COM-SPACES | 390 | Saisie d'espaces seuls : aucune requête, message à l'utilisateur | ÉCHOUÉ | VALIDÉ | requêtes=0, zone masquée=false, message=« Saisissez une communeIndiquez un nom de commune, un code postal ou un code INSEE » |
| COM-PARTIAL | 390 | Code partiel « 5729 » : message explicite, aucune requête | nouveau test | VALIDÉ | Code incomplet ou invalideUn code postal ou un code INSEE comporte exactement 5 caractères (par exemple 57290 ou 2A004). |
| COM-RACE | 390 (simulé) | Deux recherches successives rapides : seul le dernier résultat s'affiche | VALIDÉ | VALIDÉ | titres affichés : Commune trouvée / Lyon |
| COM-BUSY | 390 | Libellé « Recherche… » et aria-busy pendant la recherche, rétablis ensuite | ÉCHOUÉ | VALIDÉ | pendant : libellé occupé=true, aria-busy=true ; après : libellé non rétabli=false |
| COM-ABORT | 390 (simulé) | Saisie invalide pendant une recherche : recherche annulée, message conservé | ÉCHOUÉ (vérifié sans l’annulation) | VALIDÉ | Code incomplet ou invalideUn code postal ou un code INSEE comporte exactement 5 caractères (par exemple 57290 ou 2A004). ; bouton=Rechercher… |
| CLAIM-DEBT | 1280 | Affirmation dette 3 500 Md€ / T2 2026 | VALIDÉ | VALIDÉ | Référence officielle trouvée : dette publiqueComparaison indicative — transcription à contrôlerPériode : 2026-T2.Valeur publiée par l'INSEE : 3 595,5 milliards €, soit 1… |
| CLAIM-PERIOD | 1280 | Dette + « Année 2024 » : explication stock trimestriel | ÉCHOUÉ | VALIDÉ | La dette se mesure par trimestrePériode à préciserLa dette publique est un stock mesuré à la fin de chaque trimestre, pas un montant annuel. Pour une année, cho |
| CLAIM-TOPIC | 1280 | « dette de Fameck » orientée vers les finances communales | ÉCHOUÉ | VALIDÉ | Sujet identifié : finances communalesPas encore de données validées pour conclureDes repères 2024 de Fameck sont affichés dans le site, mais ils proviennent d'u |
| DATA-RIBBON-JS | 375 | Bandeau rempli depuis les JSON après chargement | nouveau test | VALIDÉ | 3 595,5 Md€ / 1,34 M€ / 7,17 M€ / 10,09 % |
| RESP-RIBBON | 375 | Bandeau de chiffres clés mis en grille | nouveau test | VALIDÉ | display=grid |
| FAM-ANALYSIS | 375 | Analyse 2019–2024 calculée depuis le JSON | VALIDÉ | VALIDÉ | Ce que montre la série 2019–2024Entre 2019 et 2024, les recettes de fonctionnement progressent de 7,9 %, et les dépenses progressent de 16,8 %. L’épargne brute recule de… |
| FAM-TABLE-MOBILE | 375 | Tableau 7 colonnes sur mobile | À CONFIRMER | À CONFIRMER | 7 lignes ; défilement horizontal interne 850px pour 343px visibles (le titre « Évolution annuelle » et le texte défilent avec le tableau) |

### Tests unitaires (exécutés, `npm run test:unit`, Node 22)

16 tests, **16 réussis** sur la branche. Ils couvrent :
- la classification des saisies et le format des codes INSEE (Corse comprise) ;
- la fusion et la validation des réponses geo.api ;
- les paramètres OFGL : limite, pagination, injection ;
- l’extraction des montants (absent → `null`, zéro → 0) ;
- la détection de réponse tronquée et l’exclusion des autres communes ;
- les libellés accentués, `formatQuarter`, `percentChange` et `directionWord`, `detectTopic` ;
- la **cohérence interne de la série Fameck** et l’égalité entre le bandeau HTML et les JSON ;
- l’exhaustivité et le tri du glossaire ;
- l’absence d’insertion HTML.

### Tests non réalisés

| Test | Statut | Raison | Comment le réaliser |
|---|---|---|---|
| Ouverture du site déployé, codes HTTP, console | **NON TESTÉ** | `tuzilucas.github.io` refusé par le proxy (403) | `node tests/e2e/audit.spec.cjs https://tuzilucas.github.io/Citoyen/` depuis un poste connecté. Les interceptions geo/OFGL restent actives : retirer le `route` de `newPage` pour un essai réel. |
| Écart entre le dépôt et le site déployé | **NON TESTÉ** | Idem | `curl -s https://tuzilucas.github.io/Citoyen/assets/js/app.js \| diff - assets/js/app.js` (idem pour `index.html` et `app.css`) |
| Comportement avec cache puis sans cache | **NON TESTÉ** | Site déployé inaccessible ; en local, le cache n’est pas représentatif | DevTools sur le site réel : rechargement normal puis forcé ; vérifier les en-têtes `cache-control` de GitHub Pages (10 min) et la cohérence HTML/JS après déploiement. |
| Appels réels geo.api.gouv.fr (Fameck, Lyon, commune rurale, nom accentué ou à trait d’union, 57290, 57206, 2A004) | **NON TESTÉ** | `geo.api.gouv.fr` refusé | `curl "https://geo.api.gouv.fr/communes?nom=Saint-%C3%89tienne&fields=nom,code,codesPostaux&boost=population&limit=10"`, etc. |
| Schéma, limites, CORS et données de l’API OFGL | **NON TESTÉ** | `data.ofgl.fr` refusé ; la recherche web n’a pas renvoyé le schéma du jeu communal | Procédure en section E, étape 0. |
| Rapprochement Fameck, Lyon et petite commune avec l’OFGL | **NON TESTÉ** | Idem | Idem. |
| Firefox, Safari, lecteur d’écran | **NON TESTÉ** | Seul Chromium est disponible | Ajouter `firefox` et `webkit` dans le script ; tester avec NVDA ou VoiceOver. |

---

## D. Contrôle des données financières

### D1. Recherche communale (API OFGL) — affichage générique

Les champs ci-dessous sont **ceux du code**. Aucun n’a pu être confronté au schéma officiel.

| Élément affiché | Champ utilisé par le code | Formule | Périmètre | Unité, arrondi | Exercices testés | Rapprochement OFGL | Conditions de masquage (branche) |
|---|---|---|---|---|---|---|---|
| Identifiant de la commune | `com_code` (filtre) | — | — | — | — | **Non vérifié** (API-01) | Code INSEE validé avant la requête |
| Exercice | `exer` | max(exer) **si la réponse est complète** | — | année | — | **Non vérifié** | Masqué si la réponse est incomplète ou sans exercice |
| Budget | `code_type_budget = 1` | filtre | « budget principal » selon le code | — | — | **Non vérifié**. Indice : le champ pourrait s’appeler `cbudg`. Signification de la valeur 1 non vérifiée. | — |
| Libellé de l’agrégat | `agregat` | correspondance avec 10 libellés attendus | — | — | — | **Non vérifié** (API-06) | Repli alphabétique signalé |
| Montant | `montant` (sinon `montant_eur`, `valeur`) | aucune | budget principal | €, arrondi à l’euro, euros courants | — | **Non vérifié** | « Non disponible » si absent ; 0 conservé comme 0 |
| Montant par habitant | `euros_par_habitant` (ajouté), `montant_hab`, `montant_eur_par_habitant` | aucune (valeur publiée) | population retenue par l’OFGL (non affichée) | €/hab., arrondi à l’euro | — | **Non vérifié** (API-05) | Masqué si absent |

**Conclusion D1** : tant que l’étape 0 n’est pas faite, ces montants **ne doivent pas être présentés comme des comptes officiels vérifiés**. La branche les marque « non rapprochées ».

### D2. Fameck — série retranscrite (`fameck-finances-2024.json`)

| Indicateur affiché | Libellé de la source (FMPC) | Agrégat OFGL probable (**à confirmer**) | Formule vérifiée | Exercices recalculés | Résultat du contrôle interne | Rapprochement OFGL |
|---|---|---|---|---|---|---|
| Recettes réelles de fonctionnement | recettes réelles | « Recettes de fonctionnement » | — | 2019-2025 | n/a | **Non fait** |
| Dépenses réelles de fonctionnement | dépenses réelles | « Dépenses de fonctionnement » | — | 2019-2025 | n/a | **Non fait** |
| Épargne brute | épargne brute | « Epargne brute » | recettes − dépenses | 2019-2025 | **Conforme à ±1 €** (arrondis de la source) | **Non fait** |
| Épargne nette | épargne nette | « Epargne nette » | épargne brute − remboursement du capital | 2019-2025 | **Conforme à ±1 €** | **Non fait** |
| Encours de dette | dette au 31/12 | « Encours de dette » | — | 2019-2025 | n/a | **Non fait** |
| Taux d’épargne brute (calculé par le site) | — | — | épargne brute ÷ recettes × 100 | 2019-2025 | **Conforme** (écart < 0,006 point) ; 2024 : 10,0929 %, affiché 10,1 % (fiche) ou 10,09 % (bandeau) | sans objet |
| Capacité de désendettement | publiée par la source | — | encours ÷ épargne brute | 2019-2025 | **Conforme** (2024 : 5,366, affiché 5,4 ans) | sans objet |
| Montants par habitant | — | « euros par habitant » OFGL | montant ÷ population de l’année, arrondi | 2024 (8 indicateurs) ; dette/hab. 2019-2025 | **Conformes** | Population utilisée non sourcée séparément |
| Dépenses d’investissement, fonds de roulement, impôts locaux | idem | à confirmer | — | 2024 | n/a | **Non fait** |
| Analyse 2019→2024 | — | — | (V2024 ÷ V2019 − 1) × 100 | 2019, 2024 | **Recalcul indépendant** : recettes +7,90 % ; dépenses +16,81 % ; épargne brute −35,74 % ; dette +2,93 %. **Identique à l’affichage.** | — |

**Constats** :
- les montants sont **nominaux** : le site le dit ;
- tous sont des montants **exécutés**, selon la source : aucun mélange avec des données prévisionnelles n’a été relevé ;
- les ratios publiés sont **reproductibles**.

L’exactitude officielle n’est **pas démontrée** (FAM-01). Le statut « à rapprocher » doit donc rester affiché.

### D3. Dette publique nationale

Les 12 observations et la composition du T2 2026 sont transcrites de l’INSEE ; le XLSX n’a pas été rapproché, et le projet le déclare. **Contrôle interne fait** :
- la somme des sous-secteurs vaut 3 595,6 Md€, contre 3 595,5 Md€ publiés : écart d’arrondi expliqué dans la page ;
- la part de chaque sous-secteur est recalculée à l’affichage.

**Source non consultée** (INSEE inaccessible depuis l’environnement).

### D4. Risques de confusion vérifiés dans les libellés et le glossaire

| Paire de notions | Traitement sur le site | Appréciation |
|---|---|---|
| Recettes / dépenses de fonctionnement | Distinguées ; glossaire précis | Correct |
| Épargne brute / épargne nette | Définitions distinctes et formules cohérentes avec le calcul du site | Correct |
| Encours / annuité | Glossaire explicite (« pas le montant total de la dette restante ») | Correct |
| Intérêts / capital | Entrées « Charges financières », « Intérêts d’emprunt » et « Remboursement du capital » | Correct |
| Investissement / fonctionnement | Distingués | Correct |
| Budget principal / annexes | Mentionné sur chaque fiche | Correct |
| Total / par habitant | Distingués ; population de référence expliquée | Correct |
| Euros courants / constants | « Montants nominaux » affiché | Correct ; aucune correction de l’inflation n’est proposée |
| Absent / nul / zéro | Avant correction : une **erreur** affichée comme une absence (API-03). Après : trois états distincts. | Corrigé |
| Dette / déficit | Glossaire : « Le déficit est un flux annuel ; la dette est un stock accumulé » | Correct |

Glossaire : 48 définitions compréhensibles et non contradictoires avec les calculs du site. Il n’a **aucun lien vers une source officielle**, alors que l’épargne brute et la capacité de désendettement le justifieraient (P3, recommandation : lier les fiches DGCL et OFGL).

---

## E. Plan de correction ordonné

| Ordre | Action | Dépend de | Anomalies | État sur la branche |
|---|---|---|---|---|
| **0** | **Terminer l’audit réseau** depuis un poste connecté (procédure ci-dessous). | — | API-01, API-05, API-06, FAM-01 | **À faire** |
| 1 | Corriger les noms de champs OFGL dans `OFGL.fields` (`citoyen-lib.js`) et la valeur du budget principal, à partir du schéma réel. | 0 | API-01, API-05 | À faire |
| 2 | Pagination, limite à 100, contrôle d’exhaustivité, exclusion des lignes étrangères. | — | API-02, API-04 | **Fait, testé** |
| 3 | Distinguer erreur, délai, format, absence de données et réponse incomplète. | — | API-03 | **Fait, testé** |
| 4 | Relever les libellés réels des agrégats et mettre à jour `PRIORITY_AGGREGATES`. | 0 | API-06 | Normalisation faite ; libellés à faire |
| 5 | Rapprocher la série Fameck de l’export OFGL ; documenter l’exercice d’affichage. | 0 | FAM-01, FAM-03 | À faire |
| 6 | Recherche : Corse, double interprétation à 5 chiffres, homonymes, lien par code INSEE, délai et annulation, saisies vides ou partielles. | — | COM-01 à 07 | **Fait, testé** |
| 7 | Analyse Fameck conditionnelle ; bandeau calculé depuis les JSON ; signes. | — | FAM-02, DATA-01, COMP-01 | **Fait, testé** |
| 8 | Bandeau de chiffres clés, glossaire, ancre profonde, tableau mobile. | — | UI-01, GLO-01, NAV-01, RESP-01 | **Fait, testé** |
| 9 | Vérification d’affirmation : sujet communal, périodes annuelles. | — | CLAIM-01 à 03 | **Fait, testé** |
| 10 | Métadonnées de partage (ajouter une image PNG 1200×630). | — | SEO-01 | Fait, sauf image |
| 11 | Décider de l’emplacement des tests et de l’audit (dépôt public ou privé). | — | README-01 | **Décision du propriétaire** |
| 12 | Réduire la navigation mobile. | 8 | RESP-02 | **Code ajouté** : bouton accessible, ouverture/fermeture, Escape, fermeture après navigation ; tests e2e ajoutés, exécution à confirmer. |
| 13 | Consolider `app.css` (variables, points de rupture, règles écrasées), avec comparaison de captures. | 8, 12 | CSS-01 | À faire |
| 14 | Améliorations facultatives : extraction « Md€ », liens officiels du glossaire, cohérence du lien « Présidentielle 2027 », arbitrage sur le logo. | — | CLAIM-04, A11Y-01, NEUT-01 | Facultatif |

### Étape 0 — procédure pour finir l’audit réseau

```bash
# 1. Schéma du jeu de données (noms et types exacts des champs)
curl -s "https://data.ofgl.fr/api/explore/v2.1/catalog/datasets/ofgl-base-communes" | jq '.fields[] | {name, type, label}'

# 2. Comportement de la requête actuelle (attendu : HTTP 400 si limit > 100 ou si un champ est inconnu)
curl -s -w "\nHTTP %{http_code}\n" "https://data.ofgl.fr/api/explore/v2.1/catalog/datasets/ofgl-base-communes/records?where=com_code%3D%2257206%22%20AND%20code_type_budget%3D1&limit=1000"

# 3. Valeurs du type de budget et libellés réels des agrégats (remplacer <BUDGET> par le nom trouvé en 1)
curl -s ".../records?select=<BUDGET>,count(*)&group_by=<BUDGET>"
curl -s ".../records?where=com_code%3D%2257206%22&select=agregat&group_by=agregat&limit=100"

# 4. Exercices disponibles et nombre de lignes par commune (Fameck 57206, Lyon 69123, une commune de moins de 200 habitants)
curl -s ".../records?where=com_code%3D%2257206%22&select=exer,count(*)&group_by=exer"

# 5. CORS : vérifier l'en-tête Access-Control-Allow-Origin
curl -sI -H "Origin: https://tuzilucas.github.io" ".../records?limit=1" | grep -i access-control
```

Ensuite :
- comparer, pour Fameck, Lyon et la petite commune, les montants du dernier exercice complet avec la fiche affichée sur `data.ofgl.fr` (même exercice, même budget, même agrégat). Consigner le résultat dans un tableau D1 complété ;
- pour Fameck seulement, comparer en plus chaque ligne de `annual_series` avec l’export OFGL ;
- enfin, relancer `node tests/e2e/audit.spec.cjs https://tuzilucas.github.io/Citoyen/` et comparer les fichiers du site déployé avec ceux du dépôt.

---

## F. Prompt de correction complet (pour un agent de développement)

```text
CONTEXTE
Dépôt Tuzilucas/Citoyen : site statique GitHub Pages (index.html, assets/css/app.css,
assets/js/app.js, assets/js/citoyen-lib.js, data/). Observatoire citoyen et neutre des
finances publiques locales. Commune pilote : Fameck (code INSEE 57206).
Lire d'abord AUDIT-TECHNIQUE.md. Partir de la branche ccr-8e430522-ifzcgl, qui corrige
déjà API-02, API-03, API-04, COM-01 à COM-07, UI-01, GLO-01, NAV-01, FAM-02, DATA-01,
CLAIM-01 à CLAIM-03 et SEO-01 (sans image).

RÈGLES IMPÉRATIVES
- Ne jamais inventer un chiffre, une source, un nom de champ, un libellé ou une année.
  Toute affirmation sur l'API OFGL doit venir d'un appel HTTP réel, cité dans le commit.
- Donnée absente = « Non disponible » ; jamais 0. Une erreur de service n'est jamais
  présentée comme une absence de données.
- Identifier une commune par son code INSEE, jamais par son nom.
- Neutralité : aucun jugement de gestion, aucune causalité ; textes descriptifs seulement.
- Le site reste statique, sans dépendance d'exécution. Aucune régression : npm test doit
  passer avant chaque commit (npm run test:unit puis npm run test:e2e).
- Ne pas fusionner dans main sans validation humaine.

TÂCHES, DANS L'ORDRE
1. API OFGL (API-01, API-05, API-06) — fichier assets/js/citoyen-lib.js, objet OFGL.
   a. GET https://data.ofgl.fr/api/explore/v2.1/catalog/datasets/ofgl-base-communes :
      relever les noms exacts du code INSEE, de l'exercice, du type de budget, de
      l'agrégat, du montant et du montant par habitant. Mettre à jour OFGL.fields
      (supprimer les replis devenus inutiles).
   b. Établir la valeur qui désigne le budget principal (group_by sur le champ de
      budget, puis documentation OFGL). Mettre à jour OFGL.mainBudgetCode.
   c. Relever les libellés exacts des agrégats (group_by=agregat) et mettre à jour
      PRIORITY_AGGREGATES avec les libellés réels.
   d. Vérifier l'en-tête CORS pour l'origine https://tuzilucas.github.io.
   e. Remplacer les jeux simulés OFGL de tests/e2e/audit.spec.cjs par des extraits
      réels figés (même forme JSON) ; ajouter un test unitaire qui vérifie
      buildOfglParams avec les vrais noms.
   Acceptation : pour 57206, 69123 et une petite commune, les montants du dernier
   exercice complet affichés par le site sont identiques à la fiche data.ofgl.fr
   (même exercice et même budget). Tableau de preuves ajouté à AUDIT-TECHNIQUE.md,
   section D1. Tant que ce n'est pas obtenu, ne pas retirer la mention
   « non rapprochées ».
2. Fameck (FAM-01, FAM-03) — data/indicators/fameck-finances-2024.json.
   Comparer chaque valeur de annual_series à l'export OFGL du budget principal.
   Ajouter un bloc reconciliation : {source, date, champ OFGL, écart} par
   indicateur. Écart non expliqué : retirer l'indicateur de l'affichage, ne pas
   corriger « au jugé ». Justifier display_year. Acceptation : le test unitaire de
   cohérence passe ; un nouveau test compare le JSON à l'extrait OFGL figé.
3. Navigation mobile (RESP-02) — index.html, app.css. En dessous de 680 px,
   l'en-tête ne doit pas dépasser 120 px de haut. Menu repliable accessible
   (bouton aria-expanded et aria-controls, utilisable au clavier, focus visible).
   Ajouter le test RESP-HEADER avec un seuil de 120 px à 320 et 375 px.
4. CSS (CSS-01) — consolider app.css : un seul :root, points de rupture 480, 760
   et 1100 px, suppression des règles écrasées et de .brand-mark. Acceptation :
   captures avant/après identiques (à quelques pixels près) aux 6 largeurs de la
   suite e2e ; RESP-OVERFLOW toujours valide.
5. Facultatif : og:image PNG 1200×630 ; extraction « Md€ » dans la vérification
   d'affirmation (CLAIM-04) avec tests ; liens vers les définitions officielles
   (DGCL, OFGL) dans le glossaire pour l'épargne brute et la capacité de
   désendettement.

LIVRABLE
Commits séparés par tâche, tests verts, AUDIT-TECHNIQUE.md mis à jour (statuts
VALIDÉ, ÉCHOUÉ, NON TESTÉ ou À CONFIRMER avec preuves).
```
