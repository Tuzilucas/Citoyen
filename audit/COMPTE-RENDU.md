# Compte rendu de l’audit — Information citoyenne

- **Date** : 22 octobre 2026 (mise à jour après corrections complémentaires)
- **Version auditée** : `main`, commit `230d34d`
- **Branche de correction** : `ccr-8e430522-ifzcgl`, fusionnée dans `main` le 22 octobre 2026
- **Suivi du 22 octobre 2026** : sur `main` (commit `8bb7c48`), une erreur JavaScript se produisait à chaque chargement (`restoreAnchor is not defined`, fonction supprimée au commit `55f0d5c` mais encore appelée). Elle est corrigée sur la branche `ccr-8e430522-ifzcgl`, avec deux ajustements de tests et l’en-tête mobile ramené sous 120 px : 69 tests navigateur sur 69 et 16 tests unitaires sur 16 réussis.
- **Fusion avec le site présidentiel** : le plan est consigné dans le dépôt privé du site présidentiel (`docs/fusion/PROMPT_FUSION_FINANCES.md`).
- **Rapport détaillé** : [`AUDIT-TECHNIQUE.md`](../AUDIT-TECHNIQUE.md). Il contient le tableau des anomalies, la matrice des tests, le contrôle des données, le plan de correction et le prompt pour l’étape suivante.

## Ce qui n’a pas pu être testé

L’environnement d’audit refusait les connexions vers `tuzilucas.github.io`, `data.ofgl.fr`, `geo.api.gouv.fr`, `www.insee.fr` et `www.fmpc.fr`. Par conséquent :

- **Site déployé** : il n’a pas été ouvert. Les tests navigateur portent sur le code du dépôt, servi en local.
- **API officielles** : aucun appel réel n’a été fait. Les réponses de l’OFGL et de geo.api.gouv.fr ont été simulées ; elles vérifient le comportement du code, pas l’exactitude des chiffres.
- **Rapprochement des comptes** : aucun pour Fameck, Lyon ou une petite commune.

Ces points sont notés « NON TESTÉ » ou « À CONFIRMER » dans le rapport. Les commandes pour les terminer depuis un poste connecté figurent dans la section E, étape 0.

## Anomalies constatées sur `main`

- **Comptes communaux (bloquant)** : la requête OFGL demande 1000 lignes. L’API sur laquelle repose l’OFGL plafonne normalement à 100 lignes par appel, donc la requête échoue probablement pour toutes les communes. Toute erreur s’affiche ensuite comme « Aucune ligne exploitable reçue pour 2024 », avec une année écrite en dur. Le message a été reproduit avec une erreur simulée.
- **Noms de champs OFGL douteux** : `code_type_budget` et `montant_hab` n’ont jamais été vérifiés. Une recherche web suggère `cbudg` et `euros_par_habitant`, sans preuve directe. Ils n’ont donc pas été modifiés ; ils sont regroupés dans un seul fichier et les montants sont affichés comme « non rapprochés ».
- **Dernier exercice mal choisi** : il est retenu même si la réponse de l’API est incomplète. Une réponse tronquée affichait « exercice 2019 ».
- **Bandeau des chiffres clés illisible** à toutes les largeurs : sa mise en page a été supprimée par erreur au commit `3dd3e51`. Le texte est bleu sur bleu marine, avec un contraste de 1,87:1 (minimum requis : 4,5:1).
- **Glossaire** : 10 définitions sur 48 échappent à la recherche. Une recherche « zzzz » laisse 10 définitions visibles tout en annonçant « 0 définition ».
- **Recherche de communes** :
  - les codes INSEE corses (`2A…`, `2B…`) sont cherchés comme des noms ;
  - le lien vers l’OFGL filtre par nom ;
  - tous les statuts s’affichent en vert, comme s’ils étaient validés ;
  - aucun délai maximal ni annulation d’une recherche en cours.
- **Vérification d’une affirmation** : « la dette de Fameck » est comparée à la dette publique nationale.
- **Lien direct vers `#glossaire`** : la page s’arrête 1 952 px trop haut, car les tableaux chargés après coup décalent la section.
- **Fameck** : les chiffres sont cohérents entre eux à 1 € près (recalcul indépendant de 2019 à 2025). Ils viennent toutefois d’une source secondaire (FMPC) ; leur exactitude officielle reste à démontrer.

## Corrections apportées sur la branche

Les défauts d’interface et de logique listés ci-dessus ont été corrigés sur la branche, à l’exception du nettoyage CSS. La navigation mobile a ensuite été ajoutée à la branche avec des tests dédiés ; cette modification complémentaire n’a pas encore été exécutée dans Chromium. Les deux points qui demandent un accès réel aux sources officielles restent ouverts : les noms de champs OFGL et le rapprochement des chiffres de Fameck.

- Les fonctions de calcul sont regroupées dans `assets/js/citoyen-lib.js` et le site reste statique, sans dépendance à l’exécution.
- **Résultats des tests** :
  - tests unitaires (`npm run test:unit`) : 16 sur 16 réussis ;
  - tests navigateur (`npm run test:e2e`, de 320 à 1440 px) : 63 sur 63 réussis, contre 15 échecs sur 58 avant correction.
- Les captures avant/après sont dans [`audit/captures/`](captures/). Les résultats bruts sont dans [`resultats-avant.json`](resultats-avant.json) et [`resultats-apres.json`](resultats-apres.json).

## Reste à faire

1. **Vérifier le schéma réel de l’OFGL** (étape 0 du rapport), puis corriger les noms de champs et comparer les montants avec les fiches officielles.
2. **Rapprocher la série de Fameck** de l’export OFGL.
3. **Valider la navigation mobile corrigée** : menu repliable accessible ajouté sur la branche ; tests modifiés mais non exécutés dans cet environnement.
4. **Nettoyer le CSS** : 104 règles sont redéfinies plusieurs fois et 3 blocs `:root` coexistent.

## Décisions à prendre avant fusion

- **Emplacement des tests et de l’audit** : le `README.md` indique que les tests ne doivent pas figurer dans ce dépôt public. Ils ont été laissés sur la branche, puisque le rapport était demandé à la racine. Reste à décider s’ils restent ici ou vont dans le dépôt privé de développement.
- **Ne pas fusionner avant l’étape 0**, c’est-à-dire avant d’avoir vérifié le schéma réel de l’OFGL.

## Sources consultées pour les indices sur l’OFGL

- [Comptes des communes — OFGL (page indexée avec `refine.cbudg=1`)](https://data.ofgl.fr/explore/dataset/ofgl-base-communes/table/?q=&refine.presence_budget=0&refine.cbudg=1&refine.agregat=Encours+de+dette)
- [Comptes des communes 2018-2025 — OFGL](https://data.ofgl.fr/explore/dataset/ofgl-base-communes/)
- [Export du jeu départemental OFGL (champs `euros_par_habitant`, `montant`)](https://data.ofgl.fr/api/explore/v2.1/catalog/datasets/ofgl-base-departements-consolidee/exports/csv)
- [Comptes des communes — page API OFGL](https://data.ofgl.fr/explore/dataset/ofgl-base-communes/api/)
